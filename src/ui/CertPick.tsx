// Which certification to study: the ones already added, and the rest of the registry. Each one keeps its own
// records, so switching loses nothing; the day's study tasks follow the one chosen.
import { useEffect, useState } from 'preact/hooks';
import type { RegistryEntry } from '../core/types';
import { state } from '../core/store';
import { ensureDay, studyCert } from '../core/actions';
import { loadPack, loadRegistry } from '../core/pack';
import { sfx } from '../core/sfx';
import { toast } from './fx';

export function CertPick({ onDone }: { onDone: () => void }) {
  const pr = state.profile;
  const reg = state.registry;
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!reg) void loadRegistry().catch(() => undefined);
  }, []);

  const pick = async (e: RegistryEntry) => {
    if (busy) return;
    if (e.id === pr.certId) return onDone();
    setBusy(e.id);
    const pk = await loadPack(e.id).catch(() => null);
    setBusy('');
    if (!pk) {
      sfx('low');
      toast('問題集を 読みこめませんでした。つながってから、もう一度');
      return;
    }
    const first = !pr.packs.some((x) => x.certId === e.id);
    studyCert(e);
    ensureDay(pk);
    sfx('flip');
    toast(first ? `${e.code} を 足しました。覚えるところから はじめます` : `${e.code} に 切りかえました`);
    onDone();
  };

  const list = reg ? [...reg.certs].sort((a, b) => Number(b.id === pr.certId) - Number(a.id === pr.certId)) : [];
  return (
    <div class="cp">
      <b class="z-min cp-t">学ぶ 資格</b>
      <p class="cp-s">記録は 資格ごとに 分かれています。切りかえても、前の資格の 記録は そのまま 残ります。</p>
      {!reg ? (
        <p class="cp-s">資格の一覧を 読みこんでいます…</p>
      ) : (
        <ul class="cp-li">
          {list.map((e) => {
            const cur = e.id === pr.certId;
            const added = pr.packs.some((x) => x.certId === e.id);
            return (
              <li key={e.id}>
                <button type="button" class={`cp-row${cur ? ' on' : ''}`} onClick={() => void pick(e)} aria-current={cur ? 'true' : undefined} disabled={!!busy}>
                  <span class="cp-tx">
                    <span class="cp-code">
                      <b class="z-min">{e.code}</b>
                      {cur ? <span class="z-tag z-tag-r">学習中</span> : added ? <span class="z-tag z-tag-k">足してある</span> : null}
                    </span>
                    <span class="cp-name">{e.name}</span>
                    <span class="cp-meta">
                      {[e.vendor, `問題集 v${e.version}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {!cur && <span class="cp-go">{busy === e.id ? '読みこみ中…' : added ? '切りかえる' : '足す'}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p class="cp-note">ほかの資格は、問題集が できしだい ここに 並びます。</p>
    </div>
  );
}
