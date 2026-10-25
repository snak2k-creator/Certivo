import { describe, expect, it } from 'vitest';
import { addXp, checkAchievements, guessSkill, levelFromTotal, need, newGame, nextUnlock, skillLevel, title } from '../src/core/game';
import { newPersonal } from '../src/core/store';
import { DAY } from './helpers';

describe('levels', () => {
  it('needs a little more XP for each level', () => {
    expect(need(1)).toBe(100);
    expect(need(2)).toBe(125);
    expect(levelFromTotal(0)).toEqual({ lv: 1, xp: 0 });
    expect(levelFromTotal(99)).toEqual({ lv: 1, xp: 99 });
    expect(levelFromTotal(100)).toEqual({ lv: 2, xp: 0 });
    expect(levelFromTotal(225)).toEqual({ lv: 3, xp: 0 });
  });

  it('goes back down when an undo crosses a level', () => {
    const g = newGame();
    expect(addXp(g, 110)).toBe(1);
    expect(addXp(g, -20)).toBe(-1);
    expect(g).toMatchObject({ lv: 1, xp: 90, total: 90 });
    addXp(g, -500);
    expect(g.total).toBe(0);
  });

  it('names the level and the next thing it opens', () => {
    expect(title(1)).toBe('見習い');
    expect(title(4)).toBe('実践者');
    expect(title(30)).toBe('達人');
    expect(nextUnlock(1)?.lv).toBe(3);
    expect(nextUnlock(5)?.lv).toBe(9);
    expect(nextUnlock(9)).toBeNull();
  });

  it('levels skills on their own curve', () => {
    expect(skillLevel(0)).toEqual({ lv: 1, xp: 0, need: 90 });
    expect(skillLevel(90)).toEqual({ lv: 2, xp: 0, need: 120 });
  });
});

describe('skills from words', () => {
  it('reads the skill from the title', () => {
    expect(guessSkill('ジムで 走る')).toBe('健');
    expect(guessSkill('模試の 復習')).toBe('知');
    expect(guessSkill('メールの 返信')).toBe('話');
    expect(guessSkill('歯医者')).toBe('生');
    expect(guessSkill('なにか')).toBe('生');
  });
});

describe('achievements', () => {
  it('are earned once', () => {
    const p = newPersonal();
    p.days[DAY] = { xp: 10, slashes: 1, kills: 0 };
    expect(checkAchievements(p, DAY)).toEqual(['first']);
    expect(p.game.ach.first).toBe(DAY);
    expect(checkAchievements(p, DAY)).toEqual([]);
  });
});
