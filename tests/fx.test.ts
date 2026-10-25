// 動きを控えめに: the person's switch quiets the big moments, without the device setting.
import { afterEach, describe, expect, it } from 'vitest';
import { fresh } from './helpers';
import { reducedMotion, setCalm } from '../src/core/util';
import { closeCut, closeToast, cutThree, fx } from '../src/ui/fx';

afterEach(() => {
  setCalm(false);
  closeCut();
  closeToast();
});

describe('motion', () => {
  it('counts as reduced motion once the switch is on', () => {
    fresh();
    expect(reducedMotion()).toBe(false);
    setCalm(true);
    expect(reducedMotion()).toBe(true);
  });

  it('turns the cut-in for three done into a plain note', () => {
    fresh();
    setCalm(true);
    cutThree();
    expect(fx.cutNow).toBeNull();
    expect(fx.toastNow?.text).toContain('今日の三つ');
    setCalm(false);
    cutThree();
    expect(fx.cutNow?.kind).toBe('three');
  });
});
