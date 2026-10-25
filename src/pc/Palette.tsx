// ⌘K: one box to find a task, open a page or write a new line. Typing finds tasks first; Enter on nothing
// found writes the line as a task. Arrow keys pick, Enter runs, Esc closes.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Task } from '../core/types';
import { notebook, state } from '../core/store';
import { addTask } from '../core/actions';
import { doneOn, tasksFor } from '../core/tasks';
import { exportCsv, exportDaysCsv } from '../core/data';
import { activePack } from '../core/pack';
import { forecast } from '../core/study';
import { dueWords, hasLearn, lessonShort, nextLesson } from '../core/learn';
import { RECAP_HOUR } from '../core/recap';
import { sfx } from '../core/sfx';
import { addDays, md } from '../core/util';
import { added, toast } from '../ui/fx';
import { closeSheet, openSheet } from '../ui/sheets';
import { go } from '../ui/router';
import { killedEntry, bossWhen } from '../ui/Boss';
import { useKey } from '../ui/hooks';
import { Search } from '../ui/icons';
import { focusAdd, MOD, switchBook } from './common';

interface Cmd { id: string; g: string; label: string; hint?: string; run: () => void }

const squash = (s: string) => s.replace(/[\s　]/g, '').toLowerCase();

function commands(date: string): Cmd[] {
  const nb = state.profile.mode;
  const p = state.p;
  const to = (path: string) => () => go(path);
  if (nb === 'w') {
    return [
      { id: 'add', g: '書', label: '仕事のやることを書く', hint: 'N', run: focusAdd },
      { id: 'tasks', g: '覧', label: 'やることの 一覧', run: to('tasks') },
      { id: 'plan', g: '頼', label: 'AI に 段取りを 頼む（送る前に 確かめる）', run: () => openSheet({ kind: 'plan' }) },
      { id: 'personal', g: '個', label: '個人の手帳に 切りかえる', hint: '1', run: () => switchBook('p') },
      { id: 'sync', g: '同', label: '同期の 設定', hint: state.profile.sync.w ? 'オン' : 'オフ', run: to('settings') },
      {
        id: 'export',
        g: '出',
        label: '仕事の手帳を 書き出す（CSV）',
        run: () => {
          exportCsv('w');
          toast('仕事の手帳を、CSV で 書き出しました');
        },
      },
      { id: 'settings', g: '設', label: '設定', run: to('settings') },
    ];
  }
  const b = p.boss.cur;
  const pk = activePack();
  const sp = pk ? p.study[pk.id] : undefined;
  const out: Cmd[] = [{ id: 'add', g: '書', label: 'やることを書く', hint: 'N', run: focusAdd }];
  if (pk && sp && hasLearn(pk)) {
    const nx = nextLesson(pk, sp);
    const due = dueWords(pk, sp, date).length;
    if (nx) out.push({ id: 'lesson', g: '覚', label: `次の単元を 覚える：${lessonShort(pk, nx)}`, run: to(`lesson/${nx}`) });
    if (due) out.push({ id: 'review', g: '復', label: 'ことばを 復習する', hint: `${due}語`, run: to('lesson/review') });
  }
  if (b && !killedEntry(b)) out.push({ id: 'battle', g: '挑', label: `${b.name}に 挑む`, hint: b.hp <= 0 ? 'とどめ' : bossWhen(b, date), run: to('battle') });
  out.push(
    { id: 'kakera', g: '欠', label: '朝の欠片を 解く', hint: '5問', run: to('session/kakera') },
    { id: 'learn', g: '覚', label: '覚える を ひらく', hint: pk ? pk.code : '', run: to('learn') },
    { id: 'words', g: '語', label: '用語集を ひらく', hint: pk?.terms?.length ? `${pk.terms.length}語` : '', run: to('learn/words') },
    { id: 'guide', g: '全', label: '資格の 全体像を 読む', hint: pk ? pk.code : '', run: to('learn/guide') },
    { id: 'cert', g: '資', label: '資格を 切りかえる・足す', run: () => openSheet({ kind: 'cert' }) },
    { id: 'recap', g: '記', label: '1日の記録を ひらく', hint: `${RECAP_HOUR}:00 に 書く`, run: to('recap') },
    { id: 'growth', g: '成', label: '成長を ひらく', hint: pk && sp && sp.log.length ? `Lv.${p.game.lv} · 見込み ${forecast(pk, sp.log, date)}` : `Lv.${p.game.lv}`, run: to('growth') },
    { id: 'zukan', g: '鑑', label: '図鑑を ひらく', hint: p.zukan.length ? `倒した影 ${p.zukan.length}体` : '', run: to('zukan') },
    { id: 'tasks', g: '覧', label: 'やることの 一覧', run: to('tasks') },
    { id: 'work', g: '仕', label: '仕事の手帳に 切りかえる', hint: '2', run: () => switchBook('w') },
    { id: 'nightly', g: '夜', label: '毎晩のまとめの 設定', hint: state.profile.nightly ? `${RECAP_HOUR}:00 · オン` : 'オフ', run: to('settings/nightly') },
    {
      id: 'export',
      g: '出',
      label: '成長の記録を 書き出す（CSV）',
      run: () => {
        exportDaysCsv();
        toast('一日ごとの記録を、CSV で 書き出しました');
      },
    },
    { id: 'settings', g: '設', label: '設定', run: to('settings') },
  );
  return out;
}

/** Tasks worth finding: the last two weeks and the next four, plus every repeating one. */
function findable(date: string): Task[] {
  const book = notebook(state.profile.mode);
  const from = addDays(date, -14);
  const to = addDays(date, 28);
  return book.tasks.filter((t) => t.repeat?.length || (t.date >= from && t.date <= to) || (!t.doneAt && t.date < date));
}

export function Palette({ date }: { date: string }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const nb = state.profile.mode;
  const raw = q.trim();
  const k = squash(raw);

  let items: Cmd[];
  if (!k) items = commands(date);
  else {
    const todayIds = new Set(tasksFor(notebook(nb).tasks, date, date).map((t) => t.id));
    const tasks = findable(date)
      .filter((t) => squash(t.title).includes(k))
      .slice(0, 6)
      .map(
        (t): Cmd => ({
          id: 't-' + t.id,
          g: nb === 'p' ? t.sk : '仕',
          label: t.title,
          hint: `${doneOn(t, date) ? '済み' : todayIds.has(t.id) ? '今日' : md(t.date)} · ひらく`,
          run: () => openSheet({ kind: 'task', nb, id: t.id }),
        }),
      );
    const cmds = commands(date).filter((c) => squash(c.label).includes(k));
    const pk = nb === 'p' ? activePack() : undefined;
    const words = (pk?.terms ?? [])
      .filter((t) => [t.word, t.read ?? '', ...(t.alias ?? [])].some((x) => squash(x).includes(k)))
      .slice(0, 4)
      .map((t): Cmd => ({ id: 'w-' + t.id, g: '語', label: t.word, hint: t.mean.length > 26 ? t.mean.slice(0, 25) + '…' : t.mean, run: () => openSheet({ kind: 'term', certId: pk!.id, id: t.id }) }));
    items = [
      ...tasks,
      ...words,
      ...cmds,
      {
        id: 'write',
        g: '＋',
        label: `「${raw}」を やることに書く`,
        hint: '↵',
        run: () => {
          const t = addTask(nb, raw, {}, date);
          if (!t) return;
          added(t.id);
          sfx('write');
          toast(t.date === date ? `今日に 書きました · ${t.title}` : `${md(t.date)}に 書きました · ${t.title}`, { undo: true });
        },
      },
    ];
  }
  const at = Math.min(i, items.length - 1);

  useEffect(() => {
    const t = setTimeout(() => inp.current?.focus(), 10);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    closeSheet();
    if (!c.id.startsWith('t-') && !c.id.startsWith('w-')) sfx('tock');
    c.run();
  };
  useKey(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSheet();
      }
    },
    true,
    true,
  );

  return (
    <>
      <div class="pc-scrim" onClick={() => closeSheet()} />
      <div class="pc-pal z-light" role="dialog" aria-modal="true" aria-label="探す・書く・ひらく">
        <div class="pc-pin">
          <Search size={18} />
          <input
            ref={inp}
            value={q}
            placeholder={nb === 'p' ? '探す・書く・ひらく' : '仕事の手帳を 探す・書く'}
            aria-label="探す・書く・ひらく"
            aria-controls="pc-pl"
            aria-activedescendant={items[at] ? `pc-pi-${items[at].id}` : undefined}
            autoComplete="off"
            onInput={(e) => {
              setQ((e.currentTarget as HTMLInputElement).value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setI((at + 1) % items.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setI((at - 1 + items.length) % items.length);
              } else if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault();
                run(items[at]);
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div class="pc-pl" id="pc-pl" role="listbox" ref={list}>
          {items.map((c, n) => (
            <button
              type="button"
              key={c.id}
              id={`pc-pi-${c.id}`}
              role="option"
              aria-selected={n === at}
              class={`pc-pi${n === at ? ' on' : ''}`}
              onPointerMove={() => n !== at && setI(n)}
              onClick={() => run(c)}
            >
              <span class="pc-pg z-min">{c.g}</span>
              <span class="pc-pt">{c.label}</span>
              {c.hint && <em>{c.hint}</em>}
            </button>
          ))}
        </div>
        <div class="pc-pf">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>えらぶ
          </span>
          <span>
            <kbd>↵</kbd>決める
          </span>
          <span>
            <kbd>esc</kbd>閉じる
          </span>
          <span class="pc-pfr">
            <kbd>{MOD}K</kbd> いつでも
          </span>
        </div>
      </div>
    </>
  );
}
