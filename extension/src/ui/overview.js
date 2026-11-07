// The native overview block (design B "Listing + paper panel"): one instant view of the
// listing built straight from the brief — no model call. POC; Carlos polishes in React.
//   header (matched address) · price gauge · legend · 3 readouts · "What the listing
//   doesn't say" signal rows (tap → asks the agent the matching question).
// DOM + textContent only; model text never reaches here.

import { settle } from './motion.js';
import { iconSvg } from './icons.jsx';

const SIGNAL_ICONS = { SUPPLY: 'building-2', TIMING: 'calendar-clock', QUOTE: 'tag', VALUE: 'chart-combined', RENT: 'key-round', RISK: 'alert' };
import { tip } from './tooltip.js';
import { agencySentence, agencyShort } from '../agent/agency-text.js';

const SVG = 'http://www.w3.org/2000/svg';
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
};
const svg = (tag, attrs) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const K = (n) => (n == null ? 'n/a' : n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(n / 1000)}K`);
const titleCase = (s) => String(s ?? '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const shortAddress = (a) => titleCase(String(a ?? '').replace(/^UNIT\s+/i, '')).replace(/\s*\(.*\)/, '');

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const BLUE = '#2F64D9';
const WARN = '#E3A008';
const GREY = '#E4DFD3';

/** Half-ring of ticks from min→max; colour by budget / likely; dashed needle at the budget. */
const SWEEP_MS = 1300; // the coloured part of the dial fills over ~1.3 s
const SWEEP_DELAY = 150;
// Gentle ease-out sweep: progress = 1 − (1 − t)^1.5 — quick off the mark, decelerating
// without stalling (≈22 ms between ticks at the start → ≈110 ms at the end; a cubic
// left a 350 ms hang on the last tick). Each tick's START TIME is the inverse curve, and
// the price count-up uses the same curve, so the number and the dial move together.
const EASE_POW = 1.5;
export const dialEase = (t) => 1 - (1 - t) ** EASE_POW;
const tickTime = (progress) => 1 - (1 - progress) ** (1 / EASE_POW);

function gauge({ min, max, budget, likely }) {
  const W = 360;
  const H = 190;
  const cx = 180;
  const cy = 176;
  const r1 = 122;
  const r2 = 148;
  const N = 47;
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'ov-gauge-svg' });
  const at = (v) => Math.PI * (1 - Math.max(0, Math.min(1, (v - min) / (max - min || 1)))); // left = min
  // colour per tick first; only ticks that change colour take part in the sweep
  const over = likely != null && budget != null && likely > budget;
  const colours = Array.from({ length: N }, (_, i) => {
    const v = min + ((max - min) * i) / (N - 1);
    return v <= Math.min(budget ?? Infinity, likely ?? Infinity) ? BLUE : over && v <= likely ? WARN : GREY;
  });
  const lastLit = colours.findLastIndex((c) => c !== GREY);
  for (let i = 0; i < N; i++) {
    const v = min + ((max - min) * i) / (N - 1);
    const a = Math.PI * (1 - i / (N - 1));
    const colour = colours[i];
    s.append(
      svg('line', {
        x1: (cx + r1 * Math.cos(a)).toFixed(1),
        y1: (cy - r1 * Math.sin(a)).toFixed(1),
        x2: (cx + r2 * Math.cos(a)).toFixed(1),
        y2: (cy - r2 * Math.sin(a)).toFixed(1),
        stroke: colour,
        'stroke-width': 4.5,
        'stroke-linecap': 'round',
        class: 'ov-tick',
        // coloured ticks snap on in an ease-out sweep (grey ticks don't animate)
        ...(i <= lastLit && colour !== GREY ? { class: 'ov-tick ov-lit', style: `--d:${Math.round(SWEEP_DELAY + SWEEP_MS * tickTime(i / Math.max(1, lastLit)))}ms` } : {}),
        'data-tip-title': `≈ ${K(v)}`,
        'data-tip': budget != null && v <= budget ? 'Within your budget.' : likely != null && v <= likely ? 'Over your budget, but below the likely sale price.' : 'Above the likely sale price.',
      }),
    );
  }
  if (budget != null) {
    const a = at(budget);
    s.append(svg('line', { x1: (cx + (r1 - 22) * Math.cos(a)).toFixed(1), y1: (cy - (r1 - 22) * Math.sin(a)).toFixed(1), x2: (cx + (r2 + 4) * Math.cos(a)).toFixed(1), y2: (cy - (r2 + 4) * Math.sin(a)).toFixed(1), stroke: '#1E1D1B', 'stroke-width': 1.5, 'stroke-dasharray': '2 3', class: 'ov-needle', style: `--d:${SWEEP_DELAY + SWEEP_MS}ms` }));
  }
  return s;
}

/** Loading state: the same half-ring in grey, with a slow sweep, while the brief loads. */
export function renderOverviewLoading(text = 'Reading this listing…') {
  const root = h('div', 'ov-loading');
  const W = 360;
  const s = svg('svg', { width: W, height: 150, viewBox: '0 26 360 150', class: 'ov-gauge-svg' });
  const N = 47;
  for (let i = 0; i < N; i++) {
    const a = Math.PI * (1 - i / (N - 1));
    s.append(svg('line', { x1: (180 + 122 * Math.cos(a)).toFixed(1), y1: (176 - 122 * Math.sin(a)).toFixed(1), x2: (180 + 148 * Math.cos(a)).toFixed(1), y2: (176 - 148 * Math.sin(a)).toFixed(1), stroke: '#E9E5DB', 'stroke-width': 4.5, 'stroke-linecap': 'round', style: `--i:${i}` }));
  }
  const step = h('div', 'ov-loading-step');
  root.append(s, h('div', 'ov-loading-text', text), step);
  /** update the small progress line under the gauge */
  root.setStep = (t) => (step.textContent = t ?? '');
  return root;
}

const CHEVRON = () => {
  const s = svg('svg', { width: 12, height: 12, viewBox: '0 0 16 16' });
  s.append(svg('path', { d: 'M6 3l5 5-5 5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return s;
};

function signals(b, investor) {
  const out = [];
  const s = b.supply ?? {};
  if (s.largest?.length) {
    const top = s.largest[0];
    out.push({
      tag: 'SUPPLY',
      tone: s.build_to_rent_dwellings > 0 || s.new_dwellings_stated >= 300 ? 'warn' : 'good',
      text: `${top.dwellings} ${top.build_to_rent ? 'build-to-rent' : 'new homes'}, ${Math.round(top.km * 1000)} m`,
      value: `${s.new_dwellings_stated} homes`,
      ask: 'Is the new supply a dealbreaker?',
      tip: `${plural(s.applications, 'development application')} within ${s.radius_km ?? 1} km state ${s.new_dwellings_stated} new homes${s.build_to_rent_dwellings ? `, ${s.build_to_rent_dwellings} of them build-to-rent (they compete for tenants)` : ''}. Biggest: ${s.largest.slice(0, 3).map((p) => `${p.dwellings} at ${String(p.address).split(',')[0]}`).join('; ')}. DA stage isn't known.`,
    });
  }
  const tl = s.timeline;
  if (tl?.peak) {
    out.push({
      tag: 'TIMING',
      tone: tl.peak.build_to_rent > 0 || tl.peak.dwellings >= 150 ? 'warn' : 'good',
      text: `${tl.peak.build_to_rent > 0 ? 'Build-to-rent wave' : 'Supply peaks'} ~${tl.peak.year}`,
      value: `year ${tl.peak.hold_year} of ${investor.holdYears ?? tl.years.length}`,
      ask: 'When does the new supply land?',
    });
  }
  const { asking, likely_sale: likely, value } = b.price ?? {};
  if (asking && likely && likely !== asking) {
    out.push({ tag: 'QUOTE', tone: likely > asking ? 'warn' : 'good', text: likely > asking ? 'Agency sells over quote' : 'Agency sells under quote', value: `${likely > asking ? '+' : '−'}${K(Math.abs(likely - asking))}`, ask: 'What should I offer?', tip: b.price?.agency ? `${b.price.agency.name} (${String(b.price.agency.cohort).toLowerCase()}). ${agencySentence(b.price.agency)} Asking ${K(asking)} → likely ${K(likely)}.` : `Asking ${K(asking)} vs likely ${K(likely)}.` });
  }
  if (asking && value?.estimate) {
    out.push({ tag: 'VALUE', tone: asking > value.estimate ? 'warn' : 'good', text: asking > value.estimate ? 'Asking above estimate' : 'Asking below estimate', value: `${asking > value.estimate ? '+' : '−'}${K(Math.abs(asking - value.estimate))}`, ask: "What's it really worth?", tip: `Microburbs' automated valuation is ${K(value.estimate)} (range ${K(value.low)}–${K(value.high)}, confidence ${value.confidence}/100), from recent nearby sales. Asking is ${K(asking)}. A second opinion, not a bank valuation.` });
  }
  if (b.rent?.weekly) {
    out.push({ tag: 'RENT', tone: 'good', text: `${plural(b.rent.comparables, 'similar rental')} within 1 km`, value: `$${b.rent.weekly}/wk`, ask: 'Will it earn enough?', tip: `Median of ${b.rent.comparables} ${b.property?.beds ?? ''}-bed units advertised for rent within 1 km: $${b.rent.weekly}/wk (middle half $${b.rent.low}–${b.rent.high}).${b.rent.this_property_last ? ` This property last advertised at $${b.rent.this_property_last.weekly}/wk (${b.rent.this_property_last.date}).` : ''}` });
  }
  const m = b.rent_model;
  if (m?.covered) {
    const rl = b.rent_listing;
    const carText = m.scenario === 'with' ? 'with car space' : m.scenario === 'without' ? 'no car space' : 'car space unknown';
    const both = `$${m.with_car}/wk with a car space, $${m.without_car}/wk without (parking premium $${m.premium}/wk)`;
    const acc = `Typically within ~$${m.typical_error}/wk; ${m.within_100_pct}% of held-out adverts within $100.`;
    if (rl?.vs_model_pct != null) {
      const over = rl.vs_model_pct > 0;
      out.push({ tag: 'MODEL', tone: rl.vs_model_pct > 10 ? 'warn' : 'good', text: `Asking ${Math.abs(rl.vs_model_pct)}% ${over ? 'above' : 'below'} our model`, value: `$${m.weekly}/wk`, ask: 'Is the asking rent fair?', tip: `Our rent model's estimate for ${m.period}: ${both}. This listing asks $${rl.asking_weekly}/wk. ${acc}` });
    } else {
      out.push({ tag: 'MODEL', tone: 'good', text: `Our rent model · ${carText}`, value: `$${m.weekly}/wk`, ask: 'What is the parking worth?', tip: `Our rent model's estimate for ${m.period}: ${both}.${m.scenario ? '' : ' Car spaces unknown, so yield uses the without-car figure.'} It drives the yield and weekly cost here. ${acc}` });
    }
  }
  for (const r of (b.risks ?? []).slice(0, 1)) {
    out.push({ tag: 'RISK', tone: 'warn', text: ({ hv_power_line: 'High-voltage power line', flood: 'Flood zone', heritage: 'Heritage overlay', bushfire: 'Bushfire zone', public_housing: 'Public housing' })[r.name] ?? titleCase(r.name.replace(/_/g, ' ')), value: String(r.detail ?? '').replace(/^Not on property;\s*/i, '').replace(/^nearest\s+/i, '').replace(/\s*away$/, ''), ask: 'Any hazards I should check?', tip: `${r.detail}. ${r.on_property ? 'On the title itself.' : 'Not on the title, but close — check the strata report and a site visit.'}` });
  }
  // warnings first
  return out.sort((a, c) => (a.tone === c.tone ? 0 : a.tone === 'warn' ? -1 : 1));
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

  // header
  const head = h('div', 'ov-head');
  const who = h('div', 'ov-who');
  who.append(h('div', 'ov-address', shortAddress(p.address)), h('div', 'ov-id', [p.gnaf_id, p.beds != null && `${p.beds} bed`, p.parking != null && `${p.parking} car`].filter(Boolean).join(' · ')));
  head.append(who, h('span', `ov-live ${b.meta?.test_data ? 'ov-test' : ''}`, b.meta?.test_data ? 'test data' : b.meta?.cached ? 'signals · cached' : 'signals · live'));
  root.append(head);

  // gauge
  const budget = investor.budget ?? null;
  const likely = price.likely_sale ?? price.asking ?? price.value?.estimate ?? null;
  if (likely && !b.rent_listing) {
    const pts = [price.value?.low, price.value?.estimate, price.asking, likely, budget].filter((x) => x != null);
    const min = Math.floor((Math.min(...pts) * 0.95) / 50000) * 50000;
    const max = Math.ceil((Math.max(...pts) * 1.04) / 50000) * 50000;
    const g = h('div', 'ov-gauge');
    g.append(gauge({ min, max, budget, likely }));
    const centre = h('div', 'ov-centre');
    const diff = budget != null ? likely - budget : null;
    const sub = h('div', 'ov-sub', `${price.likely_sale ? 'likely sale' : price.asking ? 'asking' : 'estimate'}`);
    if (diff != null) sub.append(' · ', h('span', diff > 0 ? 'ov-warn-ink' : 'ov-blue-ink', `${K(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} budget`));
    const big = h('div', 'ov-big', K(likely));
    settle(big, { from: 0.8, ms: SWEEP_MS, delay: SWEEP_DELAY, ease: dialEase }); // counts up on the dial's curve
    centre.append(big, sub);
    g.append(centre, h('div', 'ov-end ov-min', K(min)), h('div', 'ov-end ov-max', K(max)));
    root.append(g);

    // legend
    const legend = h('div', 'ov-legend');
    const row = (swatch, label, meta, value, cls = '') => {
      const r = h('div', 'ov-legend-row');
      const l = h('div', 'ov-legend-label', label);
      if (meta) l.append(' ', h('span', 'ov-meta', meta));
      r.append(h('span', `ov-sw ov-sw-${swatch}`), l, h('div', `ov-legend-value ${cls}`, value));
      return r;
    };
    if (price.value?.estimate) {
      const fromAvm = price.value.confidence != null;
      legend.append(tip(row('ink', 'Estimated value', fromAvm ? `AVM · conf ${price.value.confidence}` : 'recent sales nearby', K(price.value.estimate)), fromAvm ? `Microburbs' automated valuation from recent nearby sales: ${K(price.value.estimate)}, range ${K(price.value.low)}–${K(price.value.high)}, confidence ${price.value.confidence}/100.` : `Microburbs has no valuation for this property, so this is the ${price.value.basis ?? 'median of recent same-bed sales nearby'} (middle half ${K(price.value.low)}–${K(price.value.high)}).`, 'Estimated value'));
    }
    if (price.asking) {
      const src = price.asking_source && price.asking_source !== 'agency quote' && price.asking_source !== 'for-sale record' ? price.asking_source : null;
      legend.append(tip(row('muted', 'Asking', src, K(price.asking)), src ? `The price this listing shows (${price.listing_price_text ?? src}), used because Microburbs has no quote for it: ${K(price.asking)}.` : `The price the agency is quoting for this listing: ${K(price.asking)}.`, 'Asking'));
    }
    if (budget != null) legend.append(tip(row('dash', 'Your budget', null, K(budget)), `From your brief (${K(budget)} with a ${K(investor.deposit)} deposit). Change it from the brief chip in the header.`, 'Your budget'));
    if (price.likely_sale) {
      const a = price.agency;
      legend.append(tip(row('warn', 'Likely sale', agencyShort(a), K(price.likely_sale), 'ov-warn-ink'), a ? `What this listing will most likely sell for, given the agency's record. ${agencySentence(a)}` : 'Microburbs’ likely sale price for this listing.', 'Likely sale'));
    }
    root.append(legend);
  }

  // readouts
  const readouts = h('div', 'ov-readouts');
  const readout = (label, value, sub, tone) => {
    const c = h('div', 'ov-readout');
    const v = h('div', 'ov-readout-value');
    const num = h('span', 'ov-num', value);
    settle(num, { from: 0.7, ms: 600, delay: 400 });
    v.append(h('span', `ov-dot ov-dot-${tone}`), num);
    c.append(h('div', 'ov-readout-label', label), v, h('div', 'ov-meta', sub));
    return c;
  };
  const y = b.returns?.gross_yield_pct_at_asking ?? b.returns?.gross_yield_pct_at_likely;
  const rentUsed = b.returns?.rent_weekly_used ?? b.rent?.weekly;
  const rentFrom = b.returns?.rent_source === 'model' ? 'our rent model' : 'similar rentals nearby';
  const r0 = readouts.children.length;
  const rl = b.rent_listing;
  if (rl) {
    // a rental listing: judge the asking rent, no purchase maths
    readouts.append(readout('Asking rent', rl.asking_weekly != null ? `$${rl.asking_weekly}` : 'n/a', rl.asking_weekly != null ? 'per week' : 'not shown', 'blue'));
    readouts.append(readout('Rent model', rl.model_weekly != null ? `$${rl.model_weekly}` : 'n/a', rl.vs_model_pct != null ? `asking ${rl.vs_model_pct > 0 ? '+' : ''}${rl.vs_model_pct}%` : rl.model_weekly != null ? 'per week' : 'no estimate', rl.vs_model_pct != null && rl.vs_model_pct <= 10 ? 'blue' : 'warn'));
  } else {
    readouts.append(readout('Gross yield', y != null ? `${y}%` : 'n/a', b.market?.suburb_unit_yield_pct != null ? `suburb ${b.market.suburb_unit_yield_pct}%` : '', y != null && investor.minYield != null && y >= investor.minYield ? 'blue' : 'warn'));
    const net = b.weekly_cost?.net_before_tax;
    readouts.append(readout('Weekly cost', net == null ? 'n/a' : `${net > 0 ? '−' : '+'}$${Math.abs(Math.round(net))}`, b.returns?.price_basis ? `at ${K(b.returns.price_basis)} · pre-tax` : '', net != null && net <= 0 ? 'blue' : 'warn'));
  }
  const vac = b.market?.unit_vacancy_pct;
  readouts.append(readout('Unit vacancy', vac != null ? `${vac}%` : 'n/a', 'suburb units', vac != null && vac < 2 ? 'blue' : 'warn'));
  const [ry, rw, rv] = [...readouts.children].slice(r0);
  const w = b.weekly_cost ?? {};
  if (rl) {
    tip(ry, `${rl.asking_weekly != null ? 'The rent this listing asks' : 'This listing does not show a weekly rent'}${rl.listing_price_text ? ` ("${rl.listing_price_text}")` : ''}.${rl.comparables_weekly != null ? ` Similar rentals within 1 km: median $${rl.comparables_weekly}/wk.` : ''}`, 'Asking rent');
    tip(rw, rl.model_weekly != null ? `Our rent model's estimate for this apartment (${b.rent_model?.period}): $${rl.model_weekly}/wk. Typically within ~$${b.rent_model?.typical_error}/wk.` : 'No estimate: our rent model only covers individual City of Sydney apartments (not houses, share rooms or new builds).', 'Rent model');
  } else {
    tip(ry, `Weekly rent × 52 ÷ asking price${rentUsed ? ` = $${rentUsed} (${rentFrom}) × 52 ÷ ${K(price.asking ?? b.returns?.price_basis)}` : ''}${b.returns?.gross_yield_pct_at_likely != null ? `; ${b.returns.gross_yield_pct_at_likely}% at the likely sale` : ''}. Your minimum is ${investor.minYield}%. Before costs.`, 'Gross yield');
    tip(rw, w.net_before_tax != null ? `Per week before tax at ${K(b.returns?.price_basis)}: interest $${Math.round(w.interest)} + strata $${Math.round(w.strata ?? 0)} + rates/insurance $${Math.round(w.rates_insurance)} − rent $${Math.round(w.rent)} (${rentFrom}). ${w.assumptions}.` : 'Needs a price and a rent estimate.', 'Weekly cost');
  }
  tip(rv, 'Share of the suburb\'s rental units sitting vacant (latest month). Under 2% is a tight market — easier to keep a tenant.', 'Unit vacancy');
  root.append(readouts);
  if (b.rent_model?.covered === false) root.append(h('div', 'ov-meta ov-model-note', 'Rent model: no estimate — only individual City of Sydney apartments (not houses, share rooms or new builds)'));

  // signals
  const sig = signals(b, investor);
  if (sig.length) {
    const box = h('div', 'ov-signals');
    const title = h('div', 'ov-signals-title');
    title.append(h('span', null, "What the listing doesn't say"), h('span', 'ov-meta', 'tap to dig in'));
    const list = h('div', 'ov-signal-list');
    sig.forEach((s, i) => {
      const r = h('button', `ov-signal ov-signal-${s.tone}${i === 0 ? ' ov-first' : ''}`);
      r.type = 'button';
      r.title = s.ask;
      const chev = h('span', 'ov-chev');
      chev.append(CHEVRON());
      // icon tile + tag over text (layout and icons from Carlos's redesign)
      const tile = h('span', 'ov-symbol');
      tile.innerHTML = iconSvg(SIGNAL_ICONS[s.tag] ?? 'sparkles', 17); // static markup only
      const main = h('span', 'ov-sig-main');
      main.append(h('span', 'ov-tag', s.tag), h('span', 'ov-text', s.text));
      r.append(tile, main, h('span', 'ov-value', s.value), chev);
      r.addEventListener?.('click', () => onAsk(s.ask));
      if (s.tip) {
        r.removeAttribute('title'); // the tooltip replaces the native one
        const TITLES = { SUPPLY: 'New supply nearby', TIMING: 'When the supply lands', QUOTE: 'How this agency quotes', VALUE: 'Value vs asking', RENT: 'Rent', MODEL: 'Fine Print rent model', RISK: 'Hazard nearby' };
        tip(r, `${s.tip} Tap to ask: "${s.ask}"`, TITLES[s.tag] ?? s.tag);
      }
      list.append(r);
    });
    box.append(title, list);
    root.append(box);
  }
  return root;
}
