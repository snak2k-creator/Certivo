// 覚える: the words and the big picture, before the questions. A lesson is one topic (or the basic words),
// read once; its words then go through review boxes the way questions do. A topic counts as known when its
// questions already go well, so nobody is sent back to read what they can already answer.
import type { Learned, Pack, StudyProgress, Task, Term, WordCard } from './types';
import { addDays, shuffle } from './util';
import { INTERVALS } from './study';
import { topicShort } from './enemy';

/** The lesson of basic words that comes before the first topic. */
export const BASICS = 'basics';
/** XP for the first time through a lesson, for the big picture, and for one recalled word. */
export const LESSON_XP = 20;
export const GUIDE_XP = 10;
export const WORD_XP = 5;
/** What one recalled word does to this week's shadow. */
export const WORD_DAMAGE = 20;
/** How many words one review asks at most. */
export const REVIEW_MAX = 10;

const NONE: Learned = { read: {}, words: {} };
/** For reading: never adds anything to the progress. */
export const learnedIn = (sp: StudyProgress | undefined): Learned => sp?.learn ?? NONE;
/** For writing: makes the record on first use. */
export function learnedOf(sp: StudyProgress): Learned {
  return (sp.learn ||= { read: {}, words: {} });
}

export const hasLearn = (pk: Pack | undefined) => !!pk?.terms?.length;
export const termById = (pk: Pack, id: string) => pk.terms?.find((t) => t.id === id);
export const isLearnTask = (t: Task) => t.study?.kind === 'learn' || t.study?.kind === 'words';

/** A lesson's words ('basics' for the basic words), in the pack's order. */
export function wordsOf(pk: Pack, lesson: string): Term[] {
  const all = pk.terms ?? [];
  if (lesson !== BASICS) return all.filter((t) => t.topicId === lesson);
  const order = pk.guide?.basics ?? [];
  const listed = order.map((id) => all.find((t) => t.id === id)).filter((t): t is Term => !!t && !t.topicId);
  return [...listed, ...all.filter((t) => !t.topicId && !order.includes(t.id))];
}

/** Lessons in learning order: the basic words, then the guide's path, then any topic the path left out. */
export function lessons(pk: Pack): string[] {
  const path = (pk.guide?.path ?? []).filter((id) => pk.topics.some((t) => t.id === id));
  const rest = pk.topics.map((t) => t.id).filter((id) => !path.includes(id));
  return wordsOf(pk, BASICS).length ? [BASICS, ...path, ...rest] : [...path, ...rest];
}

export function lessonName(pk: Pack, lesson: string) {
  if (lesson === BASICS) return 'はじめの ことば';
  return pk.topics.find((x) => x.id === lesson)?.title ?? lesson;
}
export function lessonShort(pk: Pack, lesson: string) {
  if (lesson === BASICS) return 'はじめの ことば';
  const t = pk.topics.find((x) => x.id === lesson);
  return t ? topicShort(t) : lesson;
}

export type WordState = 'new' | 'learning' | 'learned' | 'settled';
/** まだ → 覚えかけ → 覚えた (recalled again on a later day) → 定着. */
export function wordState(c?: WordCard): WordState {
  if (!c || !c.seen) return 'new';
  if (c.box >= 4) return 'settled';
  if (c.box >= 2) return 'learned';
  return 'learning';
}
export const isLearned = (c?: WordCard) => !!c && c.box >= 2;

/** A topic whose questions already go well (3 answers or more, 70% right). */
export function knownByAnswers(pk: Pack, sp: StudyProgress, topicId: string) {
  let seen = 0;
  let ok = 0;
  for (const q of pk.questions) {
    if (q.topicId !== topicId) continue;
    const c = sp.cards[q.id];
    if (!c) continue;
    seen += c.seen;
    ok += c.correct;
  }
  return seen >= 3 && ok / seen >= 0.7;
}

export type LessonState = 'new' | 'read' | 'learned' | 'ready';
/** 未読 → 読んだ → 覚えた (every word recalled on a later day) → 斬れる (its questions go well). */
export function lessonState(pk: Pack, sp: StudyProgress, lesson: string): LessonState {
  if (lesson !== BASICS && knownByAnswers(pk, sp, lesson)) return 'ready';
  const L = learnedIn(sp);
  if (!L.read[lesson]) return 'new';
  const ws = wordsOf(pk, lesson);
  return ws.length && ws.every((w) => isLearned(L.words[w.id])) ? 'learned' : 'read';
}

/** The next lesson to read: the first one not read yet and not already known from answers. */
export function nextLesson(pk: Pack, sp: StudyProgress): string | null {
  const L = learnedIn(sp);
  return lessons(pk).find((c) => !L.read[c] && (c === BASICS || !knownByAnswers(pk, sp, c))) ?? null;
}

/** Topics the questions may come from: read, or already practiced. Empty while nothing is. */
export function openTopics(pk: Pack, sp: StudyProgress) {
  const L = learnedIn(sp);
  const out = new Set(pk.topics.filter((t) => L.read[t.id]).map((t) => t.id));
  for (const q of pk.questions) if (sp.cards[q.id]?.seen) out.add(q.topicId);
  return out;
}

/** Nothing read and nothing answered yet: the questions wait until something is learned. */
export const beginner = (pk: Pack, sp: StudyProgress) => hasLearn(pk) && openTopics(pk, sp).size === 0;

/** Words whose review day has come, the least settled first. */
export function dueWords(pk: Pack, sp: StudyProgress, today: string): Term[] {
  const L = learnedIn(sp);
  return (pk.terms ?? [])
    .filter((t) => {
      const c = L.words[t.id];
      return !!c && c.due <= today;
    })
    .sort((a, b) => L.words[a.id].box - L.words[b.id].box);
}

export function wordCounts(pk: Pack, sp: StudyProgress) {
  const L = learnedIn(sp);
  const all = pk.terms ?? [];
  return { all: all.length, learned: all.filter((t) => isLearned(L.words[t.id])).length, seen: all.filter((t) => L.words[t.id]?.seen).length };
}

/** One recall: show the meaning and pick the word, or show the word and pick its meaning. */
export interface Recall {
  term: Term;
  dir: 'word' | 'mean';
  /** term ids, the right one among them */
  options: string[];
}

/** Wrong answers worth telling apart: the mixed-up word first, then the same lesson and domain, then the rest. */
function distractors(pk: Pack, term: Term, n: number) {
  const all = pk.terms ?? [];
  const used = new Set([term.id]);
  const out: Term[] = [];
  const add = (t?: Term) => {
    if (t && !used.has(t.id) && out.length < n) {
      used.add(t.id);
      out.push(t);
    }
  };
  if (term.vs) add(all.find((t) => t.id === term.vs!.id));
  for (const t of all) if (t.vs?.id === term.id) add(t);
  shuffle(all.filter((t) => t.topicId === term.topicId)).forEach(add);
  const domain = pk.topics.find((t) => t.id === term.topicId)?.domainId;
  if (domain) shuffle(all.filter((t) => pk.topics.find((x) => x.id === t.topicId)?.domainId === domain)).forEach(add);
  shuffle(all).forEach(add);
  return out;
}

/** Recall questions for some words, alternating the direction. */
export function makeRecall(pk: Pack, terms: Term[], n = terms.length): Recall[] {
  return shuffle(terms)
    .slice(0, n)
    .map((term, i) => ({
      term,
      dir: i % 2 ? 'mean' : 'word',
      options: shuffle([term.id, ...distractors(pk, term, 3).map((t) => t.id)]),
    }));
}

/**
 * One recalled word. A right answer moves it up a box once a day (a second right answer the same day does
 * not, so 覚えた always means remembered on a later day); a miss sends it back to the start.
 */
export function recordWord(sp: StudyProgress, termId: string, ok: boolean, today: string): { card: WordCard; up: boolean } {
  const L = learnedOf(sp);
  const prev = L.words[termId];
  const c: WordCard = prev ? { ...prev } : { box: 0, due: today, seen: 0, ok: 0, lastAt: '' };
  const again = !!prev && prev.lastAt === today && prev.box > 0;
  c.seen++;
  let up = false;
  if (ok) {
    c.ok++;
    if (!again) {
      c.box = Math.min(5, c.box + 1);
      c.due = addDays(today, INTERVALS[c.box] || 1);
      up = true;
    }
  } else {
    c.box = 0;
    c.due = today;
  }
  c.lastAt = today;
  L.words[termId] = c;
  return { card: c, up };
}

/** Words met in a lesson but not asked yet start their review tomorrow. */
export function seeWords(sp: StudyProgress, termIds: string[], today: string) {
  const L = learnedOf(sp);
  for (const id of termIds) if (!L.words[id]) L.words[id] = { box: 0, due: addDays(today, 1), seen: 0, ok: 0, lastAt: '' };
}
