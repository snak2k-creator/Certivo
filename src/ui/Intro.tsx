// The morning ritual: the date slams in on a red band, the exam countdown ticks down by one, today's aim,
// and a slash splits the screen open. About two seconds; a tap skips it.
import { useEffect, useRef, useState } from 'preact/hooks';
import { state } from '../core/store';
import { BATTLE_QUESTIONS, ENEMY, weekNumber } from '../core/enemy';
import { dowName, md } from '../core/util';
import { sfx } from '../core/sfx';
import { examDays, firstWeek } from './derive';
import { killedEntry } from './Boss';
import { useKey, useTimers } from './hooks';

export function introAim() {
  const b = state.p.boss.cur;
  if (!b || killedEntry(b)) return { aim: '今日の三つを、斬る。', sub: b ? `今週の影は、もう倒した。あとは 一つずつ。` : '朝の欠片から、はじめよう。' };
  if (b.hp <= 0) return { aim: `${b.name}に、とどめを。`, sub: '体力は 尽きている。挑めば、最後の一太刀。' };
  const sub = b.type === 'bakusa' ? `${BATTLE_QUESTIONS}問。最後は、札をデータが流れる順に斬る。` : `${BATTLE_QUESTIONS}問。${ENEMY[b.type].gimmick}。`;
  return { aim: b.hp <= b.max * 0.35 ? `${b.name}に、とどめを。` : `${b.name}を、削る。`, sub };
}

export function Intro({ date, onDone }: { date: string; onDone: () => void }) {
  const [out, setOut] = useState(false);
  const ended = useRef(false);
  const later = useTimers();
  const days = examDays(date);
  const b = state.p.boss.cur;
  const week = b ? weekNumber(b, firstWeek()) : 1;
  const { aim, sub } = introAim();

  const end = () => {
    if (ended.current) return;
    ended.current = true;
    sfx('ritual');
    setOut(true);
    later(onDone, 620);
  };
  useEffect(() => {
    later(end, 2300);
  }, []);
  useKey(() => end());

  const showCd = days !== null && days > 0;
  const half = (cls: string) => (
    <div class={`z-ih ${cls} z-grain`}>
      <div class="z-i-in">
        {showCd && (
          <div class="z-i-cd" aria-hidden="true">
            <span class="z-i-cdl">試験まで</span>
            <span class="z-i-cdn">
              <b class="z-min z-num z-i-ghost">{days + 1}</b>
              <b class="z-min z-num z-i-old">{days + 1}</b>
              <b class="z-min z-num z-i-new">{days}</b>
              <i class="z-i-cds" />
            </span>
            <span class="z-i-cdd">日</span>
          </div>
        )}
        <div class="z-i-thin" />
        <div class="z-i-band" />
        <div class="z-i-date">
          <b class="z-min z-num z-i-big">{md(date)}</b>
          <span class="z-i-week">第{week}週</span>
          <span class="z-i-dow z-tag z-tag-k">{dowName(date)}</span>
        </div>
        <div class="z-i-aim">
          <span>今日のねらい</span>
          <b class="z-min">{aim}</b>
          <span>{sub}</span>
        </div>
        <span class="z-i-skip">タップでとばす</span>
      </div>
    </div>
  );
  const label = `${md(date)} ${dowName(date)}。${showCd ? `試験まで ${days}日。` : ''}今日のねらい、${aim}`;
  return (
    <div class={`z-intro${out ? ' z-out' : ''}`} onClick={end} role="dialog" aria-modal="true" aria-label={label}>
      {half('z-ih-t')}
      {half('z-ih-b')}
      <svg class="z-i-slash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="-2" y1="59.2" x2="102" y2="46.8" pathLength={1} stroke="#FFF" stroke-width="3" vector-effect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
