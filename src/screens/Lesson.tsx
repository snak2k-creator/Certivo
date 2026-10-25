// One lesson of 覚える, full screen like a study session: what it is and why it exists, how it works, its words
// one at a time, the exam's tip, then a short check that the words stuck. The same screen reviews the words
// that are due. Reaching the end reads the lesson; a 覚える task for it is cut because the person did it.
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { Pack, Task, Term, Topic } from '../core/types';
import { state } from '../core/store';
import { answerWord, finishLesson, finishReview, type Outcome, type WordResult } from '../core/actions';
import { BASICS, REVIEW_MAX, dueWords, learnedIn, lessonShort, lessons, makeRecall, nextLesson, wordsOf, type Recall } from '../core/learn';
import { packOf } from '../core/pack';
import { newProgress } from '../core/study';
import { doneOn } from '../core/tasks';
import { levelFromTotal, need, title } from '../core/game';
import { BUZZ, buzz, sfx } from '../core/sfx';
import { addDays, md } from '../core/util';
import { celebrate } from '../ui/slash';
import { back, go } from '../ui/router';
import { useKey } from '../ui/hooks';
import { sheets } from '../ui/sheets';
import { Arrow, Close } from '../ui/icons';
import { Linked } from '../ui/words';

type Card = { k: 'intro' } | { k: 'mech' } | { k: 'word'; t: Term; i: number; n: number } | { k: 'tip' } | { k: 'check'; r: Recall; i: number; n: number } | { k: 'res' };

interface Plan {
  pk: Pack;
  /** null: a review of the words that are due */
  lesson: string | null;
  topic?: Topic;
  task?: Task;
  words: Term[];
  cards: Card[];
}

const BLANK = newProgress();
/** Sentences, so a long explanation reads as steps. */
const sentences = (s: string) => s.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean);

/** Reads the route: lesson/:lesson, lesson/task/:id, lesson/review. */
function plan(pk: Pack, args: string[], date: string): Plan | string {
  const [what, id] = args;
  let task: Task | undefined;
  let lesson: string | null = what === 'review' ? null : what;
  if (what === 'task') {
    task = state.p.tasks.find((x) => x.id === id);
    if (!task?.study) return 'この やることは、もう ありません。';
    if (doneOn(task, date)) return 'この やることは、もう 斬ってあります。';
    lesson = task.study.kind === 'words' ? null : task.study.lesson ?? null;
  }
  const sp = state.p.study[pk.id] ?? BLANK;
  if (lesson === null) {
    const due = dueWords(pk, sp, date).slice(0, REVIEW_MAX);
    if (!due.length) return 'いま 復習する ことばは ありません。単元を読むと、あしたから ここに 出てきます。';
    const checks = makeRecall(pk, due);
    return { pk, lesson: null, task, words: due, cards: [...checks.map((r, i) => ({ k: 'check' as const, r, i, n: checks.length })), { k: 'res' }] };
  }
  if (!lessons(pk).includes(lesson)) return 'この単元は、いまの問題集に ありません。';
  const topic = pk.topics.find((t) => t.id === lesson);
  const words = wordsOf(pk, lesson);
  const checks = makeRecall(pk, words, Math.min(words.length, lesson === BASICS ? 5 : 4));
  const cards: Card[] = [{ k: 'intro' }];
  if (topic && (topic.mechanism || topic.order || topic.twins)) cards.push({ k: 'mech' });
  words.forEach((t, i) => cards.push({ k: 'word', t, i, n: words.length }));
  if (topic?.examTip) cards.push({ k: 'tip' });
  checks.forEach((r, i) => cards.push({ k: 'check', r, i, n: checks.length }));
  cards.push({ k: 'res' });
  return { pk, lesson, topic, task, words, cards };
}

export function Lesson({ args, date }: { args: string[]; date: string }) {
  // a task keeps the certification it was made for
  const certId = args[0] === 'task' ? state.p.tasks.find((t) => t.id === args[1])?.study?.certId : undefined;
  const pk = packOf(certId);
  if (!pk) return <Blank text="問題集を 読みこんでいます…" />;
  if (!pk.terms?.length) return <Blank text={`${pk.code} には、まだ 覚える ことばが ありません。問題から はじめられます。`} />;
  return <LessonIn key={args.join('/')} pk={pk} args={args} date={date} />;
}

function LessonIn({ pk, args, date }: { pk: Pack; args: string[]; date: string }) {
  const [p] = useState(() => plan(pk, args, date));
  if (typeof p === 'string') return <Blank text={p} />;
  return <Run p={p} date={date} />;
}

function Blank({ text }: { text: string }) {
  useKey((e) => {
    if (e.key === 'Escape' || e.key === 'Enter') back('learn');
  });
  return (
    <div class="ss">
      <div class="ss-top">
        <div class="ss-bar">
          <button type="button" class="ss-x" onClick={() => back('learn')} aria-label="とじる">
            <Close size={16} />
          </button>
        </div>
      </div>
      <div class="ss-panel z-light">
        <div class="ss-in">
          <p class="ss-blank">{text}</p>
          <button type="button" class="z-bk" onClick={() => back('learn')}>
            覚える に戻る
          </button>
        </div>
      </div>
    </div>
  );
}

interface Answered { pick: string; ok: boolean; res: WordResult }
interface State {
  at: number;
  answers: Record<number, Answered>;
  xp: number;
  dmg: number;
  out: Outcome | null;
  /** the 覚える task this cut, if any */
  cut?: Task;
  first: boolean;
  live: string;
}

function Run({ p, date }: { p: Plan; date: string }) {
  const { pk, cards, topic } = p;
  const review = p.lesson === null;
  const before = useRef({ total: state.p.game.total }).current;
  const S = useRef<State>({ at: 0, answers: {}, xp: 0, dmg: 0, out: null, first: false, live: '' }).current;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const upd = (patch: Partial<State>) => {
    Object.assign(S, patch);
    bump(0);
  };
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sfx('open');
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [S.at]);

  const card = cards[S.at];
  const firstCheck = cards.findIndex((c) => c.k === 'check');
  const checks = cards.filter((c) => c.k === 'check').length;
  const termOf = (id: string) => pk.terms!.find((t) => t.id === id)!;
  const boss = state.p.boss.cur;
  const right = Object.values(S.answers).filter((a) => a.ok).length;

  const finish = () => {
    if (review) {
      const r = finishReview(pk, date);
      return { out: r.out, xp: r.out?.xp ?? 0, first: false, cut: r.task };
    }
    const r = finishLesson(pk, p.lesson!, date);
    return { out: r.out, xp: r.xp, first: r.first, cut: r.task };
  };

  const goTo = (i: number) => {
    if (i < 0 || i >= cards.length) return;
    if (cards[i].k === 'res' && S.at !== i) {
      const r = finish();
      upd({ at: i, out: r.out, cut: r.out?.on ? r.cut : undefined, first: r.first, xp: S.xp + r.xp, dmg: S.dmg + (r.out?.dmg ?? 0), live: review ? `${right}語 思い出せた。` : '読み終えた。' });
      sfx('reward');
      const lv0 = levelFromTotal(before.total).lv;
      celebrate({ lvFrom: lv0, lvTo: state.p.game.lv, three: !!r.out?.three, killReady: !!r.out?.killReady || (!!boss && boss.hp <= 0 && S.dmg > 0), ach: r.out?.ach ?? [] }, 500);
      return;
    }
    sfx('tock');
    const c = cards[i];
    upd({ at: i, live: c.k === 'word' ? `${c.t.word}。${c.t.mean}` : c.k === 'check' ? (c.r.dir === 'word' ? c.r.term.mean : c.r.term.word) : '' });
  };
  const next = () => {
    if (card.k === 'check' && !S.answers[S.at]) return;
    if (card.k === 'res') return close();
    goTo(S.at + 1);
  };
  const prev = () => {
    // once the check has begun, the words stay hidden
    if (S.at === 0 || card.k === 'check' || card.k === 'res') return;
    goTo(S.at - 1);
  };

  const choose = (id: string) => {
    if (card.k !== 'check' || S.answers[S.at]) return;
    const ok = id === card.r.term.id;
    const res = answerWord(pk, card.r.term.id, ok, date);
    upd({ answers: { ...S.answers, [S.at]: { pick: id, ok, res } }, xp: S.xp + res.xp, dmg: S.dmg + res.dmg, live: ok ? '正解。' : `ちがいました。正解は ${card.r.term.word}` });
    if (ok) {
      sfx('right');
      buzz(BUZZ.soft);
    } else {
      sfx('wrong');
      buzz(BUZZ.tap);
    }
  };

  const close = () => {
    sfx('tock');
    back('learn');
  };

  useKey((e) => {
    // a word's sheet is open above the card: its keys are its own
    if (sheets.now || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') return close();
    if (card.k === 'check' && !S.answers[S.at]) {
      const n = /^[1-4]$/.test(k) ? Number(k) - 1 : -1;
      if (n >= 0 && card.r.options[n]) choose(card.r.options[n]);
      else return;
    } else if (k === 'Enter' || k === ' ' || k === 'ArrowRight') next();
    else if (k === 'ArrowLeft') prev();
    else return;
    e.preventDefault();
  });

  const reading = card.k !== 'check' && card.k !== 'res';
  const pct = Math.round((S.at / Math.max(1, cards.length - 1)) * 100);
  const name = review ? `ことば ${p.words.length}語` : lessonShort(pk, p.lesson!);

  return (
    <div class="ss ls">
      <div class="ss-top">
        <div class="ss-bar">
          <button type="button" class="ss-x" onClick={close} aria-label="とじる">
            <Close size={16} />
          </button>
          <span class="k-sp" />
          {checks > 0 && S.at >= firstCheck && firstCheck >= 0 ? (
            <span class="ss-slots" aria-label={`確かめ ${checks}問中 ${Object.keys(S.answers).length}問 済み`}>
              {cards.map((c, i) => (c.k === 'check' ? <i key={i} class={S.answers[i] ? (S.answers[i].ok ? 'ok' : 'ng') : i === S.at ? 'cur' : ''} /> : null))}
            </span>
          ) : (
            <span class="ls-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="読んだところ">
              <i style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
        <div class="ss-title">
          <span class="z-tag z-tag-r">{review ? '復習' : '覚える'}</span>
          <b class="z-min">{name}</b>
          {p.task && <span class="ss-task">やること「{p.task.title}」</span>}
        </div>
      </div>

      <div ref={scroller} class="ss-panel z-light">
        <div class="ss-in">
          <div key={S.at} class={`ls-card ls-${card.k}`}>
            {card.k === 'intro' && <Intro p={p} />}
            {card.k === 'mech' && topic && <Mech pk={pk} topic={topic} />}
            {card.k === 'word' && <Word pk={pk} t={card.t} i={card.i} n={card.n} />}
            {card.k === 'tip' && topic && <Tip pk={pk} topic={topic} />}
            {card.k === 'check' && <Check pk={pk} r={card.r} i={card.i} n={card.n} a={S.answers[S.at]} onPick={choose} termOf={termOf} />}
            {card.k === 'res' && <Result p={p} date={date} right={right} checks={checks} answers={S.answers} xp={S.xp} dmg={S.dmg} out={S.out} cut={S.cut} first={S.first} before={before.total} onClose={close} />}
          </div>
          {reading && (
            <div class="ss-fbn ls-nav">
              {S.at > 0 ? (
                <>
                  <button type="button" class="z-txb ls-back" onClick={prev}>
                    もどる
                  </button>
                  <span class="k-sp" />
                </>
              ) : (
                <span class="ss-note">下線の ことばは、タップすると 意味が 出ます</span>
              )}
              <button type="button" class="z-bk ss-next" onClick={next}>
                {cards[S.at + 1]?.k === 'check' ? '確かめる' : '次へ'}
                <Arrow />
              </button>
            </div>
          )}
          {card.k === 'check' && S.answers[S.at] && (
            <div class="ss-fbn ls-nav">
              <span class="ss-note">{S.answers[S.at].ok ? (S.answers[S.at].res.up ? '次の箱へ。間を あけて また出ます' : '今日は もう 数えました') : '復習に、もう一度 出ます'}</span>
              <button type="button" class="z-bk ss-next" onClick={next}>
                {cards[S.at + 1]?.k === 'res' ? '結果へ' : '次へ'}
                <Arrow />
              </button>
            </div>
          )}
        </div>
      </div>
      <div class="z-sr" aria-live="polite">
        {S.live}
      </div>
    </div>
  );
}

function Intro({ p }: { p: Plan }) {
  const { pk, topic } = p;
  if (!topic) {
    const L = learnedIn(state.p.study[pk.id]);
    return (
      <>
        <span class="ls-lb">はじめに</span>
        <p class="ls-big">この先で 何度も出てくる、土台の ことばを 先に 覚えます。</p>
        <p class="ls-p">
          {p.words.length}語。一つずつ 読んで、最後に 少しだけ 確かめます。読んだ ことばは、あしたから 復習に 出てきます。
        </p>
        {!L.guide && (
          <a class="ls-side" href="#/learn/guide">
            先に、{pk.code} の 全体像を 読む
            <Arrow size={12} />
          </a>
        )}
      </>
    );
  }
  const n = pk.domains.findIndex((d) => d.id === topic.domainId);
  const d = pk.domains[n];
  return (
    <>
      <span class="ls-lb">ひとことで</span>
      <p class="ls-big">
        <Linked pk={pk} text={topic.overview} />
      </p>
      {topic.purpose && (
        <>
          <span class="ls-lb">なぜ 要るのか</span>
          <p class="ls-p">
            <Linked pk={pk} text={topic.purpose} />
          </p>
        </>
      )}
      {d && (
        <div class="ls-where">
          <span class="z-min">第{n + 1}章</span>
          <b>{d.name}</b>
          <span class="z-num">
            試験の {d.weightMin}–{d.weightMax}%
          </span>
        </div>
      )}
    </>
  );
}

function Mech({ pk, topic }: { pk: Pack; topic: Topic }) {
  return (
    <>
      <span class="ls-lb">しくみ</span>
      {topic.mechanism &&
        sentences(topic.mechanism).map((s, i) => (
          <p key={i} class="ls-p ls-s">
            <Linked pk={pk} text={s} />
          </p>
        ))}
      {topic.order && (
        <div class="ls-flow">
          <span class="ls-lb2">流れの順</span>
          <ol>
            {[...topic.order.steps, topic.order.last].map((s, i, a) => (
              <li key={i} class={i === a.length - 1 ? 'last' : undefined}>
                <i class="z-num">{i + 1}</i>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {topic.twins && (
        <div class="ls-tw">
          <span class="ls-lb2">まぎらわしい 二つ</span>
          <div class="ls-twr">
            <b>{topic.twins.a}</b>
            <span>と</span>
            <b>{topic.twins.b}</b>
          </div>
          <p>{topic.twins.tell}</p>
        </div>
      )}
    </>
  );
}

function Word({ pk, t, i, n }: { pk: Pack; t: Term; i: number; n: number }) {
  const twin = t.vs ? pk.terms!.find((x) => x.id === t.vs!.id) : undefined;
  return (
    <>
      <span class="ls-lb">
        ことば {i + 1} / {n}
      </span>
      <b class="z-min ls-w">{t.word}</b>
      {t.read && <span class="ls-rd">{t.read}</span>}
      <p class="ls-mean">{t.mean}</p>
      {t.more && (
        <p class="ls-p">
          <Linked pk={pk} text={t.more} skip={[t.id]} />
        </p>
      )}
      {t.ex && (
        <div class="ls-ex">
          <span class="ls-lb2">たとえば</span>
          <Linked pk={pk} text={t.ex} skip={[t.id]} />
        </div>
      )}
      {twin && (
        <div class="ls-vs">
          <span class="ls-lb2">まぎらわしい</span>
          <b>{twin.word}</b>
          <span>{t.vs!.tell}</span>
        </div>
      )}
    </>
  );
}

function Tip({ pk, topic }: { pk: Pack; topic: Topic }) {
  const qs = pk.questions.filter((q) => q.topicId === topic.id).length;
  return (
    <>
      <span class="ls-lb">試験の コツ</span>
      <p class="ls-big">
        <Linked pk={pk} text={topic.examTip!} />
      </p>
      {qs > 0 && <p class="ls-p">この単元の 問題は {qs}問。ことばを 確かめたら、すぐ 解けます。</p>}
    </>
  );
}

function Check({ pk, r, i, n, a, onPick, termOf }: { pk: Pack; r: Recall; i: number; n: number; a?: Answered; onPick: (id: string) => void; termOf: (id: string) => Term }) {
  const boss = state.p.boss.cur;
  const asksWord = r.dir === 'word';
  return (
    <>
      <span class="ls-lb">
        確かめ {i + 1} / {n}
      </span>
      <span class="ls-qk">{asksWord ? 'この意味の ことばは？' : 'この ことばの 意味は？'}</span>
      {asksWord ? <p class="ls-qm">{r.term.mean}</p> : <b class="z-min ls-qw">{r.term.word}</b>}
      <div class="ss-opts">
        {r.options.map((id, oi) => {
          const t = termOf(id);
          const cls = a ? (id === r.term.id ? 'ok' : id === a.pick ? 'ng' : 'dim') : '';
          return (
            <button key={id} type="button" class={`ss-op ${cls}${asksWord ? '' : ' ls-opm'}`} onClick={() => onPick(id)} aria-disabled={!!a} style={{ animationDelay: `${(0.04 + oi * 0.04).toFixed(2)}s` }}>
              <i class="ss-opk">{oi + 1}</i>
              <span class="ss-opt">{asksWord ? t.word : t.mean}</span>
              <i class="ss-ops" />
            </button>
          );
        })}
      </div>
      {a && (
        <div class="ss-fb">
          <div class="ss-fbh">
            <b class={a.ok ? 'ok' : 'ng'}>{a.ok ? '正解' : 'ちがいました'}</b>
            {a.res.dmg > 0 && boss && (
              <span class="ss-hit">
                {boss.name}に −{a.res.dmg}
              </span>
            )}
          </div>
          <p class="ss-why">
            <b>{r.term.word}</b>　{r.term.mean}
          </p>
          {!a.ok && (
            <p class="ss-why ss-ww">
              えらんだのは「{termOf(a.pick).word}」。{termOf(a.pick).mean}
            </p>
          )}
          {!a.ok && r.term.vs?.id === a.pick && <p class="ss-why ss-ww">見分けかた：{r.term.vs.tell}</p>}
        </div>
      )}
      {!a && <p class="ls-hint">{pk.code} の ことば · 数字キーでも えらべます</p>}
    </>
  );
}

function Result({ p, date, right, checks, answers, xp, dmg, out, cut, first, before, onClose }: { p: Plan; date: string; right: number; checks: number; answers: Record<number, Answered>; xp: number; dmg: number; out: Outcome | null; cut?: Task; first: boolean; before: number; onClose: () => void }) {
  const { pk, topic } = p;
  const review = p.lesson === null;
  const g = state.p.game;
  const up = levelFromTotal(before).lv < g.lv;
  const boss = state.p.boss.cur;
  const sp = state.p.study[pk.id] ?? BLANK;
  const nextL = nextLesson(pk, sp);
  const qs = topic ? pk.questions.filter((q) => q.topicId === topic.id).length : 0;
  const marks = p.cards.map((c, i) => (c.k === 'check' ? (answers[i]?.ok ? 'ok' : 'ng') : null)).filter(Boolean) as string[];
  const moved = Object.values(answers).filter((a) => a.res.up).length;
  const word = review ? (right === checks ? '全部、思い出せた' : right / Math.max(1, checks) >= 0.6 ? 'よく 思い出せた' : 'また あした') : first ? '読んだ' : 'もう一度 読んだ';
  return (
    <div class="ss-res">
      <div class="ss-resh">
        {checks > 0 && (
          <>
            <b class="z-min z-num ss-resn">
              {right}
              <small>/ {checks}</small>
            </b>
            <span class="ss-ress" aria-hidden="true">
              {marks.map((m, i) => (
                <i key={i} class={m} style={{ '--j': i }} />
              ))}
            </span>
          </>
        )}
        <span class="ss-resw z-min">{word}</span>
      </div>
      <div class="ss-resl">
        <div class="ss-rr">
          <span class="ss-rrl">ことば</span>
          <span class="ss-rrt">
            {review
              ? `${moved}語が 次の箱へ。${checks - right > 0 ? `${checks - right}語は あした もう一度。` : ''}`
              : `${p.words.length}語を 復習に 入れた。最初の復習は ${md(addDays(date, 1))}。`}
          </span>
        </div>
        <div class="ss-rr">
          <span class="ss-rrl">経験値</span>
          <span class="ss-rrv z-num">
            <b>+{xp}</b>
            <small>
              Lv.{g.lv} {title(g.lv)} · {g.xp} / {need(g.lv)}
            </small>
            {up && <span class="z-tag z-tag-r ss-up">レベルアップ</span>}
          </span>
        </div>
        {out?.on && cut && (
          <div class="ss-rr">
            <span class="ss-rrl">やること</span>
            <span class="ss-rrt">
              「{cut.title}」を 斬った{out.three ? ' · 今日の三つ +30' : ''}
            </span>
          </div>
        )}
        {dmg > 0 && boss && (
          <div class="ss-rr">
            <span class="ss-rrl">今週の敵</span>
            <span class="ss-rrt">
              {boss.name}に −{dmg} · 残り {boss.hp}
            </span>
          </div>
        )}
      </div>
      <div class="ls-resf">
        {topic && qs > 0 && (
          <button type="button" class="z-bk" onClick={() => go(`session/topic/${topic.id}`, true)}>
            この単元の 問題を 3問
            <Arrow />
          </button>
        )}
        {nextL && nextL !== p.lesson && (
          <button type="button" class={topic && qs > 0 ? 'z-bo2' : 'z-bk'} onClick={() => go(`lesson/${nextL}`, true)}>
            次を覚える：{lessonShort(pk, nextL)}
          </button>
        )}
        <button type="button" class="z-txb" onClick={onClose}>
          とじる
        </button>
      </div>
    </div>
  );
}
