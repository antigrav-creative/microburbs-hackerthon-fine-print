import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelRent } from '../src/agent/rent-model.js';
import { parseWeeklyRent } from '../src/agent/rent-text.js';
import { computeBrief } from '../src/agent/listing-brief.js';
import { shortlistRows } from '../src/agent/shortlist.js';
import { TEST_INVESTOR, TEST_RAW } from './fixtures/test-data.js';

// synthetic lookup (the real one is built from day-only data and never committed)
const ID = TEST_RAW.match.id;
const MODEL = { period: 'Aug–Sep 2026', accuracy: { median_abs_error: 44, within_100_pct: 79 }, rents: { [ID]: [820, 790], OTHER: [1000, 950] } };

test('picks the scenario that matches the car spaces; unknown → without (conservative)', () => {
  assert.equal(modelRent(ID, 1, MODEL).weekly, 820);
  assert.equal(modelRent(ID, 1, MODEL).scenario, 'with');
  assert.equal(modelRent(ID, 0, MODEL).weekly, 790);
  const unknown = modelRent(ID, null, MODEL);
  assert.equal(unknown.scenario, null);
  assert.equal(unknown.weekly, 790);
  assert.equal(unknown.premium, 30);
  assert.equal(unknown.typical_error, 44);
});

test('outside coverage → covered:false; no bundled model → null', () => {
  assert.deepEqual(modelRent('GANSW_NOT_A_FLAT', 1, MODEL), { covered: false });
  assert.deepEqual(modelRent(null, 1, MODEL), { covered: false });
  assert.equal(modelRent(ID, 1, null), null);
});

test('model rent drives yield and weekly cost when it covers the flat', () => {
  const b = computeBrief(TEST_RAW, { investor: TEST_INVESTOR, rentModel: MODEL });
  assert.equal(b.returns.rent_source, 'model');
  assert.equal(b.returns.rent_weekly_used, 790); // fixture has parking 0
  assert.equal(b.weekly_cost.rent, 790);
  assert.equal(b.returns.gross_yield_pct_at_asking, Math.round(((790 * 52) / 775000) * 100 * 100) / 100);
  assert.equal(b.rent.weekly, 775); // the comparables figure is still there, side by side
  assert.equal(b.rent_model.with_car, 820);
  assert.equal(b.rent_listing, undefined);
});

test('falls back to the comparables median outside coverage or without a model', () => {
  const out = computeBrief({ ...TEST_RAW, match: { ...TEST_RAW.match, id: 'GANSW_ELSEWHERE' } }, { investor: TEST_INVESTOR, rentModel: MODEL });
  assert.equal(out.rent_model.covered, false);
  assert.equal(out.returns.rent_source, 'comparables');
  assert.equal(out.returns.rent_weekly_used, out.rent.weekly);
  const none = computeBrief(TEST_RAW, { investor: TEST_INVESTOR });
  assert.equal(none.rent_model, null);
  assert.equal(none.returns.rent_source, 'comparables');
});

test('a rental listing compares its asking rent with the model', () => {
  const b = computeBrief({ ...TEST_RAW, page_rent: { weekly: 869, text: '$869 per week' } }, { investor: TEST_INVESTOR, rentModel: MODEL });
  assert.deepEqual(b.rent_listing, { asking_weekly: 869, listing_price_text: '$869 per week', model_weekly: 790, vs_model_pct: 10, comparables_weekly: 775 });
});

test('reads weekly rents, never a sale price', () => {
  for (const [t, n] of [['$750 per week', 750], ['$1,200 pw', 1200], ['$650/wk', 650], ['$700 weekly', 700], ['$825.00 p.w.', 825], ['Deposit taken $900/w', 900]]) {
    assert.equal(parseWeeklyRent(t)?.weekly, n, t);
  }
  for (const t of ['$850,000', '$1.2M', 'Contact Agent', '$750', null]) assert.equal(parseWeeklyRent(t), null, String(t));
});

test('shortlist carries the model rent', () => {
  const url = 'https://www.realestate.com.au/property-apartment-nsw-zetland-1';
  const rows = shortlistRows({ [url]: { url } }, [{ gnaf_id: ID, address: 'X', url, urls: [url], model_rent_weekly: 790 }], {});
  assert.equal(rows[0].model_rent_weekly, 790);
  const old = shortlistRows({ [url]: { url } }, [{ gnaf_id: ID, address: 'X', url, urls: [url], brief: { rent_model: { covered: true, weekly: 820 } } }], {});
  assert.equal(old[0].model_rent_weekly, 820);
});

test('a rental with no weekly price shown still reads as a rental, with no comparison', () => {
  const b = computeBrief({ ...TEST_RAW, page_rent: { weekly: null, text: 'Deposit Taken' } }, { investor: TEST_INVESTOR, rentModel: MODEL });
  assert.deepEqual(b.rent_listing, { asking_weekly: null, listing_price_text: 'Deposit Taken', model_weekly: 790, vs_model_pct: null, comparables_weekly: 775 });
});
