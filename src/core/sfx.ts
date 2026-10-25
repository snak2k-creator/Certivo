// Sounds (synthesized live in synth.ts) and short vibrations. Both follow the settings: 音 off is silent,
// 動きを控えめに plays everything softer and drier.
import { state } from './store';
import { makeMix, SOUNDS, type Mix, type Sound } from './synth';

export type { Sound };

let ac: AudioContext | null = null;
let mix: Mix | null = null;
let mixCalm = false;

function audio() {
  if (!state.profile.sound) return null;
  try {
    if (!ac) {
      // ambient: mixes with the person's music instead of stopping it, and follows the silent switch on iPhone
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC({ latencyHint: 'interactive' });
    }
    if (ac.state === 'suspended') void ac.resume();
    const calm = !!state.profile.calm;
    if (!mix || mixCalm !== calm) {
      mix = makeMix(ac, ac.destination, calm);
      mixCalm = calm;
    }
    return mix;
  } catch {
    return null;
  }
}

// wake the audio on the first touch, so the first real sound is not late
if (typeof window !== 'undefined') {
  const prime = () => {
    audio();
    window.removeEventListener('pointerdown', prime, true);
    window.removeEventListener('keydown', prime, true);
  };
  window.addEventListener('pointerdown', prime, true);
  window.addEventListener('keydown', prime, true);
}

const last: Partial<Record<Sound, number>> = {};

export function sfx(kind: Sound, n?: number) {
  const m = audio();
  if (!m) return;
  const now = m.c.currentTime;
  // the same sound twice within a few milliseconds is one sound
  if (now - (last[kind] ?? -1) < 0.035) return;
  last[kind] = now;
  try {
    SOUNDS[kind](m, now + 0.005, n ?? 1);
  } catch {
    /* a sound must never break a tap */
  }
}

/** Short vibration patterns, in milliseconds. */
export const BUZZ = {
  tap: 6,
  slash: 8,
  soft: [6, 24, 10],
  three: [12, 30, 18],
  hit: [20, 40, 30],
  crit: [20, 30, 20, 30, 40],
  lv: [30, 40, 30, 40, 60],
  kill: [40, 30, 60],
} satisfies Record<string, number | number[]>;

export function buzz(p: number | number[]) {
  if (!state.profile.haptics) return;
  try {
    navigator.vibrate?.(p);
  } catch {
    /* not supported */
  }
}
