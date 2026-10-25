import { describe, expect, it } from 'vitest';
import { pack, receive, unpack } from '../src/core/move';

class Mem implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('moving to the new address', () => {
  it('carries zan and certivo keys, Japanese included, and nothing else', () => {
    const a = new Mem();
    a.setItem('zan:personal', JSON.stringify({ updatedAt: 5, tasks: [{ title: '斬る' }] }));
    a.setItem('certivo:profile', '{"x":1}');
    a.setItem('other', 'no');
    const d = unpack(pack(a))!;
    expect(Object.keys(d).sort()).toEqual(['certivo:profile', 'zan:personal']);
    expect(JSON.parse(d['zan:personal']).tasks[0].title).toBe('斬る');
  });
  it('packs nothing when there is nothing', () => {
    expect(pack(new Mem())).toBe('');
  });
  it('keeps newer records already at the new address', () => {
    const b = new Mem();
    b.setItem('zan:personal', JSON.stringify({ updatedAt: 9 }));
    expect(receive(b, { 'zan:personal': JSON.stringify({ updatedAt: 5 }) })).toBe(false);
    expect(JSON.parse(b.getItem('zan:personal')!).updatedAt).toBe(9);
    expect(receive(b, { 'zan:personal': JSON.stringify({ updatedAt: 12 }) })).toBe(true);
    expect(JSON.parse(b.getItem('zan:personal')!).updatedAt).toBe(12);
  });
  it('ignores a broken link', () => {
    expect(unpack('%%%')).toBeNull();
  });
});
