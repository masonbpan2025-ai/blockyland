// Recovery from truncated or malformed planner JSON.
//
// Regression guard: a cut-off reply used to surface as a raw
// "Expected ',' or '}' after array element in JSON" SyntaxError, which told the
// player nothing and discarded a plan that only needed a closing brace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanWithRecovery } from '../src/agentProviders.js';

test('a complete reply parses without needing repair', () => {
  const result = parsePlanWithRecovery('{"action":"message","explanation":"hi"}');
  assert.equal(result.repaired, false);
  assert.equal(result.error, null);
  assert.deepEqual(result.plan, { action: 'message', explanation: 'hi' });
});

test('a reply cut off inside an object is recovered', () => {
  const result = parsePlanWithRecovery('{"action":"build","name":"Castle","operations":[{"type":"fill_box","block":"STONE"');
  assert.equal(result.repaired, true, 'should be flagged as repaired');
  assert.equal(result.error, null);
  assert.equal(result.plan.action, 'build');
  assert.equal(result.plan.name, 'Castle');
  assert.ok(Array.isArray(result.plan.operations));
  assert.equal(result.plan.operations[0].type, 'fill_box');
});

test('a reply cut off mid-string is recovered', () => {
  const result = parsePlanWithRecovery('{"action":"message","explanation":"the castle is');
  assert.equal(result.repaired, true);
  assert.equal(result.plan.action, 'message');
  assert.equal(result.plan.explanation, 'the castle is', 'the partial string is closed and kept');
});

test('a dangling separator or key at the end is dropped safely', () => {
  const afterComma = parsePlanWithRecovery('{"action":"build","operations":[{"type":"fill_box"},');
  assert.equal(afterComma.repaired, true);
  assert.equal(afterComma.plan.action, 'build');
  assert.equal(afterComma.plan.operations.length, 1);

  const danglingKey = parsePlanWithRecovery('{"action":"build","dimensions":');
  assert.equal(danglingKey.repaired, true);
  assert.equal(danglingKey.plan.action, 'build');

  const danglingAssign = parsePlanWithRecovery('{"action":"build","name"');
  assert.equal(danglingAssign.repaired, true);
  assert.equal(danglingAssign.plan.action, 'build');
});

test('trailing commas are tolerated', () => {
  const result = parsePlanWithRecovery('{"action":"message","explanation":"hi",}');
  assert.equal(result.repaired, true);
  assert.deepEqual(result.plan, { action: 'message', explanation: 'hi' });
});

test('genuinely unparseable input reports the original error, not the repair error', () => {
  const result = parsePlanWithRecovery('not json at all');
  assert.equal(result.plan, null);
  assert.equal(result.repaired, false);
  assert.ok(result.error, 'an error is reported');
  // The original parse failure is more informative than the repair attempt.
  assert.match(result.error.message, /JSON/i);
});

test('empty input is rejected rather than treated as an empty plan', () => {
  for (const input of ['', '   ', null, undefined]) {
    const result = parsePlanWithRecovery(input);
    assert.equal(result.plan, null, `input ${JSON.stringify(input)} should not yield a plan`);
    assert.ok(result.error);
  }
});

test('fenced JSON is still handled', () => {
  const result = parsePlanWithRecovery('```json\n{"action":"message"}\n```');
  assert.equal(result.repaired, false);
  assert.deepEqual(result.plan, { action: 'message' });
});

test('braces inside strings do not confuse the recovery', () => {
  const result = parsePlanWithRecovery('{"action":"build","name":"Tower {with} braces","operations":[{"type":"fill_box"');
  assert.equal(result.repaired, true);
  assert.equal(result.plan.name, 'Tower {with} braces');
});
