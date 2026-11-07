import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCompletion, supplyTimeline } from '../src/agent/supply-timeline.js';

const NOW = new Date('2026-11-07T00:00:00Z');
const PIPE = [
  { address: '960A Bourke St', dwellings: 504, build_to_rent: true, date: '2026-10-17', km: 0.64 },
  { address: '903-921 Bourke St', dwellings: 376, build_to_rent: false, date: '2022-03-15', km: 0.44 },
  { address: '338 Botany Rd', dwellings: 111, build_to_rent: false, date: '2025-06-10', km: 0.67 },
  { address: '12 Defries Ave', dwellings: 48, build_to_rent: false, date: '2026-02-20', km: 0.22 },
];

test('completion = lodged + ~9 mo approval + build time by size', () => {
  assert.equal(estimateCompletion(PIPE[0], NOW).likely_year, 2031); // 504 → 42 mo build → Jan 2031
  assert.equal(estimateCompletion(PIPE[1], NOW).status, 'likely_built'); // 2022 lodgement → done by mid 2026
  assert.equal(estimateCompletion(PIPE[2], NOW).likely_year, 2029); // 111 → 36 mo
  assert.equal(estimateCompletion(PIPE[3], NOW).likely_year, 2029); // 48 → 30 mo
  assert.equal(estimateCompletion({ dwellings: 10, date: 'not a date' }, NOW), null);
});

test('supply lands per year of the hold; peak is the build-to-rent wave', () => {
  const t = supplyTimeline(PIPE, { holdYears: 10, now: NOW });
  assert.equal(t.years[0].year, 2026);
  assert.equal(t.years[0].hold_year, 1);
  assert.equal(t.years.length, 10); // hold years 1..10
  assert.deepEqual(t.peak, { year: 2031, hold_year: 6, dwellings: 252, build_to_rent: 252 });
  assert.equal(t.likely_built, 376); // already in today's market, not future supply
  assert.equal(t.future_total, 504 + 111 + 48);
  const total = t.years.reduce((s, y) => s + y.dwellings, 0) + t.beyond_hold;
  assert.ok(Math.abs(total - t.future_total) <= 2, `all future homes accounted for (${total})`); // rounding only
});

test('a short hold pushes the wave beyond it', () => {
  const t = supplyTimeline(PIPE, { holdYears: 3, now: NOW });
  assert.equal(t.years.at(-1).year, 2028); // a 3-year hold covers 2026–2028
  assert.ok(t.beyond_hold >= 504 * 0.75); // the BTR wave mostly lands after a 3-year hold
});

test('empty pipeline → no peak', () => {
  const t = supplyTimeline([], { holdYears: 10, now: NOW });
  assert.equal(t.peak, null);
  assert.equal(t.future_total, 0);
});
