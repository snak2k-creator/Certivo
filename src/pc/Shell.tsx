// The PC layout: the rail on the left, the page in the middle (今日 brings its own right side), the drawer for a
// task and the ⌘K palette. Keys that work everywhere: ⌘K or / to search, 1 and 2 for the notebooks, ⌘Z to undo.
import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { fx, undoLast } from '../ui/fx';
import { closeSheet, openSheet, sheets } from '../ui/sheets';
import { isTyping, useKey } from '../ui/hooks';
import type { Route } from '../ui/router';
import { modKey, switchBook } from './common';
import { Rail } from './Rail';
import { Palette } from './Palette';

export function PcShell({ r, date, now, side, children }: { r: Route; date: string; now: Date; side: boolean; children: ComponentChildren }) {
  useEffect(() => {
    document.documentElement.classList.toggle('pc-has-side', side);
    return () => document.documentElement.classList.remove('pc-has-side');
  }, [side]);

  useKey(
    (e) => {
      const k = e.key.toLowerCase();
      if (modKey(e) && k === 'k') {
        e.preventDefault();
        if (sheets.now?.kind === 'palette') closeSheet();
        else openSheet({ kind: 'palette' });
        return;
      }
      if (fx.cutNow || (sheets.now && sheets.now.kind !== 'task')) return;
      if (modKey(e) && k === 'z' && !e.shiftKey && !isTyping(e)) {
        e.preventDefault();
        undoLast();
        return;
      }
      if (isTyping(e) || e.altKey) return;
      if (modKey(e) && (k === '1' || k === '2')) {
        e.preventDefault();
        switchBook(k === '1' ? 'p' : 'w');
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      if (k === '/') {
        e.preventDefault();
        openSheet({ kind: 'palette' });
      } else if (k === '1' || k === '2') switchBook(k === '1' ? 'p' : 'w');
    },
    true,
    true,
  );

  return (
    <div class={`pc pc-${r.name}`}>
      <a class="z-skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        本文へ
      </a>
      <Rail r={r} date={date} now={now} />
      {r.name === 'today' ? (
        children
      ) : (
        <main class="pc-main pc-page" id="main" tabIndex={-1}>
          {children}
        </main>
      )}
      {sheets.now?.kind === 'palette' && <Palette date={date} />}
    </div>
  );
}
