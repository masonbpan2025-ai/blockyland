// The Agent Terminal's request status (src/agentControl/requestTracker.js): sent, working on what, and a clear done.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestTracker, describeStep, formatElapsed, IDLE_DONE_MS, SLOW_PICKUP_MS } from '../src/agentControl/requestTracker.js';

function clocked() {
  let now = 1_000_000;
  const views = [];
  const tracker = new RequestTracker({ now: () => now, onChange: view => views.push(view) });
  return { tracker, views, advance: ms => { now += ms; } };
}

test('a request goes sent, then working on each step, then done when the AI app waits again', () => {
  const { tracker, advance } = clocked();
  assert.equal(tracker.view().state, 'idle');
  tracker.start('build a fence around the garden');
  assert.equal(tracker.view().state, 'sent');
  assert.match(tracker.view().text, /waiting for it to pick it up/);
  advance(2000);
  tracker.pickedUp();
  assert.equal(tracker.view().text, 'Working: reading your request…');
  tracker.toolCall('look_around');
  tracker.toolResult('look_around', true);
  assert.equal(tracker.view().text, 'Working: looking around…');
  tracker.toolCall('run_plan', { plan: { action: 'build', name: 'Garden fence' } });
  tracker.toolResult('run_plan', true);
  assert.equal(tracker.view().text, 'Working: building Garden fence…');
  advance(70_000);
  assert.equal(tracker.view().elapsed, '1 min 12 s');
  tracker.toolCall('say', { text: 'Done!' });
  tracker.toolResult('say', true);
  tracker.aiWaiting();
  const done = tracker.view();
  assert.equal(done.state, 'done');
  assert.equal(done.text, 'Done in 1 min 12 s.');
  advance(30_000);
  assert.equal(tracker.view().elapsed, '1 min 12 s', 'the time stops when it is done');
});

test('an AI app that answers and stops without waiting again is done after a quiet spell', () => {
  const { tracker, advance } = clocked();
  tracker.start('make it rain');
  tracker.pickedUp();
  tracker.toolCall('run_command', { command: '/weather rain' });
  tracker.toolResult('run_command', true);
  advance(IDLE_DONE_MS * 3);
  tracker.tick();
  assert.equal(tracker.state, 'working', 'no answer yet: a slow AI app is not cut off');
  tracker.toolCall('say', { text: 'It is raining.' });
  tracker.toolResult('say', true);
  advance(IDLE_DONE_MS - 1);
  tracker.tick();
  assert.equal(tracker.state, 'working');
  advance(1);
  tracker.tick();
  assert.equal(tracker.state, 'done');
});

test('a request nobody picks up says how to get the AI app listening', () => {
  const { tracker, advance } = clocked();
  tracker.start('build a tower');
  advance(SLOW_PICKUP_MS);
  tracker.tick();
  assert.match(tracker.view().text, /has not picked up your request yet.*wait for my requests/);
  tracker.pickedUp();
  assert.equal(tracker.state, 'working');
});

test('a disconnect mid-request says so; a disconnect when idle says nothing', () => {
  const { tracker, views } = clocked();
  tracker.disconnected();
  assert.equal(views.length, 0);
  tracker.start('build a tower');
  tracker.pickedUp();
  tracker.disconnected();
  assert.equal(tracker.view().state, 'interrupted');
  assert.match(tracker.view().text, /disconnected before it finished/);
});

test('signals that arrive out of turn change nothing', () => {
  const { tracker, views } = clocked();
  tracker.toolCall('look_around');
  tracker.aiWaiting();
  tracker.pickedUp();
  assert.equal(tracker.state, 'idle');
  assert.equal(views.length, 0);
  tracker.start('x');
  tracker.aiWaiting();
  assert.equal(tracker.state, 'sent', 'waiting before picking the request up is the AI app between requests');
});

test('steps read the way a player would say them', () => {
  assert.equal(describeStep('screenshot'), 'looking at your view');
  assert.equal(describeStep('run_command', { command: '/time set night' }), 'running /time set night');
  assert.equal(describeStep('run_plan', { plan: { action: 'destroy', name: 'Old shed' } }), 'removing Old shed');
  assert.equal(describeStep('run_plan', { plan: { action: 'summon', name: 'cows' } }), 'summoning creatures');
  assert.equal(describeStep('run_plan', { plan: { action: 'edit', explanation: 'Add a door to the barn' } }), 'changing Add a door to the barn');
  assert.equal(describeStep('run_plan', { plan: { action: 'build' } }), 'building');
  assert.equal(formatElapsed(4_400), '4 s');
  assert.equal(formatElapsed(125_000), '2 min 05 s');
});

test('measured progress persists through slow work and resets for the next step', () => {
  const { tracker, advance } = clocked();
  tracker.start('build a house');
  tracker.pickedUp();
  tracker.toolCall('run_plan', { plan: { action: 'build' } });
  tracker.reportProgress(42, 'Placing walls');
  advance(20_000);
  tracker.tick();
  assert.equal(tracker.view().progress, 42);
  assert.match(tracker.view().text, /Placing walls/);
  tracker.aiWaiting();
  assert.equal(tracker.state, 'working', 'a concurrent listener cannot finish a running build');
  tracker.toolResult('run_plan', true);
  assert.equal(tracker.view().progress, null, 'the next model step has no measured percentage');
  tracker.reportProgress(undefined, 'Designing the roof');
  assert.equal(tracker.view().progress, null);
  assert.match(tracker.view().text, /Designing the roof/);
});

test('an earlier answer cannot mark a later long build done, and failed say does not finish', () => {
  const { tracker, advance } = clocked();
  tracker.start('build a house');
  tracker.toolCall('say', { text: 'Starting' });
  tracker.toolResult('say', true);
  tracker.toolCall('run_plan', { plan: { action: 'build' } });
  advance(IDLE_DONE_MS * 2);
  tracker.tick();
  assert.equal(tracker.state, 'working');
  tracker.toolResult('run_plan', true);
  tracker.toolCall('say', { text: 'Done' });
  tracker.toolResult('say', false);
  advance(IDLE_DONE_MS * 2);
  tracker.tick();
  assert.equal(tracker.state, 'working');
  tracker.toolCall('say', { text: 'Done' });
  tracker.toolResult('say', true);
  advance(IDLE_DONE_MS);
  tracker.tick();
  assert.equal(tracker.state, 'done');
});
