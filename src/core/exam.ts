// 模試 as the real exam: a fixed set spread by the exam weights, one clock for all of it, answers that can be
// changed and flagged until the end, nothing marked until it is handed in, then the score on the exam's scale.
// A sitting in progress lives on this device, so closing the app (or a phone call) doesn't lose it; the clock
// keeps running meanwhile, as it would in the test centre.
import type { MockRun, Pack } from './types';
import { commit, state } from './store';
import { answer } from './actions';
import { domainOf, isCorrect, pickMock, progress } from './study';
import { questionById } from './pack';

/** About the length of the real exam, and the half sitting. */
export const EXAM_FULL = 50;
export const EXAM_HALF = 25;
const KEY = 'zan:exam';
const KEEP = 30;

export interface Sitting {
  certId: string;
  qs: string[];
  picks: Record<string, string[]>;
  flags: string[];
  /** when it started and how long it may run, in ms */
  start: number;
  limit: number;
  at: number;
}

/** The time for n questions: the pack's exam time for a full sitting, in proportion for a shorter one. */
export const examMinutes = (pk: Pack, n: number) => Math.max(5, Math.round(((pk.durationMin || 100) * n) / EXAM_FULL));

export function loadSitting(): Sitting | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Sitting | null;
    return s && Array.isArray(s.qs) && s.qs.length ? s : null;
  } catch {
    return null;
  }
}
export function saveSitting(s: Sitting) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* the sitting still runs in memory */
  }
}
export function dropSitting() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

export function newSitting(pk: Pack, n: number, now = Date.now()): Sitting {
  const s: Sitting = { certId: pk.id, qs: pickMock(pk, n).map((q) => q.id), picks: {}, flags: [], start: now, limit: examMinutes(pk, n) * 60000, at: 0 };
  saveSitting(s);
  return s;
}

export const timeLeft = (s: Sitting, now = Date.now()) => Math.max(0, s.start + s.limit - now);

export interface Graded {
  run: MockRun;
  /** each question in the order asked, what was picked, and how it went ('' when left blank) */
  items: { id: string; pick: string[]; mark: 'ok' | 'ng' | '' }[];
  chapters: { n: number; name: string; asked: number; ok: number }[];
  lvFrom: number;
}

/**
 * Hands the sitting in. Every answered question is recorded like any answer (its card, the streak, experience);
 * a blank one counts as wrong in the score but is not recorded, as it says nothing about what is known.
 */
export function grade(pk: Pack, s: Sitting, date: string, now = Date.now()): Graded {
  const lvFrom = state.p.game.lv;
  const qs = s.qs.map((id) => questionById(pk, id)).filter((q) => !!q);
  const marks = qs.map((q) => {
    const pick = s.picks[q.id] || [];
    if (!pick.length) return '' as const;
    const ok = isCorrect(q, pick);
    answer(pk, q, pick, ok, 'maybe', 0, 'mock', 0, date);
    return ok ? ('ok' as const) : ('ng' as const);
  });
  const ok = marks.filter((m) => m === 'ok').length;
  const score = Math.round((ok / Math.max(1, qs.length)) * pk.scoreMax);
  const run: MockRun = { d: date, n: qs.length, ok, score, secs: Math.round(Math.min(s.limit, now - s.start) / 1000), pass: score >= pk.passingScore };
  const sp = progress(state.p, pk.id);
  sp.mocks = [...(sp.mocks || []), run].slice(-KEEP);
  commit('p');
  dropSitting();
  const chapters = pk.domains
    .map((d, n) => {
      const idx = qs.map((q, i) => (domainOf(pk, q) === d.id ? i : -1)).filter((i) => i >= 0);
      return { n, name: d.name, asked: idx.length, ok: idx.filter((i) => marks[i] === 'ok').length };
    })
    .filter((c) => c.asked);
  return { run, items: qs.map((q, i) => ({ id: q.id, pick: s.picks[q.id] || [], mark: marks[i] })), chapters, lvFrom };
}
