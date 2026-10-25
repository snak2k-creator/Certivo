// Shared setup: the real AI-103 pack, empty notebooks and a clock fixed at noon on a Wednesday.
import { vi } from 'vitest';
import raw from '../public/certs/ai-103.json';
import type { Answer, Conf, Pack, Task } from '../src/core/types';
import { dropUndo, newPersonal, newProfile, newWork, state } from '../src/core/store';
import { progress } from '../src/core/study';
import { learnedOf } from '../src/core/learn';
import { addDays } from '../src/core/util';

export const pack = raw as unknown as Pack;
export const DAY = '2026-10-21';

/** This device's storage, kept in memory. */
export const saved = new Map<string, string>();
globalThis.localStorage ??= {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, String(v)),
  removeItem: (k: string) => void saved.delete(k),
  clear: () => saved.clear(),
  key: (i: number) => [...saved.keys()][i] ?? null,
  get length() {
    return saved.size;
  },
};

export function fresh(day = DAY, hour = 12) {
  const [y, m, d] = day.split('-').map(Number);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, m - 1, d, hour, 0, 0));
  state.profile = newProfile();
  state.p = newPersonal();
  state.w = newWork();
  state.packs = { [pack.id]: pack };
  saved.clear();
  dropUndo();
}

let n = 0;
export function task(over: Partial<Task> = {}): Task {
  n++;
  return { id: 'x' + n, title: 'やること' + n, date: DAY, diff: 'e', sk: '生', createdAt: n, from: 'user', ...over };
}

/** Answers for every question of a domain, all with the same result. */
export function answers(domainId: string, ok: boolean, d = DAY, conf: Conf = 'sure'): Answer[] {
  const topics = new Set(pack.topics.filter((t) => t.domainId === domainId).map((t) => t.id));
  return pack.questions.filter((q) => topics.has(q.topicId)).map((q) => ({ q: q.id, d, ok, conf, ms: 9000, pick: ok ? q.answer : [], mode: 'drill' }));
}

/** Lessons already read the day before, so the questions have somewhere to come from. */
export function learnt(...lessons: string[]) {
  const L = learnedOf(progress(state.p, pack.id));
  for (const l of lessons) L.read[l] = addDays(DAY, -1);
}
