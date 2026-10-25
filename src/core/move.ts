// The site moved from certivo-lake.vercel.app to zan-study.vercel.app. Records live in the browser per address,
// so the old address carries them along: it packs its zan:/certivo: keys into the link and sends the person to the
// new address, which unpacks them before the store loads. Imported first, before anything reads localStorage.

export const OLD_HOST = 'certivo-lake.vercel.app';
export const NEW_ORIGIN = 'https://zan-study.vercel.app';
const MOVED = 'zan:moved';
const TAG = '#move=';

const ours = (k: string) => k.startsWith('zan:') || k.startsWith('certivo:');

export function pack(store: Storage): string {
  const out: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && ours(k) && k !== MOVED) out[k] = store.getItem(k) || '';
  }
  if (!Object.keys(out).length) return '';
  const bytes = new TextEncoder().encode(JSON.stringify(out));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unpack(s: string): Record<string, string> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return o && typeof o === 'object' ? (o as Record<string, string>) : null;
  } catch {
    return null;
  }
}

const stamp = (v: string | null | undefined) => {
  try {
    return v ? Number(JSON.parse(v).updatedAt) || 0 : 0;
  } catch {
    return 0;
  }
};

/** Writes the carried records unless this address already holds newer ones. */
export function receive(store: Storage, data: Record<string, string>) {
  const theirs = Math.max(stamp(data['zan:personal']), stamp(data['zan:profile']));
  const mine = Math.max(stamp(store.getItem('zan:personal')), stamp(store.getItem('zan:profile')));
  if (mine > theirs) return false;
  for (const [k, v] of Object.entries(data)) if (ours(k)) store.setItem(k, v);
  return true;
}

function run() {
  if (typeof location === 'undefined') return;
  try {
    if (location.hostname === OLD_HOST) {
      const moved = localStorage.getItem(MOVED);
      const data = moved ? '' : pack(localStorage);
      if (!moved) localStorage.setItem(MOVED, String(Date.now()));
      location.replace(NEW_ORIGIN + '/' + (data ? TAG + data : location.hash));
      return;
    }
    if (location.hash.startsWith(TAG)) {
      const data = unpack(location.hash.slice(TAG.length));
      if (data) receive(localStorage, data);
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch {
    /* storage blocked: the app still opens, just without the carried records */
  }
}
run();
