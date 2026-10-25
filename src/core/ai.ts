// Talking to ZAN's server for AI. The key lives on the server; this side sends only the fields each request
// needs, keeps the monthly count in step with the server, and falls back to the on-device text on any failure.
import type { Pack } from './types';
import type { DaySummary } from './recap';
import { commit, setStatus, state } from './store';
import { aiLeft, setRecapText, today } from './actions';
import { idToken } from './cloud';
import { RECAP_HOUR, summarize } from './recap';
import { ENEMY, topicShort } from './enemy';
import { stumbles } from './study';
import { openTopics } from './learn';
import { packOf } from './pack';
import { addDays, dayDiff, monthKey } from './util';

export interface PlanStep { title: string; time: string; mins: number }
export interface SuggestTopic { id: string; name: string; missedYesterday: number; accuracy: number | null; answered: number }
export interface AiIn {
  recap: DaySummary;
  suggest: { topics: SuggestTopic[]; daysLeft: number | null };
  boss: { type: string; weak: string; topic: string; born: string };
  plan: { date: string; items: { title: string; time?: string; mins?: number }[]; start?: string; end?: string };
}
export interface AiOut {
  recap: { text: string };
  suggest: { topicId: string; title: string; reason: string };
  boss: { name: string; taunt: string };
  plan: { steps: PlanStep[]; note: string };
}
export interface TutorIn { stem: string; options: { id: string; text: string }[]; answer: string[]; pick: string[]; explanation: string; ask?: string }

async function headers(): Promise<Record<string, string>> {
  const t = await idToken().catch(() => null);
  return t ? { authorization: 'Bearer ' + t } : {};
}

/** Keeps the local count in step with what the server says is left this month. */
function syncLeft(left: unknown, cap: unknown) {
  if (typeof cap === 'number' && cap > 0 && cap !== state.profile.aiCap) {
    state.profile.aiCap = cap;
    commit('profile');
  }
  if (typeof left !== 'number' || !Number.isFinite(left)) return;
  const ai = state.p.ai;
  const used = Math.max(0, state.profile.aiCap - left);
  if (ai.month !== monthKey() || ai.used !== used) {
    ai.month = monthKey();
    ai.used = used;
    commit('p');
  }
}

export async function checkAi() {
  try {
    const r = await fetch('/api/status', { headers: await headers(), cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { ai?: boolean; auth?: string; left?: number | null; cap?: number };
    setStatus({ ai: !!j.ai, aiMode: j.auth === 'firebase' || j.auth === 'anon' ? j.auth : 'none' });
    syncLeft(j.left, j.cap);
  } catch {
    setStatus({ ai: false });
  }
}

/** Why AI can't be used right now, or '' when it can. */
export function aiBlocked() {
  const s = state.status;
  if (!s.ai) return 'off';
  if (!s.online) return 'offline';
  if (s.aiMode === 'firebase' && !s.user) return 'signin';
  if (aiLeft() <= 0) return 'cap';
  return '';
}
export const aiReady = () => aiBlocked() === '';

export async function askAi<K extends keyof AiIn>(kind: K, input: AiIn[K]): Promise<AiOut[K] | null> {
  if (!aiReady()) return null;
  try {
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await headers()) },
      body: JSON.stringify({ kind, input }),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; data?: AiOut[K]; left?: number; cap?: number } | null;
    if (j) syncLeft(j.left, j.cap);
    if (r.status === 503) setStatus({ ai: false });
    return r.ok && j?.ok && j.data ? j.data : null;
  } catch {
    return null;
  }
}

/** Streams the tutor's explanation. Returns false when nothing could be asked. */
export async function askTutor(input: TutorIn, onText: (t: string) => void, signal?: AbortSignal) {
  if (!aiReady()) return false;
  try {
    const r = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await headers()) },
      body: JSON.stringify({ input }),
      signal,
    });
    if (!r.ok || !r.body) {
      const j = (await r.json().catch(() => null)) as { left?: number; cap?: number } | null;
      if (j) syncLeft(j.left, j.cap);
      return false;
    }
    syncLeft(Number(r.headers.get('x-zan-left') || NaN), Number(r.headers.get('x-zan-cap') || NaN));
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onText(dec.decode(value, { stream: true }));
    }
    return true;
  } catch {
    return false;
  }
}

/* ---------- the automatic jobs (each needs its own consent, off at first) ---------- */

const TRIED = 'zan:aiTried';
/** Each automatic job runs once per day/shadow on this device, even when it fails. */
function firstTry(key: string) {
  let seen: Record<string, number> = {};
  try {
    seen = JSON.parse(localStorage.getItem(TRIED) || '{}');
  } catch {
    /* start over */
  }
  if (seen[key]) return false;
  seen[key] = Date.now();
  const keep = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 40);
  try {
    localStorage.setItem(TRIED, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* fine */
  }
  return true;
}

export function suggestInput(pk: Pack, date: string): AiIn['suggest'] {
  const sp = state.p.study[pk.id];
  const st = sp ? stumbles(pk, sp, addDays(date, -1)) : {};
  // only what has been learned: the suggestion is a drill, and a drill comes after the lesson
  const open = sp ? openTopics(pk, sp) : new Set<string>();
  const topics = pk.topics.filter((t) => !open.size || open.has(t.id)).map((t) => {
    let seen = 0;
    let correct = 0;
    for (const q of pk.questions) {
      if (q.topicId !== t.id) continue;
      const c = sp?.cards[q.id];
      if (c) {
        seen += c.seen;
        correct += c.correct;
      }
    }
    return { id: t.id, name: topicShort(t), missedYesterday: st[t.id] || 0, accuracy: seen ? Math.round((correct / seen) * 100) : null, answered: seen };
  });
  const exam = state.profile.packs.find((x) => x.certId === pk.id)?.examDate;
  return { topics, daysLeft: exam ? Math.max(0, dayDiff(date, exam)) : null };
}

/** Runs after the day is set up: rewrites the nightly page, today's suggestion and the shadow's name. */
export async function autoAi(pk: Pack | undefined, date = today()) {
  if (!pk || !aiReady()) return;
  if (state.profile.nightly) {
    for (const d of [addDays(date, -1), date]) {
      const r = state.p.recaps[d];
      if (!r || r.deleted || r.source === 'ai') continue;
      if (d === date && new Date().getHours() < RECAP_HOUR) continue;
      if (!firstTry('recap:' + d)) continue;
      const out = await askAi('recap', summarize(state.p, pk, state.profile.certId, d, date));
      if (out) setRecapText(d, out.text, 'ai');
    }
  }
  if (!state.profile.aiAuto) return;
  const sug = state.p.ai.sug;
  if (sug && sug.date === date && sug.source === 'zan' && !sug.done && firstTry('sug:' + date)) {
    const out = await askAi('suggest', suggestInput(pk, date));
    const now = state.p.ai.sug;
    if (out && now && now.date === date && !now.done) {
      Object.assign(now, out, { source: 'ai' });
      commit('p');
    }
  }
  const b = state.p.boss.cur;
  if (b && b.source === 'zan' && b.hp > 0 && firstTry('boss:' + b.id)) {
    const topic = packOf(b.certId)?.topics.find((t) => t.id === b.topicId);
    const out = await askAi('boss', { type: b.type, weak: ENEMY[b.type].weak, topic: topic ? topicShort(topic) : '', born: b.born });
    if (out && state.p.boss.cur?.id === b.id) {
      b.name = out.name;
      b.taunt = out.taunt;
      b.source = 'ai';
      commit('p');
    }
  }
}
