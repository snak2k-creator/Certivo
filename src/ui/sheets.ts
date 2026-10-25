// Which sheet is open. One at a time; the root renders it (a bottom sheet on phones, a drawer on PC).
import type { Notebook } from '../core/types';
import { emit } from '../core/store';
import { sfx } from '../core/sfx';

export type Sheet =
  | { kind: 'add'; nb: Notebook; date?: string }
  | { kind: 'task'; nb: Notebook; id: string; edit?: boolean }
  | { kind: 'plan' }
  | { kind: 'nightly' }
  | { kind: 'palette' }
  | { kind: 'term'; certId: string; id: string }
  | { kind: 'cert' };

export const sheets = { now: null as Sheet | null };

export function openSheet(s: Sheet, quiet = false) {
  sheets.now = s;
  if (!quiet) sfx('sheet');
  emit();
}

export function closeSheet() {
  if (!sheets.now) return;
  sheets.now = null;
  emit();
}
