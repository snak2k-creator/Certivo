import { beforeEach, describe, expect, it } from 'vitest';
import { acceptSuggestion, addTask, defeatBoss, ensureDay, finishStudyTask, moveTomorrow, skipSuggestion, toggleTask } from '../src/core/actions';
import { canUndo, state, undo } from '../src/core/store';
import { doneOn, tasksFor } from '../src/core/tasks';
import { THREE_BONUS } from '../src/core/game';
import { addDays } from '../src/core/util';
import { DAY, fresh, pack, task } from './helpers';

beforeEach(() => fresh());

describe('cutting a task', () => {
  it('gives the task XP, and the three bonus on the third', () => {
    const ts = [task(), task(), task()];
    state.p.tasks.push(...ts);
    expect(toggleTask('p', ts[0].id, DAY)?.xp).toBe(10);
    toggleTask('p', ts[1].id, DAY);
    const third = toggleTask('p', ts[2].id, DAY)!;
    expect(third.three).toBe(true);
    expect(third.xp).toBe(10 + THREE_BONUS);
    expect(state.p.game.total).toBe(30 + THREE_BONUS);
    expect(state.p.days[DAY]).toMatchObject({ slashes: 3, three: true });
  });

  it('takes the bonus back when one of the three is uncut', () => {
    const ts = [task(), task(), task()];
    state.p.tasks.push(...ts);
    for (const t of ts) toggleTask('p', t.id, DAY);
    const back = toggleTask('p', ts[1].id, DAY)!;
    expect(back.on).toBe(false);
    expect(back.xp).toBe(-10 - THREE_BONUS);
    expect(state.p.game.total).toBe(20);
    expect(state.p.days[DAY].three).toBe(false);
  });

  it('keeps work out of the game: no XP, only a count on the day', () => {
    const t = task({ title: 'A社 見積もり', sk: '技' });
    state.w.tasks.push(t);
    const out = toggleTask('w', t.id, DAY)!;
    expect(out.xp).toBe(0);
    expect(state.p.game.total).toBe(0);
    expect(state.p.days[DAY].work).toBe(1);
    expect(JSON.stringify(state.p)).not.toContain('A社');
  });

  it('moves a task finished early to the day it was done', () => {
    const t = task({ date: addDays(DAY, 3) });
    state.p.tasks.push(t);
    toggleTask('p', t.id, DAY);
    expect(t.date).toBe(DAY);
    expect(tasksFor(state.p.tasks, DAY, DAY)).toContain(t);
  });

  it('is undone in one step', () => {
    const t = task();
    state.p.tasks.push(t);
    toggleTask('p', t.id, DAY);
    expect(canUndo()).toBe(true);
    expect(undo()).toBe('斬った');
    expect(state.p.game.total).toBe(0);
    expect(doneOn(state.p.tasks[0], DAY)).toBe(false);
  });

  it('marks a repeating task for that day only', () => {
    const t = task({ date: '2026-10-01', repeat: [0, 1, 2, 3, 4, 5, 6] });
    state.p.tasks.push(t);
    toggleTask('p', t.id, DAY);
    expect(doneOn(t, DAY)).toBe(true);
    expect(doneOn(t, addDays(DAY, 1))).toBe(false);
  });
});

describe('明日へ', () => {
  it('moves a one-off task to tomorrow', () => {
    const t = task();
    state.p.tasks.push(t);
    moveTomorrow('p', t.id, DAY);
    expect(tasksFor(state.p.tasks, DAY, DAY)).not.toContain(t);
    expect(tasksFor(state.p.tasks, addDays(DAY, 1), DAY)).toContain(t);
  });

  it('skips today for a repeating task and keeps it on later days', () => {
    const t = task({ date: '2026-10-01', repeat: [3] });
    state.p.tasks.push(t);
    moveTomorrow('p', t.id, DAY);
    expect(t.date).toBe('2026-10-01');
    expect(tasksFor(state.p.tasks, DAY, DAY)).toEqual([]);
    expect(tasksFor(state.p.tasks, addDays(DAY, 7), DAY)).toEqual([t]);
  });

  it('leaves a finished task where it is', () => {
    const t = task();
    state.p.tasks.push(t);
    toggleTask('p', t.id, DAY);
    expect(moveTomorrow('p', t.id, DAY)).toBeNull();
  });
});

describe('the day', () => {
  it('sets up the shadow, the morning shards and a suggestion, all unfinished', () => {
    ensureDay(pack, DAY);
    expect(state.p.boss.cur).toMatchObject({ week: '2026-10-19', hp: 2000, tier: 'week' });
    const kakera = state.p.tasks.filter((t) => t.study?.kind === 'kakera');
    expect(kakera).toHaveLength(1);
    expect(doneOn(kakera[0], DAY)).toBe(false);
    expect(state.p.ai.sug).toMatchObject({ date: DAY, source: 'zan' });
    expect(state.p.ai.sug?.done).toBeUndefined();
  });

  it('runs once a day', () => {
    ensureDay(pack, DAY);
    const before = JSON.stringify(state.p.tasks);
    ensureDay(pack, DAY);
    expect(JSON.stringify(state.p.tasks)).toBe(before);
  });

  it('adds the suggestion only when accepted, as a task still to do', () => {
    ensureDay(pack, DAY);
    const n = state.p.tasks.length;
    const t = acceptSuggestion(DAY)!;
    expect(state.p.tasks).toHaveLength(n + 1);
    expect(t.study).toMatchObject({ kind: 'drill', count: 3 });
    expect(doneOn(t, DAY)).toBe(false);
    expect(acceptSuggestion(DAY)).toBeNull();
  });

  it('adds nothing when the suggestion is skipped', () => {
    ensureDay(pack, DAY);
    const n = state.p.tasks.length;
    skipSuggestion(DAY);
    expect(state.p.ai.sug?.done).toBe('skipped');
    expect(acceptSuggestion(DAY)).toBeNull();
    expect(state.p.tasks).toHaveLength(n);
  });

  it('writes the nightly page on the device after 22:00', () => {
    fresh(DAY, 22);
    ensureDay(pack, DAY);
    expect(state.p.recaps[DAY]).toMatchObject({ source: 'zan' });
    expect(state.p.recaps[DAY].text.length).toBeGreaterThan(0);
  });

  it('checks a study task when its session ends', () => {
    ensureDay(pack, DAY);
    const k = state.p.tasks.find((t) => t.study?.kind === 'kakera')!;
    const out = finishStudyTask(k.id, DAY)!;
    expect(out.on).toBe(true);
    expect(state.p.days[DAY].kakera).toBe(true);
    expect(finishStudyTask(k.id, DAY)).toBeNull();
  });
});

describe('the shadow', () => {
  it('can only be defeated at zero HP, and only once', () => {
    ensureDay(pack, DAY);
    expect(defeatBoss(4, 4, DAY)).toBeNull();
    state.p.boss.cur!.hp = 0;
    const win = defeatBoss(4, 4, DAY)!;
    expect(win.count).toBe(1);
    expect(state.p.zukan[0].boss.id).toBe(state.p.boss.cur!.id);
    expect(state.p.days[DAY].kills).toBe(1);
    expect(defeatBoss(4, 4, DAY)).toBeNull();
  });

  it('takes damage from a study task and gives it back when uncut', () => {
    ensureDay(pack, DAY);
    const t = addTask('p', '問題を 解く', { diff: 'n', study: { kind: 'drill', certId: pack.id, count: 3 } }, DAY)!;
    const out = toggleTask('p', t.id, DAY)!;
    expect(out.dmg).toBe(60);
    expect(state.p.boss.cur!.hp).toBe(1940);
    toggleTask('p', t.id, DAY);
    expect(state.p.boss.cur!.hp).toBe(2000);
  });
});
