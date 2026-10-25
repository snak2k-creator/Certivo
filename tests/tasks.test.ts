import { describe, expect, it } from 'vitest';
import { doneOn, newTask, parseLine, repeatLabel, tasksFor, upcoming } from '../src/core/tasks';
import { addDays } from '../src/core/util';
import { DAY, task } from './helpers';

describe('parseLine', () => {
  it('reads the day, the time and the minutes out of the title', () => {
    expect(parseLine('あした 19:00 歯医者', DAY)).toMatchObject({ title: '歯医者', date: addDays(DAY, 1), time: '19:00' });
    expect(parseLine('30分 ジム', DAY)).toMatchObject({ title: 'ジム', date: DAY, mins: 30 });
    expect(parseLine('あさって 9：05 銀行', DAY)).toMatchObject({ title: '銀行', date: addDays(DAY, 2), time: '09:05' });
  });

  it('tells a due date from a planned date', () => {
    expect(parseLine('10/31まで 住民税', DAY)).toMatchObject({ title: '住民税', date: DAY, due: '2026-10-31' });
    expect(parseLine('11/3 役所', DAY)).toMatchObject({ title: '役所', date: '2026-11-03', due: undefined });
  });

  it('puts a month-day long past into next year', () => {
    expect(parseLine('1/10 更新', DAY).date).toBe('2027-01-10');
  });

  it('reads repeats', () => {
    expect(parseLine('毎日 ストレッチ', DAY).repeat).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseLine('平日 日報', DAY).repeat).toEqual([1, 2, 3, 4, 5]);
    expect(parseLine('毎週月・木 ゴミ出し', DAY)).toMatchObject({ title: 'ゴミ出し', repeat: [1, 4] });
  });

  it('works with full-width spaces and leaves an unknown line alone', () => {
    expect(parseLine('あした　歯医者', DAY)).toMatchObject({ title: '歯医者', date: addDays(DAY, 1) });
    expect(parseLine('牛乳を買う', DAY)).toMatchObject({ title: '牛乳を買う', date: DAY, time: undefined, mins: undefined, repeat: undefined });
  });
});

describe('newTask', () => {
  it('guesses the skill in the personal notebook only', () => {
    expect(newTask('ジムで 走る', DAY, 'p')?.sk).toBe('健');
    expect(newTask('ジムで 走る', DAY, 'w')?.sk).toBe('技');
  });

  it('makes long tasks normal weight and short ones light', () => {
    expect(newTask('60分 資料', DAY, 'w')?.diff).toBe('n');
    expect(newTask('メール', DAY, 'w')?.diff).toBe('e');
    expect(newTask('むずかしい 設計', DAY, 'w')?.diff).toBe('h');
  });

  it('refuses a line with nothing left after the date words', () => {
    expect(newTask('あした 19:00', DAY, 'p')).toBeNull();
  });
});

describe('tasksFor', () => {
  it('carries unfinished tasks over to today, but not into other days', () => {
    const late = task({ date: addDays(DAY, -2) });
    expect(tasksFor([late], DAY, DAY)).toEqual([late]);
    expect(tasksFor([late], addDays(DAY, 1), DAY)).toEqual([]);
  });

  it('shows a repeating task on its weekdays, unless skipped', () => {
    const wed = task({ date: '2026-10-01', repeat: [3] });
    expect(tasksFor([wed], DAY, DAY)).toEqual([wed]);
    expect(tasksFor([wed], addDays(DAY, 1), DAY)).toEqual([]);
    wed.skip = { [DAY]: true };
    expect(tasksFor([wed], DAY, DAY)).toEqual([]);
    expect(tasksFor([wed], addDays(DAY, 7), DAY)).toEqual([wed]);
  });

  it('sorts by time, untimed last', () => {
    const a = task({ title: 'a' });
    const b = task({ title: 'b', time: '18:00' });
    const c = task({ title: 'c', time: '08:30' });
    expect(tasksFor([a, b, c], DAY, DAY).map((t) => t.title)).toEqual(['c', 'b', 'a']);
  });
});

describe('done', () => {
  it('counts a repeating task per day', () => {
    const t = task({ repeat: [0, 1, 2, 3, 4, 5, 6], doneOn: { [DAY]: 1 } });
    expect(doneOn(t, DAY)).toBe(true);
    expect(doneOn(t, addDays(DAY, 1))).toBe(false);
  });

  it('lists only unfinished one-off tasks as upcoming', () => {
    const soon = task({ date: addDays(DAY, 2) });
    const done = task({ date: addDays(DAY, 3), doneAt: 5 });
    const every = task({ repeat: [1] });
    expect(upcoming([soon, done, every], DAY).map((x) => x.t)).toEqual([soon]);
  });

  it('names common repeats', () => {
    expect(repeatLabel([1, 2, 3, 4, 5])).toBe('平日');
    expect(repeatLabel([6, 0])).toBe('週末');
    expect(repeatLabel([4, 1])).toBe('毎週 月・木');
  });
});
