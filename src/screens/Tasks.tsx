// やること: the whole notebook by when. The box cuts (it counts for today), the row opens the task.
import { useRef, useState } from 'preact/hooks';
import type { Notebook, Task } from '../core/types';
import { notebook, state } from '../core/store';
import { DIFF } from '../core/game';
import { doneDay, doneOn, isRepeating, repeatLabel, tasksFor } from '../core/tasks';
import { sfx } from '../core/sfx';
import { addDays, dayDiff, DOW, dow, md, mdSlash, reducedMotion } from '../core/util';
import { TaskRow } from '../ui/TaskRow';
import { openSheet } from '../ui/sheets';
import { toast } from '../ui/fx';
import { Plus } from '../ui/icons';
import { NotebookSwitch } from './Today';

const at = (t: Task) => t.time || '99:99';
const byWhen = (a: Task, b: Task) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : at(a) !== at(b) ? (at(a) < at(b) ? -1 : 1) : a.createdAt - b.createdAt);
/** Weekday cells start on Monday. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const PAST_DAYS = 14;

const relDay = (d: string, date: string) => {
  const n = dayDiff(date, d);
  return n === 1 ? 'あした' : n === 2 ? 'あさって' : `${n}日後`;
};

/** A repeating task: which weekdays, and how today stands. Opens; it is cut from 今日. */
function RepeatRow({ t, nb, date }: { t: Task; nb: Notebook; date: string }) {
  const r = t.repeat!;
  const started = t.date <= date;
  const todayToo = started && r.includes(dow(date)) && !t.skip?.[date];
  const done = doneOn(t, date);
  const from = addDays(date, -27);
  const times = Object.keys(t.doneOn || {}).filter((d) => d >= from && d <= date).length;
  const status = !started ? `${mdSlash(t.date)}から` : todayToo ? (done ? '今日は 済み' : '今日も') : t.skip?.[date] ? '今日は とばした' : '今日は 休み';
  const meta = [repeatLabel(r), t.time, times ? `この4週で ${times}回` : ''].filter(Boolean).join(' · ');
  return (
    <button type="button" class={`tk-rep${done ? ' on' : ''}`} onClick={() => openSheet({ kind: 'task', nb, id: t.id })} aria-label={`${t.title}。${meta}。${status}`}>
      <span class="tk-repd" aria-hidden="true">
        {WEEK.map((w) => (
          <i key={w} class={[r.includes(w) && 'on', w === dow(date) && 'now'].filter(Boolean).join(' ')}>
            {DOW[w]}
          </i>
        ))}
      </span>
      <span class="z-rt">
        <span class="z-ttl">
          <span>{t.title}</span>
        </span>
        <span class="z-meta">{meta}</span>
      </span>
      <span class={`tk-reps${todayToo && !done ? ' due' : ''}`}>{status}</span>
    </button>
  );
}

export function Tasks({ date }: { date: string }) {
  const nb = state.profile.mode;
  const book = notebook(nb);
  const [past, setPast] = useState(false);
  const [sel, setSel] = useState(0);
  const head = useRef<HTMLElement>(null);
  const open = (t: Task) => openSheet({ kind: 'task', nb, id: t.id });
  const add = (d?: string) => openSheet({ kind: 'add', nb, date: d });

  const one = book.tasks.filter((t) => !isRepeating(t));
  const late = one.filter((t) => !t.doneAt && t.date < date).sort(byWhen);
  const lateIds = new Set(late.map((t) => t.id));
  const now = tasksFor(book.tasks, date, date).filter((t) => !lateIds.has(t.id));
  const nowDone = now.filter((t) => doneOn(t, date)).length;
  const ahead = one.filter((t) => !t.doneAt && t.date > date).sort(byWhen);
  const groups: { d: string; list: Task[] }[] = [];
  for (const t of ahead) {
    const g = groups[groups.length - 1];
    if (g && g.d === t.date) g.list.push(t);
    else groups.push({ d: t.date, list: [t] });
  }
  const reps = book.tasks.filter(isRepeating).sort((a, b) => (at(a) !== at(b) ? (at(a) < at(b) ? -1 : 1) : a.createdAt - b.createdAt));
  const since = addDays(date, -PAST_DAYS);
  const done = one.filter((t) => t.doneAt && doneDay(t) < date && doneDay(t) >= since).sort((a, b) => b.doneAt! - a.doneAt!);
  const left = late.length + now.length - nowDone + ahead.length;
  const empty = !late.length && !now.length && !ahead.length && !reps.length;

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(date, i);
    const n = i === 0 ? late.length + now.length - nowDone : groups.find((g) => g.d === d)?.list.length ?? 0;
    return { d, n };
  });
  const jump = (d: string, i: number) => {
    sfx('tock');
    const el = document.getElementById(i === 0 ? 'tk-today' : `tk-${d}`);
    if (!el) {
      toast(`${md(d)} ${DOW[dow(d)]}は、まだ 白紙`, { action: { label: '書く', run: () => add(d) } });
      return;
    }
    setSel(i);
    const off = (head.current?.getBoundingClientRect().height ?? 0) + 6;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  const sub =
    nb === 'p'
      ? [`今日 ${nowDone} / ${now.length}`, late.length ? `遅れ ${late.length}` : '', reps.length ? `くりかえし ${reps.length}` : ''].filter(Boolean).join(' · ')
      : [`今日 ${nowDone} / ${now.length}`, state.profile.sync.w ? '同期は オン' : 'この端末の中だけ'].join(' · ');

  return (
    <div class={`m-page tk${nb === 'w' ? ' m-work' : ''}`}>
      <header ref={head} class="m-head z-grain tk-head">
        <div class="tk-top">
          <NotebookSwitch />
          <span class="tk-sp" />
          <button type="button" class="z-ib tk-ib" onClick={() => add()} aria-label="やることを書く">
            <Plus size={18} />
          </button>
        </div>
        <div class="tk-row">
          <div class="tk-tt">
            <b class="m-title z-min">やること</b>
            <span class="m-sub">{sub}</span>
          </div>
          <span class="tk-left" aria-label={`残り ${left}件`}>
            <b class="z-min z-num">{left}</b>
            <span>残り</span>
          </span>
        </div>
      </header>

      <nav class="z-week tk-week" aria-label="この先の 7日">
        <span class="z-wsel" style={{ transform: `translateX(${sel * 100}%)` }} />
        {week.map(({ d, n }, i) => (
          <button key={d} type="button" class={`z-wd${i === sel ? ' on' : ''}${n ? '' : ' none'}`} onClick={() => jump(d, i)} aria-label={`${i === 0 ? '今日' : md(d)} ${DOW[dow(d)]}曜、${n ? `${n}件` : 'なし'}`}>
            <span class="z-wdw">{i === 0 ? '今日' : DOW[dow(d)]}</span>
            <b class="z-min z-num">{Number(d.slice(8))}</b>
            {n > 0 ? <span class="z-wt" style={{ width: `${Math.min(7, n) * 4 - 2}px` }} /> : <span class="z-wt0" />}
          </button>
        ))}
      </nav>

      <button type="button" class="td-add tk-add" onClick={() => add()}>
        <span class="td-addk" aria-hidden="true">
          <Plus />
        </span>
        <span class="td-addt">書く</span>
        <span class="td-addh">{nb === 'p' ? '「あした 19:00 歯医者」「毎日 ストレッチ」' : '「10/31まで 見積もり」「平日 9:30 朝会」'}</span>
      </button>

      {empty && (
        <div class="z-empty tk-empty">
          <b>{nb === 'p' ? 'まだ、何も書いていません。' : '仕事のやることは、まだ ありません。'}</b>
          {nb === 'p' ? '一行で書けば、日付も時刻も くりかえしも 読みとります。' : '書いたものは、仕事の手帳の中だけに 残ります。'}
        </div>
      )}

      {late.length > 0 && (
        <section class="tk-sec" aria-label={`遅れ ${late.length}件`}>
          <div class="z-sh tk-sh">
            <span class="z-tag z-tag-r">遅れ</span>
            <b class="z-num tk-n">{late.length}</b>
            <span class="z-line" />
            <span class="tk-shr">斬れば 今日のぶんに</span>
          </div>
          <div role="list">
            {late.map((t) => (
              <div role="listitem" key={t.id}>
                <TaskRow t={t} nb={nb} date={date} mode="manage" onOpen={open} />
              </div>
            ))}
          </div>
        </section>
      )}

      {now.length > 0 && (
        <section class="tk-sec" id="tk-today" aria-label={`今日 ${now.length}件`}>
          <div class="z-sh tk-sh">
            <span class={`z-tag z-tag-w${nb === 'p' ? ' z-tagx' : ''}`}>今日</span>
            <b class="z-num tk-n">
              {nowDone}
              <span> / {now.length}</span>
            </b>
            <span class="z-line" />
            <span class="tk-shr">{md(date)} {DOW[dow(date)]}</span>
          </div>
          <div role="list">
            {now.map((t) => (
              <div role="listitem" key={t.id}>
                <TaskRow t={t} nb={nb} date={date} mode="manage" onOpen={open} />
              </div>
            ))}
          </div>
        </section>
      )}

      {groups.map((g) => (
        <section class="tk-sec" id={`tk-${g.d}`} key={g.d} aria-label={`${md(g.d)} ${g.list.length}件`}>
          <div class="z-sh tk-sh">
            <span class="z-tag z-tag-k tk-tagk">
              <span class="z-num">{md(g.d)}</span>&nbsp;{DOW[dow(g.d)]}
            </span>
            <span class="tk-rel">{relDay(g.d, date)}</span>
            <span class="z-line" />
            <button type="button" class="tk-shadd" onClick={() => add(g.d)} aria-label={`${md(g.d)}に 書く`}>
              <Plus size={12} />
            </button>
          </div>
          <div role="list">
            {g.list.map((t) => (
              <div role="listitem" key={t.id}>
                <TaskRow t={t} nb={nb} date={date} mode="manage" onOpen={open} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {reps.length > 0 && (
        <section class="tk-sec" aria-label={`くりかえし ${reps.length}件`}>
          <div class="z-sh tk-sh">
            <span class="z-tag z-tag-k tk-tagk">くりかえし</span>
            <b class="z-num tk-n">{reps.length}</b>
            <span class="z-line" />
            <span class="tk-shr">斬るのは 今日の欄で</span>
          </div>
          <div role="list">
            {reps.map((t) => (
              <div role="listitem" key={t.id}>
                <RepeatRow t={t} nb={nb} date={date} />
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section class="tk-sec tk-past" aria-label="済み">
          <button type="button" class={`tk-more${past ? ' on' : ''}`} aria-expanded={past} onClick={() => {
              sfx('flip');
              setPast(!past);
            }}>
            <span>済み</span>
            <b class="z-num">{done.length}</b>
            <span class="tk-morel">この{PAST_DAYS}日</span>
            <span class="z-line" />
            <span class="tk-moret">{past ? 'しまう' : '見る'}</span>
          </button>
          {past && (
            <ol class="tk-done">
              {done.map((t) => (
                <li key={t.id}>
                  <button type="button" class="tk-dn" onClick={() => open(t)}>
                    <span class="tk-dd z-num">{mdSlash(doneDay(t))}</span>
                    <span class="tk-dt">{t.title}</span>
                    {nb === 'p' && <b class="tk-dx z-min z-num">+{DIFF[t.diff].xp}</b>}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {nb === 'w' && <p class="tk-foot">仕事の手帳は、個人の手帳と 混ざりません。個人の側に残るのは 済んだ件数だけです。</p>}
    </div>
  );
}
