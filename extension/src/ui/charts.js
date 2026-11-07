// Reusable charts — plain DOM/SVG (textContent only), so they work in the cards
// (blocks.js), the overview, the shortlist page, and React via <Chart>. Every mark
// gets a data-tip, so the shared gliding tooltip explains it. One palette, one look.
//
//   chart('bars',    { items: [{ label, value, note?, tone?, display?, tip? }], max?, format? })
//   chart('columns', { items: [{ label, value, tone?, display?, tip? }], max?, format?, height? })
//   chart('line',    { points: [{ x, y, label?, tip? }], area?, format?, height?, markers? })
//   chart('meter',   { value, max?, cells?, tone?, label?, display? })
// tone: 'blue' (default) | 'warn' | 'muted' | 'ink'

import { tip } from './tooltip.js';

const NS = 'http://www.w3.org/2000/svg';
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
};
const s = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const fmtDefault = (v) => (finite(v) ? (Math.round(v * 10) / 10).toLocaleString('en-AU') : '—');
const TONES = new Set(['blue', 'warn', 'muted', 'ink']);
const tone = (t) => (TONES.has(t) ? t : 'blue');

/** Horizontal labelled bars (comparisons, rankings). */
function bars({ items = [], max = null, format = fmtDefault, title = null }) {
  const root = h('div', 'fp-chart fp-bars');
  if (title) root.append(h('div', 'fp-chart-title', title));
  const top = max ?? Math.max(0, ...items.map((i) => (finite(i.value) ? i.value : 0)));
  items.forEach((it, i) => {
    const row = h('div', 'fp-bar');
    const lab = h('div', 'fp-bar-label', it.label);
    if (it.note) lab.append(h('span', 'fp-note', it.note));
    const track = h('div', 'fp-track');
    const fill = h('div', `fp-fill t-${tone(it.tone)}`);
    fill.style.setProperty('--w', `${top > 0 && finite(it.value) ? Math.max(1.5, (it.value / top) * 100) : 0}%`);
    fill.style.setProperty('--i', String(i));
    track.append(fill);
    const shown = it.display ?? format(it.value);
    row.append(lab, track, h('div', `fp-bar-v ${it.tone === 'warn' ? 'warn' : ''}`, shown));
    root.append(tip(row, it.tip ?? `${shown}${it.note ? ` — ${it.note}` : ''}`, it.label));
  });
  return root;
}

/** Vertical columns (per year, per bucket). */
function columns({ items = [], max = null, format = fmtDefault, height = 96, title = null }) {
  const root = h('div', 'fp-chart fp-cols');
  if (title) root.append(h('div', 'fp-chart-title', title));
  const top = max ?? Math.max(0, ...items.map((i) => (finite(i.value) ? i.value : 0)));
  const plot = h('div', 'fp-cols-plot');
  plot.style.height = `${height}px`;
  items.forEach((it, i) => {
    const col = h('div', 'fp-col');
    const shown = it.display ?? format(it.value);
    const v = h('div', 'fp-col-v', finite(it.value) && it.value > 0 ? shown : '');
    const bar = h('div', `fp-col-bar t-${tone(it.tone)}`);
    bar.style.setProperty('--h', `${top > 0 && finite(it.value) ? Math.max(it.value > 0 ? 3 : 0, (it.value / top) * 100) : 0}%`);
    bar.style.setProperty('--i', String(i));
    const area = h('div', 'fp-col-area'); // bar height is a % of this, so labels never get pushed out
    area.append(bar);
    col.append(v, area, h('div', 'fp-col-x', it.label));
    plot.append(tip(col, it.tip ?? shown, String(it.label)));
  });
  root.append(plot);
  return root;
}

/** Line (or area) over x — numbers or dates; y numbers. Nulls break nothing (skipped). */
function line({ points = [], area = true, format = fmtDefault, height = 110, markers = true, title = null, xFormat = null }) {
  const root = h('div', 'fp-chart fp-line');
  if (title) root.append(h('div', 'fp-chart-title', title));
  const pts = points
    .map((p) => ({ ...p, xv: p.x instanceof Date ? p.x.getTime() : typeof p.x === 'string' ? Date.parse(p.x) : p.x }))
    .filter((p) => finite(p.xv) && finite(p.y))
    .sort((a, b) => a.xv - b.xv);
  if (pts.length < 2) {
    root.append(h('div', 'fp-empty', pts.length ? format(pts[0].y) : 'Not enough data'));
    return root;
  }
  const W = 320;
  const H = height;
  const pad = { l: 4, r: 4, t: 12, b: 18 };
  const xs = pts.map((p) => p.xv);
  const ys = pts.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const span = y1 - y0;
  y0 -= span * 0.12;
  y1 += span * 0.12;
  const X = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fp-line-svg', preserveAspectRatio: 'none', role: 'img' });
  for (const f of [0.25, 0.5, 0.75]) svg.append(s('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + f * (H - pad.t - pad.b), y2: pad.t + f * (H - pad.t - pad.b), class: 'fp-grid' }));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.xv).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  if (area) svg.append(s('path', { d: `${d} L${X(x1).toFixed(1)},${H - pad.b} L${X(x0).toFixed(1)},${H - pad.b} Z`, class: 'fp-area' }));
  svg.append(s('path', { d, class: 'fp-stroke' }));
  const wrap = h('div', 'fp-line-wrap');
  wrap.style.height = `${H}px`;
  wrap.append(svg);
  const label = (p) => p.label ?? (xFormat ? xFormat(p.x) : p.x instanceof Date || typeof p.x === 'string' ? new Date(p.xv).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : String(p.x));
  if (markers) {
    // HTML dots over the SVG so they stay round when the SVG stretches, and carry tooltips
    for (const p of pts) {
      const dot = h('span', `fp-dot t-${tone(p.tone)}`);
      dot.style.left = `${(X(p.xv) / W) * 100}%`;
      dot.style.top = `${Y(p.y)}px`;
      wrap.append(tip(dot, p.tip ?? format(p.y), label(p)));
    }
  }
  const axis = h('div', 'fp-line-axis');
  axis.append(h('span', null, label(pts[0])), h('span', null, label(pts[pts.length - 1])));
  root.append(wrap, axis);
  return root;
}

/** Segmented meter: `value` of `max`, in `cells` cells. */
function meter({ value = 0, max = 1, cells = 10, tone: t = 'blue', label = null, display = null }) {
  const root = h('div', 'fp-chart fp-meter');
  const on = Math.round(Math.max(0, Math.min(1, finite(value) && max > 0 ? value / max : 0)) * cells);
  const row = h('div', 'fp-cells');
  for (let i = 0; i < cells; i++) {
    const c = h('i', `fp-cell${i < on ? ` on t-${tone(t)}` : ''}`);
    c.style.setProperty('--i', String(i));
    row.append(c);
  }
  if (label || display) {
    const head = h('div', 'fp-meter-head');
    head.append(h('span', null, label ?? ''), h('b', null, display ?? fmtDefault(value)));
    root.append(head);
  }
  root.append(row);
  return tip(root, display ?? `${fmtDefault(value)} of ${fmtDefault(max)}`, label ?? 'Meter');
}

const KINDS = { bars, columns, line, meter };

/** Build a chart node. Unknown type → a readable error node, never a throw. */
export function chart(type, opts = {}) {
  const make = KINDS[type];
  if (!make) {
    const n = h('div', 'fp-chart fp-empty', `Unknown chart "${type}"`);
    return n;
  }
  return make(opts);
}
export const CHART_TYPES = Object.keys(KINDS);
