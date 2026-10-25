// Bottom navigation on phones and tablets.
import type { FunctionComponent } from 'preact';
import { state } from '../core/store';
import { NavBattle, NavGrowth, NavTasks, NavToday, NavZukan } from './icons';
import { killedEntry } from './Boss';

const ITEMS: { r: string; label: string; icon: FunctionComponent }[] = [
  { r: 'today', label: '今日', icon: NavToday },
  { r: 'battle', label: '挑む', icon: NavBattle },
  { r: 'tasks', label: 'やること', icon: NavTasks },
  { r: 'zukan', label: '図鑑', icon: NavZukan },
  { r: 'growth', label: '成長', icon: NavGrowth },
];

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
        const on = current === it.r || (it.r === 'zukan' && current === 'zukan');
        const Icon = it.icon;
        return (
          <a key={it.r} href={`#/${it.r}`} class={`z-nv${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
            <Icon />
            {it.label}
            {it.r === 'battle' && battleDot(date) && <span class="z-dot" aria-label="とどめを刺せます" />}
          </a>
        );
      })}
    </nav>
  );
}
