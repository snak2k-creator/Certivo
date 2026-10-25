// What the PC layout shares: the modifier key's name, focusing the line to write in, and the notebook switch.
import type { Notebook } from '../core/types';
import { state } from '../core/store';
import { setProfile } from '../core/actions';
import { sfx } from '../core/sfx';
import { go, route } from '../ui/router';

export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
/** ⌘ on a Mac, Ctrl elsewhere: shown on the keys, checked on the events. */
export const MOD = MAC ? '⌘' : 'Ctrl ';
export const modKey = (e: KeyboardEvent) => (MAC ? e.metaKey : e.ctrlKey);

/** Pages that only exist in the personal notebook. */
export const PERSONAL_ONLY = new Set(['battle', 'zukan', 'growth', 'recap']);

export function switchBook(m: Notebook) {
  if (state.profile.mode === m) return;
  sfx('flip');
  setProfile({ mode: m });
  if (m === 'w' && PERSONAL_ONLY.has(route().name)) go('today');
}

/** Puts the cursor in 今日's writing line, coming back to 今日 first when needed. */
export function focusAdd() {
  const el = () => document.getElementById('pt-add-in') as HTMLInputElement | null;
  if (el()) {
    el()!.focus();
    return;
  }
  go('today');
  setTimeout(() => el()?.focus(), 60);
}
