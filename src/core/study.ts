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
  let firstToday = false;
  if (sp.lastStudyDate !== today) {
    firstToday = true;
    const gap = sp.lastStudyDate ? dayDiff(sp.lastStudyDate, today) : 99;
    sp.streak = gap === 1 ? sp.streak + 1 : 1;
    sp.lastStudyDate = today;
    sp.bestStreak = Math.max(sp.bestStreak, sp.streak);
  }
  let xp = ok ? (conf === 'sure' ? 15 : conf === 'maybe' ? 10 : 5) : 2;
  if (ok) xp += Math.min(10, Math.max(0, combo) * 2);
  return { xp, note, card: c, firstToday };
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

/** Morning shards: due cards first, then weak ones, then new ones spread by exam weight. */
export function pickKakera(pk: Pack, sp: StudyProgress, today: string, n = 5) {
  const due = pk.questions.filter((q) => sp.cards[q.id] && sp.cards[q.id].due <= today).sort((a, b) => sp.cards[a.id].box - sp.cards[b.id].box);
  const weak = pk.questions.filter((q) => {
    const c = sp.cards[q.id];
    return c && c.due > today && c.seen > 0 && c.correct / c.seen < 0.7;
  });
  const fresh: Question[] = [];
  const pools = pk.domains.map((d) => shuffle(domainQuestions(pk, d.id).filter((q) => !sp.cards[q.id])));
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
  shuffle(pk.questions).forEach(push);
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
  for (let k = 0; take.reduce((a, t) => a + t, 0) < want && k < order.length * 4; k++) {
    const i = order[k % order.length];
    if (take[i] < pools[i].length) take[i]++;
  }
  return shuffle(pools.flatMap((l, i) => l.slice(0, take[i])));
}

/** Questions for a short drill in a topic or a domain, weakest first. */
export function pickDrill(pk: Pack, sp: StudyProgress, today: string, scope: { topicId?: string; domainId?: string }, n = 3) {
  let qs = scope.topicId ? pk.questions.filter((q) => q.topicId === scope.topicId) : scope.domainId ? domainQuestions(pk, scope.domainId) : pk.questions;
  if (qs.length < n && scope.topicId) {
    const d = pk.topics.find((t) => t.id === scope.topicId)?.domainId;
    if (d) qs = qs.concat(domainQuestions(pk, d).filter((q) => !qs.includes(q)));
  }
  return shuffle(qs)
    .sort((a, b) => weakness(sp, b, today) - weakness(sp, a, today))
    .slice(0, n);
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
