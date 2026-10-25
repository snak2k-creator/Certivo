// Google sign-in and sync through Firebase. Nothing loads unless the build is configured and the person
// asks for it. Each notebook syncs only after it is turned on for that notebook (off at first), as its own
// document: users/{uid}/books/{p|w|profile}.
import type { Personal, Profile, Work } from './types';
import { commit, onSave, replace, setStatus, state } from './store';

type Part = 'profile' | 'p' | 'w';
type Book = Profile | Personal | Work;

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};
export const cloudConfigured = () => !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

/** Settings that belong to this device and are never taken from the cloud. */
const LOCAL_ONLY = ['sync', 'nightly', 'aiAuto', 'sound', 'haptics', 'mode', 'onboarded', 'lastRitual'] as const;
const SIGNED_IN = 'zan:signedIn';

interface FB {
  a: typeof import('firebase/auth');
  f: typeof import('firebase/firestore');
  auth: import('firebase/auth').Auth;
  db: import('firebase/firestore').Firestore;
}
let fb: Promise<FB> | null = null;
function load() {
  return (fb ||= (async () => {
    const [app, a, f] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const inst = app.initializeApp(cfg);
    return { a, f, auth: a.getAuth(inst), db: f.getFirestore(inst) };
  })());
}

const remember = (on: boolean) => {
  try {
    if (on) localStorage.setItem(SIGNED_IN, '1');
    else localStorage.removeItem(SIGNED_IN);
  } catch {
    /* private mode */
  }
};

let started = false;
async function start() {
  if (started) return load();
  started = true;
  const x = await load();
  x.a.onAuthStateChanged(x.auth, (u) => {
    if (u) {
      setStatus({ user: { uid: u.uid, name: u.displayName || '', photo: u.photoURL || undefined } });
      remember(true);
      attach();
    } else {
      detach();
      setStatus({ user: null });
      remember(false);
    }
  });
  x.a.getRedirectResult(x.auth).catch(() => setStatus({ syncError: 'ログインできませんでした。もう一度 お試しください' }));
  return x;
}

/** On startup: Firebase loads only if this device was signed in before, so the first screen stays light. */
export function initCloud() {
  setStatus({ auth: cloudConfigured() });
  if (!cloudConfigured()) return;
  let before = false;
  try {
    before = !!localStorage.getItem(SIGNED_IN);
  } catch {
    /* private mode */
  }
  if (before) start().catch(() => setStatus({ syncError: 'ログインの準備が できませんでした' }));
}

export async function signIn() {
  if (!cloudConfigured()) return false;
  const { a, auth } = await start();
  const provider = new a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await a.signInWithPopup(auth, provider);
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await a.signInWithRedirect(auth, provider);
      return false;
    }
    throw e;
  }
}

export async function signOut() {
  if (!fb) return;
  const { a, auth } = await fb;
  detach();
  await a.signOut(auth);
}

/** The ID token the AI endpoints check; null when not signed in. */
export async function idToken() {
  if (!fb || !state.status.user) return null;
  const { auth } = await fb;
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

/* ---------- sync ---------- */

const enabled = (part: Part) => (part === 'profile' ? state.profile.sync.p || state.profile.sync.w : state.profile.sync[part]);
const local = (part: Part): Book => (part === 'profile' ? state.profile : state[part]);

function withoutLocal(p: Profile) {
  const out: Partial<Profile> = { ...p };
  for (const k of LOCAL_ONLY) delete out[k];
  return out;
}
function apply(part: Part, value: Book) {
  if (part === 'profile') {
    const mine: Partial<Profile> = {};
    for (const k of LOCAL_ONLY) (mine as Record<string, unknown>)[k] = state.profile[k];
    replace('profile', { ...(value as Profile), ...mine }, true);
  } else replace(part, value, true);
}

const unsubs: Partial<Record<Part, () => void>> = {};
const timers: Partial<Record<Part, ReturnType<typeof setTimeout>>> = {};

async function ref(part: Part) {
  const user = state.status.user;
  if (!user) return null;
  const { f, db } = await load();
  return { f, doc: f.doc(db, 'users', user.uid, 'books', part) };
}

async function listen(part: Part) {
  if (unsubs[part]) return;
  const r = await ref(part);
  if (!r || unsubs[part]) return;
  unsubs[part] = r.f.onSnapshot(
    r.doc,
    (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const d = snap.data() as { data?: string; updatedAt?: number };
      if (typeof d.updatedAt !== 'number' || typeof d.data !== 'string' || d.updatedAt <= local(part).updatedAt) return;
      try {
        apply(part, JSON.parse(d.data) as Book);
      } catch {
        /* a broken copy in the cloud never replaces this device's data */
      }
    },
    () => setStatus({ syncError: '同期できませんでした。この端末には 保存されています' }),
  );
}

function stop(part: Part) {
  unsubs[part]?.();
  delete unsubs[part];
}

function attach() {
  for (const part of ['profile', 'p', 'w'] as Part[]) if (enabled(part)) void listen(part);
}
function detach() {
  for (const part of Object.keys(unsubs) as Part[]) stop(part);
}

async function push(part: Part) {
  const r = await ref(part);
  if (!r) return;
  const obj = local(part);
  const data = JSON.stringify(part === 'profile' ? withoutLocal(obj as Profile) : obj);
  setStatus({ syncing: true });
  try {
    await r.f.setDoc(r.doc, { data, updatedAt: Math.floor(obj.updatedAt), v: 1 });
    setStatus({ syncing: false, syncError: '' });
  } catch {
    setStatus({ syncing: false, syncError: '同期できませんでした。この端末には 保存されています' });
  }
}

onSave((part) => {
  if (!enabled(part) || !state.status.user) return;
  clearTimeout(timers[part]);
  timers[part] = setTimeout(() => void push(part), 1200);
});

/** What the cloud has for a notebook, to show before the person picks which copy to keep. */
export async function remoteInfo(part: 'p' | 'w') {
  const r = await ref(part);
  if (!r) return null;
  const snap = await r.f.getDoc(r.doc);
  if (!snap.exists()) return null;
  const d = snap.data() as { data?: string; updatedAt?: number };
  try {
    const book = JSON.parse(d.data || '') as Personal | Work;
    return { updatedAt: d.updatedAt || 0, tasks: Array.isArray(book.tasks) ? book.tasks.length : 0, book };
  } catch {
    return null;
  }
}

/** Turns sync on for one notebook. use: which copy wins the first time. */
export async function enableSync(part: 'p' | 'w', use: 'device' | 'cloud') {
  if (!state.status.user) return false;
  if (use === 'cloud') {
    const info = await remoteInfo(part);
    if (info) apply(part, info.book);
  }
  state.profile.sync[part] = true;
  commit('profile');
  if (use === 'device') await push(part);
  await push('profile');
  void listen(part);
  void listen('profile');
  return true;
}

export function disableSync(part: 'p' | 'w') {
  state.profile.sync[part] = false;
  commit('profile');
  stop(part);
  if (!enabled('profile')) stop('profile');
}

/** Removes the cloud copy of a notebook (used by delete). */
export async function deleteRemote(part: Part) {
  const r = await ref(part);
  if (!r) return;
  stop(part);
  await r.f.deleteDoc(r.doc);
}
