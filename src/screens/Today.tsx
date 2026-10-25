// 今日 on phones: the date, this week's shadow, today's tasks to cut, the suggestion and what's coming.
import { state } from '../core/store';
import { acceptSuggestion, setProfile, skipSuggestion } from '../core/actions';
import { studyTaskDamage } from '../core/enemy';
import { upcoming } from '../core/tasks';
import { sfx } from '../core/sfx';
import { addDays, dowName, md } from '../core/util';
import type { Notebook, Task } from '../core/types';
import { BossCard, killedEntry } from '../ui/Boss';
import { LvChip } from '../ui/LvChip';
import { TaskRow } from '../ui/TaskRow';
import { PlanCard } from '../ui/WorkPlan';
import { added, fx, toast } from '../ui/fx';
import { openSheet } from '../ui/sheets';
import { dayList, doneCount, examDays, isWeekend, nextWorkday, streakNow } from '../ui/derive';
import { Account, Arrow, Close, NavRecap, Plus } from '../ui/icons';
import { RECAP_HOUR } from '../core/recap';

export const PROMISES = [
  '中身は、あなたにしか 見えません。',
  '同期は、自分で オンにしたときだけ。はじめは オフです。',
  'AI に見せるときは、そのつど 送る中身を 確かめてから。',
  '個人の手帳に残るのは「仕事：済み 3件」のような 件数だけ。',
  '評価や、人との 比較には 使いません。',
];

export function NotebookSwitch({ class: c = '' }: { class?: string }) {
  const nb = state.profile.mode;
  const pick = (m: Notebook) => {
    if (m === nb) return;
    sfx('flip');
    setProfile({ mode: m });
  };
  return (
    <div class={`z-seg td-nb ${c}`} role="tablist" aria-label="手帳">
      <button type="button" role="tab" aria-selected={nb === 'p'} class={`z-sg sm${nb === 'p' ? ' on' : ''}`} onClick={() => pick('p')}>
        個人
      </button>
      <button type="button" role="tab" aria-selected={nb === 'w'} class={`z-sg sm${nb === 'w' ? ' on' : ''}`} onClick={() => pick('w')}>
        仕事
      </button>
    </div>
  );
}

/** Which page of 1日の記録 to point at from 今日, and how to say it. */
export function recapPointer(date: string, now: Date) {
  const r = state.p.recaps[date];
  if (r && !r.deleted && now.getHours() >= RECAP_HOUR) return { to: date, title: '今日のページが できました', sub: r.text, fresh: !r.seen };
  const y = addDays(date, -1);
  const ry = state.p.recaps[y];
  if (ry && !ry.deleted) return { to: y, title: 'きのうのページ', sub: ry.text, fresh: !ry.seen };
  return { to: '', title: `今夜 ${RECAP_HOUR}:00 に、今日のページを 書きます`, sub: '', fresh: false };
}

export function Today({ date, now, onReplay }: { date: string; now: Date; onReplay: () => void }) {
  const nb = state.profile.mode;
  const list = dayList(nb, date);
  const done = doneCount(list, date);
  const book = nb === 'p' ? state.p : state.w;
  const open = (t: Task) => openSheet({ kind: 'task', nb, id: t.id });
  const days = examDays(date);
  const streak = streakNow(date);
  const boss = state.p.boss.cur;
  const bossUp = !!boss && boss.hp > 0 && !killedEntry(boss);
  const sug = state.p.ai.sug;
  const weekend = nb === 'w' && isWeekend(date);
  const shown = new Set(list.map((t) => t.id));
  const soon = upcoming(book.tasks, date, 7).filter((x) => !shown.has(x.t.id)).slice(0, 5);
  const rec = recapPointer(date, now);
  const go = fx.entering;

  const sub =
    nb === 'p'
      ? [days === null ? '試験日は まだ' : days > 0 ? `試験まで ${days}日` : days === 0 ? '今日が 試験' : '', streak > 0 ? `学習 ${streak}日つづけて` : '学習は 今日から'].filter(Boolean).join(' · ')
      : state.profile.sync.w
        ? '仕事の手帳 · 同期は オン'
        : '仕事の手帳 · この端末の中だけ';
  const three = nb === 'p' && (state.p.days[date]?.three ?? false);
  const threeText = nb === 'p' ? (three ? '三つ斬った · +30' : `三つまで あと ${Math.max(0, 3 - done)}`) : list.length ? `済み ${done}件` : '';

  const accept = () => {
    const t = acceptSuggestion(date);
    if (!t) return;
    sfx('tock');
    added(t.id);
    toast(`今日に足しました · ${t.title}`, { undo: true });
  };
  const skip = () => {
    skipSuggestion(date);
    sfx('soft');
    toast('今日の案は、しまいました', { undo: true });
  };

  return (
    <div class={`m-page td${nb === 'w' ? ' m-work' : ''}${go ? ' z-go' : ''}`}>
      <header class="m-head z-grain td-head z-e1">
        <div class="td-top">
          <NotebookSwitch />
          <span class="td-sp" />
          {nb === 'p' && (
            <a href={rec.to ? `#/recap/${rec.to}` : '#/recap'} class="z-ib td-ib" aria-label={`1日の記録${rec.fresh ? '（新しいページ）' : ''}`}>
              <NavRecap />
              {rec.fresh && <span class="z-dot" />}
            </a>
          )}
          <a href="#/settings" class="z-ib td-ib" aria-label="設定とアカウント">
            <Account />
          </a>
        </div>
        <div class="td-row">
          <div class="td-dt">
            <div class="td-date">
              <b class="z-min z-num">{md(date)}</b>
              <span class={`z-tag ${nb === 'p' ? 'z-tag-r' : 'z-tag-w'}`}>{dowName(date)}</span>
            </div>
            <span class="td-sub">{sub}</span>
          </div>
          <span class="td-sp" />
          {nb === 'p' ? (
            <LvChip />
          ) : (
            <span class="td-wcnt" aria-label={`済み ${done}件、全部で ${list.length}件`}>
              <b class="z-min z-num">{done}</b>
              <span>/ {list.length} 済み</span>
            </span>
          )}
        </div>
      </header>

      {nb === 'p' && <BossCard date={date} class="z-e2" />}

      {weekend && (
        <div class="td-wban">
          <b>週末は、仕事の手帳を 休ませています。</b>
          <span>見えているのは、月曜 {md(nextWorkday(date))} の ぶん。</span>
        </div>
      )}

      <div class="z-sh td-sh z-e3" style={{ animationDelay: '.2s' }}>
        <span class={`z-tag z-tag-w${nb === 'p' ? ' z-tagx' : ''}`}>今日</span>
        <b class="z-min z-num td-cnt">
          <span>{done}</span>
          <span> / {list.length}</span>
        </b>
        <span class="z-line" />
        <span class={`td-three${three ? ' on' : ''}`}>{threeText}</span>
      </div>

      <div class="td-list" role="list">
        {list.map((t, i) => (
          <div role="listitem" key={t.id}>
            <TaskRow t={t} nb={nb} date={date} onOpen={open} delay={go ? 0.26 + i * 0.05 : undefined} />
          </div>
        ))}
        {!list.length && (
          <div class="z-empty td-empty">
            <b>{nb === 'p' ? '今日は、まだ 白紙。' : weekend ? '月曜のぶんは、まだ ありません。' : '仕事のやることは、まだ ありません。'}</b>
            {nb === 'p' ? '一つ書いて、一つ斬る。三つで +30。' : '書いたものは、この手帳の中だけに 残ります。'}
          </div>
        )}
        <button type="button" class="td-add" onClick={() => openSheet({ kind: 'add', nb })}>
          <span class="td-addk" aria-hidden="true">
            <Plus />
          </span>
          <span class="td-addt">書く</span>
          <span class="td-addh">「あした 19:00」「毎日」も そのまま</span>
        </button>
        <p class="td-hint">長押しで、直す・明日へ</p>
      </div>

      {nb === 'p' && sug && sug.date === date && !sug.done && (
        <div class="z-ai z-e3" style={{ animationDelay: '.5s' }}>
          <div class="z-ai-tx">
            <span class="z-ai-l">
              {sug.source === 'ai' ? 'AI の案' : '今日の案'}
              <span>{sug.reason}</span>
            </span>
            <b>{sug.title}</b>
            <span class="z-ai-s">約5分{bossUp ? ` · ${boss!.name}に ${studyTaskDamage(30)} のダメージ` : ''}</span>
          </div>
          <button type="button" class="z-bo" onClick={accept}>
            足す
          </button>
          <button type="button" class="z-ai-x" onClick={skip} aria-label="今日の案を しまう">
            <Close size={12} />
          </button>
        </div>
      )}

      {nb === 'w' && <PlanCard />}

      {soon.length > 0 && (
        <>
          <div class="z-sh td-sh2">
            <span class="z-tag z-tag-k td-tagk">近日</span>
            <span class="z-line" />
          </div>
          <div class="td-soon">
            {soon.map(({ d, t }) => (
              <button type="button" key={t.id} class="td-soonr" onClick={() => open(t)}>
                <b class="z-min z-num">{md(d)}</b>
                <span>
                  {t.title}
                  {t.time ? ` · ${t.time}` : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {nb === 'p' && (
        <a class="td-rec" href={rec.to ? `#/recap/${rec.to}` : '#/recap'}>
          <span class="td-recl">
            1日の記録
            {rec.fresh && <i class="td-recn">新しい</i>}
          </span>
          <b>{rec.title}</b>
          {rec.sub && <span class="td-recs">{rec.sub}</span>}
          <Arrow class="td-reca" />
        </a>
      )}

      {nb === 'w' && (
        <section class="td-pro" aria-label="仕事の手帳の約束">
          <div class="z-sh">
            <span class="z-tag z-tag-k td-tagk">仕事の手帳の約束</span>
            <span class="z-line" />
          </div>
          <ol>
            {PROMISES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </section>
      )}

      {nb === 'p' && state.profile.ritual && (
        <button type="button" class="z-link td-replay" onClick={onReplay}>
          朝の演出を、もう一度見る
        </button>
      )}
    </div>
  );
}
