import { describe, expect, it } from 'vitest';
import { ENEMY, STRONG_HP, WEEK_HP, battleDamage, isCrit, makeBoss, strongBoss } from '../src/core/enemy';
import { newProgress } from '../src/core/study';
import { addDays } from '../src/core/util';
import { DAY, pack } from './helpers';

describe('the week shadow', () => {
  it('lives from Monday to Sunday of its week', () => {
    const b = makeBoss(pack, newProgress(), DAY);
    expect(b).toMatchObject({ week: '2026-10-19', deadline: '2026-10-25', hp: WEEK_HP, max: WEEK_HP, tier: 'week', source: 'zan' });
    expect(b.name.endsWith(ENEMY[b.type].name)).toBe(true);
    expect(pack.topics.map((t) => t.id)).toContain(b.topicId);
  });

  it('is born where the answers went wrong', () => {
    const sp = newProgress();
    const topic = pack.topics.find((t) => t.id === 't-rag')!;
    const qs = pack.questions.filter((x) => x.topicId === topic.id);
    for (const x of qs) sp.log.push({ q: x.id, d: DAY, ok: false, conf: 'maybe', ms: 9000, pick: [], mode: 'drill' });
    const b = makeBoss(pack, sp, DAY);
    expect(b.topicId).toBe('t-rag');
    expect(b.born).toContain(`${qs.length}回`);
  });

  it('avoids last week’s topic when asked', () => {
    const first = makeBoss(pack, newProgress(), DAY);
    expect(makeBoss(pack, newProgress(), DAY, first.topicId).topicId).not.toBe(first.topicId);
  });

  it('comes back stronger once, with the same topic', () => {
    const prev = makeBoss(pack, newProgress(), DAY);
    const back = strongBoss(prev, addDays(DAY, 7));
    expect(back).toMatchObject({ topicId: prev.topicId, hp: STRONG_HP, max: STRONG_HP, tier: 'strong', week: '2026-10-26' });
    expect(back.name).toBe('強・' + prev.name);
    expect(strongBoss(back, addDays(DAY, 14)).name).toBe(back.name);
    expect(back.id).not.toBe(prev.id);
  });
});

describe('battle', () => {
  it('hits harder with a run and on a critical', () => {
    expect(battleDamage(0, false)).toBe(220);
    expect(battleDamage(4, false)).toBe(340);
    expect(battleDamage(9, true)).toBe(510);
  });

  it('has a critical condition for each kind', () => {
    const one = pack.questions[0];
    expect(isCrit('kyoman', one, 'sure', 30000)).toBe(true);
    expect(isCrit('kyoman', one, 'maybe', 30000)).toBe(false);
    expect(isCrit('kokugen', one, 'guess', 20000)).toBe(true);
    expect(isCrit('kokugen', one, 'guess', 20001)).toBe(false);
    expect(isCrit('zanzo', one, 'guess', 1)).toBe(false);
    expect(isCrit('bakusa', one, 'sure', 1)).toBe(false);
  });
});
