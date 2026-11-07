// The native overview block (Figma node 2:764): one instant view of the listing
// built straight from the brief — no model call.
//   header (matched address + live pill) · sale & budget analysis card (big likely
//   sale, budget badge, horizontal price scale, price breakdown) · "The numbers"
//   dark band · "What the listing doesn't say" insight rows (tap → asks the agent).
// DOM + textContent only; model text never reaches here. Icons are static markup
// from ui/icons.jsx — never model text.

import { iconSvg } from './icons.jsx';

const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
};
const icon = (parent, name, size, cls) => {
  const s = document.createElement('span');
  s.className = cls || '';
  s.innerHTML = iconSvg(name, size); // static strings only
  parent.append(s);
  return s;
};
const K = (n) => (n == null ? 'n/a' : n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(n / 1000)}K`);
const titleCase = (s) => String(s ?? '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const shortAddress = (a) => titleCase(String(a ?? '').replace(/^UNIT\s+/i, '')).replace(/\s*\(.*\)/, '');
const at = (v, min, max) => Math.max(1.5, Math.min(98.5, ((v - min) / (max - min || 1)) * 100));

/** "What the listing doesn't say" rows — warnings first, each tappable. */
function signals(b, investor) {
  const out = [];
  const s = b.supply ?? {};
  if (s.largest?.length) {
    const top = s.largest[0];
    out.push({
      tag: 'SUPPLY',
      icon: 'building-2',
      tone: s.build_to_rent_dwellings > 0 || s.new_dwellings_stated >= 300 ? 'risk' : 'good',
      text: `${top.dwellings} ${top.build_to_rent ? 'build-to-rent' : 'new homes'}, ${Math.round(top.km * 1000)} m`,
      value: `${s.new_dwellings_stated} homes`,
      ask: 'Is the new supply a dealbreaker?',
    });
  }
  const tl = s.timeline;
  if (tl?.peak) {
    out.push({
      tag: 'TIMING',
      icon: 'calendar-clock',
      tone: tl.peak.build_to_rent > 0 || tl.peak.dwellings >= 150 ? 'risk' : 'good',
      text: `${tl.peak.build_to_rent > 0 ? 'Build-to-rent wave' : 'Supply peaks'} ~${tl.peak.year}`,
      value: `yr ${tl.peak.hold_year} of ${investor.holdYears ?? tl.years.length - 1}`,
      ask: 'When does the new supply land?',
    });
  }
  const { asking, likely_sale: likely, value } = b.price ?? {};
  if (asking && likely && likely !== asking) {
    out.push({ tag: 'QUOTE', icon: 'tag', tone: likely > asking ? 'risk' : 'good', text: likely > asking ? 'Agency sells over quote' : 'Agency sells under quote', value: `${likely > asking ? '+' : '−'}${K(Math.abs(likely - asking))}`, ask: 'What should I offer?' });
  }
  if (asking && value?.estimate) {
    out.push({ tag: 'VALUE', icon: 'chart-combined', tone: asking > value.estimate ? 'risk' : 'good', text: asking > value.estimate ? 'Asking above estimate' : 'Asking below estimate', value: `${asking > value.estimate ? '+' : '−'}${K(Math.abs(asking - value.estimate))}`, ask: "What's it really worth?" });
  }
  if (b.rent?.weekly) {
    const comps = b.rent.comparables;
    const beds = b.property?.beds;
    const text = comps != null ? `${comps} ${beds != null ? `${beds}-bed ` : ''}rental comps ≤ 1 km` : 'median of same-bed rentals nearby';
    out.push({ tag: 'RENT', icon: 'key-round', tone: 'good', text, value: `$${b.rent.weekly}/wk`, ask: 'Will it earn enough?' });
  }
  for (const r of (b.risks ?? []).slice(0, 1)) {
    out.push({
      tag: 'RISK',
      icon: 'alert',
      tone: 'risk',
      text: ({ hv_power_line: 'High-voltage power line', flood: 'Flood zone', heritage: 'Heritage overlay', bushfire: 'Bushfire zone' })[r.name] ?? titleCase(r.name.replace(/_/g, ' ')),
      value: String(r.detail ?? '').replace(/^Not on property;\s*/i, '').replace(/^nearest\s+/i, '').replace(/\s*away$/, ''),
      ask: 'Any hazards I should check?',
    });
  }
  return out.sort((a, c) => (a.tone === c.tone ? 0 : a.tone === 'risk' ? -1 : 1));
}

/** Horizontal price scale: teal interval to the likely sale, budget tick, three markers. */
function priceScale(container, { min, max, budget, likely, asking, estimate }) {
  const annot = h('div', 'ov-annot');
  annot.append(h('span', 'ov-annot-good', 'Likely sale'), h('span', 'ov-annot-muted', 'Estimated value'));
  const scale = h('div', 'ov-scale');
  scale.append(h('div', 'ov-track'));
  const fill = h('div', 'ov-fill');
  fill.style.width = `${at(likely, min, max)}%`;
  scale.append(fill);
  if (budget != null) {
    const tick = h('div', 'ov-tick');
    tick.style.left = `${at(budget, min, max)}%`;
    scale.append(tick);
  }
  const marker = (v, cls) => {
    if (v == null) return;
    const m = h('div', `ov-marker ${cls}`);
    m.style.left = `${at(v, min, max)}%`;
    scale.append(m);
  };
  marker(likely, 'ov-m-sale');
  marker(asking, 'ov-m-ask');
  marker(estimate, 'ov-m-est');
  const bounds = h('div', 'ov-bounds');
  bounds.append(h('span', null, K(min)), h('span', null, K(max)));
  container.append(annot, scale, bounds);
}

/** Price breakdown rows (colour swatch · label (+sub) · value). */
function breakdownRow(swClass, label, sub, value, valueClass) {
  const row = h('div', 'ov-row');
  row.append(h('div', `ov-sw ${swClass}`));
  const main = h('div', 'ov-row-main');
  main.append(h('div', 'ov-row-label', label));
  if (sub) main.append(h('div', 'ov-row-sub', sub));
  row.append(main, h('div', `ov-row-value ${valueClass ?? ''}`, value));
  return row;
}

/**
 * @param {Object} b  the listing brief
 * @param {Object} investor  { budget, deposit, minYield, holdYears }
 * @param {{ onAsk?: (question: string) => void }} [o]
 */
export function renderOverview(b, investor = {}, { onAsk = () => {} } = {}) {
  const root = h('section', 'ov');
  const p = b.property ?? {};
  const price = b.price ?? {};

  // header — matched address + status pill
  const head = h('div', 'ov-head');
  const who = h('div', 'ov-who');
  who.append(h('div', 'ov-address', shortAddress(p.address)));
  const facts = h('div', 'ov-facts');
  facts.append(h('span', null, p.gnaf_id ?? ''));
  if (p.beds != null) {
    const f = h('span', 'ov-fact');
    icon(f, 'bed-double', 14);
    f.append(h('span', null, `${p.beds} bed`));
    facts.append(f);
  }
  if (p.baths != null) {
    const f = h('span', 'ov-fact');
    f.append(h('span', null, `${p.baths} bath`));
    facts.append(f);
  }
  if (p.parking != null) {
    const f = h('span', 'ov-fact');
    icon(f, 'car-front', 14);
    f.append(h('span', null, `${p.parking} car`));
    facts.append(f);
  }
  who.append(facts);
  const pill = h('span', `ov-pill ${b.meta?.test_data ? 'ov-test' : b.meta?.cached ? 'ov-cache' : ''}`, b.meta?.test_data ? 'Test' : b.meta?.cached ? 'Cached' : 'Live');
  head.append(who, pill);
  root.append(head);

  const budget = investor.budget ?? null;
  const likely = price.likely_sale ?? price.asking ?? price.value?.estimate ?? null;

  // sale & budget analysis card
  if (likely) {
    const card = h('div', 'ov-card');
    const pts = [price.value?.low, price.value?.estimate, price.asking, likely, budget].filter((x) => x != null);
    const min = Math.floor((Math.min(...pts) * 0.97) / 50000) * 50000;
    const max = Math.ceil((Math.max(...pts) * 1.02) / 50000) * 50000;

    // headline: likely sale (or asking/estimate) + budget badge
    const sale = h('div', 'ov-sale');
    const big = h('div');
    big.append(h('div', 'ov-k', price.likely_sale ? 'LIKELY SALE' : price.asking ? 'ASKING' : 'ESTIMATED VALUE'), h('div', 'ov-big', K(likely)));
    sale.append(big);
    const side = h('div', 'ov-sale-side');
    if (budget != null) {
      const diff = budget - likely;
      const badge = h('span', `ov-badge ${diff < 0 ? 'ov-over' : ''}`);
      if (diff >= 0) icon(badge, 'check', 14);
      badge.append(h('span', null, `${K(Math.abs(diff))} ${diff >= 0 ? 'under' : 'over'} budget`));
      side.append(badge, h('span', 'ov-budget-line', `Your budget · ${K(budget)}`));
    }
    sale.append(side);
    card.append(sale);

    // the price scale
    const scalewrap = h('div', 'ov-scalewrap');
    priceScale(scalewrap, { min, max, budget, likely, asking: price.asking, estimate: price.value?.estimate });
    card.append(scalewrap);

    // breakdown
    card.append(h('hr', 'ov-hr'));
    if (price.value?.estimate) {
      card.append(breakdownRow('ov-sw-ink', 'Estimated value', price.value.confidence != null ? `AVM · conf ${price.value.confidence}` : 'recent sales nearby', K(price.value.estimate)));
    }
    if (price.asking) card.append(breakdownRow('ov-sw-risk', 'Asking', null, K(price.asking), 'ov-risk-ink'));
    if (budget != null) card.append(breakdownRow('ov-sw-muted', 'Your budget', null, K(budget), 'ov-muted-ink'));
    if (price.likely_sale) {
      const a = price.agency;
      card.append(breakdownRow('ov-sw-good', 'Likely sale', a ? `agency ${a.median_over_quote_pct > 0 ? '+' : '−'}${Math.abs(Math.round(a.median_over_quote_pct))}% over quote · ${Math.round(a.underquote_rate_pct)}% of sales` : null, K(price.likely_sale), 'ov-good-ink'));
    }
    root.append(card);
  }

  // the numbers — dark band
  const y = b.returns?.gross_yield_pct_at_asking ?? b.returns?.gross_yield_pct_at_likely;
  const net = b.weekly_cost?.net_before_tax;
  const vac = b.market?.unit_vacancy_pct;
  if (y != null || net != null || vac != null) {
    const sec = h('div');
    sec.append(h('div', 'ov-section-head', 'The numbers'));
    const band = h('div', 'ov-numbers');
    const metric = (label, barCls, value, sub) => {
      const m = h('div', 'ov-num');
      m.append(h('div', 'ov-num-label', label));
      const v = h('div', 'ov-num-value');
      v.append(h('span', `ov-num-bar ${barCls}`), h('span', null, value));
      m.append(v, h('div', 'ov-num-sub', sub));
      return m;
    };
    band.append(metric('Gross yield', y != null && investor.minYield != null && y >= investor.minYield ? 'ov-good' : 'ov-risk', y != null ? `${y}%` : 'n/a', b.market?.suburb_unit_yield_pct != null ? `suburb ${b.market.suburb_unit_yield_pct}%` : ''));
    band.append(h('div', 'ov-num-divider'));
    band.append(metric('Weekly cost', net != null && net <= 0 ? 'ov-good' : 'ov-neutral', net == null ? 'n/a' : `${net > 0 ? '−' : '+'}$${Math.abs(Math.round(net))}`, b.returns?.price_basis ? `at ${K(b.returns.price_basis)} · pre-tax` : ''));
    band.append(h('div', 'ov-num-divider'));
    band.append(metric('Unit vacancy', vac != null && vac < 2 ? 'ov-good' : 'ov-risk', vac != null ? `${vac}%` : 'n/a', 'suburb units'));
    sec.append(band);
    root.append(sec);
  }

  // what the listing doesn't say — tappable insight rows
  const sig = signals(b, investor);
  if (sig.length) {
    const sec = h('div');
    const headRow = h('div', 'ov-section-head');
    headRow.append(h('span', null, "What the listing doesn't say"), h('span', 'ov-section-note', 'Tap to dig in'));
    const list = h('div', 'ov-insights');
    for (const s of sig) {
      const r = h('button', `ov-insight ov-${s.tone}`);
      r.type = 'button';
      r.title = s.ask;
      r.addEventListener?.('click', () => onAsk(s.ask));
      const tile = h('span', 'ov-symbol');
      tile.innerHTML = iconSvg(s.icon, 17); // static strings only
      r.append(tile);
      const main = h('span', 'ov-insight-main');
      main.append(h('span', 'ov-insight-tag', s.tag), h('span', 'ov-insight-text', s.text));
      r.append(main, h('span', 'ov-insight-value', s.value));
      icon(r, 'chevron-right', 13, 'ov-chev');
      list.append(r);
    }
    sec.append(headRow, list);
    root.append(sec);
  }
  return root;
}
