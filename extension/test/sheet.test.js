import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFilter, compileFormula, formulaRefs, toCsv } from '../src/agent/sheet.js';

const row = { rent: 775, price: 852500, my_offer: 745000, weekly_cost: 181, asking: 775000, likely: 852500, notes: 'Lift, north' };

test('formulas: arithmetic, precedence, functions, columns', () => {
  assert.equal(compileFormula('rent * 52 / my_offer * 100')(row).toFixed(2), '5.41');
  assert.equal(compileFormula('weekly_cost * 52')(row), 9412);
  assert.equal(compileFormula('round(price / 1000)')(row), 853);
  assert.equal(compileFormula('min(asking, likely) - my_offer')(row), 30000);
  assert.equal(compileFormula('2 + 3 * 4 ^ 2')(row), 50);
  assert.equal(compileFormula('-(rent - 800)')(row), 25);
  assert.equal(compileFormula('if(likely > 800000, 1, 0)')(row), 1);
  assert.equal(compileFormula('round(rent * 52 / price * 100, 2)')(row), 4.73);
  assert.equal(compileFormula('RENT * 2')(row), 1550); // case-insensitive column ids
});

test('formulas: missing data → empty, never NaN; divide by zero → empty', () => {
  assert.equal(compileFormula('rent * 52 / missing')(row), null);
  assert.equal(compileFormula('rent / 0')(row), null);
});

test('formulas: bad syntax throws a readable error; no code execution', () => {
  assert.throws(() => compileFormula('rent *'), /ends too early/);
  assert.throws(() => compileFormula('alert(1)'), /unknown function "alert"/);
  assert.throws(() => compileFormula('rent; process.exit()'), /unexpected/);
  assert.throws(() => compileFormula('constructor.constructor("x")()'), /unexpected/);
  assert.deepEqual(formulaRefs('rent * 52 / round(my_offer)'), ['rent', 'my_offer']);
});

test('filters: comparisons, ranges with k/m, negation, text', () => {
  assert.equal(compileFilter('>800000')(852500), true);
  assert.equal(compileFilter('>800k')(752500), false);
  assert.equal(compileFilter('<= 4.5')(4.5), true);
  assert.equal(compileFilter('800k-900k')(852500), true);
  assert.equal(compileFilter('800k to 900k')(950000), false);
  assert.equal(compileFilter('north')('Lift, north'), true);
  assert.equal(compileFilter('!btr')('BTR nearby'), false);
  assert.equal(compileFilter('')(null), true);
  assert.equal(compileFilter('>5')(null), false);
});

test('csv quoting', () => {
  const cols = [{ id: 'a', label: 'Address' }, { id: 'n', label: 'Notes' }];
  assert.equal(toCsv(cols, [{ a: '1/2 Smith St, Zetland', n: 'say "hi"' }], (r, c) => r[c.id]), 'Address,Notes\n"1/2 Smith St, Zetland","say ""hi"""');
});
