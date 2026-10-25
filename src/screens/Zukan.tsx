// 図鑑: the shadows that were cut down, their last words (the exam's key points), the seven types and the
// other enemies. Each entry opens a record of its week: the damage day by day and what was overcome.
import { useState } from 'preact/hooks';
import type { Boss, EnemyType, Pack, ZukanEntry } from '../core/types';
import { state } from '../core/store';
import { mixIntoKakera } from '../core/actions';
import { activePack, packOf, topicById } from '../core/pack';
import { accuracy } from '../core/study';
import { ENEMY, ENEMY_ORDER, TYPE_INFO, topicShort, weekNumber } from '../core/enemy';
import { UNLOCK_LV, unlocked } from '../core/game';
import { enemyArt, kakera, kanmon, kyoman } from '../art/enemies';
import { buzz, sfx } from '../core/sfx';
import { addDays, dayDiff, md, weekStart } from '../core/util';
import { BossArt, killedEntry } from '../ui/Boss';
import { firstWeek } from '../ui/derive';
import { go } from '../ui/router';
import { toast } from '../ui/fx';
import { useKey, useScrollLock } from '../ui/hooks';
import { ChevL, ChevR } from '../ui/icons';

type View = 'foe' | 'last';
/** The tab survives a visit to an entry and back. */
let lastView: View = 'foe';
const DOW_MON = ['月', '火', '水', '木', '金', '土', '日'];

const weekOf = (b: Boss) => `第${weekNumber(b, firstWeek() || b.week)}週`;

/** A name breaks before its type, the way it is written in the design: 取り込みの / 縛鎖. */
function nameLines(b: Boss) {
  const t = ENEMY[b.type].name;
  const i = b.name.lastIndexOf(t);
  return i > 0 ? [b.name.slice(0, i), b.name.slice(i)] : [b.name];
}

/** The key points under a last word: the flow or the pair this type is about, then the exam tip. */
function keyPoints(pk: Pack | undefined, b: Boss) {
  const t = pk ? topicById(pk, b.topicId) : undefined;
  if (!t) return [];
  const head = b.type === 'bakusa' && t.order ? `流れる順：${[...t.order.steps, t.order.last].join(' → ')}` : b.type === 'souei' && t.twins ? `${t.twins.a} と ${t.twins.b}：${t.twins.tell}` : '';
  return [head, t.examTip || (head ? '' : t.overview)].filter(Boolean);
}

function KeyPoints({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div class="zk-cexp">
      <b>要点</b>
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

/** A defeated shadow drawn cut in two along the slash. */
function SplitArt({ b, size, fresh, k = '' }: { b: Pick<Boss, 'id' | 'type' | 'terms'>; size: number; fresh?: boolean; k?: string }) {
  const id = `zs-${b.id}-${size}${k}`.replace(/[^a-zA-Z0-9-]/g, '');
  const html =
    `<defs><symbol id="${id}" viewBox="0 0 320 320">${enemyArt(b.type, b.terms)}</symbol>` +
    `<clipPath id="${id}a" clipPathUnits="userSpaceOnUse"><polygon points="-40,-40 360,-40 360,113 -40,207"/></clipPath>` +
    `<clipPath id="${id}b" clipPathUnits="userSpaceOnUse"><polygon points="-40,207 360,113 360,360 -40,360"/></clipPath></defs>` +
    `<g class="zk-ha"><g clip-path="url(#${id}a)"><use href="#${id}" width="320" height="320"/></g></g>` +
    `<g class="zk-hb"><g clip-path="url(#${id}b)"><use href="#${id}" width="320" height="320"/></g></g>` +
    `<g class="zk-hs"><path d="M-30 212L350 122" stroke="#D04D3A" stroke-width="5"/><path d="M-30 212L350 122" stroke="#FFF" stroke-width="1.6"/></g>`;
  return <svg class={`zk-split${fresh ? ' fresh' : ''}`} viewBox="0 0 320 320" width={size} height={size} aria-hidden="true" style={{ overflow: 'visible' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Art as a dark silhouette, for types not met yet. */
function Silhouette({ type, size }: { type: EnemyType; size: number }) {
  return <svg viewBox="0 0 320 320" width={size} height={size} aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<g filter="url(#zk-sil)">${enemyArt(type)}</g>` }} />;
}

function Defs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <defs>
        <filter id="zk-sil" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="2.4" result="d" />
          <feFlood flood-color="#E6E2DA" flood-opacity=".2" />
          <feComposite in2="d" operator="in" result="edge" />
          <feFlood flood-color="#1B1B1E" />
          <feComposite in2="SourceAlpha" operator="in" result="body" />
          <feMerge>
            <feMergeNode in="edge" />
            <feMergeNode in="body" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

/** On PC the book and one record sit side by side; the newest record shows until another is picked. */
export function Zukan({ args, date, pc = false }: { args: string[]; date: string; pc?: boolean }) {
  const id = args[0];
  const z = id ? state.p.zukan.find((x) => x.boss.id === id) : undefined;
  if (pc && state.p.zukan.length) {
    const shown = z ?? state.p.zukan[0];
    return (
      <div class="zk-pc">
        <Book date={date} sel={shown.boss.id} />
        <Entry key={shown.boss.id} z={shown} date={date} />
      </div>
    );
  }
  if (z) return <Entry z={z} date={date} />;
  return <Book date={date} />;
}

function Book({ date, sel }: { date: string; sel?: string }) {
  const [view, setView] = useState<View>(lastView);
  const [peek, setPeek] = useState<EnemyType | null>(null);
  const [split, setSplit] = useState(0);
  const pk = activePack();
  const p = state.p;
  const list = p.zukan;
  const cur = p.boss.cur;
  const met = new Set<EnemyType>([...list.map((z) => z.boss.type), ...p.boss.lost.map((b) => b.type), ...(cur ? [cur.type] : [])]);
  const killedTypes = new Set(list.map((z) => z.boss.type));
  const lv = p.game.lv;
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(date, i - 13));
  const shards = days14.filter((d) => p.days[d]?.kakera).length;
  const weekNow = cur ? weekOf(cur) : '';
  const pick = (v: View) => {
    if (v === view) return;
    sfx('tock');
    lastView = v;
    setView(v);
  };
  const open = (z: ZukanEntry) => {
    sfx('open');
    buzz(6);
    go(`zukan/${z.boss.id}`);
  };
  const tileOpen = (t: EnemyType) => {
    const z = list.find((x) => x.boss.type === t);
    if (z) open(z);
    else {
      sfx('low');
      buzz(5);
      setPeek(t);
    }
  };
  const [hero, ...rest] = list;
  const heroNew = !!hero && dayDiff(hero.at, date) <= 1;

  return (
    <div class="m-page zk">
      <Defs />
      <header class="zk-top">
        <div class="zk-tr">
          <b class="z-min zk-title">図鑑</b>
          {weekNow && <span class="z-tag z-tag-w z-tagx zk-wk">{weekNow}まで</span>}
        </div>
        <span class="m-sub">
          倒した影 {list.length}体 · 出会った型 {met.size} / 7 · 朝の欠片 {shards} / 14
        </span>
      </header>
      <div class="z-seg zk-seg" role="tablist" aria-label="図鑑の見方">
        <button type="button" role="tab" class={`z-sg${view === 'foe' ? ' on' : ''}`} aria-selected={view === 'foe'} onClick={() => pick('foe')}>
          影<b class="z-num">{list.length}</b>
        </button>
        <button type="button" role="tab" class={`z-sg${view === 'last' ? ' on' : ''}`} aria-selected={view === 'last'} onClick={() => pick('last')}>
          決め手<b class="z-num">{list.length}</b>
        </button>
      </div>

      {view === 'foe' ? (
        <div class="zk-view" key="foe">
          {hero ? (
            <section class={`zk-hero${sel === hero.boss.id ? ' on' : ''}`} aria-label={`いちばん新しい記録。${hero.boss.name}、${weekOf(hero.boss)} ${md(hero.at)} に討伐`}>
              <div class="zk-hbg" />
              <div
                class="zk-hart"
                onClick={() => {
                  sfx('slash');
                  buzz([8, 24, 12]);
                  setSplit(split + 1);
                }}
                aria-hidden="true"
              >
                <SplitArt key={split} b={hero.boss} size={280} fresh={heroNew || split > 0} k="h" />
              </div>
              <div class="zk-htx">
                <span class={`z-tag ${heroNew ? 'z-tag-r zk-new' : 'z-tag-g'}`}>{heroNew ? '新しく 記された' : 'いちばん 新しい'}</span>
                <span class="zk-hmeta">
                  {weekOf(hero.boss)} · {md(hero.at)} 討伐 · {list.length}体目
                </span>
                <b class="z-min zk-hname">
                  {nameLines(hero.boss).map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                </b>
                <span class="zk-htype">
                  <i>{ENEMY[hero.boss.type].kanji}</i>
                  {TYPE_INFO[hero.boss.type].kind}
                  {hero.boss.tier === 'strong' && <span class="z-tag z-tag-r zk-strong">強敵</span>}
                </span>
              </div>
              <div class={`zk-last${heroNew ? ' fresh' : ''}`}>
                <span class="zk-lt">決め手</span>
                <b class="z-min">「{hero.kimete}」</b>
              </div>
              <button type="button" class="z-bw zk-hgo" onClick={() => open(hero)}>
                記録を見る
                <ChevR size={14} />
              </button>
            </section>
          ) : (
            <section class="zk-empty">
              <span class="zk-eart">{cur ? <Silhouette type={cur.type} size={120} /> : <Silhouette type="bakusa" size={120} />}</span>
              <b class="z-min">図鑑は、まだ 白紙。</b>
              <span>{cur && cur.hp > 0 && !killedEntry(cur) ? `今週の敵「${cur.name}」を 倒すと、最期の言葉と いっしょに ここに 記されます。` : '週の影を 倒すと、最期の言葉と いっしょに ここに 記されます。'}</span>
              {cur && !killedEntry(cur) && (
                <a class="z-bw zk-ego" href="#/battle">
                  挑む
                </a>
              )}
            </section>
          )}
          {rest.length > 0 && (
            <div class="zk-rows">
              {rest.map((z) => (
                <button type="button" key={z.boss.id} class={`zk-row${sel === z.boss.id ? ' on' : ''}`} aria-current={sel === z.boss.id ? 'true' : undefined} onClick={() => open(z)} aria-label={`${z.boss.name}、${weekOf(z.boss)} ${md(z.at)} に討伐。記録を見る`}>
                  <span class="zk-rart">
                    <SplitArt b={z.boss} size={104} k="r" />
                  </span>
                  <span class="zk-rtx">
                    <span class="zk-rmeta">
                      {weekOf(z.boss)} · {md(z.at)} 討伐 · {list.length - list.indexOf(z)}体目
                    </span>
                    <b>{z.boss.name}</b>
                    <span class="zk-rlast">「{z.kimete}」</span>
                  </span>
                  <ChevR size={16} />
                </button>
              ))}
            </div>
          )}

          <div class="z-sec zk-sec">
            <b>型</b>
            <i />
            <span>
              出会った <em class="z-num">{met.size}</em> / 7
            </span>
          </div>
          <div class="zk-grid">
            {ENEMY_ORDER.map((t) => {
              const m = met.has(t);
              const e = ENEMY[t];
              const kills = list.filter((z) => z.boss.type === t).length;
              return (
                <button
                  type="button"
                  key={t}
                  class={`zk-tile ${m ? 'met' : 'un'}`}
                  onClick={() => tileOpen(t)}
                  aria-label={m ? `${e.name}、${TYPE_INFO[t].kind}。${kills ? `討伐 ${kills}回。記録を見る` : 'まだ 倒していない'}` : `まだ出会っていない型。${TYPE_INFO[t].born}に 生まれる`}
                >
                  <span class="zk-tart">{m ? <BossArt b={{ type: t, terms: [] }} /> : <Silhouette type={t} size={78} />}</span>
                  <b class="zk-tname">{m ? e.name : '？？'}</b>
                  <span class="zk-tsub">{m ? TYPE_INFO[t].kind : TYPE_INFO[t].hint}</span>
                  <i class="zk-tkj">{e.kanji}</i>
                  {killedTypes.has(t) && <i class="zk-tmk">討伐</i>}
                </button>
              );
            })}
            <div class="zk-tile zk-tinfo" aria-hidden="true">
              <b>型は 七つ</b>
              <span>迷い方から 生まれる。押すと、その生まれ方</span>
            </div>
          </div>

          <div class="z-sec zk-sec">
            <b>ほかの敵</b>
            <i />
          </div>
          <div class="zk-tiers">
            <div class="zk-tier">
              <svg viewBox="0 0 320 320" width="48" height="48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: kakera() }} />
              <span class="zk-tt">
                <b>
                  朝の欠片 <span class="z-num zk-tn">{shards} / 14</span>
                </b>
                <span class="zk-dots" aria-label={`この14日で ${shards}日`}>
                  {days14.map((d) => (
                    <i key={d} class={p.days[d]?.kakera ? 'on' : undefined} />
                  ))}
                </span>
                <span>毎朝 5問。前の日に 迷った問題が 先に出る</span>
              </span>
            </div>
            <div class={`zk-tier${unlocked(lv, 'strong') ? '' : ' off'}`}>
              <svg viewBox="0 0 320 320" width="48" height="48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: unlocked(lv, 'strong') ? kyoman() : `<g filter="url(#zk-sil)">${kyoman()}</g>` }} />
              <span class="zk-tt">
                <b>戻ってくる強敵</b>
                <span>倒しそびれた影が、次の週に 強くなって 戻る</span>
              </span>
              {unlocked(lv, 'strong') ? <span class="z-tag z-tag-r zk-lock">ひらいた</span> : <span class="z-tag zk-lock">Lv.{UNLOCK_LV.strong} で ひらく</span>}
            </div>
            <div class={`zk-tier${unlocked(lv, 'mock') ? '' : ' off'}`}>
              <svg viewBox="0 0 320 320" width="48" height="48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: unlocked(lv, 'mock') ? kanmon(pk?.code) : `<g filter="url(#zk-sil)">${kanmon(pk?.code)}</g>` }} />
              <span class="zk-tt">
                <b>模試</b>
                <span>本番と同じ 配分の 20問で、腕だめし</span>
              </span>
              {unlocked(lv, 'mock') ? (
                <a class="z-bo zk-tgo" href="#/session/mock">
                  はじめる
                </a>
              ) : (
                <span class="z-tag zk-lock">Lv.{UNLOCK_LV.mock} で ひらく</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <LastWords list={list} lv={lv} />
      )}

      {peek && <Peek type={peek} met={met.has(peek)} onClose={() => setPeek(null)} />}
    </div>
  );
}

function LastWords({ list, lv }: { list: ZukanEntry[]; lv: number }) {
  const [hide, setHide] = useState(false);
  const [rev, setRev] = useState<Record<string, boolean>>({});
  const can = unlocked(lv, 'recall');
  if (!list.length) {
    return (
      <div class="zk-view" key="last">
        <p class="zk-kh0">決め手は、倒した影の 最期の言葉。試験の要点が そのまま 残ります。最初の一体を 倒すと、ここに 並びます。</p>
      </div>
    );
  }
  return (
    <div class="zk-view" key="last">
      <div class="zk-kh">
        <span>決め手は、倒した影の 最期の言葉。試験の要点が そのまま 残る。</span>
        {can ? (
          <button
            type="button"
            class={`z-sw zk-sw${hide ? ' on' : ''}`}
            aria-pressed={hide}
            onClick={() => {
              sfx('tock');
              buzz(5);
              setHide(!hide);
              setRev({});
            }}
          >
            <span>隠して 思い出す</span>
            <span class="z-swt">
              <i />
            </span>
          </button>
        ) : (
          <span class="z-tag zk-lock">隠して 思い出す · Lv.{UNLOCK_LV.recall}</span>
        )}
      </div>
      {list.map((z) => {
        const pk = packOf(z.boss.certId);
        const sp = pk ? state.p.study[pk.id] : undefined;
        const qs = pk ? pk.questions.filter((q) => q.topicId === z.boss.topicId) : [];
        const acc = sp ? accuracy(sp, qs) : null;
        const shown = !hide || rev[z.boss.id];
        return (
          <article class="zk-card" key={z.boss.id}>
            <div class="zk-ch">
              <span class="z-tag z-tag-k zk-cw">{weekOf(z.boss)}</span>
              <b>{z.boss.name}</b>
              <span>{md(z.at)} 討伐</span>
            </div>
            <div class="zk-cqw">
              <p class="zk-cq">「{z.kimete}」</p>
              {hide && (
                <button
                  type="button"
                  class={`zk-cover${shown ? ' cut' : ''}`}
                  onClick={() => {
                    sfx('reveal');
                    buzz([6, 20, 8]);
                    setRev({ ...rev, [z.boss.id]: true });
                  }}
                  aria-label={`${z.boss.name} の決め手を 思い出してから 押す`}
                  tabIndex={shown ? -1 : 0}
                >
                  押して 思い出す
                </button>
              )}
            </div>
            <KeyPoints lines={keyPoints(pk, z.boss)} />
            <div class="zk-cf">
              <span>
                関連 {qs.length}問{acc !== null ? ` · 正答 ${Math.round(acc * 100)}%` : ''}
              </span>
              <a class="z-bk sm" href={`#/session/zukan/${z.boss.id}`}>
                3問 解く
              </a>
            </div>
          </article>
        );
      })}
      <p class="zk-kfoot">試験の前の日は、ここを「隠して 思い出す」で ひと通り。思い出せなかったら「3問 解く」で、そのまま 確かめられます。</p>
    </div>
  );
}

function Peek({ type, met, onClose }: { type: EnemyType; met: boolean; onClose: () => void }) {
  useScrollLock();
  useKey((e) => {
    if (e.key === 'Escape') onClose();
  });
  const e = ENEMY[type];
  return (
    <>
      <div class="z-scrim" onClick={onClose} />
      <div class="z-sheet zk-sheet" role="dialog" aria-modal="true" aria-label={met ? `${e.name}` : 'まだ出会っていない型'}>
        <div class="zk-sk">
          <span class="z-tag z-tag-k">{met ? `${e.name} · ${TYPE_INFO[type].kind}` : 'まだ出会っていない型'}</span>
          <b>{e.kanji}</b>
        </div>
        <span class="zk-sart2">{met ? <BossArt b={{ type, terms: [] }} /> : <Silhouette type={type} size={120} />}</span>
        <p class="zk-sb">{TYPE_INFO[type].born}に 生まれる。</p>
        <p class="zk-sm">
          {met
            ? `出会ったが、まだ 倒していない型。会心の条件は「${e.crit}」。`
            : '出会っていないのは、この弱点が まだ 見つかっていないから。答え方の記録に 表れたら、その週の敵として 現れます。'}
        </p>
        <button type="button" class="z-bk sm" onClick={onClose}>
          とじる
        </button>
      </div>
    </>
  );
}

/** One entry: the shadow cut in two, its last word, its week day by day. */
function Entry({ z, date }: { z: ZukanEntry; date: string }) {
  const [bar, setBar] = useState(-1);
  const p = state.p;
  const b = z.boss;
  const pk = packOf(b.certId);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(b.week), i));
  const vals = days.map((d) => (d <= z.at ? p.days[d]?.dmg || 0 : 0));
  const killI = days.indexOf(z.at);
  const max = Math.max(1, ...vals);
  const bestI = vals.indexOf(Math.max(...vals));
  const fights = days.flatMap((d) => (d <= z.at ? p.days[d]?.fights || [] : []));
  const asked = fights.length ? fights.reduce((a, f) => a + f.n, 0) : z.answers;
  const right = fights.length ? fights.reduce((a, f) => a + f.ok, 0) : z.correct;
  const killFight = (p.days[z.at]?.fights || []).find((f) => f.kill);
  const sp = pk ? p.study[pk.id] : undefined;
  const topicQs = new Set(pk ? pk.questions.filter((q) => q.topicId === b.topicId).map((q) => q.id) : []);
  const over = sp
    ? [...topicQs].filter((qid) => {
        const log = sp.log.filter((a) => a.q === qid && a.d <= z.at);
        const miss = log.findIndex((a) => !a.ok);
        return miss >= 0 && log.slice(miss + 1).some((a) => a.ok && a.conf !== 'guess');
      }).length
    : 0;
  const total = vals.reduce((a, v) => a + v, 0);
  const note =
    bar >= 0
      ? `${md(days[bar])}（${DOW_MON[bar]}）に ${vals[bar]} 与えた`
      : killI >= 0
        ? `${DOW_MON[killI]}曜${killFight ? `の ${new Date(killFight.at).getHours()}時台` : ''}に、とどめ。棒を押すと その日の数字`
        : '棒を押すと その日の数字';
  const mix = () => {
    if (!pk) return;
    const n = mixIntoKakera(pk, b.topicId, date);
    sfx('write');
    const todayOpen = p.tasks.some((t) => t.study?.kind === 'kakera' && t.date === date && !t.doneAt);
    toast(`${todayOpen ? '今日' : 'あした'}の朝の欠片に、${topicShort(topicById(pk, b.topicId)!)}の問題を ${n}問 まぜました`);
  };
  useKey((e) => {
    if (e.key === 'Escape') go('zukan');
  });

  return (
    <div class="m-page zk zk-det">
      <Defs />
      <header class="m-bar z-grain">
        <a class="zk-back" href="#/zukan">
          <ChevL />
          図鑑
        </a>
      </header>
      <div class="zk-dhero">
        <SplitArt b={b} size={300} k="d" />
        <div class="zk-dtags">
          <span class="z-tag z-tag-r">討伐</span>
          <span class="z-tag z-tag-k">
            {weekOf(b)} · {md(z.at)}
          </span>
          {b.tier === 'strong' && <span class="z-tag z-tag-w">強敵</span>}
        </div>
      </div>
      <b class="z-min zk-dname">{b.name}</b>
      <span class="zk-dkind">
        <i>{ENEMY[b.type].kanji}</i>
        {ENEMY[b.type].name} — {TYPE_INFO[b.type].kind}
      </span>
      <span class="zk-dborn">{b.born}</span>
      <div class="zk-dlast">
        <span class="zk-lt">決め手</span>
        <b>「{z.kimete}」</b>
        <KeyPoints lines={keyPoints(pk, b)} />
      </div>

      <div class="z-sec zk-sec zk-sec2">
        <b>戦いの記録</b>
        <i />
        <span>与えたダメージ · 日ごと</span>
      </div>
      <div class="zk-chart" role="img" aria-label={`${b.name} に与えたダメージ。${vals.map((v, i) => `${DOW_MON[i]} ${v}`).join('、')}。合計 ${total}`}>
        <span class="zk-base" />
        <div class="zk-cols">
          {vals.map((v, i) => (
            <button
              type="button"
              key={i}
              class={['zk-col', i === killI && 'kill', (i === bestI || i === killI) && v > 0 && 'lab', bar === i && 'on'].filter(Boolean).join(' ')}
              style={{ '--h': `${Math.round((v / max) * 112)}px` }}
              onClick={() => {
                sfx('tock');
                setBar(bar === i ? -1 : i);
              }}
              aria-label={`${md(days[i])} ${DOW_MON[i]}曜、${v}`}
            >
              <span class="zk-bar" style={{ animationDelay: `${(0.25 + i * 0.05).toFixed(2)}s` }} />
              <span class="zk-bv z-num">{v}</span>
              <span class="zk-bd">{i === killI ? 'とどめ' : DOW_MON[i]}</span>
            </button>
          ))}
        </div>
      </div>
      <span class="zk-cnote">{note}</span>

      <div class="zk-dst">
        <div>
          <span>挑んだ問題</span>
          <b class="z-num">
            {asked}
            <small>問</small>
          </b>
        </div>
        <div>
          <span>正答</span>
          <b class="z-num">
            {asked ? Math.round((right / asked) * 100) : 0}
            <small>%</small>
          </b>
        </div>
        <div>
          <span>いちばんの一撃</span>
          <b class="z-num">
            {Math.max(...vals)}
            <small> {DOW_MON[bestI]}曜</small>
          </b>
        </div>
        <div>
          <span>越えた迷い</span>
          <b class="z-num">
            {over}
            <small>問</small>
          </b>
        </div>
      </div>
      <div class="zk-dact">
        <a class="z-bw" href={`#/session/zukan/${b.id}`}>
          この影の 3問を、もう一度
        </a>
        <button type="button" class="z-bo" onClick={mix}>
          朝の欠片に まぜる
        </button>
      </div>
    </div>
  );
}

