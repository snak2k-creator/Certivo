// 1日の記録: the nightly page. Written on the device; when the person agreed, the AI rewrites it from a short summary.
import type { Answer, Boss, Pack, Personal, StudyProgress } from './types';
import { doneDay, doneOn, isRepeating, tasksFor } from './tasks';
import { stumbles, shownStreak } from './study';
import { topicShort } from './enemy';
import { DIFF } from './game';
import { addDays, hm, sumBy, weekStart } from './util';

export const RECAP_HOUR = 22;

export interface DaySummary {
  date: string;
  answered: number;
  correct: number;
  kakera: boolean;
  slashes: number;
  xp: number;
  three: boolean;
  workDone: number;
  done: string[];
  boss?: { name: string; dmg: number; hp: number; killed: boolean };
  stumbled: { topic: string; n: number }[];
  streak: number;
}

/** The facts of one day, from the personal notebook only. Work appears as a count. */
export function summarize(p: Personal, pk: Pack | undefined, certId: string, date: string, today: string): DaySummary {
  const sp = p.study[certId];
  const h = sp?.history[date] || { a: 0, c: 0 };
  const day = p.days[date] || { xp: 0, slashes: 0, kills: 0 };
  const done = tasksFor(p.tasks, date, today).filter((t) => doneOn(t, date) && !t.study).map((t) => t.title);
  const st = sp && pk ? stumbles(pk, sp, date) : {};
  const stumbled = Object.entries(st)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id, n]) => ({ topic: pk ? topicShort(pk.topics.find((t) => t.id === id)!) : id, n }));
  const cur = p.boss.cur;
  const killedToday = p.zukan.find((z) => z.at === date);
  const boss = killedToday
    ? { name: killedToday.boss.name, dmg: day.dmg || 0, hp: 0, killed: true }
    : cur && (day.dmg || 0) > 0
      ? { name: cur.name, dmg: day.dmg || 0, hp: cur.hp, killed: false }
      : undefined;
  return {
    date,
    answered: h.a,
    correct: h.c,
    kakera: !!day.kakera,
    slashes: day.slashes || 0,
    xp: day.xp || 0,
    three: !!day.three,
    workDone: day.work || 0,
    done: done.slice(0, 6),
    boss,
    stumbled,
    streak: sp ? shownStreak(sp, date) : 0,
  };
}

/** Plain, warm sentences without nagging. Used offline, without consent, or when the AI is unavailable. */
export function writeRecap(s: DaySummary) {
  const out: string[] = [];
  if (s.answered) {
    if (s.kakera && s.correct === s.answered) out.push(`朝の欠片は ${s.answered}問とも 正解。`);
    else out.push(`${s.answered}問に 答えて、${s.correct}問 正解。`);
  }
  if (s.boss?.killed) out.push(`${s.boss.name}を、倒した。`);
  else if (s.boss) out.push(`${s.boss.name}には 一日で ${s.boss.dmg} 削って、残りは ${s.boss.hp}。`);
  if (s.stumbled.length) {
    const t = s.stumbled[0];
    out.push(`「${t.topic}」で ${t.n}回 迷ったので、あしたの朝の欠片に 入れておいた。`);
  }
  if (s.done.length) {
    const names = s.done.slice(0, 2).map((x) => `「${x}」`).join('と');
    out.push(`${names}も 済ませた。`);
  }
  if (s.workDone) out.push(`仕事は ${s.workDone}件 済み。`);
  if (s.three) out.push('今日の三つも 斬った。');
  if (s.streak >= 2 && s.answered) out.push(`学習は ${s.streak}日 つづいている。`);
  if (!out.length) out.push('今日は、休みの日。あしたの朝、欠片から はじめよう。');
  return out.join('');
}

export function recapDue(now: Date) {
  return now.getHours() >= RECAP_HOUR;
}

/* ---------- the page of one day ---------- */

export interface DayRow { at: number; time: string; kind: 'study' | 'foe' | 'etc'; title: string; xp: number; dmg: number; kill?: boolean }

/** What got cut on a day, in time order: personal tasks and battles with the week's shadow. */
export function dayRows(p: Personal, date: string): DayRow[] {
  const rows: DayRow[] = [];
  for (const t of p.tasks) {
    const at = isRepeating(t) ? t.doneOn?.[date] : t.doneAt && doneDay(t) === date ? t.doneAt : undefined;
    if (!at) continue;
    const study = !!t.study || t.sk === '知';
    rows.push({ at, time: hm(new Date(at)), kind: study ? 'study' : 'etc', title: t.title, xp: DIFF[t.diff].xp, dmg: isRepeating(t) ? 0 : t.hit || 0 });
  }
  for (const f of p.days[date]?.fights || []) {
    rows.push({ at: f.at, time: hm(new Date(f.at)), kind: 'foe', title: `${f.boss}${f.kill ? 'を 討伐' : 'に 挑む'} · ${f.n}問`, xp: f.xp, dmg: f.dmg, kill: f.kill });
  }
  return rows.sort((a, b) => a.at - b.at);
}

/** Answers and study time on a day. Time per answer is capped, so a phone left open does not count. */
export function dayStudy(p: Personal, sp: StudyProgress | undefined, date: string) {
  const log: Answer[] = sp ? sp.log.filter((a) => a.d === date) : [];
  const h = sp?.history[date];
  const answered = h ? h.a : log.length;
  const correct = h ? h.c : log.filter((a) => a.ok).length;
  const askMs = sumBy(log, (a) => Math.min(a.ms, 180000));
  const askMin = askMs ? Math.max(1, Math.round(askMs / 60000)) : 0;
  const readMin = sumBy(
    p.tasks.filter((t) => t.study?.kind === 'read' && doneOn(t, date) && (isRepeating(t) || doneDay(t) === date)),
    (t) => t.mins || 0,
  );
  return { log, answered, correct, askMin, readMin };
}

/** Days studied in a row, ending on this day. */
export function streakOn(sp: StudyProgress | undefined, date: string) {
  let n = 0;
  for (let d = date; sp?.history[d]?.a; d = addDays(d, -1)) n++;
  return n;
}

/** The shadow of the week that contains this day, if there was one. */
export function bossOfWeek(p: Personal, date: string): Boss | undefined {
  const wk = weekStart(date);
  return [p.boss.cur, ...p.zukan.map((z) => z.boss), ...p.boss.lost].find((b) => b && b.week === wk);
}

/** The shadow's HP at the end of a day: its HP now, plus what was taken off after that day. */
export function hpAt(p: Personal, b: Boss, date: string) {
  let hp = b.hp;
  const end = addDays(b.week, 6);
  for (let d = addDays(date, 1); d <= end; d = addDays(d, 1)) hp += p.days[d]?.dmg || 0;
  return Math.max(0, Math.min(b.max, hp));
}

/** Questions answered wrong (or right by a guess) on a day, and whether they were answered right later. */
export function dayStumbles(sp: StudyProgress | undefined, date: string) {
  if (!sp) return { ids: [] as string[], later: [] as Answer[] };
  const ids = [...new Set(sp.log.filter((a) => a.d === date && (!a.ok || a.conf === 'guess')).map((a) => a.q))];
  const later = sp.log.filter((a) => a.d > date && ids.includes(a.q));
  return { ids, later };
}
