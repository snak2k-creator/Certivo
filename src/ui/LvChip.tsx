import { useRef } from 'preact/hooks';
import { state } from '../core/store';
import { need, title } from '../core/game';

/** Level, title and the bar to the next level. Pulses whenever XP changes. */
export function LvChip({ href = '#/growth', class: c = '' }: { href?: string; class?: string }) {
  const g = state.p.game;
  const last = useRef(g.total);
  const flip = useRef(false);
  if (last.current !== g.total) {
    last.current = g.total;
    flip.current = !flip.current;
  }
  const pulse = g.total === 0 ? '' : flip.current ? 'z-pulseA' : 'z-pulseB';
  const pct = Math.round((g.xp / need(g.lv)) * 100);
  return (
    <a href={href} class={`z-lv ${pulse} ${c}`} aria-label={`レベル ${g.lv}、${title(g.lv)}。次のレベルまで ${need(g.lv) - g.xp}`}>
      <b class="z-min z-num z-lv-n">
        <span>Lv.</span>
        {g.lv}
      </b>
      <span class="z-lv-tx">
        <span>{title(g.lv)}</span>
        <span class="z-lvbar">
          <span style={{ width: `${pct}%` }} />
        </span>
      </span>
    </a>
  );
}
