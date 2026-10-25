// The server's own rules: what a request may carry to the AI, and how many requests a caller gets.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KINDS, tutor } from '../api/_lib/prompts.js';
import { giveBack, left, take } from '../api/_lib/quota.js';
import { authMode, caller } from '../api/_lib/auth.js';

const ENV = ['ZAN_AI_MONTHLY', 'ZAN_AI_MONTHLY_ANON', 'ZAN_AI_MONTHLY_TOTAL', 'ZAN_ALLOW_ANON_AI', 'FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID'];
afterEach(() => {
  for (const k of ENV) delete process.env[k];
});

describe('what reaches the AI', () => {
  it('keeps only the known fields of a day, and only a count of work', () => {
    const job = KINDS.recap({
      date: '2026-10-21',
      answered: 5,
      correct: 4,
      workDone: 3,
      workTitles: ['A社 見積もり'],
      done: ['住民税を払う', 'x'.repeat(200)],
      note: '秘密のメモ',
    });
    expect(job.prompt).toContain('"workDone":3');
    expect(job.prompt).not.toContain('A社');
    expect(job.prompt).not.toContain('秘密');
    expect(job.prompt).not.toContain('x'.repeat(41));
  });

  it('turns away a request without its required fields', () => {
    expect(KINDS.recap({ answered: 1 })).toBeNull();
    expect(KINDS.plan({ date: '2026-10-21', items: [] })).toBeNull();
    expect(KINDS.boss({ type: 'dragon' })).toBeNull();
    expect(KINDS.suggest({ topics: [] })).toBeNull();
    expect(tutor({ stem: '問い', options: [{ id: 'a', text: 'A' }], answer: ['a'] })).toBeNull();
  });

  it('strips control characters and caps lengths', () => {
    const job = KINDS.plan({ date: '2026-10-22', items: Array.from({ length: 30 }, (_, i) => ({ title: `件${i}\u0000\n`, mins: 9999 })) });
    expect(job.prompt).not.toMatch(/[\u0000]/);
    expect(job.prompt).toContain('件11');
    expect(job.prompt).not.toContain('件12');
    expect(job.prompt).toContain('"mins":480');
  });

  it('accepts only answers that fit the schema it asked for', () => {
    const job = KINDS.suggest({ topics: [{ id: 't-rag', name: 'RAG', missedYesterday: 2, accuracy: 40, answered: 5 }], daysLeft: 12 });
    expect(job.schema.properties.topicId.enum).toEqual(['t-rag']);
    expect(job.schema.additionalProperties).toBe(false);
    expect(job.out({ topicId: 'other', title: 't', reason: 'r' })).toBeNull();
    expect(job.out({ topicId: 't-rag', title: '弱点の「RAG」を 3問', reason: 'きのう 2回 迷ったところから' })).toEqual({
      topicId: 't-rag',
      title: '弱点の「RAG」を 3問',
      reason: 'きのう 2回 迷ったところから',
    });
  });

  it('keeps plan steps inside sane bounds', () => {
    const job = KINDS.plan({ date: '2026-10-22', items: [{ title: '資料' }] });
    expect(job.out({ steps: [{ title: '資料', time: '25:00', mins: 900 }], note: '' })).toEqual({ steps: [{ title: '資料', time: '', mins: 240 }], note: '' });
    expect(job.out({ steps: [], note: 'x' })).toBeNull();
  });

  it('names the shadow from its kind, never from free text', () => {
    const job = KINDS.boss({ type: 'souei', weak: '似たもの', topic: 'RAG', born: '生まれ' });
    expect(job.out({ epithet: '鏡写しの', taunt: '見分けられるか' })).toEqual({ name: '鏡写しの双影', taunt: '見分けられるか' });
  });
});

describe('who may call', () => {
  it('is closed until sign-in or anonymous use is set up', async () => {
    expect(authMode()).toBe('none');
    expect(await caller({ headers: {} })).toBeNull();
    process.env.ZAN_ALLOW_ANON_AI = '1';
    expect(authMode()).toBe('anon');
    expect(await caller({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })).toEqual({ id: 'ip_203.0.113.9', kind: 'anon' });
  });

  it('wants a token once sign-in is set up', async () => {
    process.env.FIREBASE_PROJECT_ID = 'zan-test';
    expect(authMode()).toBe('firebase');
    expect(await caller({ headers: {} })).toBeNull();
    expect(await caller({ headers: { authorization: 'Basic abc' } })).toBeNull();
  });
});

describe('limits', () => {
  it('stops at the monthly cap and gives a use back after a failure', async () => {
    process.env.ZAN_AI_MONTHLY = '2';
    const who = { id: 'u_cap', kind: 'user' };
    expect(await take(who)).toMatchObject({ ok: true, left: 1, cap: 2 });
    expect(await take(who)).toMatchObject({ ok: true, left: 0 });
    expect(await take(who)).toMatchObject({ ok: false, reason: 'month' });
    await giveBack(who);
    expect(await left(who)).toEqual({ left: 1, cap: 2 });
  });

  it('gives anonymous callers a smaller cap', async () => {
    expect((await left({ id: 'ip_x', kind: 'anon' })).cap).toBe(20);
    expect((await left({ id: 'u_x', kind: 'user' })).cap).toBe(120);
  });

  it('slows down a burst', async () => {
    const who = { id: 'u_burst', kind: 'user' };
    for (let i = 0; i < 6; i++) expect((await take(who)).ok).toBe(true);
    expect(await take(who)).toMatchObject({ ok: false, reason: 'burst' });
  });

  it('shares one cap across everyone', async () => {
    vi.resetModules();
    const q = await import('../api/_lib/quota.js');
    process.env.ZAN_AI_MONTHLY_TOTAL = '1';
    expect(await q.take({ id: 'u_total_a', kind: 'user' })).toMatchObject({ ok: true });
    expect(await q.take({ id: 'u_total_b', kind: 'user' })).toMatchObject({ ok: false, reason: 'total' });
  });
});
