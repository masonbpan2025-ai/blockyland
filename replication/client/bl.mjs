#!/usr/bin/env node
// The agents' CLI: send a program to your bot and print what it logged and returned.
//   node bl.mjs run <file.js> [--timeout 60]     run a program file
//   node bl.mjs eval "<code>" [--timeout 60]     run code given inline
//   node bl.mjs stop                             stop every program of yours that is still running
//   node bl.mjs news                             new chat and messages (deaths, advancements) without running a program
//   node bl.mjs status                           every player's dimension, position and health
// The player and server come from BL_PLAYER and BL_SERVER (default http://127.0.0.1:7790); BL_TOKEN is your bot's key.
// node:http, not fetch: fetch gives up waiting for an answer after 300 s, and a program may run for up to 1800.
import { readFileSync } from 'node:fs';
import http from 'node:http';

const [cmd, target, ...rest] = process.argv.slice(2);
const server = new URL(process.env.BL_SERVER ?? 'http://127.0.0.1:7790');
const player = process.env.BL_PLAYER;
const ti = rest.indexOf('--timeout');
const timeout = ti >= 0 ? Number(rest[ti + 1]) : 60;

function request(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: server.hostname, port: server.port, path: pathname, method, timeout: 0,
      headers: { 'content-type': 'application/json', 'x-bl-token': process.env.BL_TOKEN ?? '', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (d) => { text += d; }); res.on('end', () => { try { resolve(JSON.parse(text)); } catch { reject(new Error(text.slice(0, 200))); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  if (cmd === 'status') { console.log(JSON.stringify(await request('GET', '/status'), null, 1)); return; }
  if (cmd !== 'run' && cmd !== 'eval' && cmd !== 'stop' && cmd !== 'news') { console.log('usage: bl run <file.js> [--timeout N] | bl eval "<code>" [--timeout N] | bl stop | bl news | bl status'); process.exit(2); }
  if (!player) { console.error('BL_PLAYER is not set'); process.exit(2); }
  if (cmd === 'news') {
    const body = await request('POST', '/news', { player });
    if (body.error) { console.error(body.error); process.exit(1); }
    console.log(body.output);
    return;
  }
  if (cmd === 'stop') {
    const body = await request('POST', '/stop-programs', { player });
    if (body.error) { console.error(body.error); process.exit(1); }
    console.log(body.stopped.length ? `Stopped program${body.stopped.length > 1 ? 's' : ''} ${body.stopped.join(', ')}: their actions now fail, your movement is released and the listeners they added are removed.` : 'No program of yours is running.');
    return;
  }
  const code = cmd === 'run' ? readFileSync(target, 'utf8') : target;
  const body = await request('POST', '/run', { player, code, timeout });
  if (body.error) { console.error(body.error); process.exit(1); }
  console.log(body.output);
  // Attacked or dead (the safety kit or a death stopped the program), or held until `bl news`: exit 3, so a chained
  // command line (`bl run a && bl run b`) stops here instead of carrying on blind.
  if (body.status === 'refused' || (body.status === 'stopped' && /safety kit|you died/.test(body.stopped ?? ''))) {
    console.error(`bl: ${body.status === 'refused' ? 'not run' : 'stopped'} (${body.stopped}). Exit code 3: run \`bl news\` before anything else.`);
    process.exit(3);
  }
}
main().catch(err => { console.error(`Could not reach the game server at ${server.origin}: ${err.message}`); process.exit(1); });
