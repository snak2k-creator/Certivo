// 成長: the numbers behind the growth page. Everything comes from the personal notebook; the work notebook is
// never read here. Pure functions over the state, so they can be tested.
import type { Pack, Personal, Skill, StudyProgress, Topic, ZukanEntry } from './types';
import { ACHIEVEMENTS, levelFromTotal, need, nextUnlock, SKILLS, skillLevel, title } from './game';
import { domainRates, forecastSeries } from './study';
import { doneDay, isRepeating } from './tasks';
import { addDays, clamp, dayDiff } from './util';

/** XP still needed to reach level `to` from where the game stands. */
export function xpTo(g: Personal['game'], to: number) {
  let n = -g.xp;
  for (let l = g.lv; l < to; l++) n += need(l);
  return Math.max(0, n);
}

/** Average XP a day over the last n days, today included; days without a record count as nothing. */
export function pace(p: Personal, date: string, n = 14) {
  let s = 0;
  for (let i = 0; i < n; i++) s += p.days[addDays(date, -i)]?.xp ?? 0;
  return s / n;
}

export function rank(p: Personal, date: string) {
  const g = p.game;
  const before = levelFromTotal(g.total - (p.days[date]?.xp ?? 0)).lv;
  const next = nextUnlock(g.lv);
  const left = next ? xpTo(g, next.lv) : 0;
  const v = pace(p, date);
  return { lv: g.lv, title: title(g.lv), xp: g.xp, need: need(g.lv), upToday: before < g.lv, next, left, eta: next && v > 0 ? addDays(date, Math.ceil(left / v)) : '' };
}

/* ---------- the pass outlook ---------- */
export interface Outlook {
  /** the forecast at the end of each day, oldest first; the last one is today */
  past: { d: string; v: number }[];
  /** from today on: where the recent trend leads, with how far it may stray */
  ahead: { d: string; v: number; lo: number; hi: number }[];
  /** the first day the trend reaches the passing score; '' when already above or out of range */
  cross: string;
  /** days with answers inside the window */
  studied: number;
}

/** Least-squares slope of the values, per step. */
export function slope(vs: number[]) {
  const n = vs.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = vs.reduce((a, v) => a + v, 0) / n;
  let num = 0;
  let den = 0;
  vs.forEach((v, i) => {
    num += (i - mx) * (v - my);
    den += (i - mx) ** 2;
  });
  return den ? num / den : 0;
}

/**
 * The forecast so far (up to four weeks back) and where it is heading: the slope of the last two weeks,
 * flattening as it goes, since each point gets harder to win. The band widens by 1.6 points a day.
 */
export function outlook(pk: Pack, sp: StudyProgress, date: string, until: string): Outlook {
  const days = new Set(sp.log.map((a) => a.d).filter((d) => d <= date));
  const first = [...days].sort()[0] || date;
  const start = first > addDays(date, -27) ? first : addDays(date, -27);
  const past = forecastSeries(pk, sp.log, date, dayDiff(start, date) + 1);
  const unit = pk.scoreMax / 1000;
  const k = clamp(slope(past.slice(-14).map((x) => x.v)), -2 * unit, 6 * unit);
  const v0 = past[past.length - 1].v;
  const tau = 21;
  const horizon = Math.max(1, dayDiff(date, until));
  const ahead = Array.from({ length: horizon + 1 }, (_, i) => {
    const v = clamp(v0 + k * tau * (1 - Math.exp(-i / tau)), 0, pk.scoreMax);
    const s = 1.6 * unit * i;
    return { d: addDays(date, i), v: Math.round(v), lo: Math.round(clamp(v - s, 0, pk.scoreMax)), hi: Math.round(clamp(v + s, 0, pk.scoreMax)) };
  });
  const cross = v0 >= pk.passingScore ? '' : (ahead.find((a) => a.v >= pk.passingScore)?.d ?? '');
  return { past, ahead, cross, studied: [...days].filter((d) => d >= start).length };
}

/* ---------- chapters ---------- */
export interface Chapter {
  id: string;
  n: number;
  name: string;
  /** right-answer rate now and a week ago, in percent; null before any answer */
  p: number | null;
  prev: number | null;
  answered: number;
  weak: boolean;
  /** the topic in this chapter that trips most often lately */
  trip?: Topic;
  /** a shadow from this chapter that was cut down */
  zukan?: ZukanEntry;
}

/** The passing ratio in percent: every chapter at this rate forecasts a pass. */
export const target = (pk: Pack) => Math.round((pk.passingScore / pk.scoreMax) * 100);

export function chapters(pk: Pack, sp: StudyProgress, p: Personal, date: string): Chapter[] {
  const now = domainRates(pk, sp.log, date);
  const before = domainRates(pk, sp.log, addDays(date, -7));
  const domainOfTopic = new Map(pk.topics.map((t) => [t.id, t.domainId]));
  const byQ = new Map(pk.questions.map((q) => [q.id, q]));
  const misses: Record<string, number> = {};
  for (const a of sp.log) {
    if (a.d < addDays(date, -13) || a.d > date || (a.ok && a.conf !== 'guess')) continue;
    const t = byQ.get(a.q)?.topicId;
    if (t) misses[t] = (misses[t] || 0) + 1;
  }
  const out = pk.domains.map((d, i): Chapter => {
    const r = now[d.id];
    const b = before[d.id];
    const trip = pk.topics.filter((t) => t.domainId === d.id && misses[t.id]).sort((x, y) => misses[y.id] - misses[x.id])[0];
    return {
      id: d.id,
      n: i + 1,
      name: d.name,
      p: r.n ? Math.round(r.p * 100) : null,
      prev: b.n ? Math.round(b.p * 100) : null,
      answered: r.n,
      weak: false,
      trip,
      zukan: p.zukan.find((z) => z.boss.certId === pk.id && domainOfTopic.get(z.boss.topicId) === d.id),
    };
  });
  const tg = target(pk);
  const low = out.filter((c) => c.p !== null && c.answered >= 3 && c.p < tg).sort((a, b) => a.p! - b.p!)[0];
  if (low) low.weak = true;
  return out;
}

/* ---------- the calendar of cuts ---------- */
export interface CalDay { d: string; xp: number; cuts: number; kill: boolean; tier: 0 | 1 | 2 | 3 | 4; when: 'pre' | 'past' | 'today' | 'fut'; exam: boolean }

export const xpTier = (xp: number): CalDay['tier'] => (xp <= 0 ? 0 : xp < 60 ? 1 : xp < 120 ? 2 : xp < 200 ? 3 : 4);

/** Tasks cut on a day in the personal notebook (repeating ones count once per day). */
export function cutsOn(p: Personal, day: string) {
  return p.tasks.filter((t) => (isRepeating(t) ? !!t.doneOn?.[day] : doneDay(t) === day)).length;
}

/**
 * Whole weeks, Monday first: from the first recorded day (at most five weeks back) to the exam (at most four
 * weeks ahead), or two weeks ahead without one.
 */
export function calendar(p: Personal, date: string, first: string, exam?: string): CalDay[] {
  const from = first > addDays(date, -35) ? first : addDays(date, -35);
  const to = exam && exam >= date && dayDiff(date, exam) <= 28 ? exam : addDays(date, 13);
  const mon = (d: string) => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const a = mon(from);
  const b = addDays(mon(to), 6);
  const out: CalDay[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) {
    const rec = p.days[d];
    const xp = d <= date ? (rec?.xp ?? 0) : 0;
    out.push({ d, xp, cuts: d <= date ? cutsOn(p, d) : 0, kill: !!rec?.kills, tier: xpTier(xp), when: d < from ? 'pre' : d < date ? 'past' : d === date ? 'today' : 'fut', exam: d === exam });
  }
  return out;
}

/* ---------- the six skills ---------- */
export interface SkillRow { k: Skill; name: string; lv: number; xp: number; need: number; recent: number; from: string[] }

/** Each skill's level, and what fed it over the last two weeks: tasks cut, and for 知 the questions answered. */
export function skills(p: Personal, sp: StudyProgress | undefined, date: string): SkillRow[] {
  const since = addDays(date, -13);
  const count: Record<string, Record<string, number>> = {};
  for (const t of p.tasks) {
    const days = isRepeating(t) ? Object.keys(t.doneOn || {}) : t.doneAt ? [doneDay(t)] : [];
    const n = days.filter((d) => d >= since && d <= date).length;
    if (!n) continue;
    const m = (count[t.sk] ||= {});
    m[t.title] = (m[t.title] || 0) + n;
  }
  const answered = sp ? sp.log.filter((a) => a.d >= since && a.d <= date).length : 0;
  return SKILLS.map(({ k, name }) => {
    const l = skillLevel(p.game.skills[k] || 0);
    const m = count[k] || {};
    const tasks = Object.values(m).reduce((a, n) => a + n, 0);
    const from = Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 3);
    if (k === '知' && answered) from.unshift(`問題 ${answered}問`);
    return { k, name, lv: l.lv, xp: l.xp, need: l.need, recent: tasks + (k === '知' ? answered : 0), from };
  });
}

/** A 15-minute start for a skill that has gone quiet. Offered, never added without a tap. */
export const SKILL_IDEA: Record<Skill, string> = {
  知: 'Learn を 1節 読む',
  技: '気になっていた 設定を 1つ 試す',
  話: '返事を 待たせている人に 1通',
  創: 'ノートに スケッチを 1枚',
  健: '散歩 15分',
  生: '机の上を 片付ける',
};

/* ---------- achievements ---------- */
export const ACH_KANJI: Record<string, string> = { first: '初', three7: '三', streak7: '七', streak30: '続', kill1: '討', kill4: '四', q100: '百', crit: '会' };

/** How far along an achievement not yet earned is, in words. */
export function achProgress(p: Personal, id: string) {
  const best = Math.max(0, ...Object.values(p.study).map((s) => s.bestStreak));
  const answered = Object.values(p.study).reduce((a, s) => a + Math.max(s.log.length, Object.values(s.history).reduce((x, h) => x + h.a, 0)), 0);
  const crits = Math.max(0, ...p.zukan.map((z) => z.boss.crits), p.boss.cur?.crits ?? 0);
  switch (id) {
    case 'first':
      return 'やることを 一つ 斬る';
    case 'three7':
      return `いま ${Object.values(p.days).filter((d) => d.three).length} / 7日`;
    case 'streak7':
      return `いちばん長く つづいたのは ${best}日`;
    case 'streak30':
      return `いちばん長く つづいたのは ${best}日`;
    case 'kill1':
      return '今週の影を 倒す';
    case 'kill4':
      return `いま ${p.zukan.length} / 4体`;
    case 'q100':
      return `いま ${Math.min(100, answered)} / 100問`;
    case 'crit':
      return `一戦の 会心は いままでで ${crits}回`;
    default:
      return '';
  }
}

export function achievements(p: Personal, date: string) {
  return ACHIEVEMENTS.map((a) => {
    const at = p.game.ach[a.id] || '';
    return { ...a, kj: ACH_KANJI[a.id] || '？', at, fresh: !!at && dayDiff(at, date) <= 1, progress: at ? '' : achProgress(p, a.id) };
  });
}
