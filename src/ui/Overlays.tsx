// Cut-ins and the toast, drawn above every screen.
import type { Cut } from './fx';
import { closeCut, closeToast, fx, undoLast } from './fx';
import { TITLES, UNLOCKS, nextUnlock, title } from '../core/game';
import { useKey } from './hooks';

/** With a mouse it closes with a click or Esc; on a touch screen, a tap. */
const closeHint = () => (typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches ? 'クリックか Esc で とじる' : 'タップで とじる');

function LevelCut({ c }: { c: Extract<Cut, { kind: 'lv' }> }) {
  useKey((e) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      closeCut();
    }
  });
  const lv = c.lv;
  const name = title(lv);
  const newTitle = TITLES.some(([from]) => from === lv);
  const unl = UNLOCKS[lv];
  const next = nextUnlock(lv);
  const nextTitle = TITLES.find(([from]) => from > lv);
  return (
    <div class={`z-cutw${c.out ? ' z-cout' : ''}`} onClick={closeCut} role="dialog" aria-modal="true" aria-label={`レベルアップ。Lv.${lv}、${name}`}>
      <div class="z-dim" />
      <div class="z-cthin" />
      <div class="z-cband" />
      <div class="z-ctx">
        <span class="z-tag z-tag-k z-cpop">レベルアップ</span>
        <b class="z-min z-num z-cbig">
          <span>Lv.</span>
          {lv}
        </b>
        <span class="z-ctl">
          <b class="z-min">{name}</b>
          <span>{newTitle ? 'に上がった' : nextTitle ? `Lv.${nextTitle[0]} で ${nextTitle[1]}` : 'の、その先へ'}</span>
        </span>
      </div>
      <div class="z-cglint" />
      {unl && (
        <div class="z-unl">
          <span class="z-tag z-tag-r">解放</span>
          <b>{unl[0]}</b>
          <span>{unl[1]}</span>
        </div>
      )}
      <span class="z-cnote">{!unl && next ? `次の解放は Lv.${next.lv}「${next.name}」 · ${closeHint()}` : closeHint()}</span>
    </div>
  );
}

function ThreeCut() {
  return (
    <div class="z-three" role="status" aria-label="今日の三つを斬った。経験値 30">
      <div class="z-sband2" />
      <div class="z-sband" />
      <div class="z-stx">
        <b class="z-min">今日の三つ、斬った</b>
        <span class="z-tag z-tag-r">+30</span>
      </div>
    </div>
  );
}

export function Overlays() {
  const t = fx.toastNow;
  const c = fx.cutNow;
  return (
    <>
      {c?.kind === 'lv' && <LevelCut key={c.id} c={c} />}
      {c?.kind === 'three' && <ThreeCut key={c.id} />}
      {t && (
        <div key={t.id} class={`z-toast${t.top ? ' top' : ''}`} role="status" style={{ '--dur': `${t.dur}ms` }}>
          <i />
          <span>{t.text}</span>
          {t.undo && (
            <button
              type="button"
              onClick={() => {
                closeToast();
                undoLast();
              }}
            >
              元に戻す
            </button>
          )}
          {t.action && (
            <button
              type="button"
              onClick={() => {
                closeToast();
                t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}
