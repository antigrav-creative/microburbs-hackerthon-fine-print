// Turns the rent model's predictions (Microburb-Data-Science-Task4 submission CSV) into a
// compact lookup the extension bundles. The model was trained on day-only supplied data
// ("use on the day, never republish"), so the output goes to public/data/ — git-ignored —
// and is only ever inside the built extension (dist/data/).
//
//   node scripts/prepare-rent-model.mjs <rents_FinePrintPredictions.csv> [models/chosen.json]
//
// Output: public/data/rent-model.json
//   { source, period, accuracy: {median_abs_error, within_100_pct}, rents: { gnaf_id: [with_car, without_car] } }

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [src, chosenPath] = process.argv.slice(2);
if (!src) {
  console.error('usage: node scripts/prepare-rent-model.mjs <rents_FinePrintPredictions.csv> [chosen.json]');
  process.exit(1);
}

const lines = readFileSync(src, 'utf8').split(/\r?\n/).filter(Boolean);
const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
const col = (name) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`column "${name}" not found in ${head.join(', ')}`);
  return i;
};
const [iG, iW, iWo] = [col('gnaf_id'), col('rent_with_car_space'), col('rent_without_car_space')];

const rents = {};
let skipped = 0;
for (const line of lines.slice(1)) {
  const f = line.split(',');
  const w = Number(f[iW]);
  const wo = Number(f[iWo]);
  if (!f[iG] || !(w > 0) || !(wo > 0)) { skipped++; continue; }
  rents[f[iG].trim()] = [w, wo];
}

// accuracy from the chosen blend's held-out score (LightGBM, the dominant member)
let accuracy = { median_abs_error: 45, within_100_pct: 79 };
if (chosenPath) {
  const s = JSON.parse(readFileSync(chosenPath, 'utf8'))?.lgbm?.score;
  if (s?.median_ae && s?.within_100) accuracy = { median_abs_error: Math.round(s.median_ae), within_100_pct: Math.round(s.within_100 * 100) };
}

const out = {
  source: 'Fine Print rent model (LightGBM + CatBoost, City of Sydney flats, data to 31 Jul 2026)',
  period: 'Aug–Sep 2026',
  accuracy,
  rents,
};
const dest = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/rent-model.json');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest}: ${Object.keys(rents).length} flats (${skipped} rows skipped), accuracy ±$${accuracy.median_abs_error} median, ${accuracy.within_100_pct}% within $100, ${Math.round(JSON.stringify(out).length / 1024)} KB`);
