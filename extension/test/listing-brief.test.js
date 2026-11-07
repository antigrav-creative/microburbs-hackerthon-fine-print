import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBrief, dwellingsFromDescription, haversineKm, quantile, suburbsNear } from '../src/agent/listing-brief.js';

import { TEST_INVESTOR as INVESTOR, TEST_RAW as RAW } from './fixtures/test-data.js';

test('rent comps: same beds, within 1 km, deduped; median + quartiles', () => {
  const b = computeBrief(RAW, { investor: INVESTOR });
  assert.equal(b.rent.comparables, 4); // far (2.2 km), 2-bed and the duplicate are excluded
  assert.equal(b.rent.weekly, 775);
  assert.equal(b.rent.low, 740);
  assert.equal(b.rent.high, 815);
  assert.deepEqual(b.rent.this_property_last, { weekly: 780, date: '2026-02-02' });
});

test('price points, yield and weekly cost', () => {
  const b = computeBrief(RAW, { investor: INVESTOR });
  assert.equal(b.price.asking, 775000);
  assert.equal(b.price.likely_sale, 852500);
  assert.equal(b.returns.price_basis_is, 'likely_sale');
  assert.equal(b.returns.gross_yield_pct_at_asking, 5.2); // 775 × 52 / 775k
  assert.equal(b.returns.gross_yield_pct_at_likely, 4.73);
  assert.equal(b.returns.within_budget, false);
  // whole dollars: (852.5k − 160k) × 6% / 52 = 799; strata 5820.4/52 = 112; 799.04 + 111.93 + 45 − 775 = 181
  assert.equal(b.weekly_cost.interest, 799);
  assert.equal(b.weekly_cost.strata, 112);
  assert.equal(b.weekly_cost.net_before_tax, 181);
});

test('asking falls back to an active For Sale history row', () => {
  const raw = { ...RAW, quoting: null };
  assert.equal(computeBrief(raw, { investor: INVESTOR }).price.asking, 775000);
  const sold = { ...raw, history: { ...RAW.history, sale_history_latest: { price: 660000, type: 'Sold' } } };
  assert.equal(computeBrief(sold, { investor: INVESTOR }).price.asking, null);
});

test('supply: only stated dwellings within 1 km; build-to-rent flagged', () => {
  const b = computeBrief(RAW, { investor: INVESTOR });
  assert.equal(b.supply.applications, 4); // 504 BTR + 376 + 111 + 48; the 3.3 km one and the no-dwellings one are out
  assert.equal(b.supply.new_dwellings_stated, 1039);
  assert.equal(b.supply.build_to_rent_dwellings, 504);
  assert.ok(b.supply.largest[0].km > 0.6 && b.supply.largest[0].km < 0.7); // ~640 m
});

test('competition, market, risks', () => {
  const b = computeBrief(RAW, { investor: INVESTOR });
  assert.equal(b.competition.for_sale_same_beds_1km, 2);
  assert.equal(b.market.suburb_unit_yield_pct, 5.21);
  assert.equal(b.market.unit_vacancy_pct, 1.52);
  assert.deepEqual(b.risks.map((r) => r.name), ['hv_power_line']); // 23 m; flood 384 m and heritage are not flagged
});

test('dwelling counts from DA descriptions', () => {
  assert.equal(dwellingsFromDescription('Construction of 504 build-to-rent residential apartments'), 504);
  assert.equal(dwellingsFromDescription('A 12 storey building with 111 apartments and 3 retail tenancies'), 111);
  assert.equal(dwellingsFromDescription('Mixed use: 376 residential units and 2 commercial units'), 376);
  assert.equal(dwellingsFromDescription('Alterations and additions to a terrace'), null);
});

test('helpers', () => {
  assert.equal(quantile([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(quantile([], 0.5), null);
  assert.ok(Math.abs(haversineKm({ lat: -33.9, lng: 151.2 }, { lat: -33.909, lng: 151.2 }) - 1.0) < 0.01);
  const subs = suburbsNear('Zetland');
  assert.equal(subs[0], 'Zetland');
  assert.ok(subs.includes('Waterloo (NSW)') && subs.includes('Beaconsfield (NSW)') && subs.includes('Rosebery (NSW)'));
});

test('bundled test data: brief for the address on screen, clearly marked', async () => {
  const { testBrief } = await import('./fixtures/test-data.js');
  const b = testBrief({ unit: '1711', number: '301', street: 'Botany Road', suburb: 'Zetland', state: 'NSW', postcode: '2017' });
  assert.equal(b.property.address, '1711/301 Botany Road, Zetland');
  assert.equal(b.property.gnaf_id, 'TEST-1711-301-BOTANY-ROAD-ZETLAND');
  assert.equal(b.meta.test_data, true);
  assert.equal(b.rent.weekly, 775); // the fixture's figures
  assert.equal(b.supply.new_dwellings_stated, 1039);
});
