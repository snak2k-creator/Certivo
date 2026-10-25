import { beforeEach, describe, expect, it } from 'vitest';
import { applyBackup, readBackup } from '../src/core/data';
import { newPersonal, newProfile, newWork, state, undo } from '../src/core/store';
import { fresh, task } from './helpers';

beforeEach(() => fresh());

const file = (v: unknown) => new File([typeof v === 'string' ? v : JSON.stringify(v)], 'zan.json', { type: 'application/json' });

describe('reading a backup', () => {
  it('turns away files that are not ZAN backups', async () => {
    expect(await readBackup(file('not json'))).toBe('ZAN の書き出しファイルでは ないようです');
    expect(await readBackup(file({ app: 'other', v: 1 }))).toBe('ZAN の書き出しファイルでは ないようです');
    expect(await readBackup(file({ app: 'zan', v: 1 }))).toBe('読み込めるものが ありません');
  });

  it('checks each notebook on its own', async () => {
    expect(await readBackup(file({ app: 'zan', v: 1, personal: { tasks: 'x' } }))).toBe('個人の手帳の 中身が 読めません');
    expect(await readBackup(file({ app: 'zan', v: 1, work: {} }))).toBe('仕事の手帳の 中身が 読めません');
    const plan = await readBackup(file({ app: 'zan', v: 1, exportedAt: '2026-10-20T10:00:00.000Z', work: { v: 1, updatedAt: 1, tasks: [task()] } }));
    expect(plan).toMatchObject({ at: '2026-10-20T10:00:00.000Z', work: { sent: [] } });
    expect(typeof plan === 'object' && plan.personal).toBeFalsy();
  });
});

describe('applying a backup', () => {
  it('never turns on sync or AI from the file', () => {
    const profile = { ...newProfile(), sync: { p: true, w: true }, nightly: true, aiAuto: true, certId: 'ai-103' };
    applyBackup({ at: '', profile, personal: newPersonal() });
    expect(state.profile).toMatchObject({ sync: { p: false, w: false }, nightly: false, aiAuto: false, onboarded: true });
  });

  it('can be taken back with one undo', () => {
    const mine = task({ title: '手元のやること' });
    state.w.tasks.push(mine);
    applyBackup({ at: '', work: { ...newWork(), tasks: [task({ title: 'ファイルのやること' })] } });
    expect(state.w.tasks.map((t) => t.title)).toEqual(['ファイルのやること']);
    expect(undo()).toBe('読み込んだ');
    expect(state.w.tasks.map((t) => t.title)).toEqual(['手元のやること']);
  });
});
