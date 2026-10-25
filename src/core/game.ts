// Game rules: experience, levels, titles, unlocks, the six skills and achievements.
import type { Diff, Game, Personal, Skill } from './types';

export const DIFF: Record<Diff, { xp: number; name: string; bars: number }> = {
  e: { xp: 10, name: 'やさしい', bars: 1 },
  n: { xp: 30, name: 'ふつう', bars: 2 },
  h: { xp: 60, name: 'むずかしい', bars: 3 },
};

export const THREE_BONUS = 30;

/** XP needed to go from level lv to lv + 1. */
export const need = (lv: number) => 100 + 25 * (lv - 1);

export const TITLES: [number, string][] = [
  [1, '見習い'],
  [4, '実践者'],
  [8, '探究者'],
  [12, '熟練者'],
  [16, '達人'],
];
export function title(lv: number) {
  let t = TITLES[0][1];
  for (const [from, name] of TITLES) if (lv >= from) t = name;
  return t;
}

/**
 * What each level opens. Every line here is something the app really does from that level on. Questions are never
 * behind a level: the whole bank and the mock exam are open from the first day (問題集).
 */
export const UNLOCKS: Record<number, [string, string]> = {
  3: ['斬り跡の暦', '一日ずつの 斬った数が、成長の暦に 残ります'],
  5: ['隠して 思い出す', '図鑑の決め手を 隠して、思い出す練習が できます'],
  9: ['戻ってくる強敵', '倒しそびれた影が、次の週に 強くなって 戻ります'],
};
export const UNLOCK_LV = { calendar: 3, recall: 5, strong: 9 } as const;
export const unlocked = (lv: number, what: keyof typeof UNLOCK_LV) => lv >= UNLOCK_LV[what];
export const nextUnlock = (lv: number) => {
  const keys = Object.keys(UNLOCKS).map(Number).sort((a, b) => a - b);
  const k = keys.find((x) => x > lv);
  return k ? { lv: k, name: UNLOCKS[k][0], sub: UNLOCKS[k][1] } : null;
};

/** Total lifetime XP -> level and XP inside that level. */
export function levelFromTotal(total: number) {
  let lv = 1;
  let xp = Math.max(0, Math.floor(total));
  while (xp >= need(lv)) {
    xp -= need(lv);
    lv++;
  }
  return { lv, xp };
}

/** Adds (or removes) XP; returns the levels gained (negative when an undo crosses a level). */
export function addXp(g: Game, amount: number) {
  const before = g.lv;
  g.total = Math.max(0, g.total + amount);
  const r = levelFromTotal(g.total);
  g.lv = r.lv;
  g.xp = r.xp;
  return g.lv - before;
}

export const SKILLS: { k: Skill; name: string }[] = [
  { k: '知', name: '知識' },
  { k: '技', name: '技術' },
  { k: '話', name: '対話' },
  { k: '創', name: '創作' },
  { k: '健', name: '健康' },
  { k: '生', name: '生活' },
];
export const skillName = (k: Skill) => SKILLS.find((s) => s.k === k)?.name ?? '';

/** Skill level from its XP: each level needs a little more than the last. */
export function skillLevel(xp: number) {
  let lv = 1;
  let left = xp;
  while (left >= 60 + lv * 30) {
    left -= 60 + lv * 30;
    lv++;
  }
  return { lv, xp: left, need: 60 + lv * 30 };
}

const KEYWORDS: [Skill, RegExp][] = [
  ['健', /ジム|筋トレ|ストレッチ|走|ラン|ヨガ|散歩|歩|睡眠|寝|運動|体操|ウォーク|筋|泳/],
  ['知', /読む|勉強|学習|問題|復習|Learn|講座|本|試験|資格|暗記|章|模試|テキスト/i],
  ['技', /コード|実装|設定|構築|デプロイ|プログラム|開発|ツール|環境|修理|直す/],
  ['話', /連絡|電話|メール|会う|相談|話|返信|打ち合わせ|面談|会議|送る/],
  ['創', /書く|描|絵|作る|スケッチ|デザイン|写真|料理|日記|ブログ|曲/],
  ['生', /払う|支払|買う|掃除|洗濯|片付|手続|予約|役所|銀行|税|ゴミ|そろえる|準備|病院|歯医者/],
];
export function guessSkill(text: string): Skill {
  for (const [k, re] of KEYWORDS) if (re.test(text)) return k;
  return '生';
}

/* ---------- achievements ---------- */
export interface Achievement { id: string; name: string; sub: string; test: (p: Personal) => boolean }
const days = (p: Personal) => Object.values(p.days);
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: '初太刀', sub: 'はじめて 斬った', test: (p) => days(p).some((d) => d.slashes > 0) },
  { id: 'three7', name: '三つ斬り 七日', sub: '「今日の三つ」を 7日', test: (p) => days(p).filter((d) => d.three).length >= 7 },
  { id: 'streak7', name: '七日 つづけた', sub: '学習を 7日 つづけた', test: (p) => Object.values(p.study).some((s) => s.bestStreak >= 7) },
  { id: 'streak30', name: '三十日 つづけた', sub: '学習を 30日 つづけた', test: (p) => Object.values(p.study).some((s) => s.bestStreak >= 30) },
  { id: 'kill1', name: '初討伐', sub: '週の影を 倒した', test: (p) => p.zukan.length >= 1 },
  { id: 'kill4', name: '四体', sub: '影を 4体 倒した', test: (p) => p.zukan.length >= 4 },
  { id: 'q100', name: '百問', sub: '100問に 答えた', test: (p) => Object.values(p.study).reduce((a, s) => a + s.log.length, 0) >= 100 || Object.values(p.study).some((s) => Object.values(s.history).reduce((a, h) => a + h.a, 0) >= 100) },
  { id: 'crit', name: '会心', sub: '一戦で 会心を 3回', test: (p) => p.zukan.some((z) => z.boss.crits >= 3) || (p.boss.cur?.crits ?? 0) >= 3 },
];

/** Checks every achievement; returns the ids that were newly earned. */
export function checkAchievements(p: Personal, today: string) {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.game.ach[a.id]) continue;
    if (a.test(p)) {
      p.game.ach[a.id] = today;
      got.push(a.id);
    }
  }
  return got;
}

export const newGame = (): Game => ({ xp: 0, lv: 1, total: 0, skills: { 知: 0, 技: 0, 話: 0, 創: 0, 健: 0, 生: 0 }, ach: {} });
