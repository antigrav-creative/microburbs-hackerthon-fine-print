// Renders a render_ui_block card in the panel (vanilla DOM; textContent only, so
// model-written strings can never inject markup). The payload contract is
// agent/ui-blocks.js TEMPLATES; visuals follow design/screens/d-chat-components.png
// and design-jsx/card-*.jsx (blue = this property / good, yellow = warning).

import { TEMPLATES } from '../agent/ui-blocks.js';
import { settle } from './motion.js';

const SVG = 'http://www.w3.org/2000/svg';
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
};
const svg = (tag, attrs = {}, text) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = String(text);
  return n;
};
const money = (n) => {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}K` : `$${Math.round(a)}`;
  return n < 0 ? `−${s}` : s;
};
const signed = (n) => (n >= 0 ? `+${money(n)}` : money(n));
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const num1 = (x) => (Math.round(x * 10) / 10).toString();
const C = { blue: '#2F64D9', blueSoft: '#2F64D91F', warn: '#E3A008', warnInk: '#9A6A00', ink: '#1E1D1B', ink2: '#4A4741', muted: '#8C877D', seg: '#EAE5DA', segMid: '#B9B3A6', tick: '#D6D0C3', rail: '#E4DFD3' };

/** n equal cells, the first `on` filled in tone t (this|likely|muted|min|warn). */
function segs(n, on, tone, cls = '') {
  const row = h('div', `ub-segs ${cls}`);
  const k = Math.round(clamp(on, 0, n));
  for (let i = 0; i < n; i++) {
    const c = h('i', `ub-seg${i < k ? ` on t-${tone}` : ''}`);
    if (i < k) c.style.setProperty('--i', String(i));
    row.append(c);
  }
  return row;
}

/** label · track · value bar (HTML), width as a fraction. */
function hbar(label, frac, value, tone, { note = null, wide = false, valueTone = null, tip = null } = {}) {
  const row = h('div', `ub-hbar${wide ? ' wide' : ''}`);
  row.dataset.tipTitle = label;
  row.dataset.tip = tip ?? `${value}${note ? ` — ${note}` : ''}`;
  const l = h('div', 'ub-label', label);
  if (note) l.append(h('span', 'ub-note', note));
  const track = h('div', 'ub-track');
  const fill = h('div', `ub-fill t-${tone}`);
  fill.style.width = `${Math.max(2, clamp(frac) * 100)}%`;
  track.append(fill);
  row.append(l, track, h('div', `ub-v ${valueTone ? `ub-${valueTone}-ink` : ''}`, value));
  return row;
}

const caption = (b) => {
  if (!b.caption) return []; // sources (API routes) are never shown — friendly, not developery
  const c = h('div', 'ub-caption', b.caption ?? '');
  return [c];
};
const sourcesOnly = () => []; // API routes stay out of the UI

/** Headline row: eyebrow + big serif headline (+ badge / side readout on the right). */
function top(b, eyebrow, { words = false, blue = false, side = null } = {}) {
  const row = h('div', 'ub-top');
  const left = h('div', 'ub-top-left');
  if (eyebrow) left.append(h('div', 'ub-eyebrow', eyebrow));
  const hl = h('div', `ub-headline${words ? ' ub-words' : ''}${blue ? ' ub-blue' : ''}`);
  const text = String(b.headline ?? '');
  // "Clear. One thing to check." → second sentence italic; "2 better, 3 worse" → worse in yellow
  const sentence = words && text.match(/^(.+?[.!?])\s+(.+)$/);
  const worse = words && text.match(/^(.*?,\s*)(\d+\s+worse.*)$/i);
  if (sentence) hl.append(`${sentence[1]} `, h('span', `ub-rest ${b._restTone ? `ub-${b._restTone}-ink` : ''}`, sentence[2]));
  else if (worse && !/^0\s/.test(worse[2])) hl.append(worse[1], h('span', 'ub-worse', worse[2]));
  else {
    hl.textContent = text;
    if (!words) settle(hl, { from: 0.82, ms: 600, delay: 150 });
  }
  left.append(hl);
  row.append(left);
  if (side) row.append(side);
  else if (b.badge) row.append(h('span', `ub-badge ub-${b.badge.tone}`, b.badge.text));
  return row;
}

const BODIES = {
  yield(b) {
    const vals = [...b.rows.map((r) => r.value_pct), b.threshold_pct];
    const lo = Math.max(0, Math.floor(Math.min(...vals) - 0.5));
    const hi = Math.ceil(Math.max(...vals) + 0.3);
    const N = 30;
    const at = (v) => ((v - lo) / (hi - lo || 1)) * N;
    const tone = { this: 'this', likely: 'likely', minimum: 'min', area: 'muted', city: 'muted', other: 'muted' };
    const chart = h('div', 'ub-yield');
    for (const r of b.rows) {
      const row = h('div', `ub-yrow${r.kind === 'this' ? ' ub-strong' : ''}`);
      row.append(h('div', 'ub-label', r.label), segs(N, at(r.value_pct), tone[r.kind] ?? 'muted'));
      row.title = `${r.value_pct}%`;
      chart.append(row);
    }
    // dashed line at the investor's minimum, over every row (label column is 96px + 12px gap)
    const line = h('div', 'ub-threshold');
    line.style.left = `calc(108px + (100% - 108px) * ${clamp((b.threshold_pct - lo) / (hi - lo || 1))})`;
    chart.append(line);
    const axis = h('div', 'ub-axis');
    axis.append(h('span', null, `${lo.toFixed(1)}%`), h('span', null, `┊ your ${Number(b.threshold_pct).toFixed(1)}%`), h('span', null, `${hi.toFixed(1)}%`));
    return [top(b, 'Gross yield · asking'), chart, axis, ...caption(b)];
  },

  supply(b) {
    const max = Math.max(...b.projects.map((p) => p.dwellings));
    const PER_ROW = 25;
    let unit = 25;
    while (max / unit > PER_ROW) unit *= 2;
    const box = h('div', 'ub-box ub-blocks');
    const labels = h('div', 'ub-blocks-labels');
    const rows = h('div', 'ub-blocks-rows');
    for (const p of b.projects) {
      const lab = h('div', p.build_to_rent ? 'ub-warn-ink' : null, `${p.dwellings} · ${Math.round(p.km * 1000)} m`);
      lab.title = `${p.label ?? ''}${p.build_to_rent ? ' · build-to-rent' : ''}`;
      labels.append(lab);
      rows.append(segs(PER_ROW, Math.max(1, Math.round(p.dwellings / unit)), p.build_to_rent ? 'warn' : 'muted'));
    }
    box.append(labels, rows);
    const out = [top(b, 'New homes in DAs ≤ 1 km'), box];
    const unitNote = h('div', 'ub-unit', `each block ≈ ${unit} homes${b.projects.some((p) => p.build_to_rent) ? ' · yellow = build-to-rent' : ''}`);
    out.push(unitNote);
    if (b.vacancy) {
      const v = h('div', 'ub-box');
      const head = h('div', 'ub-box-head');
      head.append(h('span', null, 'Apartment vacancy'), h('span', 'ub-k', b.vacancy.rank_text ?? ''));
      const vmax = Math.max(b.vacancy.here_pct, b.vacancy.city_pct) * 1.15 || 1;
      const worse = b.vacancy.here_pct > b.vacancy.city_pct;
      v.append(
        head,
        hbar('Here', b.vacancy.here_pct / vmax, `${b.vacancy.here_pct}%`, worse ? 'warn' : 'this', { valueTone: worse ? 'warn' : 'this' }),
        hbar('City', b.vacancy.city_pct / vmax, `${b.vacancy.city_pct}%`, 'muted'),
      );
      out.push(v);
    }
    return [...out, ...caption(b)];
  },
  supply_timeline(b) {
    // when the new homes land across the hold — one bar per year, yellow = build-to-rent
    const max = Math.max(...b.years.map((y) => y.dwellings)) || 1;
    const box = h('div', 'ub-box');
    for (const y of b.years) {
      // no per-year subtitles (cluttered) — yellow already says build-to-rent; the tooltip has the split
      box.append(hbar(`${y.year} · yr ${y.hold_year}`, y.dwellings / max, `${y.dwellings}`, y.build_to_rent > 0 ? 'warn' : 'muted', { valueTone: y.build_to_rent > 0 ? 'warn' : null, tip: `${y.dwellings} new homes most likely land in ${y.year} (year ${y.hold_year} of your hold)${y.build_to_rent ? `, ${y.build_to_rent} of them build-to-rent` : ''}.` }));
    }
    const out = [top(b, 'When new homes land · your hold'), box];
    if (b.already_built) out.push(h('div', 'ub-unit', `+ ${b.already_built} more likely already built — in today's market`));
    return [...out, ...caption(b)];
  },
  cash_flow(b) {
    const max = Math.max(...b.lines.map((l) => Math.abs(l.weekly))) || 1;
    const box = h('div', 'ub-box');
    for (const l of b.lines) box.append(hbar(l.label, Math.abs(l.weekly) / max, signed(l.weekly), l.weekly >= 0 ? 'this' : 'warn', { note: l.note, wide: true, valueTone: l.weekly >= 0 ? 'this' : 'muted' }));
    let side = null;
    if (b.after_tax) {
      side = h('div', 'ub-side');
      side.append(h('div', 'ub-eyebrow', 'After tax'), h('div', 'ub-side-value', b.after_tax));
    }
    return [top(b, 'Out of pocket · weekly', { side }), box, ...caption(b)];
  },

  value(b) {
    // confidence pips (only Microburbs' own valuation has a confidence score)
    let side = null;
    if (Number.isFinite(b.confidence)) {
      side = h('div', 'ub-side');
      const conf = h('div', 'ub-conf');
      const on = Math.round(b.confidence / 10);
      for (let i = 0; i < 10; i++) {
        const pip = h('i', i < on ? 'on' : null);
        pip.style.setProperty('--i', String(i));
        conf.append(pip);
      }
      conf.append(h('b', null, Math.round(b.confidence)));
      side.append(h('div', 'ub-eyebrow', 'Confidence'), conf);
    }

    // tick strip: blue inside the AVM range up to asking, yellow asking → likely, grey to high
    const pts = [b.low, b.high, b.estimate, b.asking, b.likely].filter((x) => x != null);
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const pad = (hi - lo) * 0.05 || 1;
    const W = 352;
    const x = (v) => 4 + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (W - 8);
    const s = svg('svg', { viewBox: `0 0 ${W} 64`, class: 'ub-svg', role: 'img', 'aria-label': `Estimate ${money(b.estimate)}, range ${money(b.low)} to ${money(b.high)}` });
    const blueTo = b.asking ?? b.high;
    for (let i = 0, n = 44; i < n; i++) {
      const tx = 4 + (i * (W - 8)) / (n - 1);
      const inRange = tx >= x(b.low) - 0.5 && tx <= x(b.high) + 0.5;
      const colour = !inRange ? C.seg : tx <= x(blueTo) ? C.blue : b.likely != null && tx <= x(b.likely) ? C.warn : C.segMid;
      s.append(svg('line', { x1: tx.toFixed(1), y1: 22, x2: tx.toFixed(1), y2: 40, stroke: colour, 'stroke-width': 3, 'stroke-linecap': 'round', class: 'seg-line', style: `--i:${i}` }));
    }
    const mark = (v, colour, label, above) => {
      if (v == null) return;
      const g = svg('g', { class: 'pop' });
      const xx = x(v);
      g.append(svg('line', { x1: xx.toFixed(1), y1: 16, x2: xx.toFixed(1), y2: 46, stroke: colour, 'stroke-width': 1.5 }));
      const anchor = xx > W - 40 ? 'end' : xx < 40 ? 'start' : 'middle';
      g.append(svg('text', { x: anchor === 'end' ? W : anchor === 'start' ? 0 : xx.toFixed(1), y: above ? 11 : 58, 'text-anchor': anchor, fill: colour }, label));
      s.append(g);
    };
    mark(b.estimate, C.ink, `est ${money(b.estimate)}`, true);
    mark(b.asking, C.muted, `ask ${money(b.asking)}`, false);
    mark(b.likely, C.warnInk, `likely ${money(b.likely)}`, true);
    // range ends, below — skipped where the ask label would collide
    // compare label CENTRES (labels near an edge are pinned to it, so their centre moves inwards)
    const centre = (xx, half) => (xx > W - 40 ? W - half : xx < 40 ? half : xx);
    const askC = b.asking != null ? centre(x(b.asking), 34) : -999;
    if (Math.abs(Math.max(0, x(b.low)) + 24 - askC) > 70) s.append(svg('text', { x: Math.max(0, x(b.low)).toFixed(1), y: 58, fill: C.muted }, money(b.low)));
    if (Math.abs(Math.min(W, x(b.high)) - 24 - askC) > 70) s.append(svg('text', { x: Math.min(W, x(b.high)).toFixed(1), y: 58, 'text-anchor': 'end', fill: C.muted }, money(b.high)));
    const box = h('div', 'ub-box');
    box.append(s);

    const note = h('div', 'ub-note-box');
    const text = h('div');
    text.append(h('strong', null, Number.isFinite(b.confidence) ? "What's an AVM? " : 'How this is estimated: '), b.caption ?? '');
    note.append(h('span', 'ub-i', 'i'), text);
    return [top(b, Number.isFinite(b.confidence) ? 'Estimated value · AVM' : 'Estimated value · recent sales', { side }), box, note, ...sourcesOnly(b)];
  },

  area(b) {
    const N = 10;
    const grid = h('div', 'ub-box ub-area');
    grid.style.setProperty('--rows', String(b.metrics.length));
    const fmtFor = (m) => (x) => (m.unit === '$' ? money(x).replace('$', '') : m.unit === 'days' ? `${Math.round(x)}` : num1(x));
    const diffs = b.metrics.map((m) => Math.abs(m.here - m.area) / (Math.abs(m.area) || 1));
    const maxDiff = Math.max(...diffs, 0.0001);
    b.metrics.forEach((m, i) => {
      const better = m.higher_is_better ? m.here >= m.area : m.here <= m.area;
      const k = Math.max(1, Math.round((diffs[i] / maxDiff) * N));
      const f = fmtFor(m);
      grid.append(
        h('div', 'ub-label', m.label),
        segs(N, better ? 0 : k, 'warn', 'ub-left'),
        segs(N, better ? k : 0, 'this'),
        h('div', `ub-v ${better ? 'ub-this-ink' : 'ub-warn-ink'}`, `${f(m.here)} v ${f(m.area)}`),
      );
      // left/right columns are 2 and 4; the axis line spans every row in column 3
      grid.lastChild.previousSibling.style.gridColumn = '4';
      grid.lastChild.previousSibling.previousSibling.style.gridColumn = '2';
    });
    const axis = h('div', 'ub-axis-line');
    axis.style.gridRow = `1 / span ${b.metrics.length}`;
    grid.append(axis);
    const foot = h('div', 'ub-area-foot');
    foot.append(h('span', 'ub-warn-ink', '◀ worse for you'), h('span', 'ub-this-ink', 'better for you ▶'));
    return [top(b, `vs ${b.compare_to}`, { words: true }), grid, foot, ...caption(b)];
  },

  offer(b) {
    const pts = [b.open, b.aim, b.walk_away, b.estimate, b.asking, b.likely, ...(b.comps ?? [])].filter((x) => x != null);
    const lo = Math.floor((Math.min(...pts) * 0.97) / 25000) * 25000;
    const hi = Math.ceil((Math.max(...pts) * 1.03) / 25000) * 25000;
    const W = 352;
    const x = (v) => 8 + ((v - lo) / (hi - lo || 1)) * (W - 16);
    const s = svg('svg', { viewBox: `0 0 ${W} 80`, class: 'ub-svg', role: 'img', 'aria-label': `Aim ${money(b.aim)}, walk away ${money(b.walk_away)}` });
    s.append(svg('line', { x1: 8, y1: 39, x2: W - 8, y2: 39, stroke: C.rail, 'stroke-width': 2 }));
    const step = (hi - lo) / 25000 > 16 ? 50000 : 25000;
    for (let v = lo, i = 0; v <= hi + 1; v += step, i++) {
      const major = v % 100000 === 0;
      s.append(svg('line', { x1: x(v).toFixed(1), y1: major ? 45 : 47, x2: x(v).toFixed(1), y2: 51, stroke: C.tick, class: 'seg-line', style: `--i:${i}` }));
    }
    // offer band: open → walk away
    s.append(svg('rect', { x: x(b.open).toFixed(1), y: 31, width: Math.max(2, x(b.walk_away) - x(b.open)).toFixed(1), height: 16, rx: 4, fill: C.blueSoft, class: 'pop' }));
    for (const c of b.comps ?? []) s.append(svg('circle', { cx: x(c).toFixed(1), cy: 39, r: 3.5, fill: C.muted, class: 'pop' }));
    const labelled = [];
    const label = (xx, y, text, fill, anchor = 'middle') => {
      const a = xx > W - 36 ? 'end' : xx < 36 ? 'start' : anchor;
      s.append(svg('text', { x: a === 'end' ? W - 2 : a === 'start' ? 2 : xx.toFixed(1), y, 'text-anchor': a, fill, class: 'pop' }, text));
      labelled.push({ xx, y });
    };
    if (b.estimate != null) {
      const ex = x(b.estimate);
      s.append(svg('rect', { x: (ex - 4).toFixed(1), y: 35, width: 8, height: 8, transform: `rotate(45 ${ex.toFixed(1)} 39)`, fill: C.ink, class: 'pop' }));
      label(ex, 65, 'est', C.ink);
    }
    if (b.asking != null) {
      const ax = x(b.asking);
      s.append(svg('line', { x1: ax.toFixed(1), y1: 31, x2: ax.toFixed(1), y2: 47, stroke: C.muted, 'stroke-width': 2, 'stroke-linecap': 'round', class: 'pop' }));
      const clash = b.estimate != null && Math.abs(x(b.estimate) - ax) < 26;
      label(ax, clash ? 76 : 65, 'ask', C.muted);
    }
    const aimX = x(b.aim);
    s.append(svg('line', { x1: aimX.toFixed(1), y1: 21, x2: aimX.toFixed(1), y2: 57, stroke: C.blue, 'stroke-width': 2.5, 'stroke-linecap': 'round', class: 'pop' }));
    label(aimX, 14, `aim ${money(b.aim)}`, C.blue);
    if (b.likely != null) {
      const lx = x(b.likely);
      s.append(svg('circle', { cx: lx.toFixed(1), cy: 39, r: 5.5, fill: C.warn, class: 'pop' }));
      label(lx, Math.abs(lx - aimX) < 70 ? 25 : 14, `likely ${money(b.likely)}`, C.warnInk);
    }
    s.append(svg('text', { x: 8, y: 78, fill: C.muted }, money(lo)), svg('text', { x: W - 8, y: 78, 'text-anchor': 'end', fill: C.muted }, money(hi)));

    const box = h('div', 'ub-box ub-offer-box');
    const head = h('div', 'ub-box-head');
    const legend = h('div', 'ub-legend');
    if (b.comps?.length) legend.append(h('span', null, '● sale ≤1 km'));
    if (b.estimate != null) legend.append(h('span', null, '◆ est'));
    head.append(h('strong', null, 'Where the offer sits'), legend);
    head.firstChild.style.fontWeight = '500';
    const trio = h('div', 'ub-trio');
    for (const [k, v, tone] of [['Open', b.open, null], ['Aim', b.aim, 'this'], ['Walk away', b.walk_away, 'warn']]) {
      const c = h('div');
      c.append(h('div', `ub-k ${tone ? `ub-${tone}-ink` : ''}`, k), h('div', `ub-tv ${tone === 'this' ? 'ub-this-ink' : ''}`, money(v)));
      trio.append(c);
    }
    box.append(head, s, trio);
    return [top(b, 'Recommended offer', { blue: true }), box, ...caption(b)];
  },

  hold(b) {
    const max = Math.max(...b.scenarios.map((s) => Math.abs(s.gain))) || 1;
    const box = h('div', 'ub-box ub-hold');
    const tone = { best: 'this', base: 'muted', worst: 'warn', other: 'muted' };
    for (const s of b.scenarios) {
      const t = tone[s.kind] ?? 'muted';
      const row = h('div', `ub-scn t-${t}`);
      const head = h('div', 'ub-scn-head');
      head.append(h('span', null, s.label), h('span', 'ub-v', signed(s.gain)));
      const fill = h('div', `ub-fill t-${t}`);
      fill.style.width = `${Math.max(2, (Math.abs(s.gain) / max) * 100)}%`;
      row.append(head, fill);
      box.append(row);
    }
    return [top(b, `Gain over ${b.years} yrs`), box, ...caption(b)];
  },

  property(b) {
    const out = [top({ ...b, badge: null }, b.gnaf_id, { words: true })];
    const cells = h('div', 'ub-cells');
    for (const f of b.facts.slice(0, 3)) {
      const c = h('div');
      c.append(h('div', 'ub-k', f.label), h('div', 'ub-cv', f.value));
      cells.append(c);
    }
    out.push(cells);
    if (b.facts.length > 3) {
      const more = h('div', 'ub-cells small');
      for (const f of b.facts.slice(3, 6)) {
        const c = h('div');
        c.append(h('div', 'ub-k', f.label), h('div', 'ub-cv', f.value));
        more.append(c);
      }
      out.push(more);
    }
    const hist = (b.history ?? []).filter((e) => e.price);
    if (hist.length) out.push(historyChart(hist));
    return [...out, ...caption(b)];
  },

  overlays(b) {
    const flagged = b.items.filter((it) => it.status !== 'clear').length;
    const box = h('div', 'ub-box ub-list');
    b.items.forEach((it, i) => {
      const row = h('div', `ub-item ub-status-${it.status}`);
      row.style.setProperty('--i', String(i));
      row.append(h('span', 'ub-item-name', it.name), h('span', 'ub-item-detail', it.detail));
      box.append(row);
    });
    const out = [top({ ...b, _restTone: flagged ? 'warn' : null }, 'On the title', { words: true }), box];
    if (b.transport?.length) {
      const cells = h('div', 'ub-cells small');
      for (const t of b.transport) {
        const c = h('div');
        c.append(h('div', 'ub-k', t.label), h('div', 'ub-cv', t.value));
        cells.append(c);
      }
      out.push(cells);
    }
    return [...out, ...caption(b)];
  },
};

/** Sale history: sold points joined in blue, estimate on the line, likely as a yellow dot above. */
function historyChart(hist) {
  const box = h('div', 'ub-box ub-history');
  const year = (d) => {
    const y = Number(String(d).slice(0, 4));
    return Number.isFinite(y) && y > 1900 ? y : new Date().getFullYear();
  };
  const sold = hist.filter((e) => e.kind === 'sold' || e.kind === 'listed').sort((a, c) => String(a.date).localeCompare(String(c.date)));
  const est = hist.find((e) => e.kind === 'estimate');
  const likely = hist.find((e) => e.kind === 'likely');
  const head = h('div', 'ub-box-head');
  const lastSold = sold[sold.length - 1];
  const now = est ?? likely;
  head.append(h('span', null, 'Sale history'));
  if (lastSold && now) {
    const pct = Math.round(((now.price - lastSold.price) / lastSold.price) * 100);
    head.append(h('span', 'ub-k', `${now === est ? 'est ' : 'likely '}${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% since ${year(lastSold.date)}`));
  }
  const W = 340;
  const prices = hist.map((e) => e.price);
  const pMin = Math.min(...prices) * 0.92;
  const pMax = Math.max(...prices) * 1.04;
  const y = (p) => 60 - ((p - pMin) / (pMax - pMin || 1)) * 50;
  const years = [...sold.map((e) => year(e.date)), new Date().getFullYear()];
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const x = (yr) => 10 + ((yr - y0) / (y1 - y0 || 1)) * (W - 20);
  const s = svg('svg', { viewBox: `0 0 ${W} 80`, class: 'ub-svg', role: 'img', 'aria-label': 'Sale history' });
  for (const gy of [10, 30.8, 51.6]) s.append(svg('line', { x1: 10, y1: gy, x2: W - 10, y2: gy, stroke: C.seg }));
  const pts = sold.map((e) => [x(year(e.date)), y(e.price), e]);
  const endX = W - 10;
  if (est) pts.push([endX, y(est.price), est]);
  if (pts.length > 1) s.append(svg('polyline', { points: pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '), fill: 'none', stroke: C.blue, 'stroke-width': 2, class: 'ub-line' }));
  pts.forEach(([px, py, e], i) => {
    s.append(svg('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 3.5, fill: C.blue, class: 'pop' }));
    if (e.kind !== 'estimate') s.append(svg('text', { x: px.toFixed(1), y: 76, 'text-anchor': i === 0 ? 'start' : px > W - 60 ? 'end' : 'middle', fill: C.muted }, `${year(e.date)} · ${money(e.price)}`));
  });
  if (est) s.append(svg('text', { x: endX - 8, y: (y(est.price) + 14).toFixed(1), 'text-anchor': 'end', fill: C.blue, class: 'pop' }, `est ${money(est.price)}`));
  if (likely) {
    const ly = y(likely.price);
    const base = est ? y(est.price) : pts.length ? pts[pts.length - 1][1] : ly;
    s.append(svg('line', { x1: endX, y1: base.toFixed(1), x2: endX, y2: ly.toFixed(1), stroke: C.warn, 'stroke-width': 2, 'stroke-dasharray': '3 3', class: 'pop' }));
    s.append(svg('circle', { cx: endX, cy: ly.toFixed(1), r: 4, fill: C.warn, class: 'pop' }));
    s.append(svg('text', { x: endX - 8, y: (ly + 4).toFixed(1), 'text-anchor': 'end', fill: C.warnInk, class: 'pop' }, `likely ${money(likely.price)}`));
  }
  box.append(head, s);
  return box;
}

const HEADLINE_TITLES = {
  yield: 'Gross yield', supply: 'New supply', supply_timeline: 'Supply timing', cash_flow: 'Weekly cost', value: 'Estimated value',
  area: 'Area comparison', offer: 'Recommended offer', hold: 'Hold outcome', property: 'This property', overlays: 'Hazards',
};

const HEADLINE_TIPS = {
  yield: (b) => `Gross yield at the asking price: weekly rent × 52 ÷ price. Your minimum is ${b.threshold_pct}%.`,
  supply: (b) => `New homes stated in development applications within 1 km${b.projects?.some((p) => p.build_to_rent) ? '; build-to-rent projects compete directly for tenants' : ''}.`,
  supply_timeline: () => 'Peak year new homes most likely complete, and which year of your hold that is. Estimated from DA lodgement + ~9 months approval + build time by size.',
  cash_flow: () => 'Net weekly cost before tax: interest + strata + rates/insurance − rent. Negative = money out of your pocket.',
  value: (b) => (Number.isFinite(b.confidence) ? `Microburbs' automated valuation (range ${money(b.low)}–${money(b.high)}, confidence ${b.confidence}/100). A second opinion, not a bank valuation.` : `Estimated from recent same-bedroom sales nearby (range ${money(b.low)}–${money(b.high)}). A second opinion, not a bank valuation.`),
  area: (b) => `How this property compares with ${b.compare_to} on ${b.metrics?.length ?? 0} measures.`,
  offer: (b) => `Aim: between the estimated value and asking. Walk away: your budget or the likely sale, whichever is lower. Open at ${money(b.open)}.`,
  hold: (b) => `Illustrative gain over ${b.years} years after rent and holding costs, before tax — assumes 3% growth a year and 6% interest.`,
  property: (b) => `Matched to Microburbs property ${b.gnaf_id}.`,
  overlays: () => 'Hazards and overlays on or near the title.',
};

/** template + body → card element (call only with a body the tool accepted). */
export function renderBlock(template, body) {
  const t = TEMPLATES[template];
  const card = h('div', `ub-card ub-t-${template}`);
  // no header row: the card speaks for itself (tool names aren't for investors)
  const main = h('div', 'ub-main');
  try {
    const parts = [BODIES[template]?.(body) ?? [top(body, null), ...caption(body)]].flat();
    main.append(...parts);
  } catch (e) {
    main.replaceChildren(top(body, null), h('div', 'ub-caption', `(could not draw this card: ${e.message})`));
  }
  // the big number explains how it was worked out
  const headTip = HEADLINE_TIPS[template]?.(body);
  const headline = main.querySelector?.('.ub-headline');
  if (headTip && headline) {
    headline.dataset.tip = headTip;
    headline.dataset.tipTitle = HEADLINE_TITLES[template] ?? 'About this';
  }
  // body.sources (API routes) stay internal — the UI is for investors, not developers
  card.append(main);
  return card;
}
