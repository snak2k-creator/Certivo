// A small hash router: #/today, #/zukan/b123, #/session/task/t9. Back goes back inside the app, or home.
import { useEffect, useState } from 'preact/hooks';

export interface Route { name: string; args: string[]; path: string }

export function parse(hash = typeof location === 'undefined' ? '' : location.hash): Route {
  const path = hash.replace(/^#\/?/, '');
  const parts = path.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  return { name: parts[0] || 'today', args: parts.slice(1), path };
}

let depth = 0;
const listeners = new Set<(r: Route) => void>();
let current = parse();

function changed() {
  current = parse();
  listeners.forEach((f) => f(current));
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', changed);

export const route = () => current;

/** Moves to a path like 'zukan/b1'. replace keeps the history entry (for redirects). */
export function go(path: string, replace = false) {
  const h = '#/' + path.replace(/^#?\/?/, '');
  if (h === location.hash) return;
  if (replace) {
    history.replaceState(history.state, '', h);
    changed();
  } else {
    depth++;
    location.hash = h;
  }
}

/** Back inside the app when there is somewhere to go back to, otherwise to the fallback. */
export function back(fallback = 'today') {
  if (depth > 0) {
    depth--;
    history.back();
  } else go(fallback, true);
}

export function useRoute() {
  const [r, set] = useState(current);
  useEffect(() => {
    const f = (x: Route) => set(x);
    listeners.add(f);
    set(current);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return r;
}
