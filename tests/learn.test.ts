// 覚える: lessons in order, words in review boxes, and the day that starts from what has been learned.
import { beforeEach, describe, expect, it } from 'vitest';
import { answerWord, deleteTask, ensureDay, finishLesson, finishReview, readGuide, studyCert } from '../src/core/actions';
import { BASICS, LESSON_XP, WORD_DAMAGE, beginner, dueWords, lessonState, lessons, makeRecall, nextLesson, openTopics, recordWord, wordsOf } from '../src/core/learn';
import { pickKakera, progress } from '../src/core/study';
import { state } from '../src/core/store';
import { doneOn } from '../src/core/tasks';
import { addDays } from '../src/core/util';
import type { Pack } from '../src/core/types';
import { DAY, fresh, learnt, pack } from './helpers';

beforeEach(() => fresh());
const sp = () => progress(state.p, pack.id);
const learnTasks = () => state.p.tasks.filter((t) => t.study?.kind === 'learn' || t.study?.kind === 'words');

describe('lessons', () => {
  it('start with the basic words, then follow the guide, covering every topic once', () => {
    const ls = lessons(pack);
    expect(ls[0]).toBe(BASICS);
    expect(ls.slice(1)).toEqual(pack.guide!.path);
    expect(new Set(ls.slice(1))).toEqual(new Set(pack.topics.map((t) => t.id)));
  });

  it('keep the basic words in the order the guide gives', () => {
    expect(wordsOf(pack, BASICS).map((t) => t.id)).toEqual(pack.guide!.basics);
    expect(wordsOf(pack, 't-rag').every((t) => t.topicId === 't-rag')).toBe(true);
  });

  it('go 未読 → 読んだ → 覚えた, and 斬れる once the questions go well', () => {
    expect(lessonState(pack, sp(), 't-rag')).toBe('new');
    finishLesson(pack, 't-rag', DAY);
    expect(lessonState(pack, sp(), 't-rag')).toBe('read');
    for (const w of wordsOf(pack, 't-rag')) sp().learn!.words[w.id].box = 2;
    expect(lessonState(pack, sp(), 't-rag')).toBe('learned');
    for (const q of pack.questions.filter((q) => q.topicId === 't-rag')) sp().cards[q.id] = { box: 2, due: DAY, seen: 2, correct: 2, lastAt: DAY, lastConf: 'sure' };
    expect(lessonState(pack, sp(), 't-rag')).toBe('ready');
  });

  it('skip a topic whose questions already go well', () => {
    learnt(BASICS);
    const first = pack.guide!.path[0];
    for (const q of pack.questions.filter((q) => q.topicId === first)) sp().cards[q.id] = { box: 2, due: DAY, seen: 3, correct: 3, lastAt: DAY, lastConf: 'sure' };
    expect(nextLesson(pack, sp())).toBe(pack.guide!.path[1]);
  });

  it('open their topics to the questions, as practice does', () => {
    expect(beginner(pack, sp())).toBe(true);
    learnt(BASICS);
    expect(openTopics(pack, sp()).size).toBe(0);
    learnt('t-rag');
    const q = pack.questions.find((x) => x.topicId === 't-search')!;
    sp().cards[q.id] = { box: 1, due: DAY, seen: 1, correct: 1, lastAt: DAY, lastConf: 'maybe' };
    expect([...openTopics(pack, sp())].sort()).toEqual(['t-rag', 't-search']);
    expect(beginner(pack, sp())).toBe(false);
  });
});

describe('words', () => {
  it('move up one box a day, and back to the start on a miss', () => {
    const id = 'r-chunk';
    expect(recordWord(sp(), id, true, DAY)).toMatchObject({ up: true, card: { box: 1, due: addDays(DAY, 1) } });
    // a second right answer the same day does not count twice
    expect(recordWord(sp(), id, true, DAY)).toMatchObject({ up: false, card: { box: 1 } });
    const next = addDays(DAY, 1);
    expect(recordWord(sp(), id, true, next).card).toMatchObject({ box: 2, due: addDays(next, 3) });
    expect(recordWord(sp(), id, false, next).card).toMatchObject({ box: 0, due: next });
  });

  it('come due the day after the lesson, the least settled first', () => {
    finishLesson(pack, 't-rag', DAY);
    expect(dueWords(pack, sp(), DAY)).toHaveLength(0);
    const due = dueWords(pack, sp(), addDays(DAY, 1));
    expect(due.map((t) => t.id).sort()).toEqual(wordsOf(pack, 't-rag').map((t) => t.id).sort());
  });

  it('are asked with three wrong answers, the mixed-up twin among them', () => {
    const term = pack.terms!.find((t) => t.id === 'd-standard')!;
    const [r] = makeRecall(pack, [term]);
    expect(r.options).toHaveLength(4);
    expect(new Set(r.options).size).toBe(4);
    expect(r.options).toContain('d-standard');
    expect(r.options).toContain(term.vs!.id);
  });

  it('give XP, and hit the shadow once a day per word', () => {
    ensureDay(pack, DAY);
    const hp = state.p.boss.cur!.hp;
    const a = answerWord(pack, 'r-chunk', true, DAY);
    expect(a).toMatchObject({ up: true, dmg: WORD_DAMAGE });
    expect(answerWord(pack, 'r-chunk', true, DAY)).toMatchObject({ up: false, dmg: 0 });
    expect(state.p.boss.cur!.hp).toBe(hp - WORD_DAMAGE);
    expect(state.p.days[DAY].words).toBe(1);
    expect(sp().lastStudyDate).toBe(DAY);
  });
});

describe('the day with 覚える', () => {
  it('cuts today’s lesson task when the lesson is read, with XP only the first time', () => {
    ensureDay(pack, DAY);
    const t = learnTasks()[0];
    const r = finishLesson(pack, BASICS, DAY);
    expect(r.first).toBe(true);
    expect(r.out?.on).toBe(true);
    expect(doneOn(t, DAY)).toBe(true);
    expect(r.xp).toBe(LESSON_XP + r.out!.xp);
    expect(finishLesson(pack, BASICS, DAY)).toMatchObject({ first: false, xp: 0, out: null });
    expect(state.p.days[DAY].lessons).toEqual([BASICS]);
  });

  it('brings the next lesson the next day and the morning shards from what was read', () => {
    ensureDay(pack, DAY);
    finishLesson(pack, BASICS, DAY);
    finishLesson(pack, 't-model-choice', DAY);
    const next = addDays(DAY, 1);
    ensureDay(pack, next);
    const today = learnTasks().filter((t) => t.date === next);
    expect(today).toHaveLength(1);
    expect(today[0].study).toMatchObject({ kind: 'learn', lesson: pack.guide!.path[1] });
    expect(state.p.tasks.some((t) => t.study?.kind === 'kakera' && t.date === next)).toBe(true);
    const qs = pickKakera(pack, sp(), next, 5, openTopics(pack, sp()));
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.topicId === 't-model-choice')).toBe(true);
  });

  it('drops yesterday’s unread lesson task, and keeps a deleted one away for the day', () => {
    ensureDay(pack, DAY);
    const old = learnTasks()[0];
    const next = addDays(DAY, 1);
    ensureDay(pack, next);
    expect(state.p.tasks).not.toContain(old);
    const t = learnTasks()[0];
    expect(t.date).toBe(next);
    deleteTask('p', t.id);
    ensureDay(pack, next);
    expect(learnTasks()).toHaveLength(0);
  });

  it('turns into a word review once every lesson is read', () => {
    learnt(...lessons(pack));
    for (const w of pack.terms!.slice(0, 4)) recordWord(sp(), w.id, false, addDays(DAY, -1));
    ensureDay(pack, DAY);
    const [t] = learnTasks();
    expect(t).toMatchObject({ title: 'ことばの復習 4語', study: { kind: 'words', count: 4 } });
    expect(finishReview(pack, DAY).out?.on).toBe(true);
  });

  it('gives the big picture its XP once', () => {
    expect(readGuide(pack, DAY)).toBe(10);
    expect(readGuide(pack, DAY)).toBe(0);
  });
});

describe('another certification', () => {
  const other: Pack = { ...pack, id: 'x-900', code: 'X-900', name: 'Example', guide: undefined, terms: undefined };

  it('is added from the registry and made the active one', () => {
    expect(studyCert({ id: 'x-900', code: 'X-900', name: 'Example', file: 'x-900.json', version: '1.0.0', status: 'active' })).toBe(true);
    expect(state.profile.certId).toBe('x-900');
    expect(state.profile.packs.map((x) => x.certId)).toEqual(['ai-103', 'x-900']);
    expect(studyCert({ id: 'x-900', code: 'X-900', name: 'Example', file: 'x-900.json', version: '1.0.0', status: 'active' })).toBe(false);
  });

  it('takes over the day: the other one’s unfinished study tasks go, its own come', () => {
    learnt('t-rag');
    ensureDay(pack, DAY);
    expect(state.p.tasks.some((t) => t.study?.certId === 'ai-103' && t.study.kind === 'kakera')).toBe(true);
    state.packs[other.id] = other;
    ensureDay(other, DAY);
    expect(state.p.tasks.some((t) => t.study?.certId === 'ai-103' && (t.study.kind === 'kakera' || t.study.kind === 'learn'))).toBe(false);
    // a pack without words has no 覚える: its questions start right away
    expect(state.p.tasks.filter((t) => t.study?.certId === 'x-900').map((t) => t.study!.kind)).toEqual(['kakera']);
  });

  it('gets its own 覚える the day it is switched to, and switching back brings the first one again', () => {
    const words: Pack = { ...pack, id: 'x-900', code: 'X-900', name: 'Example' };
    state.packs[words.id] = words;
    const certs = () => learnTasks().map((t) => t.study!.certId);
    ensureDay(pack, DAY);
    expect(certs()).toEqual(['ai-103']);
    ensureDay(words, DAY);
    expect(certs()).toEqual(['x-900']);
    ensureDay(pack, DAY);
    expect(certs()).toEqual(['ai-103']);
    // one the person deleted stays away for the day, switch or not
    deleteTask('p', learnTasks()[0].id);
    ensureDay(words, DAY);
    ensureDay(pack, DAY);
    expect(certs()).toEqual([]);
  });
});
