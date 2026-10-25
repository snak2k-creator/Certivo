// Every certification pack in the registry, checked the same way, so a new one can be added without surprises.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Pack, Registry } from '../src/core/types';

const dir = new URL('../public/certs/', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as Registry;
const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe('the registry', () => {
  it('lists each pack once', () => {
    expect(registry.certs.length).toBeGreaterThan(0);
    expect(unique(registry.certs.map((c) => c.id))).toBe(true);
  });
});

describe.each(registry.certs.map((c) => [c.id, c] as const))('pack %s', (_, entry) => {
  const pk = JSON.parse(readFileSync(new URL(entry.file, dir), 'utf8')) as Pack;
  const domains = new Set(pk.domains.map((d) => d.id));
  const topics = new Set(pk.topics.map((t) => t.id));

  it('matches its registry entry', () => {
    expect(pk.id).toBe(entry.id);
    expect(pk.code).toBe(entry.code);
    expect(pk.packVersion).toBe(entry.version);
    expect(pk.passingScore).toBeLessThanOrEqual(pk.scoreMax);
  });

  it('has domains with sane weights and topics in them', () => {
    expect(unique(pk.domains.map((d) => d.id))).toBe(true);
    for (const d of pk.domains) expect(d.weightMin).toBeLessThanOrEqual(d.weightMax);
    expect(unique(pk.topics.map((t) => t.id))).toBe(true);
    for (const t of pk.topics) {
      expect(domains.has(t.domainId), t.id).toBe(true);
      expect(t.overview, t.id).toBeTruthy();
      if (t.order) expect(t.order.steps.length, t.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('has questions whose answers are among their options', () => {
    expect(unique(pk.questions.map((q) => q.id))).toBe(true);
    for (const q of pk.questions) {
      const opts = q.options.map((o) => o.id);
      expect(topics.has(q.topicId), q.id).toBe(true);
      expect(unique(opts), q.id).toBe(true);
      expect(q.answer.every((a) => opts.includes(a)), q.id).toBe(true);
      expect(q.type === 'single' ? q.answer.length === 1 : q.answer.length >= 2, q.id).toBe(true);
      expect(Object.keys(q.whyWrong ?? {}).every((k) => opts.includes(k) && !q.answer.includes(k)), q.id).toBe(true);
    }
  });

  it('has words and a big picture that point at real things', () => {
    const terms = pk.terms ?? [];
    if (!terms.length) return;
    const ids = terms.map((t) => t.id);
    expect(unique(ids)).toBe(true);
    for (const t of terms) {
      expect(t.word && t.mean, t.id).toBeTruthy();
      if (t.topicId) expect(topics.has(t.topicId), t.id).toBe(true);
      if (t.vs) expect(ids.includes(t.vs.id) && t.vs.id !== t.id, t.id).toBe(true);
    }
    const g = pk.guide!;
    expect(g, 'a pack with words needs a guide').toBeTruthy();
    expect([...g.path].sort()).toEqual([...topics].sort());
    for (const b of g.basics) expect(terms.find((t) => t.id === b && !t.topicId), b).toBeTruthy();
    expect(g.map.every((m) => domains.has(m.domainId))).toBe(true);
    // every topic has words to learn before its questions
    for (const t of pk.topics) expect(terms.some((x) => x.topicId === t.id), t.id).toBe(true);
  });
});
