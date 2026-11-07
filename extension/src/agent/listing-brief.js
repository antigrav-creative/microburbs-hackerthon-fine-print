// get_listing_brief — everything the first read needs, in ONE tool call.
//
//   hop 1: geocode the address → GNAF id + suburb
//   hop 2: every property + suburb endpoint IN PARALLEL (incl. rentals and DAs for
//          the suburbs within ~2 km, so the 1 km radius isn't cut at a boundary)
//   then:  the investor maths in code, not by the model (rent comps, yield, weekly
//          cost, supply pipeline) → one compact JSON brief.
//
// Microburbs is the source of truth for every number here. Cached per GNAF.

import { publicHousingAround } from './public-housing.js';
import { modelRent } from './rent-model.js';
import { tool, ToolError } from '../runtime/index.js';
import { AllowlistHttpClient } from '../runtime/tools/http.js';
import { SOURCES } from './microburbs-tools.js';
import { findProperty, formatAddress, parseAddress, unresolvedHint } from './address.js';
import { supplyTimeline } from './supply-timeline.js';

// ---------------------------------------------------------------- geography
// Exact SAL names (verified against geocode/suburb, 7 Nov) + approx centroids.
// Newtown, Paddington, Annandale, St Peters return no data — out of coverage.
export const SUBURBS = {
  Alexandria: ['Alexandria', -33.9045, 151.1945],
  Barangaroo: ['Barangaroo', -33.8615, 151.2015],
  Beaconsfield: ['Beaconsfield (NSW)', -33.912, 151.201],
  Camperdown: ['Camperdown (NSW)', -33.889, 151.177],
  'Centennial Park': ['Centennial Park (NSW)', -33.897, 151.233],
  Chippendale: ['Chippendale', -33.887, 151.199],
  Darlinghurst: ['Darlinghurst', -33.878, 151.219],
  Darlington: ['Darlington (Sydney - NSW)', -33.891, 151.195],
  'Dawes Point': ['Dawes Point', -33.856, 151.207],
  'Elizabeth Bay': ['Elizabeth Bay', -33.872, 151.227],
  Erskineville: ['Erskineville', -33.902, 151.186],
  Eveleigh: ['Eveleigh', -33.896, 151.192],
  'Forest Lodge': ['Forest Lodge', -33.881, 151.18],
  Glebe: ['Glebe (NSW)', -33.879, 151.186],
  Haymarket: ['Haymarket', -33.88, 151.204],
  'Millers Point': ['Millers Point', -33.859, 151.204],
  'Moore Park': ['Moore Park', -33.896, 151.221],
  'Potts Point': ['Potts Point', -33.87, 151.225],
  Pyrmont: ['Pyrmont', -33.87, 151.194],
  Redfern: ['Redfern', -33.893, 151.205],
  Rosebery: ['Rosebery (NSW)', -33.918, 151.204],
  'Rushcutters Bay': ['Rushcutters Bay', -33.875, 151.229],
  'Surry Hills': ['Surry Hills', -33.885, 151.212],
  Sydney: ['Sydney', -33.868, 151.209],
  'The Rocks': ['The Rocks (Sydney - NSW)', -33.86, 151.208],
  Ultimo: ['Ultimo', -33.879, 151.197],
  Waterloo: ['Waterloo (NSW)', -33.9, 151.207],
  Woolloomooloo: ['Woolloomooloo', -33.87, 151.22],
  Zetland: ['Zetland', -33.907, 151.209],
};

const bySal = new Map(Object.values(SUBURBS).map(([sal, lat, lng]) => [sal, { sal, lat, lng }]));
const plain = (sal) => String(sal ?? '').replace(/\s*\(.*\)$/, '');

// Microburbs' hackathon data covers the City of Sydney suburbs above, nothing else.
const COVERED = new Set(Object.keys(SUBURBS).map((s) => s.toLowerCase()));
/** Is this suburb inside our data area? Unknown (blank) → true, so we never block on a parse gap. */
export function inCoverage(suburb) {
  const s = plain(suburb).trim().toLowerCase();
  return s ? COVERED.has(s) : true;
}
export const COVERED_SUBURBS = Object.keys(SUBURBS);

export function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Home suburb first, then suburbs whose centroid is within `km` of it (max `limit`). */
export function suburbsNear(sal, { km = 2.2, limit = 5 } = {}) {
  const home = bySal.get(sal) ?? bySal.get(SUBURBS[plain(sal)]?.[0]);
  if (!home) return [sal];
  const others = [...bySal.values()]
    .filter((s) => s.sal !== home.sal)
    .map((s) => ({ s, d: haversineKm(home, s) }))
    .filter((x) => x.d <= km)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit - 1)
    .map((x) => x.s.sal);
  return [home.sal, ...others];
}

// ---------------------------------------------------------------- stats
export function quantile(values, q) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}
const round = (n, to = 1) => (n == null || !Number.isFinite(n) ? null : Number((Math.round(n / to) * to).toFixed(6)));

// ---------------------------------------------------------------- supply
const DWELLING_RE =
  /(\d{1,4})\s+(?:x\s+)?(?:new\s+)?(?:build[- ]to[- ]rent\s+|btr\s+|affordable\s+|social\s+|residential\s+|student\s+|co-living\s+|boarding\s+)*(?:apartments?|dwellings?|residential\s+units?|units|homes|residences|boarding\s+rooms?|rooms?)\b/gi;

/** Largest dwelling count stated in a DA description (null if none). */
export function dwellingsFromDescription(desc) {
  let best = null;
  for (const m of String(desc ?? '').matchAll(DWELLING_RE)) {
    const n = Number(m[1]);
    if (n > 0 && n < 5000 && (best === null || n > best)) best = n;
  }
  return best;
}
const isBuildToRent = (desc) => /build[- ]to[- ]rent|\bbtr\b/i.test(String(desc ?? ''));

// ---------------------------------------------------------------- compute
/**
 * Pure: raw Microburbs responses → the brief. Exported for tests.
 * @param {Object} raw  { match, avm, quoting, history, risks, basics, sales, nearby, market, strata, vacancy, rentals[], das[] }
 *                      (+ page_price: the sale price the page shows, page_rent: the weekly rent a rental listing shows)
 * @param {Object} o    { investor: {budget, deposit, minYield}, rate, ratesInsuranceWeekly, radiusKm, publicHousing, rentModel }
 */
export function computeBrief(raw, { investor = {}, rate = 0.06, ratesInsuranceWeekly = 45, radiusKm = 1, publicHousing = null, rentModel = null } = {}) {
  const here = raw.nearby?.center_lat != null ? { lat: raw.nearby.center_lat, lng: raw.nearby.center_lng } : null;
  const beds = raw.basics?.bed_count ?? null;
  const within = (lat, lng) => (here && lat != null && lng != null ? haversineKm(here, { lat, lng }) : null);

  // --- rent: same-bed units within the radius, deduped across suburbs
  const seen = new Set();
  const comps = [];
  for (const r of (raw.rentals ?? []).flat()) {
    const id = r.gnaf_pid ?? r.area_name;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!/unit|apartment|studio/i.test(`${r.property_type} ${r.property_type_raw}`)) continue;
    if (beds != null && r.attributes?.bedrooms !== beds) continue;
    const d = within(r.coordinates?.latitude, r.coordinates?.longitude);
    if (d === null || d > radiusKm || !(r.price > 0)) continue;
    comps.push({ price: r.price, km: d });
  }
  const rentPrices = comps.map((c) => c.price);
  const lastRent = raw.history?.rent_history_latest ?? null;
  const rent = {
    weekly: round(quantile(rentPrices, 0.5), 5),
    low: round(quantile(rentPrices, 0.25), 5),
    high: round(quantile(rentPrices, 0.75), 5),
    comparables: comps.length,
    basis: `${beds ?? '?'}-bed units advertised for rent within ${radiusKm} km`,
    this_property_last: lastRent ? { weekly: lastRent.price, date: lastRent.date } : null,
    suburb_median_unit: raw.market?.median_rent?.unit ?? null,
  };

  // --- the rent model (bundled predictions for City of Sydney flats): when it covers this
  // flat its rent drives yield + weekly cost; otherwise the comparables median does
  const model = modelRent(raw.match?.id ?? null, raw.basics?.parking_count ?? null, rentModel);
  const rentUsed = model?.covered ? model.weekly : rent.weekly;
  const rentSource = model?.covered ? 'model' : rent.weekly != null ? 'comparables' : null;
  const pageRent = raw.page_rent ?? null; // a rental listing's asking rent
  const rentListing = pageRent
    ? {
        asking_weekly: pageRent.weekly ?? null,
        listing_price_text: pageRent.text ?? null,
        model_weekly: model?.covered ? model.weekly : null,
        vs_model_pct: model?.covered && pageRent.weekly ? round(((pageRent.weekly - model.weekly) / model.weekly) * 100, 0.1) : null,
        comparables_weekly: rent.weekly,
      }
    : null;

  // --- price points (each with where it came from; Microburbs first, then fallbacks)
  // recent same-bed sales nearby (12 months) — also the value fallback below
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const sales = (raw.sales ?? []).filter((s) => (beds == null || s.bedrooms === beds) && s.date_sold >= yearAgo && s.price > 0);
  const latest = raw.history?.sale_history_latest;
  const pagePrice = raw.page_price ?? null; // the price the listing shows (portal page)
  const [asking, askingSource] =
    raw.quoting?.asking_price != null ? [raw.quoting.asking_price, 'agency quote']
    : latest?.type === 'For Sale' && latest.price ? [latest.price, 'for-sale record']
    : pagePrice?.mid ? [pagePrice.mid, pagePrice.source ?? 'listing page']
    : [null, null];
  const likely = raw.quoting?.likely_sale_price ?? null;
  const value = raw.avm?.predicted_price != null
    ? { estimate: raw.avm.predicted_price, low: raw.avm.predicted_price_low, high: raw.avm.predicted_price_high, confidence: raw.avm.confidence_score, as_of: raw.avm.prediction_date, basis: 'Microburbs valuation' }
    : sales.length >= 3
      ? { estimate: round(quantile(sales.map((s) => s.price), 0.5), 1000), low: round(quantile(sales.map((s) => s.price), 0.25), 1000), high: round(quantile(sales.map((s) => s.price), 0.75), 1000), confidence: null, as_of: null, basis: `median of ${sales.length} recent same-bed sales nearby` }
      : null;
  const basisPrice = likely ?? asking ?? value?.estimate ?? null;

  const yieldAt = (p) => (p && rentUsed ? round(((rentUsed * 52) / p) * 100, 0.01) : null);
  const strataWeekly = raw.strata?.median_levy_annual ? round(raw.strata.median_levy_annual / 52, 1) : null;
  const deposit = investor.deposit ?? null;
  const loan = basisPrice && deposit != null ? Math.max(0, basisPrice - deposit) : null;
  const interestWeekly = loan != null ? round((loan * rate) / 52, 1) : null;
  const weeklyCost =
    interestWeekly != null && rentUsed != null ? round(interestWeekly + (strataWeekly ?? 0) + ratesInsuranceWeekly - rentUsed, 1) : null;

  // --- supply pipeline within the radius
  const daSeen = new Set();
  const pipeline = [];
  for (const d of (raw.das ?? []).flat()) {
    const key = `${d.area_name}|${d.date}`;
    if (daSeen.has(key)) continue;
    daSeen.add(key);
    const km = within(d.lat, d.lng);
    if (km === null || km > radiusKm) continue;
    const dwellings = dwellingsFromDescription(d.description);
    if (!dwellings) continue;
    pipeline.push({ address: d.area_name, km: round(km, 0.01), date: d.date, dwellings, build_to_rent: isBuildToRent(d.description), lat: d.lat, lng: d.lng });
  }
  pipeline.sort((a, b) => b.dwellings - a.dwellings);

  // --- competition for buyers: same-bed for sale within 1 km
  const forSale = (raw.nearby?.listings ?? []).filter((l) => beds == null || l.bedrooms === beds);


  // --- risks: on-property or very close only
  const risks = [];
  const ph = publicHousingAround(here, raw.match?.id ?? null, publicHousing);
  if (ph?.this_home) risks.push({ name: 'public_housing', detail: 'This home is on the public housing list', on_property: true });
  else if (ph?.in_building) risks.push({ name: 'public_housing', detail: `${ph.in_building} public housing ${ph.in_building === 1 ? 'home' : 'homes'} in this building`, on_property: false });
  for (const [name, rows] of Object.entries(raw.risks ?? {})) {
    for (const r of rows ?? []) {
      if (r.on_property) risks.push({ name, detail: r.value, on_property: true });
      else if (name === 'hv_power_line' && r.nearest_distance_m != null && r.nearest_distance_m <= 50) risks.push({ name, detail: r.value, on_property: false });
      else if (name === 'flood' && r.nearest_distance_m != null && r.nearest_distance_m <= 100) risks.push({ name, detail: r.value, on_property: false });
    }
  }
  const vac = raw.vacancy?.unit;
  const vacancyNow = Array.isArray(vac) && vac.length ? vac[vac.length - 1] : null;

  return {
    property: {
      gnaf_id: raw.match.id,
      address: raw.match.display_name,
      suburb: raw.match.sal,
      type: raw.basics?.dwelling_type ?? raw.match.property_type,
      beds,
      baths: raw.basics?.bath_count ?? null,
      parking: raw.basics?.parking_count ?? null,
    },
    price: {
      asking,
      asking_source: askingSource,
      ...(pagePrice ? { listing_price_text: pagePrice.text } : {}),
      likely_sale: likely,
      agency: raw.quoting ? { name: raw.quoting.agency_name, cohort: raw.quoting.cohort, underquote_rate_pct: raw.quoting.underquote_rate_pct, median_over_quote_pct: raw.quoting.median_deviation_pct, sales: raw.quoting.total_sales } : null,
      value,
      last_sold: (raw.history?.sale_history ?? []).find((s) => s.type === 'Sold') ?? null,
    },
    rent,
    rent_model: model,
    ...(rentListing ? { rent_listing: rentListing } : {}),
    returns: {
      rent_weekly_used: rentUsed,
      rent_source: rentSource,
      price_basis: basisPrice,
      price_basis_is: likely ? 'likely_sale' : asking ? 'asking' : value ? 'estimated_value' : null,
      gross_yield_pct_at_asking: yieldAt(asking),
      gross_yield_pct_at_likely: yieldAt(likely),
      meets_min_yield: investor.minYield != null && yieldAt(basisPrice) != null ? yieldAt(basisPrice) >= investor.minYield : null,
      within_budget: investor.budget != null && basisPrice ? basisPrice <= investor.budget : null,
    },
    weekly_cost: {
      net_before_tax: weeklyCost,
      interest: interestWeekly,
      strata: strataWeekly,
      rates_insurance: ratesInsuranceWeekly,
      rent: rentUsed,
      rent_source: rentSource,
      assumptions: `interest-only at ${(rate * 100).toFixed(1)}% on price minus $${deposit?.toLocaleString('en-AU') ?? '?'} deposit; strata = suburb median levy`,
    },
    supply: {
      radius_km: radiusKm,
      new_dwellings_stated: pipeline.reduce((s, p) => s + p.dwellings, 0),
      applications: pipeline.length,
      build_to_rent_dwellings: pipeline.filter((p) => p.build_to_rent).reduce((s, p) => s + p.dwellings, 0),
      largest: pipeline.slice(0, 5),
      // WHEN it lands vs the hold — the temporal supply risk (see supply-timeline.js)
      timeline: supplyTimeline(pipeline, { holdYears: investor.holdYears ?? 10 }),
      competing_rentals_same_beds: comps.length,
      caveat: 'DA stage unknown; older applications may be built or lapsed',
    },
    competition: {
      for_sale_same_beds_1km: forSale.length,
      median_asking_same_beds: round(quantile(forSale.map((l) => l.price), 0.5), 1000),
    },
    recent_sales: {
      same_beds_12m: sales.length,
      median_price: round(quantile(sales.map((s) => s.price), 0.5), 1000),
      closest: sales.slice(0, 3).map((s) => ({ address: s.address, price: s.price, date: s.date_sold, km: s.dist_km })),
    },
    market: raw.market
      ? {
          suburb_median_unit_price: raw.market.median_sale_price?.unit ?? null,
          suburb_unit_yield_pct: raw.market.yield_pct?.unit != null ? round(raw.market.yield_pct.unit * 100, 0.01) : null,
          unit_growth_5y_pct: raw.market.price_growth_5y?.unit != null ? round(raw.market.price_growth_5y.unit * 100, 0.1) : null,
          unit_days_on_market: raw.market.days_on_market?.unit ?? null,
          unit_vacancy_pct: vacancyNow ? round(vacancyNow.value * 100, 0.01) : null,
        }
      : null,
    risks,
    public_housing: ph,
  };
}

// ---------------------------------------------------------------- fetch + tool
const CACHE_TTL_MS = 6 * 3600 * 1000;

// Two cache tiers, both best-effort: in-memory (this page / node) and chrome.storage.
const memCache = new Map();
async function cacheGet(key, ttl = CACHE_TTL_MS) {
  const m = memCache.get(key);
  if (m && Date.now() - m.at < ttl) return m.value;
  try {
    const hit = (await chrome.storage.local.get(key))[key];
    return hit && Date.now() - hit.at < ttl ? (hit.brief ?? hit.value) : null;
  } catch {
    return null;
  }
}
async function cacheSet(key, value) {
  memCache.set(key, { at: Date.now(), value });
  try {
    await chrome.storage.local.set({ [key]: { at: Date.now(), value } });
  } catch {
    /* cache is best-effort */
  }
}

// ---------------------------------------------------------------- rate limits
// The team key is rate-limited (HTTP 429 after ~60–70 calls in a short window; seen
// 7 Nov). A brief makes ~21 calls, so: at most 6 in flight, 429/5xx retried with
// backoff (honouring Retry-After), and suburb-level data cached so the next listing
// in the same area costs ~11 calls, not 21.
const MAX_IN_FLIGHT = 6;
let inFlight = 0;
const queue = [];
async function limited(fn) {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise((r) => queue.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    queue.shift()?.();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const backoffMs = (attempt, retryAfter) => {
  const ra = Number(retryAfter);
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 8000);
  return Math.min(500 * 2 ** attempt, 4000) + Math.floor(Math.random() * 250);
};

// Suburb-level endpoints change slowly — cache their (projected) data per suburb.
const SUBURB_TTL_MS = 6 * 3600 * 1000;
const projectRentals = (d) => (d?.results ?? []).map((r) => ({ gnaf_pid: r.gnaf_pid, area_name: r.area_name, price: r.price, property_type: r.property_type, property_type_raw: r.property_type_raw, attributes: { bedrooms: r.attributes?.bedrooms }, coordinates: r.coordinates, listing_date: r.listing_date }));
const projectDas = (d) => (d ?? []).map((x) => ({ area_name: x.area_name, description: x.description, date: x.date, category: x.category, lat: x.lat, lng: x.lng }));

/**
 * Fetch + compute a brief for an address. Throws a ToolError-shaped err on no match.
 * @param {Object} o  { address | parts, source, secretProvider, investor, fetch?, onProgress? }
 */
export async function fetchListingBrief({ address = null, parts = null, pagePrice = null, pageRent = null, source = 'api', secretProvider, investor, fetch: fetchImpl, onProgress = () => {}, publicHousing = null, rentModel = null }) {
  const s = SOURCES[source];
  const http = new AllowlistHttpClient([s.host], { timeoutS: 20, fetch: fetchImpl, credentials: s.auth ? 'omit' : 'include' });
  const headers = s.auth ? { Authorization: `Bearer ${await secretProvider.get('microburbs')}` } : {};
  const get = (path, params) =>
    limited(async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await http.get(`${s.base}${path}`, { params, headers });
        if (res.status === 404) return null;
        if ((res.status === 429 || res.status >= 500) && attempt < 3) {
          await sleep(backoffMs(attempt, res.headers?.['retry-after']));
          continue;
        }
        if (res.status === 429) throw new Error(`${path} → rate limited (HTTP 429)`);
        if (res.status >= 400) throw new Error(`${path} → HTTP ${res.status}`);
        return JSON.parse(res.text)?.data ?? null;
      }
    });
  const failed = [];
  // one endpoint failing must not sink the brief — but it's recorded, never silent
  const soft = (p, label) =>
    p.catch((e) => {
      failed.push(label ?? String(e?.message ?? e));
      return null;
    });
  const bySuburb = async (sub, path, params, project) => {
    const key = `sub:${sub}:${path}`;
    const hit = await cacheGet(key, SUBURB_TTL_MS);
    if (hit) return hit;
    const raw = await soft(get(`/suburbs/${encodeURIComponent(sub)}/${path}`, params), `${sub} ${path}`);
    if (raw == null) return project(null);
    const value = project(raw);
    await cacheSet(key, value);
    return value;
  };

  const t0 = Date.now();
  // Strict match: unit + number + street + suburb. The pipeline retries looser
  // queries only while nothing passed — never falls back to "closest".
  const want = parts ?? parseAddress(address);
  const { match: outcome, candidates } = await findProperty(want, (q) => get('/geocode/address', { address: q }));
  if (outcome.kind !== 'exact') {
    const shown = outcome.candidates.length ? outcome.candidates : candidates;
    throw new ToolError(`no exact match for "${address ?? formatAddress(want)}"`, {
      hint: `${unresolvedHint(outcome.reason)}. Candidates: ${shown.slice(0, 3).map((c) => c.display_name).join('; ') || 'none'}`,
      error_code: 'no_match',
    });
  }
  const match = outcome.candidate;
  onProgress({ stage: 'matched', address: match.display_name, gnaf_id: match.id });

  // the brief's maths depends on the investor (deposit, budget, min yield) — key the cache on it
  // the maths depends on the investor and on the listing's own price — key the cache on both
  const cacheKey = `brief:v4:${publicHousing ? 'ph' : ''}:${rentModel ? 'rm' : ''}:${match.id}:${investor?.budget ?? ''}:${investor?.deposit ?? ''}:${investor?.minYield ?? ''}:${pagePrice?.mid ?? ''}:${pageRent?.weekly ?? ''}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, meta: { ...cached.meta, cached: true } };

  const g = match.id;
  const subs = suburbsNear(match.sal);
  const [avm, quoting, history, risks, basics, sales, nearby, market, strata, vacancy, rentals, das] = await Promise.all([
    soft(get(`/properties/${g}/valuation/avm`), 'valuation'),
    soft(get(`/properties/${g}/valuation/agent-quoting`), 'agency quoting'),
    soft(get(`/properties/${g}/history/all`), 'history'),
    soft(get(`/properties/${g}/risks/all`), 'hazards'),
    soft(get(`/properties/${g}/basics/all`), 'basics'),
    soft(get(`/properties/${g}/comparables/recent-sales-nearby`), 'recent sales'),
    soft(get(`/properties/${g}/context/nearby-for-sale`), 'location'),
    bySuburb(match.sal, 'market/all', null, (d) => d),
    bySuburb(match.sal, 'market/strata-levies', null, (d) => d),
    bySuburb(match.sal, 'market/vacancy-rate-series', null, (d) => d),
    Promise.all(subs.map((sub) => bySuburb(sub, 'listings/for-rent', { limit: '200' }, projectRentals))),
    Promise.all(subs.map((sub) => bySuburb(sub, 'development/da-list', null, projectDas))),
  ]);

  const brief = computeBrief({ match, avm, quoting, history, risks, basics, sales, nearby, market, strata, vacancy, rentals, das, page_price: pagePrice, page_rent: pageRent }, { investor, publicHousing, rentModel });
  brief.meta = { suburbs_searched: subs, fetched_ms: Date.now() - t0, fetched_at: new Date().toISOString(), source: 'Microburbs API', ...(failed.length ? { partial: failed } : {}) };
  // a partial brief (e.g. rate-limited) is shown but never cached — the next open retries
  if (!failed.length) await cacheSet(cacheKey, brief);
  return brief;
}

/** The tool the agent calls. */
export function listingBriefTool({ source, secretProvider, investor, onProgress, memory = null, listing = null, publicHousing = null, rentModel = null }) {
  return tool({
    name: 'get_listing_brief',
    label: 'Pulling the Microburbs brief for this property',
    description:
      'ONE call that returns everything for the first read of a listing: matched GNAF address, asking/likely sale/estimated value, agency quoting record, rent estimate from nearby same-bed rentals, the Fine Print rent model prediction for City of Sydney flats (rent_model: with/without a car space, the parking premium; when it covers the flat it drives yield and weekly cost — returns.rent_source says which), gross yield, weekly cost before tax, new dwellings in development applications within 1 km, competing listings, recent nearby sales, suburb market and hazards. All figures are computed from Microburbs data except rent_model (our own model, labelled as such). Use this first; use the individual tools only to dig deeper.',
    input_schema: {
      type: 'object',
      properties: { address: { type: 'string', description: 'Full address including unit number, e.g. "Unit 38, 3 Victoria Park Parade, Zetland NSW 2017"' } },
      required: ['address'],
    },
    execute: async ({ address }) => {
      const brief = await fetchListingBrief({ address, source, secretProvider, investor, onProgress, publicHousing, rentModel });
      // Remember every analysed property (with where we saw it) for later recall.
      const seenOn = listing ? { url: listing.url ?? null, image: listing.page?.image ?? null, title: listing.page?.heading ?? listing.title ?? null } : {};
      await memory?.save(brief, seenOn).catch((e) => console.warn('[fine-print] could not save property', e));
      return JSON.stringify(brief);
    },
  });
}
