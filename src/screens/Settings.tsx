// 設定: the account and each notebook's sync, what may go to the AI (each off at first, with exactly what is
// sent), the exam date, the feel (sound, vibration, the morning opening) and the records: export, import, delete.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { state } from '../core/store';
import { aiCapNow, aiUsed, setExamDate, setProfile, today } from '../core/actions';
import { cloudConfigured, disableSync, enableSync, remoteInfo, signIn, signOut } from '../core/cloud';
import { applyBackup, deleteData, exportCsv, exportDaysCsv, exportJson, readBackup, type ImportPlan, type Which } from '../core/data';
import { aiBlocked } from '../core/ai';
import { activePack } from '../core/pack';
import { RECAP_HOUR } from '../core/recap';
import { buzz, sfx } from '../core/sfx';
import { hm, md, reducedMotion } from '../core/util';
import { toast } from '../ui/fx';
import { back } from '../ui/router';
import { ChevL, Google } from '../ui/icons';

const BOOK: Record<Which, string> = { p: '個人の手帳', w: '仕事の手帳', all: 'すべての記録' };
const when = (ts: number) => (ts ? `${md(new Date(ts).toISOString().slice(0, 10))} ${hm(new Date(ts))}` : '');

function Row({ title, sub, children, id, top }: { title: ComponentChildren; sub?: ComponentChildren; children?: ComponentChildren; id?: string; top?: boolean }) {
  return (
    <div class={`st-row${top ? ' top' : ''}`} id={id}>
      <span class="st-rt">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
      {children}
    </div>
  );
}

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      class={`z-sw st-sw${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        sfx('tock');
        buzz(5);
        onChange(!on);
      }}
    >
      <span class="z-swt">
        <i />
      </span>
    </button>
  );
}

/** What exactly goes out when a switch is on. */
function Sends({ items, never }: { items: string[]; never?: string }) {
  return (
    <div class="st-sends">
      <b>送るもの</b>
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {never && <p>{never}</p>}
    </div>
  );
}

export function Settings({ args }: { args: string[] }) {
  const pr = state.profile;
  const st = state.status;
  const pk = activePack();
  const cloud = cloudConfigured();
  const exam = pr.packs.find((x) => x.certId === pr.certId);
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState<{ part: 'p' | 'w'; tasks: number; at: number } | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [del, setDel] = useState<Which | null>(null);
  const [flash, setFlash] = useState('');
  const file = useRef<HTMLInputElement>(null);

  // settings/nightly opens at the nightly switch
  useEffect(() => {
    const target = args[0] === 'nightly' ? 'st-nightly' : '';
    if (!target) return;
    const t = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      setFlash(target);
    }, 120);
    return () => clearTimeout(t);
  }, [args[0]]);

  const login = async () => {
    if (busy) return;
    setBusy('login');
    try {
      if (await signIn()) {
        sfx('sheet');
        toast('ログインしました。同期は 手帳ごとに オンにできます');
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
    setBusy('delete');
    await deleteData(which);
    setBusy('');
    sfx('slash');
    buzz([10, 40, 20]);
    toast(`${BOOK[which]}を 消しました`);
  };

  const block = aiBlocked();
  const cap = aiCapNow();
  const used = aiUsed();
  const aiLine =
    block === 'off'
      ? 'この版では AI を 使っていません。まとめも 提案も、端末の中で 書きます。'
      : block === 'offline'
        ? 'いまは オフラインです。つながると 使えます。'
        : block === 'signin'
          ? 'AI を 使うには、ログインが 必要です。'
          : block === 'cap'
            ? `今月の ${cap}回を 使いきりました。来月まで、端末の中で 書きます。`
            : '';
  const limits = [20, 50, 100].filter((n) => n < pr.aiCap);
  const sent = state.w.sent.slice(0, 3);

  return (
    <div class="m-page bare st">
      <header class="m-bar z-grain st-bar">
        <button type="button" class="st-back" onClick={() => back('today')}>
          <ChevL />
          もどる
        </button>
      </header>
      <div class="st-top">
        <b class="z-min st-title">設定</b>
        <span class="m-sub">変えたことは、この端末に すぐ 残ります。</span>
      </div>

      {/* account */}
      <div class="z-sec st-sec">
        <b>アカウント</b>
        <i />
      </div>
      {!cloud ? (
        <Row title="Google ログイン" sub="この版では 使えません。記録は この端末だけに 残ります。" />
      ) : st.user ? (
        <Row title={st.user.name || 'Google アカウント'} sub="ログイン中。同期は 手帳ごとに 決めます。">
          <button type="button" class="z-bo" disabled={busy === 'logout'} onClick={logout}>
            ログアウト
          </button>
        </Row>
      ) : (
        <Row title="ログインしていません" sub="ログインしなくても、すべて この端末で 使えます。ログインすると、手帳ごとに 同期できます。" top>
          <button type="button" class="z-bw sm st-google" disabled={busy === 'login'} onClick={login} aria-busy={busy === 'login'}>
            <Google size={16} />
            {busy === 'login' ? 'つないでいます…' : 'ログイン'}
          </button>
        </Row>
      )}

      {/* sync */}
      {cloud && (
        <>
          <div class="z-sec st-sec">
            <b>同期</b>
            <i />
            <span>はじめは オフ</span>
          </div>
          {(['p', 'w'] as const).map((part) => (
            <Row
              key={part}
              title={BOOK[part]}
              sub={
                !st.user
                  ? 'ログインすると 選べます'
                  : busy === 'sync-' + part
                    ? 'つないでいます…'
                    : pr.sync[part]
                      ? st.syncing
                        ? '同期しています…'
                        : '同期は オン'
                      : 'オフ · この端末だけ'
              }
            >
              <Switch on={pr.sync[part]} label={`${BOOK[part]}を 同期する`} disabled={!st.user || busy === 'sync-' + part} onChange={(v) => (v ? void syncOn(part) : syncOff(part))} />
            </Row>
          ))}
          {pick && (
            <div class="st-card z-light" role="group" aria-label="どちらの記録を 使うか">
              <b>クラウドにも {BOOK[pick.part]}が あります</b>
              <p>
                やること {pick.tasks}件{pick.at ? ` · 最後の更新 ${when(pick.at)}` : ''}。どちらに そろえますか。そろえなかった ほうは 上書きされます。
              </p>
              <div class="st-acts">
                <button type="button" class="z-bk sm" onClick={() => void choose('device')}>
                  この端末の記録
                </button>
                <button type="button" class="z-bo2" onClick={() => void choose('cloud')}>
                  クラウドの記録
                </button>
                <button type="button" class="z-txb" onClick={() => setPick(null)}>
                  やめる
                </button>
              </div>
            </div>
          )}
          <p class="st-note">個人と仕事は、別々の場所に 保存します。{st.syncError && <em>{st.syncError}</em>}</p>
        </>
      )}

      {/* AI */}
      <div class="z-sec st-sec">
        <b>AI</b>
        <i />
        <span>どれも はじめは オフ</span>
      </div>
      {aiLine ? (
        <p class="st-ai0">{aiLine}</p>
      ) : (
        <div class="st-use" aria-label={`今月 ${used} / ${cap} 回`}>
          <span>今月</span>
          <b class="z-min z-num">{used}</b>
          <span>/ {cap} 回</span>
          <span class="st-useb">
            <i style={{ width: `${Math.min(100, Math.round((used / Math.max(1, cap)) * 100))}%` }} />
          </span>
        </div>
      )}
      <Row id="st-nightly" title="毎晩のまとめ" sub={`毎晩 ${RECAP_HOUR}:00 に、1日の記録を AI が 書きなおします。`}>
        <Switch
          on={pr.nightly}
          label="毎晩のまとめを AI に 頼む"
          onChange={(v) => {
            setProfile({ nightly: v });
            toast(v ? `毎晩 ${RECAP_HOUR}:00 に、まとめます` : '毎晩のまとめを 止めました。端末の中で 書きます');
          }}
        />
      </Row>
      <div class={`st-detail${flash === 'st-nightly' ? ' flash' : ''}`}>
        <Sends
          items={['個人の手帳の その日の数字（解いた問題と 正解の数、斬った数、経験値、続いた日数）', '斬った やることの 題名（6件まで）', '今週の敵の 名前と 与えたダメージ', '迷った分野の 名前（2つまで）']}
          never="仕事の手帳からは、済んだ 件数だけ。題名も 中身も 送りません。"
        />
      </div>
      <Row title="朝の提案と 影の名前" sub="今日の一問の 提案と、週の影の 名前と 台詞を AI が 考えます。">
        <Switch
          on={pr.aiAuto}
          label="朝の提案と 影の名前を AI に 頼む"
          onChange={(v) => {
            setProfile({ aiAuto: v });
            toast(v ? '朝の提案と 影の名前を、AI に 頼みます' : '止めました。端末の中で 決めます');
          }}
        />
      </Row>
      <div class="st-detail">
        <Sends items={['問題集の 分野の名前、きのう 迷った数、正答率、試験までの 日数', '影の型と、生まれた 分野の名前']} never="やることの 題名は 送りません。" />
      </div>
      <Row title="問題の 解説" sub="問題の画面で「AI に聞く」を 押したときだけ、その問題文と 選んだ答えを 送ります。" />
      <Row title="仕事の 段取り" sub="送る前に 確かめた、題名と 時刻だけを 送ります。">
        {sent.length > 0 && <span class="st-count">{state.w.sent.length}回</span>}
      </Row>
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
      <Row title="月の上限" sub="この端末から 使う回数。超えたら、端末の中で 書きます。" top>
        <span class="st-chips" role="radiogroup" aria-label="月の上限">
          {limits.map((n) => (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={pr.aiLimit === n}
              class={`st-chip${pr.aiLimit === n ? ' on' : ''}`}
              onClick={() => {
                sfx('tock');
                setProfile({ aiLimit: n });
              }}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={!pr.aiLimit || pr.aiLimit >= pr.aiCap}
            class={`st-chip${!pr.aiLimit || pr.aiLimit >= pr.aiCap ? ' on' : ''}`}
            onClick={() => {
              sfx('tock');
              setProfile({ aiLimit: 0 });
            }}
          >
            {pr.aiCap}
            <small>最大</small>
          </button>
        </span>
      </Row>

      {/* exam */}
      <div class="z-sec st-sec">
        <b>試験</b>
        <i />
      </div>
      {pk && <Row title={`${pk.code} · ${pk.name}`} sub={`問題集 v${pk.packVersion} · ${pk.questions.length}問 · ${pk.passingScore} / ${pk.scoreMax} で合格`} />}
      {exam && (
        <Row title="試験日" sub={exam.examDate ? '朝の幕あけと 合格の見込みが、この日に 合わせます。' : '決めると、本番までの 見込みが 出ます。'}>
          <span class="st-date">
            <input
              type="date"
              class="st-inp z-num"
              value={exam.examDate}
              min={today()}
              aria-label="試験日"
              onChange={(e) => {
                setExamDate(exam.certId, (e.currentTarget as HTMLInputElement).value);
                sfx('write');
              }}
            />
            {exam.examDate && (
              <button type="button" class="z-txb" onClick={() => setExamDate(exam.certId, '')}>
                消す
              </button>
            )}
          </span>
        </Row>
      )}

      {/* feel */}
      <div class="z-sec st-sec">
        <b>手ざわり</b>
        <i />
      </div>
      <Row title="音" sub="斬ったとき、答えたときの 短い音。">
        <Switch on={pr.sound} label="音" onChange={(v) => setProfile({ sound: v })} />
      </Row>
      <Row title="振動" sub="対応している 端末だけ。">
        <Switch on={pr.haptics} label="振動" onChange={(v) => setProfile({ haptics: v })} />
      </Row>
      <Row title="朝の幕あけ" sub="その日 はじめて ひらいたときの、2秒の 演出。動きを 控えめに しているときは 出ません。">
        <Switch on={pr.ritual} label="朝の幕あけ" onChange={(v) => setProfile({ ritual: v })} />
      </Row>
      <Row title="動きを 控えめに" sub="揺れ、光、切り込みの 演出を止めて、画面の 動きを 最小にします。端末で 動きを減らす 設定に しているときも、こうなります。">
        <Switch on={!!pr.calm} label="動きを 控えめに" onChange={(v) => setProfile({ calm: v })} />
      </Row>

      {/* records */}
      <div class="z-sec st-sec">
        <b>記録</b>
        <i />
        <span>この端末の中に あります</span>
      </div>
      <Row title="まるごと 書き出す" sub="JSON。あとで ここから 読み込めます。" top>
        <span class="st-btns">
          {(['p', 'w', 'all'] as const).map((w) => (
            <button
              type="button"
              key={w}
              class="z-bo"
              onClick={() => {
                exportJson(w);
                sfx('write');
              }}
            >
              {w === 'p' ? '個人' : w === 'w' ? '仕事' : 'すべて'}
            </button>
          ))}
        </span>
      </Row>
      <Row title="表で 書き出す" sub="CSV。やることの一覧と、一日ごとの 成長の記録。" top>
        <span class="st-btns">
          <button type="button" class="z-bo" onClick={() => exportCsv('p')}>
            個人
          </button>
          <button type="button" class="z-bo" onClick={() => exportCsv('w')}>
            仕事
          </button>
          <button type="button" class="z-bo" onClick={() => exportDaysCsv()}>
            成長
          </button>
        </span>
      </Row>
      <Row title="読み込む" sub="書き出した JSON から 戻します。いまの記録と 置きかわります。">
        <button type="button" class="z-bo" onClick={() => file.current?.click()}>
          ファイルを えらぶ
        </button>
        <input ref={file} type="file" accept="application/json,.json" class="z-sr" tabIndex={-1} aria-hidden="true" onChange={pickFile} />
      </Row>
      {plan && (
        <div class="st-card z-light" role="group" aria-label="読み込む前の確認">
          <b>{plan.at ? `${when(Date.parse(plan.at))} に 書き出した記録` : '書き出した記録'}</b>
          <p>
            {[plan.personal && `個人の手帳（やること ${plan.personal.tasks.length}件）`, plan.work && `仕事の手帳（やること ${plan.work.tasks.length}件）`].filter(Boolean).join('、')}
            。いまの 記録と 置きかわります。読み込んだ すぐあとなら、元に 戻せます。
          </p>
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
      <Row title="消す" sub={`この端末から 消します。同期が オンの 手帳は、クラウドからも 消えます。`} top>
        <span class="st-btns">
          {(['p', 'w', 'all'] as const).map((w) => (
            <button
              type="button"
              key={w}
              class={`z-bo st-del${del === w ? ' on' : ''}`}
              disabled={busy === 'delete'}
              onClick={() => {
                sfx('low');
                setDel(del === w ? null : w);
              }}
            >
              {w === 'p' ? '個人' : w === 'w' ? '仕事' : 'すべて'}
            </button>
          ))}
        </span>
      </Row>
      {del && (
        <div class="st-card st-warn" role="alertdialog" aria-label={`${BOOK[del]}を 消す`}>
          <b>{BOOK[del]}を、本当に 消しますか</b>
          <p>
            {del === 'all' ? 'やること、学習、成長、図鑑、設定が' : del === 'p' ? 'やること、学習、成長、図鑑、1日の記録が' : '仕事の やることと 送った記録が'}
            、この端末{(del === 'all' ? pr.sync.p || pr.sync.w : pr.sync[del]) && st.user ? 'と クラウド' : ''}から 消えます。元には 戻せません。先に「まるごと 書き出す」で 残しておけます。
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

      <p class="st-foot">
        ゲームの数字は、自分の 励みの ためのもの。職場で 使うときも、評価や 人との 比較には 使わないでください。
        <span>ZAN{pk ? ` · ${pk.code} 問題集 v${pk.packVersion}` : ''}</span>
      </p>
    </div>
  );
}
