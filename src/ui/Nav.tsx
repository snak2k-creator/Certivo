// Bottom navigation on phones and tablets. 図鑑 opens from 成長 and 挑む; 覚える takes its place here, and holds
// 問題集 beside it.
import type { FunctionComponent } from 'preact';
import { state } from '../core/store';
import { isLearnTask } from '../core/learn';
import { doneOn } from '../core/tasks';
import { NavBattle, NavGrowth, NavLearn, NavTasks, NavToday } from './icons';
import { killedEntry } from './Boss';

const ITEMS: { r: string; label: string; icon: FunctionComponent; also?: string[] }[] = [
  { r: 'today', label: '今日', icon: NavToday },
  { r: 'learn', label: '覚える', icon: NavLearn, also: ['mondai'] },
  { r: 'battle', label: '挑む', icon: NavBattle },
  { r: 'tasks', label: 'やること', icon: NavTasks },
  { r: 'growth', label: '成長', icon: NavGrowth, also: ['zukan'] },
];

/** A red mark on 覚える while today's 覚える is still to do. */
function learnDot(date: string) {
  return state.p.tasks.some((t) => isLearnTask(t) && t.date === date && !doneOn(t, date));
}

/** A red mark on 挑む when the shadow can be finished, or on its last day. */
function battleDot(date: string) {
  const b = state.p.boss.cur;
  if (!b || killedEntry(b)) return false;
  return b.hp <= 0 || b.deadline === date;
}

export function Nav({ current, date }: { current: string; date: string }) {
  return (
    <nav class="z-nav" aria-label="メイン">
      {ITEMS.map((it) => {
        const on = current === it.r || !!it.also?.includes(current);
        const Icon = it.icon;
        return (
          <a key={it.r} href={`#/${it.r}`} class={`z-nv${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
            <Icon />
            {it.label}
            {it.r === 'battle' && battleDot(date) && <span class="z-dot" aria-label="とどめを刺せます" />}
            {it.r === 'learn' && learnDot(date) && <span class="z-dot" aria-label="今日の 覚える が あります" />}
          </a>
        );
      })}
    </nav>
  );
}
