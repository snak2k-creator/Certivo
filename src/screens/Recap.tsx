// 1日の記録: one page per day. The summary (written by the AI only when the person agreed to it), what got cut
// and when, this week's shadow, the numbers and where the person hesitated. The week strip turns the pages.
import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { state, undoLabel } from '../core/store';
import { RECAP_DELETED, aiCapNow, deleteRecap, markRecapSeen, setDayNote } from '../core/actions';
import { RECAP_HOUR, bossOfWeek, dayRows, dayStudy, dayStumbles, hpAt, streakOn, type DayRow } from '../core/recap';
import { activePack, questionById, topicById } from '../core/pack';
import { forecast } from '../core/study';
import { ENEMY, topicShort } from '../core/enemy';
import { buzz, sfx } from '../core/sfx';
import { addDays, clamp, dayDiff, DOW, dow, hm, md, monthKey, reducedMotion, weekStart } from '../core/util';
import type { Mode } from '../core/types';
import { BossArt, bossWhen } from '../ui/Boss';
import { examEntry, firstDay, firstWeek } from '../ui/derive';
import { back, go } from '../ui/router';
import { toast, undoLast } from '../ui/fx';
import { useKey } from '../ui/hooks';
import { ChevL, ChevR, Close, Menu, Pencil } from '../ui/icons';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOURS = Array.from({ length: 19 }, (_, i) => i + 6);
const TALLY_MAX = 15;
const MODE_NAME: Record<Mode, string> = { kakera: '朝の欠片', drill: '問題', boss: '戦い' };

/** The page to open: the date in the route, or tonight's page after 22:00, or yesterday's. */
export function recapDate(args: string[], today: string, now: Date) {
  const a = args[0];
  if (a && DAY_RE.test(a) && a <= today) return a;
  return now.getHours() >= RECAP_HOUR ? today : addDays(today, -1);
}

/** The first day anything was written down; pages go back to it. */
function weekLabel(d: string) {
  const fw = firstWeek();
  const n = fw ? Math.floor(dayDiff(fw, weekStart(d)) / 7) + 1 : 0;
  return n >= 1 ? `第${n}週` : `${md(weekStart(d))} の週`;
}

/** Where a time of day sits on the 6:00–24:00 strip, 0..1. */
const frac = (at: number) => {
  const t = new Date(at);
  return clamp((t.getHours() * 60 + t.getMinutes() - 360) / 1080, 0, 1);
};
const xCss = (f: number) => `calc(24px + ${f.toFixed(4)} * (100% - 48px))`;

/** Numbers and quoted names stand out in red, as in a written page. */
function emph(text: string) {
  return text.split(/(「[^」]+」|\d[\d,]*(?:問とも 正解|問とも正解|問|日|件|回|分)?)/).map((t, i) => (i % 2 ? <span key={i} class="em">{t}</span> : t));
}

function duration(min: number): [string, string][] {
  if (min < 60) return [[String(min), '分']];
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? [[String(h), '時間'], [String(m), '分']] : [[String(h), '時間']];
}

/** The best row to show first: a battle, otherwise the heaviest cut. */
function defaultRow(rows: DayRow[]) {
  let best = 0;
  let bv = -1;
  rows.forEach((r, j) => {
    const v = r.kind === 'foe' ? 999 : r.xp;
    if (v >= bv) {
      bv = v;
      best = j;
    }
  });
  return best;
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function pageText(d: string) {
  const p = state.p;
  const rec = p.recaps[d];
  const day = p.days[d];
  const st = dayStudy(p, p.study[state.profile.certId], d);
  const lines = [`ZAN 1日の記録 ${d}（${DOW[dow(d)]}）`, ''];
  if (rec && !rec.deleted && rec.text) lines.push(`[${rec.source === 'ai' ? 'AI のまとめ' : 'まとめ'}] ${rec.text}`);
  for (const n of day?.note?.split('\n') ?? []) lines.push(`[自分] ${n}`);
  const rows = dayRows(p, d);
  if (rows.length) {
    lines.push('', '[斬ったこと]');
    for (const r of rows) lines.push(`${r.time} ${r.title} +${r.xp}${r.dmg ? ` −${r.dmg}` : ''}`);
  }
  lines.push('', `問題 ${st.answered}問${st.answered ? ` · 正答 ${Math.round((st.correct / st.answered) * 100)}%` : ''}`, `経験値 +${day?.xp ?? 0}`);
  if (day?.work) lines.push(`仕事の手帳：済み ${day.work}件`);
  return lines.join('\n') + '\n';
}

export function Recap({ args, date: today, now }: { args: string[]; date: string; now: Date }) {
  const d = recapDate(args, today, now);
  const late = now.getHours() >= RECAP_HOUR;
  const last = useRef(d);
  const dir = useRef<'' | 'L' | 'R'>('');
  const quick = useRef(false);
  if (last.current !== d) {
    dir.current = d < last.current ? 'L' : 'R';
    quick.current = true;
    last.current = d;
  }
  const [menu, setMenu] = useState(false);
  const first = firstDay(today);
  const rec = state.p.recaps[d];
  const ws = weekStart(d);
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  useEffect(() => {
    markRecapSeen(d);
  }, [d, rec?.at]);

  const turn = (to: string) => {
    if (to === d || to > today || to < addDays(first, -6)) return;
    sfx('flip');
    buzz(6);
    setMenu(false);
    window.scrollTo(0, 0);
    go(`recap/${to}`, true);
  };
  const prev = d > first ? addDays(d, -1) : '';
  const next = d < today ? addDays(d, 1) : '';

  useKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (menu) setMenu(false);
      else back('today');
    } else if (e.key === 'ArrowLeft' && prev) turn(prev);
    else if (e.key === 'ArrowRight' && next) turn(next);
  });

  const closeMenu = () => setMenu(false);
  const exportText = () => {
    closeMenu();
    sfx('tock');
    download(`zan-${d}.txt`, pageText(d));
    toast(`${md(d)} のページを、テキストで 書き出しました`);
  };
  const erase = () => {
    closeMenu();
    deleteRecap(d);
    sfx('undo');
    buzz(10);
    toast(`${md(d)} のまとめを 消しました`, { undo: true });
  };
  const settings = () => {
    closeMenu();
    sfx('tock');
    go('settings/nightly');
  };

  return (
    <div class="m-page bare rc">
      <header class="m-bar z-grain rc-bar">
        <button type="button" class="z-ib" onClick={() => back('today')} aria-label="とじる">
          <Close />
        </button>
        <span class="m-bar-t">1日の記録</span>
        <span class="rc-sp" />
        <button
          type="button"
          class="z-ib"
          onClick={() => {
            sfx('tock');
            setMenu(!menu);
          }}
          aria-label="このページのメニュー"
          aria-haspopup="menu"
          aria-expanded={menu}
        >
          <Menu />
        </button>
      </header>

      <nav class="z-week rc-week" aria-label={weekLabel(d)}>
        <span class="z-wsel" style={{ transform: `translateX(${week.indexOf(d) * 100}%)` }} />
        {week.map((w) => {
          const n = w > today ? 0 : dayRows(state.p, w).length;
          const tonight = w === today && !late;
          return (
            <button
              key={w}
              type="button"
              class={`z-wd${w === d ? ' on' : ''}${!n && !tonight ? ' none' : ''}`}
              disabled={w > today}
              onClick={() => turn(w)}
              aria-current={w === d ? 'date' : undefined}
              aria-label={`${md(w)} ${DOW[dow(w)]}曜${w > today ? '' : tonight ? '。まとめは 今夜' : `、斬った ${n}件`}`}
            >
              <span class="z-wdw">{DOW[dow(w)]}</span>
              <b class="z-min z-num">{Number(w.slice(8))}</b>
              {tonight ? <span class="z-wnow">今夜</span> : n ? <span class="z-wt" style={{ width: `${Math.min(9, n) * 4 - 2}px` }} /> : <span class="z-wt0" />}
            </button>
          );
        })}
      </nav>

      <Page key={d} d={d} today={today} late={late} quick={quick.current} dir={dir.current} />

      <div class="rc-foot">
        {prev && (
          <button type="button" class="rc-pg" onClick={() => turn(prev)} aria-label={`${md(prev)} のページへ`}>
            <ChevL />
            <span class="z-num">{md(prev)}</span>
          </button>
        )}
        <span class="rc-sp" />
        {next && (next !== today || late) ? (
          <button type="button" class="rc-pg" onClick={() => turn(next)} aria-label={`${md(next)} のページへ`}>
            <span class="z-num">{md(next)}</span>
            <ChevR />
          </button>
        ) : (
          <span class="rc-nx">{d === today && late ? 'あしたの朝、また ここに' : `次のまとめは 今夜 ${RECAP_HOUR}:00`}</span>
        )}
      </div>

      {menu && (
        <>
          <div class="rc-scrim" onClick={closeMenu} />
          <div class="rc-menu" role="menu" aria-label="このページ">
            <button type="button" role="menuitem" class="rc-mi" onClick={exportText}>
              <b>テキストで書き出す</b>
              <span>この日のまとめと、斬った記録</span>
            </button>
            {rec && !rec.deleted && (
              <button type="button" role="menuitem" class="rc-mi" onClick={erase}>
                <b>この日の{rec.source === 'ai' ? ' AI の' : ''}まとめを消す</b>
                <span>斬った記録は 残ります · すぐなら元に戻せます</span>
              </button>
            )}
            <button type="button" role="menuitem" class="rc-mi" onClick={settings}>
              <b>毎晩のまとめの設定</b>
              <span>AI に書いてもらうか · 使う回数の上限</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Page({ d, today, late, quick, dir }: { d: string; today: string; late: boolean; quick: boolean; dir: '' | 'L' | 'R' }) {
  const p = state.p;
  const pk = activePack();
  const sp = p.study[state.profile.certId];
  const day = p.days[d];
  const rec = p.recaps[d];
  const rows = dayRows(p, d);
  const st = dayStudy(p, sp, d);
  const tonight = d === today && !late;
  const reduce = reducedMotion();

  const [cnt, setCnt] = useState(reduce ? rows.length : 0);
  const shown = useRef(cnt);
  const [sel, setSel] = useState(-1);
  const [pk2, setPk] = useState(0);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const [fresh, setFresh] = useState(-1);
  const [swept, setSwept] = useState(reduce);
  const strip = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setCnt((shown.current = rows.length)), quick ? 1400 : 2200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const el = strip.current;
    if (!el || swept) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSwept(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          setSwept(true);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const tick = (j: number) => {
    if (j + 1 <= shown.current) return;
    shown.current = j + 1;
    if (quick) sfx('tally', j + 1);
    setCnt(j + 1);
  };
  const s = sel < 0 ? defaultRow(rows) : sel;
  const R = rows[s];
  const pick = (j: number) => {
    if (!rows[j]) return;
    sfx('slash');
    buzz([6, 18, 8]);
    setSel(j);
    setPk(pk2 + 1);
    setPicks({ ...picks, [j]: (picks[j] || 0) + 1 });
  };
  const pickStrip = (e: MouseEvent) => {
    const el = strip.current;
    if (!el || !rows.length) return;
    const b = el.getBoundingClientRect();
    const f = (e.clientX - b.left - 24) / Math.max(1, b.width - 48);
    let best = 0;
    let bd = 9;
    rows.forEach((r, j) => {
      const dd = Math.abs(frac(r.at) - f);
      if (dd < bd) {
        bd = dd;
        best = j;
      }
    });
    pick(best);
  };

  /* the summary and the person's own lines */
  const notes = day?.note ? day.note.split('\n') : [];
  const ai = rec?.source === 'ai';
  const label = ai && !rec?.deleted ? 'AI のまとめ' : 'その日のまとめ';
  const cred = rec && !rec.deleted ? `${hm(new Date(rec.at))} · ${ai ? '個人の手帳だけから' : 'この端末の中で 書きました'}` : tonight ? `${RECAP_HOUR}:00 に 書きます` : '';
  const canRestore = !!rec?.deleted && undoLabel() === RECAP_DELETED;
  const startNote = () => {
    sfx('tock');
    setWriting(true);
    setTimeout(() => inp.current?.focus(), 40);
  };
  const saveNote = (e: Event) => {
    e.preventDefault();
    const text = draft.trim().replace(/\n/g, ' ');
    if (!text) {
      setWriting(false);
      return;
    }
    setDayNote(d, [...notes, text].join('\n'));
    sfx('write');
    buzz(8);
    setFresh(notes.length);
    setDraft('');
    setWriting(false);
  };
  const dropNote = (i: number) => {
    setDayNote(d, notes.filter((_, k) => k !== i).join('\n'), 'メモを消した');
    sfx('soft');
    toast('メモを 消しました', { undo: true });
  };

  /* header */
  const exam = examEntry()?.examDate;
  const toExam = exam ? dayDiff(d, exam) : null;
  const streak = streakOn(sp, d);
  const sub = [toExam !== null && toExam > 0 ? `試験まで ${toExam}日` : toExam === 0 ? '試験の日' : '', streak ? `学習 ${streak}日つづけて` : st.answered ? '' : '学習は お休み'].filter(Boolean).join(' · ');

  /* the shadow of that week */
  const b = bossOfWeek(p, d);
  const z = b ? p.zukan.find((x) => x.boss.id === b.id) : undefined;
  const dead = !!z && z.at <= d;
  const dmg = day?.dmg || 0;
  const hp = b ? hpAt(p, b, d) : 0;
  const foeNote = !b
    ? ''
    : dead && z!.at < d
      ? `${md(z!.at)}に 討伐ずみ · 図鑑の中`
      : [dmg ? `この日 −${dmg}` : 'この日は 手を出していない', dead ? '討伐' : hp <= 0 ? '体力が 尽きた' : d === today ? bossWhen(b, today) : ''].filter(Boolean).join(' · ');

  /* hesitations */
  const sb = dayStumbles(sp, d);
  const byTopic: Record<string, number> = {};
  for (const id of sb.ids) {
    const q = pk ? questionById(pk, id) : undefined;
    if (q) byTopic[q.topicId] = (byTopic[q.topicId] || 0) + 1;
  }
  const missTopics = Object.entries(byTopic)
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, 2)
    .map(([id, n]) => `「${pk && topicById(pk, id) ? topicShort(topicById(pk, id)!) : id}」で ${n}問`);
  const fixed = sb.ids.filter((id) => sb.later.some((a) => a.q === id && a.ok && a.conf !== 'guess'));
  const firstFix = sb.later.find((a) => a.ok && fixed.includes(a.q));
  const doneText = !sb.ids.length || !fixed.length ? '' : fixed.length === sb.ids.length ? `${md(firstFix!.d)} ${MODE_NAME[firstFix!.mode]}で ${fixed.length === 1 ? '正解' : `${fixed.length}問とも 正解`}` : `${fixed.length}問は もう正解 · あと ${sb.ids.length - fixed.length}問`;
  const fBefore = pk && sp && st.answered ? forecast(pk, sp.log, addDays(d, -1)) : 0;
  const fAfter = pk && sp && st.answered ? forecast(pk, sp.log, d) : 0;

  const tally = rows.slice(0, TALLY_MAX);
  const studyMin = st.askMin + st.readMin;
  const ai2 = state.p.ai;
  const used = ai2.month === monthKey(today) ? ai2.used : 0;

  return (
    <div class={`rc-page${dir === 'L' ? ' rc-fromL' : dir === 'R' ? ' rc-fromR' : ''}`} style={{ '--t0': quick ? '0s' : '.35s' }}>
      <div class="rc-head">
        <b class="z-min z-num rc-big">{Number(d.slice(8))}</b>
        <div class="rc-hs">
          <span class="z-tag z-tag-r rc-dow">{DOW[dow(d)]}曜</span>
          <span class="rc-wk">
            {Number(d.slice(5, 7))}月 · {weekLabel(d)}
          </span>
        </div>
      </div>
      {sub && <span class="rc-sub">{sub}</span>}

      <div class="rc-bandw" role="img" aria-label={`斬った ${rows.length}件。経験値 +${day?.xp ?? 0}`}>
        <i class="rc-thin" />
        <div class="rc-band">
          <div class="rc-bt">
            <div>
              <span class="rc-bl">斬った</span>
              <span class="rc-bnw">
                <b class="z-min z-num rc-bn">{cnt}</b>
                <span class="rc-bu">件</span>
              </span>
            </div>
            <span class="rc-tally">
              {tally.map((r, j) => (
                <i
                  key={j}
                  class={[r.kind === 'foe' && 'foe', j && j % 5 === 0 && 'g'].filter(Boolean).join(' ')}
                  style={{ animationDelay: `calc(var(--t0) + ${(0.3 + j * 0.055).toFixed(3)}s)` }}
                  onAnimationStart={() => tick(j)}
                />
              ))}
              {rows.length > TALLY_MAX && <em class="z-num">+{rows.length - TALLY_MAX}</em>}
            </span>
          </div>
        </div>
        <span class="z-tag z-tag-k rc-xpt">
          <span>経験値</span>
          <b class="z-min z-num">+{day?.xp ?? 0}</b>
        </span>
      </div>

      <div class="rc-sheetw">
        <section class="rc-sheet" aria-label={label}>
          <div class="rc-shh">
            <span class="z-tag z-tag-k">{label}</span>
            {cred && <span class="rc-cred">{cred}</span>}
          </div>
          {tonight ? (
            <p class="rc-wait">今夜 {RECAP_HOUR}:00 に、この日のまとめを 書きます。それまでに 書き足したことも、ここに 残ります。</p>
          ) : rec && !rec.deleted ? (
            <p class="z-min rc-entry">{emph(rec.text)}</p>
          ) : rec?.deleted ? (
            <div class="rc-gone">
              <b>この日の{ai ? ' AI の' : ''}まとめは、消しました</b>
              <span>斬った記録と 数字は、そのまま 残っています</span>
              {canRestore && (
                <button type="button" class="rc-bk" onClick={undoLast}>
                  元に戻す
                </button>
              )}
            </div>
          ) : (
            <p class="rc-wait">{rows.length || st.answered ? 'この日の まとめは ありません。' : 'この日は、休みの日。'}</p>
          )}
          {notes.map((n, i) => (
            <p key={i + n} class={`rc-note${i === fresh ? ' rc-write' : ''}`}>
              <span class="z-tag z-tag-k rc-me">自分</span>
              <span class="rc-nt">{n}</span>
              <button type="button" class="rc-nx2" onClick={() => dropNote(i)} aria-label={`メモ「${n}」を 消す`}>
                <Close size={12} />
              </button>
            </p>
          ))}
          {writing ? (
            <form class="rc-form" onSubmit={saveNote}>
              <input
                ref={inp}
                class="rc-inp"
                value={draft}
                maxLength={140}
                onInput={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setWriting(false);
                  }
                }}
                aria-label="この日に書き足す"
                placeholder="ひとこと 書き足す"
              />
              <button type="submit" class="rc-bk">
                書く
              </button>
            </form>
          ) : (
            <div class="rc-shf">
              <span>思い出したことを、書き足せます</span>
              <button type="button" class="rc-bo2" onClick={startNote}>
                <Pencil size={12} />
                書き足す
              </button>
            </div>
          )}
        </section>
      </div>

      <div class="z-sh rc-sec">
        <span class="z-tag z-tag-w z-tagx">斬り跡</span>
        {rows.length > 1 && <span class="rc-sh2">線を押すと、中身</span>}
        <span class="z-line" />
        <span class="rc-sh2 z-num">6:00 — 24:00</span>
      </div>
      <div ref={strip} class={`rc-strip${swept ? ' go' : ''}`} onClick={pickStrip} aria-hidden="true">
        <span class="rc-ax" />
        {HOURS.map((h) => (
          <Fragment key={h}>
            <i class={h % 3 ? 'rc-tk2' : 'rc-tk'} style={{ left: xCss((h - 6) / 18) }} />
            {h % 3 === 0 && (
              <span class="rc-tl z-num" style={{ left: xCss((h - 6) / 18) }}>
                {h}
              </span>
            )}
          </Fragment>
        ))}
        <span class="rc-sweep" />
        {rows.map((r, j) => (
          <i key={`m${j}-${picks[j] || 0}`} class={`rc-mk k-${r.kind}${j === s ? ' sel' : ''}`} style={{ left: xCss(frac(r.at)), animationDelay: picks[j] ? '0s' : `${(0.12 + frac(r.at) * 0.9).toFixed(2)}s` }} />
        ))}
        {R && <span class="rc-pin" style={{ left: xCss(frac(R.at)) }} />}
        {R && (
          <span
            key={`c${s}-${pk2}`}
            class={`rc-cal ${frac(R.at) <= 0.5 ? 'L' : 'R'}`}
            style={frac(R.at) <= 0.5 ? { left: `calc(${xCss(frac(R.at))} - 16px)`, maxWidth: `calc(100% - ${xCss(frac(R.at))})` } : { right: `calc(100% - ${xCss(frac(R.at))} - 16px)`, maxWidth: xCss(frac(R.at)) }}
          >
            <b class="z-num">{R.time}</b>
            <span>{R.title}</span>
            <i />
          </span>
        )}
      </div>
      {rows.length ? (
        <ol class="rc-list" aria-label="この日に斬ったこと">
          {rows.map((r, j) => (
            <li key={j}>
              <button
                type="button"
                class={`rc-li${j === s ? ` sel${pk2 ? (pk2 % 2 ? ' fa' : ' fb') : ''}` : ''}`}
                aria-pressed={j === s}
                onClick={() => pick(j)}
                aria-label={`${r.time}、${r.title}、経験値 ${r.xp}${r.dmg ? `、今週の敵に ${r.dmg}` : ''}`}
              >
                <span class="rc-tm z-num">{r.time}</span>
                <i class={`rc-kd k-${r.kind}`} aria-hidden="true" />
                <span class="rc-tt">{r.title}</span>
                <span class="rc-dm z-num">{r.dmg ? `−${r.dmg}` : ''}</span>
                <b class="rc-xp z-min z-num">+{r.xp}</b>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p class="rc-none">{tonight ? 'まだ 何も 斬っていません。斬ると、ここに 線が入ります。' : 'この日は、何も 斬っていません。'}</p>
      )}
      {day?.three && (
        <div class="rc-bonus">
          <span class="z-tag z-tag-r">ボーナス</span>
          <span>その日の三つを 斬った</span>
          <b class="z-min z-num">+30</b>
        </div>
      )}

      {b && (
        <>
          <div class="rc-h rc-sec">
            <b>今週の敵</b>
            <i />
            <span>
              {weekLabel(d)} · {ENEMY[b.type].name}
            </span>
          </div>
          <a class="rc-foe" href={dead ? `#/zukan/${b.id}` : d === today ? '#/battle' : undefined} aria-label={`今週の敵、${b.name}。体力 ${hp} / ${b.max}。${foeNote}`}>
            <span class={`rc-fth${dead ? ' dead' : ''}`}>
              <BossArt b={b} />
            </span>
            <span class="rc-fb">
              <span class="rc-fn">
                <b class="z-min">{b.name}</b>
                <span class="z-min z-num">
                  {hp} / {b.max}
                </span>
              </span>
              <span class="rc-hp">
                <span style={{ width: `${(hp / b.max) * 100}%` }} />
                {dmg > 0 && <i style={{ left: `${(hp / b.max) * 100}%`, width: `${(Math.min(dmg, b.max - hp) / b.max) * 100}%` }} />}
              </span>
              <span class="rc-fnote">{foeNote}</span>
            </span>
          </a>
        </>
      )}

      <div class="rc-h rc-sec">
        <b>数字で</b>
        <i />
      </div>
      <div class="rc-stats">
        <div class="rc-st">
          <span class="rc-stl">問題</span>
          <b class="z-min z-num rc-stn">
            {st.answered}
            <small>問</small>
          </b>
          <span class="rc-str">
            {st.log.length > 0 && (
              <span class="rc-qs" aria-hidden="true">
                {st.log.slice(0, 40).map((a, i) => (
                  <i key={i} class={a.ok ? undefined : 'ng'} />
                ))}
              </span>
            )}
            <span class="rc-sts">{st.answered ? `正答 ${Math.round((st.correct / st.answered) * 100)}%` : 'お休み'}</span>
          </span>
        </div>
        <div class="rc-st">
          <span class="rc-stl">学習</span>
          <b class="z-min z-num rc-stn">
            {duration(studyMin).map(([n, u]) => (
              <span key={u}>
                {n}
                <small>{u}</small>
              </span>
            ))}
          </b>
          <span class="rc-str">
            <span class="rc-sts">{studyMin ? [st.readMin ? `読む ${st.readMin}分` : '', st.askMin ? `問題 ${st.askMin}分` : ''].filter(Boolean).join(' · ') || '1分 たらず' : '—'}</span>
          </span>
        </div>
        <div class="rc-st">
          <span class="rc-stl">経験値</span>
          <b class="z-min z-num rc-stn">+{day?.xp ?? 0}</b>
          <span class="rc-str">
            <span class="rc-sts">{day?.three ? 'ボーナス +30 こみ' : ''}</span>
          </span>
        </div>
      </div>

      {st.answered > 0 && (
        <>
          <div class="rc-h rc-sec">
            <b>迷ったところ</b>
            <i />
          </div>
          {sb.ids.length ? (
            <div class="rc-miss">
              <b class="rc-mt">{missTopics.join('、')} 迷いました</b>
              <span class="rc-ma">間違えた問題は、次の朝の欠片で 先に出ます</span>
              {doneText && (
                <span class="rc-md">
                  <span class="rc-ck" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2 6.2L4.8 9L10 3" fill="none" stroke="#FFF" stroke-width="2" />
                    </svg>
                  </span>
                  <span>{doneText}</span>
                </span>
              )}
            </div>
          ) : (
            <div class="rc-miss ok">
              <b class="rc-mt">迷ったところは ありませんでした</b>
              <span class="rc-up">
                {fAfter > fBefore ? (
                  <>
                    <span class="z-tag z-tag-r">上がった</span>
                    <span>
                      予想スコア {fBefore} → {fAfter}
                    </span>
                  </>
                ) : (
                  <span>{st.answered}問とも、迷わずに 答えた</span>
                )}
              </span>
            </div>
          )}
        </>
      )}

      {(day?.work || state.w.tasks.length > 0) && (
        <div class="rc-work">
          <span class="z-tag rc-wtag">仕事</span>
          <span>
            <b>仕事の手帳：済み {day?.work ?? 0}件</b>
            <em>中身は AI に送らず、数だけ 出しています</em>
          </span>
        </div>
      )}
      <div class="rc-set">
        <span>
          毎晩のまとめ <b>{state.profile.nightly ? 'オン' : 'オフ'}</b> · {RECAP_HOUR}:00 · {state.profile.nightly ? `AI は 今月 ${used} / ${aiCapNow()} 回` : '端末の中で 書いています'}
        </span>
        <button
          type="button"
          class="z-bo"
          onClick={() => {
            sfx('tock');
            go('settings/nightly');
          }}
        >
          変える
        </button>
      </div>
    </div>
  );
}
