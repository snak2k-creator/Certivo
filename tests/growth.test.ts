import { describe, expect, it } from 'vitest';
import { calendar, chapters, outlook, slope, target, xpTo, xpTier } from '../src/core/growth';
import { newPersonal } from '../src/core/store';
import { newProgress } from '../src/core/study';
import { addDays, dow } from '../src/core/util';
import { DAY, answers, pack } from './helpers';

describe('numbers', () => {
  it('fits a slope through the points', () => {
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1);
    expect(slope([4, 3, 2, 1])).toBeCloseTo(-1);
    expect(slope([3, 3, 3])).toBe(0);
    expect(slope([5])).toBe(0);
  });

  it('counts the XP still needed for a level', () => {
    const g = newPersonal().game;
    g.xp = 50;
    expect(xpTo(g, 3)).toBe(100 - 50 + 125);
    expect(xpTo(g, 1)).toBe(0);
  });

  it('puts days into tiers by XP', () => {
    expect([0, 1, 59, 60, 119, 120, 199, 200].map(xpTier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});

describe('the pass outlook', () => {
  it('stays flat with nothing to go on', () => {
    const o = outlook(pack, newProgress(), DAY, addDays(DAY, 30));
    expect(o.past).toHaveLength(1);
    expect(o.ahead[0]).toMatchObject({ d: DAY, v: 500 });
    expect(o.ahead.at(-1)!.v).toBe(500);
    expect(o.cross).toBe('');
  });

  it('has no crossing day once already above the line', () => {
    const sp = newProgress();
    sp.log = pack.domains.flatMap((d) => answers(d.id, true));
    const o = outlook(pack, sp, DAY, addDays(DAY, 30));
    expect(o.past.at(-1)!.v).toBeGreaterThanOrEqual(pack.passingScore);
    expect(o.cross).toBe('');
    expect(o.studied).toBe(1);
  });

  it('widens the band the further it looks', () => {
    const o = outlook(pack, newProgress(), DAY, addDays(DAY, 20));
    const first = o.ahead[0];
    const last = o.ahead.at(-1)!;
    expect(first.hi - first.lo).toBe(0);
    expect(last.hi - last.lo).toBeGreaterThan(50);
  });
});

describe('chapters', () => {
  it('marks the weakest chapter below the passing rate', () => {
    const sp = newProgress();
    sp.log = [...answers('d1', true), ...answers('d3', false), ...answers('d4', false).slice(0, 2)];
    const cs = chapters(pack, sp, newPersonal(), DAY);
    expect(cs.map((c) => c.weak)).toEqual([false, false, true, false, false]);
    expect(cs[0].p).toBeGreaterThan(target(pack));
    expect(cs[1].p).toBeNull();
    expect(cs[2].trip?.domainId).toBe('d3');
  });
});

describe('the calendar', () => {
  it('runs in whole weeks from Monday, with today marked', () => {
    const days = calendar(newPersonal(), DAY, addDays(DAY, -10));
    expect(days.length % 7).toBe(0);
    expect(dow(days[0].d)).toBe(1);
    expect(days.filter((d) => d.when === 'today').map((d) => d.d)).toEqual([DAY]);
    expect(days.at(-1)!.d >= addDays(DAY, 13)).toBe(true);
  });

  it('reaches the exam when it is near, and marks it', () => {
    const exam = addDays(DAY, 20);
    const days = calendar(newPersonal(), DAY, DAY, exam);
    expect(days.filter((d) => d.exam).map((d) => d.d)).toEqual([exam]);
  });

  it('counts cuts and XP only up to today', () => {
    const p = newPersonal();
    p.days[DAY] = { xp: 130, slashes: 2, kills: 1 };
    p.days[addDays(DAY, 1)] = { xp: 80, slashes: 1, kills: 0 };
    const days = calendar(p, DAY, addDays(DAY, -3));
    expect(days.find((d) => d.d === DAY)).toMatchObject({ xp: 130, tier: 3, kill: true });
    expect(days.find((d) => d.d === addDays(DAY, 1))).toMatchObject({ xp: 0, when: 'fut' });
  });
});
