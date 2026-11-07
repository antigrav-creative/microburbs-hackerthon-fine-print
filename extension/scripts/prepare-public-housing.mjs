// Turns the hackathon's public-housing CSV into a compact lookup the extension bundles.
// The CSV is day-only supplied data ("use on the day, never republish"), so the output
// goes to public/data/ — git-ignored — and is only ever inside the built extension (dist/data/).
//
//   node scripts/prepare-public-housing.mjs <path/to/public-housing-homes-city-of-sydney.csv>
//
// Output: public/data/public-housing.json (loaded at runtime from the extension package)
//   { source, homes, gnaf: [ids…], points: [[lat, lon, homes at that point]…] }
// Units in one building share GNAF coordinates, so a point ≈ a building.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/prepare-public-housing.mjs <public-housing-homes-city-of-sydney.csv>');
  process.exit(1);
}

/** One CSV line → fields (handles "quoted, fields"). */
function fields(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const lines = readFileSync(src, 'utf8').split(/\r?\n/).filter(Boolean);
const head = fields(lines[0]).map((h) => h.trim().toLowerCase());
const col = (name) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`column "${name}" not found in ${head.join(', ')}`);
  return i;
};
const [iG, iLat, iLon] = [col('gnaf_pid'), col('lat'), col('lon')];

const gnaf = new Set();
const points = new Map();
for (const line of lines.slice(1)) {
  const f = fields(line);
  const lat = Number(f[iLat]);
  const lon = Number(f[iLon]);
  if (f[iG]) gnaf.add(f[iG].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  points.set(key, (points.get(key) ?? 0) + 1);
}

const out = {
  source: 'City of Sydney public housing homes (supplied for the Microburbs AI Hackathon, 7 Nov 2026)',
  homes: lines.length - 1,
  gnaf: [...gnaf],
  points: [...points].map(([k, n]) => [...k.split(',').map(Number), n]),
};
const dest = resolve(dirname(new URL(import.meta.url).pathname), '../public/data/public-housing.json');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest}: ${out.homes} homes, ${out.gnaf.length} GNAF ids, ${out.points.length} locations, ${Math.round(JSON.stringify(out).length / 1024)} KB`);
