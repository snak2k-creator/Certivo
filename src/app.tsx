// The app shell: picks the screen from the route, the phone layout or the PC three columns, and draws
// the overlays (sheets, cut-ins, toasts, the morning ritual) above everything.
import { useEffect, useRef, useState } from 'preact/hooks';
import { state } from './core/store';
import { setProfile } from './core/actions';
import { reducedMotion, setCalm, ymd } from './core/util';
import { useMedia, useNow, useStore } from './ui/hooks';
import { useRoute, type Route } from './ui/router';
import { Nav } from './ui/Nav';
import { Overlays } from './ui/Overlays';
import { SheetHost } from './ui/SheetHost';
import { Intro } from './ui/Intro';
import { enter } from './ui/fx';
import { Today } from './screens/Today';
import { Welcome } from './screens/Welcome';
import { Battle } from './screens/Battle';
import { Session } from './screens/Session';
import { Learn } from './screens/Learn';
import { Mondai } from './screens/Mondai';
import { Lesson } from './screens/Lesson';
import { Tasks } from './screens/Tasks';
import { Recap } from './screens/Recap';
import { Zukan } from './screens/Zukan';
import { Growth } from './screens/Growth';
import { Settings } from './screens/Settings';
import { PcShell } from './pc/Shell';
import { TodayPc } from './pc/TodayPc';

/** Screens that take the whole viewport. */
const FULL = new Set(['battle', 'session', 'lesson', 'welcome']);
/** Screens without the bottom navigation: the full ones, and the pages that close with × or もどる. */
const NO_NAV = new Set([...FULL, 'recap', 'settings']);
const hidesNav = (r: Route) => NO_NAV.has(r.name) || (r.name === 'learn' && !!r.args[0]);

export function wantsRitual(date: string, routeName: string) {
  const p = state.profile;
  return p.onboarded && p.ritual && p.mode === 'p' && p.lastRitual !== date && routeName === 'today' && !reducedMotion();
}

function Soon({ name }: { name: string }) {
  return (
    <div class="m-page">
      <div class="m-head">
        <span class="m-title z-min">{name}</span>
      </div>
    </div>
  );
}

export function Screen({ r, date, now, onReplay, pc = false }: { r: Route; date: string; now: Date; onReplay: () => void; pc?: boolean }) {
  switch (r.name) {
    case 'today':
      return <Today date={date} now={now} onReplay={onReplay} />;
    case 'battle':
      return <Battle date={date} />;
    case 'session':
      return <Session args={r.args} date={date} />;
    case 'learn':
      return <Learn args={r.args} date={date} />;
    case 'mondai':
      return <Mondai />;
    case 'lesson':
      return <Lesson args={r.args} date={date} />;
    case 'tasks':
      return <Tasks date={date} />;
    case 'recap':
      return <Recap args={r.args} date={date} now={now} />;
    case 'zukan':
      return <Zukan args={r.args} date={date} pc={pc} />;
    case 'growth':
      return <Growth date={date} now={now} />;
    case 'settings':
      return <Settings args={r.args} />;
    default:
      return <Soon name={r.name} />;
  }
}

export function App() {
  useStore();
  setCalm(!!state.profile.calm);
  const r = useRoute();
  const now = useNow(30000);
  const date = ymd(now);
  const wide = useMedia('(min-width: 1100px)');
  const roomy = useMedia('(min-width: 1280px)');
  const [intro, setIntro] = useState(() => wantsRitual(date, r.name));
  const lastName = useRef(r.name);

  useEffect(() => {
    if (wantsRitual(date, r.name)) setIntro(true);
  }, [date]);
  useEffect(() => {
    document.documentElement.classList.toggle('is-pc', wide);
  }, [wide]);
  useEffect(() => {
    const same = lastName.current === r.name;
    lastName.current = r.name;
    // the PC 図鑑 keeps the book where it was while another record opens beside it
    if (FULL.has(r.name) || (same && wide && r.name === 'zukan')) return;
    window.scrollTo(0, 0);
  }, [r.name, r.args[0]]);

  if (!state.profile.onboarded || r.name === 'welcome') {
    return (
      <>
        <Welcome />
        <Overlays />
      </>
    );
  }

  const endIntro = () => {
    setIntro(false);
    setProfile({ lastRitual: date });
    enter();
  };
  const replay = () => {
    window.scrollTo(0, 0);
    setIntro(true);
  };

  if (wide && !FULL.has(r.name)) {
    const side = r.name === 'today' && roomy;
    return (
      <>
        <PcShell r={r} date={date} now={now} side={side}>
          {r.name === 'today' ? <TodayPc date={date} now={now} side={side} /> : <Screen r={r} date={date} now={now} onReplay={replay} pc={roomy} />}
        </PcShell>
        <SheetHost pc />
        <Overlays />
        {intro && <Intro date={date} onDone={endIntro} />}
      </>
    );
  }

  return (
    <>
      <main class="z-main" id="main">
        <Screen r={r} date={date} now={now} onReplay={replay} />
      </main>
      {!hidesNav(r) && <Nav current={r.name} date={date} />}
      <SheetHost />
      <Overlays />
      {intro && <Intro date={date} onDone={endIntro} />}
    </>
  );
}
