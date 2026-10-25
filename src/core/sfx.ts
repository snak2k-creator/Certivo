// Sounds made on the fly with WebAudio (no files), and short vibrations. Both follow the settings.
import { state } from './store';

let ac: AudioContext | null = null;

function audio() {
  if (!state.profile.sound) return null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac ||= new AC();
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, t: number, f1: number, f2: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.7);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(c: AudioContext, t: number, dur: number, vol: number, freq = 1800, q = 0.8) {
  const n = Math.floor(c.sampleRate * dur);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = b;
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.value = vol;
  s.connect(f);
  f.connect(g);
  g.connect(c.destination);
  s.start(t);
}

const CHIME = [659.3, 987.8, 1318.5];

const SOUNDS = {
  /** a task cut: thin, high and quick */
  slash: (c: AudioContext, t: number) => {
    noise(c, t, 0.15, 0.09, 6500, 0.7);
    tone(c, t + 0.012, 2700, 1600, 0.22, 0.026);
    tone(c, t + 0.02, 5400, 0, 0.1, 0.01);
  },
  /** undoing a cut, or a light touch */
  soft: (c: AudioContext, t: number) => {
    noise(c, t, 0.1, 0.05, 4200, 0.7);
    tone(c, t, 1200, 900, 0.12, 0.015, 'triangle');
  },
  hit: (c: AudioContext, t: number) => {
    noise(c, t, 0.22, 0.1, 4800, 0.6);
    tone(c, t, 120, 52, 0.24, 0.09);
  },
  /** level up */
  sting: (c: AudioContext, t: number) => {
    tone(c, t, 90, 45, 0.3, 0.1);
    noise(c, t, 0.3, 0.05, 3000, 0.5);
    CHIME.forEach((f, i) => tone(c, t + 0.06 + i * 0.05, f, 0, 0.9, 0.035, 'triangle'));
  },
  three: (c: AudioContext, t: number) => {
    tone(c, t, 784, 0, 0.35, 0.04, 'triangle');
    tone(c, t + 0.09, 1174.7, 0, 0.5, 0.035, 'triangle');
    noise(c, t, 0.1, 0.04, 5000, 0.7);
  },
  tock: (c: AudioContext, t: number) => tone(c, t, 620, 0, 0.05, 0.026, 'triangle'),
  tick: (c: AudioContext, t: number) => tone(c, t, 1500, 0, 0.025, 0.01, 'square'),
  /** one tally mark on 1日の記録, a little higher each time */
  tally: (c: AudioContext, t: number, n = 1) => {
    tone(c, t, 1400 + n * 70, 0, 0.045, 0.016, 'triangle');
    noise(c, t, 0.03, 0.025, 7000, 0.8);
  },
  open: (c: AudioContext, t: number) => {
    noise(c, t, 0.12, 0.04, 2400, 0.6);
    tone(c, t, 330, 220, 0.12, 0.025);
  },
  sheet: (c: AudioContext, t: number) => tone(c, t, 300, 520, 0.16, 0.03, 'triangle'),
  undo: (c: AudioContext, t: number) => tone(c, t, 440, 330, 0.12, 0.03, 'triangle'),
  /** the logo cut on the first screen */
  intro: (c: AudioContext, t: number) => {
    tone(c, t, 70, 40, 0.35, 0.12);
    noise(c, t + 0.2, 0.15, 0.09, 6500, 0.7);
    tone(c, t + 0.22, 2700, 1600, 0.22, 0.026);
    tone(c, t + 0.4, 880, 0, 0.5, 0.03, 'triangle');
    tone(c, t + 0.46, 1318.5, 0, 0.6, 0.025, 'triangle');
  },
  write: (c: AudioContext, t: number) => {
    tone(c, t, 880, 0, 0.12, 0.025, 'triangle');
    tone(c, t + 0.07, 1318.5, 0, 0.22, 0.02, 'triangle');
  },
  flip: (c: AudioContext, t: number) => {
    noise(c, t, 0.12, 0.06, 3600, 0.6);
    tone(c, t, 170, 80, 0.16, 0.06);
  },
  reveal: (c: AudioContext, t: number) => {
    noise(c, t, 0.12, 0.07, 6000, 0.7);
    tone(c, t + 0.02, 1046.5, 0, 0.3, 0.03, 'triangle');
    tone(c, t + 0.09, 1568, 0, 0.4, 0.025, 'triangle');
  },
  low: (c: AudioContext, t: number) => tone(c, t, 180, 120, 0.25, 0.05),
  right: (c: AudioContext, t: number) => {
    noise(c, t, 0.12, 0.07, 6200, 0.7);
    tone(c, t + 0.02, 784, 0, 0.45, 0.045, 'triangle');
    tone(c, t + 0.1, 1174.7, 0, 0.55, 0.035, 'triangle');
  },
  wrong: (c: AudioContext, t: number) => tone(c, t, 330, 247, 0.3, 0.04, 'triangle'),
  stamp: (c: AudioContext, t: number) => {
    tone(c, t, 150, 60, 0.16, 0.08);
    noise(c, t, 0.07, 0.05, 900);
  },
  shine: (c: AudioContext, t: number) => [1318.5, 1568, 1975.5, 2637].forEach((f, i) => tone(c, t + i * 0.06, f, 0, 0.5, 0.022)),
  /* battle */
  appear: (c: AudioContext, t: number) => {
    tone(c, t, 80, 38, 0.6, 0.12);
    noise(c, t, 0.35, 0.045, 700, 0.6);
    tone(c, t + 0.3, 58, 30, 0.5, 0.13);
    noise(c, t + 0.3, 0.2, 0.06, 1300, 0.6);
  },
  /** a right answer in battle: n quick cuts and a body blow */
  cut: (c: AudioContext, t: number, n = 1) => {
    for (let i = 0; i < n; i++) {
      noise(c, t + i * 0.07, 0.14, 0.09, 6500, 0.7);
      tone(c, t + i * 0.07 + 0.01, 2700, 1500, 0.2, 0.022);
    }
    tone(c, t + 0.05, 130, 48, 0.3, 0.12);
    noise(c, t + 0.05, 0.12, 0.07, 900, 0.7);
  },
  combo: (c: AudioContext, t: number) => {
    tone(c, t + 0.14, 1046.5, 0, 0.25, 0.035, 'triangle');
    tone(c, t + 0.22, 1568, 0, 0.32, 0.03, 'triangle');
  },
  miss: (c: AudioContext, t: number) => {
    noise(c, t, 0.26, 0.05, 2200, 0.5);
    tone(c, t + 0.02, 520, 300, 0.22, 0.028, 'triangle');
  },
  chain: (c: AudioContext, t: number) => {
    noise(c, t, 0.2, 0.06, 3200, 3);
    tone(c, t, 1900, 1700, 0.18, 0.02, 'triangle');
    tone(c, t + 0.05, 2400, 2200, 0.2, 0.016, 'triangle');
  },
  bind: (c: AudioContext, t: number) => {
    tone(c, t, 70, 34, 0.7, 0.14);
    for (let j = 0; j < 4; j++) {
      noise(c, t + 0.1 + j * 0.09, 0.16, 0.05, 3000 + j * 400, 3);
      tone(c, t + 0.1 + j * 0.09, 1800 + j * 150, 1600, 0.16, 0.016, 'triangle');
    }
  },
  unbind: (c: AudioContext, t: number) => {
    tone(c, t, 90, 45, 0.3, 0.1);
    CHIME.forEach((f, i) => tone(c, t + 0.06 + i * 0.05, f, 0, 0.9, 0.03, 'triangle'));
  },
  kill1: (c: AudioContext, t: number) => {
    tone(c, t, 62, 30, 0.9, 0.15);
    noise(c, t, 0.6, 0.045, 400, 0.4);
  },
  kill2: (c: AudioContext, t: number) => {
    noise(c, t, 0.3, 0.13, 7000, 0.6);
    tone(c, t, 2900, 900, 0.4, 0.035);
    tone(c, t + 0.04, 90, 30, 0.9, 0.2);
    noise(c, t + 0.04, 0.5, 0.09, 800, 0.5);
    [659.3, 987.8, 1318.5, 1975.5].forEach((f, i) => tone(c, t + 0.28 + i * 0.06, f, 0, 1.2, 0.028, 'triangle'));
  },
  reward: (c: AudioContext, t: number) => [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(c, t + i * 0.08, f, 0, 0.7, 0.036, 'triangle')),
};

export type Sound = keyof typeof SOUNDS;

export function sfx(kind: Sound, n?: number) {
  const c = audio();
  if (!c) return;
  try {
    SOUNDS[kind](c, c.currentTime + 0.01, n as number);
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
