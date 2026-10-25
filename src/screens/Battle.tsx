// ボス戦: this week's shadow. Its questions come from the topic it was born from. A right answer cuts,
// a miss only means it dodged (there is no player HP and no losing). 縛鎖 adds its plates: cut them in
// the order data flows and the chain comes off. When its HP runs out the core opens for the last blow.
// Damage stays even if you stop halfway.
import { Fragment } from 'preact';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { Boss, Conf, Pack, Topic } from '../core/types';
import { state } from '../core/store';
import { DEFEAT_XP, answer, bossBattleStarted, bossHit, bossMiss, defeatBoss, logFight } from '../core/actions';
import { BATTLE_QUESTIONS, ENEMY, PLATE_DAMAGE, battleDamage, isCrit, topicShort, weekNumber } from '../core/enemy';
import { backTag, isCorrect, pickDrill, progress } from '../core/study';
import { packOf, questionById, topicById } from '../core/pack';
import { levelFromTotal, need, title } from '../core/game';
import { BUZZ, buzz, sfx } from '../core/sfx';
import { clamp, hashStr, reducedMotion, seeded, shuffle } from '../core/util';
import { bakusaPlates } from '../art/enemies';
import { BossArt, bossWhen, killedEntry } from '../ui/Boss';
import { firstWeek } from '../ui/derive';
import { achievementToasts } from '../ui/slash';
import { toast } from '../ui/fx';
import { back, go } from '../ui/router';
import { useKey, useTimers } from '../ui/hooks';
import { Arrow, Close } from '../ui/icons';

type Phase = 'intro' | 'q' | 'fb' | 'bind' | 'order' | 'core' | 'kill' | 'result';
type PlateId = 'p1' | 'p2' | 'p3' | 'p4';
const PLATES: PlateId[] = ['p1', 'p2', 'p3', 'p4'];
/** a wrong answer comes back once, at most this many times a battle */
const REVENGE_MAX = 2;
/** extra damage on the last plate when no plate was cut out of order */
const PLATE_CRIT = 45;
/** the art is a 320 viewBox drawn 390 wide */
const VB = 390 / 320;

interface Killed { count: number; ach: string[] }
interface Fight {
  phase: Phase;
  queue: string[];
  /** which first-time question each queue entry belongs to (revenge repeats one) */
  slotOf: number[];
  /** how each question went the last time, read when the fight starts (今日 まちがえた …) */
  backs: Record<string, string>;
  marks: ('' | 'ok' | 'ng')[];
  revenge: number;
  qi: number;
  opts: string[];
  pick: string[];
  picked: string[];
  conf: Conf;
  qAt: number;
  ok: boolean;
  crit: boolean;
  dmg: number;
  combo: number;
  best: number;
  hits: number;
  misses: number;
  crits: number;
  correct: number;
  answered: number;
  xp: number;
  dealt: number;
  note: string;
  /** the white part of the HP bar that catches up after a hit */
  lag: number;
  cuts: PlateId[];
  chips: PlateId[];
  obad: number;
  obadId: string;
  oN: number;
  pHit: number;
  pBad: number;
  lastP: PlateId | '';
  lastEv: '' | 'hit' | 'bad';
  pcrit: boolean;
  pdmg: number;
  kstep: number;
  rstep: number;
  t0: number;
  t1: number;
  total0: number;
  killed: Killed | null;
  /** kept on the day for 1日の記録 */
  logged: boolean;
  live: string;
}

const newFight = (hp: number): Fight => ({
  phase: 'intro',
  queue: [],
  slotOf: [],
  backs: {},
  marks: [],
  revenge: 0,
  qi: 0,
  opts: [],
  pick: [],
  picked: [],
  conf: 'maybe',
  qAt: 0,
  ok: false,
  crit: false,
  dmg: 0,
  combo: 0,
  best: 0,
  hits: 0,
  misses: 0,
  crits: 0,
  correct: 0,
  answered: 0,
  xp: 0,
  dealt: 0,
  note: '',
  lag: hp,
  cuts: [],
  chips: [],
  obad: 0,
  obadId: '',
  oN: 0,
  pHit: 0,
  pBad: 0,
  lastP: '',
  lastEv: '',
  pcrit: false,
  pdmg: 0,
  kstep: 0,
  rstep: 0,
  t0: 0,
  t1: 0,
  total0: state.p.game.total,
  killed: null,
  logged: false,
  live: '',
});

/** The battle is drawn on a 390-wide stage scaled to the screen. dy: how much taller (or shorter) than 844 it is. */
function useStage() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pc = box.w >= 1100;
  const s = Math.min(pc ? Math.min(box.h / 844, 1.1) : Math.min(box.w / 390, 1.12), box.h / 600);
  const H = box.h / s;
  return { ref, s, H, dy: H - 844, hw: box.w / 2 / s };
}

type Tf = { s: number; t: number };
/** Where the art sits in each phase, so the HUD and the panels never cover the shadow. */
function artTf(mode: 'i' | 'q' | 'o', dy: number): Tf {
  if (mode === 'q') {
    const s = clamp((297 + dy) / 390, 0.34, 0.9);
    return { s, t: 262 + dy - 390 * s };
  }
  if (mode === 'o') {
    const s = clamp((350 + dy) / 390, 0.3, 1);
    return { s, t: 322 + dy - 390 * s };
  }
  return { s: clamp((408 + dy) / 408, 0.55, 1), t: Math.max(0, dy) / 2 };
}
/** A point drawn on the unscaled art (stage units) to where it is now. */
const toStage = (tf: Tf, x: number, y: number): [number, number] => [195 + (x - 195) * tf.s, 60 + (y - 60) * tf.s + tf.t];

const px = (n: number) => `${Math.round(n * 10) / 10}px`;
const pctOf = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(1) : 0}%`;
const nameSize = (s: string) => (s.length <= 7 ? 40 : s.length <= 9 ? 34 : 28);
const elapsed = (ms: number) => {
  const secs = Math.max(1, Math.round(ms / 1000));
  return (secs >= 60 ? `${Math.floor(secs / 60)}分` : '') + `${secs % 60}秒`;
};

/** The chips are dealt from the boss and the battle number, so they never start in the right order. */
function dealChips(b: Boss): PlateId[] {
  const ids = shuffle(PLATES, seeded(hashStr(b.id) + b.battles * 7919));
  return ids.join() === PLATES.join() ? [ids[1], ids[0], ids[3], ids[2]] : ids;
}

function Empty({ head, sub, zukan }: { head: string; sub: string; zukan?: string }) {
  useKey((e) => {
    if (e.key === 'Escape' || e.key === 'Enter') back('today');
  });
  return (
    <div class="k-none z-grain">
      <div class="k-none-in">
        <span class="z-tag z-tag-w">今週の敵</span>
        <b class="z-min">{head}</b>
        <p>{sub}</p>
        <div class="k-none-acts">
          {zukan && (
            <a href={`#/zukan/${zukan}`} class="k-btn k-bo">
              図鑑で見る
            </a>
          )}
          <button type="button" class="k-btn k-bw" onClick={() => back('today')}>
            今日に戻る
          </button>
        </div>
      </div>
    </div>
  );
}

export function Battle({ date }: { date: string }) {
  const b = state.p.boss.cur;
  const pk = packOf(b?.certId);
  const deadAtStart = useRef(killedEntry(b));
  if (!b) return <Empty head="まだ 姿がない。" sub="問題集を 読みこむと、弱点から 生まれます。" />;
  if (deadAtStart.current) return <Empty head={`${b.name}は、もう 図鑑の中。`} sub="次の影は、月曜に 生まれる。" zukan={b.id} />;
  if (!pk) return <Empty head="問題集を 読みこんでいます…" sub="つながると、すぐに 始められます。" />;
  return <Fighting pk={pk} b={b} date={date} />;
}

function Fighting({ pk, b, date }: { pk: Pack; b: Boss; date: string }) {
  const F = useRef<Fight>(newFight(b.hp)).current;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const upd = (patch: Partial<Fight>) => {
    Object.assign(F, patch);
    bump(0);
  };
  const later = useTimers();
  const killT = useRef<ReturnType<typeof setTimeout>>();
  const panel = useRef<HTMLElement>(null);
  const scars = useRef(Math.min(3, Math.floor((1 - b.hp / b.max) * 4))).current;
  const { ref, s, H, dy, hw } = useStage();

  const meta = ENEMY[b.type];
  const topic = topicById(pk, b.topicId) as Topic | undefined;
  const order = b.type === 'bakusa' && topic?.order && b.terms.length >= 4 ? topic.order : undefined;
  const base = order ? BATTLE_QUESTIONS - 1 : BATTLE_QUESTIONS;
  const total = base + (order ? 1 : 0);
  const week = weekNumber(b, firstWeek());
  const ph = F.phase;
  const q = ph === 'q' || ph === 'fb' ? questionById(pk, F.queue[F.qi]) : undefined;
  const multi = !!q && q.type === 'multi';

  useEffect(() => {
    const t = setTimeout(() => sfx('appear'), 40);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [F.qi, ph === 'fb']);

  const lagTo = () => later(() => upd({ lag: state.p.boss.cur?.hp ?? 0 }), 420);

  const showQ = (i: number) => {
    const nq = questionById(pk, F.queue[i])!;
    const revenge = i >= base;
    upd({
      phase: 'q',
      qi: i,
      opts: shuffle(nq.options.map((o) => o.id)),
      pick: [],
      picked: [],
      conf: 'maybe',
      qAt: Date.now(),
      live: `${revenge ? 'リベンジ' : `第${F.slotOf[i] + 1}問`}。${nq.stem}`,
    });
  };

  const toCore = () => {
    sfx('unbind');
    buzz(BUZZ.hit);
    upd({ phase: 'core', combo: 0, live: order ? '核が開いた。本体を斬って、とどめを刺す' : '体力が尽きた。本体を斬って、とどめを刺す' });
  };

  const keep = () => {
    if (F.logged) return;
    F.logged = true;
    logFight({ boss: b.name, n: F.answered, ok: F.correct, dmg: F.dealt, xp: F.xp, kill: !!F.killed }, date);
  };

  const result = () => {
    if (F.phase === 'result') return;
    clearTimeout(killT.current);
    keep();
    upd({ phase: 'result', rstep: 0, t1: F.t1 || Date.now(), live: F.killed ? `討伐しました。経験値 ${F.xp}。決め手が図鑑に残りました` : `${F.dealt} 削りました。残りの体力は ${state.p.boss.cur?.hp ?? 0}` });
    sfx(F.killed ? 'reward' : 'soft');
    const up = levelFromTotal(state.p.game.total).lv > levelFromTotal(F.total0).lv;
    if (reducedMotion()) {
      upd({ rstep: 3 });
    } else {
      later(() => upd({ rstep: 1 }), 760);
      later(() => {
        if (up) {
          sfx('sting');
          buzz(BUZZ.lv);
        }
        upd({ rstep: 2 });
        later(() => upd({ rstep: 3 }), 60);
      }, 1380);
    }
    if (F.killed?.ach.length) achievementToasts(F.killed.ach, 2400);
  };

  const bind = () => {
    sfx('bind');
    buzz(BUZZ.lv);
    upd({ phase: 'bind', combo: 0, chips: dealChips(b), live: `${meta.name}が鎖を締めた。体に巻いた札を、データが流れる順に斬る` });
  };

  /** After the questions: the plates, the finishing blow, or the result. */
  const afterQuestions = () => {
    if ((state.p.boss.cur?.hp ?? 0) <= 0) toCore();
    else if (order) bind();
    else result();
  };

  const start = () => {
    if (F.phase !== 'intro') return;
    sfx('tock');
    buzz(BUZZ.tap);
    bossBattleStarted();
    const now = Date.now();
    if (b.hp <= 0) {
      upd({ t0: now });
      toCore();
      return;
    }
    const sp = progress(state.p, pk.id);
    const qs = pickDrill(pk, sp, date, { topicId: b.topicId }, base);
    const backs = Object.fromEntries(qs.map((x) => [x.id, backTag(sp, x.id, date)]));
    Object.assign(F, { queue: qs.map((x) => x.id), slotOf: qs.map((_, i) => i), backs, marks: qs.map(() => ''), t0: now });
    if (!qs.length) afterQuestions();
    else showQ(0);
  };

  const submit = (pick: string[]) => {
    if (F.phase !== 'q' || !q || !pick.length) return;
    const ok = isCorrect(q, pick);
    const ms = Date.now() - F.qAt;
    const prev = F.combo;
    const r = answer(pk, q, pick, ok, F.conf, ms, 'boss', prev, date);
    const slot = F.slotOf[F.qi];
    const marks = F.marks.slice();
    if (ok) {
      const crit = isCrit(b.type, q, F.conf, ms, topic);
      const before = state.p.boss.cur?.hp ?? 0;
      const after = bossHit(battleDamage(prev, crit), crit, date);
      const dmg = before - after;
      const combo = prev + 1;
      marks[slot] = 'ok';
      upd({
        phase: 'fb',
        picked: pick,
        ok: true,
        crit,
        dmg,
        combo,
        best: Math.max(F.best, combo),
        hits: F.hits + 1,
        crits: F.crits + (crit ? 1 : 0),
        correct: F.correct + 1,
        answered: F.answered + 1,
        xp: F.xp + r.xp,
        dealt: F.dealt + dmg,
        note: r.note,
        marks,
        live: `${crit ? '会心。' : '正解。'}${dmg} のダメージ。${after <= 0 ? '体力が尽きた' : `残りの体力 ${after}`}`,
      });
      lagTo();
      sfx('cut', Math.min(3, combo));
      buzz(crit ? BUZZ.crit : BUZZ.three);
      if (combo >= 2) sfx('combo');
    } else {
      bossMiss();
      marks[slot] = 'ng';
      const again = F.revenge < REVENGE_MAX && F.slotOf.filter((x) => x === slot).length === 1;
      const right = q.answer.map((id) => q.options.find((o) => o.id === id)?.text ?? '').join('、');
      upd({
        phase: 'fb',
        picked: pick,
        ok: false,
        crit: false,
        dmg: 0,
        combo: 0,
        misses: F.misses + 1,
        answered: F.answered + 1,
        xp: F.xp + r.xp,
        note: again ? 'このあと リベンジで もう一度 出ます' : r.note,
        marks,
        queue: again ? [...F.queue, q.id] : F.queue,
        slotOf: again ? [...F.slotOf, slot] : F.slotOf,
        revenge: F.revenge + (again ? 1 : 0),
        live: `かわされた。正解は ${right}`,
      });
      sfx('miss');
      buzz(BUZZ.slash);
    }
  };

  const choose = (id: string) => {
    if (F.phase !== 'q' || !q) return;
    if (!multi) {
      submit([id]);
      return;
    }
    sfx('tick');
    upd({ pick: F.pick.includes(id) ? F.pick.filter((x) => x !== id) : [...F.pick, id] });
  };

  const setConf = (c: Conf) => {
    if (F.phase !== 'q' || F.conf === c) return;
    sfx('tock');
    upd({ conf: c });
  };

  const next = () => {
    if (F.phase !== 'fb') return;
    if ((state.p.boss.cur?.hp ?? 0) <= 0) {
      toCore();
      return;
    }
    if (F.qi + 1 < F.queue.length) {
      sfx('tock');
      showQ(F.qi + 1);
      return;
    }
    afterQuestions();
  };

  const toOrder = () => {
    if (F.phase !== 'bind' || !order) return;
    sfx('tock');
    buzz(BUZZ.tap);
    upd({ phase: 'order', live: `第${total}問。${order.prompt}` });
  };

  const cut = (id: PlateId) => {
    if (F.phase !== 'order' || !order || F.cuts.includes(id)) return;
    const label = (pid: PlateId) => b.terms[PLATES.indexOf(pid)];
    if (id === PLATES[F.cuts.length]) {
      const cuts = [...F.cuts, id];
      const done = cuts.length === 4;
      const crit = done && F.obad === 0;
      const before = state.p.boss.cur?.hp ?? 0;
      const after = bossHit(PLATE_DAMAGE + (crit ? PLATE_CRIT : 0), crit, date);
      const dmg = before - after;
      upd({
        cuts,
        pdmg: dmg,
        pcrit: crit,
        oN: F.oN + 1,
        pHit: F.pHit + 1,
        hits: F.hits + 1,
        crits: F.crits + (crit ? 1 : 0),
        dealt: F.dealt + dmg,
        lastP: id,
        lastEv: 'hit',
        obadId: '',
        live: `${label(id)}を斬った。${done ? `${crit ? '会心。' : ''}鎖が解けた` : ''}`,
      });
      lagTo();
      sfx('cut', crit ? 3 : 1);
      buzz(crit ? BUZZ.crit : BUZZ.slash);
      if (done) later(() => ((state.p.boss.cur?.hp ?? 0) <= 0 ? toCore() : result()), crit ? 900 : 700);
    } else {
      upd({ obad: F.obad + 1, obadId: id, oN: F.oN + 1, pBad: F.pBad + 1, lastP: id, lastEv: 'bad', live: '順がちがう。鎖が締まった。ダメージは受けない' });
      sfx('chain');
      buzz([8, 30, 8]);
      later(() => upd({ obadId: '' }), 420);
    }
  };

  const kill = () => {
    if (F.phase !== 'core') return;
    const r = defeatBoss(F.answered, F.correct, date);
    const killed = { count: r?.count ?? state.p.zukan.length, ach: r?.ach ?? [] };
    const xp = F.xp + (r ? DEFEAT_XP : 0);
    const t1 = Date.now();
    if (reducedMotion()) {
      upd({ killed, xp, t1, lag: 0 });
      result();
      return;
    }
    upd({ phase: 'kill', kstep: 0, killed, xp, t1, lag: 0, live: 'とどめ' });
    sfx('kill1');
    buzz(30);
    later(() => {
      upd({ kstep: 1 });
      sfx('kill2');
      buzz(BUZZ.kill);
    }, 1050);
    later(() => upd({ kstep: 2, live: b.lastWords }), 1170);
    killT.current = later(result, 3100);
  };

  const skipKill = () => {
    if (F.phase === 'kill' && F.kstep >= 2) result();
  };

  const quit = () => {
    sfx('tock');
    if (F.phase !== 'intro') keep();
    const hp = state.p.boss.cur?.hp ?? 0;
    if (F.dealt > 0 && !F.killed) toast(`${F.dealt} 削って 退いた · 残りの体力は ${hp}`);
    back('today');
  };

  const again = () => {
    sfx('tock');
    Object.assign(F, newFight(state.p.boss.cur?.hp ?? 0));
    bump(0);
  };

  useKey((e) => {
    const k = e.key;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'Escape') {
      if (F.phase === 'result') go('today');
      else if (F.phase !== 'kill') quit();
      return;
    }
    const n = /^[1-4]$/.test(k) ? Number(k) - 1 : -1;
    const enter = k === 'Enter' || k === ' ';
    switch (F.phase) {
      case 'intro':
        if (enter) start();
        break;
      case 'q':
        if (n >= 0 && F.opts[n]) choose(F.opts[n]);
        else if (k === 'Enter' && multi) submit(F.pick);
        else if (k === 'q') setConf('sure');
        else if (k === 'w') setConf('maybe');
        else if (k === 'e') setConf('guess');
        else return;
        break;
      case 'fb':
        if (enter) next();
        else return;
        break;
      case 'bind':
        if (enter) toOrder();
        break;
      case 'order':
        if (n >= 0 && F.chips[n]) cut(F.chips[n]);
        else return;
        break;
      case 'core':
        if (enter) kill();
        break;
      case 'kill':
        skipKill();
        break;
      case 'result':
        if (k === 'Enter') go('today');
        else return;
        break;
    }
    e.preventDefault();
  });

  /* ---------- layout ---------- */
  const inQ = ph === 'q' || ph === 'fb';
  const inO = ph === 'order' || ph === 'core';
  const mode = inQ ? 'q' : inO || ph === 'kill' || ph === 'result' ? 'o' : 'i';
  const tf = artTf(mode, dy);
  const [cx, cy] = toStage(tf, 195, 238);
  const hp = state.p.boss.cur?.hp ?? 0;
  const fb = ph === 'fb';
  const plateAt = (id: PlateId) => {
    const [vx, vy] = bakusaPlates()[id];
    return toStage(tf, vx * VB, 60 + vy * VB);
  };
  const [ppx, ppy] = F.lastP ? plateAt(F.lastP) : [cx, cy];
  const [, bodyTop] = toStage(tf, 195, 77);
  const [, bodyBot] = toStage(tf, 195, 433);

  const artCls = ['k-ai', ...F.cuts.map((c) => `cut-${c}`), ph === 'bind' ? 'is-bind' : '', F.pBad ? (F.pBad % 2 ? 'tA' : 'tB') : '', ph === 'core' || ph === 'kill' ? 'is-open' : '']
    .filter(Boolean)
    .join(' ');
  const mCls =
    fb && F.ok ? (F.hits % 2 ? 'hitA' : 'hitB') : fb && !F.ok ? (F.misses % 2 ? 'dodgeA' : 'dodgeB') : ph === 'order' && F.lastEv === 'bad' ? (F.pBad % 2 ? 'sqA' : 'sqB') : ph === 'order' && F.lastEv === 'hit' ? (F.hits % 2 ? 'hitA' : 'hitB') : '';

  const slot = F.slotOf[F.qi] ?? 0;
  const revenge = F.qi >= base;
  const left = Math.max(0, F.queue.length - F.qi - (fb ? 1 : 0));
  const reach = (4 - F.cuts.length) * PLATE_DAMAGE + (F.obad ? 0 : PLATE_CRIT);
  const slotText = inQ
    ? hp <= 0
      ? '体力が尽きた。とどめを刺せる'
      : left === 0
        ? order
          ? '次は、札を斬る'
          : '問いは、ここまで'
        : order
          ? `あと ${left}問で、札が現れる`
          : `あと ${left}問 · 会心は「${meta.crit}」`
    : ph === 'core'
      ? order
        ? '核が開いた。とどめを刺せる'
        : '体力が尽きた。とどめを刺せる'
      : hp <= reach
        ? '鎖を解くと、核が開く'
        : `札を一枚斬るごとに ${PLATE_DAMAGE}`;
  const hot = (inQ && hp <= 0) || ph === 'core';

  const optText = (id: string) => q?.options.find((o) => o.id === id)?.text ?? '';
  const optN = (id: string) => F.opts.indexOf(id) + 1;
  const ww = q && !F.ok ? F.picked.map((id) => q.whyWrong?.[id] && `「${optText(id)}」は、${q.whyWrong[id]}`).filter(Boolean) : [];
  const nextRed = fb && (hp <= 0 || (F.qi + 1 >= F.queue.length && !!order));
  const nextLabel = !fb ? '' : hp <= 0 ? 'とどめへ' : F.qi + 1 < F.queue.length ? '次へ' : order ? '鎖が来る' : '結果へ';
  const resHead = F.ok ? (F.crit ? '会心' : hp <= 0 ? '崩した' : '正解') : 'かわされた';

  const steps = order?.steps ?? [];
  const path = F.cuts.map((c) => b.terms[PLATES.indexOf(c)]).join(' → ');
  let mh = '札は四枚。流れの順に斬る。';
  let ms = '最初に起きることから、順に。';
  let mc = '';
  if (F.lastEv === 'bad') {
    mh = '順がちがう。鎖が締まった。';
    ms = 'ダメージは受けない。データが どこから来て、どこへ しまわれるかを 思い出す。';
    mc = 'is-bad';
  } else if (F.cuts.length === 4) {
    mh = F.pcrit ? '会心。一度も誤らずに斬った。' : '鎖が解けた。';
    ms = path;
  } else if (F.cuts.length) {
    mh = '斬った。次の札へ。';
    ms = `${path} → …`;
  }

  const lastTail = b.lastWords.includes('……') ? `……${b.lastWords.split('……').pop()}` : b.lastWords;
  const killSub = order ? `最後は、${order.last}` : `決め手 · ${topic ? topicShort(topic) : meta.name}`;

  return (
    <div ref={ref} class="k-wrap z-grain">
      <div
        class={`k-root ph-${mode === 'i' ? (ph === 'bind' ? 'bind' : 'intro') : mode}${ph === 'kill' || ph === 'result' ? ' ph-end' : ''}`}
        style={{ height: px(H), transform: `scale(${s})`, '--hw': px(hw), '--dy': px(dy) }}
        lang="ja"
      >
        <div class="k-top" style={{ opacity: ph === 'result' || ph === 'kill' || ph === 'bind' ? 0 : 1 }}>
          <button type="button" class="k-x" onClick={quit}>
            <Close size={14} />
            {ph === 'intro' ? 'もどる' : 'やめる'}
          </button>
          <span class="k-tr z-num">{ph === 'intro' ? `${total}問 · 約${Math.round(total * 1.5)}分` : inQ ? `正解 ${F.correct} / ${base}` : ''}</span>
        </div>

        <div class="k-art" style={{ transform: `translateY(${px(tf.t)}) scale(${tf.s.toFixed(4)})` }} aria-hidden="true">
          <div class={`k-mi ${mCls}`}>
            <div class={artCls}>
              <BossArt b={b} class="k-bsv" opts={b.type === 'bakusa' ? { scars, plates: !!order } : undefined} />
            </div>
          </div>
          {((fb && F.ok) || (inO && F.lastEv === 'hit')) && <span key={`f${F.hits}`} class="k-flash" />}
        </div>
        {ph === 'core' && (
          <>
            <span class="k-ring" aria-hidden="true" style={{ left: px(cx - 46.5 * tf.s), top: px(cy - 46.5 * tf.s), width: px(93 * tf.s), height: px(93 * tf.s) }} />
            <button type="button" class="k-bodybtn" onClick={kill} aria-label="本体を斬って、とどめを刺す" style={{ left: px(cx - 50 * tf.s), top: px(bodyTop), width: px(100 * tf.s), height: px(bodyBot - bodyTop) }} />
          </>
        )}

        <div class="k-fx" aria-hidden="true">
          {fb && F.ok && (
            <>
              <span key={`s${F.hits}`} class="k-sl" style={{ left: px(cx - 195), top: px(cy + 132) }} />
              {F.combo >= 2 && <span key={`s2${F.hits}`} class="k-sl k-sl2" style={{ left: px(cx - 195), top: px(cy + 114) }} />}
              {F.combo >= 3 && <span key={`s3${F.hits}`} class="k-sl k-sl3" style={{ left: px(cx - 195), top: px(cy + 150) }} />}
              <div key={`d${F.hits}`} class="k-dmg" style={{ left: px(cx + 41), top: px(cy - 52) }}>
                <b class="z-min z-num">−{F.dmg}</b>
                {F.crit && <span class="z-tag z-tag-r k-dtag">会心</span>}
                {!F.crit && F.combo >= 2 && <span class="z-tag z-tag-w k-dtag">{F.combo}連撃</span>}
              </div>
            </>
          )}
          {fb && !F.ok && (
            <>
              <span key={`m${F.misses}`} class="k-ms" style={{ left: px(cx - 25), top: px(cy + 140) }} />
              <span key={`g${F.misses}`} class="k-dodge z-tag z-tag-w" style={{ left: px(cx - 173), top: px(cy - 42) }}>
                かわされた
              </span>
            </>
          )}
          {inO && F.lastEv === 'hit' && (
            <>
              <span key={`p${F.pHit}`} class="k-psl" style={{ left: px(ppx), top: px(ppy) }} />
              {F.pcrit && <span key={`pp${F.pHit}`} class="k-psl k-psl2" style={{ left: px(ppx), top: px(ppy) }} />}
              {F.pdmg > 0 && (
                <div key={`pd${F.pHit}`} class="k-dmg k-pdmg" style={{ left: px(ppx > 195 ? ppx - 10 : ppx - 62), top: px(ppy + 16) }}>
                  <b class="z-min z-num">−{F.pdmg}</b>
                  {F.pcrit && <span class="z-tag z-tag-r k-dtag">会心</span>}
                </div>
              )}
            </>
          )}
          {ph === 'order' && F.lastEv === 'bad' && (
            <span key={`pb${F.pBad}`} class="k-dodge z-tag z-tag-w" style={{ left: px(clamp(ppx - 60, 12, 250)), top: px(ppy - 52) }}>
              鎖が締まった
            </span>
          )}
        </div>
        {inQ && F.combo >= 2 && (
          <div key={`c${F.combo}`} class="k-combo" aria-hidden="true">
            <b class="z-min z-num">{F.combo}</b>
            <span>連撃</span>
          </div>
        )}

        <div class="k-hud" style={{ top: px((inO ? 382 : 322) + dy) }} aria-label={`${b.name}、体力 ${hp}。${slotText}`}>
          <div class="k-hud-h">
            <b class="z-min">{b.name}</b>
            <span class="k-sp" />
            <span class="k-hpl">体力</span>
            <b class="z-min z-num k-hpn">{hp}</b>
          </div>
          <div class="k-hp">
            <b style={{ width: pctOf(F.lag, b.max) }} />
            <span style={{ width: pctOf(hp, b.max) }} />
          </div>
          <div class="k-hud-s">
            <span class="k-slots">
              {F.marks.map((m, i) => (
                <i key={i} class={`q${m === 'ok' ? ' on' : m === 'ng' ? ' ng' : ''}${inQ && ph === 'q' && slot === i ? ' now' : ''}${fb && F.ok && slot === i ? ' pop' : ''}`} />
              ))}
              {order && (
                <i class={`lb${F.cuts.length === 4 ? ' on pop' : ph === 'order' ? ' now' : ''}`}>
                  <b>札</b>
                </i>
              )}
              <i class={`lb${ph === 'core' ? ' now' : ''}`}>
                <b>核</b>
              </i>
            </span>
            <span class={`k-slt${hot ? ' hot' : ''}`}>{slotText}</span>
          </div>
        </div>

        <div class="k-enc" style={{ top: px(dy) }}>
          <div class="k-ithin" />
          <div class="k-iband" />
          <div class="k-iname">
            <span class="z-tag z-tag-k k-pop5">
              第{week}週の敵 · {meta.name}の型
            </span>
            <b class="z-min" style={{ fontSize: px(nameSize(b.name)) }}>
              {b.name}
            </b>
          </div>
          <p class="k-iline z-min">「{b.taunt}」</p>
          <p class="k-iborn">{b.born}</p>
          <div class="k-istats">
            <div>
              <b class="z-min z-num">{total}問</b>
              <span>{order ? '最後は 札の順番' : `会心：${meta.crit}`}</span>
            </div>
            <div>
              <b class="z-min z-num">約{Math.round(total * 1.5)}分</b>
              <span>途中でやめても 残る</span>
            </div>
            <div>
              <b class="z-min z-num">{b.hp}</b>
              <span>体力 / {b.max}</span>
            </div>
          </div>
          <button type="button" class="k-btn k-bw k-igo" onClick={start} tabIndex={ph === 'intro' ? 0 : -1}>
            {b.hp <= 0 ? 'とどめを刺す' : '挑む'}
            <Arrow size={16} />
          </button>
        </div>

        {ph === 'bind' && order && (
          <div class="k-bind" role="status" style={{ top: px(dy) }}>
            <div class="k-ithin" />
            <div class="k-iband" />
            <div class="k-iname">
              <span class="z-tag z-tag-w k-pop1">鎖が来る</span>
              <b class="z-min">
                {meta.name}が、
                <br />
                鎖を締めた。
              </b>
            </div>
            <p class="k-iline z-min">「……順を知らぬ者に、この鎖は解けぬ。」</p>
            <p class="k-iborn">体に巻いた札を、データが流れる順に斬ると 鎖が解ける。順をまちがえても、こちらが傷つくことはない。</p>
            <button type="button" class="k-btn k-bw k-igo" onClick={toOrder}>
              札を斬る
              <Arrow size={16} />
            </button>
          </div>
        )}

        <section ref={panel} class="k-panel z-light" style={{ top: px(404 + dy) }} aria-label="問題" aria-hidden={!inQ}>
          {q && (
            <>
              <div key={`q${F.qi}`} class="k-qin">
                <div class="k-qh">
                  <span class="z-tag z-tag-k">{revenge ? 'リベンジ' : `第${slot + 1}問`}</span>
                  {!revenge && F.backs[q.id] && <span class="z-tag z-tag-r">{F.backs[q.id]}</span>}
                  {multi && <span class="k-mtag">{q.answer.length}つ えらぶ</span>}
                  <span class="k-sp" />
                  {ph === 'q' && (
                    <div class="k-conf" role="radiogroup" aria-label="自信">
                      <span>自信</span>
                      {(
                        [
                          ['sure', '確実'],
                          ['maybe', 'たぶん'],
                          ['guess', '勘'],
                        ] as const
                      ).map(([c, l]) => (
                        <button key={c} type="button" role="radio" aria-checked={F.conf === c} onClick={() => setConf(c)}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p class="k-q">{q.stem}</p>
              </div>
              {ph === 'q' && (
                <div key={`ch${F.qi}`} class="k-chl">
                  {F.opts.map((id, i) => {
                    const on = multi && F.pick.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        class={`k-ch k-chs${on ? ' on' : ''}`}
                        style={{ animationDelay: `${(0.06 + i * 0.04).toFixed(2)}s` }}
                        onClick={() => choose(id)}
                        aria-pressed={multi ? on : undefined}
                        aria-label={`${i + 1}、${optText(id)}`}
                      >
                        <span class="k-chn">{i + 1}</span>
                        <span class="k-cht">{optText(id)}</span>
                      </button>
                    );
                  })}
                  {multi && (
                    <button type="button" class="k-btn k-bk k-msub" disabled={!F.pick.length} onClick={() => submit(F.pick)}>
                      {F.pick.length ? `${F.pick.length}つで 決める` : `${q.answer.length}つ えらんでから`}
                    </button>
                  )}
                </div>
              )}
              {fb && (
                <div key={`fb${F.qi}`} class="k-fb">
                  <div class="k-fbh">
                    <span class={`k-res ${F.ok ? 'ok' : 'ng'}`}>
                      <b class="z-min">{resHead}</b>
                    </span>
                    <b class="z-min z-num k-fbd">{F.ok ? `−${F.dmg}` : '正解はこちら'}</b>
                    {F.ok && F.combo >= 2 && <span class="k-fbc">{F.combo}連撃</span>}
                  </div>
                  {q.answer.map((id) => (
                    <div key={id} class="k-ans">
                      <span class="k-chn">{optN(id)}</span>
                      <b>{optText(id)}</b>
                    </div>
                  ))}
                  {!F.ok && (
                    <span class="k-your">
                      あなたの答え　{F.picked.map(optN).join('・')}　<s>{F.picked.map(optText).join('、')}</s>
                    </span>
                  )}
                  <p class="k-why">{q.explanation}</p>
                  {ww.map((t) => (
                    <p key={t} class="k-why k-ww">
                      {t}
                    </p>
                  ))}
                  <div class="k-fbf">
                    <span class="k-note">{F.note}</span>
                    <button type="button" class={`k-btn ${nextRed ? 'k-br' : 'k-bk'} k-next`} onClick={next}>
                      {nextLabel}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section class="k-opanel z-light" style={{ top: px(466 + dy) }} aria-label={ph === 'core' ? 'とどめ' : '札'} aria-hidden={!inO}>
          {ph === 'order' && order && (
            <>
              <div class="k-qin">
                <div class="k-qh">
                  <span class="z-tag z-tag-k">第{total}問</span>
                  <span class="z-tag z-tag-r">{meta.name}の札</span>
                  <span class="k-sp" />
                  <b class="z-min z-num k-oprog">{F.cuts.length} / 4</b>
                </div>
                <p class="k-q k-oq">{order.prompt}</p>
              </div>
              <div class="k-ochips">
                {F.chips.map((id, i) => {
                  const at = F.cuts.indexOf(id);
                  const label = b.terms[PLATES.indexOf(id)];
                  return (
                    <button
                      key={id}
                      type="button"
                      class={`k-oc${at >= 0 ? ' is-cut' : ''}${F.obadId === id ? ' is-bad' : ''}${label.length > 9 ? ' k-oc-l' : label.length > 7 ? ' k-oc-m' : ''}`}
                      onClick={() => cut(id)}
                      aria-label={`${i + 1}、${label}${at >= 0 ? `、${at + 1}番目に斬った` : ''}`}
                      aria-disabled={at >= 0}
                    >
                      <i />
                      <span>{label}</span>
                      <em class="z-min">{at >= 0 ? at + 1 : ''}</em>
                    </button>
                  );
                })}
              </div>
              <div key={`o${F.oN}`} class={`k-omsg ${mc}`} role="status">
                <b>{mh}</b>
                <span>{ms}</span>
              </div>
            </>
          )}
          {ph === 'core' && (
            <>
              <div class="k-qin">
                <div class="k-qh">
                  <span class="z-tag z-tag-r">とどめ</span>
                  <span class="z-tag z-tag-k">{order ? (F.pcrit ? '会心' : F.cuts.length === 4 ? '鎖が解けた' : '体力が尽きた') : '体力が尽きた'}</span>
                  <span class="k-sp" />
                  {order && <b class="z-min z-num k-oprog">{F.cuts.length === 4 ? '4 / 4' : ''}</b>}
                </div>
                <p class="k-q">{order ? `核が開いた。残るは本体 ─ 最後の「${order.last}」。` : `${b.name}の体力が尽きた。最後の一太刀を。`}</p>
                {order && (
                  <p class="k-path">
                    {steps.map((st) => (
                      <Fragment key={st}>
                        <s>{st}</s>→
                      </Fragment>
                    ))}
                    <b class="z-min">本体</b>
                  </p>
                )}
              </div>
              <button type="button" class="k-btn k-br k-kgo k-qin" onClick={kill} style={{ animationDelay: '.12s' }}>
                本体を斬る ─ とどめ
              </button>
              <span class="k-khint">敵の体を押しても斬れます</span>
            </>
          )}
        </section>

        {ph === 'kill' && (
          <div class={`k-kill${F.kstep >= 1 ? ' cut' : ''}${F.kstep >= 2 ? ' split' : ''}`} role="status" aria-label="とどめ" onClick={skipKill}>
            <div class="k-kbg" />
            <div class="k-kin" style={{ top: px(dy / 2) }}>
              <div class="k-kh k-kh-t">
                <div class="k-kart">
                  <BossArt b={b} opts={b.type === 'bakusa' ? { plates: false, broken: true } : undefined} />
                </div>
              </div>
              <div class="k-kh k-kh-b">
                <div class="k-kart">
                  <BossArt b={b} opts={b.type === 'bakusa' ? { plates: false, broken: true } : undefined} />
                </div>
              </div>
              <div class="k-kthin" />
              <div class="k-kband" />
              <div class="k-ktx">
                <b class="z-min">とどめ</b>
              </div>
              <span class="k-kslash" />
              <div class="k-kflash" />
              <p class="k-kq">
                <b class="z-min" style={{ fontSize: lastTail.length > 14 ? '19px' : undefined }}>
                  「{lastTail}」
                </b>
                <span>{killSub}</span>
                <i />
              </p>
            </div>
          </div>
        )}

        {ph === 'result' && <Result F={F} b={b} topic={topic} date={date} order={!!order} onAgain={again} />}
        <div class="z-sr" aria-live="polite">
          {F.live}
        </div>
      </div>
      <Keys phase={ph} multi={multi} />
    </div>
  );
}

function Keys({ phase, multi }: { phase: Phase; multi: boolean }) {
  const keys: [string, string][] =
    phase === 'intro'
      ? [['Enter', '挑む'], ['Esc', 'もどる']]
      : phase === 'q'
        ? [['1–4', multi ? 'えらぶ' : '答える'], ...(multi ? [['Enter', '決める'] as [string, string]] : []), ['Q W E', '自信'], ['Esc', 'やめる']]
        : phase === 'fb'
          ? [['Enter', '次へ'], ['Esc', 'やめる']]
          : phase === 'bind'
            ? [['Enter', '札を斬る']]
            : phase === 'order'
              ? [['1–4', '札を斬る'], ['Esc', 'やめる']]
              : phase === 'core'
                ? [['Enter', 'とどめ']]
                : phase === 'result'
                  ? [['Enter', '今日に戻る']]
                  : [];
  if (!keys.length) return null;
  return (
    <div class="k-keys" aria-hidden="true">
      {keys.map(([k, l]) => (
        <span key={k}>
          <kbd>{k}</kbd>
          {l}
        </span>
      ))}
    </div>
  );
}

function Result({ F, b, topic, date, order, onAgain }: { F: Fight; b: Boss; topic?: Topic; date: string; order: boolean; onAgain: () => void }) {
  const meta = ENEMY[b.type];
  const week = weekNumber(b, firstWeek());
  const hp = state.p.boss.cur?.id === b.id ? state.p.boss.cur.hp : b.hp;
  const lv0 = levelFromTotal(F.total0);
  const lv1 = levelFromTotal(state.p.game.total);
  const up = lv1.lv > lv0.lv;
  const r = F.rstep;
  const showNew = up && r >= 2;
  const lv = showNew || !up ? lv1.lv : lv0.lv;
  const barPct = !up ? (r >= 1 ? lv1.xp / need(lv1.lv) : lv0.xp / need(lv0.lv)) : r >= 3 ? lv1.xp / need(lv1.lv) : r >= 2 ? 0 : r >= 1 ? 1 : lv0.xp / need(lv0.lv);
  const xpText = !up ? (r >= 1 ? `${lv1.xp} / ${need(lv1.lv)}` : `${lv0.xp} / ${need(lv0.lv)}`) : showNew ? `${lv1.xp} / ${need(lv1.lv)}` : r >= 1 ? `${need(lv0.lv)} / ${need(lv0.lv)}` : `${lv0.xp} / ${need(lv0.lv)}`;
  const short = topic ? topicShort(topic) : meta.name;
  const steps = topic?.order?.steps ?? [];
  const k = F.killed;
  const sum = [`正解 ${F.correct} / ${F.answered}`, order && F.cuts.length === 4 ? (F.obad ? `札で ${F.obad}回 迷った` : '札は 一度で') : '', F.t0 ? elapsed((F.t1 || Date.now()) - F.t0) : '']
    .filter(Boolean)
    .join(' · ');

  const reflect: string[] = [];
  if (k && !F.misses && !F.obad) reflect.push(`一度も かわされずに 倒した。「${short}」は、もう 迷っていない。次の影は、別の つまずきから 生まれる。`);
  if (!k) reflect.push(`${F.dealt} 削った。残りは ${hp}、${bossWhen(b, date)}。朝の欠片や 勉強のやることでも 削れる。`);
  if (F.misses) reflect.push(`かわされた ${F.misses}問は、あしたの朝の欠片に 入ります。`);
  if (F.obad && steps.length) reflect.push(`札の順で ${F.obad}回 迷った。流れは ${steps.join(' → ')}。`);

  const rows: { ico: boolean; head: string; sub: string; val: string }[] = [];
  if (order && F.cuts.length === 4) rows.push({ ico: F.pcrit, head: F.pcrit ? '会心' : '札', sub: F.pcrit ? '札を 一度も誤らずに 斬った' : `順で ${F.obad}回 迷った`, val: F.pcrit ? `+${PLATE_CRIT}` : '—' });
  else if (!order) rows.push({ ico: F.crits > 0, head: '会心', sub: `「${meta.crit}」`, val: `${F.crits}回` });
  if (F.misses) rows.push({ ico: false, head: 'かわされた', sub: `${F.misses}問`, val: 'あすの欠片へ' });

  return (
    <div class="k-result z-grain" role="region" aria-label={k ? '討伐の結果' : '戦いの結果'}>
      <div class="k-rcol">
        <div class="k-rhead">
          <div class="k-rthin" />
          <div class="k-rband" />
          <div class="k-rt">
            <span class="z-tag z-tag-k k-pop3">第{week}週の敵</span>
            <b class={`z-min${k ? '' : ' k-rt3'}`}>{k ? '討伐' : '削った'}</b>
          </div>
        </div>
        <div class="k-rbody">
          <div class="k-rin" style={{ animationDelay: '.38s' }}>
            <b class="z-min k-rtl">{k ? `${b.name}を、倒しました` : `${b.name}に、${F.dealt} の傷`}</b>
            <span class="z-num k-rsum">{sum}</span>
          </div>
          <div class="k-kime k-rin" style={{ animationDelay: '.5s' }}>
            <div class="k-kime-art">
              <BossArt b={b} opts={b.type === 'bakusa' ? { plates: false, broken: !!k } : undefined} />
            </div>
            <div class="k-kime-h">
              <span class={`z-tag ${k ? 'z-tag-r' : 'z-tag-k'}`}>{k ? '決め手' : 'まだ 立っている'}</span>
              <span>{k ? `図鑑に記録 · ${k.count}体目` : `体力 ${hp} / ${b.max}`}</span>
            </div>
            <p class="z-min">{k ? `「${b.lastWords}」` : `「${b.taunt}」`}</p>
            {!k && (
              <span class="k-kime-hp">
                <span style={{ width: pctOf(hp, b.max) }} />
              </span>
            )}
          </div>
          <div class="k-rin k-rxp" style={{ animationDelay: '.62s' }}>
            <div class="k-rxp-h">
              <span>経験値</span>
              <b class="z-min z-num">+{F.xp}</b>
              <span class="k-sp" />
              {up && r >= 2 && <span class="z-tag z-tag-r k-pop0">レベルアップ</span>}
            </div>
            <div class="k-rxp-l">
              <b class="z-min z-num">
                <span>Lv.</span>
                {lv}
              </b>
              <span>{title(lv)}</span>
              <span class="k-sp" />
              <span class="z-num k-rxp-n">{xpText}</span>
            </div>
            <span class="k-rbar">
              <span key={showNew ? 'b1' : 'b0'} style={{ width: `${(barPct * 100).toFixed(1)}%` }} />
            </span>
          </div>
          {rows.map((x, i) => (
            <div key={x.head} class="k-rrow k-rin" style={{ animationDelay: `${0.74 + i * 0.06}s` }}>
              <span class={`k-rico${x.ico ? ' on' : ''}`} aria-hidden="true">
                <svg width="26" height="22" viewBox="0 0 26 22">
                  <path d="M7 1H25L19 21H1Z" fill="currentColor" />
                  <path d="M8 16L18 6" stroke="#FFF" stroke-width="2.2" />
                </svg>
              </span>
              <span class="k-rrow-t">
                {x.head}　<span>{x.sub}</span>
              </span>
              <b class="z-min z-num">{x.val}</b>
            </div>
          ))}
          <div class="k-rin k-rref" style={{ animationDelay: '.9s' }}>
            <span>ふりかえり</span>
            <p>{reflect.join('')}</p>
          </div>
        </div>
        <div class="k-racts k-rin" style={{ animationDelay: '1.02s' }}>
          {k ? (
            <a href={`#/zukan/${b.id}`} class="k-btn k-bo">
              図鑑で見る
            </a>
          ) : (
            <button type="button" class="k-btn k-bo" onClick={onAgain}>
              もう一度 挑む
            </button>
          )}
          <a href="#/today" class="k-btn k-bw k-rgo">
            今日に戻る
          </a>
        </div>
      </div>
    </div>
  );
}

