// Read-only helpers the screens share: lists for a day, the exam countdown, the week number.
import type { Notebook, Task } from '../core/types';
import { state } from '../core/store';
import { doneOn, tasksFor } from '../core/tasks';
import { shownStreak } from '../core/study';
import { addDays, dayDiff, dow } from '../core/util';

export const examEntry = () => state.profile.packs.find((x) => x.certId === state.profile.certId);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** The first day anything was recorded in the personal notebook (today when nothing was). */
export function firstDay(today: string) {
  const sp = state.p.study[state.profile.certId];
  const keys = [...Object.keys(state.p.days), ...Object.keys(sp?.history ?? {}), ...Object.keys(state.p.recaps)].filter((k) => DAY_RE.test(k));
  return keys.sort()[0] || today;
}

/** Days until the exam, or null when no date is set. */
export function examDays(date: string) {
  const e = examEntry()?.examDate;
  return e ? dayDiff(date, e) : null;
}

export function streakNow(date: string) {
  const sp = state.p.study[state.profile.certId];
  return sp ? shownStreak(sp, date) : 0;
}

/** The week the first shadow appeared; week numbers count from it. */
export function firstWeek() {
  const weeks = [state.p.boss.cur?.week, ...state.p.zukan.map((z) => z.boss.week), ...state.p.boss.lost.map((b) => b.week)].filter(Boolean) as string[];
  return weeks.sort()[0] || state.p.boss.cur?.week || '';
}

export const isWeekend = (date: string) => dow(date) === 0 || dow(date) === 6;

/** The next working day after date (Monday after a Friday or a weekend). */
export function nextWorkday(date: string) {
  let d = addDays(date, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** What shows on a notebook's day. On weekends the work notebook also shows Monday's open items. */
export function dayList(nb: Notebook, date: string): Task[] {
  const book = nb === 'p' ? state.p : state.w;
  const list = tasksFor(book.tasks, date, date);
  if (nb === 'w' && isWeekend(date)) {
    const mon = nextWorkday(date);
    const ids = new Set(list.map((t) => t.id));
    for (const t of tasksFor(book.tasks, mon, date)) if (!ids.has(t.id) && !doneOn(t, mon)) list.push(t);
  }
  return list;
}

export function doneCount(list: Task[], date: string) {
  return list.filter((t) => doneOn(t, date)).length;
}
