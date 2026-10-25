// 覚える: what comes before the questions. The next lesson to read, the words due for review, the big picture of
// the certification with the weight of each chapter, every lesson in learning order, and the list of words.
// Reading here never changes the records: a lesson is read in its own screen, the big picture with its button.
import { useState } from 'preact/hooks';
import type { Pack, StudyProgress, Term } from '../core/types';
import { state } from '../core/store';
import { readGuide } from '../core/actions';
import { BASICS, GUIDE_XP, REVIEW_MAX, dueWords, isLearned, learnedIn, lessonShort, lessonState, lessons, nextLesson, wordCounts, wordState, wordsOf, type LessonState, type WordState } from '../core/learn';
import { activePack } from '../core/pack';
import { newProgress } from '../core/study';
import { buzz, BUZZ, sfx } from '../core/sfx';
import { DOW, dow, md, pad } from '../core/util';
import { openSheet } from '../ui/sheets';
import { back } from '../ui/router';
import { toast } from '../ui/fx';
import { Arrow, ChevL, ChevR, Search } from '../ui/icons';
import { Linked, openTerm } from '../ui/words';

const BLANK = newProgress();
const dl = (d: string) => `${md(d)}（${DOW[dow(d)]}）`;
const full = (d: string) => `${d.slice(0, 4)}.${md(d)}`;
/** A word without what its brackets add, for chips. */
const bare = (t: Term) => t.word.replace(/（.*）$/, '').trim();
/** About how long a lesson takes: a little for the start and the check, the rest for its words. */
const minutes = (n: number) => Math.max(3, Math.round(2 + n * 0.5));
const STATE: Record<LessonState, string> = { new: '未読', read: '読んだ', learned: '覚えた', ready: '斬れる' };

function domainNo(pk: Pack, lesson: string) {
  const t = pk.topics.find((x) => x.id === lesson);
  return t ? pk.domains.findIndex((d) => d.id === t.domainId) + 1 : 0;
}

export function Learn({ args, date }: { args: string[]; date: string }) {
  const pk = activePack();
  if (!pk) {
    return (
      <div class="m-page ln">
        <p class="ln-wait">問題集を 読みこんでいます…</p>
      </div>
    );
  }
  const sp = state.p.study[pk.id] ?? BLANK;
  if (!pk.terms?.length) return <NoWords pk={pk} />;
  if (args[0] === 'guide') return <Guide pk={pk} sp={sp} date={date} />;
  if (args[0] === 'words') return <Words pk={pk} sp={sp} date={date} />;
  return <Home pk={pk} sp={sp} date={date} />;
}

function CertTag({ pk }: { pk: Pack }) {
  return (
    <button
      type="button"
      class="ln-cert"
      onClick={() => openSheet({ kind: 'cert' })}
      aria-label={`いまの資格は ${pk.code}。切りかえる・足す`}
    >
      <span class="z-tag z-tag-w z-tagx">{pk.code}</span>
      <span class="ln-cs">切りかえ</span>
    </button>
  );
}

function NoWords({ pk }: { pk: Pack }) {
  return (
    <div class="m-page ln">
      <header class="ln-top">
        <div class="ln-tr">
          <b class="z-min ln-title">覚える</b>
          <CertTag pk={pk} />
        </div>
        <span class="m-sub">{pk.code} には、まだ 覚える ことばが ありません。</span>
      </header>
      <div class="ln-empty">
        <p>この資格の 問題集には、ことばと 全体像が まだ 入っていません。問題から はじめられます。</p>
        <a class="z-bo" href="#/session/kakera">
          朝の欠片を 解く
        </a>
      </div>
    </div>
  );
}

function Home({ pk, sp, date }: { pk: Pack; sp: StudyProgress; date: string }) {
  const L = learnedIn(sp);
  const ls = lessons(pk);
  const states = ls.map((l) => lessonState(pk, sp, l));
  const done = states.filter((s) => s !== 'new').length;
  const nx = nextLesson(pk, sp);
  const wc = wordCounts(pk, sp);
  const due = dueWords(pk, sp, date);
  // a person who has read nothing starts from the big picture
  const guideFirst = !!pk.guide && !L.guide && done === 0;

  return (
    <div class="m-page ln">
      <div class="ln-a">
        <header class="ln-top">
          <div class="ln-tr">
            <b class="z-min ln-title">覚える</b>
            <CertTag pk={pk} />
          </div>
          <span class="m-sub">{done || wc.learned ? `ことば ${wc.all}語のうち ${wc.learned}語を 覚えた · 単元 ${done} / ${ls.length}` : `ことば ${wc.all}語 · 単元 ${ls.length}。全体像から 一つずつ`}</span>
        </header>

        <div class="ln-strip" role="img" aria-label={`単元 ${ls.length}のうち、読んだ ${done}`}>
          {states.map((s, i) => (
            <i key={ls[i]} class={`${s}${ls[i] === nx && !guideFirst ? ' nx' : ''}`} />
          ))}
        </div>

        {guideFirst ? <GuideHero pk={pk} /> : nx ? <LessonHero pk={pk} lesson={nx} n={ls.indexOf(nx) + 1} /> : <DoneHero />}
        {guideFirst && nx && (
          <a class="ln-skip" href={`#/lesson/${nx}`}>
            全体像は あとにして、{lessonShort(pk, nx)}から はじめる
            <Arrow size={11} />
          </a>
        )}

        <Review pk={pk} sp={sp} date={date} due={due} />
        {!guideFirst && pk.guide && <GuideCard pk={pk} read={L.guide} />}
      </div>

      <div class="ln-b">
        <div class="z-sec ln-sec">
          <b>覚える順</b>
          <i />
          <span class="ln-key" aria-hidden="true">
            <i class="read" />
            読んだ
            <i class="learned" />
            覚えた
            <i class="ready" />
            斬れる
          </span>
        </div>
        <ol class="ln-path">
          {ls.map((l, i) => {
            const st = states[i];
            const ws = wordsOf(pk, l);
            const got = ws.filter((w) => isLearned(L.words[w.id])).length;
            const dn = domainNo(pk, l);
            const isNext = l === nx;
            return (
              <li key={l}>
                <a class={`ln-pr ${st}${isNext ? ' nx' : ''}`} href={`#/lesson/${l}`} aria-label={`${i + 1}. ${lessonShort(pk, l)}、${isNext ? '次に覚える' : STATE[st]}。ことば ${ws.length}語のうち ${got}語を 覚えた`}>
                  <i class="ln-prn z-min z-num">{pad(i + 1)}</i>
                  <span class="ln-prt">
                    <b>{lessonShort(pk, l)}</b>
                    <span>
                      {dn ? `第${dn}章` : '土台'} · ことば {got > 0 ? `${got} / ${ws.length}` : `${ws.length}語`}
                    </span>
                  </span>
                  {isNext ? <span class="z-tag z-tag-r ln-prs">次</span> : <span class={`ln-prs ${st}`}>{STATE[st]}</span>}
                </a>
              </li>
            );
          })}
        </ol>
        <a class="ln-wl" href="#/learn/words">
          <span class="ln-wlt">
            <b>用語集</b>
            <span>
              {wc.all}語 · 覚えた {wc.learned}語 · 探す・見なおす
            </span>
          </span>
          <ChevR size={14} />
        </a>
      </div>
    </div>
  );
}

function LessonHero({ pk, lesson, n }: { pk: Pack; lesson: string; n: number }) {
  const t = pk.topics.find((x) => x.id === lesson);
  const ws = wordsOf(pk, lesson);
  const dn = domainNo(pk, lesson);
  const d = dn ? pk.domains[dn - 1] : undefined;
  const shown = ws.slice(0, 5);
  return (
    <a class="ln-hero" href={`#/lesson/${lesson}`}>
      <span class="ln-hn z-min z-num" aria-hidden="true">
        {pad(n)}
      </span>
      <span class="ln-hl">次に 覚える</span>
      <b class="z-min ln-ht">{lessonShort(pk, lesson)}</b>
      {d ? (
        <span class="ln-hd">
          第{dn}章 {d.name} · 試験の {d.weightMin}–{d.weightMax}%
        </span>
      ) : (
        <span class="ln-hd">この先で 何度も出てくる、土台の ことば</span>
      )}
      <p class="ln-hp">{t ? t.overview : 'まずは ここから。AI のアプリを作るときの 基本の ことばを、一つずつ 覚えます。'}</p>
      <span class="ln-hw" aria-label={`ことば：${ws.map(bare).join('、')}`}>
        {shown.map((w) => (
          <i key={w.id}>{bare(w)}</i>
        ))}
        {ws.length > shown.length && <em>ほか {ws.length - shown.length}語</em>}
      </span>
      <span class="ln-hf">
        <span class="ln-hm">
          ことば {ws.length}語 · 約{minutes(ws.length)}分
        </span>
        <span class="z-bw ln-go">
          読む
          <Arrow />
        </span>
      </span>
    </a>
  );
}

function GuideHero({ pk }: { pk: Pack }) {
  const g = pk.guide!;
  return (
    <a class="ln-hero gd" href="#/learn/guide">
      <span class="ln-hn z-min" aria-hidden="true">
        序
      </span>
      <span class="ln-hl">まず ここから</span>
      <b class="z-min ln-ht">{pk.code} の 全体像</b>
      <span class="ln-hd">どんな資格か · だれ向けか · 試験の重さ</span>
      <p class="ln-hp">{g.what}</p>
      <Weights pk={pk} />
      <span class="ln-hf">
        <span class="ln-hm">約3分 · 読むと +{GUIDE_XP}</span>
        <span class="z-bw ln-go">
          読む
          <Arrow />
        </span>
      </span>
    </a>
  );
}

function DoneHero() {
  return (
    <div class="ln-hero dn">
      <span class="ln-hn z-min" aria-hidden="true">
        了
      </span>
      <span class="ln-hl">単元は 全部 読んだ</span>
      <b class="z-min ln-ht">あとは 問題で 斬る</b>
      <p class="ln-hp">ことばは 復習で 定着させます。忘れかけた 単元は、いつでも 読みなおせます。</p>
      <span class="ln-hf">
        <span class="ln-hm">問題は 読んだ範囲から 出ます</span>
        <a class="z-bw ln-go" href="#/session/kakera">
          朝の欠片を 解く
          <Arrow />
        </a>
      </span>
    </div>
  );
}

/** The chapters as one bar, each as wide as its share of the exam; the heaviest in red. */
function Weights({ pk }: { pk: Pack }) {
  const mid = (d: Pack['domains'][number]) => (d.weightMin + d.weightMax) / 2;
  const top = Math.max(...pk.domains.map(mid));
  return (
    <span class="ln-wt" role="img" aria-label={`試験の重さ：${pk.domains.map((d, i) => `第${i + 1}章 ${d.weightMin}から${d.weightMax}%`).join('、')}`}>
      {pk.domains.map((d, i) => (
        <span key={d.id} class={mid(d) === top ? 'top' : undefined} style={{ flexGrow: mid(d) }}>
          <i />
          <small class="z-num">
            {i + 1}
            <b>
              {d.weightMin}–{d.weightMax}%
            </b>
          </small>
        </span>
      ))}
    </span>
  );
}

function Review({ pk, sp, date, due }: { pk: Pack; sp: StudyProgress; date: string; due: Term[] }) {
  if (due.length) {
    const n = Math.min(due.length, REVIEW_MAX);
    return (
      <a class="ln-rv" href="#/lesson/review">
        <span class="ln-rvn">
          <b class="z-min z-num">{n}</b>
          <small>語</small>
        </span>
        <span class="ln-rvt">
          <b>ことばの復習</b>
          <span>{due.length > REVIEW_MAX ? `今日の ${due.length}語から ${REVIEW_MAX}語ずつ。思い出せたら、間を あけて また出ます` : '今日が 復習の日。思い出せたら、間を あけて また出ます'}</span>
        </span>
        <ChevR size={14} />
      </a>
    );
  }
  const L = learnedIn(sp);
  const later = (pk.terms ?? []).map((t) => L.words[t.id]?.due).filter((d): d is string => !!d && d > date);
  if (!later.length) return null;
  const first = later.sort()[0];
  const count = later.filter((d) => d === first).length;
  return (
    <div class="ln-rv off">
      <span class="ln-rvt">
        <b>ことばの復習</b>
        <span>
          次は {dl(first)} · {count}語。今日の分は ありません
        </span>
      </span>
    </div>
  );
}

function GuideCard({ pk, read }: { pk: Pack; read?: string }) {
  const heavy = [...pk.domains].sort((a, b) => b.weightMax + b.weightMin - (a.weightMax + a.weightMin))[0];
  const n = pk.domains.indexOf(heavy) + 1;
  return (
    <a class="ln-gd" href="#/learn/guide">
      <span class="ln-gdh">
        <span class="ln-gdl">全体像</span>
        {read ? <span class="z-tag z-tag-g">読んだ</span> : <span class="z-tag z-tag-r">まだ</span>}
        <ChevR size={13} />
      </span>
      <b class="ln-gdt">{pk.code} は どんな資格か、どこが 重いか</b>
      <Weights pk={pk} />
      <span class="ln-gds">
        いちばん重いのは 第{n}章。試験の {heavy.weightMin}–{heavy.weightMax}%
      </span>
    </a>
  );
}

function Bar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header class="m-bar z-grain">
      <button type="button" class="st-back" onClick={onBack}>
        <ChevL />
        もどる
      </button>
      <span class="m-bar-t">{title}</span>
    </header>
  );
}

function Guide({ pk, sp, date }: { pk: Pack; sp: StudyProgress; date: string }) {
  const g = pk.guide;
  const [read, setRead] = useState(() => learnedIn(sp).guide);
  if (!g) return <NoWords pk={pk} />;
  const ls = lessons(pk);
  const nx = nextLesson(pk, sp);
  const top = Math.max(...pk.domains.map((d) => d.weightMax));
  const scale = Math.ceil(top / 10) * 10;
  const mark = () => {
    const xp = readGuide(pk, date);
    setRead(date);
    sfx('reward');
    buzz(BUZZ.soft);
    toast(xp ? `全体像を 読んだ。経験値 +${xp}` : '全体像は もう 読んであります');
  };

  return (
    <div class="m-page bare lg">
      <Bar title="全体像" onBack={() => back('learn')} />
      <div class="lg-in">
        <div class="lg-top">
          <span class="lg-k">{[pk.vendor, '資格'].filter(Boolean).join(' の ')}</span>
          <b class="z-min lg-code">{pk.code}</b>
          <span class="lg-name">{pk.name}</span>
          {pk.examTitle && <span class="lg-en">試験：{pk.examTitle}</span>}
        </div>
        <p class="lg-lead">
          <Linked pk={pk} text={g.what} />
        </p>

        <div class="z-sec lg-sec">
          <b>だれ向け</b>
          <i />
        </div>
        <p class="lg-p">
          <Linked pk={pk} text={g.who} />
        </p>
        <div class="z-sec lg-sec">
          <b>なぜ 大事か</b>
          <i />
        </div>
        <p class="lg-p">
          <Linked pk={pk} text={g.why} />
        </p>

        <div class="z-sec lg-sec">
          <b>試験の 重さ</b>
          <i />
          <span>出題の 割合</span>
        </div>
        <div class="lg-wts">
          {pk.domains.map((d, i) => {
            const story = g.map.find((m) => m.domainId === d.id)?.story;
            const mine = ls.filter((l) => pk.topics.find((t) => t.id === l)?.domainId === d.id);
            const heavy = d.weightMax === top;
            return (
              <div key={d.id} class={`lg-wt${heavy ? ' top' : ''}`}>
                <div class="lg-wh">
                  <i class="z-min">{i + 1}</i>
                  <b>{d.name}</b>
                  <span class="z-min z-num">
                    {d.weightMin}–{d.weightMax}
                    <small>%</small>
                  </span>
                </div>
                <span class="lg-bar" aria-hidden="true">
                  <i style={{ width: `${(d.weightMin / scale) * 100}%` }} />
                  <em style={{ left: `${(d.weightMin / scale) * 100}%`, width: `${((d.weightMax - d.weightMin) / scale) * 100}%` }} />
                </span>
                {d.en && <span class="lg-den">{d.en}</span>}
                {story && (
                  <p class="lg-st">
                    <Linked pk={pk} text={story} />
                  </p>
                )}
                {mine.length > 0 && (
                  <span class="lg-ts">
                    {mine.map((l) => (
                      <a key={l} href={`#/lesson/${l}`} class={`lg-t ${lessonState(pk, sp, l)}`}>
                        {lessonShort(pk, l)}
                      </a>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
          <span class="lg-scale z-num" aria-hidden="true">
            <span>0</span>
            <span>{scale / 2}%</span>
            <span>{scale}%</span>
          </span>
        </div>

        <div class="z-sec lg-sec">
          <b>試験の こと</b>
          <i />
        </div>
        <div class="lg-facts">
          {pk.durationMin && (
            <div>
              <span>
                <b class="z-min z-num">{pk.durationMin}</b>
                <small>分</small>
              </span>
              <i>試験時間</i>
            </div>
          )}
          <div>
            <span>
              <b class="z-min z-num">{pk.passingScore}</b>
              <small>/ {pk.scoreMax}</small>
            </span>
            <i>合格点</i>
          </div>
          {pk.examLanguage && (
            <div>
              <span class="lg-fl">{pk.examLanguage}</span>
              <i>言語</i>
            </div>
          )}
        </div>
        <ul class="lg-ex">
          {g.exam.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        {pk.sourceUrl && (
          <p class="lg-src">
            出典：
            <a href={pk.sourceUrl} target="_blank" rel="noopener noreferrer">
              {pk.vendor ?? '公式'} の 学習ガイド
            </a>
            {pk.skillsAsOf ? `（試験範囲は ${full(pk.skillsAsOf)} 時点）` : ''}
            {pk.verifiedAt ? `。${full(pk.verifiedAt)} に 確かめた内容です` : ''}。
          </p>
        )}

        <div class="lg-foot">
          {read ? (
            <span class="lg-done">
              <i />
              {dl(read)} に 読んだ
            </span>
          ) : (
            <button type="button" class="z-bw" onClick={mark}>
              読んだ
              <small class="lg-xp">+{GUIDE_XP}</small>
            </button>
          )}
          {nx && (
            <a class={read ? 'z-bw' : 'z-bo'} href={`#/lesson/${nx}`}>
              {nx === BASICS ? 'ことばを 覚えはじめる' : `次に覚える：${lessonShort(pk, nx)}`}
              <Arrow />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

type Filter = 'all' | 'new' | 'learning' | 'learned';
const FILTERS: { f: Filter; label: string }[] = [
  { f: 'all', label: 'すべて' },
  { f: 'new', label: 'まだ' },
  { f: 'learning', label: '覚えかけ' },
  { f: 'learned', label: '覚えた' },
];
const norm = (s: string) => s.normalize('NFKC').toLowerCase();
const inFilter = (f: Filter, s: WordState) => f === 'all' || (f === 'learned' ? s === 'learned' || s === 'settled' : s === f);

function Words({ pk, sp, date }: { pk: Pack; sp: StudyProgress; date: string }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const L = learnedIn(sp);
  const key = norm(q.trim());
  const hit = (t: Term) => !key || [t.word, t.read, t.mean, ...(t.alias ?? [])].some((x) => !!x && norm(x).includes(key));
  const groups = lessons(pk)
    .map((l) => ({ l, ws: wordsOf(pk, l).filter((t) => hit(t) && inFilter(f, wordState(L.words[t.id]))) }))
    .filter((g) => g.ws.length);
  const count = (x: Filter) => (pk.terms ?? []).filter((t) => hit(t) && inFilter(x, wordState(L.words[t.id]))).length;
  const wc = wordCounts(pk, sp);

  return (
    <div class="m-page bare lwp">
      <Bar title="用語集" onBack={() => back('learn')} />
      <div class="lwp-top">
        <b class="z-min lwp-title">用語集</b>
        <span class="m-sub">
          {pk.code} の ことば {wc.all}語 · 覚えた {wc.learned}語 · タップで 意味
        </span>
      </div>
      <div class="lwp-tools">
        <label class="lwp-q">
          <Search size={15} />
          <input type="search" value={q} placeholder="ことば・意味で 探す" aria-label="用語集を 探す" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </label>
        <div class="z-seg lwp-f" role="radiogroup" aria-label="覚えぐあい">
          {FILTERS.map((x) => (
            <button
              key={x.f}
              type="button"
              role="radio"
              aria-checked={f === x.f}
              class={`z-sg sm${f === x.f ? ' on' : ''}`}
              onClick={() => {
                sfx('tock');
                setF(x.f);
              }}
            >
              {x.label}
              <small class="z-num">{count(x.f)}</small>
            </button>
          ))}
        </div>
      </div>
      <div class="lwp-gs">
        {groups.map((g) => (
          <section key={g.l} class="lwp-g">
            <div class="z-sec lwp-sec">
              <b>{lessonShort(pk, g.l)}</b>
              <i />
              <a href={`#/lesson/${g.l}`}>
                単元
                <ChevR size={10} />
              </a>
            </div>
            <ul class="lwp-list">
              {g.ws.map((t) => {
                const c = L.words[t.id];
                const s = wordState(c);
                return (
                  <li key={t.id}>
                    <button type="button" class={`lwp-row ${s}`} onClick={() => openTerm(pk, t.id)}>
                      <span class="lwp-tx">
                        <b>{t.word}</b>
                        <span>{t.mean}</span>
                      </span>
                      <span class="lwp-st" aria-label={c && c.due <= date && c.seen ? '今日 復習' : undefined}>
                        <span class="lwp-pips" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map((b) => (
                            <i key={b} class={c && c.box >= b ? 'on' : undefined} />
                          ))}
                        </span>
                        {c && c.due <= date && (c.seen > 0 || c.box > 0) && <em>今日</em>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p class="lwp-none">{key ? `「${q.trim()}」は 見つかりませんでした。` : 'ここに入る ことばは、まだ ありません。'}</p>}
      </div>
    </div>
  );
}
