import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicHousingAround } from '../src/agent/public-housing.js';
import { computeBrief } from '../src/agent/listing-brief.js';
import { cardFromBrief } from '../src/agent/ui-blocks.js';
import { TEST_HERE, TEST_INVESTOR, TEST_RAW } from './fixtures/test-data.js';

// synthetic list (the real one is day-only data and never committed)
const here = { lat: TEST_HERE.lat, lng: TEST_HERE.lng };
const north = (m) => TEST_HERE.lat + m / 111_320; // metres north → latitude
const DATA = {
  source: 'test list',
  homes: 31,
  gnaf: ['GANSW_PH_1'],
  points: [
    [TEST_HERE.lat, TEST_HERE.lng, 12], // same building
    [north(150), TEST_HERE.lng, 7], // 150 m
    [north(400), TEST_HERE.lng, 12], // 400 m
  ],
};

test('counts public housing in the building, within 200 m and 500 m', () => {
  const ph = publicHousingAround(here, 'GANSW_OTHER', DATA);
  assert.deepEqual({ ...ph, source: undefined }, { this_home: false, in_building: 12, within_200m: 19, within_500m: 31, nearest_m: 0, source: undefined });
  assert.equal(publicHousingAround(here, 'GANSW_PH_1', DATA).this_home, true);
});

test('no list or no location → null, never a guess', () => {
  assert.equal(publicHousingAround(here, 'x', null), null);
  assert.equal(publicHousingAround(null, 'x', DATA), null);
});

test('brief flags public housing in the building as a risk; hazards card shows it', () => {
  const brief = computeBrief(TEST_RAW, { investor: TEST_INVESTOR, publicHousing: DATA });
  assert.equal(brief.public_housing.in_building, 12);
  assert.deepEqual(brief.risks.find((r) => r.name === 'public_housing'), { name: 'public_housing', detail: '12 public housing homes in this building', on_property: false });
  const card = cardFromBrief('overlays', brief, TEST_INVESTOR);
  assert.ok(card.items.some((i) => i.name === 'Public housing' && /12 public housing homes/.test(i.detail)), JSON.stringify(card.items));
});

test('nearby (not in the building) shows on the hazards card without becoming a risk', () => {
  const far = { ...DATA, gnaf: [], points: [[north(150), TEST_HERE.lng, 7]] };
  const brief = computeBrief(TEST_RAW, { investor: TEST_INVESTOR, publicHousing: far });
  assert.equal(brief.risks.some((r) => r.name === 'public_housing'), false);
  const card = cardFromBrief('overlays', brief, TEST_INVESTOR);
  assert.ok(card.items.some((i) => i.name === 'Public housing nearby' && i.detail === '7 homes within 200 m'), JSON.stringify(card.items));
});

test('without the list the brief is unchanged (public_housing null)', () => {
  assert.equal(computeBrief(TEST_RAW, { investor: TEST_INVESTOR }).public_housing, null);
});
