// 成長: the level and its title, what the next level opens, the pass outlook, each chapter's rate, the calendar
// of cuts, the six skills and the achievements. Counted from the personal notebook only, compared with no one.
import { useState } from 'preact/hooks';
import type { Pack, StudyProgress } from '../core/types';
import { state } from '../core/store';
import { addTask, bossAlive } from '../core/actions';
import { activePack } from '../core/pack';
import { exportDaysCsv } from '../core/data';
import { TITLES, UNLOCK_LV, unlocked } from '../core/game';
import { achievements, calendar, chapters, outlook, rank, SKILL_IDEA, skills, target, type Chapter, type SkillRow } from '../core/growth';
import { weakestTopic } from '../core/study';
import { topicShort } from '../core/enemy';
import { RECAP_HOUR } from '../core/recap';
import { buzz, sfx } from '../core/sfx';
import { addDays, clamp, dayDiff, DOW, dow, md } from '../core/util';
import { examEntry, firstDay, streakNow } from '../ui/derive';
import { toast } from '../ui/fx';
import { useSeen, useWidth } from '../ui/hooks';
import { ChevR } from '../ui/icons';

const dl = (d: string) => `${md(d)}（${DOW[dow(d)]}）`;
/** The calendar's day number: the month shows on the first. */
const dayNum = (d: string) => (d.endsWith('-01') ? `${Number(d.slice(5, 7))}/1` : String(Number(d.slice(8))));
const UNLOCK_KANJI: Record<number, string> = { 3: '暦', 5: '隠', 9: '強', 10: '模' };

export function Growth({ date, now }: { date: string; now: Date }) {
  const p = state.p;
  const pk = activePack();
  const sp = pk ? p.study[pk.id] : undefined;
  const exam = examEntry()?.examDate;
  const left = exam ? dayDiff(date, exam) : null;
  const r = rank(p, date);
  const first = firstDay(date);
  const pages = Object.keys(p.days).filter((d) => d <= date).length;
  const sub = [exam && left !== null && left >= 0 ? `試験 ${dl(exam)}まで ${left}日` : '試験日は まだ 決めていません', '個人の手帳だけから 数えています'].join(' · ');

  return (
    <div class="m-page gr">
      <div class="gr-a">
        <header class="gr-top">
          <div class="gr-tr">
            <b class="z-min gr-title">成長</b>
            {pk && <span class="z-tag z-tag-w z-tagx gr-code">{pk.code}</span>}
          </div>
          <span class="m-sub">{sub}</span>
        </header>

        <section class={`gr-rank${r.lv >= 10 ? ' two' : ''}`} aria-label={`Lv.${r.lv}、${r.title}。経験値 ${r.xp} / ${r.need}${r.upToday ? '。今日 上がった' : ''}`}>
          <div class="gr-rk" aria-hidden="true">
            <div class="gr-band" />
            <span class="z-min gr-lvw">Lv.</span>
            <span class="z-min z-num gr-lvn">{r.lv}</span>
            {r.upToday && <span class="z-tag z-tag-r gr-up">今日 上がった</span>}
            <div class="gr-rtx">
              <b class="z-min gr-rtt">{r.title}</b>
              <div class="gr-xpb">
                <div class="gr-xpf" style={{ width: `${Math.round((r.xp / r.need) * 100)}%` }} />
              </div>
              <div class="gr-xpt">
                <span>経験値</span>
                <b class="z-num">
                  {r.xp}
                  <small> / {r.need}</small>
                </b>
              </div>
            </div>
          </div>
        </section>
        <Ladder lv={r.lv} />
        {r.next && (
          <div class="gr-unl" aria-label={`Lv.${r.next.lv} で ${r.next.name} が ひらく。あと 経験値 ${r.left}`}>
            <span class="z-min gr-unkj" aria-hidden="true">
              {UNLOCK_KANJI[r.next.lv] ?? '開'}
            </span>
            <span class="gr-unt">
              <span class="gr-unk">Lv.{r.next.lv} で ひらく</span>
              <b>{r.next.name}</b>
              <span class="gr-uns">{r.eta ? `このペースなら ${dl(r.eta)}ごろ` : r.next.sub}</span>
            </span>
            <span class="gr-unr">
              <small>あと</small>
              <b class="z-num">{r.left}</b>
            </span>
          </div>
        )}
        <div class="gr-sts">
          <div class="gr-st">
            <span class="gr-stv">
              <b class="z-num">{streakNow(date)}</b>
              <small>日</small>
            </span>
            <span class="gr-stl">つづけて 学んだ</span>
          </div>
          <a href="#/zukan" class="gr-st">
            <span class="gr-stv">
              <b class="z-num">{p.zukan.length}</b>
              <small>体</small>
            </span>
            <span class="gr-stl">
              倒した影
              <ChevR size={10} />
            </span>
          </a>
          <a href="#/recap" class="gr-st">
            <span class="gr-stv">
              <b class="z-num">{pages}</b>
              <small>日ぶん</small>
            </span>
            <span class="gr-stl">
              1日の記録
              <ChevR size={10} />
            </span>
          </a>
        </div>

        {pk && sp && sp.log.length > 0 ? (
          <Forecast pk={pk} sp={sp} date={date} exam={exam} />
        ) : (
          <>
            <div class="z-sec gr-sec">
              <b>合格の見込み</b>
              <i />
            </div>
            <div class="gr-empty">
              <span>問題を 解くと、合格の見込みが ここに 出ます。答えるたびに、線が 伸びます。</span>
              <a class="z-bo" href="#/session/kakera">
                朝の欠片を 解く
              </a>
            </div>
          </>
        )}
        {pk && sp && <Chapters pk={pk} sp={sp} date={date} />}
      </div>
      <div class="gr-b">
        <Calendar date={date} now={now} first={first} exam={exam} />
        <Hex date={date} sp={sp} />
        <Achs date={date} />

        <div class="gr-foot">
          <p>成長の数字は、個人の手帳だけから 数えています。仕事の手帳は 入れず、だれとも 比べません。</p>
          <button
            type="button"
            class="z-bo"
            onClick={() => {
              exportDaysCsv();
              sfx('write');
              toast('一日ごとの記録を、CSV で 書き出しました');
            }}
          >
            書き出す
          </button>
        </div>
      </div>
    </div>
  );
}

function Ladder({ lv }: { lv: number }) {
  let cur = TITLES[0][1];
  for (const [from, name] of TITLES) if (lv >= from) cur = name;
  return (
    <ol class="gr-lad" aria-label={`称号。いまは ${cur}`}>
      {TITLES.map(([from, name]) => {
        const st = name === cur ? 'now' : lv >= from ? 'past' : '';
        return (
          <li key={name} class={st || undefined} aria-current={st === 'now' ? 'step' : undefined}>
            <b>{name}</b>
            <i>Lv.{from}</i>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- the pass outlook ---------- */
function Forecast({ pk, sp, date, exam }: { pk: Pack; sp: StudyProgress; date: string; exam?: string }) {
  const examIn = !!exam && exam > date && dayDiff(date, exam) <= 60;
  const until = examIn ? exam! : addDays(date, 28);
  const o = outlook(pk, sp, date, until);
  const [box, w] = useWidth<HTMLDivElement>(358);
  const [ref, seen] = useSeen<HTMLDivElement>(0.4);
  const [hv, setHv] = useState(-1);
  const pass = pk.passingScore;
  const N = o.past.length;
  const T = Math.max(1, N - 1 + o.ahead.length - 1);
  const v0 = o.past[N - 1].v;
  const valAt = (i: number) => (i < N ? { d: o.past[i].d, v: o.past[i].v, lo: 0, hi: 0 } : o.ahead[i - N + 1]);
  const end = o.ahead[o.ahead.length - 1];

  // readout: today, a past day, or a day ahead
  const i = hv < 0 ? N - 1 : hv;
  const at = valAt(i);
  const ro =
    i === N - 1
      ? { l: 'いまの予想スコア', d: `${dl(date)} · 今日`, x: `/ ${pk.scoreMax}` }
      : i < N - 1
        ? { l: 'その日の予想スコア', d: `${dl(at.d)} · ${N - 1 - i}日前`, x: `/ ${pk.scoreMax}` }
        : { l: examIn && at.d === exam ? '本番の予想' : '予想', d: `${dl(at.d)} · ${i - N + 1}日後`, x: `${at.lo}〜${at.hi}` };
  const up = N >= 2 ? v0 - o.past[N - 2].v : 0;
  const gap = pass - v0;
  const enough = o.studied >= 3;

  const L = 34;
  const R = Math.max(L + 100, w - 8);
  const TOP = 14;
  const BOT = 160;
  const all = [...o.past.map((x) => x.v), ...o.ahead.flatMap((x) => [x.lo, x.hi]), pass];
  let y0 = Math.max(0, Math.floor((Math.min(...all) - 30) / 100) * 100);
  const y1 = Math.min(pk.scoreMax, Math.ceil((Math.max(...all) + 30) / 100) * 100);
  if (y1 - y0 < 200) y0 = Math.max(0, y1 - 200);
  const X = (k: number) => L + (k / T) * (R - L);
  const Y = (v: number) => TOP + ((y1 - v) / (y1 - y0)) * (BOT - TOP);
  const f = (n: number) => n.toFixed(1);
  const hist = o.past.map((x, k) => `${k ? 'L' : 'M'}${f(X(k))} ${f(Y(x.v))}`).join(' ');
  const proj = o.ahead.map((x, k) => `${k ? 'L' : 'M'}${f(X(N - 1 + k))} ${f(Y(x.v))}`).join(' ');
  const band = [...o.ahead.map((x, k) => `${f(X(N - 1 + k))},${f(Y(x.hi))}`), ...o.ahead.map((x, k) => `${f(X(N - 1 + k))},${f(Y(x.lo))}`).reverse()].join(' ');
  const ticks: number[] = [];
  for (let v = y0; v <= y1; v += 100) ticks.push(v);
  const weeks: number[] = [];
  for (let k = 0; k <= T; k += 7) weeks.push(k);
  const ci = o.cross ? N - 1 + dayDiff(date, o.cross) : -1;
  const xToday = X(N - 1);
  const firstLabel = xToday - L > 44;
  const pick = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const k = clamp(Math.round(((clientX - rect.left - L) / (R - L)) * T), 0, T);
    if (k !== hv) {
      setHv(k);
      sfx('tick');
    }
  };
  const key = (e: KeyboardEvent) => {
    const cur = hv < 0 ? N - 1 : hv;
    const to = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? T : null;
    if (to === null) return;
    e.preventDefault();
    setHv(clamp(to, 0, T));
    sfx('tick');
  };

  return (
    <>
      <div class="z-sec gr-sec">
        <b>合格の見込み</b>
        <i />
        <span>
          {pk.scoreMax}点中 {pass} で合格
        </span>
      </div>
      <div ref={ref} class={`gr-fc${seen ? ' in' : ''}`}>
        <div class="gr-ro">
          <div class="gr-rol">
            <span>{ro.l}</span>
            <span class="gr-rd">{ro.d}</span>
          </div>
          <div class="gr-rob">
            <b class="z-min z-num gr-rov">{at.v}</b>
            <span class="gr-rox z-num">{ro.x}</span>
            {i === N - 1 && up > 0 && (
              <span key={v0} class="z-tag z-tag-r gr-rup">
                今日 +{up}
              </span>
            )}
          </div>
        </div>
        {enough ? (
          <>
            <div ref={box} class="gr-fw">
              <svg viewBox={`0 0 ${w} 190`} width={w} height="190" aria-hidden="true">
                {weeks.map((k) => (
                  <path key={'w' + k} d={`M${f(X(k))} ${TOP}V${BOT}`} stroke="rgba(243,241,236,.05)" />
                ))}
                {ticks.map((v) =>
                  Math.abs(v - pass) < 25 ? null : (
                    <g key={'t' + v}>
                      <path d={`M${L} ${f(Y(v))}H${R}`} stroke="rgba(243,241,236,.1)" />
                      <text x={L - 8} y={f(Y(v) + 3.5)} text-anchor="end" font-size="10" font-weight="700" fill="#6D6C70">
                        {v}
                      </text>
                    </g>
                  ),
                )}
                <path d={`M${L} ${BOT}H${R}`} stroke="rgba(243,241,236,.3)" />
                <path d={`M${L} ${f(Y(pass))}H${R}`} stroke="#E3402B" stroke-width="1.5" />
                <text x={L - 8} y={f(Y(pass) + 3.5)} text-anchor="end" font-size="10" font-weight="900" fill="#E3402B">
                  {pass}
                </text>
                <text x={L + 6} y={f(Y(pass) - 6)} font-size="10" font-weight="900" fill="#E3402B" letter-spacing=".08em">
                  合格ライン
                </text>
                <path d={`M${f(xToday)} ${TOP}V${BOT}`} stroke="rgba(243,241,236,.3)" stroke-dasharray="2 3" />
                {examIn && <path d={`M${R} 8V${BOT}`} stroke="#E3402B" stroke-width="2" />}
                {weeks.map((k) => (
                  <path key={'k' + k} d={`M${f(X(k))} ${BOT}V${BOT + 5}`} stroke="rgba(243,241,236,.3)" />
                ))}
                {firstLabel && (
                  <text x={L} y="180" font-size="10.5" font-weight="700" fill="#8F8E92">
                    {md(o.past[0].d)}
                  </text>
                )}
                <text x={f(xToday)} y="180" text-anchor={firstLabel ? 'middle' : 'start'} font-size="10.5" font-weight="900" fill="#F3F1EC">
                  今日
                </text>
                <text x={R + 2} y="180" text-anchor="end" font-size="10.5" font-weight="900" fill={examIn ? '#E3402B' : '#8F8E92'}>
                  {examIn ? `本番 ${md(until)}` : md(until)}
                </text>
                <g class="gr-pj">
                  <polygon points={band} fill="rgba(243,241,236,.09)" />
                  <path d={proj} fill="none" stroke="#F3F1EC" stroke-opacity=".8" stroke-width="2" stroke-dasharray="5 4" />
                  <path d={`M${f(R - 6)} ${f(Y(end.v))}l6 -6l6 6l-6 6Z`} fill="#0B0B0C" stroke="#F3F1EC" stroke-width="1.6" />
                  <text x={f(R - 10)} y={f(Y(end.v) - 9)} text-anchor="end" font-size="11" font-weight="900" fill="#F3F1EC">
                    {examIn ? '本番' : '予想'} {end.v}
                  </text>
                </g>
                <path class="gr-hp" pathLength={1} d={hist} fill="none" stroke="#F3F1EC" stroke-width="2.5" stroke-linejoin="miter" />
                {ci > N - 1 && (
                  <g class="gr-cx">
                    <path d={`M${f(X(ci) - 6)} ${f(Y(pass) + 10)}L${f(X(ci) + 6)} ${f(Y(pass) - 10)}`} stroke="#0B0B0C" stroke-width="7" />
                    <path d={`M${f(X(ci) - 6)} ${f(Y(pass) + 10)}L${f(X(ci) + 6)} ${f(Y(pass) - 10)}`} stroke="#E3402B" stroke-width="3.2" />
                    <text x={f(clamp(X(ci), L + 50, R - 50))} y={f(Y(pass) + 25)} text-anchor="middle" font-size="10.5" font-weight="900" fill="#E3402B">
                      {md(o.cross)} ごろ 越える
                    </text>
                  </g>
                )}
                <path class="gr-td" d={`M${f(xToday - 7)} ${f(Y(v0))}l7 -7l7 7l-7 7Z`} fill="#F3F1EC" stroke="#0B0B0C" stroke-width="2" />
              </svg>
              <div
                class="gr-hit"
                role="slider"
                tabIndex={0}
                aria-label="合格の見込み。左右の矢印キーで 日をえらぶ"
                aria-valuemin={0}
                aria-valuemax={T}
                aria-valuenow={i}
                aria-valuetext={`${ro.d}、${ro.l} ${at.v}${i > N - 1 ? `、ぶれ幅 ${ro.x}` : ''}`}
                onPointerMove={(e) => pick(e.clientX)}
                onPointerDown={(e) => pick(e.clientX)}
                onPointerLeave={() => setHv(-1)}
                onKeyDown={key}
                onBlur={() => setHv(-1)}
              >
                <span class={`gr-xh${hv >= 0 ? ' on' : ''}`} style={{ left: `${f(X(i))}px` }} />
                <span class={`gr-xd${hv >= 0 ? ' on' : ''}`} style={{ left: `${f(X(i))}px`, top: `${f(Y(at.v))}px` }} />
              </div>
            </div>
            <div class="gr-flg" aria-hidden="true">
              <span>
                <svg width="16" height="6">
                  <path d="M0 3H16" stroke="#F3F1EC" stroke-width="2.5" />
                </svg>
                これまで
              </span>
              <span>
                <svg width="16" height="6">
                  <path d="M0 3H16" stroke="#F3F1EC" stroke-width="2" stroke-dasharray="5 3" />
                </svg>
                予想
              </span>
              <span>
                <svg width="16" height="10">
                  <rect width="16" height="10" fill="rgba(243,241,236,.16)" />
                </svg>
                ぶれ幅
              </span>
              <span>
                <svg width="16" height="6">
                  <path d="M0 3H16" stroke="#E3402B" stroke-width="2" />
                </svg>
                合格ライン {pass}
              </span>
            </div>
            <p class="gr-fn">
              {gap <= 0 ? (
                <>
                  合格ラインに 届いています。{examIn ? '本番の予想は ' : '4週後の予想は '}
                  <b>{end.v}</b>（{end.lo}〜{end.hi}）。
                </>
              ) : o.cross ? (
                <>
                  合格ライン {pass} まで、あと <b>{gap}</b>。このペースなら <b>{md(o.cross)}ごろ</b> に 越えて、{examIn ? '本番の予想は ' : '4週後には '}
                  <b>{end.v}</b>。
                </>
              ) : (
                <>
                  合格ライン {pass} まで、あと <b>{gap}</b>。いまのペースだと、{examIn ? '本番' : '4週後'}の予想は <b>{end.v}</b>。弱い章を 3問ずつ 足すと、線が 上を 向きます。
                </>
              )}
              {!exam && ' 試験日を 決めると、本番の日までの 線になります。'}
            </p>
          </>
        ) : (
          <p class="gr-fn gr-fn0">
            {3 - o.studied}日 ぶん 解くと、見込みの線が 引けます。いまは {o.studied}日ぶん。
          </p>
        )}
      </div>
    </>
  );
}

/* ---------- chapters ---------- */
function chapterNote(c: Chapter, tg: number) {
  if (c.p === null) return 'まだ 解いていない章。3問だけでも 解くと、見込みが 正確になります。';
  const gain = c.prev !== null ? c.p - c.prev : 0;
  const trip = c.trip ? `「${topicShort(c.trip)}」で 迷いがち。` : '';
  const week = gain > 0 ? `今週 +${gain}。` : gain < 0 ? `今週 ${gain}。` : '';
  return c.p >= tg ? `目安の ${tg}% を 越えています。${week}${trip}` : `目安の ${tg}% まで あと ${tg - c.p}。${week}${trip}`;
}

function Chapters({ pk, sp, date }: { pk: Pack; sp: StudyProgress; date: string }) {
  const list = chapters(pk, sp, state.p, date);
  const tg = target(pk);
  const [open, setOpen] = useState(-1);
  const [ref, seen] = useSeen<HTMLDivElement>(0.25);
  const weak = weakestTopic(pk, sp, date);
  return (
    <>
      <div class="z-sec gr-sec">
        <b>章ごとの正答</b>
        <i />
        <span>
          <i class="gr-k70" />
          目安 {tg}% · <i class="gr-kpv" />
          先週
        </span>
      </div>
      <div ref={ref} class={`gr-chs${seen ? ' in' : ''}`}>
        {list.map((c, i) => {
          const on = open === i;
          const gain = c.p !== null && c.prev !== null ? c.p - c.prev : 0;
          return (
            <div key={c.id} class={`gr-ch${on ? ' open' : ''}${c.p === null ? ' none' : ''}`}>
              <button
                type="button"
                class="gr-chb"
                aria-expanded={on}
                aria-label={`第${c.n}章 ${c.name}、${c.p === null ? 'まだ 解いていない' : `正答 ${c.p}%`}${c.weak ? '、弱点' : ''}${gain >= 5 ? `、今週 +${gain}` : ''}`}
                onClick={() => {
                  sfx('tock');
                  setOpen(on ? -1 : i);
                }}
              >
                <span class="gr-chl">
                  <i class="gr-chn">{c.n}</i>
                  <b class="gr-chm">{c.name}</b>
                  {c.weak && <span class="z-tag z-tag-r gr-cht">弱点</span>}
                  {gain >= 5 && <span class="gr-chu">+{gain} 今週</span>}
                  {c.p !== null ? (
                    <span class="gr-chp z-min z-num">
                      {c.p}
                      <small>%</small>
                    </span>
                  ) : (
                    <span class="gr-chf">まだ</span>
                  )}
                  <span class="gr-chv">
                    <ChevR size={12} />
                  </span>
                </span>
                <span class="gr-tw" aria-hidden="true">
                  <span class="gr-trk">
                    <span class="gr-fill" style={{ '--p': `${c.p ?? 0}%`, animationDelay: `${(0.05 + i * 0.06).toFixed(2)}s` }} />
                    {c.prev !== null && <i class="gr-prev" style={{ left: `${c.prev}%` }} />}
                  </span>
                  <i class="gr-70" style={{ left: `${tg}%` }} />
                </span>
              </button>
              {on && (
                <div class="gr-chd">
                  <p>{chapterNote(c, tg)}</p>
                  <div class="gr-cha">
                    <a class="z-bw sm gr-go" href={`#/session/domain/${c.id}`}>
                      3問だけ 解く
                    </a>
                    <span class="gr-chan">答えると、見込みに すぐ 入ります</span>
                  </div>
                  {c.zukan && (
                    <div class="gr-cha">
                      <a class="z-bo" href={`#/zukan/${c.zukan.boss.id}`}>
                        図鑑で {c.zukan.boss.name}を見る
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p class="gr-nx">
        <i />
        <span>
          来週の影は、月曜に いちばん迷っているところから 生まれます。いまは <b>{topicShort(weak)}</b>。
        </span>
      </p>
    </>
  );
}

/* ---------- the calendar of cuts ---------- */
function Calendar({ date, now, first, exam }: { date: string; now: Date; first: string; exam?: string }) {
  const p = state.p;
  const [sel, setSel] = useState(date);
  const [ref, seen] = useSeen<HTMLDivElement>(0.25);
  if (!unlocked(p.game.lv, 'calendar')) {
    return (
      <>
        <div class="z-sec gr-sec">
          <b>斬り跡の暦</b>
          <i />
          <span>Lv.{UNLOCK_LV.calendar} で ひらく</span>
        </div>
        <p class="gr-lock">一日ずつの 斬った数が、暦に 残ります。記録は もう 始まっています。</p>
      </>
    );
  }
  const cells = calendar(p, date, first, exam);
  const cd = cells.find((c) => c.d === sel && (c.when === 'past' || c.when === 'today')) ?? cells.find((c) => c.when === 'today')!;
  const rec = p.recaps[cd.d];
  const note = p.days[cd.d]?.note || (rec && !rec.deleted ? rec.text.split('。')[0] + '。' : '');
  const tonight = cd.when === 'today' && now.getHours() < RECAP_HOUR;
  return (
    <>
      <div class="z-sec gr-sec">
        <b>斬り跡の暦</b>
        <i />
        <span>{exam && exam >= date && dayDiff(date, exam) <= 28 ? 'はじめた日から 本番まで' : 'はじめた日から'}</span>
      </div>
      <div class="gr-cal">
        <div class="gr-wd" aria-hidden="true">
          {['月', '火', '水', '木', '金', '土', '日'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div ref={ref} class={`gr-cg${seen ? ' in' : ''}`}>
          {cells.map((c, k) => {
            if (c.when === 'pre' || c.when === 'fut') {
              return (
                <span key={c.d} class={`gr-cd ${c.when}${c.exam ? ' exam' : ''}`} aria-hidden="true">
                  <span class="gr-cdn">{dayNum(c.d)}</span>
                  {c.exam && <span class="gr-cdx">本番</span>}
                </span>
              );
            }
            const on = c.d === cd.d;
            return (
              <button
                key={c.d}
                type="button"
                class={['gr-cd', `t${c.tier}`, c.kill && 'kill', c.when === 'today' && 'today', on && 'on'].filter(Boolean).join(' ')}
                style={{ '--k': k }}
                aria-pressed={on}
                aria-label={`${dl(c.d)}、経験値 ${c.xp}、斬った ${c.cuts}件${c.kill ? '、討伐' : ''}${c.when === 'today' ? '、今日' : ''}`}
                onClick={() => {
                  if (on) return;
                  sfx('tock');
                  buzz(4);
                  setSel(c.d);
                }}
              >
                <span class="gr-cdn">{dayNum(c.d)}</span>
                <span class="gr-cdt">
                  {c.tier >= 1 && <i />}
                  {c.tier >= 2 && <i />}
                  {c.tier >= 3 && <i />}
                </span>
              </button>
            );
          })}
        </div>
        <div key={cd.d} class="gr-cdd">
          <div class="gr-cddl">
            <div class="gr-cddh">
              <b class="z-num">
                {dl(cd.d)}
                {cd.when === 'today' ? ' 今日' : ''}
              </b>
              {cd.xp > 0 && <span class="gr-cddx z-num">+{cd.xp}</span>}
              <span class="gr-cddx gr-cddc">斬った {cd.cuts}件</span>
            </div>
            {note && <span class="gr-cddt">{note}</span>}
          </div>
          {tonight ? (
            <span class="gr-cddw">
              今夜 {RECAP_HOUR}:00 に
              <br />
              まとまる
            </span>
          ) : (
            <a href={`#/recap/${cd.d}`} class="z-bo gr-cddg">
              1日の記録
            </a>
          )}
        </div>
        <div class="gr-clg" aria-hidden="true">
          <span>
            <span class="gr-tl">
              <i />
            </span>
            〜59
          </span>
          <span>
            <span class="gr-tl">
              <i />
              <i />
            </span>
            60〜
          </span>
          <span>
            <span class="gr-tl">
              <i />
              <i />
              <i />
            </span>
            120〜
          </span>
          <span>
            <span class="gr-tl r">
              <i />
              <i />
              <i />
            </span>
            200〜
          </span>
          <span>
            <i class="gr-dm" />
            討伐
          </span>
        </div>
      </div>
    </>
  );
}

/* ---------- the six skills ---------- */
function Idea({ k, date }: { k: SkillRow; date: string }) {
  const [done, setDone] = useState<'' | 'add' | 'skip'>('');
  if (done === 'skip') return null;
  const title = SKILL_IDEA[k.k];
  return (
    <div class="gr-idea">
      <b>案</b>
      <p>15分で できる「{title}」を、あしたの やることに 入れますか？</p>
      <div class="gr-ida">
        <button
          type="button"
          class="z-bk sm"
          disabled={done === 'add'}
          onClick={() => {
            addTask('p', title, { sk: k.k, mins: 15, diff: 'e' }, addDays(date, 1));
            sfx('write');
            buzz(6);
            setDone('add');
            toast(`あしたの やることに 入れました · ${title}`, { undo: true });
          }}
        >
          {done === 'add' ? '入れました' : 'あしたに 入れる'}
        </button>
        {done !== 'add' && (
          <button type="button" class="z-txb" onClick={() => setDone('skip')}>
            いまは いい
          </button>
        )}
      </div>
    </div>
  );
}

function Hex({ date, sp }: { date: string; sp?: StudyProgress }) {
  const rows = skills(state.p, sp, date);
  const [sel, setSel] = useState(0);
  const [box, w] = useWidth<HTMLDivElement>(358);
  const [ref, seen] = useSeen<HTMLDivElement>(0.3);
  const cx = w / 2;
  const cy = 150;
  const S = Math.max(5, Math.ceil(Math.max(...rows.map((r) => r.lv - 1 + r.xp / r.need))));
  const pt = (i: number, r: number) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (r: number | ((i: number) => number)) => rows.map((_, i) => pt(i, typeof r === 'number' ? r : r(i)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const rad = (i: number) => 8 + 92 * Math.min(1, (rows[i].lv - 1 + rows[i].xp / rows[i].need) / S);
  const k = rows[sel];
  return (
    <>
      <div class="z-sec gr-sec">
        <b>六つのわざ</b>
        <i />
        <span>やることから 育つ</span>
      </div>
      <div ref={box} class="gr-hxw">
        <div ref={ref} class={`gr-hx${seen ? ' in' : ''}`}>
          <svg viewBox={`0 0 ${w} 300`} width={w} height="300" aria-hidden="true">
            {[20, 40, 60, 80, 100].map((r) => (
              <polygon key={r} points={poly(r)} fill="none" stroke={r === 100 ? 'rgba(243,241,236,.16)' : 'rgba(243,241,236,.07)'} />
            ))}
            {rows.map((_, i) => {
              const [x, y] = pt(i, 100);
              return <path key={i} d={`M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`} stroke="rgba(243,241,236,.07)" />;
            })}
            <g class="gr-hpoly" style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <polygon points={poly(rad)} fill="#E3402B" transform="translate(5 5)" />
              <polygon points={poly(rad)} fill="#F3F1EC" />
            </g>
            {(() => {
              const [x, y] = pt(sel, 100);
              return <path d={`M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`} stroke="#E3402B" stroke-width="2" stroke-dasharray="3 3" />;
            })()}
          </svg>
          {rows.map((r, i) => {
            const [vx, vy] = pt(i, rad(i));
            const [lx, ly] = pt(i, 126);
            const on = i === sel;
            return (
              <span key={r.k}>
                <i class={`gr-hv${on ? ' on' : ''}`} style={{ left: `${vx.toFixed(1)}px`, top: `${vy.toFixed(1)}px` }} />
                <button
                  type="button"
                  class={`gr-hl${on ? ' on' : ''}`}
                  style={{ left: `${lx.toFixed(1)}px`, top: `${ly.toFixed(1)}px` }}
                  aria-pressed={on}
                  aria-label={`${r.name}、Lv.${r.lv}`}
                  onClick={() => {
                    if (on) return;
                    sfx('tock');
                    buzz(4);
                    setSel(i);
                  }}
                >
                  <b class="gr-hlk">{r.k}</b>
                  <span class="gr-hlv z-num">{r.lv}</span>
                </button>
              </span>
            );
          })}
        </div>
      </div>
      <div key={k.k} class="gr-hd">
        <div class="gr-hdh">
          <b class="gr-hdk">{k.k}</b>
          <span class="gr-hdn">{k.name}</span>
          <span class="z-tag z-tag-k gr-hdl">Lv.{k.lv}</span>
        </div>
        <div class="gr-hdb">
          <span class="gr-hdr">
            <span class="gr-hdf" style={{ width: `${Math.round((k.xp / k.need) * 100)}%` }} />
          </span>
          <span>次の Lv まで {k.need - k.xp}</span>
        </div>
        <span class="gr-hds">{k.from.length ? `この2週 · ${k.from.join(' · ')}` : 'この2週、記録なし'}</span>
        {k.recent === 0 && <Idea key={k.k} k={k} date={date} />}
      </div>
    </>
  );
}

/* ---------- achievements ---------- */
function Achs({ date }: { date: string }) {
  const list = achievements(state.p, date);
  const got = list.filter((a) => a.at).length;
  const [sel, setSel] = useState(() => Math.max(0, list.findIndex((a) => a.fresh)));
  const [ref, seen] = useSeen<HTMLDivElement>(0.3);
  const a = list[sel];
  const fight = !a.at && (a.id === 'kill1' || a.id === 'kill4' || a.id === 'crit') && bossAlive(state.p.boss.cur);
  return (
    <>
      <div class="z-sec gr-sec">
        <b>実績</b>
        <i />
        <span>
          手に入れた <em class="z-min z-num">{got}</em> / {list.length}
        </span>
      </div>
      <div ref={ref} class={`gr-acg${seen ? ' in' : ''}`}>
        {list.map((x, i) => (
          <button
            type="button"
            key={x.id}
            class={`gr-ac ${x.at ? 'got' : 'lock'}${i === sel ? ' on' : ''}`}
            style={{ '--k': i }}
            aria-pressed={i === sel}
            aria-label={`${x.name}、${x.at ? `${md(x.at)} に 手に入れた` : 'まだ'}`}
            onClick={() => {
              if (i === sel) return;
              sfx('tock');
              buzz(4);
              setSel(i);
            }}
          >
            <span class="z-min gr-ack">{x.kj}</span>
            <i class="gr-acs" />
            {x.fresh && <i class="gr-acnw">新</i>}
            <b class="gr-acn">{x.name}</b>
            <span class="gr-acd">{x.at ? md(x.at) : 'まだ'}</span>
          </button>
        ))}
      </div>
      <div key={a.id} class="gr-acx">
        <div class="gr-acxt">
          <div class="gr-acxh">
            <b>{a.name}</b>
            {a.fresh && <span class="z-tag z-tag-r gr-acnew">新しい</span>}
          </div>
          <span class="gr-acxs">{a.at ? `${dl(a.at)} — ${a.sub}` : `${a.sub}。${a.progress}`}</span>
        </div>
        {fight && (
          <a href="#/battle" class="z-bo gr-acgo">
            挑む
          </a>
        )}
      </div>
    </>
  );
}
