// Microburbs endpoints as declarative tools, against the live API with the team key (Bearer):
//   api — https://api-ht.microburbs.com.au/v1

import { declarativeTool } from '../runtime/index.js';

export const SOURCES = {
  api: { base: 'https://api-ht.microburbs.com.au/v1', host: 'api-ht.microburbs.com.au', auth: true },
};

const str = (description) => ({ type: 'string', description });
const gnaf = { type: 'object', properties: { gnaf_id: str('GNAF property id, e.g. GANSW710358627') }, required: ['gnaf_id'] };
const suburb = {
  type: 'object',
  properties: { suburb: str("Exact suburb name from geocode_suburb, e.g. 'Zetland' or 'Waterloo (NSW)'") },
  required: ['suburb'],
};

/** [name, description, input_schema, path, query?, response shape?] — people-facing labels are in LABELS below. */
const DEFS = [
  ['geocode_address', 'Find a property GNAF id from a street address. Include the unit number for apartments. Check the matched address before using the id.',
    { type: 'object', properties: { address: str('Full address, e.g. "Unit 38, 3 Victoria Park Parade, Zetland NSW 2017"') }, required: ['address'] },
    '/geocode/address', { address: '{{args.address}}' },
    { select: 'data', limit: 5, fields: { gnaf_id: 'id', address: 'display_name', suburb: 'sal', property_type: 'property_type' } }],
  ['geocode_suburb', 'Resolve a suburb name to the exact name other suburb tools need.',
    { type: 'object', properties: { q: str('Suburb name, e.g. Waterloo') }, required: ['q'] },
    '/geocode/suburb', { q: '{{args.q}}' }, { select: 'data', limit: 5 }],
  ['get_estimated_value', 'Estimated value (AVM) of a property with low/high range and confidence. Missing for many apartments.',
    gnaf, '/properties/{{args.gnaf_id}}/valuation/avm', null, { select: 'data' }],
  ['get_agent_quoting', "The listing agency's quoting record: underquoting cohort, % of sales over quote, likely sale price.",
    gnaf, '/properties/{{args.gnaf_id}}/valuation/agent-quoting', null, { select: 'data' }],
  ['get_property_history', 'Sale and rent history for a property.',
    gnaf, '/properties/{{args.gnaf_id}}/history/all', null, { select: 'data' }],
  ['get_property_risks', 'Hazards on/near the property: flood, bushfire, heritage, power lines, etc.',
    gnaf, '/properties/{{args.gnaf_id}}/risks/all', null, { select: 'data' }],
  ['get_recent_sales_nearby', 'Recent sales near the property (price, date, distance, bedrooms).',
    gnaf, '/properties/{{args.gnaf_id}}/comparables/recent-sales-nearby', null,
    { select: 'data', limit: 25, fields: { address: 'address', price: 'price', date_sold: 'date_sold', dist_km: 'dist_km', bedrooms: 'bedrooms', type: 'property_type' } }],
  ['get_suburb_market', 'Suburb market summary for houses and units: median price, rent, yield, growth, days on market, vacancy.',
    suburb, '/suburbs/{{args.suburb}}/market/all', null, { select: 'data' }],
  ['get_rentals_for_rent', 'Current rental listings in a suburb (weekly price, bedrooms, coordinates). Use to estimate rent from same-bedroom comparables.',
    suburb, '/suburbs/{{args.suburb}}/listings/for-rent', { limit: 200 },
    { select: 'data.results', limit: 120, fields: { address: 'area_name', price: 'price', beds: 'attributes.bedrooms', type: 'property_type', lat: 'coordinates.latitude', lng: 'coordinates.longitude' } }],
  ['get_development_applications', 'Recent development applications in a suburb with address, coordinates, date and description (descriptions often state dwelling counts).',
    suburb, '/suburbs/{{args.suburb}}/development/da-list', null,
    { select: 'data', limit: 60, fields: { address: 'area_name', lat: 'lat', lng: 'lng', date: 'date', category: 'category', description: 'description' } }],
];

/** People-facing activity lines (shown in the panel instead of the tool name). */
export const LABELS = {
  geocode_address: 'Finding the property',
  geocode_suburb: 'Looking up the suburb',
  get_estimated_value: 'Checking the estimated value',
  get_agent_quoting: "Checking the agency's quoting record",
  get_property_history: 'Pulling sale and rent history',
  get_property_risks: 'Checking hazards and overlays',
  get_recent_sales_nearby: 'Looking at recent sales nearby',
  get_suburb_market: 'Reading the suburb market',
  get_rentals_for_rent: 'Checking rentals nearby',
  get_development_applications: 'Scanning development applications',
};

/** @returns {import('../runtime/registry.js').Tool[]} */
export function microburbsTools({ source = 'api', secretProvider }) {
  const s = SOURCES[source];
  return DEFS.map(([name, description, input_schema, path, query, response]) =>
    declarativeTool(
      {
        name,
        description,
        label: LABELS[name] ?? null,
        input_schema,
        allowed_hosts: [s.host],
        secrets: s.auth ? ['microburbs'] : [],
        timeout_seconds: 20,
        request: {
          url: `${s.base}${path}`,
          query: query ?? {},
          headers: s.auth ? { Authorization: 'Bearer {{secret:microburbs}}' } : {},
          response: response ?? {},
        },
      },
      { secretProvider, credentials: s.auth ? 'omit' : 'include' },
    ),
  );
}
