import { render } from 'preact';
import './styles/base.css';
import './styles/ui.css';
import './styles/today.css';
import './styles/login.css';
import './styles/battle.css';
import './styles/session.css';
import './styles/tasks.css';
import './styles/recap.css';
import './styles/zukan.css';
import './styles/growth.css';
import './styles/settings.css';
import './styles/pc.css';
import { App } from './app';
import { setStatus, state } from './core/store';
import { ensureDay, today } from './core/actions';
import { activePack, loadPack, loadRegistry } from './core/pack';
import { autoAi, checkAi } from './core/ai';
import { initCloud } from './core/cloud';
import { RECAP_HOUR } from './core/recap';

render(<App />, document.getElementById('app')!);
if (import.meta.env.DEV) (window as unknown as { __zan: unknown }).__zan = { state };

/** Sets up the day (shadow, morning shards, suggestion, nightly page), then lets the AI improve it if allowed. */
async function settle(date = today()) {
  const pk = activePack();
  ensureDay(pk, date);
  await autoAi(pk, date);
}

async function boot() {
  initCloud();
  try {
    await loadRegistry();
    await loadPack(state.profile.certId);
  } catch {
    /* offline on the very first visit: the app still works for tasks */
  }
  ensureDay(activePack());
  await checkAi();
  await settle();

  let day = today();
  let hour = new Date().getHours();
  const tick = () => {
    const d = today();
    const h = new Date().getHours();
    if (d !== day || (h >= RECAP_HOUR && hour < RECAP_HOUR)) void settle(d);
    day = d;
    hour = h;
  };
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('online', () => {
    setStatus({ online: true });
    void checkAi();
  });
  window.addEventListener('offline', () => setStatus({ online: false }));
}
void boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* the app works without it, just not offline */
    });
  });
}
