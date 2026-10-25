// A short study session: 朝の欠片 (morning shards), 3問だけ for a topic or a chapter, or a look back at a
// shadow in 図鑑. Questions one at a time with a confidence pick; the explanation comes right after. When it
// came from a task, finishing it cuts that task (the person did it; nothing is checked for them).
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { Conf, Pack, Question, Task } from '../core/types';
import { state } from '../core/store';
import { aiLeft, answer, finishStudyTask, type Outcome } from '../core/actions';
import { topicShort } from '../core/enemy';
import { domainOf, domainQuestions, forecast, isCorrect, pickDrill, pickKakera, pickMock, progress, settled } from '../core/study';
import { hasLearn, lessonShort, lessonState, openTopics } from '../core/learn';
import { packOf, topicById } from '../core/pack';
import { levelFromTotal, need, title, unlocked, UNLOCK_LV } from '../core/game';
import { aiReady, askTutor } from '../core/ai';
import { doneOn } from '../core/tasks';
import { BUZZ, buzz, sfx } from '../core/sfx';
import { addDays, shuffle } from '../core/util';
import { celebrate } from '../ui/slash';
import { back } from '../ui/router';
import { useKey } from '../ui/hooks';
import { sheets } from '../ui/sheets';
import { Arrow, Close } from '../ui/icons';
import { Linked } from '../ui/words';

type Kind = 'kakera' | 'drill' | 'zukan' | 'mock';
interface Plan {
  kind: Kind;
  task?: Task;
  tag: string;
  title: string;
  qs: Question[];
  /** questions the "settled" row is measured on */
  scope: Question[];
  scopeName: string;
}

/** Reads the route: session/task/:id, session/kakera, session/topic/:id, session/domain/:id, session/zukan/:bossId, session/mock */
function plan(pk: Pack, args: string[], date: string): Plan | string {
  const sp = progress(state.p, pk.id);
  const [what, id] = args;
  const shortOf = (topicId: string) => {
    const t = topicById(pk, topicId);
    return t ? topicShort(t) : '弱点';
  };
  const topicPlan = (topicId: string, n: number, kind: Kind, tag: string, task?: Task): Plan | string => {
    const t = topicById(pk, topicId);
    if (!t) return 'この問題は、いまの問題集に ありません。';
    const qs = pickDrill(pk, sp, date, { topicId }, n);
    return { kind, task, tag, title: kind === 'zukan' ? 'おさらい' : `${qs.length}問だけ`, qs, scope: pk.questions.filter((q) => q.topicId === topicId), scopeName: topicShort(t) };
  };
  const kakeraPlan = (n: number, task?: Task): Plan => {
    const qs = pickKakera(pk, sp, date, n, openTopics(pk, sp));
    return { kind: 'kakera', task, tag: '朝の欠片', title: `${qs.length}問`, qs, scope: pk.questions, scopeName: '' };
  };

  if (what === 'task') {
    const t = state.p.tasks.find((x) => x.id === id);
    if (!t || !t.study) return 'この やることは、もう ありません。';
    if (doneOn(t, date)) return 'この やることは、もう 斬ってあります。';
    const st = t.study;
    if (st.kind === 'kakera') return kakeraPlan(st.count || 5, t);
    if (st.kind === 'drill' && st.topicId) return topicPlan(st.topicId, st.count || 3, 'drill', shortOf(st.topicId), t);
    if (st.kind === 'drill' && st.domainId) {
      const d = pk.domains.find((x) => x.id === st.domainId);
      const qs = pickDrill(pk, sp, date, { domainId: st.domainId }, st.count || 3);
      return { kind: 'drill', task: t, tag: d?.name ?? '章', title: `${qs.length}問だけ`, qs, scope: domainQuestions(pk, st.domainId), scopeName: d?.name ?? '' };
    }
    if (st.kind === 'learn' || st.kind === 'words') return 'この やることは、覚える画面で ひらきます。';
    return 'この やることは、読むものです。読んだら 今日の画面で 斬ってください。';
  }
  if (what === 'kakera') {
    const t = state.p.tasks.find((x) => x.study?.kind === 'kakera' && x.date === date && !doneOn(x, date));
    return kakeraPlan(t?.study?.count || 5, t);
  }
  if (what === 'topic' && id) return topicPlan(id, 3, 'drill', shortOf(id));
  if (what === 'domain' && id) {
    const n = pk.domains.findIndex((x) => x.id === id);
    if (n < 0) return 'この章は、いまの問題集に ありません。';
    const qs = pickDrill(pk, sp, date, { domainId: id }, 3);
    return { kind: 'drill', tag: `第${n + 1}章 ${pk.domains[n].name}`, title: `${qs.length}問だけ`, qs, scope: domainQuestions(pk, id), scopeName: pk.domains[n].name };
  }
  if (what === 'mock') {
    if (!unlocked(state.p.game.lv, 'mock')) return `模試は Lv.${UNLOCK_LV.mock} で ひらきます。`;
    const qs = pickMock(pk, 20);
    return { kind: 'mock', tag: '模試', title: `${qs.length}問`, qs, scope: pk.questions, scopeName: '' };
  }
  if (what === 'zukan' && id) {
    const z = state.p.zukan.find((x) => x.boss.id === id);
    if (!z) return 'この影は、図鑑に ありません。';
    return topicPlan(z.boss.topicId, 3, 'zukan', z.boss.name);
  }
  return 'ひらく問題が 見つかりません。';
}

interface Run {
  phase: 'q' | 'fb' | 'res';
  qi: number;
  opts: string[];
  pick: string[];
  picked: string[];
  conf: Conf;
  qAt: number;
  ok: boolean;
  note: string;
  combo: number;
  marks: ('ok' | 'ng')[];
  xp: number;
  dmg: number;
  lastDmg: number;
  out: Outcome | null;
  tutor: string;
  tutorState: '' | 'busy' | 'done' | 'fail';
  live: string;
}

export function Session({ args, date }: { args: string[]; date: string }) {
  // a task, or a 図鑑 page, keeps the certification it was made for
  const certId = args[0] === 'task' ? state.p.tasks.find((t) => t.id === args[1])?.study?.certId : args[0] === 'zukan' ? state.p.zukan.find((z) => z.boss.id === args[1])?.boss.certId : undefined;
  const pk = packOf(certId);
  if (!pk) return <Blank text="問題集を 読みこんでいます…" />;
  return <SessionIn key={args.join('/')} pk={pk} args={args} date={date} />;
}

function Blank({ text }: { text: string }) {
  useKey((e) => {
    if (e.key === 'Escape' || e.key === 'Enter') back('today');
  });
  return (
    <div class="ss">
      <div class="ss-top z-grain">
        <div class="ss-bar">
          <button type="button" class="ss-x" onClick={() => back('today')} aria-label="とじる">
            <Close size={16} />
          </button>
        </div>
      </div>
      <div class="ss-panel z-light">
        <div class="ss-in">
          <p class="ss-blank">{text}</p>
          <button type="button" class="z-bk" onClick={() => back('today')}>
            今日に戻る
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionIn({ pk, args, date }: { pk: Pack; args: string[]; date: string }) {
  const [p] = useState(() => plan(pk, args, date));
  if (typeof p === 'string') return <Blank text={p} />;
  if (!p.qs.length) return <Blank text="出せる問題が ありません。" />;
  return <Questions pk={pk} p={p} date={date} />;
}

const WORDS: [number, string][] = [
  [1, '全問、斬った'],
  [0.6, 'よく斬れた'],
  [0, 'あすの欠片へ'],
];

function Questions({ pk, p, date }: { pk: Pack; p: Plan; date: string }) {
  const sp = progress(state.p, pk.id);
  const before = useRef({ total: state.p.game.total, settled: settled(sp, p.scope), forecast: forecast(pk, sp.log) }).current;
  const R = useRef<Run>({
    phase: 'q',
    qi: 0,
    opts: shuffle(p.qs[0].options.map((o) => o.id)),
    pick: [],
    picked: [],
    conf: 'maybe',
    qAt: Date.now(),
    ok: false,
    note: '',
    combo: 0,
    marks: [],
    xp: 0,
    dmg: 0,
    lastDmg: 0,
    out: null,
    tutor: '',
    tutorState: '',
    live: `問1。${p.qs[0].stem}`,
  }).current;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const upd = (patch: Partial<Run>) => {
    Object.assign(R, patch);
    bump(0);
  };
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const tutorAsk = aiReady();
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [R.qi, R.phase === 'res']);

  const q = p.qs[R.qi];
  const multi = q.type === 'multi';
  const total = p.qs.length;
  const boss = state.p.boss.cur;
  const text = (id: string) => q.options.find((o) => o.id === id)?.text ?? '';
  const num = (id: string) => R.opts.indexOf(id) + 1;
  const weak = (() => {
    const y = addDays(date, -1);
    return sp.log.some((a) => a.q === q.id && a.d === y && (!a.ok || a.conf === 'guess'));
  })();

  const submit = (pick: string[]) => {
    if (R.phase !== 'q' || !pick.length) return;
    const ok = isCorrect(q, pick);
    const hp0 = state.p.boss.cur?.hp ?? 0;
    const r = answer(pk, q, pick, ok, R.conf, Date.now() - R.qAt, p.kind === 'kakera' ? 'kakera' : 'drill', R.combo, date);
    const lastDmg = Math.max(0, hp0 - (state.p.boss.cur?.hp ?? 0));
    upd({
      phase: 'fb',
      picked: pick,
      ok,
      note: r.note,
      combo: ok ? R.combo + 1 : 0,
      marks: [...R.marks, ok ? 'ok' : 'ng'],
      xp: R.xp + r.xp,
      dmg: R.dmg + lastDmg,
      lastDmg,
      live: ok ? `正解。${r.note}` : `ちがいました。正解は ${q.answer.map(text).join('、')}`,
    });
    if (ok) {
      sfx(R.combo >= 2 ? 'cut' : 'right', Math.min(3, R.combo));
      buzz(BUZZ.soft);
    } else {
      sfx('wrong');
      buzz(BUZZ.tap);
    }
  };

  const choose = (id: string) => {
    if (R.phase !== 'q') return;
    if (!multi) return submit([id]);
    sfx('tick');
    upd({ pick: R.pick.includes(id) ? R.pick.filter((x) => x !== id) : [...R.pick, id] });
  };

  const setConf = (c: Conf) => {
    if (R.phase !== 'q' || R.conf === c) return;
    sfx('tock');
    upd({ conf: c });
  };

  const finish = () => {
    const out = p.task ? finishStudyTask(p.task.id, date, R.dmg) : null;
    upd({ phase: 'res', out, xp: R.xp + (out?.xp ?? 0), live: `${R.marks.filter((m) => m === 'ok').length}問 正解。` });
    sfx('reward');
    const lvNow = levelFromTotal(state.p.game.total).lv;
    const lv0 = levelFromTotal(before.total).lv;
    celebrate({ lvFrom: lv0, lvTo: lvNow, three: !!out?.three, killReady: !!out?.killReady, ach: out?.ach ?? [] }, 500);
  };

  const next = () => {
    if (R.phase !== 'fb') return;
    abort.current?.abort();
    if (R.qi + 1 >= total) return finish();
    sfx('tock');
    const nq = p.qs[R.qi + 1];
    upd({ phase: 'q', qi: R.qi + 1, opts: shuffle(nq.options.map((o) => o.id)), pick: [], picked: [], conf: 'maybe', qAt: Date.now(), tutor: '', tutorState: '', live: `問${R.qi + 2}。${nq.stem}` });
  };

  const tutor = async () => {
    if (R.tutorState === 'busy' || !aiReady()) return;
    sfx('tock');
    const ctl = new AbortController();
    abort.current = ctl;
    upd({ tutor: '', tutorState: 'busy' });
    const ok = await askTutor(
      { stem: q.stem, options: q.options.map((o) => ({ id: o.id, text: o.text })), answer: q.answer, pick: R.picked, explanation: q.explanation },
      (t) => upd({ tutor: R.tutor + t }),
      ctl.signal,
    );
    if (abort.current !== ctl) return;
    upd({ tutorState: ok && R.tutor ? 'done' : 'fail' });
  };

  const close = () => {
    sfx('tock');
    back('today');
  };

  useKey((e) => {
    // a word's sheet is open above the question: its keys are its own
    if (sheets.now || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') return close();
    const n = /^[1-6]$/.test(k) ? Number(k) - 1 : -1;
    if (R.phase === 'q') {
      if (n >= 0 && R.opts[n]) choose(R.opts[n]);
      else if (k === 'Enter' && multi) submit(R.pick);
      else if (k === 'q') setConf('sure');
      else if (k === 'w') setConf('maybe');
      else if (k === 'e') setConf('guess');
      else return;
    } else if (R.phase === 'fb') {
      if (k === 'Enter' || k === ' ') next();
      else return;
    } else if (k === 'Enter') close();
    else return;
    e.preventDefault();
  });

  const right = R.marks.filter((m) => m === 'ok').length;
  const slots = p.qs.map((_, i) => (R.marks[i] ? R.marks[i] : i === R.qi && R.phase !== 'res' ? 'cur' : ''));

  return (
    <div class="ss">
      <div class="ss-top z-grain">
        <div class="ss-bar">
          <button type="button" class="ss-x" onClick={close} aria-label="とじる">
            <Close size={16} />
          </button>
          <span class="k-sp" />
          <span class="ss-slots" aria-label={`${total}問中 ${R.marks.length}問 済み`}>
            {slots.map((c, i) => (
              <i key={i} class={c} />
            ))}
          </span>
        </div>
        <div class="ss-title">
          <span class="z-tag z-tag-r">{p.tag}</span>
          <b class="z-min">{p.title}</b>
          {p.task && <span class="ss-task">やること「{p.task.title}」</span>}
        </div>
      </div>

      <div ref={scroller} class="ss-panel z-light">
        <div class="ss-in">
          {R.phase !== 'res' ? (
            <div key={R.qi} class="ss-q">
              <div class="ss-qh">
                <span class="ss-qn">問{R.qi + 1}</span>
                {weak && <span class="z-tag z-tag-r ss-weak">昨日迷った</span>}
                {multi && <span class="k-mtag">{q.answer.length}つ えらぶ</span>}
                <span class="k-sp" />
                {R.phase === 'q' && (
                  <div class="k-conf" role="radiogroup" aria-label="自信">
                    <span>自信</span>
                    {(
                      [
                        ['sure', '確実'],
                        ['maybe', 'たぶん'],
                        ['guess', '勘'],
                      ] as const
                    ).map(([c, l]) => (
                      <button key={c} type="button" role="radio" aria-checked={R.conf === c} onClick={() => setConf(c)}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p class="ss-qt z-min">
                <Linked pk={pk} text={q.stem} />
              </p>
              <div class="ss-opts">
                {R.opts.map((id, i) => {
                  const isAns = q.answer.includes(id);
                  const was = R.picked.includes(id);
                  const cls = R.phase === 'fb' ? (isAns ? 'ok' : was ? 'ng' : 'dim') : multi && R.pick.includes(id) ? 'on' : '';
                  return (
                    <button
                      key={id}
                      type="button"
                      class={`ss-op ${cls}`}
                      onClick={() => choose(id)}
                      aria-disabled={R.phase !== 'q'}
                      aria-pressed={multi && R.phase === 'q' ? R.pick.includes(id) : undefined}
                      style={{ animationDelay: `${(0.04 + i * 0.04).toFixed(2)}s` }}
                    >
                      <i class="ss-opk">{i + 1}</i>
                      <span class="ss-opt">{text(id)}</span>
                      <i class="ss-ops" />
                    </button>
                  );
                })}
              </div>
              {multi && R.phase === 'q' && (
                <button type="button" class="z-bk ss-sub" disabled={!R.pick.length} onClick={() => submit(R.pick)}>
                  {R.pick.length ? `${R.pick.length}つで 決める` : `${q.answer.length}つ えらんでから`}
                </button>
              )}
              {R.phase === 'fb' && (
                <div class="ss-fb">
                  <div class="ss-fbh">
                    <b class={R.ok ? 'ok' : 'ng'}>{R.ok ? (R.conf === 'guess' ? '正解。でも 勘だった' : '正解') : 'ちがいました'}</b>
                    {R.ok && R.combo >= 2 && <span class="ss-combo">{R.combo}連続</span>}
                    {R.lastDmg > 0 && boss && (
                      <span class="ss-hit">
                        {boss.name}に −{R.lastDmg}
                      </span>
                    )}
                  </div>
                  {!R.ok && (
                    <span class="ss-your">
                      あなたの答え　{R.picked.map(num).join('・')}　<s>{R.picked.map(text).join('、')}</s>
                    </span>
                  )}
                  <p class="ss-why">
                    <Linked pk={pk} text={q.explanation} />
                  </p>
                  {!R.ok &&
                    R.picked
                      .filter((id) => q.whyWrong?.[id])
                      .map((id) => (
                        <p key={id} class="ss-why ss-ww">
                          「{text(id)}」は、{q.whyWrong![id]}
                        </p>
                      ))}
                  {tutorAsk && R.tutorState === '' && (
                    <button type="button" class="ss-ask" onClick={tutor}>
                      AI に くわしく聞く
                      <span>この問題と あなたの答えを 送ります · 今月 あと {aiLeft()}回</span>
                    </button>
                  )}
                  {R.tutorState !== '' && (
                    <div class={`ss-tutor${R.tutorState === 'busy' ? ' busy' : ''}`} aria-live="polite">
                      <span class="ss-tutor-l">AI の説明</span>
                      {R.tutorState === 'fail' ? <p>いまは 聞けませんでした。上の説明だけでも、答えは 決まります。</p> : <p>{R.tutor || '考えています…'}</p>}
                    </div>
                  )}
                  <div class="ss-fbn">
                    <span class="ss-note">{R.note}</span>
                    <button type="button" class="z-bk ss-next" onClick={next}>
                      {R.qi + 1 >= total ? '結果へ' : '次へ'}
                      <Arrow />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Result p={p} pk={pk} right={right} marks={R.marks} xp={R.xp} dmg={R.dmg} out={R.out} before={before} onClose={close} />
          )}
        </div>
      </div>
      <div class="z-sr" aria-live="polite">
        {R.live}
      </div>
    </div>
  );
}

/** The mock exam on the exam's scale, and how each chapter went. */
function MockRows({ p, pk, marks, right }: { p: Plan; pk: Pack; marks: ('ok' | 'ng')[]; right: number }) {
  const scaled = Math.round((right / Math.max(1, p.qs.length)) * pk.scoreMax);
  const rows = pk.domains
    .map((d, n) => {
      const idx = p.qs.map((q, i) => (domainOf(pk, q) === d.id ? i : -1)).filter((i) => i >= 0);
      return { n, name: d.name, asked: idx.length, ok: idx.filter((i) => marks[i] === 'ok').length };
    })
    .filter((r) => r.asked);
  return (
    <>
      <div class="ss-rr">
        <span class="ss-rrl">換算</span>
        <span class="ss-rrv z-num">
          <b>{scaled}</b>
          <small>
            / {pk.scoreMax} · 合格 {pk.passingScore}
            {scaled >= pk.passingScore ? ' · 合格ライン' : ''}
          </small>
        </span>
      </div>
      {rows.map((r) => (
        <div class="ss-rr" key={r.n}>
          <span class="ss-rrl">第{r.n + 1}章</span>
          <span class="ss-rrt">
            {r.name} · {r.ok} / {r.asked}
          </span>
        </div>
      ))}
    </>
  );
}

function Result({ p, pk, right, marks, xp, dmg, out, before, onClose }: { p: Plan; pk: Pack; right: number; marks: ('ok' | 'ng')[]; xp: number; dmg: number; out: Outcome | null; before: { total: number; settled: number; forecast: number }; onClose: () => void }) {
  const sp = progress(state.p, pk.id);
  const total = p.qs.length;
  const word = WORDS.find(([r]) => right / total >= r)![1];
  const nowSettled = settled(sp, p.scope);
  const fc = forecast(pk, sp.log);
  const g = state.p.game;
  const up = levelFromTotal(before.total).lv < g.lv;
  const boss = state.p.boss.cur;
  // a missed question from a lesson not read yet: its words come first
  const toRead = hasLearn(pk) ? [...new Set(p.qs.filter((_, i) => marks[i] === 'ng').map((q) => q.topicId))].find((t) => lessonState(pk, sp, t) === 'new') : undefined;
  return (
    <div class="ss-res">
      <div class="ss-resh">
        <b class="z-min z-num ss-resn">
          {right}
          <small>/ {total}</small>
        </b>
        <span class="ss-ress" aria-hidden="true">
          {marks.map((m, i) => (
            <i key={i} class={m} style={{ '--j': i }} />
          ))}
        </span>
        <span class="ss-resw z-min">{word}</span>
      </div>
      <div class="ss-resl">
        {p.scopeName && (
          <div class="ss-rr">
            <span class="ss-rrl">{p.scopeName}</span>
            <span class="ss-rbar" aria-label={`身についた度合い ${nowSettled}%`}>
              <i style={{ width: `${nowSettled}%` }} />
              <b />
            </span>
            <span class="ss-rrv z-num">
              <b>{nowSettled}</b>
              <small>%</small>
            </span>
          </div>
        )}
        <div class="ss-rr">
          <span class="ss-rrl">予想スコア</span>
          <span class="ss-rrv z-num">
            {before.forecast}
            <span class="ss-rra">→</span>
            {fc}
            <small>/ {pk.scoreMax} · 合格 {pk.passingScore}</small>
          </span>
        </div>
        <div class="ss-rr">
          <span class="ss-rrl">経験値</span>
          <span class="ss-rrv z-num">
            <b>+{xp}</b>
            <small>
              Lv.{g.lv} {title(g.lv)} · {g.xp} / {need(g.lv)}
            </small>
            {up && <span class="z-tag z-tag-r ss-up">レベルアップ</span>}
          </span>
        </div>
        {p.kind === 'mock' && <MockRows p={p} pk={pk} marks={marks} right={right} />}
        {out && (
          <div class="ss-rr">
            <span class="ss-rrl">やること</span>
            <span class="ss-rrt">
              「{p.task?.title}」を 斬った{out.three ? ' · 今日の三つ +30' : ''}
            </span>
          </div>
        )}
        {toRead && (
          <div class="ss-rr">
            <span class="ss-rrl">覚える</span>
            <a class="ss-rrt ss-learn" href={`#/lesson/${toRead}`}>
              「{lessonShort(pk, toRead)}」の ことばを 先に 読む
              <Arrow size={11} />
            </a>
          </div>
        )}
        {(dmg > 0 || (out && out.dmg > 0)) && boss && (
          <div class="ss-rr">
            <span class="ss-rrl">今週の敵</span>
            <span class="ss-rrt">
              {boss.name}に −{dmg + (out?.dmg ?? 0)} · 残り {boss.hp}
            </span>
          </div>
        )}
      </div>
      <div class="ss-resf">
        <span>{right < total ? '間違えた問題は、あしたの朝の欠片に まざります。' : before.settled < nowSettled ? `「${p.scopeName || '全体'}」が ${nowSettled - before.settled} 進んだ。` : 'この調子で、あしたも。'}</span>
        <button type="button" class="z-bk" onClick={onClose}>
          とじる
        </button>
      </div>
    </div>
  );
}
