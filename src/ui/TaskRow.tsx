// One task. On 今日 the whole row is the cut (long press opens it); on やること the box cuts and the row opens.
import { useRef } from 'preact/hooks';
import type { Notebook, Task } from '../core/types';
import { DIFF } from '../core/game';
import { doneOn, isNear, metaLine } from '../core/tasks';
import { fx } from './fx';
import { Check } from './icons';
import { opensSession, slash } from './slash';

interface Props {
  t: Task;
  nb: Notebook;
  date: string;
  mode?: 'slash' | 'manage';
  onOpen?: (t: Task) => void;
  delay?: number;
  selected?: boolean;
}

/** Press and hold for about half a second. Returns handlers and whether the last press was long. */
export function useLongPress(fire: () => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<[number, number] | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    fired,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        fired.current = false;
        start.current = [e.clientX, e.clientY];
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          try {
            navigator.vibrate?.(10);
          } catch {
            /* fine */
          }
          fire();
        }, ms);
      },
      onPointerMove: (e: PointerEvent) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s[0], e.clientY - s[1]) > 9) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: Event) => {
        e.preventDefault();
        if (!fired.current) {
          clear();
          fired.current = true;
          fire();
        }
      },
    },
  };
}

export function TaskRow({ t, nb, date, mode = 'slash', onOpen, delay, selected }: Props) {
  const on = doneOn(t, date);
  const f = fx.freshIds.get(t.id);
  const session = opensSession(nb, t, date);
  const meta = metaLine(t, date, nb);
  const near = isNear(t, date);
  const bars = DIFF[t.diff].bars;
  const open = () => onOpen?.(t);
  const lp = useLongPress(open);
  const cls = ['z-row', on && 'on', f && 'fresh', fx.addedIds.has(t.id) && 'add', fx.entering && 'z-e3', selected && 'sel', mode === 'manage' && 'z-row-m'].filter(Boolean).join(' ');
  const style = delay !== undefined ? { animationDelay: `${delay}s` } : undefined;
  const label = `${t.title}。${meta ? meta + '。' : ''}${on ? '斬った' : session ? '押すと はじめる' : 'まだ'}`;

  const tail = (
    <>
      {near && <span class="z-tag z-tag-r z-near">近い</span>}
      {nb === 'p' ? (
        <>
          <span class="z-df" aria-hidden="true">
            <i />
            <i class={bars < 2 ? 'off' : undefined} />
            <i class={bars < 3 ? 'off' : undefined} />
          </span>
          <b class="z-xp">+{DIFF[t.diff].xp}</b>
        </>
      ) : t.tag ? (
        <span class="z-wtag">{t.tag}</span>
      ) : null}
    </>
  );
  const body = (
    <span class="z-rt">
      <span class="z-ttl">
        <span>{t.title}</span>
        <i />
      </span>
      {meta && <span class="z-meta">{meta}</span>}
    </span>
  );
  const fxs = (
    <>
      <span key={'c' + (f?.id ?? 0)} class="z-cut" />
      {f && f.xp > 0 && (
        <span key={'r' + f.id} class="z-rise">
          +{f.xp}
        </span>
      )}
    </>
  );

  if (mode === 'manage') {
    return (
      <div class={cls} style={style}>
        <button type="button" class="z-ckb" aria-pressed={on} aria-label={on ? `${t.title}を 元に戻す` : session ? `${t.title}を はじめる` : `${t.title}を 斬る`} onClick={() => slash(nb, t, date)}>
          <span class={session ? 'z-ck go' : 'z-ck'}>
            <Check />
          </span>
        </button>
        <button type="button" class="z-rbody" onClick={open} aria-label={`${t.title}を ひらく`}>
          {body}
          {tail}
        </button>
        {fxs}
      </div>
    );
  }
  return (
    <button
      type="button"
      class={cls}
      style={style}
      aria-pressed={on}
      aria-label={label}
      {...lp.handlers}
      onClick={() => {
        if (lp.fired.current) {
          lp.fired.current = false;
          return;
        }
        slash(nb, t, date);
      }}
    >
      <span class={session ? 'z-ck go' : 'z-ck'}>
        <Check />
      </span>
      {body}
      {tail}
      {fxs}
    </button>
  );
}
