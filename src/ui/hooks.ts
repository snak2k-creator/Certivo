import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { state, subscribe } from '../core/store';
import { reducedMotion } from '../core/util';

/** Re-renders on every store change. Used once at the root; everything below reads `state` directly. */
export function useStore() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = subscribe(force as () => void);
    return () => {
      off();
    };
  }, []);
  return state;
}

export function useMedia(query: string) {
  const get = () => typeof matchMedia !== 'undefined' && matchMedia(query).matches;
  const [m, set] = useState(get);
  useEffect(() => {
    const mq = matchMedia(query);
    const h = () => set(mq.matches);
    mq.addEventListener('change', h);
    h();
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return m;
}

/** The current time, refreshed every `ms` and whenever the app comes back to the front. */
export function useNow(ms = 30000) {
  const [now, set] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => set(new Date()), ms);
    const vis = () => {
      if (document.visibilityState === 'visible') set(new Date());
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms]);
  return now;
}

/** Keyboard shortcuts. Ignores keys typed into fields unless `inFields` is set. */
export function useKey(fn: (e: KeyboardEvent) => void, on = true, inFields = false) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    const h = (e: KeyboardEvent) => {
      if (!inFields && isTyping(e)) return;
      ref.current(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [on, inFields]);
}

export function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** Timers that are cleared when the component goes away. */
export function useTimers() {
  const ref = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => ref.current.forEach(clearTimeout), []);
  return (f: () => void, ms: number) => {
    const t = setTimeout(f, ms);
    ref.current.push(t);
    return t;
  };
}

/** True once the element has scrolled into view, and from then on. Starts true when motion is reduced. */
export function useSeen<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => reducedMotion());
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          setSeen(true);
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** The element's width in px, kept current as the layout changes. */
export function useWidth<T extends Element>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => setW(Math.round(el.getBoundingClientRect().width) || fallback);
    f();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Locks page scroll while a sheet or overlay is open. */
export function useScrollLock(on = true) {
  useEffect(() => {
    if (!on) return;
    const b = document.body;
    const prev = b.style.overflow;
    b.style.overflow = 'hidden';
    return () => {
      b.style.overflow = prev;
    };
  }, [on]);
}

/** How much of the bottom the on-screen keyboard covers, as --kb on the root (iOS keeps fixed sheets under it). */
export function useKeyboardInset(on = true) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv) return;
    const root = document.documentElement;
    const f = () => root.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    f();
    return () => {
      vv.removeEventListener('resize', f);
      vv.removeEventListener('scroll', f);
      root.style.removeProperty('--kb');
    };
  }, [on]);
}
