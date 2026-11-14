import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parsePlayers, describeMap, placeGame } from '../agentArena/scriptedArena.mjs';
import { decide } from '../agentArena/scriptedArenaGuard.mjs';

test('a player is Name:harness[:model[:effort]], each harness with its own default model', () => {
  assert.deepEqual(parsePlayers('DS-Low:deepseek:deepseek-flash:low, Opus:claude, Sol:chatgpt:gpt-6.1-sol:high, Gem:gemini, Bot:scripted'), [
    { name: 'DS-Low', harness: 'deepseek', model: 'deepseek-flash', effort: 'low' },
    { name: 'Opus', harness: 'claude', model: 'claude-opus-5-5', effort: null },
    { name: 'Sol', harness: 'codex', model: 'gpt-6.1-sol', effort: 'high' },
    { name: 'Gem', harness: 'agy', model: 'gemini-3.8-flash-high', effort: null },
    { name: 'Bot', harness: 'scripted', model: null, effort: null },
  ]);
  assert.throws(() => parsePlayers('A:unknown:x'));
  assert.throws(() => parsePlayers('bad name:deepseek'));
  assert.throws(() => parsePlayers('A:claude,a:deepseek'), /one name/);
});

test('the map the agents get is the map the seed builds, the same every time', () => {
  const a = describeMap({ template: 'twin_peaks', pack: 'meadow', seed: 4242 });
  const b = describeMap({ template: 'twin_peaks', pack: 'meadow', seed: 4242 });
  assert.equal(a.md, b.md);
  assert.deepEqual(a.json.map, { template: 'twin_peaks', pack: 'meadow', seed: 4242 });
  // Twin Peaks: two middles at different heights, both listed with their chests.
  const middles = a.json.islands.filter((i) => i.role === 'center');
  assert.equal(middles.length, 2);
  assert.notEqual(middles[0].y, middles[1].y);
  assert.ok(a.json.chests.some((c) => c.kind === 'center'));
  assert.ok(a.md.includes('slot 0') && a.md.includes('slot 1'));
  assert.notEqual(describeMap({ template: 'twin_peaks', pack: 'meadow', seed: 4243 }).md, a.md);
});

test('a free-for-all places the winner first, then the others by how long they lasted; points are the players outlasted', () => {
  // Five players; B wins; the others fell in the order C (t 20), D (30), A (40), E (55). By hand: B 1st (outlasts 4),
  // E 2nd (3), A 3rd (2), D 4th (1), C 5th (0).
  const r = placeGame({ names: ['A', 'B', 'C', 'D', 'E'], winner: 'B', deaths: [{ who: 'C', t: 20 }, { who: 'D', t: 30 }, { who: 'A', t: 40 }, { who: 'E', t: 55 }] });
  assert.deepEqual(r.places, { B: 1, E: 2, A: 3, D: 4, C: 5 });
  assert.deepEqual(r.points, { B: 4, E: 3, A: 2, D: 1, C: 0 });
  // Time ran out with three standing: they share first place, each outlasting the two who fell.
  const t = placeGame({ names: ['A', 'B', 'C', 'D', 'E'], winner: null, deaths: [{ who: 'D', t: 10 }, { who: 'B', t: 70 }] });
  assert.deepEqual(t.places, { A: 1, C: 1, E: 1, B: 4, D: 5 });
  assert.deepEqual(t.points, { A: 2, C: 2, E: 2, B: 1, D: 0 });
});

test("Gemini's gate: only the arena's three commands, their arguments kept for them; files only in the workspace", () => {
  const ws = path.resolve('tmp-ws-gate');
  const run = (line) => decide({ toolCall: { name: 'run_command', args: { CommandLine: line } }, workspacePaths: [ws] });
  assert.deepEqual(run('node check.mjs'), { decision: 'allow', overwrite: { CommandLine: 'node check.mjs' } });
  assert.equal(run('node practice.mjs tiers 7 4').overwrite.CommandLine, 'node practice.mjs');
  assert.equal(run('node test.mjs tests/a.test.mjs').overwrite.CommandLine, 'node test.mjs');
  for (const bad of ['node -e "1"', 'node check.mjs && del x', 'rm -rf bot', 'node ../other/check.mjs', 'cat ~/.ssh/id_rsa']) assert.equal(run(bad).overwrite?.CommandLine, 'node refused.mjs', bad);
  const file = (name, p) => decide({ toolCall: { name, args: { AbsolutePath: p } }, workspacePaths: [ws] });
  assert.deepEqual(file('view_file', path.join(ws, 'bot', 'x.mjs')), { decision: 'allow' });
  assert.ok(file('view_file', path.resolve('agentArena', 'runs', 'state.json')).overwrite, 'a file outside the workspace is not read');
  assert.ok(file('write_to_file', path.join(ws, 'check.mjs')).overwrite, "the arena's own scripts are not written");
  assert.equal(decide({ toolCall: { name: 'browser_open', args: {} }, workspacePaths: [ws] }).decision, 'deny');
});
