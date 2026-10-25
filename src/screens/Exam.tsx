// 模試 as the real exam. Before: the length, the time, the pass line and past sittings. During: one clock for
// all of it, answers that can be changed, a flag for 見直し, a list of every question to jump around, and
// nothing marked. Handing in (or the clock running out) gives the score on the exam's scale, each chapter, and
// every question with its explanation.
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { MockRun, Pack, Question } from '../core/types';
import { state } from '../core/store';
import { activePack, packOf, questionById } from '../core/pack';
import { EXAM_FULL, EXAM_HALF, examMinutes, grade, loadSitting, newSitting, saveSitting, timeLeft, type Graded, type Sitting } from '../core/exam';
import { progress } from '../core/study';
import { md, pad } from '../core/util';
import { BUZZ, buzz, sfx } from '../core/sfx';
import { celebrate } from '../ui/slash';
import { back, go } from '../ui/router';
import { useKey } from '../ui/hooks';
import { Arrow, ChevL, Close } from '../ui/icons';

type Phase = 'intro' | 'run' | 'list' | 'done';

const clock = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h ? `${h}:${pad(m)}` : m}:${pad(t % 60)}`;
};
const mins = (secs: number) => `${Math.floor(secs / 60)}分${secs % 60 ? `${pad(secs % 60)}秒` : ''}`;

export function Exam({ date }: { date: string }) {
  const [s0] = useState(loadSitting);
  const pk = packOf(s0?.certId) ?? activePack();
  if (!pk) {
    return (
      <div class="ss ex">
        <p class="ex-wait">問題集を 読みこんでいます…</p>
      </div>
    );
  }
  return <ExamIn pk={pk} s0={s0 && s0.certId === pk.id ? s0 : null} date={date} />;
}

function ExamIn({ pk, s0, date }: { pk: Pack; s0: Sitting | null; date: string }) {
  const [s, setS] = useState<Sitting | null>(s0);
  const [phase, setPhase] = useState<Phase>(s0 ? 'run' : 'intro');
  const [g, setG] = useState<Graded | null>(null);
  const [armed, setArmed] = useState(false);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const panel = useRef<HTMLDivElement>(null);
  const running = !!s && (phase === 'run' || phase === 'list');

  const handIn = (cur: Sitting) => {
    const out = grade(pk, cur, date);
    setG(out);
    setS(null);
    setPhase('done');
    setArmed(false);
    sfx(out.run.pass ? 'reward' : 'soft');
    buzz(out.run.pass ? BUZZ.lv : BUZZ.soft);
    celebrate({ lvFrom: out.lvFrom, lvTo: state.p.game.lv, three: false, killReady: false, ach: [] }, 900);
  };

  // one clock for the sitting; when it runs out the sitting is handed in as it stands
  useEffect(() => {
    if (!running || !s) return;
    if (timeLeft(s) <= 0) return handIn(s);
    const t = setInterval(() => {
      if (timeLeft(s) <= 0) handIn(s);
      else tick(0);
    }, 1000);
    return () => clearInterval(t);
  }, [running, s]);

  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [s?.at, phase]);

  const put = (patch: Partial<Sitting>) => {
    if (!s) return;
    const next = { ...s, ...patch };
    saveSitting(next);
    setS(next);
  };

  const begin = (n: number) => {
    sfx('tock');
    buzz(BUZZ.tap);
    setS(newSitting(pk, n));
    setPhase('run');
  };

  const leave = () => {
    sfx('tock');
    back('mondai');
  };

  if (phase === 'done' && g) return <Result pk={pk} g={g} onClose={leave} />;
  if (!s || phase === 'intro') return <Intro pk={pk} onBegin={begin} onClose={leave} />;

  const q = questionById(pk, s.qs[s.at]);
  const left = timeLeft(s);
  const blank = s.qs.filter((id) => !s.picks[id]?.length).length;
  const flagged = s.flags.includes(s.qs[s.at]);

  const goTo = (i: number) => {
    if (i < 0 || i >= s.qs.length) return;
    sfx('tick');
    setArmed(false);
    put({ at: i });
    setPhase('run');
  };
  const choose = (id: string) => {
    if (!q) return;
    const cur = s.picks[q.id] || [];
    const multi = q.type === 'multi';
    const pick = multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : cur[0] === id ? [] : [id];
    sfx('tick');
    put({ picks: { ...s.picks, [q.id]: pick } });
  };
  const flag = () => {
    const id = s.qs[s.at];
    sfx('tock');
    put({ flags: flagged ? s.flags.filter((x) => x !== id) : [...s.flags, id] });
  };
  const toList = () => {
    sfx('tock');
    setArmed(false);
    setPhase('list');
  };
  const end = () => {
    if (!armed) {
      sfx('tock');
      buzz(BUZZ.tap);
      setArmed(true);
      return;
    }
    handIn(s);
  };

  return (
    <Running pk={pk} s={s} q={q} phase={phase} left={left} blank={blank} flagged={flagged} armed={armed} panel={panel} onLeave={leave} onFlag={flag} onChoose={choose} onGo={goTo} onList={toList} onEnd={end} />
  );
}

function Intro({ pk, onBegin, onClose }: { pk: Pack; onBegin: (n: number) => void; onClose: () => void }) {
  const sp = state.p.study[pk.id];
  const runs = (sp?.mocks || []).slice(-5).reverse();
  const full = Math.min(EXAM_FULL, pk.questions.length);
  const passPct = (pk.passingScore / pk.scoreMax) * 100;
  useKey((e) => {
    if (e.key === 'Escape') onClose();
  });
  return (
    <div class="ss ex">
      <div class="ss-top z-grain">
        <div class="ss-bar">
          <button type="button" class="ss-x" onClick={onClose} aria-label="とじる">
            <Close size={16} />
          </button>
        </div>
        <div class="ex-head">
          <span class="z-tag z-tag-r">模試</span>
          <b class="z-min">本番と 同じ形で</b>
          <span class="ex-code">{pk.code}</span>
        </div>
      </div>
      <div class="ss-panel z-light">
        <div class="ss-in">
          <div class="ex-facts">
            <div>
              <b class="z-min z-num">{full}</b>
              <span>問</span>
            </div>
            <div>
              <b class="z-min z-num">{examMinutes(pk, full)}</b>
              <span>分</span>
            </div>
            <div>
              <b class="z-min z-num">{pk.passingScore}</b>
              <span>点で 合格</span>
            </div>
          </div>
          <ul class="ex-rules">
            <li>{pk.scoreMax}点 満点に 換算、章の重さどおりに 出る</li>
            <li>答えは 最後まで 変えられる</li>
            <li>迷ったら 印をつけて 見直し</li>
            <li>正解と 解説は 終わってから</li>
            <li>時間切れで 自動で 採点</li>
          </ul>
          <button type="button" class="z-bk ex-go" onClick={() => onBegin(full)}>
            はじめる
            <Arrow />
          </button>
          {pk.questions.length > EXAM_HALF && (
            <button type="button" class="z-bo2 ex-half" onClick={() => onBegin(EXAM_HALF)}>
              半分だけ · {EXAM_HALF}問 {examMinutes(pk, EXAM_HALF)}分
            </button>
          )}
          {runs.length > 0 && (
            <div class="ex-hist">
              <div class="ex-hh">これまで</div>
              {runs.map((r, i) => (
                <Past key={i} r={r} pk={pk} passPct={passPct} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Past({ r, pk, passPct }: { r: MockRun; pk: Pack; passPct: number }) {
  return (
    <div class="ex-past">
      <span class="ex-pd">{md(r.d)}</span>
      <span class="ex-pbar" aria-hidden="true">
        <i class={r.pass ? 'ok' : undefined} style={{ width: `${(r.score / pk.scoreMax) * 100}%` }} />
        <b style={{ left: `${passPct}%` }} />
      </span>
      <span class="ex-ps z-num">
        <b class="z-min">{r.score}</b>
        <small>
          {r.n}問 · {r.pass ? '合格' : `あと ${pk.passingScore - r.score}`}
        </small>
      </span>
    </div>
  );
}

interface RunProps {
  pk: Pack;
  s: Sitting;
  q?: Question;
  phase: Phase;
  left: number;
  blank: number;
  flagged: boolean;
  armed: boolean;
  panel: { current: HTMLDivElement | null };
  onLeave: () => void;
  onFlag: () => void;
  onChoose: (id: string) => void;
  onGo: (i: number) => void;
  onList: () => void;
  onEnd: () => void;
}

function Running({ pk, s, q, phase, left, blank, flagged, armed, panel, onLeave, onFlag, onChoose, onGo, onList, onEnd }: RunProps) {
  const total = s.qs.length;
  const last = s.at + 1 >= total;
  const low = left <= 5 * 60000;
  const pick = q ? s.picks[q.id] || [] : [];
  // the options keep one order for the whole sitting, so going back finds them where they were
  const order = useRef<Record<string, string[]>>({}).current;
  const opts = q ? (order[q.id] ||= q.options.map((o) => o.id)) : [];

  useKey((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') return onLeave();
    if (phase === 'run') {
      const n = /^[1-6]$/.test(k) ? Number(k) - 1 : -1;
      if (n >= 0 && opts[n]) onChoose(opts[n]);
      else if (k === 'ArrowRight' || k === 'Enter') last ? onList() : onGo(s.at + 1);
      else if (k === 'ArrowLeft') onGo(s.at - 1);
      else if (k === 'f') onFlag();
      else return;
    } else if (k === 'ArrowLeft') onGo(s.at);
    else return;
    e.preventDefault();
  });

  return (
    <div class="ss ex">
      <div class="ss-top z-grain ex-top">
        <div class="ss-bar">
          <button type="button" class="ss-x" onClick={onLeave} aria-label="中断する。時間は進みます">
            <Close size={16} />
          </button>
          <span class="ex-n z-num">
            {phase === 'list' ? '見直し' : (
              <>
                問 <b>{s.at + 1}</b> / {total}
              </>
            )}
          </span>
          <span class="k-sp" />
          <span class={`ex-clock z-num${low ? ' low' : ''}`} role="timer" aria-label={`残り ${clock(left)}`}>
            {clock(left)}
          </span>
        </div>
        <button type="button" class="ex-map" onClick={onList} aria-label={`一覧を ひらく。未回答 ${blank}、印 ${s.flags.length}`}>
          {s.qs.map((id, i) => (
            <i key={id} class={`${s.picks[id]?.length ? 'a' : ''}${s.flags.includes(id) ? ' f' : ''}${phase === 'run' && i === s.at ? ' c' : ''}`} />
          ))}
        </button>
      </div>

      <div ref={panel} class="ss-panel z-light ex-panel">
        <div class="ss-in">
          {phase === 'list' ? (
            <List s={s} blank={blank} armed={armed} onGo={onGo} onEnd={onEnd} />
          ) : q ? (
            <div key={q.id} class="ex-q">
              <div class="ss-qh">
                <span class="ss-qn">問{s.at + 1}</span>
                {q.type === 'multi' && <span class="k-mtag">{q.answer.length}つ えらぶ</span>}
                <span class="k-sp" />
                <button type="button" class={`ex-flag${flagged ? ' on' : ''}`} onClick={onFlag} aria-pressed={flagged}>
                  <i aria-hidden="true" />
                  {flagged ? '印あり' : 'あとで 見直す'}
                </button>
              </div>
              <p class="ss-qt z-min">{q.stem}</p>
              <div class="ss-opts">
                {opts.map((id, i) => (
                  <button key={id} type="button" class={`ss-op ex-op${pick.includes(id) ? ' on' : ''}`} onClick={() => onChoose(id)} aria-pressed={pick.includes(id)}>
                    <i class="ss-opk">{i + 1}</i>
                    <span class="ss-opt">{q.options.find((o) => o.id === id)?.text}</span>
                  </button>
                ))}
              </div>
              <div class="ex-nav">
                <button type="button" class="z-bo2 ex-prev" onClick={() => onGo(s.at - 1)} disabled={s.at === 0} aria-label="前の問題">
                  <ChevL />
                </button>
                <span class="ex-left">{pk.code}</span>
                <button type="button" class="z-bk ex-next" onClick={() => (last ? onList() : onGo(s.at + 1))}>
                  {last ? '見直しへ' : '次へ'}
                  <Arrow />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function List({ s, blank, armed, onGo, onEnd }: { s: Sitting; blank: number; armed: boolean; onGo: (i: number) => void; onEnd: () => void }) {
  return (
    <div class="ex-list">
      <div class="ex-lh">
        <span>
          未回答 <b class="z-num">{blank}</b>
        </span>
        <span>
          印 <b class="z-num">{s.flags.length}</b>
        </span>
      </div>
      <div class="ex-grid">
        {s.qs.map((id, i) => {
          const a = !!s.picks[id]?.length;
          const f = s.flags.includes(id);
          return (
            <button key={id} type="button" class={`${a ? 'a' : ''}${f ? ' f' : ''}`} onClick={() => onGo(i)} aria-label={`問${i + 1}${a ? '' : '、未回答'}${f ? '、印あり' : ''}`}>
              <span class="z-num">{i + 1}</span>
            </button>
          );
        })}
      </div>
      <button type="button" class={`z-bk ex-end${armed ? ' armed' : ''}`} onClick={onEnd}>
        {armed ? (blank ? `未回答 ${blank}問のまま 採点する` : 'これで 採点する') : '終了して 採点'}
      </button>
    </div>
  );
}

function Result({ pk, g, onClose }: { pk: Pack; g: Graded; onClose: () => void }) {
  const [only, setOnly] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const sp = progress(state.p, pk.id);
  const runs = sp.mocks || [];
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  const r = g.run;
  const passPct = (pk.passingScore / pk.scoreMax) * 100;
  const target = pk.passingScore / pk.scoreMax;
  const asked = useRef(askedOf(pk, g)).current;
  const blanks = asked.filter((x) => x.mark === '').length;
  const missed = asked.filter((x) => x.mark !== 'ok');
  const shown = only ? missed : asked;
  useKey((e) => {
    if (e.key === 'Escape') onClose();
  });
  return (
    <div class="ss ex">
      <div class="ss-top z-grain">
        <div class="ss-bar">
          <button type="button" class="ss-x" onClick={onClose} aria-label="とじる">
            <Close size={16} />
          </button>
        </div>
        <div class="ex-score">
          <span class={`z-tag ${r.pass ? 'z-tag-r' : 'z-tag-w'}`}>{r.pass ? '合格ライン' : `あと ${pk.passingScore - r.score}点`}</span>
          <b class="z-min z-num">
            {r.score}
            <small>/ {pk.scoreMax}</small>
          </b>
        </div>
        <span class="ex-sbar" aria-hidden="true">
          <i style={{ width: `${(r.score / pk.scoreMax) * 100}%` }} />
          <b style={{ left: `${passPct}%` }} />
        </span>
      </div>
      <div class="ss-panel z-light">
        <div class="ss-in">
          <div class="ss-rr">
            <span class="ss-rrl">正解</span>
            <span class="ss-rrv z-num">
              <b>{r.ok}</b>
              <small>
                / {r.n}問{blanks ? ` · 未回答 ${blanks}` : ''}
              </small>
            </span>
          </div>
          <div class="ss-rr">
            <span class="ss-rrl">時間</span>
            <span class="ss-rrt">
              {mins(r.secs)} / {examMinutes(pk, r.n)}分
            </span>
          </div>
          {prev && (
            <div class="ss-rr">
              <span class="ss-rrl">前回</span>
              <span class="ss-rrt">
                {md(prev.d)} · {prev.score} → {r.score}
              </span>
            </div>
          )}
          {g.chapters.map((c) => {
            const p = c.ok / c.asked;
            return (
              <div class="ss-rr" key={c.n}>
                <span class="ss-rrl">第{c.n + 1}章</span>
                <span class="ss-rbar" aria-label={`${c.name} ${c.ok} / ${c.asked}`}>
                  <i class={p < target ? 'lo' : undefined} style={{ width: `${p * 100}%` }} />
                  <b style={{ left: `${target * 100}%` }} />
                </span>
                <span class="ex-cs z-num">
                  {c.ok}/{c.asked}
                </span>
              </div>
            );
          })}

          <div class="ex-rv">
            <div class="ex-rvh" role="tablist" aria-label="見なおす 問題">
              <button type="button" role="tab" aria-selected={only} class={only ? 'on' : ''} onClick={() => setOnly(true)}>
                まちがい {missed.length}
              </button>
              <button type="button" role="tab" aria-selected={!only} class={!only ? 'on' : ''} onClick={() => setOnly(false)}>
                全部 {asked.length}
              </button>
            </div>
            {shown.map((x) => (
              <Review key={x.q.id} x={x} open={open === x.q.id} onToggle={() => setOpen(open === x.q.id ? null : x.q.id)} />
            ))}
          </div>

          <div class="ss-resf">
            <span>{r.pass ? '本番でも この線を 越えれば 合格。' : 'まちがえた問題は、あしたの朝の欠片にも まざります。'}</span>
            <span class="ss-resb">
              {missed.length > 0 && (
                <button type="button" class="z-bo2" onClick={() => go(`session/miss/${Date.now().toString(36)}`, true)}>
                  まちがいを 解きなおす
                </button>
              )}
              <button type="button" class="z-bk" onClick={onClose}>
                とじる
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Asked { q: Question; n: number; mark: 'ok' | 'ng' | ''; pick: string[] }
function askedOf(pk: Pack, g: Graded): Asked[] {
  return g.items.flatMap((x, i) => {
    const q = questionById(pk, x.id);
    return q ? [{ q, n: i + 1, mark: x.mark, pick: x.pick }] : [];
  });
}

function Review({ x, open, onToggle }: { x: Asked; open: boolean; onToggle: () => void }) {
  const text = (id: string) => x.q.options.find((o) => o.id === id)?.text ?? '';
  return (
    <div class={`ex-ri ${x.mark || 'bl'}${open ? ' open' : ''}`}>
      <button type="button" class="ex-rih" onClick={onToggle} aria-expanded={open}>
        <i class="z-num">{x.n}</i>
        <span>{x.q.stem}</span>
        <em>{x.mark === 'ok' ? '正解' : x.mark === 'ng' ? 'ちがう' : '未回答'}</em>
      </button>
      {open && (
        <div class="ex-rib">
          <p class="ex-ok">正解　{x.q.answer.map(text).join('、')}</p>
          {x.mark === 'ng' && <p class="ex-you">あなた　<s>{x.pick.map(text).join('、')}</s></p>}
          <p class="ss-why">{x.q.explanation}</p>
          {x.pick
            .filter((id) => !x.q.answer.includes(id) && x.q.whyWrong?.[id])
            .map((id) => (
              <p key={id} class="ss-why ss-ww">
                「{text(id)}」は、{x.q.whyWrong![id]}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
