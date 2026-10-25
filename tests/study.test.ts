import { describe, expect, it } from 'vitest';
import type { Question } from '../src/core/types';
import { backTag, domainOf, domainRates, forecast, isCorrect, newProgress, orderSet, pickDrill, pickNow, pickKakera, pickMock, qStates, recordAnswer, shownStreak, stumbles } from '../src/core/study';
import { UNLOCK_LV } from '../src/core/game';
import { addDays } from '../src/core/util';
import { DAY, answers, pack } from './helpers';

const q = (id: string) => pack.questions.find((x) => x.id === id)!;
const multi = pack.questions.find((x) => x.type === 'multi')!;

describe('answers', () => {
  it('needs every right option and nothing else', () => {
    const [a, b] = multi.answer;
    expect(isCorrect(multi, [b, a])).toBe(true);
    expect(isCorrect(multi, [a])).toBe(false);
    const wrong = multi.options.find((o) => !multi.answer.includes(o.id))!.id;
    expect(isCorrect(multi, [a, b, wrong])).toBe(false);
  });

  it('spaces a card out as it is answered right, and brings it back when wrong', () => {
    const sp = newProgress();
    const one = q('q001');
    expect(recordAnswer(sp, one, true, 'sure', 8000, one.answer, 'drill', DAY, 0).card).toMatchObject({ box: 1, due: addDays(DAY, 1) });
    const d2 = addDays(DAY, 1);
    expect(recordAnswer(sp, one, true, 'sure', 8000, one.answer, 'drill', d2, 0).card).toMatchObject({ box: 2, due: addDays(d2, 3) });
    expect(recordAnswer(sp, one, false, 'sure', 8000, [], 'drill', d2, 0).card).toMatchObject({ box: 0, due: d2 });
  });

  it('does not trust a lucky guess', () => {
    const sp = newProgress();
    const one = q('q001');
    sp.cards[one.id] = { box: 4, due: DAY, seen: 4, correct: 4, lastAt: '', lastConf: 'sure' };
    expect(recordAnswer(sp, one, true, 'guess', 8000, one.answer, 'drill', DAY, 0).card.box).toBe(1);
  });

  it('gives more XP for sure answers and runs, and a little for a miss', () => {
    const sp = newProgress();
    const one = q('q001');
    expect(recordAnswer(sp, one, true, 'sure', 1, one.answer, 'drill', DAY, 3).xp).toBe(15 + 6);
    expect(recordAnswer(sp, one, true, 'guess', 1, one.answer, 'drill', DAY, 99).xp).toBe(5 + 10);
    expect(recordAnswer(sp, one, false, 'sure', 1, [], 'drill', DAY, 3).xp).toBe(2);
  });

  it('keeps the streak through the next day and resets it after a gap', () => {
    const sp = newProgress();
    const one = q('q001');
    recordAnswer(sp, one, true, 'sure', 1, one.answer, 'drill', DAY, 0);
    recordAnswer(sp, one, true, 'sure', 1, one.answer, 'drill', addDays(DAY, 1), 0);
    expect(sp.streak).toBe(2);
    expect(shownStreak(sp, addDays(DAY, 2))).toBe(2);
    expect(shownStreak(sp, addDays(DAY, 3))).toBe(0);
    recordAnswer(sp, one, true, 'sure', 1, one.answer, 'drill', addDays(DAY, 4), 0);
    expect(sp.streak).toBe(1);
    expect(sp.bestStreak).toBe(2);
  });
});

describe('the forecast', () => {
  it('starts in the middle with nothing answered', () => {
    for (const r of Object.values(domainRates(pack, []))) expect(r).toEqual({ p: 0.5, n: 0 });
    expect(forecast(pack, [])).toBe(500);
  });

  it('rises with right answers and leaves out answers after the day asked about', () => {
    const log = pack.domains.flatMap((d) => answers(d.id, true));
    expect(forecast(pack, log)).toBeGreaterThan(pack.passingScore);
    expect(forecast(pack, log, addDays(DAY, -1))).toBe(500);
  });

  it('counts a right guess as half, on top of a prior of four answers at 50%', () => {
    const log = answers('d1', true, DAY, 'guess').slice(0, 10);
    const n = log.length;
    expect(domainRates(pack, log).d1).toEqual({ p: (n * 0.5 + 2) / (n + 4), n });
    expect(domainRates(pack, answers('d1', true, DAY, 'sure').slice(0, 10)).d1.p).toBeCloseTo((n + 2) / (n + 4));
  });

  it('goes by the last 30 answers in a domain', () => {
    const log = [...answers('d1', false), ...answers('d1', true)];
    expect(log.length).toBeGreaterThan(60);
    expect(domainRates(pack, log).d1).toEqual({ p: (30 + 2) / (30 + 4), n: 30 });
  });

  it('weighs the domains by the exam outline', () => {
    const big = forecast(pack, answers('d2', true));
    const small = forecast(pack, answers('d3', true));
    expect(big).toBeGreaterThan(small);
  });
});

describe('picking questions', () => {
  it('spreads a mock exam over the domains like the real one', () => {
    const qs = pickMock(pack, 20);
    expect(qs).toHaveLength(20);
    expect(new Set(qs.map((x) => x.id)).size).toBe(20);
    const sum = pack.domains.reduce((a, d) => a + (d.weightMin + d.weightMax) / 2, 0);
    for (const d of pack.domains) {
      const want = (((d.weightMin + d.weightMax) / 2) / sum) * 20;
      const got = qs.filter((x) => domainOf(pack, x) === d.id).length;
      expect(Math.abs(got - want)).toBeLessThan(1);
    }
  });

  it('never asks for more than the pack has', () => {
    expect(pickMock(pack, 500)).toHaveLength(pack.questions.length);
  });

  it('puts due cards into the morning shards', () => {
    const sp = newProgress();
    const due = ['q001', 'q002', 'q003'];
    for (const id of due) sp.cards[id] = { box: 1, due: DAY, seen: 1, correct: 1, lastAt: addDays(DAY, -1), lastConf: 'sure' };
    const qs = pickKakera(pack, sp, DAY, 5);
    expect(qs).toHaveLength(5);
    expect(new Set(qs.map((x) => x.id)).size).toBe(5);
    for (const id of due) expect(qs.map((x) => x.id)).toContain(id);
  });

  it('fills a drill on a small topic from the rest of its domain', () => {
    const t = pack.topics[0];
    const keep = pack.questions.find((x) => x.topicId === t.id)!;
    const small = { ...pack, questions: pack.questions.filter((x) => x.topicId !== t.id || x === keep) };
    const qs = pickDrill(small, newProgress(), DAY, { topicId: t.id }, 3);
    expect(qs).toHaveLength(3);
    expect(qs).toContain(keep);
    expect(qs.every((x: Question) => domainOf(small, x) === t.domainId)).toBe(true);
  });

  it('fills short morning shards with the questions asked longest ago, not the ones just answered', () => {
    const sp = newProgress();
    const qs = pack.questions.filter((x) => x.topicId === 't-rag');
    // all answered right and none due: only the filler is left
    qs.forEach((x, i) => (sp.cards[x.id] = { box: 2, due: addDays(DAY, 3), seen: 1, correct: 1, lastAt: addDays(DAY, -i), lastConf: 'sure' }));
    const got = pickKakera(pack, sp, DAY, 3, new Set(['t-rag']));
    expect(got.map((x) => x.id)).toEqual(qs.slice(-3).reverse().map((x) => x.id));
  });

  it('tags a question that comes back with when it went wrong or was a guess', () => {
    const sp = newProgress();
    const one = q('q001');
    expect(backTag(sp, one.id, DAY)).toBe('');
    recordAnswer(sp, one, false, 'sure', 1, [], 'drill', DAY, 0);
    expect(backTag(sp, one.id, DAY)).toBe('今日 まちがえた');
    expect(backTag(sp, one.id, addDays(DAY, 1))).toBe('昨日 まちがえた');
    expect(backTag(sp, one.id, addDays(DAY, 9))).toBe('前に まちがえた');
    recordAnswer(sp, one, true, 'guess', 1, one.answer, 'drill', DAY, 0);
    expect(backTag(sp, one.id, addDays(DAY, 1))).toBe('昨日 迷った');
    recordAnswer(sp, one, true, 'sure', 1, one.answer, 'drill', DAY, 0);
    expect(backTag(sp, one.id, DAY)).toBe('');
  });

  it('counts where yesterday went wrong, guesses included', () => {
    const sp = newProgress();
    const one = q('q001');
    sp.log.push({ q: one.id, d: DAY, ok: false, conf: 'sure', ms: 1, pick: [], mode: 'drill' });
    sp.log.push({ q: one.id, d: DAY, ok: true, conf: 'guess', ms: 1, pick: one.answer, mode: 'drill' });
    sp.log.push({ q: one.id, d: DAY, ok: true, conf: 'sure', ms: 1, pick: one.answer, mode: 'drill' });
    expect(stumbles(pack, sp, DAY)).toEqual({ [one.topicId]: 2 });
  });
});

describe('the question bank', () => {
  it('knows each question as not asked, right, or missed (a lucky guess counts as missed)', () => {
    const sp = newProgress();
    const [a, b, c] = pack.questions;
    recordAnswer(sp, a, true, 'sure', 5000, a.answer, 'drill', DAY, 0);
    recordAnswer(sp, b, false, 'sure', 5000, [], 'drill', DAY, 0);
    recordAnswer(sp, c, true, 'guess', 5000, c.answer, 'drill', DAY, 0);
    const st = qStates(pack, sp);
    expect([st.get(a.id), st.get(b.id), st.get(c.id), st.get(pack.questions[3].id)]).toEqual(['ok', 'ng', 'ng', 'new']);
    expect(st.size).toBe(pack.questions.length);
    // fixed by answering right later
    recordAnswer(sp, b, true, 'sure', 5000, b.answer, 'drill', DAY, 0);
    expect(qStates(pack, sp).get(b.id)).toBe('ok');
  });

  it('goes through a whole set: unasked in book order first, then the missed ones, then the rest', () => {
    const sp = newProgress();
    const [a, b] = pack.questions;
    recordAnswer(sp, a, true, 'sure', 5000, a.answer, 'drill', DAY, 0);
    recordAnswer(sp, b, false, 'sure', 5000, [], 'drill', DAY, 0);
    const out = orderSet(pack, sp, DAY, pack.questions);
    expect(out).toHaveLength(pack.questions.length);
    expect(new Set(out.map((x) => x.id)).size).toBe(pack.questions.length);
    expect(out.slice(0, pack.questions.length - 2).map((x) => x.id)).toEqual(pack.questions.slice(2).map((x) => x.id));
    expect(out.slice(-2).map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('keeps the mock exam open from level 1, at any length up to the whole pack', () => {
    expect('mock' in UNLOCK_LV).toBe(false);
    expect(pickMock(pack, 50)).toHaveLength(50);
    expect(pickMock(pack, 999)).toHaveLength(pack.questions.length);
  });
});

describe('what a fight asks now', () => {
  it('puts missed questions first, keeps one from the shadow\'s topic and at most two per topic', () => {
    const sp = newProgress();
    const missed = pack.questions.filter((x) => x.topicId === 't-rag').slice(0, 3);
    for (const m of missed) recordAnswer(sp, m, false, 'sure', 5000, [], 'drill', DAY, 0);
    const foe = 't-speech';
    const out = pickNow(pack, sp, DAY, 4, { foe });
    expect(out).toHaveLength(4);
    expect(out.filter((x) => x.why === 'miss')).toHaveLength(2);
    expect(out.some((x) => x.q.topicId === foe)).toBe(true);
    const per: Record<string, number> = {};
    for (const x of out) per[x.q.topicId] = (per[x.q.topicId] || 0) + 1;
    expect(Math.max(...Object.values(per))).toBeLessThanOrEqual(2);
  });

  it('does not ask again what was just answered right today when there is other work', () => {
    const sp = newProgress();
    const done = pack.questions.filter((x) => x.topicId === 't-agents');
    for (const d of done) recordAnswer(sp, d, true, 'sure', 5000, d.answer, 'drill', DAY, 0);
    const out = pickNow(pack, sp, DAY, 4, { foe: 't-agents' });
    expect(out.filter((x) => x.q.topicId === 't-agents').length).toBeLessThanOrEqual(1);
  });
});
