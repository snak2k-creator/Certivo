// Short-lived effects (toasts, cut-ins, boss hits, the cut on a row). They live outside the notebooks and
// re-render through the store's emit, so every screen sees the same effect at the same time.
import { canUndo, emit, undo } from '../core/store';
import { sfx } from '../core/sfx';

export interface Toast { id: number; text: string; undo?: boolean; action?: { label: string; run: () => void }; dur: number; top?: boolean }
export type Cut = { id: number; kind: 'lv'; lv: number; out?: boolean } | { id: number; kind: 'three' };
export interface Hit { id: number; dmg: number; from: number; to: number }

let seq = 0;
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
function later(key: string, ms: number, f: () => void) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(f, ms);
}

export const fx = {
  toastNow: null as Toast | null,
  cutNow: null as Cut | null,
  hitNow: null as Hit | null,
  freshIds: new Map<string, { id: number; xp: number }>(),
  addedIds: new Set<string>(),
  /** the morning ritual just ended: rows slide in */
  entering: false,
};

export function toast(text: string, opts: Partial<Omit<Toast, 'id' | 'text'>> = {}) {
  const dur = opts.dur ?? (opts.undo || opts.action ? 4200 : 2600);
  fx.toastNow = { id: ++seq, text, dur, ...opts };
  emit();
  later('toast', dur, () => {
    fx.toastNow = null;
    emit();
  });
}
export function closeToast() {
  clearTimeout(timers.toast);
  fx.toastNow = null;
  emit();
}

/** Undo the last change, from a toast button or ⌘Z. */
export function undoLast() {
  if (!canUndo()) return;
  const label = undo();
  sfx('undo');
  toast(label ? `元に戻しました · ${label}` : '元に戻しました');
}

export function cutLevel(lv: number) {
  fx.cutNow = { id: ++seq, kind: 'lv', lv };
  emit();
  later('cut', 2900, closeCut);
}
export function closeCut() {
  const c = fx.cutNow;
  if (!c) return;
  clearTimeout(timers.cut);
  if (c.kind === 'lv' && !c.out) {
    fx.cutNow = { ...c, out: true };
    emit();
    later('cut', 320, () => {
      fx.cutNow = null;
      emit();
    });
  } else {
    fx.cutNow = null;
    emit();
  }
}
export function cutThree() {
  fx.cutNow = { id: ++seq, kind: 'three' };
  emit();
  later('cut', 1550, () => {
    fx.cutNow = null;
    emit();
  });
}

export function bossHit(dmg: number, from: number, to: number) {
  fx.hitNow = { id: ++seq, dmg, from, to };
  emit();
  later('hit', 1100, () => {
    fx.hitNow = null;
    emit();
  });
}

/** Marks a row as just cut, for the impact and the rising XP. */
export function fresh(taskId: string, xp: number) {
  fx.freshIds.set(taskId, { id: ++seq, xp });
  emit();
  later('fresh:' + taskId, 1000, () => {
    fx.freshIds.delete(taskId);
    emit();
  });
}

export function added(taskId: string) {
  fx.addedIds.add(taskId);
  later('add:' + taskId, 700, () => {
    fx.addedIds.delete(taskId);
    emit();
  });
}

export function enter() {
  fx.entering = true;
  emit();
  later('enter', 1700, () => {
    fx.entering = false;
    emit();
  });
}
