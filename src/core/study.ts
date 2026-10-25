// Study model: spaced repetition boxes, accuracy, the pass forecast and how questions are picked.
import type { Answer, Card, Conf, Mode, Pack, Personal, Question, StudyProgress } from './types';
import { addDays, dayDiff, shuffle } from './util';

export const INTERVALS = [0, 1, 3, 7, 16, 35];
const LOG_CAP = 800;

export const newProgress = (): StudyProgress => ({ cards: {}, history: {}, log: [], streak: 0, bestStreak: 0, lastStudyDate: '' });

export function progress(p: Personal, certId: string) {
  if (!p.study[certId]) p.study[certId] = newProgress();
  return p.study[certId];
}

export const domainOf = (pk: Pack, q: Question) => pk.topics.find((t) => t.id === q.topicId)?.domainId ?? '';

export function isCorrect(q: Question, pick: string[]) {
  return pick.length === q.answer.length && q.answer.every((a) => pick.includes(a));
}

/** The streak shown today: it survives until the end of the day after the last study day. */
export function shownStreak(sp: StudyProgress, today: string) {
  if (!sp.lastStudyDate) return 0;
  return dayDiff(sp.lastStudyDate, today) <= 1 ? sp.streak : 0;
}

export interface Recorded { xp: number; note: string; card: Card; firstToday: boolean }

/** Counts today as a study day for the streak. True the first time today. */
export function markStudied(sp: StudyProgress, today: string) {
  if (sp.lastStudyDate === today) return false;
  const gap = sp.lastStudyDate ? dayDiff(sp.lastStudyDate, today) : 99;
  sp.streak = gap === 1 ? sp.streak + 1 : 1;
  sp.lastStudyDate = today;
  sp.bestStreak = Math.max(sp.bestStreak, sp.streak);
  return true;
}

/** Updates the card, history, log and streak for one answer. Combo is the run of correct answers before this one. */
export function recordAnswer(sp: StudyProgress, q: Question, ok: boolean, conf: Conf, ms: number, pick: string[], mode: Mode, today: string, combo: number): Recorded {
  const prev = sp.cards[q.id];
  const c: Card = prev ? { ...prev } : { box: 0, due: today, seen: 0, correct: 0, lastAt: '', lastConf: '' };
  c.seen++;
  c.lastAt = today;
  c.lastConf = conf;
  let note: string;
  if (ok) {
    c.correct++;
    if (conf === 'guess') c.box = Math.min(c.box, 1) || 1;
    else c.box = Math.min(5, c.box + 1);
    c.due = addDays(today, INTERVALS[c.box] || 1);
    const gap = INTERVALS[c.box] || 1;
    note = conf === 'guess' ? `勘で正解。${gap}日後に もう一度出します` : gap >= 14 ? `次は ${Math.round(gap / 7)}週間後に 出します` : `次は ${gap}日後に 出します`;
  } else {
    c.box = 0;
    c.due = today;
    note = conf === 'sure' ? '確実のつもりで 違いました。あした もう一度' : 'あとで もう一度 出ます';
  }
  sp.cards[q.id] = c;
  const h = sp.history[today] || { a: 0, c: 0 };
  h.a++;
  if (ok) h.c++;
  sp.history[today] = h;
  sp.log.push({ q: q.id, d: today, ok, conf, ms: Math.round(ms), pick, mode });
  if (sp.log.length > LOG_CAP) sp.log.splice(0, sp.log.length - LOG_CAP);
  const firstToday = markStudied(sp, today);
  let xp = ok ? (conf === 'sure' ? 15 : conf === 'maybe' ? 10 : 5) : 2;
  if (ok) xp += Math.min(10, Math.max(0, combo) * 2);
  return { xp, note, card: c, firstToday };
}

/**
 * The tag on a question that comes back after a miss or a guess, from the last time it was asked: 今日 / 昨日 /
 * 前に まちがえた (or 迷った). Read it before the session logs its own answers.
 */
export function backTag(sp: StudyProgress, qId: string, today: string) {
  for (let i = sp.log.length - 1; i >= 0; i--) {
    const a = sp.log[i];
    if (a.q !== qId) continue;
    if (a.ok && a.conf !== 'guess') return '';
    const when = a.d === today ? '今日' : a.d === addDays(today, -1) ? '昨日' : '前に';
    return `${when} ${a.ok ? '迷った' : 'まちがえた'}`;
  }
  return '';
}

/* ---------- statistics ---------- */
export function accuracy(sp: StudyProgress, qs: Question[]) {
  let seen = 0;
  let correct = 0;
  for (const q of qs) {
    const c = sp.cards[q.id];
    if (!c) continue;
    seen += c.seen;
    correct += c.correct;
  }
  return seen ? correct / seen : null;
}

/** How well a set of questions has settled, 0..100: each question counts up to box 4. */
export function settled(sp: StudyProgress, qs: Question[]) {
  if (!qs.length) return 0;
  let s = 0;
  for (const q of qs) s += Math.min(4, sp.cards[q.id]?.box ?? 0) / 4;
  return Math.round((s / qs.length) * 100);
}

export function domainQuestions(pk: Pack, domainId: string) {
  const topics = new Set(pk.topics.filter((t) => t.domainId === domainId).map((t) => t.id));
  return pk.questions.filter((q) => topics.has(q.topicId));
}

/**
 * Each domain's chance of a right answer, from its last 30 answers with a 50% prior (a guess that was right
 * counts half). `n` is how many answers it rests on.
 */
export function domainRates(pk: Pack, log: Answer[], upTo?: string) {
  const byQ = new Map(pk.questions.map((q) => [q.id, q]));
  const topicDomain = new Map(pk.topics.map((t) => [t.id, t.domainId]));
  const recent: Record<string, Answer[]> = {};
  for (const a of log) {
    if (upTo && a.d > upTo) continue;
    const q = byQ.get(a.q);
    if (!q) continue;
    const d = topicDomain.get(q.topicId) ?? '';
    (recent[d] ||= []).push(a);
  }
  const prior = 4;
  const out: Record<string, { p: number; n: number }> = {};
  for (const d of pk.domains) {
    const arr = (recent[d.id] || []).slice(-30);
    const c = arr.filter((a) => a.ok && a.conf !== 'guess').length + arr.filter((a) => a.ok && a.conf === 'guess').length * 0.5;
    out[d.id] = { p: (c + prior * 0.5) / (arr.length + prior), n: arr.length };
  }
  return out;
}

/** Pass forecast on the exam's scale: the domain rates weighted by the exam outline. */
export function forecast(pk: Pack, log: Answer[], upTo?: string) {
  const rates = domainRates(pk, log, upTo);
  let sw = 0;
  let s = 0;
  for (const d of pk.domains) {
    const w = (d.weightMin + d.weightMax) / 2;
    s += w * rates[d.id].p;
    sw += w;
  }
  return Math.round((s / (sw || 1)) * pk.scoreMax);
}

/** Forecast at the end of each of the last n days (for the chart). */
export function forecastSeries(pk: Pack, log: Answer[], today: string, n: number) {
  const out: { d: string; v: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ d, v: forecast(pk, log, d) });
  }
  return out;
}

/* ---------- picking questions ---------- */
function weakness(sp: StudyProgress, q: Question, today: string) {
  const c = sp.cards[q.id];
  if (!c) return 1.5;
  const acc = c.seen ? c.correct / c.seen : 0;
  const due = c.due <= today ? 1 : 0;
  return (1 - acc) * 2 + due * 1.5 + (5 - c.box) * 0.3 + (c.lastConf === 'guess' ? 0.6 : 0);
}

/**
 * Morning shards: due cards first, then weak ones, then new ones spread by exam weight. With `open` (the topics
 * learned so far), only those topics' questions are asked.
 */
export function pickKakera(pk: Pack, sp: StudyProgress, today: string, n = 5, open?: Set<string>) {
  const pool = open?.size ? pk.questions.filter((q) => open.has(q.topicId)) : pk.questions;
  const due = pool.filter((q) => sp.cards[q.id] && sp.cards[q.id].due <= today).sort((a, b) => sp.cards[a.id].box - sp.cards[b.id].box);
  const weak = pool.filter((q) => {
    const c = sp.cards[q.id];
    return c && c.due > today && c.seen > 0 && c.correct / c.seen < 0.7;
  });
  const fresh: Question[] = [];
  const pools = pk.domains.map((d) => shuffle(domainQuestions(pk, d.id).filter((q) => !sp.cards[q.id] && pool.includes(q))));
  const weights = pk.domains.map((d) => (d.weightMin + d.weightMax) / 2);
  const credit = weights.map(() => 0);
  while (pools.some((l) => l.length) && fresh.length < n) {
    weights.forEach((w, i) => (credit[i] += w));
    let best = -1;
    for (let i = 0; i < pools.length; i++) if (pools[i].length && (best < 0 || credit[i] > credit[best])) best = i;
    credit[best] -= 100;
    fresh.push(pools[best].shift()!);
  }
  const out: Question[] = [];
  const push = (q: Question) => { if (out.length < n && !out.includes(q)) out.push(q); };
  due.slice(0, Math.ceil(n * 0.6)).forEach(push);
  fresh.slice(0, 2).forEach(push);
  weak.forEach(push);
  due.forEach(push);
  fresh.forEach(push);
  // when the learned topics run short, the questions asked longest ago fill in, not the ones just answered
  shuffle(pool)
    .sort((a, b) => (sp.cards[a.id]?.lastAt ?? '').localeCompare(sp.cards[b.id]?.lastAt ?? ''))
    .forEach(push);
  return out;
}

/** A mock exam: questions spread over the domains by the exam outline's weights, in random order. */
export function pickMock(pk: Pack, n = 20) {
  const weights = pk.domains.map((d) => (d.weightMin + d.weightMax) / 2);
  const sum = weights.reduce((a, w) => a + w, 0) || 1;
  const pools = pk.domains.map((d) => shuffle(domainQuestions(pk, d.id)));
  const want = Math.min(n, pools.reduce((a, l) => a + l.length, 0));
  const raw = weights.map((w) => (w / sum) * want);
  const take = raw.map((r, i) => Math.min(pools[i].length, Math.floor(r)));
  const order = raw.map((_, i) => i).sort((a, b) => (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])));
  // the rest goes round the domains that still have questions, the largest remainders first
  for (let left = want - take.reduce((a, t) => a + t, 0); left > 0; ) {
    const room = order.filter((i) => take[i] < pools[i].length);
    if (!room.length) break;
    for (const i of room) {
      if (!left) break;
      take[i]++;
      left--;
    }
  }
  return shuffle(pools.flatMap((l, i) => l.slice(0, take[i])));
}

/** Questions for a short drill in a topic or a domain, weakest first. A small topic is filled from its domain, after its own. */
export function pickDrill(pk: Pack, sp: StudyProgress, today: string, scope: { topicId?: string; domainId?: string }, n = 3) {
  const weakFirst = (qs: Question[]) => shuffle(qs).sort((a, b) => weakness(sp, b, today) - weakness(sp, a, today));
  const own = scope.topicId ? pk.questions.filter((q) => q.topicId === scope.topicId) : scope.domainId ? domainQuestions(pk, scope.domainId) : pk.questions;
  let qs = weakFirst(own);
  if (qs.length < n && scope.topicId) {
    const d = pk.topics.find((t) => t.id === scope.topicId)?.domainId;
    if (d) qs = qs.concat(weakFirst(domainQuestions(pk, d).filter((q) => !own.includes(q))));
  }
  return qs.slice(0, n);
}

/** Wrong answers yesterday per topic: the basis of "きのう 2回 迷ったところ". */
export function stumbles(pk: Pack, sp: StudyProgress, day: string) {
  const byQ = new Map(pk.questions.map((q) => [q.id, q]));
  const out: Record<string, number> = {};
  for (const a of sp.log) {
    if (a.d !== day) continue;
    if (a.ok && a.conf !== 'guess') continue;
    const t = byQ.get(a.q)?.topicId;
    if (t) out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/** The weakest topic by recent answers; unseen topics in heavy domains come next. */
export function weakestTopic(pk: Pack, sp: StudyProgress, today: string) {
  let best = pk.topics[0];
  let bestScore = -1;
  for (const t of pk.topics) {
    const qs = pk.questions.filter((q) => q.topicId === t.id);
    if (!qs.length) continue;
    const s = qs.reduce((a, q) => a + weakness(sp, q, today), 0) / qs.length;
    const recentMiss = sp.log.slice(-60).filter((a) => !a.ok && qs.some((q) => q.id === a.q)).length;
    const score = s + recentMiss * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/* ---------- the question bank: every question, any time ---------- */
/** Where a question stands in the bank: never asked, last answered right, or last missed (or only guessed). */
export type QState = 'new' | 'ok' | 'ng';

/** Each question's state from its last answer; an old card whose answers left the log falls back on its box. */
export function qStates(pk: Pack, sp: StudyProgress) {
  const last = new Map<string, Answer>();
  for (const a of sp.log) last.set(a.q, a);
  const out = new Map<string, QState>();
  for (const q of pk.questions) {
    const a = last.get(q.id);
    const c = sp.cards[q.id];
    out.set(q.id, a ? (a.ok && a.conf !== 'guess' ? 'ok' : 'ng') : !c ? 'new' : c.box === 0 && c.seen > c.correct ? 'ng' : 'ok');
  }
  return out;
}

/**
 * A whole set from the bank, in the order that suits going through all of it: the ones never asked in book
 * order (chapter, then unit), then the missed ones, then the rest weakest first.
 */
export function orderSet(pk: Pack, sp: StudyProgress, today: string, qs: Question[]) {
  const st = qStates(pk, sp);
  const at = new Map(pk.questions.map((q, i) => [q.id, i]));
  const rank = (q: Question) => (st.get(q.id) === 'new' ? 0 : st.get(q.id) === 'ng' ? 1 : 2);
  return shuffle(qs).sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? at.get(a.id)! - at.get(b.id)! : weakness(sp, b, today) - weakness(sp, a, today)));
}

/* ---------- 挑む: what is needed now, judged on this device ---------- */
export type NeedWhy = 'miss' | 'due' | 'new' | 'foe' | 'weak';
export const NEED_LABEL: Record<NeedWhy, string> = { miss: 'まちがえた', due: '復習の日', new: 'まだ', foe: '敵の分野', weak: '弱い' };

/**
 * The questions a fight should ask now, from the whole bank: missed ones first (more so when due), then the ones
 * whose review day has come, then unasked ones in learned topics and heavy chapters; the shadow's topic is
 * favoured and gets at least one. With the exam close (two weeks or less) the chapter weights count for more.
 * Answered right today counts against a question; at most two come from one topic.
 */
export function pickNow(pk: Pack, sp: StudyProgress, today: string, n: number, opts: { foe?: string; open?: Set<string>; daysLeft?: number | null } = {}) {
  const st = qStates(pk, sp);
  const wt = new Map(pk.topics.map((t) => [t.id, pk.domains.find((d) => d.id === t.domainId)]));
  const near = opts.daysLeft !== null && opts.daysLeft !== undefined && opts.daysLeft <= 14;
  const why = (q: Question): NeedWhy => {
    const s = st.get(q.id);
    const c = sp.cards[q.id];
    if (s === 'ng') return 'miss';
    if (c && c.due <= today) return 'due';
    if (s === 'new') return 'new';
    return q.topicId === opts.foe ? 'foe' : 'weak';
  };
  const score = (q: Question) => {
    const c = sp.cards[q.id];
    const d = wt.get(q.topicId);
    const w = d ? (d.weightMin + d.weightMax) / 2 : 15;
    const k = why(q);
    let s = k === 'miss' ? 4 + (c && c.due <= today ? 1 : 0) : k === 'due' ? 2.5 : k === 'new' ? (!opts.open?.size || opts.open.has(q.topicId) ? 1.5 : 0.4) : weakness(sp, q, today) * 0.3;
    s += (w / 30) * (near ? 1.6 : 0.6);
    if (q.topicId === opts.foe) s += 1.5;
    if (c && c.lastAt === today && st.get(q.id) === 'ok') s -= 3;
    return s + Math.random() * 0.4;
  };
  const ranked = pk.questions.map((q) => ({ q, s: score(q) })).sort((a, b) => b.s - a.s);
  const out: Question[] = [];
  const per: Record<string, number> = {};
  const take = (q: Question) => {
    if (out.length >= n || out.includes(q) || (per[q.topicId] || 0) >= 2) return;
    out.push(q);
    per[q.topicId] = (per[q.topicId] || 0) + 1;
  };
  const foeFirst = ranked.find((r) => r.q.topicId === opts.foe);
  ranked.forEach((r) => take(r.q));
  if (foeFirst && opts.foe && !out.some((q) => q.topicId === opts.foe)) out[out.length - 1] = foeFirst.q;
  // a small pack can run out under the two-per-topic rule
  ranked.forEach((r) => out.length < n && !out.includes(r.q) && out.push(r.q));
  return out.map((q) => ({ q, why: why(q) }));
}
