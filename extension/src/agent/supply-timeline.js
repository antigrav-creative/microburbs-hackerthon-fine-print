// Temporal supply risk: not just HOW MUCH new housing is coming near the property,
// but WHEN it lands relative to the investor's hold — "504 build-to-rent homes complete
// around 2031, year 5 of your hold, when you'll be re-leasing".
//
// Model (stated as assumptions, never as fact — DA stage isn't in the API yet):
//   completion ≈ lodged + ~9 months to approval + build time by size
//   build: ≤20 homes 18 mo · ≤100 30 mo · ≤300 36 mo · >300 42 mo
//   each project's homes are spread over its likely year ±1 (25 / 50 / 25)
//   a project whose likely completion is already past counts as "likely built"
//   (it's in today's market already), not future supply.

const APPROVAL_MONTHS = 9;
export const BUILD_MONTHS = [
  [20, 18],
  [100, 30],
  [300, 36],
  [Infinity, 42],
];

const addMonths = (date, m) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + m);
  return d;
};

/** One development application → its estimated completion. */
export function estimateCompletion(da, now = new Date()) {
  const lodged = new Date(da.date);
  if (Number.isNaN(lodged.getTime())) return null;
  const build = BUILD_MONTHS.find(([max]) => da.dwellings <= max)[1];
  const likely = addMonths(lodged, APPROVAL_MONTHS + build);
  return {
    likely_date: likely.toISOString().slice(0, 10),
    likely_year: likely.getFullYear(),
    window: [likely.getFullYear() - 1, likely.getFullYear() + 1],
    status: likely < now ? 'likely_built' : 'future',
    months_from_now: Math.round((likely - now) / (30.44 * 864e5)),
  };
}

/**
 * Pipeline (DAs with dwellings, date, build_to_rent) → supply landing per year of the hold.
 * @returns {{ years: {year, hold_year, dwellings, build_to_rent}[], peak, likely_built, future_total, assumptions }}
 */
export function supplyTimeline(pipeline, { holdYears = 10, now = new Date() } = {}) {
  const startYear = now.getFullYear();
  const lastYear = startYear + Math.max(1, holdYears) - 1; // hold years 1..N (year 1 = this year)
  const byYear = new Map();
  let likelyBuilt = 0;
  let likelyBuiltBtr = 0;
  const projects = [];
  for (const da of pipeline ?? []) {
    if (!da?.dwellings || !da.date) continue;
    const c = estimateCompletion(da, now);
    if (!c) continue;
    projects.push({ address: da.address, dwellings: da.dwellings, build_to_rent: Boolean(da.build_to_rent), km: da.km, lodged: da.date, ...c });
    if (c.status === 'likely_built') {
      likelyBuilt += da.dwellings;
      if (da.build_to_rent) likelyBuiltBtr += da.dwellings;
      continue;
    }
    for (const [dy, share] of [[-1, 0.25], [0, 0.5], [1, 0.25]]) {
      const y = Math.max(startYear, c.likely_year + dy); // a window can't land in the past
      const slot = byYear.get(y) ?? { dwellings: 0, build_to_rent: 0 };
      slot.dwellings += da.dwellings * share;
      if (da.build_to_rent) slot.build_to_rent += da.dwellings * share;
      byYear.set(y, slot);
    }
  }
  const years = [];
  for (let y = startYear; y <= lastYear; y++) {
    const s = byYear.get(y) ?? { dwellings: 0, build_to_rent: 0 };
    years.push({ year: y, hold_year: y - startYear + 1, dwellings: Math.round(s.dwellings), build_to_rent: Math.round(s.build_to_rent) });
  }
  const futureTotal = projects.filter((p) => p.status === 'future').reduce((t, p) => t + p.dwellings, 0);
  const beyondHold = [...byYear.entries()].filter(([y]) => y > lastYear).reduce((t, [, s]) => t + s.dwellings, 0);
  const peakYear = years.reduce((best, y) => (y.dwellings > (best?.dwellings ?? 0) ? y : best), null);
  return {
    years,
    peak: peakYear?.dwellings ? { year: peakYear.year, hold_year: peakYear.hold_year, dwellings: peakYear.dwellings, build_to_rent: peakYear.build_to_rent } : null,
    first_3_years: years.filter((y) => y.hold_year <= 3).reduce((t, y) => t + y.dwellings, 0),
    future_total: futureTotal,
    beyond_hold: Math.round(beyondHold),
    likely_built: likelyBuilt,
    likely_built_build_to_rent: likelyBuiltBtr,
    projects: projects.sort((a, b) => b.dwellings - a.dwellings).slice(0, 12),
    assumptions: 'completion ≈ lodged + ~9 mo approval + 18–42 mo build by size, spread over ±1 year; DA stage is not in the data yet',
  };
}
