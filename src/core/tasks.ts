// Tasks: what shows today, what "done" means for repeating tasks, and reading a typed line into a task.
import type { Diff, Notebook, Skill, Task } from './types';
import { addDays, dayDiff, dow, mdSlash, uid } from './util';
import { guessSkill } from './game';

export const isRepeating = (t: Task) => !!t.repeat && t.repeat.length > 0;

export function doneOn(t: Task, day: string) {
  if (isRepeating(t)) return !!t.doneOn?.[day];
  return !!t.doneAt && t.date <= day;
}

/** Tasks that belong on a given day: planned for it, carried over unfinished, or repeating on that weekday. */
export function tasksFor(tasks: Task[], day: string, today: string) {
  return tasks
    .filter((t) => {
      if (isRepeating(t)) return t.date <= day && t.repeat!.includes(dow(day)) && !t.skip?.[day];
      if (t.doneAt) return doneDay(t) === day;
      if (day === today) return t.date <= today;
      return t.date === day;
    })
    .sort(byTime);
}

export const doneDay = (t: Task) => (t.doneAt ? localDay(t.doneAt) : '');
const localDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function byTime(a: Task, b: Task) {
  const ta = a.time || '99:99';
  const tb = b.time || '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.createdAt - b.createdAt;
}

/** Upcoming items after today, for the 近日 list. */
export function upcoming(tasks: Task[], today: string, days = 7) {
  const out: { d: string; t: Task }[] = [];
  for (let i = 1; i <= days; i++) {
    const d = addDays(today, i);
    for (const t of tasks) {
      if (isRepeating(t)) continue;
      if (!t.doneAt && t.date === d) out.push({ d, t });
    }
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : byTime(a.t, b.t)));
}

export const isNear = (t: Task, today: string) => !!t.due && !t.doneAt && dayDiff(today, t.due) <= 7 && dayDiff(today, t.due) >= 0;

const REPEAT_NAMES: Record<string, string> = { '0,1,2,3,4,5,6': '毎日', '1,2,3,4,5': '平日', '0,6': '週末' };
export function repeatLabel(r?: number[]) {
  if (!r || !r.length) return '';
  const key = r.slice().sort().join(',');
  if (REPEAT_NAMES[key]) return REPEAT_NAMES[key];
  return '毎週 ' + r.slice().sort().map((d) => '日月火水木金土'[d]).join('・');
}

/** One line of meta under a task title. */
export function metaLine(t: Task, today: string, nb: Notebook) {
  const parts: string[] = [];
  const done = doneOn(t, today);
  if (done && t.doneAt && !isRepeating(t)) parts.push(timeOf(t.doneAt) + ' に済み');
  else if (done && isRepeating(t)) parts.push(timeOf(t.doneOn![today]) + ' に済み');
  else if (t.time) parts.push(t.time);
  if (!isRepeating(t) && !t.doneAt && t.date < today) parts.push(dayDiff(t.date, today) === 1 ? 'きのうから' : `${mdSlash(t.date)} から`);
  if (t.due) parts.push(mdSlash(t.due) + 'まで');
  if (t.mins) parts.push(t.mins + '分');
  if (isRepeating(t)) parts.push(repeatLabel(t.repeat));
  if (nb === 'p' && t.study) parts.push('学習');
  if (t.from === 'ai') parts.push('AI の案');
  return parts.join(' · ');
}
const timeOf = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Reads a typed line: 「あした 19:00 歯医者」「10/31まで 住民税」「毎日 ストレッチ」「30分 ジム」.
 * Returns the title and whatever was found; nothing is guessed silently except the skill.
 */
export function parseLine(text: string, today: string) {
  let s = ' ' + text.replace(/　/g, ' ') + ' ';
  let date = today;
  let time: string | undefined;
  let due: string | undefined;
  let mins: number | undefined;
  let repeat: number[] | undefined;
  let diff: Diff | undefined;
  const take = (re: RegExp, f: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      f(m);
      s = s.replace(m[0], ' ');
    }
  };
  take(/\s(あした|明日)\s/, () => (date = addDays(today, 1)));
  take(/\s(あさって|明後日)\s/, () => (date = addDays(today, 2)));
  take(/\s(きょう|今日)\s/, () => (date = today));
  take(/\s(毎日)\s/, () => (repeat = [0, 1, 2, 3, 4, 5, 6]));
  take(/\s(平日)\s/, () => (repeat = [1, 2, 3, 4, 5]));
  take(/\s毎週([日月火水木金土・]+)\s/, (m) => (repeat = [...m[1].replace(/・/g, '')].map((c) => '日月火水木金土'.indexOf(c)).filter((n) => n >= 0)));
  take(/\s(\d{1,2})\/(\d{1,2})\s*まで\s/, (m) => (due = resolveMD(+m[1], +m[2], today)));
  take(/\s(\d{1,2})\/(\d{1,2})\s/, (m) => (date = resolveMD(+m[1], +m[2], today)));
  take(/\s(\d{1,2})[:：](\d{2})\s/, (m) => (time = `${m[1].padStart(2, '0')}:${m[2]}`));
  take(/\s(\d{1,3})\s*分\s/, (m) => (mins = +m[1]));
  take(/\s(むずかしい|難)\s/, () => (diff = 'h'));
  take(/\s(かんたん|やさしい|易)\s/, () => (diff = 'e'));
  const title = s.replace(/\s+/g, ' ').trim();
  return { title, date, time, due, mins, repeat, diff };
}

function resolveMD(m: number, d: number, today: string) {
  const y = Number(today.slice(0, 4));
  const pad2 = (n: number) => String(n).padStart(2, '0');
  let s = `${y}-${pad2(m)}-${pad2(d)}`;
  if (s < addDays(today, -60)) s = `${y + 1}-${pad2(m)}-${pad2(d)}`;
  return s;
}

export function newTask(text: string, today: string, nb: Notebook, extra: Partial<Task> = {}): Task | null {
  const r = parseLine(text, today);
  if (!r.title) return null;
  const sk: Skill = guessSkill(r.title);
  return {
    id: uid('t'),
    title: r.title,
    date: r.date,
    time: r.time,
    due: r.due,
    mins: r.mins,
    repeat: r.repeat,
    diff: r.diff ?? (r.mins && r.mins >= 45 ? 'n' : 'e'),
    sk: nb === 'w' ? '技' : sk,
    createdAt: Date.now(),
    from: 'user',
    ...extra,
  };
}
