// Renders the open sheet: a light bottom sheet on phones. On PC a task or a new line opens in a drawer on the
// right that leaves the list usable (J and K keep moving through it), and the rest open as dialogs.
import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { aiCapNow, setProfile, today } from '../core/actions';
import { DOW, dow, md } from '../core/util';
import { sfx } from '../core/sfx';
import { closeSheet, sheets, type Sheet } from './sheets';
import { useKey, useKeyboardInset, useScrollLock } from './hooks';
import { AddForm, TaskDetail } from './TaskForms';
import { PlanConfirm } from './WorkPlan';
import { Close } from './icons';
import { toast } from './fx';

export function SheetFrame({ label, tag, onClose, children, wide }: { label: string; tag?: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useScrollLock();
  useKeyboardInset();
  useKey((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, true, true);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      if (!box.current?.contains(document.activeElement)) box.current?.focus();
    }, 80);
    return () => {
      clearTimeout(t);
      prev?.focus?.();
    };
  }, []);
  return (
    <>
      <div class="z-scrim" onClick={onClose} />
      <div ref={box} class={`z-sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div class="sh-top">
          {tag && <span class="z-tag z-tag-k">{tag}</span>}
          <button type="button" class="z-x" onClick={onClose} aria-label="とじる">
            <Close />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export function NightlyAsk({ onDone }: { onDone: () => void }) {
  const yes = () => {
    setProfile({ nightly: true });
    sfx('write');
    toast('毎晩 22:00 に、まとめます');
    onDone();
  };
  return (
    <div class="nt">
      <b class="z-min nt-t">毎晩、その日の記録を 自動でまとめますか</b>
      <ul class="nt-li">
        <li>まとめるのは 個人の手帳だけ。毎晩 22:00 に、その日の数字と 斬ったやることの題名を AI に送ります。</li>
        <li>仕事の手帳は、済んだ件数だけ。題名も 中身も 送りません。</li>
        <li>AI を使うのは、月 {aiCapNow()} 回まで。使えないときは、端末の中で 書きます。</li>
        <li>あとから 設定で いつでも 止められます。</li>
      </ul>
      <div class="nt-acts">
        <button type="button" class="z-bw" onClick={yes}>
          まとめてもらう
        </button>
        <button type="button" class="z-txb" onClick={onDone}>
          今はしない
        </button>
      </div>
    </div>
  );
}

/** The PC drawer: no scrim and no scroll lock, so the list stays live beside it. Esc closes. */
function Drawer({ label, tag, onClose, children }: { label: string; tag?: string; onClose: () => void; children: ComponentChildren }) {
  useKey((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, true, true);
  return (
    <aside class="pc-det z-light" role="dialog" aria-label={label}>
      <div class="sh-top pc-dh">
        {tag && <span class="z-tag z-tag-k">{tag}</span>}
        <button type="button" class="pc-dx" onClick={onClose}>
          閉じる
          <kbd>esc</kbd>
        </button>
      </div>
      {children}
    </aside>
  );
}

/** Writing for another day says which day, so the line is read from there. */
function addTag(s: Extract<Sheet, { kind: 'add' }>) {
  const book = s.nb === 'p' ? '個人の手帳' : '仕事の手帳';
  return s.date && s.date !== today() ? `${book} · ${md(s.date)} ${DOW[dow(s.date)]}` : book;
}

function body(s: Sheet) {
  switch (s.kind) {
    case 'add':
      return { label: 'やることを書く', tag: addTag(s), node: <AddForm nb={s.nb} date={s.date} onDone={() => closeSheet()} /> };
    case 'task':
      return { label: 'やること', tag: s.nb === 'p' ? '個人の手帳' : '仕事の手帳', node: <TaskDetail nb={s.nb} id={s.id} edit={s.edit} onClose={closeSheet} /> };
    case 'plan':
      return { label: '送る前の確認', tag: undefined, node: <PlanConfirm /> };
    case 'nightly':
      return { label: '毎晩のまとめ', tag: 'はじめに、ひとつだけ', node: <NightlyAsk onDone={closeSheet} /> };
    default:
      return null;
  }
}

export function SheetHost({ pc = false }: { pc?: boolean }) {
  const s = sheets.now;
  if (!s) return null;
  const b = body(s);
  if (!b) return null;
  if (pc && (s.kind === 'task' || s.kind === 'add')) {
    return (
      <Drawer key={s.kind} label={b.label} tag={b.tag} onClose={closeSheet}>
        <div key={'id' in s ? s.id : 'add'} class="pc-detin">
          {b.node}
        </div>
      </Drawer>
    );
  }
  return (
    <SheetFrame key={s.kind + ('id' in s ? s.id : '')} label={b.label} tag={b.tag} onClose={closeSheet}>
      {b.node}
    </SheetFrame>
  );
}
