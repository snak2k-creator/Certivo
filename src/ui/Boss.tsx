// This week's shadow on 今日: name, where it came from, its HP and the way in. Takes hits when study tasks are cut.
import type { Boss } from '../core/types';
import { state } from '../core/store';
import { BATTLE_QUESTIONS, ENEMY, weekNumber } from '../core/enemy';
import { enemyArt, type BakusaOpts } from '../art/enemies';
import { dayDiff, md } from '../core/util';
import { fx } from './fx';
import { firstWeek } from './derive';
import { Arrow } from './icons';

export function BossArt({ b, opts, class: c, label }: { b: Pick<Boss, 'type' | 'terms'>; opts?: BakusaOpts; class?: string; label?: string }) {
  return <svg viewBox="0 0 320 320" class={c} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} dangerouslySetInnerHTML={{ __html: enemyArt(b.type, b.terms, opts) }} />;
}

export function bossWhen(b: Boss, date: string) {
  const left = dayDiff(date, b.deadline);
  if (left <= 0) return '今夜まで';
  if (left === 1) return 'あすの夜まで';
  return `あと ${left}日 · ${md(b.deadline)}まで`;
}

export const killedEntry = (b?: Boss) => (b ? state.p.zukan.find((z) => z.boss.id === b.id) : undefined);

export function BossCard({ date, class: c = '' }: { date: string; class?: string }) {
  const b = state.p.boss.cur;
  if (!b) {
    return (
      <section class={`z-boss is-wait ${c}`} aria-label="今週の敵">
        <div class="z-boss-tx">
          <span class="z-tag z-tag-g">今週の敵</span>
          <b class="z-min z-boss-name">まだ 姿がない</b>
          <span class="z-boss-born">問題集を 読みこむと、弱点から 生まれます</span>
        </div>
      </section>
    );
  }
  const meta = ENEMY[b.type];
  const dead = killedEntry(b);
  const ready = !dead && b.hp <= 0;
  const week = weekNumber(b, firstWeek());
  const hit = fx.hitNow;
  const shake = hit ? (hit.id % 2 ? 'z-shakeA' : 'z-shakeB') : '';
  const hpPct = (b.hp / b.max) * 100;
  const lost = hit ? ((hit.from - hit.to) / b.max) * 100 : 0;
  const aria = dead ? `今週の敵、${b.name}。倒しました` : `今週の敵、${b.name}。体力 ${b.hp}`;

  return (
    <section class={`z-boss${dead ? ' is-dead' : ''}${ready ? ' is-ready' : ''} ${c}`} aria-label={aria}>
      <div class={`z-boss-in ${shake}`}>
        <svg class="z-boss-lines" viewBox="0 0 390 240" preserveAspectRatio="xMinYMin slice" aria-hidden="true">
          <path d="M-10 196L190 60M20 226L210 98M-20 150L150 34" stroke="rgba(234,231,224,.05)" stroke-width="1" />
        </svg>
        <div class="z-boss-art">
          <BossArt b={b} opts={b.type === 'bakusa' ? { scars: Math.min(3, Math.floor((1 - b.hp / b.max) * 4)) } : undefined} />
          {dead && <i class="z-boss-x" />}
          {hit && <span key={'h' + hit.id} class="z-bhit" />}
          {hit && (
            <span key={'d' + hit.id} class="z-dmg z-num">
              −{hit.dmg}
            </span>
          )}
        </div>
        <div class="z-boss-tx">
          <span class="z-tag z-tag-w">
            第{week}週の敵 · {dead ? '討伐' : meta.name}
          </span>
          <b class="z-min z-boss-name">{b.name}</b>
          <span class="z-boss-born">{b.born}</span>
          {dead ? (
            <>
              <span class="z-boss-when">{md(dead.at)}に 倒した。次の影は 月曜に 生まれる。</span>
              <a href={`#/zukan/${b.id}`} class="z-bo z-boss-go">
                図鑑で見る
              </a>
            </>
          ) : (
            <>
              <div class="z-boss-hp">
                <span>体力</span>
                <span class="z-hp">
                  <span style={{ width: `${hpPct}%` }} />
                  {hit && <b key={'f' + hit.id} class="z-hpflash" style={{ left: `${hpPct}%`, width: `${lost}%` }} />}
                </span>
                <b class="z-min z-num">{b.hp}</b>
              </div>
              <span class="z-boss-when">{ready ? '体力が 尽きた。とどめを 刺せる' : `挑むと ${BATTLE_QUESTIONS}問 · ${bossWhen(b, date)}`}</span>
              <a href="#/battle" class="z-bw z-boss-go">
                {ready ? 'とどめを刺す' : '挑む'}
                <Arrow />
              </a>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
