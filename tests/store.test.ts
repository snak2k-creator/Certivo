import { beforeEach, describe, expect, it } from 'vitest';
import { addTask, toggleTask } from '../src/core/actions';
import { deleteData } from '../src/core/data';
import { onSave, state, undo } from '../src/core/store';
import { DAY, fresh, saved } from './helpers';

beforeEach(() => fresh());

describe('the two notebooks', () => {
  it('are stored apart on the device', () => {
    const t = addTask('w', 'A社 見積もり', {}, DAY)!;
    toggleTask('w', t.id, DAY);
    addTask('p', '住民税を払う', {}, DAY);
    expect(saved.get('zan:work')).toContain('A社');
    expect(saved.get('zan:personal')).toContain('住民税');
    expect(saved.get('zan:personal')).not.toContain('A社');
  });

  it('tell sync which notebook changed', () => {
    const seen: string[] = [];
    const off = onSave((part) => seen.push(part));
    addTask('w', 'A社 見積もり', {}, DAY);
    addTask('p', '住民税を払う', {}, DAY);
    off();
    expect(seen).toEqual(['w', 'p']);
  });

  it('can be deleted one at a time', async () => {
    addTask('w', 'A社 見積もり', {}, DAY);
    addTask('p', '住民税を払う', {}, DAY);
    await deleteData('w');
    expect(state.w.tasks).toEqual([]);
    expect(state.p.tasks).toHaveLength(1);
    expect(saved.get('zan:work') ?? '').not.toContain('A社');
    expect(undo()).toBeNull();
  });

  it('start with sync and AI off', () => {
    expect(state.profile).toMatchObject({ sync: { p: false, w: false }, nightly: false, aiAuto: false });
  });
});
