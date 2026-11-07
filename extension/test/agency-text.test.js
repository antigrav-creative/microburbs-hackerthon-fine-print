import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agencySentence, agencyShort } from '../src/agent/agency-text.js';

const under = { name: 'Morton Green Square', cohort: 'Accurate', underquote_rate_pct: 36.4, median_over_quote_pct: -1.4, sales: 11 };
const over = { name: 'Stone Real Estate', cohort: 'Severe Underquoter', underquote_rate_pct: 70.6, median_over_quote_pct: 10, sales: 17 };

test('sells under quote reads correctly (no "+-1.4% over")', () => {
  assert.equal(agencyShort(under), 'agency sells 1.4% under quote');
  assert.equal(agencySentence(under), "36% of Morton Green Square's 11 recent sales went over the quoted price; the typical sale was 1.4% under it.");
});

test('sells over quote, at quote, single sale', () => {
  assert.equal(agencyShort(over), 'agency sells 10% over quote');
  assert.match(agencySentence(over), /^71% of Stone Real Estate's 17 recent sales went over the quoted price; the typical sale was 10% over it\.$/);
  assert.equal(agencyShort({ ...over, median_over_quote_pct: 0.2 }), 'agency sells at quote');
  assert.match(agencySentence({ ...over, sales: 1 }), /1 recent sale went/);
  assert.equal(agencyShort(null), null);
});
