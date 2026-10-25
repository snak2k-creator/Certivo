import { beforeEach, describe, expect, it } from 'vitest';
import { ensureDay, toggleTask } from '../src/core/actions';
import { summarize, writeRecap, type DaySummary } from '../src/core/recap';
import { state } from '../src/core/store';
import { DAY, fresh, pack, task } from './helpers';

beforeEach(() => fresh());

const empty: DaySummary = { date: DAY, answered: 0, correct: 0, kakera: false, slashes: 0, xp: 0, three: false, workDone: 0, done: [], stumbled: [], streak: 0 };

describe('the facts of a day', () => {
  it('names personal tasks but only counts work', () => {
    const mine = task({ title: '住民税を払う' });
    const work = task({ title: 'A社 見積もり', sk: '技' });
    state.p.tasks.push(mine);
    state.w.tasks.push(work);
    toggleTask('p', mine.id, DAY);
    toggleTask('w', work.id, DAY);
    const s = summarize(state.p, pack, pack.id, DAY, DAY);
    expect(s.done).toEqual(['住民税を払う']);
    expect(s.workDone).toBe(1);
    expect(JSON.stringify(s)).not.toContain('A社');
  });

  it('leaves study tasks out of the names', () => {
    ensureDay(pack, DAY);
    const k = state.p.tasks.find((t) => t.study)!;
    toggleTask('p', k.id, DAY);
    expect(summarize(state.p, pack, pack.id, DAY, DAY).done).toEqual([]);
  });
});

describe('the page written on the device', () => {
  it('rests without blame on an empty day', () => {
    expect(writeRecap(empty)).toBe('今日は、休みの日。あしたの朝、欠片から はじめよう。');
  });

  it('puts what went well first', () => {
    const text = writeRecap({ ...empty, answered: 5, correct: 5, kakera: true, done: ['住民税を払う'], workDone: 2, three: true });
    expect(text).toBe('朝の欠片は 5問とも 正解。「住民税を払う」も 済ませた。仕事は 2件 済み。今日の三つも 斬った。');
  });

  it('turns a stumble into tomorrow’s practice', () => {
    const text = writeRecap({ ...empty, answered: 4, correct: 2, stumbled: [{ topic: 'RAG', n: 2 }] });
    expect(text).toContain('4問に 答えて、2問 正解。');
    expect(text).toContain('「RAG」で 2回 迷ったので、あしたの朝の欠片に 入れておいた。');
  });
});
