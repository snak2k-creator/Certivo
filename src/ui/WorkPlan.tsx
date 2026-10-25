// AI の段取り for the work notebook. Nothing is sent until the person checks what goes; the answer comes back
// as a draft, and only the steps they pick become tasks.
import { useState } from 'preact/hooks';
import type { PlanStep } from '../core/ai';
import { aiBlocked, askAi } from '../core/ai';
import { addTask, logWorkSend, today } from '../core/actions';
import { emit, state } from '../core/store';
import { doneOn, tasksFor } from '../core/tasks';
import { sfx } from '../core/sfx';
import { md } from '../core/util';
import { nextWorkday } from './derive';
import { added, toast } from './fx';
import { closeSheet, openSheet } from './sheets';

export const plan = {
  draft: null as null | { date: string; steps: PlanStep[]; note: string; picked: boolean[] },
  busy: false,
};

export const BLOCKED: Record<string, string> = {
  off: 'AI は、いま この アプリで 使えません',
  offline: 'オフラインのため、AI は 使えません',
  signin: 'AI を使うには、Google で ログインしてください',
  cap: '今月の AI の回数を 使い切りました',
};

/** The work tasks that could go: tomorrow's (the next working day's) and today's open ones. */
export function planCandidates(date = today()) {
  const target = nextWorkday(date);
  const seen = new Set<string>();
  const out = [] as typeof state.w.tasks;
  for (const t of [...tasksFor(state.w.tasks, target, date).filter((x) => !doneOn(x, target)), ...tasksFor(state.w.tasks, date, date).filter((x) => !doneOn(x, date))]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return { target, items: out };
}

export function PlanCard() {
  const d = plan.draft;
  if (d) {
    const n = d.picked.filter(Boolean).length;
    const take = () => {
      let count = 0;
      d.steps.forEach((s, i) => {
        if (!d.picked[i]) return;
        const t = addTask('w', s.title, { title: s.title, date: d.date, time: s.time || undefined, mins: s.mins || undefined, from: 'ai' }, d.date);
        if (t) {
          added(t.id);
          count++;
        }
      });
      plan.draft = null;
      sfx('write');
      toast(`${md(d.date)}に ${count}件 入れました`);
    };
    return (
      <section class="wp-card wp-draft" aria-label="AI の段取りの下書き">
        <div class="wp-h">
          <span class="z-tag z-tag-w">下書き</span>
          <b>{md(d.date)} の段取り</b>
          <span>AI の案</span>
        </div>
        <ul class="wp-steps">
          {d.steps.map((s, i) => (
            <li key={i}>
              <label>
                <input
                  type="checkbox"
                  checked={d.picked[i]}
                  onChange={(e) => {
                    d.picked[i] = e.currentTarget.checked;
                    emit();
                  }}
                />
                <span class="wp-ck" aria-hidden="true" />
                <b class="z-min z-num">{s.time || '—'}</b>
                <span>{s.title}</span>
                {s.mins ? <i>{s.mins}分</i> : null}
              </label>
            </li>
          ))}
        </ul>
        {d.note && <p class="wp-note">{d.note}</p>}
        <p class="wp-fine">入れるまで、手帳は 変わりません。</p>
        <div class="wp-acts">
          <button type="button" class="z-bw" disabled={!n} onClick={take}>
            えらんだ {n}件を 入れる
          </button>
          <button
            type="button"
            class="z-txb"
            onClick={() => {
              plan.draft = null;
              emit();
            }}
          >
            すてる
          </button>
        </div>
      </section>
    );
  }
  const why = aiBlocked();
  return (
    <section class="wp-card" aria-label="AI の段取り">
      <div class="wp-tx">
        <span class="wp-l">AI の段取り</span>
        <b>あしたの段取りを 頼む</b>
        <span>{why ? BLOCKED[why] : '送る前に、中身を 確かめられます'}</span>
      </div>
      <button type="button" class="z-bo" disabled={!!why || plan.busy} onClick={() => openSheet({ kind: 'plan' })}>
        {plan.busy ? '作っています…' : '頼む'}
      </button>
    </section>
  );
}

/** The confirmation sheet: exactly what will be sent, one checkbox per task. */
export function PlanConfirm() {
  const { target, items } = planCandidates();
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((t) => [t.id, true])));
  const chosen = items.filter((t) => picked[t.id]);
  const why = aiBlocked();

  const send = async () => {
    if (!chosen.length || why) return;
    const payload = chosen.map((t) => ({ title: t.title, time: t.time }));
    closeSheet();
    logWorkSend(`段取り：${payload.length}件の題名と時刻`);
    plan.busy = true;
    emit();
    const out = await askAi('plan', { date: target, items: payload });
    plan.busy = false;
    if (out && out.steps.length) {
      plan.draft = { date: target, steps: out.steps, note: out.note, picked: out.steps.map(() => true) };
      sfx('reveal');
      emit();
    } else {
      emit();
      toast('段取りを 作れませんでした。手帳は そのままです');
    }
  };

  return (
    <div class="wp-cf">
      <span class="z-tag z-tag-k">仕事の手帳 → AI</span>
      <b class="z-min wp-cft">送る前に、確かめてください</b>
      <p>
        {md(target)}の段取りを AI に 作ってもらいます。送るのは、チェックした やることの <b>題名と 時刻</b>だけです。
      </p>
      <p class="wp-sub">メモ・ラベル・済んだ記録は 送りません。題名に 人の名前などが 入っていたら、チェックを外してください。届いた案は 下書きとして置かれ、入れるかどうかは あなたが 決めます。</p>
      <ul class="wp-list">
        {items.map((t) => (
          <li key={t.id}>
            <label class={picked[t.id] ? 'on' : ''}>
              <input type="checkbox" checked={!!picked[t.id]} onChange={(e) => setPicked({ ...picked, [t.id]: e.currentTarget.checked })} />
              <span class="wp-ck" aria-hidden="true" />
              <span class="wp-tt">{t.title}</span>
              <b class="z-num">{t.time || ''}</b>
            </label>
          </li>
        ))}
        {!items.length && <li class="wp-none">{md(target)}と 今日の、まだの やることが ありません。</li>}
      </ul>
      {why && <p class="wp-why">{BLOCKED[why]}</p>}
      <div class="wp-acts">
        <button type="button" class="z-bk" disabled={!chosen.length || !!why} onClick={send}>
          {chosen.length ? `${chosen.length}件の 題名を 送る` : '送るものが ありません'}
        </button>
        <button type="button" class="z-txb" onClick={closeSheet}>
          やめる
        </button>
      </div>
    </div>
  );
}
