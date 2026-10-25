// 設定, laid out like a phone's own settings: an account card, grouped lists with a mark, a value and a chevron,
// switches that flip with a tap anywhere on the row, and a page per subject (account and sync, AI, the exam,
// the records). settings/<page> opens one page; settings/nightly opens the AI page at the nightly switch.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { state } from '../core/store';
import { aiCapNow, aiUsed, setExamDate, setProfile } from '../core/actions';
import { cloudConfigured, disableSync, enableSync, remoteInfo, signIn, signOut } from '../core/cloud';
import { applyBackup, deleteData, exportCsv, exportDaysCsv, exportJson, readBackup, type ImportPlan, type Which } from '../core/data';
import { aiBlocked } from '../core/ai';
import { activePack } from '../core/pack';
import { RECAP_HOUR } from '../core/recap';
import { buzz, sfx } from '../core/sfx';
import { dayDiff, hm, md, reducedMotion, ymd } from '../core/util';
import { toast } from '../ui/fx';
import { openSheet } from '../ui/sheets';
import { back, go } from '../ui/router';
import { Account, ChevL, ChevR, Google, Logo } from '../ui/icons';
import { ExamDate } from '../ui/ExamDate';

const BOOK: Record<Which, string> = { p: '個人の手帳', w: '仕事の手帳', all: 'すべての記録' };
const when = (ts: number) => (ts ? `${md(new Date(ts).toISOString().slice(0, 10))} ${hm(new Date(ts))}` : '');
const VERSION = '2.0.0';

/* ---------- marks: flat filled glyphs on a small slanted tile ---------- */
const G = {
  cert: (
    <path d="M3 4.5L10 5.8V17L3 15.7ZM12 5.8L19 4.5V15.7L12 17Z" fill="currentColor" />
  ),
  exam: (
    <>
      <path d="M3.5 5H18.5V18.5H3.5Z" fill="currentColor" />
      <path d="M7 2.5V7M15 2.5V7" stroke="currentColor" stroke-width="2.2" />
      <path d="M7.5 12.5L10 15L14.5 10" fill="none" stroke="#D04D3A" stroke-width="2.2" />
    </>
  ),
  ai: (
    <>
      <path d="M3 4H19V15H9L5 18.5V15H3Z" fill="currentColor" />
      <path d="M8 12L10 7M11.5 12L13.5 7" stroke="#D04D3A" stroke-width="2" />
    </>
  ),
  night: <path d="M14 3A8 8 0 1 0 19 15.5A7 7 0 0 1 14 3Z" fill="currentColor" />,
  sound: (
    <>
      <path d="M3 8H7L12 4V18L7 14H3Z" fill="currentColor" />
      <path d="M15 8C16.2 9.5 16.2 12.5 15 14M17.5 5.5C20 8.5 20 13.5 17.5 16.5" fill="none" stroke="currentColor" stroke-width="1.8" />
    </>
  ),
  buzz: (
    <>
      <path d="M7 2.5H15V19.5H7Z" fill="currentColor" />
      <path d="M3.5 7V15M18.5 7V15" stroke="#D04D3A" stroke-width="2" />
    </>
  ),
  ritual: (
    <>
      <path d="M2 14.5L20 9.5V14L2 19Z" fill="#D04D3A" />
      <path d="M2 11.5L20 6.5V8L2 13Z" fill="currentColor" />
    </>
  ),
  calm: <path d="M2 9H20M2 14H20" stroke="currentColor" stroke-width="2.6" />,
  out: (
    <>
      <path d="M3 11V19H19V11" fill="none" stroke="currentColor" stroke-width="2.2" />
      <path d="M11 14V3M6.5 7.5L11 3L15.5 7.5" fill="none" stroke="#D04D3A" stroke-width="2.2" />
    </>
  ),
  in: (
    <>
      <path d="M3 11V19H19V11" fill="none" stroke="currentColor" stroke-width="2.2" />
      <path d="M11 3V14M6.5 9.5L11 14L15.5 9.5" fill="none" stroke="#D04D3A" stroke-width="2.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6H18L16.5 19.5H5.5Z" fill="currentColor" />
      <path d="M2.5 4H19.5M8.5 2H13.5" stroke="currentColor" stroke-width="2" />
    </>
  ),
  sync: (
    <>
      <path d="M4 11A7 7 0 0 1 16.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" />
      <path d="M18 11A7 7 0 0 1 5.5 15.5" fill="none" stroke="#D04D3A" stroke-width="2.2" />
      <path d="M14 3H18.5V7.5ZM8 19H3.5V14.5Z" fill="currentColor" />
    </>
  ),
  book: (
    <>
      <path d="M4 3H18V19H4Z" fill="currentColor" />
      <path d="M7.5 8H14.5M7.5 12H14.5" stroke="#121214" stroke-width="2" />
    </>
  ),
  work: (
    <>
      <path d="M2.5 7H19.5V18.5H2.5Z" fill="currentColor" />
      <path d="M8 7V4H14V7" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M2.5 11.5H19.5" stroke="#121214" stroke-width="1.6" />
    </>
  ),
  table: (
    <>
      <path d="M3 4H19V18H3Z" fill="currentColor" />
      <path d="M3 9H19M3 13.5H19M9 9V18" stroke="#121214" stroke-width="1.6" />
    </>
  ),
  limit: (
    <>
      <path d="M3 17H19" stroke="currentColor" stroke-width="2.2" />
      <path d="M4 15V11H8V15ZM9.5 15V7H13.5V15ZM15 15V4H19V15Z" fill="currentColor" />
    </>
  ),
  ask: (
    <>
      <circle cx="11" cy="11" r="8.5" fill="currentColor" />
      <path d="M8.3 8.6C8.3 5.5 13.8 5.5 13.8 8.6C13.8 10.6 11 10.6 11 13" fill="none" stroke="#121214" stroke-width="2" />
      <path d="M11 15V17" stroke="#121214" stroke-width="2.2" />
    </>
  ),
};

function Mark({ g, tone }: { g: ComponentChildren; tone?: 'r' | 'w' }) {
  return (
    <span class={`sg-mk${tone ? ' ' + tone : ''}`} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 22 22">
        {g}
      </svg>
    </span>
  );
}

/* ---------- list parts ---------- */
function Group({ head, foot, children, id }: { head?: string; foot?: ComponentChildren; children: ComponentChildren; id?: string }) {
  return (
    <section class="sg" id={id}>
      {head && <h3 class="sg-h">{head}</h3>}
      <div class="sg-b">{children}</div>
      {foot && <p class="sg-f">{foot}</p>}
    </section>
  );
}

type CellProps = {
  g?: ComponentChildren;
  tone?: 'r' | 'w';
  label: ComponentChildren;
  sub?: ComponentChildren;
  value?: ComponentChildren;
  chev?: boolean;
  red?: boolean;
  disabled?: boolean;
  id?: string;
  flash?: boolean;
  onClick?: () => void;
  children?: ComponentChildren;
};
function Cell({ g, tone, label, sub, value, chev, red, disabled, id, flash, onClick, children }: CellProps) {
  const inner = (
    <>
      {g && <Mark g={g} tone={tone} />}
      <span class="sg-tx">
        <b>{label}</b>
        {sub && <span>{sub}</span>}
      </span>
      {value !== undefined && <span class="sg-v">{value}</span>}
      {children}
      {chev && (
        <span class="sg-chev">
          <ChevR size={14} />
        </span>
      )}
    </>
  );
  const cls = `sg-c${red ? ' red' : ''}${flash ? ' flash' : ''}${g ? '' : ' bare'}`;
  return onClick ? (
    <button
      type="button"
      class={cls}
      id={id}
      disabled={disabled}
      onClick={() => {
        sfx('tock');
        onClick();
      }}
    >
      {inner}
    </button>
  ) : (
    <div class={cls} id={id}>
      {inner}
    </div>
  );
}

/** A row that is a switch: a tap anywhere on it flips it. */
function Toggle({ g, tone, label, sub, on, disabled, id, flash, onChange }: { g?: ComponentChildren; tone?: 'r' | 'w'; label: string; sub?: ComponentChildren; on: boolean; disabled?: boolean; id?: string; flash?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      class={`sg-c${flash ? ' flash' : ''}${g ? '' : ' bare'}`}
      role="switch"
      aria-checked={on}
      id={id}
      disabled={disabled}
      onClick={() => {
        sfx('tock');
        buzz(5);
        onChange(!on);
      }}
    >
      {g && <Mark g={g} tone={tone} />}
      <span class="sg-tx">
        <b>{label}</b>
        {sub && <span>{sub}</span>}
      </span>
      <span class={`z-sw st-sw${on ? ' on' : ''}`} aria-hidden="true">
        <span class="z-swt">
          <i />
        </span>
      </span>
    </button>
  );
}

/** What exactly goes out when a switch is on, folded under it. */
function Sends({ items, never }: { items: string[]; never?: string }) {
  return (
    <details class="sg-d">
      <summary>
        <span>送るもの</span>
        <ChevR size={12} />
      </summary>
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {never && <p>{never}</p>}
    </details>
  );
}

/* ---------- the page frame: a bar with a back button and a title that shrinks into it on scroll ---------- */
function Frame({ title, backTo, backLabel, children }: { title: string; backTo: () => void; backLabel: string; children: ComponentChildren }) {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const f = () => setSmall(window.scrollY > 44);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return (
    <div class="m-page bare st">
      <header class={`st-bar${small ? ' small' : ''}`}>
        <button type="button" class="st-back" onClick={backTo}>
          <ChevL />
          {backLabel}
        </button>
        <span class="st-bt" aria-hidden={!small}>
          {title}
        </span>
      </header>
      <h1 class="z-min st-title">{title}</h1>
      {children}
    </div>
  );
}

/* ---------- pages ---------- */
type Page = '' | 'account' | 'ai' | 'exam' | 'data';
const TITLE: Record<Page, string> = { '': '設定', account: 'アカウントと 同期', ai: 'AI', exam: '資格と 試験', data: '記録' };

function examLine(examDate: string) {
  if (!examDate) return '未定';
  const n = dayDiff(ymd(), examDate);
  return n >= 0 ? `${md(examDate)} · あと${n}日` : md(examDate);
}

function Main() {
  const pr = state.profile;
  const st = state.status;
  const pk = activePack();
  const cloud = cloudConfigured();
  const exam = pr.packs.find((x) => x.certId === pr.certId);
  const block = aiBlocked();
  const user = st.user;
  const anySync = pr.sync.p || pr.sync.w;

  return (
    <>
      <button type="button" class="st-me" onClick={() => (sfx('tock'), go('settings/account'))}>
        <span class="st-av">{user?.photo ? <img src={user.photo} alt="" referrerpolicy="no-referrer" /> : <Account size={26} />}</span>
        <span class="st-mt">
          <b>{user ? user.name || 'Google アカウント' : 'この端末'}</b>
          <span>
            {user ? (
              <>
                <i class={`st-dot${anySync ? ' on' : ''}`} />
                {anySync ? (st.syncing ? '同期中…' : '同期 オン') : '同期 オフ'}
              </>
            ) : cloud ? (
              'ログインして 同期'
            ) : (
              'ローカル保存'
            )}
          </span>
        </span>
        <span class="sg-chev">
          <ChevR size={14} />
        </span>
      </button>

      <Group head="学習">
        <Cell g={G.cert} label="資格" value={pk?.code || exam?.code} chev onClick={() => openSheet({ kind: 'cert' })} />
        <Cell g={G.exam} tone="w" label="試験日" value={<span class={exam?.examDate ? '' : 'dim'}>{examLine(exam?.examDate || '')}</span>} chev onClick={() => go('settings/exam')} />
      </Group>

      <Group head="AI">
        <Cell
          g={G.ai}
          label="AI"
          value={block === 'off' ? <span class="st-pill">未接続</span> : block === 'offline' ? 'オフライン' : `${aiUsed()} / ${aiCapNow()}`}
          chev
          onClick={() => go('settings/ai')}
        />
        <Cell g={G.night} label="毎晩のまとめ" value={pr.nightly ? `${RECAP_HOUR}:00` : 'オフ'} chev onClick={() => go('settings/ai')} />
      </Group>

      <Group head="手ざわり">
        <Toggle g={G.sound} label="音" on={pr.sound} onChange={(v) => setProfile({ sound: v })} />
        <Toggle g={G.buzz} label="振動" on={pr.haptics} onChange={(v) => setProfile({ haptics: v })} />
        <Toggle g={G.ritual} label="朝の幕あけ" on={pr.ritual} onChange={(v) => setProfile({ ritual: v })} />
        <Toggle g={G.calm} label="動きを 控えめに" on={!!pr.calm} onChange={(v) => setProfile({ calm: v })} />
      </Group>

      <Group head="記録">
        <Cell g={G.out} label="書き出し・読み込み" chev onClick={() => go('settings/data')} />
        <Cell g={G.trash} tone="r" label="記録を 消す" red chev onClick={() => go('settings/data/delete')} />
      </Group>

      <footer class="st-foot">
        <Logo size={30} />
        <b class="z-min">ZAN</b>
        <span class="z-num">
          {VERSION}
          {pk ? ` · ${pk.code} v${pk.packVersion}` : ''}
        </span>
        <p>ゲームの数字は、自分の 励みの ためのもの。</p>
      </footer>
    </>
  );
}

function AccountPage() {
  const pr = state.profile;
  const st = state.status;
  const cloud = cloudConfigured();
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState<{ part: 'p' | 'w'; tasks: number; at: number } | null>(null);

  const login = async () => {
    if (busy) return;
    setBusy('login');
    try {
      if (await signIn()) {
        sfx('sheet');
        toast('ログインしました');
      }
    } catch {
      toast('ログインできませんでした。もう一度 お試しください');
    }
    setBusy('');
  };
  const logout = async () => {
    setBusy('logout');
    await signOut().catch(() => undefined);
    setBusy('');
    toast('ログアウトしました。記録は この端末に 残っています');
  };
  const syncOn = async (part: 'p' | 'w') => {
    setBusy('sync-' + part);
    try {
      const info = await remoteInfo(part);
      if (info && info.tasks > 0) setPick({ part, tasks: info.tasks, at: info.updatedAt });
      else if (await enableSync(part, 'device')) toast(`${BOOK[part]}の 同期を オンにしました`);
    } catch {
      toast('同期を はじめられませんでした。この端末の記録は そのままです');
    }
    setBusy('');
  };
  const choose = async (use: 'device' | 'cloud') => {
    if (!pick) return;
    const part = pick.part;
    setPick(null);
    setBusy('sync-' + part);
    try {
      await enableSync(part, use);
      toast(use === 'cloud' ? `クラウドの${BOOK[part]}に そろえました` : `この端末の${BOOK[part]}で 同期を はじめました`);
    } catch {
      toast('同期を はじめられませんでした。この端末の記録は そのままです');
    }
    setBusy('');
  };
  const syncOff = (part: 'p' | 'w') => {
    disableSync(part);
    toast(`${BOOK[part]}の 同期を 止めました。クラウドの記録は 消していません`);
  };

  if (!cloud) {
    return (
      <>
        <div class="st-hero">
          <span class="st-av big">
            <Account size={40} />
          </span>
          <b>この端末</b>
          <span>記録は この端末の中だけ</span>
        </div>
        <Group>
          <Cell g={<Google size={18} />} tone="w" label="Google でログイン" value="この版では 未対応" disabled />
        </Group>
      </>
    );
  }

  const user = st.user;
  return (
    <>
      <div class="st-hero">
        <span class="st-av big">{user?.photo ? <img src={user.photo} alt="" referrerpolicy="no-referrer" /> : <Account size={40} />}</span>
        <b>{user ? user.name || 'Google アカウント' : 'この端末'}</b>
        <span>{user ? user.email || 'ログイン中' : 'ログインしていません'}</span>
        {!user && (
          <button type="button" class={`z-bw st-google${busy === 'login' ? ' l-busy' : ''}`} disabled={busy === 'login'} onClick={login} aria-busy={busy === 'login'}>
            <Google size={18} />
            {busy === 'login' ? 'つないでいます…' : 'Google でログイン'}
          </button>
        )}
      </div>

      <Group head="同期" foot={st.syncError ? <em>{st.syncError}</em> : user ? undefined : 'ログインすると オンにできます'}>
        {(['p', 'w'] as const).map((part) => (
          <Toggle
            key={part}
            g={part === 'p' ? G.book : G.work}
            label={BOOK[part]}
            sub={busy === 'sync-' + part ? 'つないでいます…' : pr.sync[part] && st.syncing ? '同期しています…' : undefined}
            on={pr.sync[part]}
            disabled={!user || busy === 'sync-' + part}
            onChange={(v) => (v ? void syncOn(part) : syncOff(part))}
          />
        ))}
      </Group>
      {pick && (
        <div class="st-card z-light" role="group" aria-label="どちらの記録を 使うか">
          <b>クラウドにも {BOOK[pick.part]}が あります</b>
          <p>
            やること {pick.tasks}件{pick.at ? ` · ${when(pick.at)}` : ''}
          </p>
          <div class="st-acts">
            <button type="button" class="z-bk sm" onClick={() => void choose('device')}>
              この端末に そろえる
            </button>
            <button type="button" class="z-bo2" onClick={() => void choose('cloud')}>
              クラウドに そろえる
            </button>
            <button type="button" class="z-txb" onClick={() => setPick(null)}>
              やめる
            </button>
          </div>
        </div>
      )}

      {user && (
        <Group>
          <button type="button" class="sg-c sg-center red" disabled={busy === 'logout'} onClick={logout}>
            ログアウト
          </button>
        </Group>
      )}
    </>
  );
}

function AiPage({ focus }: { focus: boolean }) {
  const pr = state.profile;
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      document.getElementById('st-nightly')?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      setFlash(true);
    }, 160);
    return () => clearTimeout(t);
  }, [focus]);

  const block = aiBlocked();
  const cap = aiCapNow();
  const used = aiUsed();
  const limits = [20, 50, 100].filter((n) => n < pr.aiCap);
  const sent = state.w.sent.slice(0, 3);
  const state0 =
    block === 'off'
      ? { big: '未接続', sub: 'AI なしでも、まとめと 提案は 端末の中で 書きます' }
      : block === 'offline'
        ? { big: 'オフライン', sub: 'つながると 使えます' }
        : block === 'signin'
          ? { big: 'ログインが 必要', sub: '' }
          : block === 'cap'
            ? { big: '今月は 上限', sub: '来月まで 端末の中で 書きます' }
            : null;

  return (
    <>
      {state0 ? (
        <div class={`st-aih${block === 'off' ? ' off' : ''}`}>
          <Mark g={G.ai} />
          <b class="z-min">{state0.big}</b>
          {state0.sub && <span>{state0.sub}</span>}
          {block === 'signin' && (
            <button type="button" class="z-bw sm" onClick={() => go('settings/account')}>
              ログインへ
            </button>
          )}
        </div>
      ) : (
        <div class="st-aih" aria-label={`今月 ${used} / ${cap} 回`}>
          <span class="st-aiu">
            <b class="z-min z-num">{used}</b>
            <span class="z-num">/ {cap}</span>
          </span>
          <span class="st-useb">
            <i style={{ width: `${Math.min(100, Math.round((used / Math.max(1, cap)) * 100))}%` }} />
          </span>
          <span>今月 使った回数</span>
        </div>
      )}

      <Group head="自動で 頼むこと">
        <Toggle
          id="st-nightly"
          flash={flash}
          g={G.night}
          label="毎晩のまとめ"
          sub={`${RECAP_HOUR}:00 · 個人の手帳`}
          on={pr.nightly}
          onChange={(v) => {
            setProfile({ nightly: v });
            toast(v ? `毎晩 ${RECAP_HOUR}:00 に、まとめます` : '毎晩のまとめを 止めました。端末の中で 書きます');
          }}
        />
        <Sends
          items={['個人の手帳の その日の数字（解いた問題と 正解の数、斬った数、経験値、続いた日数）', '斬った やることの 題名（6件まで）', '今週の敵の 名前と 与えたダメージ', '迷った分野の 名前（2つまで）']}
          never="仕事の手帳からは、済んだ 件数だけ。"
        />
        <Toggle
          g={G.ai}
          label="朝の提案と 影の名前"
          on={pr.aiAuto}
          onChange={(v) => {
            setProfile({ aiAuto: v });
            toast(v ? '朝の提案と 影の名前を、AI に 頼みます' : '止めました。端末の中で 決めます');
          }}
        />
        <Sends items={['問題集の 分野の名前、きのう 迷った数、正答率、試験までの 日数', '影の型と、生まれた 分野の名前']} never="やることの 題名は 送りません。" />
      </Group>

      <Group head="押したときだけ">
        <Cell g={G.ask} label="問題の 解説" value="「AI に聞く」" />
        <Cell g={G.work} tone="w" label="仕事の 段取り" value={sent.length > 0 ? `${state.w.sent.length}回` : '確かめてから'} />
        {sent.length > 0 && (
          <ul class="st-log" aria-label="仕事の手帳から AI に 送ったもの">
            {sent.map((x) => (
              <li key={x.at}>
                <span class="z-num">{when(x.at)}</span>
                {x.what}
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group head="月の 上限">
        <div class="sg-c bare st-seg" role="radiogroup" aria-label="月の上限">
          {[...limits, 0].map((n) => {
            const on = n === 0 ? !pr.aiLimit || pr.aiLimit >= pr.aiCap : pr.aiLimit === n;
            return (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={on}
                class={on ? 'on' : ''}
                onClick={() => {
                  sfx('tock');
                  buzz(5);
                  setProfile({ aiLimit: n });
                }}
              >
                <b class="z-min z-num">{n || pr.aiCap}</b>
                {n === 0 && <small>最大</small>}
              </button>
            );
          })}
        </div>
      </Group>
    </>
  );
}

function ExamPage() {
  const pr = state.profile;
  const pk = activePack();
  const exam = pr.packs.find((x) => x.certId === pr.certId);
  return (
    <>
      <Group head="学ぶ 資格">
        <Cell g={G.cert} label={pk?.code || exam?.code || ''} sub={pk?.name || exam?.name} value={pr.packs.length > 1 ? `${pr.packs.length}つ` : undefined} chev onClick={() => openSheet({ kind: 'cert' })} />
        {pk && (
          <div class="sg-c bare st-facts">
            <span>
              <b class="z-min z-num">{pk.questions.length}</b>問
            </span>
            {!!pk.terms?.length && (
              <span>
                <b class="z-min z-num">{pk.terms.length}</b>語
              </span>
            )}
            <span>
              <b class="z-min z-num">{pk.passingScore}</b>/{pk.scoreMax} で合格
            </span>
            <span class="st-fv">v{pk.packVersion}</span>
          </div>
        )}
      </Group>
      {exam && (
        <section class="sg">
          <h3 class="sg-h">試験日</h3>
          <ExamDate value={exam.examDate} onChange={(v) => setExamDate(exam.certId, v)} />
          {exam.examDate && (
            <div class="sg-b st-gap">
              <button type="button" class="sg-c sg-center red" onClick={() => (sfx('tock'), setExamDate(exam.certId, ''))}>
                試験日を 消す
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function DataPage({ focusDelete }: { focusDelete: boolean }) {
  const pr = state.profile;
  const st = state.status;
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [del, setDel] = useState<Which | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusDelete) return;
    const t = setTimeout(() => document.getElementById('st-del')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }), 160);
    return () => clearTimeout(t);
  }, [focusDelete]);

  const pickFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const r = await readBackup(f);
    if (typeof r === 'string') {
      sfx('low');
      toast(r);
      return;
    }
    sfx('sheet');
    setPlan(r);
  };
  const doImport = () => {
    if (!plan) return;
    applyBackup(plan);
    setPlan(null);
    sfx('write');
    toast('読み込みました', { undo: true });
  };
  const doDelete = async () => {
    if (!del) return;
    const which = del;
    setDel(null);
    setBusy(true);
    await deleteData(which);
    setBusy(false);
    sfx('slash');
    buzz([10, 40, 20]);
    toast(`${BOOK[which]}を 消しました`);
  };
  const out = (f: () => void, what: string) => () => {
    f();
    sfx('write');
    toast(`${what}を 書き出しました`);
  };

  return (
    <>
      <Group head="まるごと 書き出す · JSON">
        <Cell g={G.book} label="個人の手帳" value="JSON" onClick={out(() => exportJson('p'), '個人の手帳')} />
        <Cell g={G.work} label="仕事の手帳" value="JSON" onClick={out(() => exportJson('w'), '仕事の手帳')} />
        <Cell g={G.out} label="すべて" value="JSON" onClick={out(() => exportJson('all'), 'すべての記録')} />
      </Group>

      <Group head="表で 書き出す · CSV">
        <Cell g={G.table} label="やること · 個人" value="CSV" onClick={out(() => exportCsv('p'), 'やること（個人）')} />
        <Cell g={G.table} label="やること · 仕事" value="CSV" onClick={out(() => exportCsv('w'), 'やること（仕事）')} />
        <Cell g={G.limit} label="成長の 記録" value="CSV" onClick={out(() => exportDaysCsv(), '成長の記録')} />
      </Group>

      <Group head="読み込む">
        <Cell g={G.in} label="JSON から 戻す" chev onClick={() => file.current?.click()} />
        <input ref={file} type="file" accept="application/json,.json" class="z-sr" tabIndex={-1} aria-hidden="true" onChange={pickFile} />
      </Group>
      {plan && (
        <div class="st-card z-light" role="group" aria-label="読み込む前の確認">
          <b>{plan.at ? `${when(Date.parse(plan.at))} の 記録` : '書き出した記録'}</b>
          <p>{[plan.personal && `個人 ${plan.personal.tasks.length}件`, plan.work && `仕事 ${plan.work.tasks.length}件`].filter(Boolean).join(' · ')}</p>
          <div class="st-acts">
            <button type="button" class="z-bk sm" onClick={doImport}>
              置きかえる
            </button>
            <button type="button" class="z-txb" onClick={() => setPlan(null)}>
              やめる
            </button>
          </div>
        </div>
      )}

      <Group head="消す" id="st-del">
        {(['p', 'w', 'all'] as const).map((w) => (
          <Cell key={w} g={G.trash} tone="r" label={w === 'all' ? 'すべて 消す' : `${BOOK[w]}を 消す`} red disabled={busy} onClick={() => (sfx('low'), setDel(del === w ? null : w))} />
        ))}
      </Group>
      {del && (
        <div class="st-card st-warn" role="alertdialog" aria-label={`${BOOK[del]}を 消す`}>
          <b>{BOOK[del]}を 消しますか</b>
          <p>
            {del === 'all' ? 'やること、学習、成長、図鑑、設定' : del === 'p' ? 'やること、学習、成長、図鑑、1日の記録' : '仕事の やることと 送った記録'}
            {' · '}この端末{(del === 'all' ? pr.sync.p || pr.sync.w : pr.sync[del]) && st.user ? 'と クラウド' : ''}から。元には 戻せません。
          </p>
          <div class="st-acts">
            <button type="button" class="st-kill" onClick={() => void doDelete()}>
              消す
            </button>
            <button type="button" class="z-txb" onClick={() => setDel(null)}>
              やめる
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function Settings({ args }: { args: string[] }) {
  const a0 = args[0] || '';
  const page: Page = a0 === 'nightly' ? 'ai' : (['account', 'ai', 'exam', 'data'] as const).includes(a0 as never) ? (a0 as Page) : '';
  const dir = useRef(page);
  const deeper = page !== '' && dir.current === '';
  dir.current = page;

  return (
    <Frame title={TITLE[page]} backTo={() => back(page ? 'settings' : 'today')} backLabel={page ? '設定' : 'もどる'}>
      <div class={`st-body${deeper ? ' in' : ''}`} key={page}>
        {page === '' && <Main />}
        {page === 'account' && <AccountPage />}
        {page === 'ai' && <AiPage focus={a0 === 'nightly'} />}
        {page === 'exam' && <ExamPage />}
        {page === 'data' && <DataPage focusDelete={args[1] === 'delete'} />}
      </div>
    </Frame>
  );
}
