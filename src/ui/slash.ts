// Cutting a task: the sound, the vibration, the cut on the row, the hit on the shadow and the cut-ins.
import type { Notebook, Task } from '../core/types';
import { toggleTask, type Outcome } from '../core/actions';
import { ACHIEVEMENTS } from '../core/game';
import { doneOn } from '../core/tasks';
import { state } from '../core/store';
import { BUZZ, buzz, sfx } from '../core/sfx';
import { bossHit, cutLevel, cutThree, fresh, toast } from './fx';
import { go } from './router';

/** Tasks that open a study session instead of being checked by hand. */
export const opensSession = (nb: Notebook, t: Task, date: string) => nb === 'p' && !!t.study && t.study.kind !== 'read' && !doneOn(t, date);

export function achievementToasts(ids: string[], delay = 0) {
  ids.forEach((id, n) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    setTimeout(() => {
      sfx('shine');
      toast(`実績「${a.name}」 · ${a.sub}`, { dur: 3200 });
    }, delay + n * 3300);
  });
}

export function slash(nb: Notebook, t: Task, date: string) {
  if (opensSession(nb, t, date)) {
    sfx('open');
    go(`session/task/${t.id}`);
    return;
  }
  const hpBefore = state.p.boss.cur?.hp ?? 0;
  const out = toggleTask(nb, t.id, date);
  if (!out) return;

  if (nb === 'w') {
    if (out.on) {
      sfx('soft');
      buzz(BUZZ.slash);
      fresh(t.id, 0);
    } else {
      sfx('undo');
      buzz(BUZZ.tap);
      toast(`元に戻しました · ${t.title}`);
    }
    return;
  }

  if (!out.on) {
    sfx('undo');
    buzz(BUZZ.tap);
    toast(`元に戻しました · ${t.title}`);
    return;
  }

  sfx('slash');
  buzz(BUZZ.soft);
  fresh(t.id, out.xp - (out.three ? 30 : 0));
  if (out.dmg > 0) {
    setTimeout(() => sfx('hit'), 120);
    bossHit(out.dmg, hpBefore, out.hp);
  }
  celebrate(out);
}

/** What follows a cut: a level, the day's three, a shadow out of HP, achievements, one after another. */
export function celebrate(out: Pick<Outcome, 'lvFrom' | 'lvTo' | 'three' | 'killReady' | 'ach'>, delay = 0) {
  let after = delay;
  if (out.lvTo > out.lvFrom) {
    setTimeout(() => {
      sfx('sting');
      buzz(BUZZ.lv);
      cutLevel(out.lvTo);
    }, after + 380);
    after += 3400;
  } else if (out.three) {
    setTimeout(() => {
      sfx('three');
      buzz(BUZZ.three);
      cutThree();
    }, after + 320);
    after += 1900;
  }
  if (out.killReady) {
    const name = state.p.boss.cur?.name ?? '影';
    setTimeout(() => toast(`${name}の 体力が 尽きた。挑んで、とどめを。`, { action: { label: '挑む', run: () => go('battle') } }), after);
    after += 4400;
  }
  achievementToasts(out.ach, after);
}
