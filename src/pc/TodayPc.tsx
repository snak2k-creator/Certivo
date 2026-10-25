// 今日 on PC. The middle: the day and its aim, a line to write in, the list worked from the keyboard (J K to
// pick, X to cut, S for tomorrow, Enter for the drawer), the suggestion and what is coming. The right: this
// week's shadow, the pass outlook, the last page of 1日の記録 and the week's cuts. The work notebook swaps the
// right side for its promises, what went to the AI and its data.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Notebook, Task } from '../core/types';
import { state } from '../core/store';
import { acceptSuggestion, addTask, aiCapNow, aiUsed, moveTomorrow, skipSuggestion } from '../core/actions';
import { DIFF } from '../core/game';
import { doneOn, isNear, metaLine, parseLine, repeatLabel, upcoming } from '../core/tasks';
import { studyTaskDamage, weekNumber } from '../core/enemy';
import { forecastSeries } from '../core/study';
import { activePack } from '../core/pack';
import { RECAP_HOUR } from '../core/recap';
import { cloudConfigured } from '../core/cloud';
import { exportCsv } from '../core/data';
import { sfx } from '../core/sfx';
import { addDays, dayDiff, DOW, dow, dowName, hm, md, weekStart } from '../core/util';
import { BossCard } from '../ui/Boss';
import { PlanCard } from '../ui/WorkPlan';
import { added, fx, toast } from '../ui/fx';
import { closeSheet, openSheet, sheets } from '../ui/sheets';
import { useKey } from '../ui/hooks';
import { opensSession, slash } from '../ui/slash';
import { dayList, doneCount, examDays, firstWeek, isWeekend, nextWorkday, streakNow } from '../ui/derive';
import { introAim } from '../ui/Intro';
import { Arrow, Check, Plus, Search } from '../ui/icons';
import { PROMISES, recapPointer } from '../screens/Today';
import { MOD } from './common';

const firstOpen = (list: Task[], date: string) => Math.max(0, list.findIndex((t) => !doneOn(t, date)));
const rel = (d: string, date: string) => {
  const n = dayDiff(date, d);
  return n === 1 ? 'あした' : n === 2 ? 'あさって' : `${n}日後`;
};

function Row({ t, nb, date, sel, onPick, onTomorrow, onOpen }: { t: Task; nb: Notebook; date: string; sel: boolean; onPick: () => void; onTomorrow: () => void; onOpen: () => void }) {
  const on = doneOn(t, date);
  const f = fx.freshIds.get(t.id);
  const session = opensSession(nb, t, date);
  const meta = metaLine(t, date, nb);
  const bars = DIFF[t.diff].bars;
  const cls = ['pt-row', on && 'on', f && 'fresh', fx.addedIds.has(t.id) && 'add', sel && 'sel'].filter(Boolean).join(' ');
  return (
    <div class={cls} id={`pt-r-${t.id}`} role="listitem" onClick={onOpen}>
      <button
        type="button"
        class="pt-ckb"
        aria-pressed={on}
        aria-label={on ? `${t.title}を 元に戻す` : session ? `${t.title}を はじめる` : `${t.title}を 斬る`}
        onClick={(e) => {
          e.stopPropagation();
          onPick();
          slash(nb, t, date);
        }}
      >
        <span class={session ? 'z-ck go' : 'z-ck'}>
          <Check />
        </span>
      </button>
      <span class="z-rt">
        <span class="z-ttl">
          <span>{t.title}</span>
          <i />
        </span>
        {(meta || isNear(t, date)) && (
          <span class="pt-mt">
            {meta && <span class="z-meta">{meta}</span>}
            {isNear(t, date) && <span class="pt-near">近い</span>}
          </span>
        )}
      </span>
      {!on && (
        <span class="pt-acts">
          <button
            type="button"
            class="pt-act"
            onClick={(e) => {
              e.stopPropagation();
              onTomorrow();
            }}
          >
            明日へ<kbd>S</kbd>
          </button>
          <button
            type="button"
            class="pt-act"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            くわしく<kbd>↵</kbd>
          </button>
        </span>
      )}
      {nb === 'p' ? (
        <>
          <span class={`pt-skl z-min${t.study ? ' k' : ''}`} aria-hidden="true">
            {t.sk}
          </span>
          <span class="z-df" aria-hidden="true">
            <i />
            <i class={bars < 2 ? 'off' : undefined} />
            <i class={bars < 3 ? 'off' : undefined} />
          </span>
          <b class="z-xp">+{DIFF[t.diff].xp}</b>
        </>
      ) : (
        t.tag && <span class="z-wtag">{t.tag}</span>
      )}
      <span key={'c' + (f?.id ?? 0)} class="z-cut" />
      {f && f.xp > 0 && (
        <span key={'r' + f.id} class="z-rise">
          +{f.xp}
        </span>
      )}
    </div>
  );
}

/** The forecast over the last two weeks, with the passing line. */
function Spark({ vs, pass, max }: { vs: number[]; pass: number; max: number }) {
  const W = 344;
  const H = 70;
  const lo = Math.max(0, Math.min(pass, ...vs) - max * 0.06);
  const hi = Math.min(max, Math.max(pass, ...vs) + max * 0.04);
  const x = (i: number) => (i / Math.max(1, vs.length - 1)) * (W - 8) + 2;
  const y = (v: number) => H - 6 - ((v - lo) / Math.max(1, hi - lo)) * (H - 14);
  const pts = vs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = vs.length - 1;
  return (
    <svg class="pt-spk" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`この2週間の 見込み。${vs[0]} から ${vs[last]}`}>
      <line x1="0" x2={W} y1={y(pass)} y2={y(pass)} stroke="#E3402B" stroke-width="1.5" stroke-dasharray="4 4" />
      <text x={W} y={y(pass) - 5} text-anchor="end" class="pt-spkl">
        合格 {pass}
      </text>
      <polyline points={pts} fill="none" stroke="#F3F1EC" stroke-width="2" stroke-linejoin="round" />
      <rect x={x(last) - 4} y={y(vs[last]) - 4} width="8" height="8" fill="#F3F1EC" transform={`rotate(45 ${x(last)} ${y(vs[last])})`} />
    </svg>
  );
}

function SidePersonal({ date, now }: { date: string; now: Date }) {
  const p = state.p;
  const pk = activePack();
  const sp = pk ? p.study[pk.id] : undefined;
  const series = pk && sp && sp.log.length ? forecastSeries(pk, sp.log, date, 14) : null;
  const v = series ? series[series.length - 1].v : 0;
  const rec = recapPointer(date, now);
  const page = rec.to ? p.recaps[rec.to] : undefined;
  const mon = weekStart(date);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i);
    const day = d <= date ? p.days[d] : undefined;
    const xp = day?.xp ?? 0;
    return { d, xp, marks: xp <= 0 ? 0 : xp < 60 ? 1 : xp < 120 ? 2 : 3, kill: !!day?.kills, when: d < date ? 'past' : d === date ? 'td' : 'fut' };
  });
  const sum = week.reduce((a, w) => a + w.xp, 0);

  return (
    <>
      <BossCard date={date} class="pt-boss" />

      <div class="pt-sec">
        <b>合格の見込み</b>
        <i />
        <a href="#/growth">成長で 見る</a>
      </div>
      {pk && series ? (
        <>
          <div class="pt-fc">
            <b class="z-min z-num">{v}</b>
            <span>
              / {pk.scoreMax} · 合格 {pk.passingScore}
              {v >= pk.passingScore ? ' に 届いている' : <> まで <em>あと {pk.passingScore - v}</em></>}
            </span>
          </div>
          <Spark vs={series.map((s) => s.v)} pass={pk.passingScore} max={pk.scoreMax} />
        </>
      ) : (
        <p class="pt-lg0">問題を 解くと、ここに 本番の点の 見込みが 出ます。</p>
      )}

      <div class="pt-sec">
        <b>{rec.to === date ? '今日の 1日の記録' : rec.to ? 'きのうの 1日の記録' : '1日の記録'}</b>
        <i />
        {page && <span>{page.source === 'ai' ? `${RECAP_HOUR}:00 に AI が まとめた` : 'ZAN が 書いた'}</span>}
      </div>
      {page ? (
        <a class={`pt-rc z-light${rec.fresh ? ' fresh' : ''}`} href={`#/recap/${rec.to}`}>
          <span class="pt-rch">
            <b class="z-num">
              {md(rec.to)}（{DOW[dow(rec.to)]}）
            </b>
            {rec.fresh && <span class="z-tag z-tag-r">新しい</span>}
          </span>
          <span class="pt-rct z-min">{page.text}</span>
          <span class="pt-rcf">
            <span>今月の AI {aiUsed()} / {aiCapNow()} 回 · 中身は 個人の手帳だけ</span>
            <b>
              読む
              <Arrow />
            </b>
          </span>
        </a>
      ) : (
        <p class="pt-lg0">{rec.title}</p>
      )}

      <div class="pt-sec">
        <b>今週の斬り跡</b>
        <i />
        <span class="z-num">経験値 {sum}</span>
      </div>
      <div class="pt-wk" role="img" aria-label={`今週の経験値。${week.filter((w) => w.when !== 'fut').map((w) => `${DOW[dow(w.d)]} ${w.xp}`).join('、')}`}>
        {week.map((w) => (
          <span key={w.d} class={`pt-wd ${w.when}${w.kill ? ' r' : ''}`}>
            <span class="pt-wt">
              {Array.from({ length: w.marks }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            <b class="pt-wn z-num">{w.when === 'fut' ? '' : w.xp}</b>
            <span class="pt-wl">{DOW[dow(w.d)]}</span>
          </span>
        ))}
      </div>
    </>
  );
}

function SideWork({ date }: { date: string }) {
  const done = doneCount(dayList('w', date), date);
  const sent = state.w.sent.slice(-5).reverse();
  return (
    <>
      <span class="z-tag z-tag-w z-tagx">仕事の手帳の 約束</span>
      <ol class="pt-pro">
        {PROMISES.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <a class="pt-syn" href="#/settings">
        <span>この手帳の 同期</span>
        <b>{!cloudConfigured() ? 'この版では 使えません' : state.profile.sync.w ? 'オン' : 'オフ · この端末だけ'}</b>
        <Arrow />
      </a>
      <div class="pt-wc">
        <b class="z-min z-num">{done}</b>
        <span>
          きょう 個人の手帳に 残る数
          <br />「仕事：済み {done}件」
        </span>
      </div>
      <div class="pt-sec">
        <b>AI に 送った記録</b>
        <i />
        <span>{state.w.sent.length}回</span>
      </div>
      {sent.length ? (
        <ul class="pt-lgs">
          {sent.map((x) => (
            <li key={x.at}>
              <b class="z-num">
                {md(new Date(x.at).toISOString().slice(0, 10))} {hm(new Date(x.at))}
              </b>
              <span>{x.what}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="pt-lg0">まだ 何も 送っていません。送るときは 毎回、中身を 見せてからです。</p>
      )}
      <div class="pt-sec">
        <b>この手帳の データ</b>
        <i />
      </div>
      <div class="pt-dta">
        <button
          type="button"
          class="z-bo"
          onClick={() => {
            exportCsv('w');
            sfx('write');
            toast('仕事の手帳を、CSV で 書き出しました');
          }}
        >
          書き出す
        </button>
        <a class="z-txb pt-del" href="#/settings">
          消すのは 設定から
        </a>
      </div>
    </>
  );
}

export function TodayPc({ date, now, side }: { date: string; now: Date; side: boolean }) {
  const nb = state.profile.mode;
  const list = dayList(nb, date);
  const done = doneCount(list, date);
  const book = nb === 'p' ? state.p : state.w;
  const [sel, setSel] = useState(() => firstOpen(list, date));
  const [draft, setDraft] = useState('');
  const addRef = useRef<HTMLInputElement>(null);
  const days = examDays(date);
  const streak = streakNow(date);
  const boss = state.p.boss.cur;
  const sug = state.p.ai.sug;
  const weekend = nb === 'w' && isWeekend(date);
  const shown = new Set(list.map((t) => t.id));
  const soon = upcoming(book.tasks, date, 7).filter((x) => !shown.has(x.t.id)).slice(0, 6);
  const at = Math.min(sel, Math.max(0, list.length - 1));
  const cur = list[at];
  const three = nb === 'p' && (state.p.days[date]?.three ?? false);
  const { aim, sub: aimSub } = introAim();

  // a new notebook starts at its first open task
  useEffect(() => setSel(firstOpen(dayList(nb, date), date)), [nb, date]);

  const sub =
    nb === 'p'
      ? [days === null ? '試験日は まだ' : days > 0 ? `試験まで ${days}日` : days === 0 ? '今日が 試験' : '', streak > 0 ? `学習 ${streak}日つづけて` : '学習は 今日から'].filter(Boolean).join(' · ')
      : state.profile.sync.w
        ? '仕事の手帳 · 同期は オン'
        : '仕事の手帳 · この端末の中だけ';
  const tag = nb === 'p' && boss ? `第${weekNumber(boss, firstWeek())}週` : nb === 'w' ? '仕事' : '';

  const drawerFor = () => (sheets.now?.kind === 'task' && sheets.now.nb === nb ? sheets.now.id : '');
  const open = (t: Task, quiet = false) => openSheet({ kind: 'task', nb, id: t.id }, quiet);
  const pick = (i: number) => {
    const n = Math.max(0, Math.min(list.length - 1, i));
    setSel(n);
    const t = list[n];
    if (!t) return;
    if (drawerFor() && drawerFor() !== t.id) open(t, true);
    document.getElementById(`pt-r-${t.id}`)?.scrollIntoView({ block: 'nearest' });
  };
  const tomorrow = (t: Task) => {
    const moved = moveTomorrow(nb, t.id, date);
    if (!moved) return;
    if (drawerFor() === t.id) closeSheet();
    sfx('tock');
    toast(`明日へ 送りました · ${t.title}`, { undo: true });
  };
  const parsed = draft.trim() ? parseLine(draft.trim(), date) : null;
  const understood = parsed
    ? [
        parsed.date !== date ? (parsed.date === addDays(date, 1) ? `あした ${md(parsed.date)}` : `${md(parsed.date)}（${DOW[dow(parsed.date)]}）`) : '',
        parsed.time || '',
        parsed.due ? `${md(parsed.due)}まで` : '',
        repeatLabel(parsed.repeat),
        parsed.mins ? `${parsed.mins}分` : '',
      ].filter(Boolean)
    : [];
  const write = (e: Event) => {
    e.preventDefault();
    const t = addTask(nb, draft.trim(), {}, date);
    if (!t) return;
    setDraft('');
    sfx('write');
    added(t.id);
    const i = dayList(nb, date).findIndex((x) => x.id === t.id);
    if (i >= 0) setSel(i);
    toast(i >= 0 ? `今日に 書きました · ${t.title}` : `${md(t.date)}（${DOW[dow(t.date)]}）に 書きました · ${t.title}`, { undo: true });
  };
  const accept = () => {
    const t = acceptSuggestion(date);
    if (!t) return;
    sfx('tock');
    added(t.id);
    toast(`今日に足しました · ${t.title}`, { undo: true });
  };
  const skip = () => {
    skipSuggestion(date);
    sfx('soft');
    toast('今日の案は、しまいました', { undo: true });
  };

  useKey((e) => {
    if ((sheets.now && sheets.now.kind !== 'task') || fx.cutNow) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tagName = (e.target as HTMLElement | null)?.tagName;
    if ((e.key === ' ' || e.key === 'Enter') && (tagName === 'BUTTON' || tagName === 'A')) return;
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        if (at < list.length - 1) sfx('tick');
        pick(at + 1);
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        if (at > 0) sfx('tick');
        pick(at - 1);
        break;
      case 'x':
      case ' ':
        if (!cur) return;
        e.preventDefault();
        slash(nb, cur, date);
        break;
      case 's':
        if (cur) tomorrow(cur);
        break;
      case 'Enter':
        if (cur) open(cur);
        break;
      case 'n':
        e.preventDefault();
        addRef.current?.focus();
        break;
    }
  });

  return (
    <>
      <main class={`pc-main pt${nb === 'w' ? ' m-work' : ''}`} id="main" tabIndex={-1}>
        <div class="pt-in">
          <header class="pt-head">
            <div>
              <div class="pt-dt">
                <b class="z-min z-num">{md(date)}</b>
                <span class={`z-tag ${nb === 'p' ? 'z-tag-r' : 'z-tag-w'}`}>{dowName(date)}</span>
                {tag && <span class="pt-dw">{tag}</span>}
              </div>
              <span class="pt-ds">{sub}</span>
            </div>
            <button type="button" class="pt-srch" onClick={() => openSheet({ kind: 'palette' })}>
              <Search />
              <span>探す・書く・ひらく</span>
              <kbd>{MOD}K</kbd>
            </button>
          </header>

          {nb === 'p' && (
            <div class="pt-aim">
              <span class="pt-aiml">今日のねらい</span>
              <b class="z-min">{aim}</b>
              <span>{aimSub}</span>
            </div>
          )}
          {weekend && (
            <div class="pt-wban">
              <b>週末は、仕事の手帳を 休ませています。</b>
              <span>見えているのは、月曜 {md(nextWorkday(date))} の ぶん。</span>
            </div>
          )}
          {nb === 'p' && !side && <BossCard date={date} class="pt-bossm" />}

          <form class="pt-add" onSubmit={write}>
            <span class="pt-addi" aria-hidden="true">
              <Plus size={16} />
            </span>
            <input
              ref={addRef}
              id="pt-add-in"
              value={draft}
              onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft('');
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              placeholder={nb === 'p' ? '書く ·「あした 19:00 歯医者」「毎日 ストレッチ」も そのまま' : '仕事のやることを書く ·「あした 10:00」も そのまま'}
              aria-label="やることを書く"
              autoComplete="off"
              enterKeyHint="done"
            />
            {understood.length > 0 ? (
              <span class="pt-und" aria-live="polite">
                {understood.map((u) => (
                  <i key={u}>{u}</i>
                ))}
              </span>
            ) : (
              <kbd>N</kbd>
            )}
          </form>

          <div class="z-sh pt-sh">
            <span class={`z-tag z-tag-w${nb === 'p' ? ' z-tagx' : ''}`}>今日</span>
            <b class="z-min z-num pt-cnt">
              <span>{done}</span>
              <span> / {list.length}</span>
            </b>
            <span class="z-line" />
            <span class={`pt-three${three ? ' on' : ''}`}>{nb === 'p' ? (three ? '三つ斬った · +30' : `三つまで あと ${Math.max(0, 3 - done)}`) : list.length ? `済み ${done}件` : ''}</span>
          </div>
          <div class="pt-rows" role="list">
            {list.map((t, i) => (
              <Row key={t.id} t={t} nb={nb} date={date} sel={i === at} onPick={() => setSel(i)} onTomorrow={() => tomorrow(t)} onOpen={() => (setSel(i), open(t))} />
            ))}
            {!list.length && (
              <div class="z-empty pt-empty">
                <b>{nb === 'p' ? '今日は、まだ 白紙。' : weekend ? '月曜のぶんは、まだ ありません。' : '仕事のやることは、まだ ありません。'}</b>
                {nb === 'p' ? '上の 一行に 書いて、Enter。三つ斬ると +30。' : '書いたものは、この手帳の中だけに 残ります。'}
              </div>
            )}
          </div>

          {nb === 'p' && sug && sug.date === date && !sug.done && (
            <div class="pt-ai">
              <div class="pt-ait">
                <span class="pt-ail">
                  {sug.source === 'ai' ? 'AI の案' : '今日の案'}
                  <span>{sug.reason}</span>
                </span>
                <b>{sug.title}</b>
                <span class="pt-ais">約5分{boss && boss.hp > 0 ? ` · ${boss.name}に ${studyTaskDamage(30)} のダメージ` : ''} · 足すかどうかは あなたが 決める</span>
              </div>
              <button type="button" class="z-txb" onClick={skip}>
                今日はいい
              </button>
              <button type="button" class="z-bo" onClick={accept}>
                足す
              </button>
            </div>
          )}
          {nb === 'w' && <PlanCard />}

          {soon.length > 0 && (
            <>
              <div class="z-sh pt-sh2">
                <span class="z-tag z-tag-k pt-tagk">近日</span>
                <span class="z-line" />
              </div>
              <div class="pt-soon">
                {soon.map(({ d, t }) => (
                  <button type="button" key={t.id} class="pt-sn" onClick={() => open(t)}>
                    <b class="z-min z-num">{md(d)}</b>
                    <span>
                      {t.title}
                      {t.time ? ` · ${t.time}` : ''}
                    </span>
                    <em>{rel(d, date)}</em>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div class="pt-keys" aria-label="キーボード">
          <span>
            <kbd>J</kbd>
            <kbd>K</kbd>えらぶ
          </span>
          <span>
            <kbd>X</kbd>
            {nb === 'p' ? '斬る' : '済み'}
          </span>
          <span>
            <kbd>S</kbd>明日へ
          </span>
          <span>
            <kbd>↵</kbd>くわしく
          </span>
          <span>
            <kbd>N</kbd>書く
          </span>
          <span class="pt-kr">
            <kbd>{MOD}K</kbd>探す・ひらく
          </span>
          <span>
            <kbd>{MOD}Z</kbd>元に戻す
          </span>
        </div>
      </main>
      {side && (
        <aside class="pc-side z-scroll" aria-label={nb === 'p' ? '今週の影と 見込み' : '仕事の手帳のこと'}>
          {nb === 'p' ? <SidePersonal date={date} now={now} /> : <SideWork date={date} />}
        </aside>
      )}
    </>
  );
}

