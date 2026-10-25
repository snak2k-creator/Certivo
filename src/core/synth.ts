// The sound design of ZAN, synthesized live with WebAudio (no files).
// Everything runs through one mix: a saturated low bus (so a hit still has weight on a phone speaker, which
// cannot play the sub itself), a short dark room for the big moments and a compressor that keeps stacked
// sounds from clipping. Taps are tiny and dry; cuts have a swing, a bite and a ringing edge; the big moments
// add a chord. Everything is in D (major pentatonic and a maj9), so sounds that overlap stay in tune.

export interface Mix {
  c: BaseAudioContext;
  /** dry, into the compressor */
  dry: AudioNode;
  /** saturated low bus */
  heavy: AudioNode;
  /** send into the room */
  wet: AudioNode;
  noise: AudioBuffer;
}

export function makeMix(c: BaseAudioContext, dest: AudioNode = c.destination, calm = false): Mix {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 8;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.16;
  const master = c.createGain();
  master.gain.value = calm ? 0.72 : 0.9;
  master.connect(comp);
  comp.connect(dest);

  const shaper = c.createWaveShaper();
  shaper.curve = driveCurve(2.6);
  shaper.oversample = '2x';
  const heavyIn = c.createGain();
  const heavyLp = c.createBiquadFilter();
  heavyLp.type = 'lowpass';
  heavyLp.frequency.value = 2400;
  const heavyOut = c.createGain();
  heavyOut.gain.value = 0.5;
  heavyIn.connect(shaper);
  shaper.connect(heavyLp);
  heavyLp.connect(heavyOut);
  heavyOut.connect(master);

  const send = c.createGain();
  send.gain.value = calm ? 0.12 : 0.3;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 280;
  const room = c.createConvolver();
  room.buffer = roomImpulse(c, 1.7);
  send.connect(hp);
  hp.connect(room);
  room.connect(master);

  return { c, dry: master, heavy: heavyIn, wet: send, noise: noiseBuffer(c) };
}

function driveCurve(k: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function noiseBuffer(c: BaseAudioContext) {
  const n = Math.floor(c.sampleRate * 2);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** A dark, wide room: decaying noise that loses its top end as it fades. */
function roomImpulse(c: BaseAudioContext, dur: number) {
  const sr = c.sampleRate;
  const n = Math.floor(sr * dur);
  const pre = Math.floor(sr * 0.012);
  const b = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const k = (i - pre) / (n - pre);
      const a = 0.55 - 0.45 * k; // the tail gets darker
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - k, 2.4);
    }
  }
  return b;
}

/* ───────── building blocks ───────── */

const Z = 0.0001;
/** a little random detune, so a sound pressed ten times does not sound like a machine gun */
const j = (amt = 0.025) => 1 + (Math.random() * 2 - 1) * amt;

interface Out {
  vol: number;
  pan?: number;
  panTo?: number;
  /** how much goes into the room, 0..1 */
  send?: number;
  heavy?: boolean;
}

function route(m: Mix, node: AudioNode, t: number, d: number, o: Out) {
  const c = m.c;
  let tail: AudioNode = node;
  if ((o.pan || o.panTo) && 'createStereoPanner' in c) {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(o.pan ?? 0, t);
    if (o.panTo !== undefined) p.pan.linearRampToValueAtTime(o.panTo, t + d);
    node.connect(p);
    tail = p;
  }
  tail.connect(o.heavy ? m.heavy : m.dry);
  if (o.send) {
    const s = c.createGain();
    s.gain.value = o.send;
    tail.connect(s);
    s.connect(m.wet);
  }
}

/** attack, then an exponential fall; a long attack makes a swell that cuts off at the end */
function env(g: GainNode, t: number, a: number, d: number, vol: number, swell = false) {
  g.gain.setValueAtTime(Z, t);
  if (swell) {
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(Z, t + d);
  } else {
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(Z, t + d);
  }
}

interface ToneOpt extends Out {
  f: number;
  to?: number;
  glide?: number;
  d: number;
  a?: number;
  type?: OscillatorType;
  /** a lowpass on the tone, for saws */
  lp?: number;
  lpTo?: number;
}

function tone(m: Mix, t: number, o: ToneOpt) {
  const c = m.c;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.d * 0.6));
  const a = o.a ?? 0.002;
  env(g, t, a, o.d, o.vol, a > 0.02);
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(o.lp, t);
    if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + o.d);
    osc.connect(f);
    f.connect(g);
  } else osc.connect(g);
  route(m, g, t, o.d, o);
  osc.start(t);
  osc.stop(t + o.d + 0.05);
}

interface NoiseOpt extends Out {
  d: number;
  a?: number;
  type?: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
}

function noise(m: Mix, t: number, o: NoiseOpt) {
  const c = m.c;
  const s = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = m.noise;
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 0.9;
  f.frequency.setValueAtTime(o.f, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.d);
  const a = o.a ?? 0.001;
  env(g, t, a, o.d, o.vol, a > 0.02);
  s.connect(f);
  f.connect(g);
  route(m, g, t, o.d, o);
  s.start(t, Math.random() * Math.max(0, m.noise.duration - o.d - 0.1));
  s.stop(t + o.d + 0.05);
}

/** a struck blade: close, beating, inharmonic partials; the high ones die first */
const BLADE = [
  [1, 1, 1],
  [1.0047, 0.7, 1],
  [1.47, 0.45, 0.7],
  [2.09, 0.32, 0.5],
  [2.56, 0.22, 0.38],
  [3.21, 0.14, 0.28],
];
function blade(m: Mix, t: number, f: number, d: number, o: Out) {
  for (const [r, a, k] of BLADE) tone(m, t, { ...o, f: f * r, d: d * k, vol: o.vol * a, a: 0.001 });
}

/** a glassy two-operator FM note with a short metal tine on the attack */
function glass(m: Mix, t: number, f: number, d: number, o: Out & { index?: number; tine?: number }) {
  const c = m.c;
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const mg = c.createGain();
  const g = c.createGain();
  car.frequency.value = f;
  mod.frequency.value = f;
  const idx = (o.index ?? 1.1) * f;
  mg.gain.setValueAtTime(idx, t);
  mg.gain.exponentialRampToValueAtTime(idx * 0.04 + 1, t + d * 0.45);
  mod.connect(mg);
  mg.connect(car.frequency);
  env(g, t, 0.003, d, o.vol);
  car.connect(g);
  route(m, g, t, d, o);
  car.start(t);
  mod.start(t);
  car.stop(t + d + 0.05);
  mod.stop(t + d + 0.05);
  if (o.tine !== 0) tone(m, t, { ...o, f: f * 7.1, d: 0.05, vol: o.vol * (o.tine ?? 0.35) });
}

/** a sub thump with a fast pitch drop; on the saturated bus, so its harmonics carry on small speakers */
function kick(m: Mix, t: number, f0: number, f1: number, d: number, vol: number) {
  tone(m, t, { f: f0, to: f1, glide: Math.min(0.09, d * 0.4), d, vol, heavy: true, a: 0.001 });
  noise(m, t, { d: 0.008, type: 'highpass', f: 2800, vol: vol * 0.25 });
}

/** a short body: low, filtered noise */
function thud(m: Mix, t: number, f: number, d: number, vol: number, send = 0) {
  noise(m, t, { d, type: 'lowpass', f, q: 0.7, vol, send });
}

/** the edge of a cut: a very short bright crack */
function crack(m: Mix, t: number, vol: number, pan = 0) {
  noise(m, t, { d: 0.022, type: 'highpass', f: 4200, vol, pan });
}

/** the swing before a cut: a band of noise that sweeps up and across */
function swing(m: Mix, t: number, d: number, vol: number, from = -0.55, to = 0.55, f0 = 900, f1 = 7500) {
  noise(m, t, { d, a: d * 0.8, f: f0, to: f1, q: 1.1, vol, pan: from, panTo: to });
}

/** detuned saws through an opening lowpass: a short chord stab */
function stab(m: Mix, t: number, fs: number[], d: number, vol: number, send = 0.45) {
  for (const f of fs)
    for (const dt of [-1, 1]) tone(m, t, { f: f * (1 + dt * 0.0035), d, vol: vol / 2, type: 'sawtooth', a: 0.004, lp: 700, lpTo: 4800, send, pan: dt * 0.25 });
}

function chain(m: Mix, t: number, n: number, vol: number, rise = 0) {
  let s = t;
  for (let k = 0; k < n; k++) {
    const f = 1900 + Math.random() * 1500 + k * rise;
    tone(m, s, { f, d: 0.11, vol: vol * 0.6, pan: Math.random() * 0.8 - 0.4, a: 0.001 });
    tone(m, s, { f: f * 1.53, d: 0.07, vol: vol * 0.35, a: 0.001 });
    noise(m, s, { d: 0.02, f: 4800, q: 3, vol });
    s += 0.025 + Math.random() * 0.03;
  }
}

/* ───────── notes ───────── */

// D major pentatonic, from D5
const N = { D4: 293.66, A4: 440, D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880, B5: 987.77, Cs6: 1108.73, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53, D7: 2349.32 };
const PENTA = [N.D5, N.E5, N.Fs5, N.A5, N.B5, N.D6, N.E6, N.Fs6, N.A6, N.B6, N.D7];
const MAJ9 = [N.D4, N.A4, 554.37, N.E5, N.Fs5];

/** a wide cut with a long ring and a low open chord: the start of something */
function opening(m: Mix, t: number) {
  swing(m, t, 0.08, 0.18, -0.6, 0.6, 800, 8500);
  const s = t + 0.06;
  crack(m, s, 0.18);
  blade(m, s, 2550, 1.1, { vol: 0.05, send: 0.5 });
  kick(m, s, 150, 40, 0.5, 0.6);
  thud(m, s, 500, 0.12, 0.16);
  stab(m, s + 0.12, [N.D4, N.A4, N.E5, N.Fs5], 1.1, 0.03, 0.5);
}

/* ───────── the sounds ───────── */

type Play = (m: Mix, t: number, n: number) => void;

export const SOUNDS = {
  /* taps: tiny, dry, never tiring */

  /** a button: a short key-like click with a little body */
  tock: (m, t) => {
    noise(m, t, { d: 0.012, type: 'highpass', f: 2600, vol: 0.15 });
    tone(m, t, { f: 1250 * j(), to: 880, glide: 0.02, d: 0.035, vol: 0.08 });
    tone(m, t, { f: 210 * j(), to: 150, d: 0.045, vol: 0.12 });
  },
  /** a choice or a toggle: lighter and higher than a button */
  tick: (m, t) => {
    noise(m, t, { d: 0.007, f: 6500, q: 1.5, vol: 0.14 });
    tone(m, t, { f: 3100 * j(), d: 0.02, vol: 0.04 });
  },
  /** a light touch: a work task done, a soft result */
  soft: (m, t) => {
    noise(m, t, { d: 0.09, a: 0.05, f: 1500, to: 4000, vol: 0.09, pan: -0.2, panTo: 0.2 });
    glass(m, t + 0.04, N.A5, 0.3, { vol: 0.07, index: 0.8, send: 0.12 });
  },
  /** going back: a sweep down and a falling tone */
  undo: (m, t) => {
    noise(m, t, { d: 0.1, a: 0.04, f: 3200, to: 900, vol: 0.09, pan: 0.3, panTo: -0.3 });
    tone(m, t + 0.01, { f: 740, to: 494, glide: 0.08, d: 0.15, vol: 0.07 });
    tone(m, t + 0.01, { f: 200, to: 140, d: 0.05, vol: 0.1 });
  },
  /** into a session or a page: an airy rise that lands on a click */
  open: (m, t) => {
    noise(m, t, { d: 0.13, a: 0.1, f: 600, to: 3200, vol: 0.1, pan: -0.25, panTo: 0.15 });
    noise(m, t + 0.11, { d: 0.012, type: 'highpass', f: 2600, vol: 0.08 });
    tone(m, t + 0.11, { f: 240, to: 170, d: 0.06, vol: 0.12 });
  },
  /** a sheet rising from the bottom */
  sheet: (m, t) => {
    noise(m, t, { d: 0.15, a: 0.1, type: 'lowpass', f: 700, to: 2600, vol: 0.09 });
    glass(m, t + 0.07, N.D6, 0.22, { vol: 0.04, index: 0.6, tine: 0 });
  },
  /** a page, a tab, a card: two quick paper strokes */
  flip: (m, t) => {
    noise(m, t, { d: 0.03, f: 2200 * j(), q: 0.9, vol: 0.14, pan: -0.15 });
    noise(m, t + 0.034, { d: 0.045, f: 3300 * j(), q: 0.9, vol: 0.09, pan: 0.15 });
    tone(m, t, { f: 170, to: 110, d: 0.07, vol: 0.09 });
  },
  /** saved or added: two clean glass notes, a fourth apart */
  write: (m, t) => {
    noise(m, t, { d: 0.006, f: 6000, q: 1.5, vol: 0.09 });
    glass(m, t, N.A5, 0.22, { vol: 0.07, send: 0.12 });
    glass(m, t + 0.065, N.D6, 0.34, { vol: 0.07, send: 0.16 });
  },
  /** not now: two muted low notes, no buzzer */
  low: (m, t) => {
    tone(m, t, { f: 220, d: 0.11, vol: 0.1 });
    tone(m, t + 0.085, { f: 196, d: 0.16, vol: 0.09 });
    thud(m, t, 500, 0.04, 0.05);
  },
  /** one tally mark on 1日の記録, climbing the scale */
  tally: (m, t, n = 1) => {
    noise(m, t, { d: 0.01, f: 5200, q: 1.2, vol: 0.14 });
    glass(m, t, PENTA[Math.min(PENTA.length - 1, Math.max(0, n - 1))], 0.16, { vol: 0.07, index: 0.6, tine: 0.5 });
  },
  /** something shown: a short shimmer and two notes */
  reveal: (m, t) => {
    noise(m, t, { d: 0.2, a: 0.12, type: 'highpass', f: 2200, to: 8000, vol: 0.03, send: 0.3 });
    glass(m, t + 0.08, N.E6, 0.4, { vol: 0.03, send: 0.35, pan: -0.15 });
    glass(m, t + 0.15, N.A6, 0.55, { vol: 0.03, send: 0.4, pan: 0.15 });
  },
  /** an achievement: a small blade ring and a climbing sparkle */
  shine: (m, t) => {
    blade(m, t, 3400, 0.5, { vol: 0.01, send: 0.4 });
    [N.D6, N.Fs6, N.A6, N.D7].forEach((f, i) => glass(m, t + 0.03 + i * 0.055, f, 0.55, { vol: 0.03, send: 0.45, pan: i % 2 ? 0.3 : -0.3, index: 0.9 }));
  },
  stamp: (m, t) => {
    kick(m, t, 160, 60, 0.2, 0.45);
    thud(m, t, 420, 0.08, 0.2);
  },

  /* cuts */

  /** cutting a task, the app's signature: swing, bite, and a ringing edge */
  slash: (m, t) => {
    swing(m, t, 0.075, 0.16);
    const s = t + 0.055;
    crack(m, s, 0.13, 0.35);
    blade(m, s, 2650 * j(0.03), 0.45, { vol: 0.04, pan: 0.35, send: 0.22 });
    kick(m, s, 210, 72, 0.09, 0.22);
    thud(m, s, 900, 0.05, 0.06);
  },
  /** the shadow takes damage */
  hit: (m, t) => {
    kick(m, t, 160, 42, 0.34, 0.65);
    thud(m, t, 380, 0.13, 0.24);
    crack(m, t, 0.1);
    noise(m, t + 0.02, { d: 0.2, type: 'bandpass', f: 1300, to: 300, vol: 0.05, send: 0.2 });
  },
  /** a right answer in battle: n quick cuts, alternating sides, then a body blow */
  cut: (m, t, n = 1) => {
    const k = Math.max(1, Math.min(3, n));
    for (let i = 0; i < k; i++) {
      const s = t + i * 0.075;
      const side = i % 2 ? -1 : 1;
      swing(m, s, 0.05, 0.13, -0.5 * side, 0.5 * side);
      crack(m, s + 0.04, 0.11, 0.35 * side);
      blade(m, s + 0.04, (2500 + i * 280) * j(0.02), 0.32, { vol: 0.04, pan: 0.35 * side, send: 0.22 });
    }
    const h = t + 0.06 + (k - 1) * 0.075;
    kick(m, h, 150, 44, 0.32, 0.55 + k * 0.05);
    thud(m, h, 420, 0.12, 0.22);
  },
  /** a combo of two or more: a bright rising pair on top of the cut */
  combo: (m, t) => {
    glass(m, t + 0.16, N.D6, 0.3, { vol: 0.056, send: 0.3, pan: -0.2 });
    glass(m, t + 0.23, N.A6, 0.42, { vol: 0.042, send: 0.35, pan: 0.2 });
  },
  /** a right answer in a lesson */
  right: (m, t) => {
    blade(m, t, 3000, 0.25, { vol: 0.03, send: 0.2 });
    glass(m, t, N.D6, 0.3, { vol: 0.075, send: 0.2, pan: -0.1 });
    glass(m, t + 0.075, N.A6, 0.5, { vol: 0.06, send: 0.28, pan: 0.1 });
  },
  /** a wrong answer: soft and short, never a buzzer */
  wrong: (m, t) => {
    tone(m, t, { f: 392, to: 370, d: 0.14, vol: 0.04 });
    tone(m, t + 0.09, { f: 330, to: 311, d: 0.22, vol: 0.03 });
  },
  /** a wrong answer in battle: the blade swings past and finds nothing */
  miss: (m, t) => {
    noise(m, t, { d: 0.22, a: 0.08, f: 3600, to: 650, q: 1.1, vol: 0.09, pan: 0.5, panTo: -0.5 });
    thud(m, t + 0.12, 260, 0.1, 0.06);
    tone(m, t + 0.1, { f: 330, to: 262, d: 0.24, vol: 0.03 });
  },

  /* the weekly shadow */

  /** the shadow arrives: a rush in, a low impact and a dark fifth that hangs */
  appear: (m, t) => {
    noise(m, t, { d: 0.42, a: 0.38, type: 'lowpass', f: 140, to: 2000, vol: 0.1, send: 0.3 });
    const s = t + 0.4;
    kick(m, s, 110, 32, 1.0, 0.85);
    thud(m, s, 240, 0.3, 0.24, 0.3);
    crack(m, s, 0.1);
    tone(m, s, { f: 73.42, d: 1.5, vol: 0.06, type: 'sawtooth', lp: 600, lpTo: 180, send: 0.4, a: 0.02 });
    tone(m, s, { f: 110, d: 1.4, vol: 0.04, type: 'sawtooth', lp: 700, lpTo: 200, send: 0.4, a: 0.02 });
  },
  /** cut in the wrong order: the chains rattle tighter */
  chain: (m, t) => {
    chain(m, t, 5, 0.035);
    tone(m, t, { f: 110, to: 90, d: 0.2, vol: 0.05, heavy: true });
  },
  /** chains wrap the shadow */
  bind: (m, t) => {
    kick(m, t, 90, 38, 0.6, 0.55);
    noise(m, t, { d: 0.35, a: 0.3, type: 'lowpass', f: 200, to: 900, vol: 0.05 });
    chain(m, t + 0.1, 4, 0.03, 180);
    chain(m, t + 0.32, 4, 0.035, 260);
  },
  /** the chains break and the core opens */
  unbind: (m, t) => {
    crack(m, t, 0.18);
    chain(m, t, 7, 0.032);
    kick(m, t, 120, 40, 0.5, 0.6);
    blade(m, t + 0.02, 2900, 0.6, { vol: 0.03, send: 0.4 });
    [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => glass(m, t + 0.18 + i * 0.06, f, 0.7, { vol: 0.03, send: 0.4, pan: i % 2 ? 0.25 : -0.25 }));
  },
  /** とどめ, first beat: one heartbeat and a rise that cuts to silence just before the blow */
  kill1: (m, t) => {
    kick(m, t, 80, 34, 0.45, 0.5);
    noise(m, t, { d: 0.95, a: 0.9, f: 280, to: 5200, q: 1.4, vol: 0.09, send: 0.2 });
    tone(m, t, { f: 73.42, to: 147, glide: 0.9, d: 0.95, a: 0.85, vol: 0.06, heavy: true });
  },
  /** とどめ, the blow: the biggest cut in the app, a long ring, and the chord */
  kill2: (m, t) => {
    swing(m, t, 0.09, 0.22, -0.7, 0.7, 700, 9000);
    const s = t + 0.06;
    crack(m, s, 0.24);
    blade(m, s, 2400, 1.7, { vol: 0.06, send: 0.6, pan: 0.2 });
    blade(m, s, 3610, 1.2, { vol: 0.03, send: 0.6, pan: -0.2 });
    kick(m, s, 130, 30, 1.4, 1);
    thud(m, s, 300, 0.4, 0.3, 0.3);
    noise(m, s + 0.05, { d: 1.2, type: 'lowpass', f: 2600, to: 200, vol: 0.07, send: 0.4 });
    stab(m, s + 0.5, MAJ9, 1.7, 0.05, 0.55);
    [N.D6, N.Fs6, N.A6, N.D7].forEach((f, i) => glass(m, s + 0.52 + i * 0.07, f, 0.9, { vol: 0.03, send: 0.5, pan: i % 2 ? 0.3 : -0.3 }));
  },
  /** level up: an impact, a ring and an opening maj9 */
  sting: (m, t) => {
    kick(m, t, 140, 45, 0.35, 0.5);
    crack(m, t, 0.12);
    blade(m, t, 3000, 0.7, { vol: 0.03, send: 0.4 });
    stab(m, t + 0.04, MAJ9.map((f) => f * 2), 1.2, 0.04);
    [N.D6, N.E6, N.Fs6, N.A6].forEach((f, i) => glass(m, t + 0.12 + i * 0.05, f, 0.5, { vol: 0.02, send: 0.4, pan: i % 2 ? 0.3 : -0.3 }));
  },
  /** the day's three cut: a double cut and a bright chord */
  three: (m, t) => {
    swing(m, t, 0.05, 0.12, -0.5, 0.5);
    crack(m, t + 0.04, 0.1, 0.3);
    swing(m, t + 0.08, 0.05, 0.12, 0.5, -0.5);
    crack(m, t + 0.12, 0.1, -0.3);
    blade(m, t + 0.12, 2900, 0.5, { vol: 0.04, send: 0.3 });
    kick(m, t + 0.12, 170, 55, 0.2, 0.35);
    stab(m, t + 0.16, [N.D5, N.A5, N.E6], 0.8, 0.03);
    glass(m, t + 0.16, N.A6, 0.6, { vol: 0.03, send: 0.4 });
  },
  /** a result: a climbing arpeggio that lands on the chord */
  reward: (m, t) => {
    [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => glass(m, t + i * 0.075, f, 0.6, { vol: 0.04, send: 0.3, pan: i % 2 ? 0.2 : -0.2 }));
    stab(m, t + 0.3, MAJ9, 1.3, 0.04);
    glass(m, t + 0.3, N.Fs6, 0.9, { vol: 0.03, send: 0.5 });
  },
  /** the logo cut on the first screen */
  intro: (m, t) => {
    noise(m, t, { d: 0.3, a: 0.28, type: 'lowpass', f: 120, to: 1400, vol: 0.07 });
    tone(m, t, { f: 55, to: 73.42, d: 0.32, a: 0.28, vol: 0.08, heavy: true });
    opening(m, t + 0.3);
  },
  /** the morning ritual closes with a cut that opens the day */
  ritual: (m, t) => opening(m, t),
} satisfies Record<string, Play>;

export type Sound = keyof typeof SOUNDS;
