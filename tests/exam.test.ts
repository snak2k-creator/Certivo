import { beforeEach, describe, expect, it } from 'vitest';
import { state } from '../src/core/store';
import { EXAM_FULL, examMinutes, grade, loadSitting, newSitting, timeLeft } from '../src/core/exam';
import { questionById } from '../src/core/pack';
import { DAY, fresh, pack } from './helpers';

beforeEach(() => fresh());

describe('the mock exam', () => {
  it('sits like the real one: the full length in the exam time, a half in half', () => {
    expect(examMinutes(pack, EXAM_FULL)).toBe(pack.durationMin);
    expect(examMinutes(pack, EXAM_FULL / 2)).toBe(Math.round(pack.durationMin! / 2));
    const s = newSitting(pack, EXAM_FULL, 1000);
    expect(s.qs).toHaveLength(EXAM_FULL);
    expect(new Set(s.qs).size).toBe(EXAM_FULL);
    expect(timeLeft(s, 1000 + 60000)).toBe(s.limit - 60000);
    expect(timeLeft(s, 1000 + s.limit + 1)).toBe(0);
  });

  it('keeps a sitting on the device until it is handed in', () => {
    const s = newSitting(pack, 10);
    expect(loadSitting()?.qs).toEqual(s.qs);
    grade(pack, s, DAY);
    expect(loadSitting()).toBeNull();
  });

  it('scores on the exam scale, counts a blank as wrong but records only what was answered', () => {
    const s = newSitting(pack, 10, Date.now());
    const qs = s.qs.map((id) => questionById(pack, id)!);
    // 7 right, 2 wrong, 1 blank
    qs.slice(0, 7).forEach((q) => (s.picks[q.id] = q.answer));
    qs.slice(7, 9).forEach((q) => (s.picks[q.id] = [q.options.find((o) => !q.answer.includes(o.id))!.id]));
    const g = grade(pack, s, DAY);
    expect(g.run).toMatchObject({ n: 10, ok: 7, score: 700, pass: true });
    expect(g.items.map((x) => x.mark)).toEqual([...Array(7).fill('ok'), 'ng', 'ng', '']);
    const sp = state.p.study[pack.id];
    expect(sp.log).toHaveLength(9);
    expect(sp.log.every((a) => a.mode === 'mock')).toBe(true);
    expect(sp.cards[qs[9].id]).toBeUndefined();
    expect(sp.mocks).toHaveLength(1);
    expect(g.chapters.reduce((a, c) => a + c.asked, 0)).toBe(10);
  });
});
