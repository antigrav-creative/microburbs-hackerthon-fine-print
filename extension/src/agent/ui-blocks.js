// render_ui_block — the agent attaches ONE visual card to its reply, chosen from the
// design's templates (design/screens/d-chat-components.png). "Shown when asked.
// Never all at once."
//
// SELF-DOCUMENTING: each template carries a strict body schema, a purpose line and a
// full example. A wrong body comes back as a retryable error listing exactly what's
// wrong + that template's field guide + the example, so the model fixes it in-band.
// LEARNING: every correction is recorded (chrome.storage.local) and the most common
// past mistakes are fed back into later turns' context, so they stop recurring.
//
// The tool `concludes`: a reply sentence + one successful block ends the turn in a
// single model step. A failed block does NOT conclude — the model gets to fix it.

import { tool, ToolError } from '../runtime/index.js';
import { validate } from '../runtime/validate.js';
import { agencySentence } from './agency-text.js';

// ---------------------------------------------------------------- schema helpers
const str = (maxLength = 120) => ({ type: 'string', minLength: 1, maxLength });
const num = (minimum, maximum) => ({ type: 'number', ...(minimum !== undefined ? { minimum } : {}), ...(maximum !== undefined ? { maximum } : {}) });
const arr = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const oneOf = (...values) => ({ type: 'string', enum: values });

const COMMON = {
  headline: { ...str(28), description: 'the big number/word exactly as displayed, e.g. "5.7%", "$713K", "−$94"' },
  caption: { ...str(320), description: '1–2 sentences: what it means for this investor' },
  sources: { ...arr(str(60), 1, 5), description: 'Microburbs endpoints the numbers came from, e.g. "valuation/avm"' },
};
const badge = obj({ text: str(28), tone: oneOf('good', 'warn', 'neutral') });

/** template → { title (design tool name), question, purpose, schema, example } */
export const TEMPLATES = {
  yield: {
    title: 'show_yield_comparison',
    question: 'Will it earn enough?',
    purpose: 'Gross yield of this property vs the area, the city and the investor minimum.',
    schema: obj(
      {
        headline: COMMON.headline,
        badge,
        rows: arr(obj({ label: str(28), value_pct: num(0, 20), kind: oneOf('this', 'likely', 'area', 'city', 'minimum', 'other') }), 2, 6),
        threshold_pct: { ...num(0, 20), description: "the investor's minimum gross yield, percent" },
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'rows', 'threshold_pct', 'caption', 'sources'],
    ),
    example: {
      headline: '5.2%',
      badge: { text: '+1.2 pts over your 4%', tone: 'good' },
      rows: [
        { label: 'This property', value_pct: 5.2, kind: 'this' },
        { label: 'At likely $852K', value_pct: 4.73, kind: 'likely' },
        { label: 'Zetland units', value_pct: 5.21, kind: 'area' },
        { label: 'Your minimum', value_pct: 4, kind: 'minimum' },
      ],
      threshold_pct: 4,
      caption: 'Rent from 4 similar 1-bedroom rentals within 1 km: median $775/wk (most between $740 and $815).',
      sources: ['listings/for-rent', 'market/yield-pct'],
    },
  },
  supply: {
    title: 'show_future_supply',
    question: 'Will the rent hold up?',
    purpose: 'New homes in development applications within 1 km, biggest first; build-to-rent competes for tenants.',
    schema: obj(
      {
        headline: COMMON.headline,
        badge,
        projects: arr(obj({ dwellings: { type: 'integer', minimum: 1 }, km: num(0, 5), build_to_rent: { type: 'boolean' }, label: str(48) }, ['dwellings', 'km', 'build_to_rent']), 1, 5),
        vacancy: obj({ here_pct: num(0, 100), city_pct: num(0, 100), rank_text: str(40) }, ['here_pct', 'city_pct']),
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'projects', 'caption', 'sources'],
    ),
    example: {
      headline: '504',
      badge: { text: 'biggest risk', tone: 'warn' },
      projects: [{ dwellings: 504, km: 0.64, build_to_rent: true, label: '960A Bourke St' }],
      vacancy: { here_pct: 1.52, city_pct: 1.1 },
      caption: '504 build-to-rent homes lodged Oct 2026 compete for tenants directly. DA stage is unknown.',
      sources: ['development/da-list', 'market/vacancy-rate-series'],
    },
  },
  supply_timeline: {
    title: 'show_supply_timeline',
    question: 'When does the new supply land?',
    purpose: 'WHEN new homes near the property complete, year by year across the hold — the build-to-rent wave vs when you re-lease.',
    schema: obj(
      {
        headline: COMMON.headline,
        badge,
        years: arr(obj({ year: { type: 'integer', minimum: 2000, maximum: 2100 }, hold_year: { type: 'integer', minimum: 1, maximum: 40 }, dwellings: { type: 'integer', minimum: 0 }, build_to_rent: { type: 'integer', minimum: 0 } }), 1, 16),
        already_built: { type: 'integer', minimum: 0 },
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'years', 'caption', 'sources'],
    ),
    example: {
      headline: '2031 · yr 6',
      badge: { text: 'build-to-rent wave', tone: 'warn' },
      years: [
        { year: 2028, hold_year: 3, dwellings: 40, build_to_rent: 0 },
        { year: 2029, hold_year: 4, dwellings: 80, build_to_rent: 0 },
        { year: 2030, hold_year: 5, dwellings: 166, build_to_rent: 126 },
        { year: 2031, hold_year: 6, dwellings: 252, build_to_rent: 252 },
        { year: 2032, hold_year: 7, dwellings: 126, build_to_rent: 126 },
      ],
      already_built: 376,
      caption: '504 build-to-rent homes most likely complete around 2031 — year 6 of your hold.',
      sources: ['development/da-list'],
    },
  },
  cash_flow: {
    title: 'show_weekly_cash_flow',
    question: 'What will it cost me?',
    purpose: 'Weekly money in and out at the likely price: rent in, interest/strata/rates out.',
    schema: obj(
      {
        headline: COMMON.headline,
        after_tax: str(40),
        lines: arr(obj({ label: str(32), weekly: { ...num(), description: 'dollars per week; positive = money in, negative = money out' }, note: str(40) }, ['label', 'weekly']), 2, 6),
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'lines', 'caption', 'sources'],
    ),
    example: {
      headline: '−$181',
      lines: [
        { label: 'Rent', weekly: 775 },
        { label: 'Loan interest', weekly: -799, note: '$692K @ 6.0%' },
        { label: 'Strata', weekly: -112, note: 'Zetland median' },
        { label: 'Rates + insurance', weekly: -45 },
      ],
      caption: 'At the likely $852K with your $160K deposit, before tax.',
      sources: ['market/strata-levies', 'listings/for-rent'],
    },
  },
  value: {
    title: 'show_estimated_value',
    question: "What's it worth?",
    purpose: 'Automated valuation (AVM) with its range and confidence, against asking and likely sale.',
    schema: obj(
      {
        headline: COMMON.headline,
        estimate: num(0),
        low: num(0),
        high: num(0),
        confidence: num(0, 100),
        asking: num(0),
        likely: num(0),
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'estimate', 'low', 'high', 'caption', 'sources'], // confidence: only Microburbs' AVM has one
    ),
    example: {
      headline: '$713K',
      estimate: 712500,
      low: 555750,
      high: 869250,
      confidence: 82,
      asking: 775000,
      likely: 852500,
      caption: 'A computer valuation from nearby sales — a second opinion, not a bank valuation. The range is wide here.',
      sources: ['valuation/avm'],
    },
  },
  area: {
    title: 'show_area_comparison',
    question: 'How does it compare?',
    purpose: 'This property/suburb vs a comparison area on 2–6 metrics, each marked better or worse for the investor.',
    schema: obj(
      {
        headline: COMMON.headline,
        compare_to: str(40),
        metrics: arr(obj({ label: str(28), here: num(), area: num(), higher_is_better: { type: 'boolean' }, unit: oneOf('%', '$', 'days', '') }), 2, 6),
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'compare_to', 'metrics', 'caption', 'sources'],
    ),
    example: {
      headline: '2 better, 1 worse',
      compare_to: 'City of Sydney median',
      metrics: [
        { label: 'Gross yield', here: 5.2, area: 4.4, higher_is_better: true, unit: '%' },
        { label: 'Growth, 5 yr', here: 8.4, area: 2, higher_is_better: true, unit: '%' },
        { label: 'Days to sell', here: 44, area: 32, higher_is_better: false, unit: 'days' },
      ],
      caption: 'Better on yield and growth; slower to sell than the city.',
      sources: ['market/yield-pct', 'market/days-on-market'],
    },
  },
  offer: {
    title: 'show_offer_ladder',
    question: 'What should I offer?',
    purpose: 'Recommended offer with an opening bid, aim and walk-away, against estimate, asking and likely sale.',
    schema: obj(
      {
        headline: COMMON.headline,
        open: num(0),
        aim: num(0),
        walk_away: num(0),
        estimate: num(0),
        asking: num(0),
        likely: num(0),
        comps: { ...arr(num(0), 1, 12), description: 'recent nearby same-bed sale prices' },
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'open', 'aim', 'walk_away', 'caption', 'sources'],
    ),
    example: {
      headline: '$735K',
      open: 700000,
      aim: 735000,
      walk_away: 785000,
      estimate: 712500,
      asking: 775000,
      likely: 852500,
      caption: 'Agency: Stone Real Estate, "severe underquoter" — 71% of 17 sales went over quote, by a median 10%.',
      sources: ['valuation/agent-quoting', 'comparables/recent-sales-nearby'],
    },
  },
  hold: {
    title: 'show_hold_outcome',
    question: 'Worth it over ten years?',
    purpose: 'Illustrative gain over the hold for 2–4 purchase-price scenarios (after rent and costs, before tax).',
    schema: obj(
      {
        headline: COMMON.headline,
        badge,
        years: { type: 'integer', minimum: 1, maximum: 30 },
        scenarios: arr(obj({ label: str(36), gain: num(), kind: oneOf('best', 'base', 'worst', 'other') }), 2, 4),
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'years', 'scenarios', 'caption', 'sources'],
    ),
    example: {
      headline: '$174K',
      badge: { text: 'illustrative', tone: 'neutral' },
      years: 10,
      scenarios: [
        { label: 'Negotiate to $735K', gain: 231000, kind: 'best' },
        { label: 'Pay the asking $775K', gain: 171000, kind: 'base' },
        { label: 'Pay the likely $852K', gain: 57000, kind: 'worst' },
      ],
      caption: 'Assumes 3% growth a year and 6% interest; before tax.',
      sources: ['market/price-growth-5y'],
    },
  },
  property: {
    title: 'show_property_profile',
    question: 'Tell me about the property',
    purpose: 'The matched property: id, key facts and sale history.',
    schema: obj(
      {
        headline: COMMON.headline,
        gnaf_id: str(20),
        facts: arr(obj({ label: str(20), value: str(24) }), 2, 6),
        history: arr(obj({ date: str(10), price: num(0), kind: oneOf('sold', 'listed', 'estimate', 'likely') }), 1, 8),
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'gnaf_id', 'facts', 'sources'],
    ),
    example: {
      headline: '38/3 Victoria Park Pde',
      gnaf_id: 'GANSW710358627',
      facts: [
        { label: 'Bed/bath/car', value: '1 / 1 / 0' },
        { label: 'Strata', value: '$1,455/q' },
      ],
      history: [
        { date: '2011-08-31', price: 440000, kind: 'sold' },
        { date: '2022-10-21', price: 660000, kind: 'sold' },
        { date: '2026-11-07', price: 852500, kind: 'likely' },
      ],
      caption: '+29% since the 2022 sale at the likely price.',
      sources: ['properties/basics', 'history/all'],
    },
  },
  overlays: {
    title: 'show_overlays_and_planning',
    question: 'Any hazards?',
    purpose: 'Hazards and planning overlays on or near the title, worst first, plus transport.',
    schema: obj(
      {
        headline: COMMON.headline,
        items: arr(obj({ name: str(36), detail: str(36), status: oneOf('on_property', 'nearby', 'clear') }), 1, 8),
        transport: arr(obj({ label: str(20), value: str(28) }), 1, 4),
        caption: COMMON.caption,
        sources: COMMON.sources,
      },
      ['headline', 'items', 'sources'],
    ),
    example: {
      headline: 'Clear. One thing to check.',
      items: [
        { name: 'High-voltage power line', detail: '23 m', status: 'nearby' },
        { name: 'Flood', detail: 'nearest 384 m', status: 'clear' },
        { name: 'Bushfire · landslide · erosion', detail: 'none', status: 'clear' },
      ],
      sources: ['properties/risks/all'],
    },
  },
};

// ---------------------------------------------------------------- self-documentation
function describe(schema, depth = 0) {
  if (schema.type === 'object') {
    const req = new Set(schema.required ?? []);
    const parts = Object.entries(schema.properties).map(([k, s]) => `${k}${req.has(k) ? '' : '?'}: ${describe(s, depth + 1)}`);
    return `{ ${parts.join(', ')} }`;
  }
  if (schema.type === 'array') return `[${describe(schema.items, depth + 1)}] (${schema.minItems ?? 0}–${schema.maxItems ?? '∞'} items)`;
  if (schema.enum) return schema.enum.map((e) => JSON.stringify(e)).join('|');
  const range = schema.minimum !== undefined || schema.maximum !== undefined ? ` ${schema.minimum ?? ''}–${schema.maximum ?? ''}` : '';
  const len = schema.maxLength ? ` ≤${schema.maxLength} chars` : '';
  return `${schema.type}${range}${len}${schema.description ? ` (${schema.description})` : ''}`;
}

/** The field guide for one template: what the model sees when it gets a body wrong. */
export function templateGuide(name) {
  const t = TEMPLATES[name];
  return `Template "${name}" (${t.question}) — ${t.purpose}\nbody (fields ending ? are optional): ${describe(t.schema)}\nValid example body: ${JSON.stringify(t.example)}`;
}

/** Every template's field guide (no examples) — goes in the tool description so the FIRST call is right. */
const allGuides = () =>
  Object.entries(TEMPLATES)
    .map(([k, t]) => `• ${k} — "${t.question}" ${t.purpose}\n  body: ${describe(t.schema)}`)
    .join('\n');

const templateList = () =>
  Object.entries(TEMPLATES)
    .map(([k, t]) => `${k} — "${t.question}" ${t.purpose}`)
    .join('\n');

// ---------------------------------------------------------------- learning
const LESSONS_KEY = 'ui_block_lessons';

/** Lesson memory: what went wrong before, per template, with counts. Storage is injectable for tests. */
export class LessonBook {
  constructor(storage = globalThis.chrome?.storage?.local ?? null) {
    this.storage = storage;
    this.cache = null;
  }
  async all() {
    if (this.cache) return this.cache;
    try {
      this.cache = (this.storage ? (await this.storage.get(LESSONS_KEY))[LESSONS_KEY] : null) ?? {};
    } catch {
      this.cache = {};
    }
    return this.cache;
  }
  async record(template, problems) {
    const book = await this.all();
    const t = (book[template] ??= {});
    // normalise array indexes ("lines/3", "rows[0]") so the same mistake on any item is one lesson
    for (const p of problems) {
      const key = p.replace(/\/(\d+)(?=[:/.]|$)/g, '[]').replace(/\[\d+\]/g, '[]');
      t[key] = (t[key] ?? 0) + 1;
    }
    try {
      await this.storage?.set({ [LESSONS_KEY]: book });
    } catch {
      /* best-effort */
    }
  }
  /** Most frequent past mistakes as prompt text (empty string when none). */
  async text(limit = 6) {
    const rows = Object.entries(await this.all())
      .flatMap(([template, problems]) => Object.entries(problems).map(([p, n]) => ({ template, p, n })))
      .sort((a, b) => b.n - a.n)
      .slice(0, limit);
    if (!rows.length) return '';
    return `Lessons from your earlier render_ui_block mistakes — avoid repeating them:\n${rows.map((r) => `- ${r.template}: ${r.p} (${r.n}×)`).join('\n')}`;
  }
}

/** Stored call args → { template, body } exactly as the tool accepted them (panel uses this). */
export function normaliseBlockArgs(args) {
  let body = args?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  return { template: resolveTemplate(args?.template), body };
}

/** "yield", "show_yield_comparison", "Yield" → "yield" (null when unknown). */
export function resolveTemplate(name) {
  const n = String(name ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (TEMPLATES[n]) return n;
  return Object.keys(TEMPLATES).find((k) => TEMPLATES[k].title === n || n === `show_${k}`) ?? null;
}

// ---------------------------------------------------------------- cards from data
// The agent only CHOOSES a card. Its body is built here, in code, from the listing
// brief (Microburbs) — so every number is real and the payload can't be malformed.

const K = (n) => (n == null ? null : n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(n / 1000)}K`);
const r5k = (n) => Math.round(n / 5000) * 5000;
const firstPart = (address) => String(address ?? '').split(',')[0].replace(/^UNIT\s+/i, '').trim();
const titleCase = (s) => String(s ?? '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

class Unavailable extends Error {}
const need = (cond, why) => {
  if (!cond) throw new Unavailable(why);
};

/** Weekly holding cost at a given price (same maths as the brief). */
function weeklyCostAt(price, brief, investor, rate = 0.06) {
  const deposit = investor?.deposit ?? 0;
  const strata = brief.weekly_cost?.strata ?? 0;
  const rates = brief.weekly_cost?.rates_insurance ?? 45;
  return (Math.max(0, price - deposit) * rate) / 52 + strata + rates - (brief.returns?.rent_weekly_used ?? brief.rent?.weekly ?? 0);
}

/** Offer ladder from the data (the agent may override open/aim/walk_away). */
export function offerLadder(brief, investor) {
  const asking = brief.price?.asking;
  const est = brief.price?.value?.estimate;
  const likely = brief.price?.likely_sale;
  need(asking || est, 'no asking price or estimate for this property');
  const anchor = est ?? asking * 0.95;
  const ask = asking ?? est;
  const aim = r5k((anchor + ask) / 2);
  return {
    open: r5k(Math.min(anchor, aim * 0.96)),
    aim,
    walk_away: r5k(Math.min(investor?.budget ?? Infinity, likely ?? ask * 1.05)),
  };
}

const BUILDERS = {
  yield(b, inv) {
    const r = b.returns ?? {};
    const mine = r.gross_yield_pct_at_asking ?? r.gross_yield_pct_at_likely;
    need(mine != null, 'no rent estimate or price, so no yield');
    const rows = [
      r.gross_yield_pct_at_asking != null && { label: 'This property', value_pct: r.gross_yield_pct_at_asking, kind: 'this' },
      r.gross_yield_pct_at_likely != null && { label: `At likely ${K(b.price?.likely_sale)}`, value_pct: r.gross_yield_pct_at_likely, kind: 'likely' },
      b.market?.suburb_unit_yield_pct != null && { label: `${titleCase(b.property?.suburb).replace(/\s*\(.*\)/, '')} units`, value_pct: b.market.suburb_unit_yield_pct, kind: 'area' },
      inv?.minYield != null && { label: 'Your minimum', value_pct: inv.minYield, kind: 'minimum' },
    ].filter(Boolean);
    const diff = inv?.minYield != null ? Math.round((mine - inv.minYield) * 10) / 10 : null;
    return {
      headline: `${mine}%`,
      ...(diff != null && { badge: { text: `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} pts vs your ${inv.minYield}%`, tone: diff >= 0 ? 'good' : 'warn' } }),
      rows,
      threshold_pct: inv?.minYield ?? 4,
      caption: b.returns?.rent_source === 'model' && b.rent_model?.covered
        ? `Rent from our rent model: $${b.rent_model.weekly}/wk ${b.rent_model.scenario === 'with' ? 'with a car space' : 'without a car space'} (${b.rent_model.period}, typically within ~$${b.rent_model.typical_error}).${b.rent.weekly ? ` Similar rentals within 1 km: median $${b.rent.weekly}/wk.` : ''}`
        : `Rent from ${b.rent.comparables} similar ${b.property?.beds ? `${b.property.beds}-bedroom ` : ''}${b.rent.comparables === 1 ? 'rental' : 'rentals'} within 1 km: median $${b.rent.weekly}/wk (most between $${b.rent.low} and $${b.rent.high}).`,
      sources: b.returns?.rent_source === 'model' ? ['Fine Print rent model', 'listings/for-rent', 'market/yield-pct'] : ['listings/for-rent', 'market/yield-pct'],
    };
  },
  supply(b) {
    const s = b.supply ?? {};
    need(s.largest?.length, 'no development applications with stated dwellings within 1 km');
    return {
      headline: String(s.new_dwellings_stated),
      badge: s.build_to_rent_dwellings > 0 ? { text: 'build-to-rent nearby', tone: 'warn' } : { text: `${s.applications} applications`, tone: 'neutral' },
      projects: s.largest.slice(0, 5).map((p) => ({ dwellings: p.dwellings, km: p.km, build_to_rent: p.build_to_rent, label: firstPart(p.address).slice(0, 48) })),
      caption: `${s.applications} ${s.applications === 1 ? 'application' : 'applications'} within ${s.radius_km ?? 1} km state ${s.new_dwellings_stated} new homes${s.build_to_rent_dwellings ? `, ${s.build_to_rent_dwellings} of them build-to-rent (they compete for tenants)` : ''}. DA stage is unknown.`,
      sources: ['development/da-list'],
    };
  },
  supply_timeline(b) {
    const t = b.supply?.timeline;
    need(t?.peak, 'no future supply with dates within 1 km');
    const years = t.years.filter((y) => y.dwellings > 0);
    const btrPeak = t.peak.build_to_rent > 0;
    const biggest = t.projects?.find((p) => p.status === 'future');
    return {
      headline: `${t.peak.year} · yr ${t.peak.hold_year}`,
      badge: btrPeak ? { text: 'build-to-rent wave', tone: 'warn' } : { text: `${t.future_total} homes coming`, tone: t.future_total >= 300 ? 'warn' : 'neutral' },
      years: years.length ? years : t.years.slice(0, 1),
      ...(t.likely_built ? { already_built: t.likely_built } : {}),
      caption: (biggest
        ? `${biggest.dwellings} ${biggest.build_to_rent ? 'build-to-rent ' : ''}homes at ${String(biggest.address).split(',')[0]} most likely complete around ${biggest.likely_year} — year ${biggest.likely_year - t.years[0].year + 1} of your hold.`
        : `${t.future_total} homes land over your hold.`) + (t.likely_built ? ` ${t.likely_built} more are likely already built.` : ''),
      sources: ['development/da-list'],
    };
  },
  cash_flow(b) {
    const w = b.weekly_cost ?? {};
    need(w.net_before_tax != null, 'no weekly cost (needs a price and a rent estimate)');
    const basis = b.returns?.price_basis;
    return {
      headline: `${w.net_before_tax > 0 ? '−' : '+'}$${Math.abs(Math.round(w.net_before_tax))}`,
      lines: [
        { label: 'Rent', weekly: Math.round(w.rent) },
        { label: 'Loan interest', weekly: -Math.round(w.interest) },
        w.strata && { label: 'Strata', weekly: -Math.round(w.strata), note: `${titleCase(b.property?.suburb).replace(/\s*\(.*\)/, '')} median` },
        { label: 'Rates + insurance', weekly: -Math.round(w.rates_insurance) },
      ].filter(Boolean),
      caption: `Per week before tax at ${b.returns?.price_basis_is === 'likely_sale' ? 'the likely' : 'a'} ${K(basis)}: ${w.assumptions}.`,
      sources: ['listings/for-rent', 'market/strata-levies'],
    };
  },
  value(b) {
    const v = b.price?.value;
    need(v?.estimate, 'Microburbs has no automated valuation for this property');
    return {
      headline: K(v.estimate),
      estimate: v.estimate,
      low: v.low,
      high: v.high,
      ...(Number.isFinite(v.confidence) && { confidence: v.confidence }),
      ...(b.price.asking && { asking: b.price.asking }),
      ...(b.price.likely_sale && { likely: b.price.likely_sale }),
      caption: Number.isFinite(v.confidence)
        ? 'A computer valuation from recent nearby sales — a second opinion on price, not a bank valuation.'
        : `From the ${v.basis ?? 'recent sales nearby'} — Microburbs has no automated valuation for this one. A second opinion, not a bank valuation.`,
      sources: ['valuation/avm'],
    };
  },
  area(b) {
    const m = b.market ?? {};
    const price = b.price?.likely_sale ?? b.price?.asking;
    const metrics = [
      b.returns?.gross_yield_pct_at_asking != null && m.suburb_unit_yield_pct != null && { label: 'Gross yield', here: b.returns.gross_yield_pct_at_asking, area: m.suburb_unit_yield_pct, higher_is_better: true, unit: '%' },
      price && m.suburb_median_unit_price && { label: 'Price', here: price, area: m.suburb_median_unit_price, higher_is_better: false, unit: '$' },
      b.rent?.weekly && b.rent?.suburb_median_unit && { label: 'Rent / wk', here: b.rent.weekly, area: b.rent.suburb_median_unit, higher_is_better: true, unit: '$' },
    ].filter(Boolean);
    need(metrics.length >= 2, 'not enough suburb market data to compare');
    const better = metrics.filter((x) => (x.higher_is_better ? x.here >= x.area : x.here <= x.area)).length;
    return {
      headline: `${better} better, ${metrics.length - better} worse`,
      compare_to: `${titleCase(b.property?.suburb).replace(/\s*\(.*\)/, '')} unit median`,
      metrics,
      caption: `This property against the suburb's unit medians${m.unit_days_on_market ? `; units take ${m.unit_days_on_market} days to sell here` : ''}.`,
      sources: ['market/all'],
    };
  },
  offer(b, inv, extra) {
    const ladder = { ...offerLadder(b, inv), ...(extra?.offer ?? {}) };
    const a = b.price?.agency;
    return {
      headline: K(ladder.aim),
      ...ladder,
      ...(b.price?.value?.estimate && { estimate: b.price.value.estimate }),
      ...(b.price?.asking && { asking: b.price.asking }),
      ...(b.price?.likely_sale && { likely: b.price.likely_sale }),
      caption: a ? `Agency: ${a.name} (${String(a.cohort).toLowerCase()}). ${agencySentence(a)}` : 'Aim between the estimate and the asking price; walk away at your budget or the likely sale.',
      sources: ['valuation/agent-quoting', 'valuation/avm'],
    };
  },
  hold(b, inv, extra) {
    need(b.rent?.weekly && (b.price?.asking || b.price?.likely_sale), 'needs a price and a rent estimate');
    const years = inv?.holdYears ?? 10;
    const growth = 0.03;
    const gain = (p) => Math.round(p * ((1 + growth) ** years - 1) - weeklyCostAt(p, b, inv) * 52 * years);
    const ladder = (() => {
      try {
        return { ...offerLadder(b, inv), ...(extra?.offer ?? {}) };
      } catch {
        return null;
      }
    })();
    const scenarios = [
      ladder && { label: `Negotiate to ${K(ladder.aim)}`, gain: gain(ladder.aim), kind: 'best' },
      b.price?.asking && { label: `Pay the asking ${K(b.price.asking)}`, gain: gain(b.price.asking), kind: 'base' },
      b.price?.likely_sale && { label: `Pay the likely ${K(b.price.likely_sale)}`, gain: gain(b.price.likely_sale), kind: 'worst' },
    ].filter(Boolean);
    need(scenarios.length >= 2, 'not enough price points for scenarios');
    const base = scenarios.find((x) => x.kind === 'base') ?? scenarios[0];
    return {
      headline: `${base.gain < 0 ? '−' : ''}${K(Math.abs(base.gain))}`,
      badge: { text: 'illustrative', tone: 'neutral' },
      years,
      scenarios,
      caption: `Gain over ${years} years after rent and holding costs, before tax. Assumes ${growth * 100}% growth a year and 6% interest.`,
      sources: ['valuation/avm', 'listings/for-rent'],
    };
  },
  property(b) {
    const p = b.property ?? {};
    const history = [
      b.price?.last_sold && { date: String(b.price.last_sold.date).slice(0, 10), price: b.price.last_sold.price, kind: 'sold' },
      b.price?.value?.estimate && { date: String(b.price.value.as_of ?? '').slice(0, 10) || 'now', price: b.price.value.estimate, kind: 'estimate' },
      b.price?.likely_sale && { date: 'now', price: b.price.likely_sale, kind: 'likely' },
    ].filter(Boolean);
    return {
      headline: titleCase(firstPart(p.address)).slice(0, 28),
      gnaf_id: String(p.gnaf_id).slice(0, 20),
      facts: [
        { label: 'Bed/bath/car', value: `${p.beds ?? '?'} / ${p.baths ?? '?'} / ${p.parking ?? '?'}` },
        { label: 'Type', value: titleCase(String(p.type ?? 'unit').split('/')[0].trim()).slice(0, 24) },
        { label: 'Suburb', value: titleCase(p.suburb).replace(/\s*\(.*\)/, '').slice(0, 24) },
      ],
      ...(history.length && { history }),
      sources: ['properties/basics', 'history/all'],
    };
  },
  overlays(b) {
    const risks = b.risks ?? [];
    const pretty = { hv_power_line: 'High-voltage power line', flood: 'Flood', heritage: 'Heritage', bushfire: 'Bushfire', public_housing: 'Public housing' };
    const items = risks.slice(0, 8).map((r) => ({ name: (pretty[r.name] ?? titleCase(r.name.replace(/_/g, ' '))).slice(0, 36), detail: String(r.detail ?? '').replace(/^Not on property;\s*/i, '').slice(0, 36), status: r.on_property ? 'on_property' : 'nearby' }));
    const ph = b.public_housing;
    if (ph && !risks.some((r) => r.name === 'public_housing')) {
      items.push(ph.within_200m
        ? { name: 'Public housing nearby', detail: `${ph.within_200m} homes within 200 m`.slice(0, 36), status: 'nearby' }
        : { name: 'Public housing', detail: `none within 200 m`, status: 'clear' });
    }
    if (!items.length) items.push({ name: 'No hazards flagged', detail: 'on or near the title', status: 'clear' });
    return {
      headline: risks.length ? `${risks.length} thing${risks.length > 1 ? 's' : ''} to check` : 'Clear.',
      items,
      sources: ['properties/risks/all'],
    };
  },
};

/** template + brief → a card body (throws Unavailable when the data isn't there). */
export function cardFromBrief(template, brief, investor = {}, extra = {}) {
  const body = dropNulls(BUILDERS[template](brief, investor, extra));
  if (extra.caption) body.caption = extra.caption;
  return body;
}

/** Missing data is left OUT of a card (optional fields), never sent as null — schemas type fields as numbers. */
function dropNulls(x) {
  if (Array.isArray(x)) return x.map(dropNulls);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([, v]) => v != null).map(([k, v]) => [k, dropNulls(v)]));
  return x;
}

// ---------------------------------------------------------------- the tool
/**
 * @param {Object} o
 * @param {() => Object|null} o.getBrief   the brief for the listing on screen (pre-loaded or fetched this turn)
 * @param {Object} [o.investor]            the investor brief (budget, deposit, minYield, holdYears)
 * @param {{ find(ref: string): Promise<Object|null> }} [o.memory]  saved properties, for cards about earlier listings
 */
export function uiBlockTool({ getBrief = () => null, investor = {}, memory = null, lessons = new LessonBook() } = {}) {
  return tool({
    name: 'render_ui_block',
    label: 'Drawing a card',
    concludes: true,
    description: `Show ONE visual card under your reply — the investor sees a chart instead of a list of figures. You only CHOOSE the card: it fills itself from Microburbs data for the listing on screen (or for a saved property if you pass "property"). Write your 1–2 sentence interpretation as normal text in the same message, then call this once.
Templates:
${templateList()}
Optional: "caption" (1–2 sentences under the card; default is a factual line), "property" (GNAF id or address of a SAVED property to show instead of the listing on screen), "offer" ({open, aim, walk_away} whole dollars — only to override the computed offer ladder).`,
    input_schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: `which card: ${Object.keys(TEMPLATES).join(' | ')}` },
        caption: { type: 'string', description: 'optional 1–2 sentences under the card (≤320 chars)' },
        property: { type: 'string', description: 'optional: GNAF id or address of a saved property (default: the listing on screen)' },
        offer: { type: 'object', description: 'optional override for the offer card: {open, aim, walk_away} in whole dollars' },
      },
      required: ['template'],
    },
    execute: async (args) => {
      const template = resolveTemplate(args.template);
      if (!template) {
        await lessons.record('unknown', [`template "${args.template}" does not exist`]);
        throw new ToolError(`render_ui_block: unknown template "${args.template}"`, {
          hint: `Use one of these template keys (exactly):\n${templateList()}`,
          retryable: true,
          error_code: 'unknown_template',
        });
      }
      // which property's data?
      let brief = getBrief();
      if (args.property) {
        const saved = await memory?.find(args.property);
        if (!saved?.brief) {
          throw new ToolError(`render_ui_block: no saved property matches "${args.property}"`, {
            hint: 'use recall_properties to find the GNAF id, or omit "property" for the listing on screen',
            retryable: true,
            error_code: 'not_found',
          });
        }
        brief = saved.brief;
      }
      if (!brief) {
        throw new ToolError('render_ui_block: no listing data yet', {
          hint: 'call get_listing_brief with the listing address first, then render the card',
          retryable: true,
          error_code: 'no_brief',
        });
      }
      let body;
      try {
        body = cardFromBrief(template, brief, investor, { caption: args.caption, offer: args.offer });
      } catch (e) {
        if (!(e instanceof Unavailable)) throw e;
        throw new ToolError(`render_ui_block: can't draw "${template}" — ${e.message}`, {
          hint: 'pick a different card, or say in text that this data is not available',
          retryable: false,
          error_code: 'data_unavailable',
        });
      }
      // safety net: code-built bodies should always validate; overrides/captions might not
      const problems = validate(TEMPLATES[template].schema, body).map((p) => p.replace(/^<root>/, 'body').replace(/^(?!body)/, 'body.'));
      if (problems.length) {
        await lessons.record(template, problems);
        throw new ToolError(`render_ui_block: the "${template}" card is invalid — ${problems.join('; ')}`, {
          hint: `Usually a too-long caption or a bad offer override. ${templateGuide(template)}`,
          retryable: true,
          error_code: 'invalid_block_body',
        });
      }
      return JSON.stringify({
        rendered: true,
        template,
        property: brief.property?.address ?? null,
        body, // the panel draws from this; you can quote it
        note: 'The card is now shown to the investor. If you have not already written your answer beside this call, reply with ONE or TWO short sentences interpreting it — no new analysis, no headings.',
      });
    },
  });
}
