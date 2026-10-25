// Everything that changes the notebooks goes through here, so rules live in one place.
import type { Boss, Conf, Day, Fight, Mode, Notebook, Pack, Question, Task } from './types';
import { commit, notebook, snapshot, state } from './store';
import { DIFF, THREE_BONUS, addXp, checkAchievements, unlocked } from './game';
import { doneOn, isRepeating, newTask, tasksFor } from './tasks';
import { pickDrill, progress, recordAnswer, stumbles, weakestTopic } from './study';
import { KAKERA_DAMAGE, makeBoss, strongBoss, studyTaskDamage, topicShort } from './enemy';
import { addDays, dayDiff, monthKey, uid, weekStart, ymd } from './util';
import { RECAP_HOUR, summarize, writeRecap } from './recap';

export const today = () => ymd();

export function dayOf(date: string): Day {
  return (state.p.days[date] ||= { xp: 0, slashes: 0, kills: 0 });
}

export interface Outcome {
  on: boolean;
  xp: number;
  lvFrom: number;
  lvTo: number;
  three: boolean;
  dmg: number;
  hp: number;
  killReady: boolean;
  ach: string[];
}

function gainXp(amount: number, sk: Task['sk'] | null, date: string) {
  const g = state.p.game;
  addXp(g, amount);
  if (sk) g.skills[sk] = Math.max(0, (g.skills[sk] || 0) + amount);
  const d = dayOf(date);
  d.xp = Math.max(0, d.xp + amount);
}

function personalDoneCount(date: string) {
  return tasksFor(state.p.tasks, date, date).filter((t) => doneOn(t, date)).length;
}

export const bossAlive = (b?: Boss) => !!b && b.hp > 0;

/** Damage to this week's shadow. Returns the hp left. */
export function damageBoss(amount: number, date: string) {
  const b = state.p.boss.cur;
  if (!b || b.hp <= 0) return b?.hp ?? 0;
  const real = Math.min(b.hp, Math.max(0, Math.round(amount)));
  b.hp -= real;
  const d = dayOf(date);
  d.dmg = (d.dmg || 0) + real;
  return b.hp;
}

/** Check or uncheck a task. Work tasks give no XP and no effects; only a count lands in the personal day. */
export function toggleTask(nb: Notebook, id: string, date = today()): Outcome | null {
  const book = notebook(nb);
  const t = book.tasks.find((x) => x.id === id);
  if (!t) return null;
  const on = !doneOn(t, date);
  const lvFrom = state.p.game.lv;
  const out: Outcome = { on, xp: 0, lvFrom, lvTo: lvFrom, three: false, dmg: 0, hp: state.p.boss.cur?.hp ?? 0, killReady: false, ach: [] };
  snapshot(on ? '斬った' : '元に戻した', nb === 'p' ? 'p' : 'w', 'p');
  if (isRepeating(t)) {
    t.doneOn ||= {};
    if (on) t.doneOn[date] = Date.now();
    else delete t.doneOn[date];
  } else {
    // finished ahead of its day: it now belongs to the day it was done, where it counts
    if (on && t.date > date) t.date = date;
    t.doneAt = on ? Date.now() : undefined;
  }

  if (nb === 'w') {
    const d = dayOf(date);
    d.work = Math.max(0, (d.work || 0) + (on ? 1 : -1));
    commit('w', 'p');
    return out;
  }

  const v = DIFF[t.diff].xp;
  const d = dayOf(date);
  if (on) {
    gainXp(v, t.sk, date);
    out.xp = v;
    d.slashes++;
    if (t.study && bossAlive(state.p.boss.cur)) {
      const hp0 = state.p.boss.cur!.hp;
      out.hp = damageBoss(studyTaskDamage(v), date);
      out.dmg = hp0 - out.hp;
      out.killReady = out.hp <= 0;
      if (!isRepeating(t)) t.hit = out.dmg;
    }
    if (!d.three && personalDoneCount(date) >= 3) {
      d.three = true;
      gainXp(THREE_BONUS, null, date);
      out.three = true;
      out.xp += THREE_BONUS;
    }
    out.ach = checkAchievements(state.p, date);
  } else {
    delete t.hit;
    gainXp(-v, t.sk, date);
    out.xp = -v;
    d.slashes = Math.max(0, d.slashes - 1);
    const b = state.p.boss.cur;
    if (t.study && b && b.hp > 0) {
      const back = Math.min(studyTaskDamage(v), d.dmg || 0);
      b.hp = Math.min(b.max, b.hp + back);
      d.dmg = Math.max(0, (d.dmg || 0) - back);
    }
    if (d.three && personalDoneCount(date) < 3) {
      d.three = false;
      gainXp(-THREE_BONUS, null, date);
      out.xp -= THREE_BONUS;
    }
  }
  out.lvTo = state.p.game.lv;
  out.hp = state.p.boss.cur?.hp ?? 0;
  commit('p');
  return out;
}

export function addTask(nb: Notebook, text: string, extra: Partial<Task> = {}, date = today()) {
  const t = newTask(text, date, nb, extra);
  if (!t) return null;
  snapshot('書いた', nb);
  notebook(nb).tasks.push(t);
  commit(nb);
  return t;
}

export function updateTask(nb: Notebook, id: string, patch: Partial<Task>) {
  const t = notebook(nb).tasks.find((x) => x.id === id);
  if (!t) return;
  snapshot('直した', nb);
  Object.assign(t, patch);
  commit(nb);
}

export function deleteTask(nb: Notebook, id: string) {
  const book = notebook(nb);
  const i = book.tasks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  snapshot('消した', nb);
  const [t] = book.tasks.splice(i, 1);
  commit(nb);
  return t;
}

/** 明日へ: a one-off task moves to tomorrow; a repeating one skips today. */
export function moveTomorrow(nb: Notebook, id: string, date = today()) {
  const t = notebook(nb).tasks.find((x) => x.id === id);
  if (!t || doneOn(t, date)) return null;
  snapshot('明日へ 送った', nb);
  if (isRepeating(t)) (t.skip ||= {})[date] = true;
  else t.date = addDays(date, 1);
  commit(nb);
  return t;
}

/* ---------- daily setup ---------- */

/** Today's 朝の欠片 lives as an ordinary task, made once per day; yesterday's unfinished one goes away. */
function ensureKakera(pk: Pack, date: string) {
  const p = state.p;
  p.tasks = p.tasks.filter((t) => !(t.study?.kind === 'kakera' && !t.doneAt && t.date < date));
  if (p.tasks.some((t) => t.study?.kind === 'kakera' && t.date === date)) return false;
  if (dayOf(date).kakera) return false;
  p.tasks.push({
    id: uid('k'),
    title: '朝の欠片 5問',
    date,
    time: undefined,
    mins: 5,
    diff: 'n',
    sk: '知',
    study: { kind: 'kakera', certId: pk.id, count: 5 },
    createdAt: Date.now() - 1,
    from: 'zan',
  });
  return true;
}

function ensureBoss(pk: Pack, date: string) {
  const b = state.p.boss;
  const wk = weekStart(date);
  if (b.cur && b.cur.week === wk) return false;
  const prev = b.cur;
  const away = !!prev && prev.hp > 0;
  if (away) {
    b.lost.unshift(prev!);
    b.lost = b.lost.slice(0, 12);
  }
  // from Lv.9, a week shadow that got away last week comes back stronger (once)
  const back = away && prev!.tier === 'week' && prev!.certId === pk.id && dayDiff(prev!.week, wk) === 7 && unlocked(state.p.game.lv, 'strong');
  b.cur = back ? strongBoss(prev!, date) : makeBoss(pk, progress(state.p, pk.id), date, prev?.topicId);
  return true;
}

/** The on-device version of AI の案: three questions where you stumbled. */
function ensureSuggestion(pk: Pack, date: string) {
  const ai = state.p.ai;
  if (ai.month !== monthKey(date)) {
    ai.month = monthKey(date);
    ai.used = 0;
  }
  if (ai.sug && ai.sug.date === date) return false;
  const sp = progress(state.p, pk.id);
  const st = stumbles(pk, sp, addDays(date, -1));
  const top = Object.entries(st).sort((a, b) => b[1] - a[1])[0];
  const topic = top ? pk.topics.find((t) => t.id === top[0])! : weakestTopic(pk, sp, date);
  const short = topicShort(topic);
  const reason = top ? `きのう ${top[1]}回 迷ったところから` : sp.log.length ? `いちばん 揺れている「${short}」から` : `まだ 手つかずの「${short}」から`;
  ai.sug = { date, topicId: topic.id, title: `弱点の「${short}」を 3問`, reason, source: 'zan' };
  return true;
}

/** Called when the app opens and whenever the date changes. */
export function ensureDay(pk: Pack | undefined, date = today()) {
  if (!pk) return;
  progress(state.p, pk.id);
  const a = ensureBoss(pk, date);
  const b = ensureKakera(pk, date);
  const c = ensureSuggestion(pk, date);
  const r = ensureRecaps(pk, date);
  if (a || b || c || r) commit('p');
}

export function acceptSuggestion(date = today()) {
  const s = state.p.ai.sug;
  if (!s || s.date !== date || s.done) return null;
  snapshot('足した', 'p');
  const t: Task = {
    id: uid('t'),
    title: s.title,
    date,
    mins: 5,
    diff: 'n',
    sk: '知',
    study: { kind: 'drill', certId: state.profile.certId, topicId: s.topicId, count: 3 },
    createdAt: Date.now(),
    from: s.source === 'ai' ? 'ai' : 'zan',
  };
  state.p.tasks.push(t);
  s.done = 'added';
  commit('p');
  return t;
}

export function skipSuggestion(date = today()) {
  const s = state.p.ai.sug;
  if (!s || s.date !== date) return;
  snapshot('今日はいい', 'p');
  s.done = 'skipped';
  commit('p');
}

/* ---------- study sessions ---------- */

export interface AnswerResult { ok: boolean; xp: number; note: string; lvFrom: number; lvTo: number }

/** One answered question in any session (欠片, 3問, ボス戦). */
export function answer(pk: Pack, q: Question, pick: string[], ok: boolean, conf: Conf, ms: number, mode: Mode, combo: number, date = today()): AnswerResult {
  const sp = progress(state.p, pk.id);
  const lvFrom = state.p.game.lv;
  const r = recordAnswer(sp, q, ok, conf, ms, pick, mode, date, combo);
  gainXp(r.xp, '知', date);
  if (mode === 'kakera' && ok) damageBoss(KAKERA_DAMAGE, date);
  commit('p');
  return { ok, xp: r.xp, note: r.note, lvFrom, lvTo: state.p.game.lv };
}

/** A session finished: its task (if any) is checked because the person did it. sessionDmg is what its answers did. */
export function finishStudyTask(taskId: string | undefined, date = today(), sessionDmg = 0) {
  if (!taskId) return null;
  const t = state.p.tasks.find((x) => x.id === taskId);
  if (!t) return null;
  if (t.study?.kind === 'kakera') dayOf(date).kakera = true;
  if (doneOn(t, date)) {
    commit('p');
    return null;
  }
  const out = toggleTask('p', taskId, date);
  if (out?.on && sessionDmg > 0 && !isRepeating(t)) {
    t.hit = (t.hit || 0) + sessionDmg;
    commit('p');
  }
  return out;
}

export function bossHit(dmg: number, crit: boolean, date = today()) {
  const b = state.p.boss.cur;
  if (!b) return 0;
  b.hits++;
  if (crit) b.crits++;
  const hp = damageBoss(dmg, date);
  commit('p');
  return hp;
}

export function bossMiss() {
  const b = state.p.boss.cur;
  if (!b) return;
  b.misses++;
  commit('p');
}

export function bossBattleStarted() {
  const b = state.p.boss.cur;
  if (!b) return;
  b.battles++;
  commit('p');
}

export const DEFEAT_XP = 60;

/** The finishing blow: the shadow goes into 図鑑 with its last words. */
export function defeatBoss(answers: number, correct: number, date = today()) {
  const b = state.p.boss.cur;
  if (!b || b.hp > 0) return null;
  if (state.p.zukan.some((z) => z.boss.id === b.id)) return null;
  const lvFrom = state.p.game.lv;
  state.p.zukan.unshift({ boss: { ...b }, at: date, kimete: b.lastWords, battles: b.battles, answers, correct });
  dayOf(date).kills++;
  gainXp(DEFEAT_XP, '知', date);
  const ach = checkAchievements(state.p, date);
  commit('p');
  return { lvFrom, lvTo: state.p.game.lv, ach, count: state.p.zukan.length };
}

/** Puts a few questions of a topic at the front of the next 朝の欠片 (they become due now). */
export function mixIntoKakera(pk: Pack, topicId: string, date = today(), n = 3) {
  const sp = progress(state.p, pk.id);
  const qs = pickDrill(pk, sp, date, { topicId }, n);
  for (const q of qs) {
    const c = sp.cards[q.id];
    if (c) c.due = date;
    else sp.cards[q.id] = { box: 0, due: date, seen: 0, correct: 0, lastAt: '', lastConf: '' };
  }
  commit('p');
  return qs.length;
}

/** A battle ended (finished or left): kept on the day for 1日の記録. */
export function logFight(f: Omit<Fight, 'at'>, date = today()) {
  if (!f.n && !f.dmg) return;
  (dayOf(date).fights ||= []).push({ at: Date.now(), ...f });
  commit('p');
}

/* ---------- 1日の記録 ---------- */

/** After 22:00 today's page is written; a missed page for yesterday is written the next morning. */
export function ensureRecaps(pk: Pack | undefined, date = today(), now = new Date()) {
  let changed = false;
  const want = [addDays(date, -1)];
  if (now.getHours() >= RECAP_HOUR) want.push(date);
  for (const d of want) {
    if (state.p.recaps[d]) continue;
    const s = summarize(state.p, pk, state.profile.certId, d, date);
    const active = s.answered || s.slashes || s.workDone || s.boss;
    if (!active && d !== date) continue;
    state.p.recaps[d] = { date: d, text: writeRecap(s), source: 'zan', at: Date.now() };
    changed = true;
  }
  return changed;
}

export function setRecapText(date: string, text: string, source: 'ai' | 'zan') {
  const r = state.p.recaps[date];
  if (!r || r.deleted) return;
  r.text = text;
  r.source = source;
  r.at = Date.now();
  commit('p');
}

export function markRecapSeen(date: string) {
  const r = state.p.recaps[date];
  if (!r || r.seen) return;
  r.seen = true;
  commit('p');
}

export const RECAP_DELETED = 'まとめを消した';

/** Erases the day's summary text (records and numbers stay). One undo brings it back right after. */
export function deleteRecap(date: string) {
  const r = state.p.recaps[date];
  if (!r || r.deleted) return;
  snapshot(RECAP_DELETED, 'p');
  r.deleted = true;
  r.text = '';
  commit('p');
}

export function setDayNote(date: string, note: string, label = '書き足した') {
  snapshot(label, 'p');
  dayOf(date).note = note.trim() || undefined;
  commit('p');
}

/* ---------- settings ---------- */
export function setProfile(patch: Partial<typeof state.profile>) {
  Object.assign(state.profile, patch);
  commit('profile');
}

export function setExamDate(certId: string, examDate: string) {
  const e = state.profile.packs.find((x) => x.certId === certId);
  if (!e) return;
  e.examDate = examDate;
  e.status = examDate ? 'booked' : 'studying';
  commit('profile');
}

export function countAiUse(date = today()) {
  const ai = state.p.ai;
  if (ai.month !== monthKey(date)) {
    ai.month = monthKey(date);
    ai.used = 0;
  }
  ai.used++;
  commit('p');
}
/** This month's AI uses: the server's cap, or the person's own lower limit. */
export const aiCapNow = () => (state.profile.aiLimit > 0 ? Math.min(state.profile.aiLimit, state.profile.aiCap) : state.profile.aiCap);
export const aiUsed = () => (state.p.ai.month === monthKey() ? state.p.ai.used : 0);
export const aiLeft = () => Math.max(0, aiCapNow() - aiUsed());

export function logWorkSend(what: string) {
  state.w.sent.unshift({ at: Date.now(), what });
  state.w.sent = state.w.sent.slice(0, 50);
  commit('w');
}
