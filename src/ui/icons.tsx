// Drawn glyphs. Flat shapes, square ends, one red accent; nothing from an icon kit.
import type { JSX } from 'preact';

type P = { size?: number; class?: string; style?: JSX.CSSProperties };

export const Arrow = ({ size = 14, class: c, style }: P) => (
  <svg width={size} height={(size * 12) / 14} viewBox="0 0 14 12" aria-hidden="true" class={c} style={style}>
    <path d="M1 6H12M7.5 1.5L12.5 6L7.5 10.5" fill="none" stroke="#E3402B" stroke-width="2.2" stroke-linecap="square" />
  </svg>
);

export const Close = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <path d="M2.5 2.5L15.5 15.5M15.5 2.5L2.5 15.5" stroke="currentColor" stroke-width="2.2" />
  </svg>
);

export const Search = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="2" />
    <path d="M10.6 10.6L14.5 14.5" stroke="currentColor" stroke-width="2.2" />
  </svg>
);

export const Account = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="6" r="3.4" fill="currentColor" />
    <path d="M2.5 16.5C3.4 12.8 5.9 11 9 11S14.6 12.8 15.5 16.5Z" fill="currentColor" />
  </svg>
);

export const ChevL = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M10.5 2.5L5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" />
  </svg>
);

export const ChevR = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M5.5 2.5L11 8l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" />
  </svg>
);

export const Menu = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <path d="M2.5 10H6M8.25 10H11.75M14 10H17.5" stroke="currentColor" stroke-width="3.2" />
  </svg>
);

export const Pencil = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    <path d="M1.5 12.5L2.4 9L9.6 1.8L12.2 4.4L5 11.6Z" fill="currentColor" />
  </svg>
);

export const Plus = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="2.4" />
  </svg>
);

export const Check = ({ size = 24 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path pathLength={1} d="M5.5 12.5L10 17L18.5 7" />
  </svg>
);

export const Google = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

/** The ZAN mark: two bars cut by a red blade. `anim` adds the classes the login screen animates. */
export const Logo = ({ size = 40, anim = false }: { size?: number; anim?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" class={anim ? 'l-mk' : undefined}>
    <rect class={anim ? 'l-top' : undefined} x="18" y="18" width="64" height="14" fill="#F3F1EC" />
    <rect class={anim ? 'l-bot' : undefined} x="18" y="68" width="64" height="14" fill="#F3F1EC" />
    <path class={anim ? 'l-bl' : undefined} d="M67 32H82L33 68H18Z" fill="#E3402B" />
    <path class={anim ? 'l-hl' : undefined} d="M84 30.5L94 23.2M16 69.5L6 76.8" stroke="#E3402B" stroke-width="2" />
  </svg>
);

/* ---------- navigation ---------- */
export const NavToday = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 5H20V21H4Z" fill="currentColor" />
    <path d="M4 5H20V9H4Z" fill="#0B0B0C" opacity=".25" />
    <path d="M8 2.5V7M16 2.5V7" stroke="currentColor" stroke-width="2.4" />
    <path data-r d="M8.5 14.5L11 17L15.5 11.5" fill="none" stroke="#E3402B" stroke-width="2.2" />
  </svg>
);
export const NavBattle = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 19L17 4L20 4L20 7L5 19Z" fill="currentColor" />
    <path d="M4 16L8 20M3 21L5.5 18.5" stroke="currentColor" stroke-width="2.2" />
  </svg>
);
export const NavTasks = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4H20V21H4Z" fill="currentColor" />
    <path d="M7.5 9H16.5M7.5 13H16.5M7.5 17H13" stroke="#0B0B0C" stroke-width="2" />
  </svg>
);
export const NavZukan = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 5H14V22H3Z" fill="currentColor" />
    <path d="M10 2H21V19" fill="none" stroke="currentColor" stroke-width="2" />
  </svg>
);
export const NavGrowth = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5L20.5 7.5V16.5L12 21.5L3.5 16.5V7.5Z" fill="currentColor" />
    <path class="nv-in" d="M12 8L15.5 10V14L12 16L8.5 14V10Z" fill="#0B0B0C" />
  </svg>
);
export const NavRecap = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 3H19V21H5Z" fill="currentColor" />
    <path data-r d="M8 15L11 8M11.5 15L14.5 8" stroke="#E3402B" stroke-width="2" />
  </svg>
);
export const NavSettings = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6H21M3 12H21M3 18H21" stroke="currentColor" stroke-width="2.2" />
    <path data-r d="M7 3.5V8.5M15 9.5V14.5M10 15.5V20.5" stroke="#E3402B" stroke-width="2.6" />
  </svg>
);
