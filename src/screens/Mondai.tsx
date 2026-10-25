// 問題集: every question of the certification, any time and nothing locked. The whole bank as one map, the mock
// exam, all of it, the ones not asked yet, the ones missed, and each chapter and unit whole. Answers here count
// like any other (cards, streak, experience, damage to the shadow); only the choice of questions is the person's.
import type { Pack, Question, StudyProgress } from '../core/types';
import { state } from '../core/store';
import { activePack } from '../core/pack';
import { topicShort } from '../core/enemy';
import { domainQuestions, newProgress, qStates, type QState } from '../core/study';
import { md, pad } from '../core/util';
import { openSheet } from '../ui/sheets';
import { Arrow, ChevR } from '../ui/icons';
import { EXAM_FULL, examMinutes, loadSitting, timeLeft } from '../core/exam';

const BLANK = newProgress();

export function Mondai() {
  const pk = activePack();
  if (!pk) {
    return (
      <div class="m-page ln">
        <p class="ln-wait">問題集を 読みこんでいます…</p>
      </div>
    );
  }
  return <Bank pk={pk} sp={state.p.study[pk.id] ?? BLANK} />;
}

/** 覚える and 問題集 share one place in the navigation: the two titles switch between them. */
export function StudyTabs({ on, pk }: { on: 'learn' | 'mondai'; pk: Pack }) {
  return (
    <div class="ln-tr">
      <nav class="ln-tabs" aria-label="覚える・問題集">
        <a href="#/learn" class={`z-min${on === 'learn' ? ' on' : ''}`} aria-current={on === 'learn' ? 'page' : undefined}>
          覚える
        </a>
        <a href="#/mondai" class={`z-min${on === 'mondai' ? ' on' : ''}`} aria-current={on === 'mondai' ? 'page' : undefined}>
          問題集
        </a>
      </nav>
      <button type="button" class="ln-cert" onClick={() => openSheet({ kind: 'cert' })} aria-label={`いまの資格は ${pk.code}。切りかえる・足す`}>
        <span class="z-tag z-tag-w z-tagx">{pk.code}</span>
        <span class="ln-cs">切りかえ</span>
      </button>
    </div>
  );
}

const count = (qs: Question[], st: Map<string, QState>, s: QState) => qs.filter((q) => st.get(q.id) === s).length;

/** One slanted cell per question: not asked, right, missed. */
function Cells({ qs, st, cls = '' }: { qs: Question[]; st: Map<string, QState>; cls?: string }) {
  return (
    <span class={`mn-cells ${cls}`} aria-hidden="true">
      {qs.map((q) => (
        <i key={q.id} class={st.get(q.id)} />
      ))}
    </span>
  );
}

function Bank({ pk, sp }: { pk: Pack; sp: StudyProgress }) {
  const st = qStates(pk, sp);
  const all = pk.questions;
  const fresh = count(all, st, 'new');
  const miss = count(all, st, 'ng');
  const right = count(all, st, 'ok');
  const done = all.length - fresh;

  return (
    <div class="m-page ln mn">
      <div class="ln-a">
        <header class="ln-top">
          <StudyTabs on="mondai" pk={pk} />
          <span class="m-sub">
            {all.length}問 · 解いた {done} · 正解 {right}
            {miss ? ` · まちがい ${miss}` : ''}
          </span>
        </header>

        <a class="mn-map" href="#/session/all" aria-label={`全${all.length}問の 地図。まだ ${fresh}、正解 ${right}、まちがい ${miss}。全問を 解く`}>
          {pk.domains.map((d) => (
            <Cells key={d.id} qs={domainQuestions(pk, d.id)} st={st} />
          ))}
        </a>
        <span class="mn-key" aria-hidden="true">
          <i class="new" />
          まだ
          <i class="ok" />
          正解
          <i class="ng" />
          まちがい
        </span>

        <MockCard pk={pk} sp={sp} />

        <div class="mn-modes">
          <a class="mn-md" href="#/session/all">
            <b class="z-min z-num">{all.length}</b>
            <span>全問</span>
            <small>{fresh ? `まだの ${fresh}問から` : '弱い順に'}</small>
          </a>
          {fresh > 0 ? (
            <a class="mn-md" href="#/session/fresh">
              <b class="z-min z-num">{fresh}</b>
              <span>まだの問題</span>
              <small>本の順に</small>
            </a>
          ) : (
            <span class="mn-md off">
              <b class="z-min z-num">0</b>
              <span>まだの問題</span>
              <small>全部 解いた</small>
            </span>
          )}
          {miss > 0 ? (
            <a class="mn-md red" href="#/session/miss">
              <b class="z-min z-num">{miss}</b>
              <span>まちがいだけ</span>
              <small>迷った問題も</small>
            </a>
          ) : (
            <span class="mn-md off">
              <b class="z-min z-num">0</b>
              <span>まちがいだけ</span>
              <small>{done ? 'いまは なし' : '解くと たまる'}</small>
            </span>
          )}
        </div>
      </div>

      <div class="ln-b">
        <div class="z-sec ln-sec">
          <b>章と 単元</b>
          <i />
          <span>まるごと 解く</span>
        </div>
        {pk.domains.map((d, n) => {
          const dq = domainQuestions(pk, d.id);
          const topics = pk.topics.filter((t) => t.domainId === d.id);
          return (
            <section key={d.id} class="mn-ch">
              <a class="mn-chh" href={`#/session/domain/${d.id}/all`} aria-label={`第${n + 1}章 ${d.name}、${dq.length}問。正解 ${count(dq, st, 'ok')}。まるごと 解く`}>
                <i class="mn-chn z-min z-num">{pad(n + 1)}</i>
                <span class="mn-cht">
                  <b>{d.name}</b>
                  <span>
                    {dq.length}問 · 試験の {d.weightMin}–{d.weightMax}%
                  </span>
                </span>
                <span class="mn-chs z-num">
                  {count(dq, st, 'ok')}
                  <small>/{dq.length}</small>
                </span>
                <ChevR size={14} />
              </a>
              <ul class="mn-units">
                {topics.map((t) => {
                  const tq = all.filter((q) => q.topicId === t.id);
                  if (!tq.length) return null;
                  return (
                    <li key={t.id}>
                      <a class="mn-un" href={`#/session/topic/${t.id}/all`} aria-label={`${topicShort(t)}、${tq.length}問。正解 ${count(tq, st, 'ok')}。まるごと 解く`}>
                        <span class="mn-unt">{topicShort(t)}</span>
                        <Cells qs={tq} st={st} cls="sm" />
                        <span class="mn-uns z-num">
                          {count(tq, st, 'ok')}/{tq.length}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** The mock exam as the real one: its length, time and pass line, the last score, or the sitting still running. */
function MockCard({ pk, sp }: { pk: Pack; sp: StudyProgress }) {
  const n = Math.min(EXAM_FULL, pk.questions.length);
  const runs = sp.mocks || [];
  const last = runs[runs.length - 1];
  const sit = loadSitting();
  const live = sit && sit.certId === pk.id && timeLeft(sit) > 0 ? sit : null;
  return (
    <a class="mn-mock" href="#/exam">
      <span class="ln-hn z-min" aria-hidden="true">
        試
      </span>
      <span class="ln-hl">模試 · 本番形式</span>
      <b class="z-min ln-ht">
        {n}問 · {examMinutes(pk, n)}分
      </b>
      <span class="ln-hd">
        合格 {pk.passingScore} / {pk.scoreMax} · 解説は 終わってから
      </span>
      {last && (
        <span class="mn-last">
          <span>前回 {md(last.d)}</span>
          <b class="z-min z-num">{last.score}</b>
          <span class={last.pass ? 'ok' : undefined}>{last.pass ? '合格ライン' : `あと ${pk.passingScore - last.score}`}</span>
        </span>
      )}
      <span class="mn-mgo">
        <span class="z-bw">
          {live ? `つづける · 残り ${Math.ceil(timeLeft(live) / 60000)}分` : '受ける'}
          <Arrow />
        </span>
      </span>
    </a>
  );
}
