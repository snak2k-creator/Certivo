// Certification packs: versioned question sets, loaded from /certs and kept offline by the service worker.
import type { Pack, Registry } from './types';
import { emit, state } from './store';

export async function loadRegistry() {
  const r = await fetch('/certs/index.json');
  if (!r.ok) throw new Error('registry');
  state.registry = (await r.json()) as Registry;
  emit();
  return state.registry;
}

export async function loadPack(id: string) {
  if (state.packs[id]) return state.packs[id];
  const reg = state.registry || (await loadRegistry());
  const entry = reg.certs.find((c) => c.id === id);
  if (!entry) return null;
  const r = await fetch('/certs/' + entry.file);
  if (!r.ok) return null;
  const pk = (await r.json()) as Pack;
  state.packs[id] = pk;
  emit();
  return pk;
}

/** Every certification the person has added, so a shadow or a 図鑑 page from another one still draws. */
export async function loadPacks() {
  for (const e of state.profile.packs) await loadPack(e.certId).catch(() => null);
}

export const activePack = () => state.packs[state.profile.certId];
/** A certification's pack, falling back to the active one (a shadow, a 図鑑 page or a task can be from another). */
export const packOf = (certId?: string) => (certId && state.packs[certId]) || activePack();
export const topicById = (pk: Pack, id: string) => pk.topics.find((t) => t.id === id);
export const questionById = (pk: Pack, id: string) => pk.questions.find((q) => q.id === id);
