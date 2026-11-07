// The agents' CLI (replication/client/bl.mjs): its exit code tells a command line whether to go on. When the safety kit
// stopped the program (the player was attacked), a death stopped it, or the server held it until `bl news`, `bl` exits 3,
// so `bl run a && bl run b` stops after a. In dry8 an agent's `bl run mine3.js && bl run collect.js | head -3` went on
// into a second program while its player was being shot, and the player died inside it.
// These tests run the real CLI against a stand-in server that answers /run as the game server does.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bl = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'replication', 'client', 'bl.mjs');

/** A server whose /run answers come from `answers` in turn; it counts the programs it was sent. */
async function standInServer(answers) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', d => { body += d; });
    req.on('end', () => {
      const { code } = JSON.parse(body || '{}');
      seen.push(code);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answers[Math.min(seen.length - 1, answers.length - 1)]));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise(r => server.close(r)) };
}
/** Run a command line (one `bl` call, or a chain through the shell); resolve with its exit code and output. */
function sh(command, url, shell = false) {
  return new Promise((resolve) => {
    const env = { ...process.env, BL_PLAYER: 'Ada', BL_SERVER: url };
    const child = shell ? spawn(command, { shell: true, env }) : spawn(process.execPath, [bl, ...command], { env });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}
const ok = { output: '=== program 1 (Ada): ok, 0.1 s ===\nreturned: 1', status: 'ok', stopped: null };
const byKit = { output: '=== program 1 (Ada): stopped, 3.0 s ===\n[stopped] This program was stopped: stopped by the safety kit: running from skeleton at 9 HP.', status: 'stopped', stopped: 'stopped by the safety kit: running from skeleton at 9 HP' };
const died = { output: '=== program 1 (Ada): stopped, 9.0 s ===\n[stopped] This program was stopped: you died.', status: 'stopped', stopped: 'you died' };
const held = { output: '=== not run: stopped by the safety kit: running from skeleton at 9 HP (2 s ago) ===\nYour program was not run, and none will be until you read what happened: run `bl news`, then decide.', status: 'refused', stopped: 'stopped by the safety kit: running from skeleton at 9 HP' };
const ownStop = { output: '=== program 1 (Ada): stopped, 1.0 s ===\n[stopped] This program was stopped: stopped with bl stop.', status: 'stopped', stopped: 'stopped with bl stop' };

test('`bl eval` exits 0 for a program that ran, and 3 when the kit or a death stopped it or it was held', async () => {
  for (const [answer, code, why] of [[ok, 0, 'ran'], [byKit, 3, 'the kit took over'], [died, 3, 'the player died'], [held, 3, 'held until bl news'], [ownStop, 0, 'stopped by the agent itself']]) {
    const server = await standInServer([answer]);
    try {
      const r = await sh(['eval', 'return 1'], server.url);
      assert.equal(r.code, code, `${why}: exit ${code}`);
      assert.match(r.out, new RegExp(answer.output.split('\n')[0].replace(/[()[\]=.]/g, '\\$&')), `${why}: the output is still printed`);
      if (code === 3) assert.match(r.err, /bl news/, `${why}: it says what to do`);
    } finally { await server.close(); }
  }
});

test('a chained command line stops at the program the kit stopped: the next one is never sent', async () => {
  const node = JSON.stringify(process.execPath), cli = JSON.stringify(bl);
  const line = `${node} ${cli} eval "return 'mine'" && ${node} ${cli} eval "return 'collect'"`;
  let server = await standInServer([byKit, ok]);
  try {
    const r = await sh(line, server.url, true);
    assert.equal(server.seen.length, 1, 'only the first program reached the server');
    assert.equal(r.code, 3);
  } finally { await server.close(); }
  // the same line runs both when nothing happened
  server = await standInServer([ok, ok]);
  try {
    const r = await sh(line, server.url, true);
    assert.equal(server.seen.length, 2);
    assert.equal(r.code, 0);
  } finally { await server.close(); }
});
