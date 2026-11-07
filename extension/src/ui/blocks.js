// Renders a render_ui_block card in the panel (vanilla DOM; textContent only, so
// model-written strings can never inject markup). Placeholder for the React build —
// the payload contract is agent/ui-blocks.js TEMPLATES; visuals follow
// design/screens/d-chat-components.png (blue = this property / good, yellow = warning).

import { TEMPLATES } from '../agent/ui-blocks.js';

const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
};
const money = (n) => {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}K` : `$${Math.round(a)}`;
  return n < 0 ? `−${s}` : s;
};
const signed = (n) => (n >= 0 ? `+${money(n)}` : money(n));

/** label · bar · value row; pct 0–100 of the track; tone: this|good|warn|muted */
function barRow(label, pct, value, tone = 'muted', sub = null, marker = null) {
  const row = h('div', 'ub-row');
  const l = h('div', 'ub-label', label);
  if (sub) l.append(h('div', 'ub-sub', sub));
  const track = h('div', 'ub-track');
  const fill = h('div', `ub-fill ub-${tone}`);
  fill.style.width = `${Math.max(2, Math.min(100, pct))}%`;
  track.append(fill);
  if (marker != null) {
    const m = h('div', 'ub-marker');
    m.style.left = `${Math.max(0, Math.min(100, marker))}%`;
    track.append(m);
  }
  row.append(l, track, h('div', `ub-value ub-${tone}-ink`, value));
  return row;
}

function rangeBar(min, max, points) {
  const wrap = h('div', 'ub-range');
  const track = h('div', 'ub-range-track');
  const span = max - min || 1;
  for (const p of points.filter((x) => x.value != null)) {
    const dot = h('div', `ub-dot ub-${p.tone}`);
    const at = ((p.value - min) / span) * 100;
    dot.style.left = `${Math.max(0, Math.min(100, at))}%`;
    const tag = h('div', `ub-dot-label ub-${p.tone}-ink`, `${p.label} ${money(p.value)}`);
    tag.style.left = dot.style.left;
    track.append(dot, tag);
  }
  wrap.append(track, h('div', 'ub-range-ends', `${money(min)} — ${money(max)}`));
  return wrap;
}

const kv = (pairs) => {
  const grid = h('div', 'ub-grid');
  for (const [k, v, tone] of pairs) {
    const cell = h('div', 'ub-cell');
    cell.append(h('div', 'ub-k', k), h('div', `ub-v ${tone ? `ub-${tone}-ink` : ''}`, v));
    grid.append(cell);
  }
  return grid;
};

const BODIES = {
  yield(b) {
    const max = Math.max(6, ...b.rows.map((r) => r.value_pct), b.threshold_pct) * 1.1;
    const box = h('div', 'ub-box');
    const tone = { this: 'this', likely: 'this', minimum: 'muted', area: 'muted', city: 'muted', other: 'muted' };
    for (const r of b.rows) box.append(barRow(r.label, (r.value_pct / max) * 100, `${r.value_pct}%`, tone[r.kind], null, (b.threshold_pct / max) * 100));
    return box;
  },
  supply(b) {
    const max = Math.max(...b.projects.map((p) => p.dwellings));
    const box = h('div', 'ub-box');
    for (const p of b.projects) box.append(barRow(`${p.dwellings} · ${Math.round(p.km * 1000)} m`, (p.dwellings / max) * 100, p.build_to_rent ? 'build-to-rent' : '', p.build_to_rent ? 'warn' : 'muted', p.label));
    const out = [box];
    if (b.vacancy) {
      const v = h('div', 'ub-box');
      const vmax = Math.max(b.vacancy.here_pct, b.vacancy.city_pct) * 1.25 || 1;
      v.append(h('div', 'ub-box-title', `Vacancy${b.vacancy.rank_text ? ` · ${b.vacancy.rank_text}` : ''}`));
      v.append(barRow('Here', (b.vacancy.here_pct / vmax) * 100, `${b.vacancy.here_pct}%`, b.vacancy.here_pct > b.vacancy.city_pct ? 'warn' : 'this'));
      v.append(barRow('City', (b.vacancy.city_pct / vmax) * 100, `${b.vacancy.city_pct}%`, 'muted'));
      out.push(v);
    }
    return out;
  },
  supply_timeline(b) {
    const max = Math.max(...b.years.map((y) => y.dwellings)) || 1;
    const box = h('div', 'ub-box');
    box.append(h('div', 'ub-box-title', 'New homes per year — projected'));
    for (const y of b.years) box.append(barRow(`${y.year} · yr ${y.hold_year}`, (y.dwellings / max) * 100, `${y.dwellings}`, y.build_to_rent > 0 ? 'warn' : 'muted', y.build_to_rent ? `${y.build_to_rent} build-to-rent` : null));
    const out = [box];
    if (b.already_built) out.push(h('div', 'ub-sub', `+ ${b.already_built} likely already built (in today's market)`));
    return out;
  },
  cash_flow(b) {
    const max = Math.max(...b.lines.map((l) => Math.abs(l.weekly))) || 1;
    const box = h('div', 'ub-box');
    for (const l of b.lines) box.append(barRow(l.label, (Math.abs(l.weekly) / max) * 100, signed(l.weekly), l.weekly >= 0 ? 'this' : 'warn', l.note));
    return box;
  },
  value(b) {
    const box = h('div', 'ub-box');
    box.append(
      rangeBar(b.low, Math.max(b.high, b.likely ?? 0, b.asking ?? 0), [
        { label: 'est', value: b.estimate, tone: 'this' },
        { label: 'ask', value: b.asking, tone: 'muted' },
        { label: 'likely', value: b.likely, tone: 'warn' },
      ]),
    );
    return [box, kv([['Range', `${money(b.low)} – ${money(b.high)}`], ['Confidence', `${b.confidence}/100`]])];
  },
  area(b) {
    const box = h('div', 'ub-box');
    box.append(h('div', 'ub-box-title', `vs ${b.compare_to}`));
    for (const m of b.metrics) {
      const better = m.higher_is_better ? m.here >= m.area : m.here <= m.area;
      const u = m.unit === '%' ? '%' : m.unit === 'days' ? 'd' : '';
      const fmt = (x) => (m.unit === '$' ? money(x) : `${x}${u}`);
      const max = Math.max(Math.abs(m.here), Math.abs(m.area)) || 1;
      box.append(barRow(m.label, (Math.abs(m.here) / max) * 100, `${fmt(m.here)} v ${fmt(m.area)}`, better ? 'this' : 'warn'));
    }
    return box;
  },
  offer(b) {
    const pts = [b.open, b.aim, b.walk_away, b.estimate, b.asking, b.likely, ...(b.comps ?? [])].filter((x) => x != null);
    const box = h('div', 'ub-box');
    box.append(
      rangeBar(Math.min(...pts) * 0.97, Math.max(...pts) * 1.03, [
        { label: 'aim', value: b.aim, tone: 'this' },
        { label: 'ask', value: b.asking, tone: 'muted' },
        { label: 'likely', value: b.likely, tone: 'warn' },
      ]),
    );
    return [box, kv([['Open', money(b.open)], ['Aim', money(b.aim), 'this'], ['Walk away', money(b.walk_away)]])];
  },
  hold(b) {
    const max = Math.max(...b.scenarios.map((s) => Math.abs(s.gain))) || 1;
    const box = h('div', 'ub-box');
    const tone = { best: 'this', base: 'muted', worst: 'warn', other: 'muted' };
    for (const s of b.scenarios) box.append(barRow(s.label, (Math.abs(s.gain) / max) * 100, signed(s.gain), tone[s.kind]));
    return box;
  },
  property(b) {
    const out = [kv(b.facts.map((f) => [f.label, f.value]))];
    if (b.history?.length) {
      const box = h('div', 'ub-box');
      box.append(h('div', 'ub-box-title', 'History'));
      for (const e of b.history) {
        const row = h('div', 'ub-line');
        row.append(h('span', 'ub-k', e.date), h('span', `ub-v ${e.kind === 'likely' ? 'ub-warn-ink' : e.kind === 'estimate' ? 'ub-this-ink' : ''}`, `${money(e.price)} · ${e.kind}`));
        box.append(row);
      }
      out.push(box);
    }
    return out;
  },
  overlays(b) {
    const box = h('div', 'ub-box ub-list');
    for (const it of b.items) {
      const row = h('div', `ub-item ub-status-${it.status}`);
      row.append(h('span', 'ub-item-name', it.name), h('span', 'ub-item-detail', it.detail));
      box.append(row);
    }
    const out = [box];
    if (b.transport?.length) out.push(kv(b.transport.map((t) => [t.label, t.value])));
    return out;
  },
};

/** template + body → card element (call only with a body the tool accepted). */
export function renderBlock(template, body) {
  const t = TEMPLATES[template];
  const card = h('div', `ub-card ub-${template}`);
  // no header row: the card speaks for itself (tool names aren't for investors)
  const main = h('div', 'ub-main');
  const top = h('div', 'ub-top');
  top.append(h('div', 'ub-headline', body.headline));
  if (body.badge) top.append(h('span', `ub-badge ub-${body.badge.tone}`, body.badge.text));
  if (template === 'property' && body.gnaf_id) main.append(h('div', 'ub-eyebrow', body.gnaf_id));
  main.append(top);
  try {
    const parts = [BODIES[template]?.(body) ?? []].flat();
    main.append(...parts);
  } catch (e) {
    main.append(h('div', 'ub-caption', `(could not draw this card: ${e.message})`));
  }
  if (body.caption) main.append(h('div', 'ub-caption', body.caption));
  // body.sources (API routes) stay internal — the UI is for investors, not developers
  card.append(main);
  return card;
}
