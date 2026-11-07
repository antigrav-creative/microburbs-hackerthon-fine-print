// Public housing around a property, from the City of Sydney list supplied for the
// hackathon (day-only data: prepared by scripts/prepare-public-housing.mjs into the
// git-ignored public/data/, so it ships only inside the built extension).
// Pure lookup here; the data is passed in (loadPublicHousing reads it in the browser).

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function metres(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const BUILDING_M = 10; // units in one building share GNAF coordinates
const ids = new WeakMap();

/**
 * @param {{lat:number,lng:number}|null} here   the property's location
 * @param {string|null} gnafId                    the property's GNAF id
 * @param {{source, homes, gnaf: string[], points: [lat, lon, n][]}|null} data
 * @returns {null | { this_home, in_building, within_200m, within_500m, nearest_m, source }}
 */
export function publicHousingAround(here, gnafId, data) {
  if (!data?.points || !here || !Number.isFinite(here.lat) || !Number.isFinite(here.lng)) return null;
  if (!ids.has(data)) ids.set(data, new Set(data.gnaf ?? []));
  let inBuilding = 0;
  let w200 = 0;
  let w500 = 0;
  let nearest = Infinity;
  for (const [lat, lng, n] of data.points) {
    const m = metres(here, { lat, lng });
    if (m <= BUILDING_M) inBuilding += n;
    if (m <= 200) w200 += n;
    if (m <= 500) w500 += n;
    if (m < nearest) nearest = m;
  }
  return {
    this_home: Boolean(gnafId && ids.get(data).has(gnafId)),
    in_building: inBuilding,
    within_200m: w200,
    within_500m: w500,
    nearest_m: Number.isFinite(nearest) ? Math.round(nearest) : null,
    source: data.source ?? 'City of Sydney public housing list',
  };
}

let cached;
/** Browser: the bundled list, or null when this build doesn't include it. */
export function loadPublicHousing() {
  cached ??= fetch(chrome.runtime.getURL('data/public-housing.json'))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return cached;
}
