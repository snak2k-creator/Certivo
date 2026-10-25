import { describe, expect, it } from 'vitest';
import { makeMix, SOUNDS, type Sound } from '../src/core/synth';

// A stand-in AudioContext: every node accepts any call, and we count what gets started.
function fakeContext() {
  let started = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v: number) {
    if (!(v > 0)) throw new Error(`exponential ramp to ${v}`);
  } });
  const node = (): Record<string, unknown> =>
    new Proxy({} as Record<string, unknown>, {
      get(o, k: string) {
        if (k in o) return o[k];
        if (['gain', 'frequency', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release'].includes(k)) return (o[k] = param());
        if (k === 'start') return () => started++;
        return () => undefined;
      },
      set(o, k: string, v) {
        o[k] = v;
        return true;
      },
    });
  const c = {
    sampleRate: 48000,
    currentTime: 0,
    destination: node(),
    createBuffer: (_ch: number, n: number) => ({ duration: n / 48000, getChannelData: () => new Float32Array(n) }),
    createStereoPanner: node,
  } as Record<string, unknown>;
  for (const k of ['createGain', 'createOscillator', 'createBiquadFilter', 'createBufferSource', 'createWaveShaper', 'createConvolver', 'createDynamicsCompressor']) c[k] = node;
  return { c: c as unknown as BaseAudioContext, started: () => started };
}

describe('synth', () => {
  it('every sound schedules something, without a zero exponential ramp', () => {
    for (const calm of [false, true]) {
      const f = fakeContext();
      const m = makeMix(f.c, f.c.destination, calm);
      for (const k of Object.keys(SOUNDS) as Sound[]) {
        const before = f.started();
        SOUNDS[k](m, 0.01, 3);
        expect(f.started(), k).toBeGreaterThan(before);
      }
    }
  });
});
