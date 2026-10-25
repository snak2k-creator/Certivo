// The PC rail: the mark, the notebook switch, where to go (with what is waiting there), the certification pack
// and the level. In the work notebook it shows only what the work notebook has.
import type { FunctionComponent } from 'preact';
import { state } from '../core/store';
import { activePack } from '../core/pack';
import { dueWords } from '../core/learn';
import { chapters, target } from '../core/growth';
import { RECAP_HOUR } from '../core/recap';
import { DOW, dow, md } from '../core/util';
import { dayList, doneCount, examDays, examEntry } from '../ui/derive';
import { killedEntry } from '../ui/Boss';
import { LvChip } from '../ui/LvChip';
import { Account, Logo, NavBank, NavBattle, NavGrowth, NavLearn, NavRecap, NavTasks, NavToday, NavZukan } from '../ui/icons';
import { qStates } from '../core/study';
import type { Route } from '../ui/router';
import { recapPointer } from '../screens/Today';
import { switchBook } from './common';

interface Item { r: string; label: string; icon: FunctionComponent; personal?: boolean }
const ITEMS: Item[] = [
  { r: 'today', label: '今日', icon: NavToday },
  { r: 'learn', label: '覚える', icon: NavLearn, personal: true },
  { r: 'mondai', label: '問題集', icon: NavBank, personal: true },
  { r: 'battle', label: '挑む', icon: NavBattle, personal: true },
  { r: 'tasks', label: 'やること', icon: NavTasks },
  { r: 'zukan', label: '図鑑', icon: NavZukan, personal: true },
  { r: 'growth', label: '成長', icon: NavGrowth, personal: true },
  { r: 'recap', label: '1日の記録', icon: NavRecap, personal: true },
];

/** The small word after an item: how many are left, a deadline, a new page. */
function badge(r: string, date: string, now: Date): { text: string; red?: boolean } | null {
  const nb = state.profile.mode;
  if (r === 'today') {
    const list = dayList(nb, date);
    const left = list.length - doneCount(list, date);
    return left > 0 ? { text: String(left) } : null;
  }
  if (r === 'battle') {
    const b = state.p.boss.cur;
    if (!b) return null;
    if (killedEntry(b)) return { text: '討伐' };
    if (b.hp <= 0) return { text: 'とどめ', red: true };
    if (b.deadline === date) return { text: '今夜まで', red: true };
    return null;
  }
  if (r === 'learn') {
    const pk = activePack();
    const sp = pk && state.p.study[pk.id];
    const n = pk && sp ? dueWords(pk, sp, date).length : 0;
    return n ? { text: `復習 ${n}` } : null;
  }
  if (r === 'mondai') {
    const pk = activePack();
    const sp = pk && state.p.study[pk.id];
    const miss = pk && sp ? [...qStates(pk, sp).values()].filter((s) => s === 'ng').length : 0;
    return miss ? { text: `まちがい ${miss}` } : pk ? { text: `${pk.questions.length}問` } : null;
  }
  if (r === 'zukan') return state.p.zukan.length ? { text: `${state.p.zukan.length}体` } : null;
  if (r === 'recap') {
    const rec = recapPointer(date, now);
    return rec.fresh ? { text: '新しい', red: true } : { text: `${RECAP_HOUR}:00` };
  }
  return null;
}

function Pack({ date }: { date: string }) {
  const pk = activePack();
  if (!pk) return null;
  const sp = state.p.study[pk.id];
  const exam = examEntry()?.examDate;
  const days = examDays(date);
  const ch = sp ? chapters(pk, sp, state.p, date) : [];
  const tg = target(pk);
  const reached = ch.filter((c) => c.p !== null && c.p >= tg).length;
  const weak = ch.find((c) => c.weak);
  const aria = `${pk.domains.length}章のうち ${reached}章が 合格の線に 届いている${weak ? `。弱いのは 第${weak.n}章 ${weak.name}` : ''}`;
  return (
    <a class="pc-pack" href="#/growth" aria-label={`資格パック ${pk.code}。${aria}`}>
      <span class="pc-pkl">資格パック</span>
      <span class="pc-pkn">
        <b class="z-min">{pk.code}</b>
        <span class="z-tag z-tag-w">v{pk.packVersion}</span>
      </span>
      <span class="pc-pks">{exam && days !== null && days >= 0 ? `試験 ${md(exam)}（${DOW[dow(exam)]}）· あと ${days}日` : '試験日は まだ 決めていません'}</span>
      <span class="pc-pkb" aria-hidden="true">
        {pk.domains.map((d) => {
          const c = ch.find((x) => x.id === d.id);
          return <i key={d.id} class={c && c.p !== null && c.p >= tg ? 'd' : c?.weak ? 'w' : undefined} />;
        })}
      </span>
    </a>
  );
}

export function Rail({ r, date, now }: { r: Route; date: string; now: Date }) {
  const nb = state.profile.mode;
  const items = ITEMS.filter((it) => nb === 'p' || !it.personal);
  return (
    <aside class="pc-rail z-grain" aria-label="メニュー">
      <a class="pc-brand" href="#/today" aria-label="ZAN 今日へ">
        <Logo size={30} />
        <b class="z-min">ZAN</b>
      </a>
      <div class="pc-book" role="tablist" aria-label="手帳">
        {(['p', 'w'] as const).map((m, i) => (
          <button key={m} type="button" role="tab" aria-selected={nb === m} class={`pc-bk${nb === m ? ' on' : ''}`} onClick={() => switchBook(m)}>
            {m === 'p' ? '個人' : '仕事'}
            <kbd>{i + 1}</kbd>
          </button>
        ))}
      </div>
      <nav class="pc-nav" aria-label="メイン">
        {items.map((it) => {
          const on = r.name === it.r;
          const Icon = it.icon;
          const b = badge(it.r, date, now);
          return (
            <a key={it.r} href={`#/${it.r}`} class={`pc-nv${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
              <Icon />
              {it.label}
              {b && <em class={`z-num${b.red ? ' red' : ''}`}>{b.text}</em>}
            </a>
          );
        })}
      </nav>
      <span class="pc-sp" />
      {nb === 'p' ? (
        <Pack date={date} />
      ) : (
        <div class="pc-wrk">
          <b>仕事の手帳</b>
          経験値・敵・効果音は 出ません。{state.profile.sync.w ? '同期は オン。' : '中身は この端末の中だけ。'}
        </div>
      )}
      <div class="pc-me">
        {nb === 'p' ? <LvChip class="pc-lv" /> : <span class="pc-sp" />}
        <a href="#/settings" class={`pc-acc${r.name === 'settings' ? ' on' : ''}`} aria-label="設定とアカウント" aria-current={r.name === 'settings' ? 'page' : undefined}>
          <Account />
        </a>
      </div>
    </aside>
  );
}
