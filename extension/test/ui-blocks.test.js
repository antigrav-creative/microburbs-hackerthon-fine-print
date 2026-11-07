import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardFromBrief, LessonBook, offerLadder, resolveTemplate, TEMPLATES, uiBlockTool } from '../src/agent/ui-blocks.js';
import { testBrief, TEST_INVESTOR } from './fixtures/test-data.js';
import { ToolRegistry } from '../src/runtime/index.js';
import { validate } from '../src/runtime/validate.js';

const memoryStorage = () => {
  const data = {};
  return { data, get: async (k) => ({ [k]: data[k] }), set: async (o) => Object.assign(data, o) };
};
const INVESTOR = { ...TEST_INVESTOR, holdYears: 10 };
const BRIEF = testBrief({ unit: '38', number: '3', street: 'Victoria Park Parade', suburb: 'Zetland' }, INVESTOR);
const call = (args) => ({ id: 'c1', name: 'render_ui_block', args });
const registry = (o = {}) => new ToolRegistry([uiBlockTool({ getBrief: () => BRIEF, investor: INVESTOR, lessons: new LessonBook(memoryStorage()), ...o })]);

test('all 10 templates exist and every example is valid', () => {
  assert.deepEqual(Object.keys(TEMPLATES), ['yield', 'supply', 'supply_timeline', 'cash_flow', 'value', 'area', 'offer', 'hold', 'property', 'overlays']);
  for (const [name, t] of Object.entries(TEMPLATES)) assert.deepEqual(validate(t.schema, t.example), [], name);
});

test('every card builds from the brief and validates — the agent only picks the template', () => {
  for (const name of Object.keys(TEMPLATES)) {
    const body = cardFromBrief(name, BRIEF, INVESTOR);
    assert.deepEqual(validate(TEMPLATES[name].schema, body), [], `${name}: ${JSON.stringify(body)}`);
  }
});

test('card numbers come from the data', () => {
  const cf = cardFromBrief('cash_flow', BRIEF, INVESTOR);
  assert.equal(cf.headline, '−$181');
  assert.deepEqual(cf.lines.map((l) => l.weekly), [775, -799, -112, -45]);
  assert.equal(cardFromBrief('yield', BRIEF, INVESTOR).headline, '5.2%');
  assert.equal(cardFromBrief('supply', BRIEF, INVESTOR).headline, '1039');
  assert.deepEqual(offerLadder(BRIEF, INVESTOR), { open: 715000, aim: 745000, walk_away: 800000 });
});

test('template-only call renders, returns the filled body, and concludes', async () => {
  const out = await registry().execute(call({ template: 'cash_flow' }));
  assert.equal(out.error, false);
  assert.equal(out.concludes, true);
  const res = JSON.parse(out.result);
  assert.equal(res.rendered, true);
  assert.equal(res.body.headline, '−$181');
});

test('caption + offer overrides; design names resolve', async () => {
  const res = JSON.parse((await registry().execute(call({ template: 'show_offer_ladder', caption: 'Start low.', offer: { aim: 740000 } }))).result);
  assert.equal(res.template, 'offer');
  assert.equal(res.body.aim, 740000);
  assert.equal(res.body.caption, 'Start low.');
  assert.equal(resolveTemplate('Cash flow'), 'cash_flow');
});

test('self-documenting failures', async () => {
  const unknown = JSON.parse((await registry().execute(call({ template: 'pie_chart' }))).result);
  assert.equal(unknown.error_code, 'unknown_template');
  assert.match(unknown.hint, /cash_flow — "What will it cost me\?"/);

  const noBrief = JSON.parse((await registry({ getBrief: () => null }).execute(call({ template: 'yield' }))).result);
  assert.equal(noBrief.error_code, 'no_brief');
  assert.match(noBrief.hint, /get_listing_brief/);

  const noAvm = { ...BRIEF, price: { ...BRIEF.price, value: null } };
  const unavailable = await registry({ getBrief: () => noAvm }).execute(call({ template: 'value' }));
  assert.equal(unavailable.error, true);
  assert.equal(JSON.parse(unavailable.result).error_code, 'data_unavailable');
  assert.equal(unavailable.concludes, false);
});

test('learning: a bad caption is recorded as a lesson', async () => {
  const storage = memoryStorage();
  const reg = registry({ lessons: new LessonBook(storage) });
  const out = await reg.execute(call({ template: 'yield', caption: 'x'.repeat(400) }));
  assert.equal(out.error, true);
  assert.match(await new LessonBook(storage).text(), /yield: body\.caption: .* is too long \(1×\)/);
});

test('cards for a saved property come from memory', async () => {
  const saved = { ...BRIEF, property: { ...BRIEF.property, address: '105/8 SAM SING STREET, WATERLOO', gnaf_id: 'GANSW705022222' } };
  const memory = { find: async (ref) => (ref === 'GANSW705022222' ? { brief: saved } : null) };
  const res = JSON.parse((await registry({ memory }).execute(call({ template: 'property', property: 'GANSW705022222' }))).result);
  assert.equal(res.body.headline, '105/8 Sam Sing Street');
  const miss = JSON.parse((await registry({ memory }).execute(call({ template: 'property', property: 'nowhere' }))).result);
  assert.equal(miss.error_code, 'not_found');
});

test('value card builds when the valuation has no confidence score (sales-median fallback)', () => {
  const sparse = structuredClone(BRIEF);
  sparse.price.value = { estimate: 978000, low: 893000, high: 1083000, confidence: null, as_of: null, basis: 'median of 30 recent same-bed sales nearby' };
  const body = cardFromBrief('value', sparse, INVESTOR);
  assert.deepEqual(validate(TEMPLATES.value.schema, body), []);
  assert.equal('confidence' in body, false);
  assert.match(body.caption, /median of 30 recent same-bed sales/);
});

test('cards never carry nulls — missing optional data is left out, not sent as null', () => {
  const hasNull = (x) => x === null || (typeof x === 'object' && x !== null && Object.values(x).some(hasNull));
  for (const name of Object.keys(TEMPLATES)) assert.equal(hasNull(cardFromBrief(name, BRIEF, INVESTOR)), false, name);
});
