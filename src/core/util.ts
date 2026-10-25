// Small shared helpers: local dates, ids, numbers, text.

export const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export const ymd = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toUTC = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const dayDiff = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5);

export const addDays = (s: string, n: number) => {
  const t = new Date(toUTC(s) + n * 864e5);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** 0 = Sunday … 6 = Saturday */
export const dow = (s: string) => new Date(toUTC(s)).getUTCDay();

/** Monday of the week that contains s. */
export const weekStart = (s: string) => addDays(s, -((dow(s) + 6) % 7));

export const DOW = ['日', '月', '火', '水', '木', '金', '土'];
export const dowName = (s: string) => DOW[dow(s)] + '曜';

/** "10.25" */
export const md = (s: string) => {
  const [, m, d] = s.split('-');
  return `${Number(m)}.${d}`;
};

/** "10/25" */
export const mdSlash = (s: string) => {
  const [, m, d] = s.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export const monthKey = (s: string = ymd()) => s.slice(0, 7);

export const hm = (d: Date = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function uid(prefix = '') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36).slice(0, 4);
}

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Deterministic PRNG (mulberry32) so procedural art is stable. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Escape text that goes into generated SVG/HTML markup. */
export function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

let calm = false;
/** 動きを控えめに: the person's own switch, on top of the device's reduce-motion setting. */
export function setCalm(on: boolean) {
  if (calm === on) return;
  calm = on;
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('z-calm', on);
}

export const reducedMotion = () => {
  if (calm) return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export function sumBy<T>(a: T[], f: (x: T) => number) {
  let s = 0;
  for (const x of a) s += f(x);
  return s;
}
