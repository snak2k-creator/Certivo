// The exam day, picked the way a phone picks a date: the day itself large, a few one-tap distances, and the
// system calendar for anything else. Used by the first run and by 設定.
import { useRef } from 'preact/hooks';
import { addDays, dayDiff, dowName, md, ymd } from '../core/util';
import { buzz, sfx } from '../core/sfx';

const QUICK = [
  { label: '1か月後', days: 30 },
  { label: '2か月後', days: 60 },
  { label: '3か月後', days: 90 },
];

export function ExamDate({ value, onChange, light = false }: { value: string; onChange: (v: string) => void; light?: boolean }) {
  const inp = useRef<HTMLInputElement>(null);
  const now = ymd();
  const left = value ? dayDiff(now, value) : null;
  const set = (v: string) => {
    sfx(v ? 'write' : 'tock');
    buzz(5);
    onChange(v);
  };
  const open = () => {
    const el = inp.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <div class={`xd${light ? ' xd-l' : ''}`}>
      <button type="button" class={`xd-face${value ? ' on' : ''}`} onClick={open} aria-label={value ? `試験日 ${md(value)} ${dowName(value)}。変える` : '試験日を えらぶ'}>
        <b class="z-min z-num xd-day" key={value}>
          {value ? md(value) : '00.00'}
        </b>
        {value ? (
          <span class="xd-meta">
            <span class="z-tag z-tag-r">{dowName(value)}</span>
            <span class="xd-left">
              あと <b class="z-min z-num">{left}</b> 日
            </span>
          </span>
        ) : (
          <span class="xd-meta xd-pick">日付を えらぶ</span>
        )}
        <input
          ref={inp}
          type="date"
          class="xd-inp"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          min={now}
          onClick={(e) => {
            e.stopPropagation();
            try {
              (e.currentTarget as HTMLInputElement).showPicker();
            } catch {
              /* the native control opens on its own */
            }
          }}
          onChange={(e) => set((e.currentTarget as HTMLInputElement).value)}
        />
      </button>
      <div class="xd-quick" role="group" aria-label="すぐ えらぶ">
        {QUICK.map((q) => {
          const d = addDays(now, q.days);
          return (
            <button type="button" key={q.days} class={`xd-chip${value === d ? ' on' : ''}`} onClick={() => set(d)}>
              {q.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
