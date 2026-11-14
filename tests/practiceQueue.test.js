// The arena's practice service (agentArena/scriptedPractice.mjs servePractice) shares a few game slots among agents
// coding at once. It must be fair: the agent with the fewest games goes next whatever the order of their workspaces or
// how many requests one of them queues; the arena's own games of a frozen bot wait for a spare slot; and a game the
// arena failed to play does not count against the agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servePractice } from '../agentArena/scriptedPractice.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pq-'));
  // A stand-in for a practice game: it plays for 300 ms, or fails when the request's template says so.
  const script = path.join(root, 'game.mjs');
  writeFileSync(script, `import { readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path';
const job = JSON.parse(readFileSync(process.argv[3], 'utf8'));
await new Promise((r) => setTimeout(r, 300));
if (job.template === 'fail') process.exit(3);
writeFileSync(path.join(path.dirname(process.argv[3]), 'summary.md'), 'played ' + job.n);`);
  const ws = (name) => {
    const w = path.join(root, name);
    mkdirSync(path.join(w, 'practice', 'queue'), { recursive: true });
    writeFileSync(path.join(w, 'check.mjs'), 'process.exit(0)');
    return { name, ws: w };
  };
  let seq = 0;
  const request = (w, req = {}) => writeFileSync(path.join(w.ws, 'practice', 'queue', `p${String(++seq).padStart(4, '0')}.json`), JSON.stringify({ opponents: 1, at: seq, ...req }));
  return { root, script, ws, request };
}

test('practice: the agent with the fewest games goes next; the arena\'s own games only in a spare slot', async () => {
  const { root, script, ws, request } = setup();
  const a = ws('A'), b = ws('B'), c = ws('C');
  // A queues three before B and C ask once each; C's frozen bot has an arena game waiting too.
  request(a); request(a); request(a); request(b); request(c); request(c, { pre: true });
  const started = [];
  const service = servePractice({ workspaces: [a, b, c], limit: 5, concurrency: 1, script, log: (m) => { const x = /^(\w+): practice \d+ \(/.exec(m); if (x) started.push(x[1] + (/arena\]/.test(m) ? '*' : '')); } });
  try {
    for (let i = 0; i < 200 && started.length < 6; i++) await sleep(100);
    for (let i = 0; i < 100 && !service.idle(); i++) await sleep(100);
  } finally { service.stop(); }
  // One slot: A first (oldest), then B and C (no games yet) before A's second; the arena's game for C only once no
  // agent's own request waits.
  assert.deepEqual(started.slice(0, 3).sort(), ['A', 'B', 'C']);
  assert.deepEqual(started.slice(3), ['A', 'A', 'C*']);
  rmSync(root, { recursive: true, force: true });
});

test('practice: a game the arena failed to play does not count, and its number is not reused', async () => {
  const { root, script, ws, request } = setup();
  const a = ws('A');
  request(a, { template: 'fail' }); request(a); request(a);
  const service = servePractice({ workspaces: [{ ...a, limit: 2 }], concurrency: 1, script });
  try {
    for (let i = 0; i < 150 && readdirSync(path.join(a.ws, 'practice', 'queue')).filter((f) => f.endsWith('.result.json')).length < 3; i++) await sleep(100);
    await sleep(3500);
  } finally { service.stop(); }
  const games = readdirSync(path.join(a.ws, 'practice')).filter((d) => d !== 'queue').sort();
  assert.deepEqual(games, ['2', '3', 'failed-1'], 'two games played after the failed one: the limit of 2 counts only those');
  assert.ok(existsSync(path.join(a.ws, 'practice', '3', 'summary.md')));
  rmSync(root, { recursive: true, force: true });
});
