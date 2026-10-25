// Export, import and delete, per notebook or everything. Delete removes this device's copy and, when sync is
// on, the cloud copy too.
import type { Notebook, Personal, Profile, Task, Work } from './types';
import { dropUndo, newPersonal, newProfile, newWork, notebook, replace, snapshot, state, wipeLocal } from './store';
import { deleteRemote } from './cloud';
import { DIFF, skillName } from './game';
import { repeatLabel } from './tasks';
import { ymd } from './util';

export type Which = Notebook | 'all';
const NAME: Record<Which, string> = { p: 'personal', w: 'work', all: 'all' };

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

interface Backup { app: 'zan'; v: 1; kind: Which; exportedAt: string; profile?: Profile; personal?: Personal; work?: Work }

export function exportJson(which: Which) {
  const out: Backup = { app: 'zan', v: 1, kind: which, exportedAt: new Date().toISOString() };
  if (which !== 'w') {
    out.profile = state.profile;
    out.personal = state.p;
  }
  if (which !== 'p') out.work = state.w;
  download(`zan-${NAME[which]}-${ymd()}.json`, 'application/json', JSON.stringify(out, null, 1));
}

/** Spreadsheet apps run cells that start with these; a leading quote keeps them as text. */
function cell(v: unknown) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportCsv(nb: Notebook) {
  const head = ['題名', '日付', '時刻', '期限', '分', 'くり返し', '重さ', '分野', '済み', '済んだ日時', 'メモ', 'ラベル'];
  const done = (t: Task) => (t.repeat?.length ? Object.keys(t.doneOn || {}).length + '回' : t.doneAt ? '済み' : '');
  const when = (t: Task) => (t.doneAt ? new Date(t.doneAt).toLocaleString('ja-JP') : '');
  const rows = notebook(nb).tasks.map((t) => [t.title, t.date, t.time, t.due, t.mins, repeatLabel(t.repeat), DIFF[t.diff].name, nb === 'p' ? skillName(t.sk) : '', done(t), when(t), t.note, t.tag]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  download(`zan-${NAME[nb]}-tasks-${ymd()}.csv`, 'text/csv;charset=utf-8', csv);
}

/** One row a day: what the growth page counts. Personal notebook only; the work count is left out. */
export function exportDaysCsv() {
  const p = state.p;
  const dates = new Set(Object.keys(p.days));
  for (const sp of Object.values(p.study)) for (const d of Object.keys(sp.history)) dates.add(d);
  const head = ['日付', '経験値', '斬った数', '今日の三つ', '与えたダメージ', '討伐', '答えた問題', '正解', '朝の欠片'];
  const rows = [...dates]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .map((d) => {
      const r = p.days[d];
      const h = Object.values(p.study).map((sp) => sp.history[d]);
      return [d, r?.xp ?? 0, r?.slashes ?? 0, r?.three ? '済み' : '', r?.dmg ?? 0, r?.kills ?? 0, h.reduce((a, x) => a + (x?.a ?? 0), 0), h.reduce((a, x) => a + (x?.c ?? 0), 0), r?.kakera ? '済み' : ''];
    });
  const csv = '\ufeff' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  download(`zan-growth-${ymd()}.csv`, 'text/csv;charset=utf-8', csv);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validPersonal = (p: unknown): p is Personal => isObj(p) && Array.isArray(p.tasks) && isObj(p.game) && isObj(p.days) && isObj(p.study);
const validWork = (w: unknown): w is Work => isObj(w) && Array.isArray(w.tasks);

export interface ImportPlan { at: string; profile?: Profile; personal?: Personal; work?: Work }

/** Reads a backup file. Returns what it contains, or a message saying why it can't be used. */
export async function readBackup(file: File): Promise<ImportPlan | string> {
  if (file.size > 8_000_000) return 'ファイルが 大きすぎます';
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return 'ZAN の書き出しファイルでは ないようです';
  }
  if (!isObj(raw) || raw.app !== 'zan' || raw.v !== 1) return 'ZAN の書き出しファイルでは ないようです';
  const plan: ImportPlan = { at: typeof raw.exportedAt === 'string' ? raw.exportedAt : '' };
  if (raw.personal !== undefined) {
    if (!validPersonal(raw.personal)) return '個人の手帳の 中身が 読めません';
    plan.personal = raw.personal;
  }
  if (raw.work !== undefined) {
    if (!validWork(raw.work)) return '仕事の手帳の 中身が 読めません';
    plan.work = { ...raw.work, sent: Array.isArray(raw.work.sent) ? raw.work.sent : [] };
  }
  if (isObj(raw.profile)) plan.profile = raw.profile as unknown as Profile;
  if (!plan.personal && !plan.work) return '読み込めるものが ありません';
  return plan;
}

/** Replaces the notebooks in the file. One undo brings the old ones back. */
export function applyBackup(plan: ImportPlan) {
  const parts = [plan.personal ? 'p' : null, plan.work ? 'w' : null, plan.profile ? 'profile' : null].filter(Boolean) as ('p' | 'w' | 'profile')[];
  snapshot('読み込んだ', ...parts);
  if (plan.personal) replace('p', { ...plan.personal, updatedAt: Date.now() });
  if (plan.work) replace('w', { ...plan.work, updatedAt: Date.now() });
  if (plan.profile) {
    const keep = { sync: state.profile.sync, nightly: state.profile.nightly, aiAuto: state.profile.aiAuto, sound: state.profile.sound, haptics: state.profile.haptics, mode: state.profile.mode, onboarded: true };
    replace('profile', { ...plan.profile, ...keep, updatedAt: Date.now() });
  }
}

/** Deletes a notebook (or everything) here and, when it syncs, in the cloud. Cannot be undone. */
export async function deleteData(which: Which) {
  const parts: ('p' | 'w' | 'profile')[] = which === 'all' ? ['p', 'w', 'profile'] : [which];
  for (const part of parts) {
    const syncs = part === 'profile' ? state.profile.sync.p || state.profile.sync.w : state.profile.sync[part];
    if (syncs && state.status.user) {
      try {
        await deleteRemote(part);
      } catch {
        /* the local copy still goes; the person can delete the cloud copy again later */
      }
    }
  }
  for (const part of parts) {
    wipeLocal(part);
    if (part === 'p') replace('p', newPersonal(), true);
    else if (part === 'w') replace('w', newWork(), true);
    else replace('profile', newProfile(), true);
  }
  if (which === 'all') {
    try {
      localStorage.removeItem('zan:aiTried');
    } catch {
      /* fine */
    }
  }
  dropUndo();
}
