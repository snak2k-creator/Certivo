// The first screen: the mark cuts in, ZAN splits on a red band, then Google sign-in or start on this device.
// After signing in, one question: may the AI write the nightly page.
import { useState } from 'preact/hooks';
import { state } from '../core/store';
import { aiCapNow, setProfile } from '../core/actions';
import { cloudConfigured, signIn } from '../core/cloud';
import { sfx } from '../core/sfx';
import { addDays, dowName, md, ymd } from '../core/util';
import { Google } from '../ui/icons';
import { toast } from '../ui/fx';
import { go } from '../ui/router';
import { useScrollLock } from '../ui/hooks';

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
            <path d="M67 32H82L33 68H18Z" fill="#E3402B" />
          </g>
        </g>
      </g>
      <path class="l-hl" d="M84 30.5L94 23.2M16 69.5L6 76.8" stroke="#E3402B" stroke-width="2" fill="none" />
      <g transform="rotate(-36.3 50 50)">
        <rect class="l-fl" x="-6" y="49.3" width="112" height="1.4" fill="#FFF" />
      </g>
    </svg>
  );
}

export function NightlySheet({ onDone }: { onDone: () => void }) {
  useScrollLock();
  const y = addDays(ymd(), -1);
  const answer = (yes: boolean) => {
    setProfile({ nightly: yes, onboarded: true });
    sfx(yes ? 'write' : 'tock');
    if (yes) toast('毎晩 22:00 に、まとめます');
    onDone();
  };
  return (
    <>
      <div class="l-dim" />
      <section class="l-sheet" role="dialog" aria-modal="true" aria-label="毎晩の自動まとめ">
        <div class="l-sheet-in">
          <span class="l-q">はじめに、ひとつだけ</span>
          <b class="z-min l-qt">
            毎晩、その日の記録を
            <br />
            自動でまとめますか
          </b>
          <div class="l-sample" aria-label="まとめの見本">
            <div class="l-sh">
              <b class="z-min">{md(y)}</b>
              <span class="z-tag z-tag-r">{dowName(y)}</span>
              <span class="l-sp" />
              <span class="l-sm">22:00 · 見本</span>
            </div>
            <p class="z-min">朝の欠片は 5問とも正解。縛鎖には 一日で 420。迷った 2問は、あしたの朝の欠片に入れておきました。</p>
          </div>
          <ul class="l-lis">
            <li>
              まとめるのは <b>個人の手帳</b> だけ。22:00 を過ぎて ひらくと、もう できています。
            </li>
            <li>送るのは、その日の数字と 斬ったやることの題名。仕事の手帳は 件数だけで、中身は送りません。</li>
            <li>AI を使うのは 月 {aiCapNow()} 回まで。設定で いつでも 止められます。</li>
          </ul>
          <div class="l-sacts">
            <button type="button" class="l-btn l-bk" onClick={() => answer(true)}>
              まとめてもらう
            </button>
            <button type="button" class="l-txt l-txt-k" onClick={() => answer(false)}>
              今はしない
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export function Welcome() {
  const [busy, setBusy] = useState(false);
  const [mk, setMk] = useState(0);
  const [ask, setAsk] = useState(false);
  const cloud = cloudConfigured();

  const finish = () => {
    setProfile({ onboarded: true });
    go('today', true);
  };
  const google = async () => {
    if (busy) return;
    sfx('tock');
    setBusy(true);
    try {
      const ok = await signIn();
      setBusy(false);
      if (!ok) return;
      sfx('sheet');
      if (state.status.ai) setAsk(true);
      else finish();
    } catch {
      setBusy(false);
      toast('ログインできませんでした。もう一度 お試しください');
    }
  };
  const local = () => {
    sfx('tock');
    if (state.status.ai && state.status.aiMode === 'anon') setAsk(true);
    else finish();
  };

  return (
    <div class="wl z-grain">
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
          <span>
            勉強も、やることも、
            <br />
            一つずつ斬って進む。
          </span>
        </div>
        <div class="wl-sp" />
        <div class="l-rise wl-acts">
          {cloud && (
            <button type="button" class={`l-btn l-bw${busy ? ' l-busy' : ''}`} onClick={google} aria-busy={busy}>
              <Google size={20} />
              {busy ? 'つないでいます…' : 'Google でログイン'}
            </button>
          )}
          <button type="button" class={cloud ? 'l-txt' : 'l-btn l-bw'} onClick={local}>
            この端末だけで始める
          </button>
        </div>
        <p class="l-rise wl-fine">
          同期と AI への送信は、はじめはオフです。
          <br />
          あとから設定で いつでも変えられます。
        </p>
      </div>
      {ask && <NightlySheet onDone={finish} />}
    </div>
  );
}
