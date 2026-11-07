import { test } from 'node:test';
import assert from 'node:assert/strict';

test('cleanBrief: zeros, blanks and junk fall back to sane defaults', async () => {
  globalThis.chrome ??= { storage: { local: { get: async () => ({}) } }, runtime: {} };
  const { cleanBrief } = await import('../src/agent/agent.js');
  assert.deepEqual(cleanBrief({ budget: 800000, deposit: 160000, minYield: 4, holdYears: 0 }), { budget: 800000, deposit: 160000, minYield: 4, holdYears: 10 });
  assert.deepEqual(cleanBrief({}), { budget: 800000, deposit: 160000, minYield: 4, holdYears: 10 });
  assert.equal(cleanBrief({ holdYears: '' }).holdYears, 10);
  assert.equal(cleanBrief({ holdYears: 7 }).holdYears, 5); // snaps to the nearest option
  assert.equal(cleanBrief({ holdYears: 30 }).holdYears, 15);
  assert.equal(cleanBrief({ budget: 600000, deposit: 900000 }).deposit, 120000); // deposit can't exceed budget
  assert.equal(cleanBrief({ minYield: -1 }).minYield, 4);
});

test('parseQuestions: lines, numbering, bullets, quotes, JSON', async () => {
  const { parseQuestions } = await import('../src/agent/agent.js');
  assert.deepEqual(parseQuestions('What should I offer?\nIs the supply a risk?\nWhat will it cost weekly?'), ['What should I offer?', 'Is the supply a risk?', 'What will it cost weekly?']);
  assert.deepEqual(parseQuestions('1. What should I offer?\n2) Is supply a risk?\n- "Can I get it under $800K?"'), ['What should I offer?', 'Is supply a risk?', 'Can I get it under $800K?']);
  assert.deepEqual(parseQuestions('{"questions":["What should I offer?","Any hazards nearby?","Is rent growth safe?"]}'), ['What should I offer?', 'Any hazards nearby?', 'Is rent growth safe?']);
  assert.deepEqual(parseQuestions(''), []);
});

test('briefIsSet: onboarding until every field has a real value', async () => {
  const { briefIsSet } = await import('../src/agent/agent.js');
  assert.equal(briefIsSet({ budget: 800000, deposit: 160000, minYield: 4, holdYears: 10 }), true);
  assert.equal(briefIsSet(null), false);
  assert.equal(briefIsSet({}), false);
  assert.equal(briefIsSet({ budget: 800000, deposit: 160000, minYield: 4, holdYears: 0 }), false); // the old "0" bug
  assert.equal(briefIsSet({ budget: '', deposit: 160000, minYield: 4, holdYears: 10 }), false);
});
