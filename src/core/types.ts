// Data model. Personal and work notebooks are stored, exported, synced and deleted separately.

export type Diff = 'e' | 'n' | 'h';
export type Skill = '知' | '技' | '話' | '創' | '健' | '生';
export type Notebook = 'p' | 'w';
export type Conf = 'sure' | 'maybe' | 'guess';

/* ---------- certification packs (public/certs/*.json) ---------- */
export interface PackOption { id: string; text: string }
export interface Question {
  id: string;
  topicId: string;
  type: 'single' | 'multi';
  difficulty: number;
  stem: string;
  options: PackOption[];
  answer: string[];
  explanation: string;
  whyWrong?: Record<string, string>;
}
export interface Topic {
  id: string;
  domainId: string;
  title: string;
  short?: string;
  overview: string;
  examTip?: string;
  /** steps that must be cut in the order data flows (縛鎖) */
  order?: { prompt: string; steps: string[]; last: string; lastWords: string };
  /** two things that are easy to mix up (双影) */
  twins?: { a: string; b: string; tell: string };
}
export interface Domain { id: string; name: string; weightMin: number; weightMax: number }
export interface Pack {
  id: string;
  code: string;
  name: string;
  passingScore: number;
  scoreMax: number;
  packVersion: string;
  domains: Domain[];
  topics: Topic[];
  questions: Question[];
}
export interface RegistryEntry { id: string; code: string; name: string; file: string; version: string; status: string }
export interface Registry { certs: RegistryEntry[] }

/* ---------- tasks ---------- */
export interface StudyLink {
  kind: 'drill' | 'kakera' | 'read';
  certId: string;
  topicId?: string;
  domainId?: string;
  count?: number;
}
export interface Task {
  id: string;
  title: string;
  /** the day it is planned for; a repeating task starts on this day */
  date: string;
  time?: string;
  due?: string;
  mins?: number;
  /** weekdays it repeats on, 0 = Sunday */
  repeat?: number[];
  diff: Diff;
  sk: Skill;
  note?: string;
  study?: StudyLink;
  doneAt?: number;
  /** repeating tasks: date -> time done */
  doneOn?: Record<string, number>;
  /** repeating tasks: dates skipped with 明日へ */
  skip?: Record<string, true>;
  createdAt: number;
  from?: 'user' | 'ai' | 'zan';
  /** work tasks: a short label like 書く / 連絡 */
  tag?: string;
  /** study tasks: the damage finishing it did to the week's shadow */
  hit?: number;
}

/* ---------- study ---------- */
export interface Card { box: number; due: string; seen: number; correct: number; lastAt: string; lastConf: Conf | '' }
export interface Answer {
  q: string;
  d: string;
  ok: boolean;
  conf: Conf;
  ms: number;
  pick: string[];
  mode: Mode;
}
export type Mode = 'kakera' | 'drill' | 'boss';
export interface StudyProgress {
  cards: Record<string, Card>;
  history: Record<string, { a: number; c: number }>;
  log: Answer[];
  streak: number;
  bestStreak: number;
  lastStudyDate: string;
}

/* ---------- enemies ---------- */
export type EnemyType = 'bakusa' | 'souei' | 'sakazuri' | 'muchu' | 'kyoman' | 'zanzo' | 'kokugen';
export interface Boss {
  id: string;
  week: string;
  type: EnemyType;
  certId: string;
  topicId: string;
  name: string;
  born: string;
  taunt: string;
  lastWords: string;
  terms: string[];
  hp: number;
  max: number;
  deadline: string;
  tier: 'week' | 'strong';
  battles: number;
  hits: number;
  crits: number;
  misses: number;
  source: 'ai' | 'zan';
  createdAt: number;
}
export interface ZukanEntry {
  boss: Boss;
  at: string;
  kimete: string;
  battles: number;
  answers: number;
  correct: number;
}

/* ---------- days and recaps ---------- */
export interface Day {
  xp: number;
  slashes: number;
  kills: number;
  three?: boolean;
  /** work notebook: only the count lands here */
  work?: number;
  dmg?: number;
  kakera?: boolean;
  note?: string;
  /** battles with the week's shadow, for 1日の記録 */
  fights?: Fight[];
}
export interface Fight {
  at: number;
  boss: string;
  /** questions answered and answered right */
  n: number;
  ok: number;
  dmg: number;
  xp: number;
  kill?: boolean;
}
export interface Recap {
  date: string;
  text: string;
  source: 'ai' | 'zan';
  at: number;
  seen?: boolean;
  deleted?: boolean;
}

/* ---------- notebooks ---------- */
export interface Game {
  xp: number;
  lv: number;
  total: number;
  skills: Record<Skill, number>;
  ach: Record<string, string>;
}
export interface Personal {
  v: 1;
  updatedAt: number;
  tasks: Task[];
  game: Game;
  days: Record<string, Day>;
  study: Record<string, StudyProgress>;
  boss: { cur?: Boss; lost: Boss[] };
  zukan: ZukanEntry[];
  recaps: Record<string, Recap>;
  ai: { month: string; used: number; sug?: Suggestion };
}
export interface Suggestion {
  date: string;
  topicId: string;
  title: string;
  reason: string;
  source: 'ai' | 'zan';
  done?: 'added' | 'skipped';
}
export interface SentLog { at: number; what: string }
export interface Work {
  v: 1;
  updatedAt: number;
  tasks: Task[];
  sent: SentLog[];
}

export interface PackEntry { certId: string; code: string; name: string; examDate: string; status: 'studying' | 'booked' | 'passed' | 'renew' }
export interface Profile {
  v: 1;
  updatedAt: number;
  onboarded: boolean;
  /** consent to send the personal notebook to AI once a night for 1日の記録 */
  nightly: boolean;
  sound: boolean;
  haptics: boolean;
  ritual: boolean;
  lastRitual: string;
  certId: string;
  packs: PackEntry[];
  mode: Notebook;
  sync: { p: boolean; w: boolean };
  /** consent to let the AI write today's suggestion and name the week's shadow (sends topic names and counts) */
  aiAuto: boolean;
  /** the server's monthly AI cap for this person, as the server last said */
  aiCap: number;
  /** the person's own monthly limit on top of the server's; 0 = the server's cap */
  aiLimit: number;
  migratedFrom?: string;
}
