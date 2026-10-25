// The app state and where it lives. Three separate blobs on this device: profile, personal, work.
// Nothing leaves the device unless sync is turned on for that notebook (off at first).
import type { Notebook, Pack, Personal, Profile, Registry, Work } from './types';
import { newGame, levelFromTotal } from './game';
import { newProgress } from './study';
import { monthKey, ymd } from './util';

export interface User { uid: string; name: string; photo?: string; email?: string }
export interface Status {
  /** the server has AI turned on */
  ai: boolean;
  /** how the server lets people use AI: sign-in required, anonymous with limits, or closed */
  aiMode: 'firebase' | 'anon' | 'none';
  /** Google sign-in is set up for this build */
  auth: boolean;
  online: boolean;
  user: User | null;
  syncing: boolean;
  syncError: string;
}

export interface AppState {
  profile: Profile;
  p: Personal;
  w: Work;
  registry: Registry | null;
  packs: Record<string, Pack>;
  status: Status;
  rev: number;
}

const KEY = { profile: 'zan:profile', p: 'zan:personal', w: 'zan:work' } as const;
type Part = keyof typeof KEY;

export const newProfile = (): Profile => ({
  v: 1,
  updatedAt: 0,
  onboarded: false,
  nightly: false,
  sound: true,
  haptics: true,
  ritual: true,
  lastRitual: '',
  certId: 'ai-103',
  packs: [{ certId: 'ai-103', code: 'AI-103', name: 'Azure AI Apps and Agents Developer Associate', examDate: '', status: 'studying' }],
  mode: 'p',
  sync: { p: false, w: false },
  aiAuto: false,
  aiCap: 120,
  aiLimit: 0,
});
export const newPersonal = (): Personal => ({
  v: 1,
  updatedAt: 0,
  tasks: [],
  game: newGame(),
  days: {},
  study: {},
  boss: { lost: [] },
  zukan: [],
  recaps: {},
  ai: { month: monthKey(), used: 0 },
});
export const newWork = (): Work => ({ v: 1, updatedAt: 0, tasks: [], sent: [] });

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

/** Old Certivo records move over once: study cards, history, XP, streak and the exam date. */
function migrateCertivo(p: Personal, profile: Profile) {
  const old = read<any>('certivo:prog-ai-103');
  const oldProfile = read<any>('certivo:profile');
  if (!old && !oldProfile) return false;
  if (old) {
    const sp = newProgress();
    for (const [id, c] of Object.entries<any>(old.cards || {})) {
      sp.cards[id] = { box: c.box ?? 0, due: c.due || ymd(), seen: c.seen ?? 0, correct: c.correct ?? 0, lastAt: c.lastAt || '', lastConf: c.lastConfidence || '' };
    }
    for (const [d, h] of Object.entries<any>(old.history || {})) sp.history[d] = { a: h.a ?? 0, c: h.c ?? 0 };
    sp.streak = old.streak ?? 0;
    sp.bestStreak = old.bestStreak ?? 0;
    sp.lastStudyDate = old.lastStudyDate || '';
    p.study['ai-103'] = sp;
    const total = Math.max(0, Number(old.xp) || 0);
    const r = levelFromTotal(total);
    p.game.total = total;
    p.game.lv = r.lv;
    p.game.xp = r.xp;
    p.game.skills['知'] = total;
  }
  const exam = oldProfile?.certs?.find((c: any) => c.certId === 'ai-103')?.examDate;
  if (exam) profile.packs[0].examDate = exam;
  profile.migratedFrom = 'certivo';
  return true;
}

function load(): AppState {
  const profile = { ...newProfile(), ...(read<Profile>(KEY.profile) || {}) };
  const p = { ...newPersonal(), ...(read<Personal>(KEY.p) || {}) };
  const w = { ...newWork(), ...(read<Work>(KEY.w) || {}) };
  if (!profile.updatedAt && !p.updatedAt && migrateCertivo(p, profile)) {
    profile.updatedAt = p.updatedAt = Date.now();
    write(KEY.profile, profile);
    write(KEY.p, p);
  }
  return {
    profile,
    p,
    w,
    registry: null,
    packs: {},
    status: { ai: false, aiMode: 'none', auth: false, online: typeof navigator === 'undefined' ? true : navigator.onLine, user: null, syncing: false, syncError: '' },
    rev: 0,
  };
}

export const state: AppState = load();

const listeners = new Set<() => void>();
export function subscribe(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}
let queued = false;
export function emit() {
  state.rev++;
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    listeners.forEach((f) => f());
  });
}

type Saver = (part: Part) => void;
const savers = new Set<Saver>();
/** Cloud sync registers here; it decides per notebook whether to send anything. */
export function onSave(f: Saver) {
  savers.add(f);
  return () => savers.delete(f);
}

let storageWarned = false;
/** Marks parts as changed: saves them on this device right away and tells sync. */
export function commit(...parts: Part[]) {
  const now = Date.now();
  for (const part of parts) {
    const obj = part === 'profile' ? state.profile : state[part];
    obj.updatedAt = now;
    if (!write(KEY[part], obj) && !storageWarned) {
      storageWarned = true;
      console.warn('ZAN: could not save to this device');
    }
    savers.forEach((f) => f(part));
  }
  emit();
}

/** Replaces a whole part (sync from the cloud, import, delete). */
export function replace(part: Part, value: Profile | Personal | Work, silent = false) {
  if (part === 'profile') state.profile = { ...newProfile(), ...(value as Profile) };
  else if (part === 'p') state.p = { ...newPersonal(), ...(value as Personal) };
  else state.w = { ...newWork(), ...(value as Work) };
  write(KEY[part], part === 'profile' ? state.profile : state[part]);
  if (!silent) savers.forEach((f) => f(part));
  emit();
}

/* ---------- one level of undo ---------- */
let undoSnap: { label: string; parts: Partial<Record<Part, string>> } | null = null;
export function snapshot(label: string, ...parts: Part[]) {
  const snap: Partial<Record<Part, string>> = {};
  for (const part of parts) snap[part] = JSON.stringify(part === 'profile' ? state.profile : state[part]);
  undoSnap = { label, parts: snap };
}
export const canUndo = () => !!undoSnap;
export const undoLabel = () => undoSnap?.label ?? '';
export function undo() {
  if (!undoSnap) return null;
  const s = undoSnap;
  undoSnap = null;
  for (const [part, json] of Object.entries(s.parts) as [Part, string][]) {
    const v = JSON.parse(json);
    if (part === 'profile') state.profile = v;
    else if (part === 'p') state.p = v;
    else state.w = v;
  }
  commit(...(Object.keys(s.parts) as Part[]));
  return s.label;
}
export const dropUndo = () => (undoSnap = null);

export const notebook = (nb: Notebook) => (nb === 'p' ? state.p : state.w);

export function setStatus(patch: Partial<Status>) {
  Object.assign(state.status, patch);
  emit();
}

export function wipeLocal(part: Part) {
  try {
    localStorage.removeItem(KEY[part]);
  } catch {
    /* ignore */
  }
}
