// Writing and fixing tasks. Used by the phone sheets and by the PC drawer.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Diff, Notebook, Skill, Task } from '../core/types';
import { notebook } from '../core/store';
import { addTask, deleteTask, moveTomorrow, today, updateTask } from '../core/actions';
import { DIFF, SKILLS, guessSkill, skillName } from '../core/game';
import { doneOn, isRepeating, parseLine, repeatLabel } from '../core/tasks';
import { packOf, topicById } from '../core/pack';
import { topicShort } from '../core/enemy';
import { isLearnTask, lessonShort } from '../core/learn';
import { sfx } from '../core/sfx';
import { DOW, mdSlash } from '../core/util';
import { added, toast } from './fx';
import { closeSheet } from './sheets';
import { go } from './router';
import { studyPath } from './slash';

const DIFFS: Diff[] = ['e', 'n', 'h'];
const DIFF_LABEL: Record<Diff, string> = { e: 'かるい', n: 'ふつう', h: '重い' };
const MINS = [0, 5, 15, 30, 60, 90];
export const WORK_TAGS = ['書く', '連絡', '会議', '確認', '準備'];

/** What the typed line was read as, so nothing is guessed silently. */
export function Understood({ text, date, nb }: { text: string; date: string; nb: Notebook }) {
  if (!text.trim()) return <p class="tf-hint">「あした 19:00」「10/31まで」「毎日」「30分」も、そのまま書けます</p>;
  const r = parseLine(text, date);
  const bits: string[] = [];
  if (r.repeat) bits.push(repeatLabel(r.repeat));
  else if (r.date !== date) bits.push(mdSlash(r.date));
  if (r.time) bits.push(r.time);
  if (r.due) bits.push(mdSlash(r.due) + 'まで');
  if (r.mins) bits.push(r.mins + '分');
  if (r.diff) bits.push(DIFF_LABEL[r.diff]);
  return (
    <div class="tf-got" aria-live="polite">
      <span class="tf-gotl">読みとり</span>
      <b>{r.title || '（題名がまだ）'}</b>
      {bits.map((b) => (
        <span key={b} class="z-tag z-tag-k">
          {b}
        </span>
      ))}
      {nb === 'p' && r.title && <span class="tf-sk">分野：{skillName(guessSkill(r.title))}</span>}
    </div>
  );
}

function DiffChips({ value, onPick, auto }: { value: Diff | null; onPick: (d: Diff | null) => void; auto?: Diff }) {
  return (
    <div class="z-chips" role="radiogroup" aria-label="重さ">
      {DIFFS.map((d) => {
        const on = value === d || (!value && auto === d);
        return (
          <button key={d} type="button" role="radio" aria-checked={on} class={`z-chip${on ? ' on' : ''}${!value && auto === d ? ' auto' : ''}`} onClick={() => onPick(value === d ? null : d)}>
            {DIFF_LABEL[d]}
            <span class="tf-xp">+{DIFF[d].xp}</span>
          </button>
        );
      })}
    </div>
  );
}

function SkillChips({ value, onPick, auto }: { value: Skill | null; onPick: (s: Skill | null) => void; auto?: Skill }) {
  return (
    <div class="z-chips" role="radiogroup" aria-label="分野">
      {SKILLS.map((s) => {
        const on = value === s.k || (!value && auto === s.k);
        return (
          <button key={s.k} type="button" role="radio" aria-checked={on} aria-label={s.name} title={s.name} class={`z-chip k${on ? ' on' : ''}${s.k === '知' ? ' r' : ''}${!value && auto === s.k ? ' auto' : ''}`} onClick={() => onPick(value === s.k ? null : s.k)}>
            {s.k}
          </button>
        );
      })}
    </div>
  );
}

function TagChips({ value, onPick }: { value: string; onPick: (t: string) => void }) {
  return (
    <div class="z-chips" role="radiogroup" aria-label="ラベル">
      {WORK_TAGS.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} class={`z-chip${value === t ? ' on' : ''}`} onClick={() => onPick(value === t ? '' : t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** The quick form: one line, read as you type. */
export function AddForm({ nb, date = today(), onDone, autoFocus = true }: { nb: Notebook; date?: string; onDone?: (t: Task | null) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const [diff, setDiff] = useState<Diff | null>(null);
  const [sk, setSk] = useState<Skill | null>(null);
  const [tag, setTag] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) setTimeout(() => input.current?.focus(), 60);
  }, []);
  const r = text.trim() ? parseLine(text, date) : null;
  const autoDiff: Diff = r?.diff ?? (r?.mins && r.mins >= 45 ? 'n' : 'e');

  const submit = (e?: Event) => {
    e?.preventDefault();
    if (!r?.title) return;
    const extra: Partial<Task> = {};
    if (diff) extra.diff = diff;
    if (nb === 'p' && sk) extra.sk = sk;
    if (nb === 'w' && tag) extra.tag = tag;
    const t = addTask(nb, text, extra, date);
    if (!t) return;
    sfx('write');
    added(t.id);
    setText('');
    setDiff(null);
    setSk(null);
    setTag('');
    const where = t.repeat?.length ? repeatLabel(t.repeat) : t.date === today() ? '' : `${mdSlash(t.date)}に`;
    toast(where ? `${where} 書きました · ${t.title}` : `書きました · ${t.title}`, { undo: true });
    onDone?.(t);
  };

  return (
    <form class="tf" onSubmit={submit}>
      <label class="z-fld">
        <span class="z-fl">{nb === 'p' ? 'やることを書く' : '仕事のやることを書く'}</span>
        <input ref={input} class="z-inp" value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder={nb === 'p' ? '例：あした 19:00 歯医者' : '例：10/31まで 見積もりを送る'} enterKeyHint="done" autoComplete="off" maxLength={120} />
      </label>
      <Understood text={text} date={date} nb={nb} />
      {nb === 'p' ? (
        <>
          <div class="z-fld">
            <span class="z-fl">重さ</span>
            <DiffChips value={diff} onPick={setDiff} auto={r ? autoDiff : undefined} />
          </div>
          <div class="z-fld">
            <span class="z-fl">分野</span>
            <SkillChips value={sk} onPick={setSk} auto={r ? guessSkill(r.title) : undefined} />
          </div>
        </>
      ) : (
        <div class="z-fld">
          <span class="z-fl">ラベル</span>
          <TagChips value={tag} onPick={setTag} />
        </div>
      )}
      <div class="tf-foot">
        <button type="submit" class="z-bw" disabled={!r?.title}>
          書く
        </button>
        <button type="button" class="z-txb tf-cancel" onClick={() => onDone?.(null)}>
          とじる
        </button>
      </div>
    </form>
  );
}

/** The full form for one task. */
export function EditForm({ nb, t, onDone }: { nb: Notebook; t: Task; onDone: () => void }) {
  const [title, setTitle] = useState(t.title);
  const [date, setDate] = useState(t.date);
  const [time, setTime] = useState(t.time || '');
  const [due, setDue] = useState(t.due || '');
  const [mins, setMins] = useState(t.mins || 0);
  const [repeat, setRepeat] = useState<number[]>(t.repeat || []);
  const [diff, setDiff] = useState<Diff>(t.diff);
  const [sk, setSk] = useState<Skill>(t.sk);
  const [tag, setTag] = useState(t.tag || '');
  const [note, setNote] = useState(t.note || '');
  const toggleDay = (d: number) => setRepeat((r) => (r.includes(d) ? r.filter((x) => x !== d) : [...r, d].sort()));

  const save = (e?: Event) => {
    e?.preventDefault();
    if (!title.trim()) return;
    updateTask(nb, t.id, {
      title: title.trim(),
      date: date || t.date,
      time: time || undefined,
      due: due || undefined,
      mins: mins || undefined,
      repeat: repeat.length ? repeat : undefined,
      diff,
      sk: nb === 'p' ? sk : t.sk,
      tag: nb === 'w' ? tag || undefined : t.tag,
      note: note.trim() || undefined,
    });
    sfx('write');
    toast(`直しました · ${title.trim()}`, { undo: true });
    onDone();
  };

  return (
    <form class="tf" onSubmit={save}>
      <label class="z-fld">
        <span class="z-fl">題名</span>
        <input class="z-inp" value={title} onInput={(e) => setTitle(e.currentTarget.value)} maxLength={120} />
      </label>
      <div class="tf-row">
        <label class="z-fld">
          <span class="z-fl">日付</span>
          <input type="date" class="z-time" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
        <label class="z-fld">
          <span class="z-fl">時刻</span>
          <input type="time" class="z-time" value={time} onInput={(e) => setTime(e.currentTarget.value)} />
        </label>
        <label class="z-fld">
          <span class="z-fl">期限</span>
          <input type="date" class="z-time" value={due} onInput={(e) => setDue(e.currentTarget.value)} />
        </label>
      </div>
      <div class="z-fld">
        <span class="z-fl">かかる時間</span>
        <div class="z-chips">
          {MINS.map((m) => (
            <button key={m} type="button" class={`z-chip${mins === m ? ' on' : ''}`} aria-pressed={mins === m} onClick={() => setMins(m)}>
              {m ? `${m}分` : 'なし'}
            </button>
          ))}
        </div>
      </div>
      <div class="z-fld">
        <span class="z-fl">くり返し{repeat.length ? ` · ${repeatLabel(repeat)}` : ''}</span>
        <div class="z-chips">
          {DOW.map((d, n) => (
            <button key={d} type="button" class={`z-chip k${repeat.includes(n) ? ' on' : ''}`} aria-pressed={repeat.includes(n)} aria-label={`${d}曜`} onClick={() => toggleDay(n)}>
              {d}
            </button>
          ))}
          <button type="button" class="z-chip" onClick={() => setRepeat(repeat.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6])}>
            毎日
          </button>
          <button type="button" class="z-chip" onClick={() => setRepeat([1, 2, 3, 4, 5])}>
            平日
          </button>
        </div>
      </div>
      {nb === 'p' ? (
        <>
          <div class="z-fld">
            <span class="z-fl">重さ</span>
            <DiffChips value={diff} onPick={(d) => d && setDiff(d)} />
          </div>
          <div class="z-fld">
            <span class="z-fl">分野 · {skillName(sk)}</span>
            <SkillChips value={sk} onPick={(s) => s && setSk(s)} />
          </div>
        </>
      ) : (
        <div class="z-fld">
          <span class="z-fl">ラベル</span>
          <TagChips value={tag} onPick={setTag} />
        </div>
      )}
      <label class="z-fld">
        <span class="z-fl">メモ{nb === 'w' ? '（AI には 送りません）' : ''}</span>
        <textarea class="z-ta" value={note} onInput={(e) => setNote(e.currentTarget.value)} maxLength={2000} rows={3} />
      </label>
      <div class="tf-foot">
        <button type="submit" class="z-bw" disabled={!title.trim()}>
          保存
        </button>
        <button type="button" class="z-txb tf-cancel" onClick={onDone}>
          やめる
        </button>
      </div>
    </form>
  );
}

/** One task: what it is, then 直す / 明日へ / 消す. */
export function TaskDetail({ nb, id, edit = false, onClose }: { nb: Notebook; id: string; edit?: boolean; onClose: () => void }) {
  const [editing, setEditing] = useState(edit);
  const t = notebook(nb).tasks.find((x) => x.id === id);
  if (!t) return <p class="tf-hint">このやることは、もうありません。</p>;
  if (editing) return <EditForm nb={nb} t={t} onDone={() => setEditing(false)} />;
  const date = today();
  const done = doneOn(t, date);
  const pk = packOf(t.study?.certId);
  const topic = t.study?.topicId && pk ? topicById(pk, t.study.topicId) : undefined;
  const st = t.study;
  const studyLabel = !st
    ? ''
    : st.kind === 'kakera'
      ? `朝の欠片 · ${st.count ?? 5}問`
      : st.kind === 'drill'
        ? `${topic ? `「${topicShort(topic)}」` : ''}${st.count ?? 3}問`
        : st.kind === 'learn'
          ? `単元「${pk && st.lesson ? lessonShort(pk, st.lesson) : '…'}」を 読む`
          : st.kind === 'words'
            ? `ことば ${st.count ?? 0}語を 思い出す`
            : '読む';
  const rows: [string, string][] = [];
  rows.push(['日付', isRepeating(t) ? `${repeatLabel(t.repeat)}（${mdSlash(t.date)}から）` : mdSlash(t.date)]);
  if (t.time) rows.push(['時刻', t.time]);
  if (t.due) rows.push(['期限', mdSlash(t.due) + 'まで']);
  if (t.mins) rows.push(['時間', t.mins + '分']);
  if (nb === 'p') rows.push(['重さ', `${DIFF_LABEL[t.diff]} · +${DIFF[t.diff].xp}`], ['分野', skillName(t.sk)]);
  if (nb === 'w' && t.tag) rows.push(['ラベル', t.tag]);
  if (t.from === 'ai') rows.push(['出どころ', 'AI の案（あなたが 入れた）']);

  const del = () => {
    const gone = deleteTask(nb, t.id);
    if (!gone) return;
    sfx('soft');
    toast(`消しました · ${gone.title}`, { undo: true });
    onClose();
  };
  const tomorrow = () => {
    if (!moveTomorrow(nb, t.id, date)) return;
    sfx('flip');
    toast(isRepeating(t) ? `今日は とばしました · ${t.title}` : `明日へ 送りました · ${t.title}`, { undo: true });
    onClose();
  };

  return (
    <div class="tf-det">
      <b class="tf-title">{t.title}</b>
      {t.study && (
        <div class="tf-study">
          <span class="z-tag z-tag-r">{isLearnTask(t) ? '覚える' : '学習'}</span>
          <span>{studyLabel}</span>
          {!done && t.study.kind !== 'read' && (
            <button
              type="button"
              class="z-bk"
              onClick={() => {
                onClose();
                go(studyPath(t));
              }}
            >
              はじめる
            </button>
          )}
        </div>
      )}
      <dl class="tf-dl">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {t.note && <p class="tf-note">{t.note}</p>}
      <div class="tf-acts">
        <button type="button" class="z-bk" onClick={() => setEditing(true)}>
          直す
        </button>
        {!done && (
          <button type="button" class="z-bo2" onClick={tomorrow}>
            {isRepeating(t) ? '今日はとばす' : '明日へ'}
          </button>
        )}
        <button type="button" class="z-bo2 tf-del" onClick={del}>
          消す
        </button>
      </div>
    </div>
  );
}

export function closeAnd(f?: () => void) {
  closeSheet();
  f?.();
}
