// Enemy art: geometric shadows with a red core, fine halo linework and one huge Mincho kanji behind.
// Each function returns the inside of an <svg viewBox="0 0 320 320">. Class names are hooks for animation.
import type { EnemyType } from '../core/types';
import { esc, seeded } from '../core/util';

const K0 = '#121214';
const K1 = '#151517';
const K2 = '#1A1A1C';
const K3 = '#1F1F22';
const K4 = '#242427';
const W = '#E6E2DA';
const R = '#D04D3A';
/** the big core disk: deeper than the accent red, so a large area of it stays easy on the eyes */
const RD = '#AE3E2E';
const MIN = `font-family="'Shippori Mincho B1',serif" font-weight="800"`;

type Pt = [number, number];
const f = (n: number) => n.toFixed(1);
const i = (n: number) => String(Math.trunc(n));
const rad = (a: number) => (a * Math.PI) / 180;
const rim = (a = 0.55, w = 1) => `stroke="rgba(234,231,224,${a})" stroke-width="${w}"`;
const P = (seq: Pt[]) => seq.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const poly = (seq: Pt[], fill: string, extra = '') => `<polygon points="${P(seq)}" fill="${fill}" ${extra}/>`;
const mir = (seq: Pt[], cx = 160): Pt[] => seq.map(([x, y]) => [2 * cx - x, y]);

function kanji(ch: string, x: number, y: number, size: number, rot = 0, op = 0.06) {
  const t = rot ? ` transform="rotate(${i(rot)} ${i(x)} ${i(y)})"` : '';
  return `<text x="${i(x)}" y="${i(y)}" text-anchor="middle" dominant-baseline="central" font-size="${i(size)}" fill="rgba(234,231,224,${op})" ${MIN}${t}>${ch}</text>`;
}

function eye(x: number, y: number, w: number, h: number, cls = '', pupil = true, rot = 0) {
  const t = rot ? ` transform="rotate(${i(rot)} ${f(x)} ${f(y)})"` : '';
  let s = `<g class="${cls}"${t}><path d="M${f(x)} ${f(y - h / 2)}Q${f(x + w / 2 + 2)} ${f(y)} ${f(x)} ${f(y + h / 2)}Q${f(x - w / 2 - 2)} ${f(y)} ${f(x)} ${f(y - h / 2)}Z" fill="${R}" stroke="rgba(234,231,224,.8)" stroke-width=".9"/>`;
  if (pupil) s += `<path d="M${f(x)} ${f(y - h / 2 + 3)}V${f(y + h / 2 - 3)}" stroke="${K0}" stroke-width="${f(Math.max(1.4, w / 6))}" stroke-linecap="round"/>`;
  return s + '</g>';
}

function ring(cx: number, cy: number, r: number, a = 0.14, w = 1, dash = '') {
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" ${rim(a, w)}${d}/>`;
}

function ticks(cx: number, cy: number, r1: number, r2: number, n: number, a = 0.3, w = 1, start = 0, span = 360, longEvery = 0, r1l = 0) {
  const out: string[] = [];
  const count = n + (span === 360 ? 0 : 1);
  for (let k = 0; k < count; k++) {
    const ang = rad(start + (span * k) / n);
    const long = longEvery && k % longEvery === 0;
    const rr = long && r1l ? r1l : r1;
    out.push(`<line x1="${f(cx + rr * Math.cos(ang))}" y1="${f(cy + rr * Math.sin(ang))}" x2="${f(cx + r2 * Math.cos(ang))}" y2="${f(cy + r2 * Math.sin(ang))}" ${rim(long ? Math.min(1, a * 2.4) : a, w)}/>`);
  }
  return out.join('');
}

/* ---------------------------------------------------------------- 縛鎖: the binding ring (weak point: order) */
export interface BakusaOpts { labels?: string[]; ids?: string[]; gone?: string[]; scars?: number; plates?: boolean; broken?: boolean }
export function bakusa(o: BakusaOpts = {}) {
  const labels = o.labels ?? ['チャンク分割', '埋め込み', 'インデックス', '検索'];
  const ids = o.ids ?? ['p1', 'p2', 'p3', 'p4'];
  const gone = o.gone ?? [];
  const scars = o.scars ?? 0;
  const out = [kanji('鎖', 168, 168, 300, 0, 0.05), `<circle cx="160" cy="146" r="94" fill="${RD}"/>`, ring(160, 146, 116, 0.16), ring(160, 146, 126, 0.1, 1, '2 6'), `<path d="M160 0V320" ${rim(0.08)}/>`];
  const erx = 128, ery = 46, tilt = -13, ocx = 160, ocy = 182;
  const ept = (t: number): Pt => {
    const x = erx * Math.cos(rad(t));
    const y = ery * Math.sin(rad(t));
    const c = Math.cos(rad(tilt));
    const s = Math.sin(rad(tilt));
    return [ocx + x * c - y * s, ocy + x * s + y * c];
  };
  const tangent = (t: number) => {
    const [x1, y1] = ept(t - 0.5);
    const [x2, y2] = ept(t + 0.5);
    return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  };
  const back: string[] = [];
  const front: string[] = [];
  let k = 0;
  for (let t = 0; t < 360; t += 360 / 62, k++) {
    const [x, y] = ept(t);
    const ang = tangent(t);
    const isFront = Math.sin(rad(t)) > 0;
    const sc = isFront ? 1 : 0.8;
    const op = isFront ? 1 : 0.55;
    const s =
      k % 2 === 0
        ? `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)}) scale(${sc.toFixed(2)})" opacity="${op.toFixed(2)}"><ellipse rx="8.6" ry="4.6" fill="none" stroke="#3A3A41" stroke-width="3.2"/><ellipse rx="8.6" ry="4.6" fill="none" ${rim(0.6, 0.8)}/></g>`
        : `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)}) scale(${sc.toFixed(2)})" opacity="${op.toFixed(2)}"><rect x="-8" y="-2" width="16" height="4" rx="2" fill="#2E2E34" ${rim(0.45, 0.7)}/></g>`;
    if (!(o.broken && k % 9 <= 1)) (isFront ? front : back).push(s);
  }
  [48, 132, 228, 312].forEach((t, n) => {
    const lab = labels[n];
    const pid = ids[n];
    if (lab === undefined || pid === undefined) return;
    const [x, y] = ept(t);
    const isFront = Math.sin(rad(t)) > 0;
    const w = Math.max(80, lab.length * 10.2 + 26);
    const h = 27;
    const hw = w / 2;
    const shape: Pt[] = [[-hw, 0], [-hw + 9, -h / 2], [hw - 9, -h / 2], [hw, 0], [hw - 9, h / 2], [-hw + 9, h / 2]];
    const st = gone.includes(pid) ? ' bk-gone' : '';
    const g =
      `<g transform="translate(${f(x)} ${f(y)}) scale(${(isFront ? 1 : 0.86).toFixed(2)})"${isFront ? '' : ' opacity=".9"'}><g class="bk-pl bk-${pid}${st}" data-plate="${pid}">` +
      poly(shape, K2, rim(0.7, 1.1)) +
      poly(shape.map(([px, py]) => [px * 0.92, py * 0.74] as Pt), 'none', rim(0.14, 0.8)) +
      poly([[-hw + 12, -4], [-hw + 16, 0], [-hw + 12, 4], [-hw + 8, 0]], R) +
      `<text x="5" y="4" text-anchor="middle" font-size="10.5" letter-spacing=".02em" fill="${W}" ${MIN}>${esc(lab)}</text>` +
      `<path class="bk-x" d="M${f(-hw - 6)} 12L${f(hw + 6)} -12" stroke="${R}" stroke-width="2.4"/></g></g>`;
    if (o.plates !== false) (isFront ? front : back).push(g);
  });
  out.push(`<g class="bk-back">${back.join('')}</g>`);
  const top = 14, bot = 306, mid = 146, hw = 36;
  out.push('<g class="bk-body">');
  out.push(poly([[160, top], [160 - hw, mid], [160, bot]], K4));
  out.push(poly([[160, top], [160 + hw, mid], [160, bot]], K2));
  out.push(poly([[160, top + 40], [160 - hw + 12, mid], [160, bot - 50]], 'rgba(255,255,255,.035)'));
  for (let n = 1; n < 9; n++) {
    const yy = top + ((mid - top) * n) / 9;
    out.push(`<path d="M${f(160 - (hw * n) / 9)} ${f(yy)}L160 ${f(yy + 7)}L${f(160 + (hw * n) / 9)} ${f(yy)}" fill="none" ${rim(0.1)}/>`);
  }
  for (let n = 1; n < 7; n++) {
    const yy = mid + ((bot - mid) * n) / 7;
    out.push(`<path d="M${f(160 - hw * (1 - n / 7))} ${f(yy)}L160 ${f(yy - 6)}L${f(160 + hw * (1 - n / 7))} ${f(yy)}" fill="none" ${rim(0.1)}/>`);
  }
  out.push(poly([[160, top], [160 + hw, mid], [160, bot], [160 - hw, mid]], 'none', rim(0.7, 1.2)));
  out.push(`<path d="M160 ${top}V${bot}" ${rim(0.18)}/>`);
  out.push(ring(160, mid, 24, 0.5, 1) + ticks(160, mid, 28, 33, 24, 0.35, 1));
  out.push(eye(160, mid, 13, 40, 'bk-eye'));
  for (let n = 0; n < Math.min(3, scars); n++) {
    const yy = [96, 214, 250][n];
    out.push(`<path d="M128 ${yy + 10}L192 ${yy - 12}" stroke="${R}" stroke-width="2.2"/><path d="M130 ${f(yy + 9.3)}L190 ${f(yy - 11.3)}" stroke="rgba(255,255,255,.7)" stroke-width=".7"/>`);
  }
  out.push('</g>');
  out.push(`<g class="bk-front">${front.join('')}</g>`);
  return out.join('\n');
}

/** Where 縛鎖's four plates sit, in viewBox units, so a battle can aim its cuts at them. */
export function bakusaPlates(): Record<'p1' | 'p2' | 'p3' | 'p4', Pt> {
  const erx = 128, ery = 46, tilt = -13, ocx = 160, ocy = 182;
  const at = (t: number): Pt => {
    const x = erx * Math.cos(rad(t));
    const y = ery * Math.sin(rad(t));
    return [ocx + x * Math.cos(rad(tilt)) - y * Math.sin(rad(tilt)), ocy + x * Math.sin(rad(tilt)) + y * Math.cos(rad(tilt))];
  };
  return { p1: at(48), p2: at(132), p3: at(228), p4: at(312) };
}

/* ---------------------------------------------------------------- 双影: the twins (weak point: telling two apart) */
export function souei(a = 'LLM', b = 'SLM') {
  const o = [kanji('双', 160, 170, 300, 0, 0.05)];
  o.push(`<path d="M160 52A100 100 0 0 0 160 252Z" fill="${RD}" transform="translate(-4 -12)"/>`);
  o.push(`<path d="M160 52A100 100 0 0 1 160 252" fill="none" ${rim(0.55, 1.2)} transform="translate(4 12)"/>`);
  let marks = '';
  for (let y = 30; y < 300; y += 18) marks += `<path d="M154 ${y}H166" ${rim(0.3)}/>`;
  o.push(`<path d="M160 6V314" ${rim(0.22)}/>` + marks);
  o.push(`<ellipse cx="160" cy="214" rx="150" ry="26" fill="none" transform="rotate(-6 160 214)" ${rim(0.3)}/>`);
  const blade = (cx: number, lean: number, real: boolean, label: string) => {
    const top = 36, bot = 300, mid = 150, hw = 25;
    const g = [`<g transform="rotate(${lean} ${cx} ${mid})">`];
    g.push(poly([[cx, top], [cx - hw, mid], [cx, bot]], W));
    g.push(poly([[cx, top], [cx + hw, mid], [cx, bot]], '#D9D6CF'));
    g.push(`<path d="M${cx} ${top}V${bot}" stroke="rgba(18,18,20,.2)" stroke-width="1"/>`);
    for (const n of [1, 2, 3]) {
      const yy = mid - 30 * n;
      const ww = hw * (1 - (30 * n) / (mid - top));
      g.push(`<path d="M${f(cx - ww)} ${f(yy)}L${cx} ${f(yy + 6)}L${f(cx + ww)} ${f(yy)}" fill="none" stroke="rgba(18,18,20,.16)" stroke-width="1"/>`);
    }
    if (real) g.push(eye(cx, mid - 2, 11, 34, 'so-eye'));
    else g.push(`<path d="M${cx} ${f(mid - 19)}Q${f(cx + 7.5)} ${f(mid - 2)} ${cx} ${f(mid + 15)}Q${f(cx - 7.5)} ${f(mid - 2)} ${cx} ${f(mid - 19)}Z" fill="none" stroke="${K0}" stroke-width="1.6"/>`);
    g.push(`<text x="${cx}" y="${mid + 64}" text-anchor="middle" font-size="10" letter-spacing=".16em" fill="rgba(18,18,20,.62)" ${MIN}>${esc(label)}</text>`);
    g.push('</g>');
    return g.join('');
  };
  o.push(`<g class="so-a">${blade(118, 8, true, a)}</g>`);
  o.push(`<g class="so-b">${blade(202, -8, false, b)}</g>`);
  o.push(`<g class="so-dots"><circle cx="12" cy="228" r="3.4" fill="${W}"/><circle cx="308" cy="198" r="3.4" fill="${R}"/></g>`);
  return o.join('\n');
}

/* ---------------------------------------------------------------- 逆吊: the hanging spire (weak point: negation) */
export function sakazuri(word = 'ではない') {
  const o = [kanji('逆', 160, 150, 290, 180, 0.05), `<circle cx="160" cy="318" r="112" fill="${RD}"/>`, ring(160, 318, 132, 0.14)];
  o.push(`<path d="M118 0L148 46M202 0L172 46M160 0V40" ${rim(0.4)}/>`);
  const g: string[] = [];
  const bands = 8, top = 42, tip = 286;
  for (let k = 0; k < bands; k++) {
    const y1 = top + (((tip - top) * k) / bands) * 0.92;
    const y2 = top + (((tip - top) * (k + 1)) / bands) * 0.92;
    const w1 = 74 * (1 - k / bands) ** 1.05;
    const w2 = 74 * (1 - (k + 1) / bands) ** 1.05;
    const band: Pt[] = [[160 - w1, y1], [160 + w1, y1], [160 + w2, y2 + 10], [160, y2 + 18], [160 - w2, y2 + 10]];
    g.push(poly([band[0], [160, y1 + 8], [160, y2 + 18], band[4]], k % 2 === 0 ? K4 : K3));
    g.push(poly([[160, y1 + 8], band[1], band[2], [160, y2 + 18]], k % 2 === 0 ? K2 : K1));
    g.push(poly(band, 'none', rim(0.55, 1)));
    if (k === 1 || k === 3 || k === 5) g.push(`<path d="M${f(160 - w2 + 4)} ${f(y2 + 6)}L160 ${f(y2 + 13)}L${f(160 + w2 - 4)} ${f(y2 + 6)}" fill="none" stroke="${R}" stroke-width="2" stroke-dasharray="2 3.2"/>`);
  }
  g.push(poly([[151, tip - 30], [169, tip - 30], [160, tip + 8]], W));
  g.push(`<text x="160" y="70" text-anchor="middle" font-size="12.5" letter-spacing=".24em" fill="rgba(234,231,224,.85)" ${MIN} transform="rotate(180 160 66)">${esc(word)}</text>`);
  g.push(eye(160, 214, 12, 30, 'sk-eye', true, 180));
  g.push(`<path d="M160 296V318" ${rim(0.5)}/>`);
  o.push(`<g class="sk-body">${g.join('')}</g>`);
  return o.join('\n');
}

/* ---------------------------------------------------------------- 霧中: the eye in the fog (weak point: the deciding condition) */
export function muchu() {
  const o = [kanji('霧', 160, 160, 300, 0, 0.045)];
  const rnd = seeded(7);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const cy = 160, ex = 130;
  const lines: string[] = [];
  for (let n = 0; n < 46; n++) {
    const y = 14 + n * 6.6;
    const dy = Math.abs(y - cy);
    const inside = dy < 62;
    const half = inside ? ex * Math.sqrt(Math.max(0, 1 - (dy / 64) ** 2)) : 0;
    let x = -20 + rnd() * 40;
    while (x < 320) {
      const ww = pick([18, 30, 44, 62, 90]);
      const gap = pick([6, 10, 16, 28]);
      let a = 0.1 + 0.1 * rnd();
      if (inside && Math.abs(x + ww / 2 - 160) < half + 30) a = 0.05;
      lines.push(`<rect x="${f(x)}" y="${f(y)}" width="${ww}" height="1.6" fill="rgba(234,231,224,${a.toFixed(2)})"/>`);
      x += ww + gap;
    }
  }
  o.push(`<g class="mu-fog">${lines.join('')}</g>`);
  const bars: string[] = [];
  for (let n = -9; n < 10; n++) {
    const y = cy + n * 6.6;
    const dy = Math.abs(n * 6.6);
    const half = ex * Math.sqrt(Math.max(0, 1 - (dy / 64) ** 2));
    if (half < 4) continue;
    bars.push(`<rect x="${f(160 - half)}" y="${f(y - 2.2)}" width="${f(half * 2)}" height="4.4" fill="${K3}"/>`);
    const ir = 46;
    if (dy < ir) {
      const ih = Math.sqrt(ir * ir - dy * dy);
      bars.push(`<rect x="${f(160 - ih)}" y="${f(y - 2.2)}" width="${f(ih * 2)}" height="4.4" fill="${R}"/>`);
    }
    bars.push(`<rect x="${f(160 - half)}" y="${f(y - 2.2)}" width="${f(half * 2)}" height=".8" fill="rgba(234,231,224,.35)"/>`);
  }
  o.push(`<g class="mu-eye">${bars.join('')}</g>`);
  o.push(`<path d="M${160 - ex - 6} ${cy}Q160 ${cy - 92} ${160 + ex + 6} ${cy}Q160 ${cy + 92} ${160 - ex - 6} ${cy}Z" fill="none" ${rim(0.7, 1.2)}/>`);
  o.push(`<rect x="156.5" y="${cy - 44}" width="7" height="88" rx="3.5" fill="${K0}" class="mu-pupil"/>`);
  o.push(`<rect x="42" y="${f(cy + 8 * 6.6 - 1.2 + 52)}" width="58" height="2.4" fill="${W}" class="mu-key"/>`);
  return o.join('\n');
}

/* ---------------------------------------------------------------- 驕慢: the crowned mirror (weak point: overconfidence) */
export function kyoman() {
  const cx = 160, cy = 122;
  const o = [kanji('驕', 160, 176, 290, 0, 0.05), `<circle cx="${cx}" cy="${cy}" r="92" fill="${RD}"/>`];
  const sw: string[] = [];
  for (let n = 0; n < 36; n++) {
    const a = -90 + n * 10;
    const L1 = 104;
    const L2 = 116 + 46 * Math.max(0, -Math.sin(rad(a))) ** 1.5;
    if (a + 90 > 20 && a + 90 < 340 && Math.sin(rad(a)) > 0.55) continue;
    const x1 = cx + L1 * Math.cos(rad(a)), y1 = cy + L1 * Math.sin(rad(a));
    const x2 = cx + L2 * Math.cos(rad(a)), y2 = cy + L2 * Math.sin(rad(a));
    const d: Pt = [Math.cos(rad(a)), Math.sin(rad(a))];
    const nn: Pt = [-d[1], d[0]];
    sw.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${rim(0.75, 1.3)}/>`);
    sw.push(poly([[x2 + 2.6 * nn[0], y2 + 2.6 * nn[1]], [x2 + 12 * d[0], y2 + 12 * d[1]], [x2 - 2.6 * nn[0], y2 - 2.6 * nn[1]]], W));
    sw.push(`<line x1="${f(x1 - 4 * nn[0])}" y1="${f(y1 - 4 * nn[1])}" x2="${f(x1 + 4 * nn[0])}" y2="${f(y1 + 4 * nn[1])}" ${rim(0.75, 1.3)}/>`);
  }
  o.push(`<g class="ky-halo">${sw.join('')}</g>`);
  o.push(ring(cx, cy, 100, 0.3, 1));
  const cloak: Pt[] = [[160, 168], [120, 182], [64, 214], [18, 320], [160, 320]];
  o.push(poly(cloak, K3));
  o.push(poly(mir(cloak), K2));
  const sh: Pt[] = [[120, 182], [64, 214], [30, 206], [96, 176]];
  o.push(poly(sh, K4, rim(0.6)));
  o.push(poly(mir(sh), K3, rim(0.6)));
  o.push(`<path d="M64 214L18 320M256 214L302 320" ${rim(0.4)}/>`);
  o.push(`<path d="M70 230L150 196M250 230L170 196" stroke="${R}" stroke-width="2.2" stroke-dasharray="2.2 3.4"/>`);
  o.push(poly([[160, 236], [170, 248], [160, 260], [150, 248]], R) + poly([[160, 230], [176, 248], [160, 266], [144, 248]], 'none', rim(0.8, 1.1)));
  o.push(`<path d="M160 270V320" ${rim(0.22)}/>`);
  const face: Pt[] = [[160, 62], [184, 70], [199, 96], [198, 128], [186, 156], [160, 188], [134, 156], [122, 128], [121, 96], [136, 70]];
  o.push(
    [
      '<g class="ky-mask" transform="rotate(-7 160 126)">',
      poly(face, '#E6E3DC'),
      poly([[160, 62], [136, 70], [121, 96], [122, 128], [160, 118]], W),
      poly([[160, 62], [184, 70], [199, 96], [198, 128], [160, 118]], '#D5D1C9'),
      poly([[122, 128], [134, 156], [160, 188], [160, 140]], '#ECE9E3'),
      poly([[198, 128], [186, 156], [160, 188], [160, 140]], '#BDB8AF'),
      '<path d="M160 62V188M121 96L160 104L199 96" fill="none" stroke="rgba(18,18,20,.16)" stroke-width="1"/>',
      '<path d="M122 128L160 140L198 128" fill="none" stroke="rgba(18,18,20,.22)" stroke-width="1"/>',
      `<path d="M118 112L160 121L202 112" fill="none" stroke="${R}" stroke-width="3.4" stroke-linejoin="miter"/>`,
      '<path d="M124 112.6L160 120.4L196 112.6" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8"/>',
      poly(face, 'none', 'stroke="rgba(18,18,20,.5)" stroke-width="1"'),
      '</g>',
    ].join(''),
  );
  return o.join('\n');
}

/* ---------------------------------------------------------------- 残像: the afterimage (weak point: shaky recall) */
export function zanzo() {
  const o = [kanji('残', 160, 166, 300, 0, 0.05)];
  const ghosts: [number, number][] = [[4, 0.1], [3, 0.16], [2, 0.26], [1, 0.4]];
  for (const [k, a] of ghosts) o.push(ring(196 - 26 * k, 150, 84, a, 1.2));
  o.push(`<circle cx="196" cy="150" r="84" fill="${RD}"/>`);
  const streaks: [number, number, number, number][] = [[8, 92, 120, 0.25], [20, 132, 96, 0.18], [0, 206, 140, 0.22], [30, 246, 110, 0.16], [12, 282, 150, 0.2]];
  o.push(streaks.map(([x1, y, x2, a]) => `<path d="M${x1} ${y}H${x2}" ${rim(a)}/>`).join(''));
  const top = 24, bot = 304, mid = 150, hw = 30;
  const outlines: [number, number][] = [[4, 0.1], [3, 0.16], [2, 0.24], [1, 0.38]];
  for (const [k, a] of outlines) {
    const x = 196 - 26 * k;
    o.push(poly([[x, top], [x - hw, mid], [x, bot], [x + hw, mid]], 'none', rim(a, 1.2)));
  }
  const x = 196;
  o.push(poly([[x, top], [x - hw, mid], [x, bot]], K4));
  o.push(poly([[x, top], [x + hw, mid], [x, bot]], K2));
  o.push(poly([[x, top], [x - hw, mid], [x, bot], [x + hw, mid]], 'none', rim(0.7, 1.2)));
  o.push(`<path d="M196 24V304" ${rim(0.16)}/>`);
  const smear: [number, number][] = [[4, 0.14], [3, 0.24], [2, 0.4], [1, 0.62]];
  o.push('<g class="zz-smear">' + smear.map(([k, a]) => `<rect x="${196 - 26 * k - 9}" y="146" width="18" height="7" fill="${R}" opacity="${a.toFixed(2)}"/>`).join('') + '</g>');
  o.push(eye(196, 150, 12, 36, 'zz-eye'));
  return o.join('\n');
}

/* ---------------------------------------------------------------- 刻限: the reaper dial (weak point: pace) */
export function kokugen() {
  const cx = 160, cy = 160;
  const o = [kanji('刻', 160, 170, 300, 0, 0.05), `<circle cx="${cx}" cy="${cy}" r="104" fill="${RD}"/>`];
  o.push(`<path d="M${cx} ${cy}L${cx} ${cy - 104}A104 104 0 0 1 ${f(cx + 104 * Math.cos(rad(-10)))} ${f(cy + 104 * Math.sin(rad(-10)))}Z" fill="${K1}" opacity=".9" class="kg-wedge"/>`);
  o.push(ticks(cx, cy, 122, 132, 60, 0.3, 1, -90, 360, 5, 112));
  o.push(ring(cx, cy, 140, 0.16) + ring(cx, cy, 148, 0.1, 1, '1 5'));
  const a = -10;
  const d: Pt = [Math.cos(rad(a)), Math.sin(rad(a))];
  const n: Pt = [-d[1], d[0]];
  const hand = `<path d="M${f(cx - 34 * d[0])} ${f(cy - 34 * d[1])}L${f(cx + 96 * d[0])} ${f(cy + 96 * d[1])}" stroke="${W}" stroke-width="5" stroke-linecap="round"/>`;
  const bx = cx + 96 * d[0], by = cy + 96 * d[1];
  const blade = `M${f(bx + 4 * n[0])} ${f(by + 4 * n[1])}Q${f(bx + 92 * n[0] + 6 * d[0])} ${f(by + 92 * n[1] + 6 * d[1])} ${f(bx - 92 * d[0] + 128 * n[0])} ${f(by - 92 * d[1] + 128 * n[1])}Q${f(bx + 46 * n[0] - 10 * d[0])} ${f(by + 46 * n[1] - 10 * d[1])} ${f(bx - 4 * n[0])} ${f(by - 4 * n[1])}Z`;
  o.push(`<g class="kg-hand">${hand}<path d="${blade}" fill="${W}"/><path d="${blade}" fill="none" stroke="${R}" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="16" fill="${K2}" ${rim(0.8, 1.2)}/></g>`);
  o.push(eye(cx, cy, 8, 22, 'kg-eye'));
  return o.join('\n');
}

/* ---------------------------------------------------------------- 欠片: the shatter (the morning shards) */
export function kakera() {
  const cx = 160, cy = 150;
  const o = [kanji('欠', 160, 168, 300, 0, 0.05)];
  const cuts = [0, 64, 130, 200, 268, 360];
  for (let n = 0; n < 5; n++) {
    const a1 = cuts[n] + 4, a2 = cuts[n + 1] - 4;
    const mid = rad((a1 + a2) / 2);
    const off = 7;
    const pts: Pt[] = [[cx + off * Math.cos(mid), cy + off * Math.sin(mid)]];
    for (let a = Math.trunc(a1); a <= Math.trunc(a2); a += 6) pts.push([cx + off * Math.cos(mid) + 70 * Math.cos(rad(a)), cy + off * Math.sin(mid) + 70 * Math.sin(rad(a))]);
    o.push(poly(pts, R));
  }
  const shard: Pt[] = [[0, -34], [10, 0], [4, 24], [0, 15], [-4, 24], [-10, 0]];
  const flying: [number, number, number][] = [[-130, 118, 0.8], [-62, 120, 0.85], [-12, 112, 0.95], [40, 120, 0.9], [96, 112, 1.05], [150, 116, 0.9], [196, 122, 0.8]];
  flying.forEach(([ang, dist, s], n) => {
    const x = cx + dist * Math.cos(rad(ang)), y = cy + dist * Math.sin(rad(ang));
    o.push(`<path d="M${f(cx + 80 * Math.cos(rad(ang)))} ${f(cy + 80 * Math.sin(rad(ang)))}L${f(x - 18 * Math.cos(rad(ang)))} ${f(y - 18 * Math.sin(rad(ang)))}" ${rim(0.22)}/>`);
    o.push(`<g class="kk-s kk-${n}" transform="translate(${f(x)} ${f(y)}) rotate(${ang + 90}) scale(${s.toFixed(2)})">` + poly(shard, K3, rim(0.7, 1.1)) + poly([[0, -34], [10, 0], [4, 24], [0, 15]], 'rgba(0,0,0,.3)') + `<circle cx="0" cy="-8" r="3.2" fill="${R}"/></g>`);
  });
  o.push(ring(cx, cy, 84, 0.16) + ring(cx, cy, 148, 0.08, 1, '1 6'));
  return o.join('\n');
}

/* ---------------------------------------------------------------- 関門: the gate (the mock exam) */
export function kanmon(code = 'AI-103') {
  const o = [kanji('門', 160, 172, 300, 0, 0.05), `<circle cx="160" cy="172" r="128" fill="${RD}"/>`, ring(160, 172, 146, 0.14)];
  o.push(`<path d="M86 20V306M234 20V306" ${rim(0.25)}/>`);
  o.push(poly([[122, 18], [160, 18], [160, 306], [112, 306]], K3));
  o.push(poly([[160, 18], [198, 18], [208, 306], [160, 306]], K2));
  o.push(poly([[122, 18], [198, 18], [208, 306], [112, 306]], 'none', rim(0.65, 1.2)));
  let rungs = '';
  for (let y = 44; y < 300; y += 22) rungs += `<path d="M${f(122 - ((y - 18) * 10) / 288 + 3)} ${y}H${f(198 + ((y - 18) * 10) / 288 - 3)}" ${rim(0.08)}/>`;
  o.push(rungs);
  o.push(`<g class="km-slit"><rect x="157" y="52" width="6" height="226" fill="${R}"/><path d="M160 52V278" stroke="${W}" stroke-width="1.1"/></g>`);
  o.push(`<text x="160" y="296" text-anchor="middle" font-size="11" letter-spacing=".22em" fill="rgba(234,231,224,.72)" ${MIN}>${esc(code)}</text>`);
  const icons = [
    `<path d="M-6 -6h12v12h-12zM-6 0h12M0 -6v12" fill="none" stroke="${W}" stroke-width="1.3"/>`,
    `<path d="M-6 5L0 -6L6 5Z" fill="none" stroke="${W}" stroke-width="1.1"/><circle cx="-6" cy="5" r="2.1" fill="${W}"/><circle cx="0" cy="-6" r="2.1" fill="${W}"/><circle cx="6" cy="5" r="2.1" fill="${W}"/>`,
    `<path d="M-8 0Q0 -8 8 0Q0 8 -8 0Z" fill="none" stroke="${W}" stroke-width="1.3"/><circle r="2.5" fill="${R}"/>`,
    `<path d="M-5 -7v13M0 -7v9M5 -7v14" stroke="${W}" stroke-width="1.5"/>`,
    `<path d="M-6 -7h9l3 3v11h-12z" fill="none" stroke="${W}" stroke-width="1.2"/><path d="M-3 -1h6M-3 3h6" stroke="${W}" stroke-width="1"/>`,
  ];
  [-160, -124, -90, -56, -20].forEach((a, n) => {
    const x = 160 + 128 * Math.cos(rad(a)), y = 172 + 128 * Math.sin(rad(a));
    o.push(`<g class="km-c km-c${n}" transform="translate(${f(x)} ${f(y)})"><circle r="15" fill="${K1}" ${rim(0.65, 1.1)}/>${icons[n]}</g>`);
  });
  return o.join('\n');
}

/** Art for a week's shadow. Terms come from the boss (plate labels for 縛鎖, the twins for 双影). */
export function enemyArt(type: EnemyType, terms: string[] = [], opts: BakusaOpts = {}) {
  switch (type) {
    case 'bakusa':
      return bakusa({ labels: terms.length >= 4 ? terms.slice(0, 4) : undefined, ...opts });
    case 'souei':
      return souei(terms[0] || 'A', terms[1] || 'B');
    case 'sakazuri':
      return sakazuri(terms[0] || 'ではない');
    case 'muchu':
      return muchu();
    case 'kyoman':
      return kyoman();
    case 'zanzo':
      return zanzo();
    case 'kokugen':
      return kokugen();
  }
}
