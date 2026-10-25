// The first run: the mark cuts in, ZAN splits on a red band, then a short setup, one question per page:
// which certification, the exam day, where the records live, the nightly page. It ends on a ready card.
import { useEffect, useState } from 'preact/hooks';
import type { RegistryEntry } from '../core/types';
import { state } from '../core/store';
import { ensureDay, setExamDate, setProfile, studyCert } from '../core/actions';
import { cloudConfigured, signIn } from '../core/cloud';
import { loadPack, loadRegistry } from '../core/pack';
import { RECAP_HOUR } from '../core/recap';
import { buzz, sfx } from '../core/sfx';
import { addDays, dayDiff, dowName, md, ymd } from '../core/util';
import { Check, ChevL, Google } from '../ui/icons';
import { ExamDate } from '../ui/ExamDate';
import { toast } from '../ui/fx';
import { go } from '../ui/router';
import { useKey } from '../ui/hooks';

function Mark({ k }: { k: number }) {
  return (
    <svg key={k} class="l-mk wl-mk" viewBox="-10 -10 120 120" aria-hidden="true">
      <g class="l-top">
        <rect x="18" y="18" width="64" height="14" fill="currentColor" />
      </g>
      <g class="l-bot">
        <rect x="18" y="68" width="64" height="14" fill="currentColor" />
      </g>
      <g transform="rotate(-36.3 50 50)">
        <g class="l-bl">
          <g transform="rotate(36.3 50 50)">
            <path d="M67 32H82L33 68H18Z" fill="#D04D3A" />
          </g>
        </g>
      </g>
      <path class="l-hl" d="M84 30.5L94 23.2M16 69.5L6 76.8" stroke="#D04D3A" stroke-width="2" fill="none" />
      <g transform="rotate(-36.3 50 50)">
        <rect class="l-fl" x="-6" y="49.3" width="112" height="1.4" fill="#FFF" />
      </g>
    </svg>
  );
}

type Step = 'cert' | 'exam' | 'save' | 'nightly' | 'ready';

/** The AI can be asked now: the server has it, and this person may use it. */
const aiOpen = () => state.status.ai && (state.status.aiMode === 'anon' || (state.status.aiMode === 'firebase' && !!state.status.user));

/** A big choice tile: a mark on the left, a title, a value line, a check when chosen. */
function Choice({ on, title, sub, mark, onClick, busy }: { on: boolean; title: string; sub?: string; mark: preact.ComponentChildren; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" class={`su-ch${on ? ' on' : ''}${busy ? ' l-busy' : ''}`} role="radio" aria-checked={on} onClick={onClick}>
      <span class="su-chm">{mark}</span>
      <span class="su-cht">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      <span class="su-chk" aria-hidden="true">
        {on && <Check size={18} />}
      </span>
    </button>
  );
}

function DeviceMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M5 1.5H17V20.5H5Z" fill="currentColor" />
      <path d="M9 17.5H13" stroke="#121214" stroke-width="2" />
    </svg>
  );
}

export function Welcome() {
  const cloud = cloudConfigured();
  const [mk, setMk] = useState(0);
  const [at, setAt] = useState(-1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [cert, setCert] = useState(state.profile.certId);
  const [exam, setExam] = useState(state.profile.packs.find((x) => x.certId === state.profile.certId)?.examDate || '');
  const [busy, setBusy] = useState('');
  const [nightly, setNightly] = useState<boolean | null>(null);
  const reg = state.registry;

  useEffect(() => {
    if (!reg) void loadRegistry().catch(() => undefined);
  }, []);

  const steps: Step[] = ['cert', 'exam', ...(cloud ? (['save'] as const) : []), ...(aiOpen() ? (['nightly'] as const) : []), 'ready'];
  const step = at < 0 ? null : steps[Math.min(at, steps.length - 1)];
  const asks = steps.length - 1;

  const move = (to: number) => {
    setDir(to > at ? 1 : -1);
    setAt(to);
    sfx(to > at ? 'flip' : 'tock');
    buzz(5);
  };
  const next = () => move(at + 1);
  const prev = () => move(at - 1);

  const google = async (then?: () => void) => {
    if (busy) return;
    sfx('tock');
    setBusy('google');
    try {
      const ok = await signIn();
      setBusy('');
      if (!ok) return;
      sfx('sheet');
      then?.();
    } catch {
      setBusy('');
      toast('ログインできませんでした。もう一度 お試しください');
    }
  };

  const chooseCert = async (e: RegistryEntry) => {
    if (busy) return;
    sfx('tock');
    buzz(5);
    setCert(e.id);
    if (e.id === state.profile.certId) return;
    setBusy(e.id);
    const pk = await loadPack(e.id).catch(() => null);
    setBusy('');
    if (!pk) {
      sfx('low');
      setCert(state.profile.certId);
      toast('問題集を 読みこめませんでした。つながってから、もう一度');
      return;
    }
    studyCert(e);
    ensureDay(pk);
    setExam(state.profile.packs.find((x) => x.certId === e.id)?.examDate || '');
  };

  const finish = () => {
    setExamDate(state.profile.certId, exam);
    setProfile({ onboarded: true, ...(nightly !== null ? { nightly } : {}) });
    sfx('slash');
    buzz([10, 40, 20]);
    go('today', true);
  };

  useKey((e) => {
    if (e.key === 'Escape' && at >= 0) prev();
  });

  /* ---------- the opening ---------- */
  if (step === null) {
    return (
      <div class="wl su-open">
        <div class="wl-col">
          <div class="wl-brand">
            <div class="wl-thin" />
            <div class="wl-band" />
            <Mark k={mk} />
            <button
              type="button"
              class="wl-replay"
              aria-label="ロゴの演出をもう一度"
              onClick={() => {
                sfx('intro');
                setMk(mk + 1);
              }}
            />
            <h1 class="l-word wl-word" aria-label="ZAN">
              <span class="l-wt" aria-hidden="true">
                ZAN
              </span>
              <span class="l-wb" aria-hidden="true">
                ZAN
              </span>
            </h1>
          </div>
          <div class="l-rise wl-copy">
            <b class="z-min">斬って、進む。</b>
          </div>
          <div class="wl-sp" />
          <div class="l-rise wl-acts">
            <button type="button" class="l-btn l-bw" onClick={() => move(0)}>
              はじめる
            </button>
            {cloud && (
              <button type="button" class={`l-txt wl-g${busy ? ' l-busy' : ''}`} onClick={() => void google(() => move(0))} aria-busy={!!busy}>
                <Google size={16} />
                {busy ? 'つないでいます…' : 'ログインして 引きつぐ'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- the setup pages ---------- */
  const user = state.status.user;
  const examLeft = exam ? dayDiff(ymd(), exam) : null;
  const entry = reg?.certs.find((c) => c.id === cert);
  const certs = reg?.certs.filter((c) => c.status !== 'hidden') || [];

  const page = () => {
    switch (step) {
      case 'cert':
        return (
          <>
            <h2 class="z-min su-t">どの資格を 目指す？</h2>
            <div class="su-list" role="radiogroup" aria-label="資格">
              {!reg && <div class="su-skel" aria-label="読みこんでいます" />}
              {certs.map((e) => (
                <Choice
                  key={e.id}
                  on={cert === e.id}
                  busy={busy === e.id}
                  title={e.code}
                  sub={e.name}
                  mark={<b class="z-min su-code">{e.code.split('-')[0]}</b>}
                  onClick={() => void chooseCert(e)}
                />
              ))}
              <div class="su-soon" aria-label="ほかの資格は 準備中">
                <span />
                <span />
              </div>
            </div>
          </>
        );
      case 'exam':
        return (
          <>
            <h2 class="z-min su-t">試験は いつ？</h2>
            <ExamDate value={exam} onChange={setExam} />
          </>
        );
      case 'save':
        return (
          <>
            <h2 class="z-min su-t">記録は どこに？</h2>
            <div class="su-list" role="radiogroup" aria-label="記録の 保存先">
              <Choice on={!user} title="この端末" sub="ログインなし" mark={<DeviceMark />} onClick={() => sfx('tock')} />
              <Choice
                on={!!user}
                busy={busy === 'google'}
                title={user ? user.name || 'Google' : 'Google で同期'}
                sub={user ? user.email || 'ログイン中' : 'スマホと PC で 同じ記録'}
                mark={user?.photo ? <img src={user.photo} alt="" referrerpolicy="no-referrer" /> : <Google size={22} />}
                onClick={() => (user ? sfx('tock') : void google())}
              />
            </div>
          </>
        );
      case 'nightly': {
        const y = addDays(ymd(), -1);
        return (
          <>
            <h2 class="z-min su-t">毎晩の まとめ</h2>
            <div class="su-sample" aria-label="まとめの見本">
              <div class="l-sh">
                <b class="z-min">{md(y)}</b>
                <span class="z-tag z-tag-r">{dowName(y)}</span>
                <span class="l-sp" />
                <span class="l-sm">{RECAP_HOUR}:00</span>
              </div>
              <p class="z-min">朝の欠片は 5問とも正解。縛鎖には 一日で 420。迷った 2問は、あしたの朝の欠片に入れておきました。</p>
            </div>
            <div class="su-list su-two" role="radiogroup" aria-label="毎晩のまとめ">
              <Choice on={nightly === true} title="AI に まとめてもらう" sub={`毎晩 ${RECAP_HOUR}:00 · 個人の手帳だけ`} mark={<span class="su-dot on" />} onClick={() => (setNightly(true), sfx('tock'))} />
              <Choice on={nightly === false} title="自分で 書く" sub="あとで 変えられます" mark={<span class="su-dot" />} onClick={() => (setNightly(false), sfx('tock'))} />
            </div>
          </>
        );
      }
      default:
        return null;
    }
  };

  if (step === 'ready') {
    return (
      <div class="su su-ready">
        <div class="su-rb" aria-hidden="true">
          <div class="wl-thin" />
          <div class="wl-band" />
          <b class="z-min su-rt">準備、完了。</b>
        </div>
        <div class="su-rcol">
          <dl class="su-sum">
            <div>
              <dt>資格</dt>
              <dd class="z-min">{entry?.code || state.profile.packs.find((x) => x.certId === cert)?.code}</dd>
            </div>
            <div>
              <dt>試験</dt>
              <dd class="z-min z-num">{exam ? `${md(exam)}` : '—'}</dd>
              {exam && <span class="su-sumx">あと {examLeft}日</span>}
            </div>
            {cloud && (
              <div>
                <dt>記録</dt>
                <dd>{user ? 'Google' : 'この端末'}</dd>
              </div>
            )}
            {nightly !== null && (
              <div>
                <dt>まとめ</dt>
                <dd>{nightly ? `毎晩 ${RECAP_HOUR}:00` : 'なし'}</dd>
              </div>
            )}
          </dl>
          <div class="wl-sp" />
          <div class="su-acts">
            <button type="button" class="l-btn l-bw" onClick={finish} autoFocus>
              斬りはじめる
            </button>
            <button type="button" class="l-txt" onClick={prev}>
              もどる
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canNext = step !== 'cert' || !!reg?.certs.some((c) => c.id === cert) || state.profile.packs.length > 0;
  const nextLabel = step === 'exam' && !exam ? 'まだ 決めていない' : step === 'nightly' && nightly === null ? 'あとで' : '次へ';
  const plain = nextLabel !== '次へ';

  return (
    <div class="su">
      <header class="su-bar">
        <button type="button" class="su-back" onClick={prev} aria-label="もどる">
          <ChevL size={18} />
        </button>
        <ol class="su-prog" aria-label={`${at + 1} / ${asks}`}>
          {steps.slice(0, asks).map((s, i) => (
            <li key={s} class={i < at ? 'done' : i === at ? 'now' : ''} />
          ))}
        </ol>
        <span class="su-cnt z-num" aria-hidden="true">
          {at + 1}/{asks}
        </span>
      </header>
      <div class={`su-page ${dir > 0 ? 'fwd' : 'bwd'}`} key={step}>
        {page()}
      </div>
      <div class="su-acts">
        <button type="button" class={`l-btn ${plain ? 'su-plain' : 'l-bw'}`} onClick={next} disabled={!canNext}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

