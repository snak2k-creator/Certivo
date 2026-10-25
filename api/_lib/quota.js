// Usage caps. Each caller gets ZAN_AI_MONTHLY requests a month (default 120), everyone together gets
// ZAN_AI_MONTHLY_TOTAL (default 3000), and nobody gets more than a few a minute. With FIREBASE_SERVICE_ACCOUNT
// the monthly counts live in Firestore; without it they live in memory and reset when the server restarts,
// so set a spend limit in the Anthropic Console as well.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);
export const monthlyCap = (kind) => (kind === 'anon' ? num(process.env.ZAN_AI_MONTHLY_ANON, 20) : num(process.env.ZAN_AI_MONTHLY, 120));
const totalCap = () => num(process.env.ZAN_AI_MONTHLY_TOTAL, 3000);
const PER_MINUTE = 6;

const month = () => new Date().toISOString().slice(0, 7);

let db = null;
function firestore() {
  if (db !== null) return db;
  db = false;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return db;
  try {
    const sa = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    const app = getApps()[0] || initializeApp({ credential: cert(sa), projectId: sa.project_id });
    db = getFirestore(app);
  } catch (e) {
    console.error('zan: FIREBASE_SERVICE_ACCOUNT could not be read', e instanceof Error ? e.message : '');
  }
  return db;
}

/* in-memory counters: the per-minute burst limit, and the monthly fallback */
const mem = new Map();
const recent = new Map();

function burstOk(id) {
  const now = Date.now();
  const list = (recent.get(id) || []).filter((t) => now - t < 60_000);
  if (list.length >= PER_MINUTE) {
    recent.set(id, list);
    return false;
  }
  list.push(now);
  recent.set(id, list);
  if (recent.size > 5000) recent.clear();
  return true;
}

/**
 * Takes one use for this caller. Returns { ok, left, cap, reason }.
 * reason: 'burst' (too fast), 'month' (this caller's cap), 'total' (everyone's cap).
 */
export async function take(who) {
  const cap = monthlyCap(who.kind);
  if (!burstOk(who.id)) return { ok: false, left: null, cap, reason: 'burst' };
  const m = month();
  const store = firestore();
  if (store) {
    const mine = store.doc(`zanUsage/${m}_${who.id}`);
    const all = store.doc(`zanUsage/${m}__total`);
    return store.runTransaction(async (tx) => {
      const [a, b] = await Promise.all([tx.get(mine), tx.get(all)]);
      const used = a.exists ? Number(a.get('used')) || 0 : 0;
      const total = b.exists ? Number(b.get('used')) || 0 : 0;
      if (used >= cap) return { ok: false, left: 0, cap, reason: 'month' };
      if (total >= totalCap()) return { ok: false, left: cap - used, cap, reason: 'total' };
      tx.set(mine, { used: used + 1, month: m, at: Date.now() }, { merge: true });
      tx.set(all, { used: total + 1, month: m, at: Date.now() }, { merge: true });
      return { ok: true, left: cap - used - 1, cap, reason: '' };
    });
  }
  const key = `${m}_${who.id}`;
  const used = mem.get(key) || 0;
  const total = mem.get(`${m}__total`) || 0;
  if (used >= cap) return { ok: false, left: 0, cap, reason: 'month' };
  if (total >= totalCap()) return { ok: false, left: cap - used, cap, reason: 'total' };
  mem.set(key, used + 1);
  mem.set(`${m}__total`, total + 1);
  return { ok: true, left: cap - used - 1, cap, reason: '' };
}

/** Gives a use back when the request failed before anything useful came out. */
export async function giveBack(who) {
  const m = month();
  const store = firestore();
  try {
    if (store) {
      const mine = store.doc(`zanUsage/${m}_${who.id}`);
      const all = store.doc(`zanUsage/${m}__total`);
      await store.runTransaction(async (tx) => {
        const [a, b] = await Promise.all([tx.get(mine), tx.get(all)]);
        if (a.exists) tx.set(mine, { used: Math.max(0, (Number(a.get('used')) || 0) - 1) }, { merge: true });
        if (b.exists) tx.set(all, { used: Math.max(0, (Number(b.get('used')) || 0) - 1) }, { merge: true });
      });
      return;
    }
    const key = `${m}_${who.id}`;
    mem.set(key, Math.max(0, (mem.get(key) || 0) - 1));
    mem.set(`${m}__total`, Math.max(0, (mem.get(`${m}__total`) || 0) - 1));
  } catch {
    /* a lost refund only costs the caller one use */
  }
}

/** How many uses this caller has left this month, without taking one. */
export async function left(who) {
  const cap = monthlyCap(who.kind);
  const m = month();
  const store = firestore();
  if (store) {
    try {
      const a = await store.doc(`zanUsage/${m}_${who.id}`).get();
      return { left: Math.max(0, cap - (a.exists ? Number(a.get('used')) || 0 : 0)), cap };
    } catch {
      return { left: null, cap };
    }
  }
  return { left: Math.max(0, cap - (mem.get(`${m}_${who.id}`) || 0)), cap };
}
