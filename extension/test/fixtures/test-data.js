// Unit-test fixture (not shipped in the extension):
// real Microburbs response shapes and values for Unit 38, 3 Victoria Park Pde,
// Zetland (7 Nov), with a small synthetic set of nearby rentals + DAs.
// The brief is re-labelled with the address on screen and clearly marked as test data.

import { tool } from '../../src/runtime/index.js';
import { formatAddress, parseAddress } from '../../src/agent/address.js';
import { computeBrief } from '../../src/agent/listing-brief.js';

// Shapes + values from the live demo proxy for Unit 38, 3 Victoria Park Pde, Zetland (7 Nov).
export const TEST_HERE = { lat: -33.90521711, lng: 151.21082342 };
const near = (dLat) => ({ latitude: TEST_HERE.lat + dLat, longitude: TEST_HERE.lng }); // 0.001° lat ≈ 111 m
const rental = (id, price, beds, dLat) => ({
  gnaf_pid: id, area_name: id, attributes: { bedrooms: beds }, coordinates: near(dLat), price, property_type: 'Unit', property_type_raw: 'apartment',
});

export const TEST_RAW = {
  match: { id: 'GANSW710358627', sal: 'Zetland', display_name: 'UNIT 38/3 Victoria Park Parade, Zetland', property_type: 'unit' },
  avm: { predicted_price: 712500, predicted_price_low: 555750, predicted_price_high: 869250, prediction_date: '2026-07-27', confidence_score: 82 },
  quoting: { agency_name: 'Stone Real Estate - Newtown', cohort: 'Severe Underquoter', median_deviation_pct: 10, underquote_rate_pct: 70.6, total_sales: 17, asking_price: 775000, likely_sale_price: 852500 },
  history: {
    sale_history: [{ date: '2026-10-28', price: 775000, type: 'For Sale' }, { date: '2022-10-21', price: 660000, type: 'Sold' }],
    sale_history_latest: { date: '2026-10-28', price: 775000, type: 'For Sale' },
    rent_history_latest: { date: '2026-02-02', price: 780, type: 'For Rent' },
  },
  risks: {
    flood: [{ value: 'Not on property; nearest 384 m away', on_property: false, nearest_distance_m: 384 }],
    hv_power_line: [{ value: 'Not on property; nearest 23 m away', on_property: false, nearest_distance_m: 23 }],
    heritage: [{ value: 'Not on property; nearest 132 m away', on_property: false, nearest_distance_m: 132 }],
  },
  basics: { bed_count: 1, bath_count: 1, parking_count: 0, dwelling_type: 'apartment / unit / flat' },
  sales: [],
  nearby: { center_lat: TEST_HERE.lat, center_lng: TEST_HERE.lng, listings: [{ bedrooms: 1, price: 730000 }, { bedrooms: 1, price: 790000 }, { bedrooms: 2, price: 1200000 }] },
  market: { median_rent: { unit: 1000 }, median_sale_price: { unit: 998000 }, yield_pct: { unit: 0.0521 }, price_growth_5y: { unit: 0.0837 }, days_on_market: { unit: 44 } },
  strata: { median_levy_annual: 5820.4 },
  vacancy: { unit: [{ date: '2026-09-27', value: 0.011 }, { date: '2026-10-25', value: 0.0152 }] },
  rentals: [
    [rental('a', 700, 1, 0.001), rental('b', 750, 1, 0.003), rental('c', 800, 1, 0.005), rental('d', 850, 1, 0.008), rental('far', 400, 1, 0.02), rental('2bed', 1200, 2, 0.001)],
    [rental('a', 700, 1, 0.001)], // same listing seen again from a neighbouring suburb
  ],
  das: [[
    { area_name: '960A Bourke Street, Zetland NSW', description: 'Site establishment, construction of 504 build-to-rent residential apartments', date: '2026-10-17', lat: -33.9050768, lng: 151.2039236 },
    { area_name: '903-921 Bourke Street, Waterloo NSW', description: 'Construction of 376 residential apartments over basement parking', date: '2022-03-15', lat: TEST_HERE.lat + 0.004, lng: TEST_HERE.lng },
    { area_name: '338 Botany Road, Beaconsfield NSW', description: 'Mixed use building with 111 apartments and ground floor retail', date: '2025-06-10', lat: TEST_HERE.lat - 0.006, lng: TEST_HERE.lng },
    { area_name: '12 Defries Avenue, Zetland NSW', description: 'Construction of 48 apartments', date: '2026-02-20', lat: TEST_HERE.lat + 0.002, lng: TEST_HERE.lng },
    { area_name: '1 Far St', description: 'Construction of 300 apartments', date: '2026-01-01', lat: TEST_HERE.lat + 0.03, lng: TEST_HERE.lng },
    { area_name: '2 Near St', description: 'Alterations to a terrace', date: '2026-02-01', lat: TEST_HERE.lat + 0.001, lng: TEST_HERE.lng },
  ]],
};
export const TEST_INVESTOR = { budget: 800000, deposit: 160000, minYield: 4 };

/** A brief for the address on screen, computed from the bundled fixture. */
export function testBrief(parts, investor = TEST_INVESTOR) {
  const address = parts ? formatAddress({ ...parts, state: null, postcode: null }) : TEST_RAW.match.display_name;
  const match = {
    ...TEST_RAW.match,
    id: `TEST-${address.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
    display_name: address,
    sal: parts?.suburb ?? TEST_RAW.match.sal,
  };
  const brief = computeBrief({ ...TEST_RAW, match }, { investor });
  brief.meta = { source: 'TEST DATA (bundled fixture, not live Microburbs)', test_data: true, suburbs_searched: [match.sal], fetched_ms: 0, fetched_at: new Date().toISOString() };
  return brief;
}

/** get_listing_brief backed by the bundled fixture (same name + schema as the live tool). */
export function testListingBriefTool({ investor = TEST_INVESTOR, memory = null, listing = null } = {}) {
  return tool({
    name: 'get_listing_brief',
    label: 'Pulling the brief (test data)',
    description: 'TEST DATA MODE: returns a brief computed from bundled fixture figures (not live Microburbs) for the given address. Same shape as the live tool. Mention that figures are test data.',
    input_schema: {
      type: 'object',
      properties: { address: { type: 'string', description: 'Full address including unit number' } },
      required: ['address'],
    },
    execute: async ({ address }) => {
      const brief = testBrief(parseAddress(address), investor);
      await memory?.save(brief, listing ? { url: listing.url, image: listing.page?.image, title: listing.page?.heading } : {}).catch(() => {});
      return JSON.stringify(brief);
    },
  });
}
