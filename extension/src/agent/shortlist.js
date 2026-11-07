// Shortlist: the listings the investor starred (content script → chrome.storage.local
// `shortlist`, keyed by origin+pathname), joined to property memory (IndexedDB
// `properties`, which holds the Microburbs brief for every analysed listing).
// Pure join + ranking here; the dashboard page renders it.

/** Same key the content script uses: origin + pathname, no query/hash/trailing slash. */
export const listingKey = (url) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return String(url ?? '');
  }
};

/**
 * Shortlist entries + saved property records → dashboard rows.
 * @param {Record<string, {url, title, heading, added_at}>} shortlist
 * @param {Object[]} records  property-memory records (urls[], brief, key numbers)
 * @param {Object} investor   { budget, minYield }
 */
export function shortlistRows(shortlist, records, investor = {}) {
  const byKey = new Map();
  for (const r of records) for (const u of [r.url, ...(r.urls ?? [])].filter(Boolean)) byKey.set(listingKey(u), r);
  return Object.entries(shortlist ?? {}).map(([key, s]) => {
    const r = byKey.get(listingKey(key)) ?? byKey.get(listingKey(s.url)) ?? null;
    const price = r?.likely_sale ?? r?.asking ?? r?.estimated_value ?? null;
    const yieldPct = r?.yield_at_likely ?? r?.yield_at_asking ?? null;
    return {
      key,
      url: s.url ?? key,
      added_at: s.added_at ?? null,
      address: r?.address ?? s.heading ?? s.title ?? key,
      suburb: r?.suburb ?? null,
      beds: r?.beds ?? null,
      image: r?.image ?? null,
      gnaf_id: r?.gnaf_id ?? null,
      asking: r?.asking ?? null,
      likely_sale: r?.likely_sale ?? null,
      price,
      rent_weekly: r?.rent_weekly ?? null,
      yield_pct: yieldPct,
      weekly_cost: r?.weekly_cost ?? null,
      new_homes_1km: r?.new_dwellings_1km ?? null,
      build_to_rent_1km: r?.build_to_rent_1km ?? null,
      risks: r?.risks ?? [],
      within_budget: price != null && investor.budget != null ? price <= investor.budget : null,
      meets_yield: yieldPct != null && investor.minYield != null ? yieldPct >= investor.minYield : null,
      analysed: Boolean(r),
      analysed_at: r?.last_analysed_at ?? null,
      // extra columns for the spreadsheet view
      baths: r?.baths ?? null,
      parking: r?.parking ?? null,
      estimated_value: r?.estimated_value ?? null,
      vacancy_pct: r?.brief?.market?.unit_vacancy_pct ?? null,
      supply_peak_year: r?.brief?.supply?.timeline?.peak?.year ?? null,
      supply_peak_hold_year: r?.brief?.supply?.timeline?.peak?.hold_year ?? null,
      agency: r?.brief?.price?.agency?.name ?? null,
      agency_cohort: r?.brief?.price?.agency?.cohort ?? null,
      last_sold_price: r?.brief?.price?.last_sold?.price ?? null,
      last_sold_date: r?.brief?.price?.last_sold?.date ?? null,
    };
  });
}

const SORTS = {
  fit: (a, b) => fitScore(b) - fitScore(a) || (a.weekly_cost ?? Infinity) - (b.weekly_cost ?? Infinity),
  yield: (a, b) => (b.yield_pct ?? -1) - (a.yield_pct ?? -1),
  weekly_cost: (a, b) => (a.weekly_cost ?? Infinity) - (b.weekly_cost ?? Infinity),
  price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  supply: (a, b) => (a.new_homes_1km ?? Infinity) - (b.new_homes_1km ?? Infinity),
  added: (a, b) => (b.added_at ?? 0) - (a.added_at ?? 0),
};

/** Brief fit: within budget + meets yield, minus a point per flagged risk. */
export function fitScore(r) {
  return (r.within_budget ? 2 : 0) + (r.meets_yield ? 2 : 0) - (r.risks?.length ?? 0) * 0.5 - (r.build_to_rent_1km > 0 ? 0.5 : 0);
}

export function sortRows(rows, by = 'fit') {
  return [...rows].sort(SORTS[by] ?? SORTS.fit);
}

/** Best value per comparable column (for highlighting): lowest cost/price/supply, highest yield. */
export function bestOf(rows) {
  const pick = (f, dir) => {
    const vals = rows.map(f).filter((v) => v != null);
    return vals.length > 1 ? (dir === 'max' ? Math.max(...vals) : Math.min(...vals)) : null;
  };
  return {
    price: pick((r) => r.price, 'min'),
    yield_pct: pick((r) => r.yield_pct, 'max'),
    weekly_cost: pick((r) => r.weekly_cost, 'min'),
    new_homes_1km: pick((r) => r.new_homes_1km, 'min'),
  };
}
