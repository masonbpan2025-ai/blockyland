// Every reply shape a model realistically produces for a question must be
// answerable, not rejected.
//
// Regression guard: asking "tell me about this world" produced a valid JSON
// object containing only an "explanation" — no "action" field — and the validator
// rejected it with "Unsupported action: undefined", discarding a good answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlanShape, parsePlanWithRecovery, describePlanShape } from '../src/agentProviders.js';
import { validatePlan } from '../src/agentPlans.js';

// --- plans that lost their wrapper -------------------------------------------

test('a bare array of steps becomes a multi plan', () => {
  // The model reasons "multi steps: summon salmon, give fishing rod" and emits the
  // steps without the wrapper, which used to validate as an invalid plan.
  const reply = JSON.stringify([
    { action: 'summon', mobs: [{ type: 'salmon', count: 12 }] },
    { action: 'give', giveItems: [{ name: 'fishing_rod', count: 1 }] }
  ]);

  const outcome = parsePlanWithRecovery(reply);
  assert.equal(outcome.error, null);
  assert.equal(outcome.plan.action, 'multi');
  assert.equal(outcome.plan.steps.length, 2);
  assert.doesNotThrow(() => validatePlan(outcome.plan), 'a multi plan is valid');
});

test('steps without an action field become a multi plan', () => {
  const outcome = parsePlanWithRecovery(JSON.stringify({
    steps: [{ action: 'summon', mobs: [{ type: 'salmon', count: 12 }] }]
  }));
  assert.equal(outcome.plan.action, 'multi');
  assert.doesNotThrow(() => validatePlan(outcome.plan));
});

test('a plan wrapped in an envelope is unwrapped', () => {
  for (const key of ['plan', 'agentPlan', 'result']) {
    const outcome = parsePlanWithRecovery(JSON.stringify({ [key]: { action: 'message', explanation: 'hello' } }));
    assert.equal(outcome.plan.action, 'message', `${key} should be unwrapped`);
    assert.equal(outcome.plan.explanation, 'hello');
  }
});

test('an empty array or a non-object array is left for the validator', () => {
  assert.deepEqual(normalizePlanShape([]), []);
  // An array of scalars is not a step list.
  assert.deepEqual(normalizePlanShape([1, 2, 3]), [1, 2, 3]);
  assert.throws(() => validatePlan(normalizePlanShape([1, 2, 3])));
});

test('describePlanShape names what actually arrived, for a useful error', () => {
  assert.equal(describePlanShape(null), 'null');
  assert.equal(describePlanShape([1, 2]), 'array(2)');
  assert.equal(describePlanShape('text'), 'string');
  assert.match(describePlanShape({ foo: 1, bar: 2 }), /with no action field/);
  assert.match(describePlanShape({ foo: 1 }), /object\{foo\}/);
  assert.match(describePlanShape({ action: 'wrong' }), /action="wrong"/);
});

test('a reply that parses but cannot be planned still yields a usable message', () => {
  // Numbers only: no action, no text. The agent must report rather than crash.
  const outcome = parsePlanWithRecovery('{"counts":[1,2,3]}');
  assert.ok(outcome.plan, 'it parsed');
  assert.throws(() => validatePlan(outcome.plan), /Unsupported action/, 'and the validator rejects it');
  // Which the agent turns into a message plan rather than an exception.
  assert.match(describePlanShape(outcome.plan), /counts/);
});

// --- the exact failing shape -------------------------------------------------

test('a JSON answer with no action field is treated as a message', () => {
  // This is precisely what the model returned for "tell me about this world".
  const reply = JSON.stringify({
    explanation: 'The player is at XYZ (-8, 24, 8), facing west. Terrain: desert/savanna with sand, grass, cacti, a stone structure and oak trees.'
  });

  const outcome = parsePlanWithRecovery(reply);
  assert.equal(outcome.error, null, 'this is not an error');
  assert.equal(outcome.plan.action, 'message', 'it is normalised to a message plan');
  assert.match(outcome.plan.explanation, /desert\/savanna/);

  // And it must survive validation, which is where it previously died.
  assert.doesNotThrow(() => validatePlan(outcome.plan));
});

test('other fields a model might use for the answer are recognised too', () => {
  for (const field of ['explanation', 'message', 'reply', 'answer', 'text', 'response', 'content']) {
    const plan = normalizePlanShape({ [field]: 'Here is what I can see.' });
    assert.equal(plan.action, 'message', `${field} should be understood`);
    assert.equal(plan.explanation, 'Here is what I can see.');
  }
});

test('a reply with a real action is left completely alone', () => {
  for (const action of ['build', 'edit', 'destroy', 'summon', 'create_mob', 'multi']) {
    const plan = normalizePlanShape({ action, explanation: 'doing the thing' });
    assert.equal(plan.action, action, `${action} must not be rewritten`);
  }
  // Even a plan that also carries an "explanation".
  const build = normalizePlanShape({ action: 'build', structureType: 'castle', explanation: 'x' });
  assert.equal(build.action, 'build');
});

test('an action-less reply with no usable text is still rejected', () => {
  // Nothing to say and nothing to do: the validator should complain.
  const plan = normalizePlanShape({ unrelated: true });
  assert.throws(() => validatePlan(plan), /Unsupported action/);

  // A wrong action is still a genuine error, not silently converted to chat.
  assert.throws(() => validatePlan({ action: 'frobnicate' }), /Unsupported action: frobnicate/);
});

test('normalisation handles junk without throwing', () => {
  assert.equal(normalizePlanShape(null), null);
  assert.equal(normalizePlanShape(undefined), null);
  assert.deepEqual(normalizePlanShape([]), []);
  assert.equal(normalizePlanShape('a string'), 'a string');
  // Blank text does not count as an answer.
  assert.equal(normalizePlanShape({ explanation: '   ' }).action, undefined);
});

test('an action-less answer that was also truncated is recovered and normalised', () => {
  const outcome = parsePlanWithRecovery('{"explanation":"The terrain here is mostly sand and grass');
  assert.equal(outcome.repaired, true, 'the missing closing brace is repaired');
  assert.equal(outcome.plan.action, 'message', 'and the shape is normalised');
  assert.match(outcome.plan.explanation, /mostly sand and grass/);
  assert.doesNotThrow(() => validatePlan(outcome.plan));
});

test('an action-less answer wrapped in a code fence works too', () => {
  const outcome = parsePlanWithRecovery('```json\n{"explanation":"You are on a beach."}\n```');
  assert.equal(outcome.plan.action, 'message');
  assert.doesNotThrow(() => validatePlan(outcome.plan));
});

test('every conversational reply shape ends up valid', () => {
  const replies = [
    '{"explanation":"answer one"}',
    '{"message":"answer two"}',
    '{"action":"message","explanation":"answer three"}',
    'Plain prose answer four.',
    '{"explanation":"truncated answer five',
    '```json\n{"reply":"answer six"}\n```'
  ];
  for (const reply of replies) {
    const outcome = parsePlanWithRecovery(reply);
    assert.ok(outcome.plan, `should parse: ${reply}`);
    assert.doesNotThrow(() => validatePlan(outcome.plan), `should validate: ${reply}`);
    assert.equal(outcome.plan.action, 'message', `should be a message: ${reply}`);
  }
});
