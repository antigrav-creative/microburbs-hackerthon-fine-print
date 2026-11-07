// The Fine Print rent model (C:\Microburb-Data-Science-Task4: LightGBM + CatBoost blend,
// trained on City of Sydney leases ≤ 31 Jul 2026) — precomputed for every flat in its
// input list and bundled as a lookup keyed by GNAF id. It was trained on day-only
// supplied data, so the lookup is prepared by scripts/prepare-rent-model.mjs into the
// git-ignored public/data/ and ships only inside the built extension.
// Pure lookup here; the data is passed in (loadRentModel reads it in the browser).

// held-out accuracy of the chosen blend (models/chosen.json, rolling 2-month folds)
export const MODEL_ACCURACY = { median_abs_error: 45, within_100_pct: 79 };
export const MODEL_PERIOD = 'Aug–Sep 2026';
export const MODEL_SOURCE = 'Fine Print model';

/**
 * @param {string|null} gnafId
 * @param {number|null} parking  the listing's car spaces (null = unknown)
 * @param {{period?, accuracy?, rents: Record<string, [number, number]>}|null} data
 * @returns {null | { covered: false } | { covered: true, with_car, without_car, premium, scenario: 'with'|'without'|null, weekly, source, period, typical_error, within_100_pct }}
 *   null when this build has no model; `weekly` is the scenario that matches the
 *   listing's parking — without-car when parking is unknown (the conservative one).
 */
export function modelRent(gnafId, parking, data) {
  if (!data?.rents) return null;
  const hit = gnafId ? data.rents[gnafId] : null;
  if (!Array.isArray(hit) || !(hit[0] > 0) || !(hit[1] > 0)) return { covered: false };
  const [withCar, withoutCar] = hit;
  const scenario = parking == null ? null : parking > 0 ? 'with' : 'without';
  return {
    covered: true,
    with_car: withCar,
    without_car: withoutCar,
    premium: Math.round((withCar - withoutCar) * 2) / 2,
    scenario,
    weekly: scenario === 'with' ? withCar : withoutCar,
    source: MODEL_SOURCE,
    period: data.period ?? MODEL_PERIOD,
    typical_error: data.accuracy?.median_abs_error ?? MODEL_ACCURACY.median_abs_error,
    within_100_pct: data.accuracy?.within_100_pct ?? MODEL_ACCURACY.within_100_pct,
  };
}

let cached;
/** Browser: the bundled lookup, or null when this build doesn't include it. */
export function loadRentModel() {
  cached ??= fetch(chrome.runtime.getURL('data/rent-model.json'))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return cached;
}
