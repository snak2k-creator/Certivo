// The words of 覚える wherever they appear: found in a text and made tappable, and the sheet that explains one.
import type { Pack, Term } from '../core/types';
import { state } from '../core/store';
import { BASICS, learnedIn, lessonName, lessonState, wordState } from '../core/learn';
import { packOf } from '../core/pack';
import { md } from '../core/util';
import { sfx } from '../core/sfx';
import { closeSheet, openSheet } from './sheets';
import { go } from './router';
import { Arrow } from './icons';

/** The spellings that find a word in a text: the word, what is in its brackets, and its other spellings. */
export function keysOf(t: Term): string[] {
  if (t.alias && !t.alias.length) return [];
  const m = t.word.match(/^(.*?)（(.*)）$/);
  const base = m ? [m[1].trim(), m[2].trim()] : [t.word];
  return [...new Set([...base, ...(t.alias ?? [])])].filter((k) => k.length >= 2);
}

const ASCII = /[A-Za-z0-9_]/;
const matchers = new WeakMap<Pack, [string, string][]>();
/** Every key of every word, the longest first, so 「Foundry Agent Service」 wins over 「Foundry」. */
function keyList(pk: Pack) {
  let m = matchers.get(pk);
  if (!m) {
    m = (pk.terms ?? []).flatMap((t) => keysOf(t).map((k) => [k, t.id] as [string, string])).sort((a, b) => b[0].length - a[0].length);
    matchers.set(pk, m);
  }
  return m;
}

export type Piece = string | { text: string; id: string };

/** Splits a text into plain parts and words to tap. Each word is marked once; `skip` is never marked. */
export function pieces(pk: Pack | undefined, text: string, skip: string[] = []): Piece[] {
  if (!pk?.terms?.length || !text) return [text];
  const keys = keyList(pk);
  const used = new Set(skip);
  const out: Piece[] = [];
  let plain = '';
  for (let i = 0; i < text.length; ) {
    let hit: [string, string] | undefined;
    for (const k of keys) {
      if (used.has(k[1]) || !text.startsWith(k[0], i)) continue;
      const before = text[i - 1] ?? '';
      const after = text[i + k[0].length] ?? '';
      if ((ASCII.test(k[0][0]) && ASCII.test(before)) || (ASCII.test(k[0][k[0].length - 1]) && ASCII.test(after))) continue;
      hit = k;
      break;
    }
    if (!hit) {
      plain += text[i++];
      continue;
    }
    if (plain) out.push(plain);
    plain = '';
    out.push({ text: hit[0], id: hit[1] });
    used.add(hit[1]);
    i += hit[0].length;
  }
  if (plain) out.push(plain);
  return out;
}

/** The words found in a text, in the order they appear. */
export function termsIn(pk: Pack | undefined, text: string, n = 4): Term[] {
  if (!pk) return [];
  return pieces(pk, text)
    .filter((p): p is { text: string; id: string } => typeof p !== 'string')
    .slice(0, n)
    .map((p) => pk.terms!.find((t) => t.id === p.id)!);
}

export function openTerm(pk: Pack, id: string) {
  openSheet({ kind: 'term', certId: pk.id, id });
}

/** A text whose words can be tapped to see what they mean. */
export function Linked({ pk, text, skip, class: c }: { pk: Pack | undefined; text: string; skip?: string[]; class?: string }) {
  return (
    <span class={c}>
      {pieces(pk, text, skip).map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <button key={i} type="button" class="lw" onClick={() => openTerm(pk!, p.id)}>
            {p.text}
          </button>
        ),
      )}
    </span>
  );
}

const STATE_TEXT = { new: 'まだ', learning: '覚えかけ', learned: '覚えた', settled: '定着' } as const;

/** A word's place in review, as the person reads it. */
export function wordLine(pk: Pack, t: Term, today: string) {
  const sp = state.p.study[pk.id];
  const c = learnedIn(sp).words[t.id];
  const st = wordState(c);
  if (!c) {
    const lesson = t.topicId ?? BASICS;
    return { st, text: sp && lessonState(pk, sp, lesson) !== 'new' ? 'まだ 確かめていない' : '単元を読むと、復習が はじまる' };
  }
  if (c.due <= today) return { st, text: `${STATE_TEXT[st]} · 今日 復習する` };
  return { st, text: `${STATE_TEXT[st]} · 次の復習 ${md(c.due)}` };
}

/** The sheet for one word: what it means, more, an example, the word it is mixed up with, and its lesson. */
export function TermSheet({ certId, id, today }: { certId: string; id: string; today: string }) {
  const pk = packOf(certId);
  const t = pk?.terms?.find((x) => x.id === id);
  if (!pk || !t) return <p class="tf-hint">この ことばは、いまの問題集に ありません。</p>;
  const twin = t.vs ? pk.terms!.find((x) => x.id === t.vs!.id) : undefined;
  const lesson = t.topicId ?? BASICS;
  const line = wordLine(pk, t, today);
  return (
    <div class="tm">
      <b class="z-min tm-w">{t.word}</b>
      {t.read && <span class="tm-rd">{t.read}</span>}
      <p class="tm-mean">{t.mean}</p>
      {t.more && <Linked pk={pk} text={t.more} skip={[t.id]} class="tm-more" />}
      {t.ex && (
        <div class="tm-box">
          <span class="tm-l">たとえば</span>
          <Linked pk={pk} text={t.ex} skip={[t.id]} />
        </div>
      )}
      {twin && (
        <button
          type="button"
          class="tm-box tm-vs"
          onClick={() => {
            sfx('flip');
            openTerm(pk, twin.id);
          }}
        >
          <span class="tm-l">まぎらわしい</span>
          <b>{twin.word}</b>
          <span>{t.vs!.tell}</span>
        </button>
      )}
      <div class="tm-foot">
        <span class={`tm-st ${line.st}`}>{line.text}</span>
        <button
          type="button"
          class="z-link tm-go"
          onClick={() => {
            closeSheet();
            go(`lesson/${lesson}`);
          }}
        >
          {lessonName(pk, lesson)}を ひらく
          <Arrow size={11} />
        </button>
      </div>
    </div>
  );
}
