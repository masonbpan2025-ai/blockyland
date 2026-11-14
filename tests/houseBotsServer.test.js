// "Bot join" (server/houseBotsVite.js): the dev server says it can play bots, refuses a request that does not name a
// room, a game and (for Bed Wars) a team properly, and plays each bot in a bot host (agentArena/botHost.mjs) that was
// loaded before it was asked for: a SkyWars bot is one of the five Agent Arena bots drawn at random, a Bed Wars team is
// given one of the five and every bot that joins it plays that one, in the team's own host. Bot hosts are faked here
// (tests/botJoin.test.js runs real ones).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { houseBotsPlugin } from '../server/houseBotsVite.js';

/** A fake bot host: records what it is asked, and can answer or exit as a real one does. */
function fakeHosts() {
  const made = [];
  const spawnHost = () => {
    const h = new EventEmitter();
    Object.assign(h, { id: made.length + 1, sent: [], killed: false, send(m) { this.sent.push(m); }, kill() { this.killed = true; this.emit('exit', 0); } });
    made.push(h);
    return h;
  };
  return { made, spawnHost };
}
/** A random source that gives these values in turn. */
const sequence = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

function serverWith(plugin) {
  const handlers = [];
  const server = { middlewares: { use: (h) => handlers.push(h) }, httpServer: new EventEmitter(), config: { server: { port: 3000 }, logger: { info() {} } } };
  server.httpServer.address = () => ({ port: 3000 });
  plugin.configureServer(server);
  const call = async (method, url, body) => {
    const req = new EventEmitter();
    Object.assign(req, { method, url });
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = JSON.parse(text); this.done(); } };
    const answered = new Promise((resolve) => { res.done = resolve; });
    let passed = false;
    handlers[0](req, res, () => { passed = true; res.done(); });
    if (body !== undefined) { req.emit('data', JSON.stringify(body)); req.emit('end'); }
    await answered;
    return passed ? null : res;
  };
  return { call, server };
}

test('asked whether bots are available, the server says yes and has two bot hosts loading before any is asked for', async () => {
  const hosts = fakeHosts();
  const { call } = serverWith(houseBotsPlugin({ spawnHost: hosts.spawnHost }));
  const res = await call('GET', '/__house-bots');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { available: true, bots: [], teams: [] });
  assert.equal(hosts.made.length, 2, 'two hosts loading, waiting for a request');
  await call('GET', '/__house-bots');
  assert.equal(hosts.made.length, 2, 'no more while they wait');
  assert.equal(await call('GET', '/something-else'), null, 'other routes pass through');
});

test('a bot request must name a 4-digit room, a known game and, for Bed Wars, a plain team', async () => {
  const hosts = fakeHosts();
  const { call } = serverWith(houseBotsPlugin({ spawnHost: hosts.spawnHost }));
  for (const body of [{ code: '12', game: 'skywars' }, { code: '1234', game: 'chess' }, { code: '1234', game: 'bedwars', team: 'blue; rm -rf' }, { code: '1234', game: 'bedwars' }, {}]) {
    const res = await call('POST', '/__house-bots/join', body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(res.body.ok, false);
  }
  assert.equal(hosts.made.length, 0, 'nothing started for a bad request');
});

test('a SkyWars bot is one of the five drawn at random, handed at once to a host already loading, which is replaced', async () => {
  const hosts = fakeHosts();
  const { call } = serverWith(houseBotsPlugin({ spawnHost: hosts.spawnHost, random: sequence(0.5, 0.0, 0.9) }));
  await call('GET', '/__house-bots');
  const a = await call('POST', '/__house-bots/join', { code: '1234', game: 'skywars' });
  assert.deepEqual(a.body, { ok: true, name: 'GeminiBot-1', ai: 'Gemini' });
  // The first waiting host plays it; a new one starts loading so two still wait.
  assert.deepEqual(hosts.made[0].sent, [{ type: 'join', name: 'GeminiBot-1', code: '1234', game: 'skywars', team: null, ai: 'Gemini', url: 'ws://127.0.0.1:3000/ws/share' }]);
  assert.equal(hosts.made.length, 3);
  const b = await call('POST', '/__house-bots/join', { code: '1234', game: 'skywars' });
  const c = await call('POST', '/__house-bots/join', { code: '1234', game: 'skywars' });
  assert.deepEqual([b.body.ai, c.body.ai], ['Opus', 'Scripted']);
  // Every SkyWars bot in a host of its own (a bot's strategy may keep memory; free-for-all players share none).
  assert.equal(hosts.made[1].sent[0].name, 'OpusBot-2');
  assert.equal(hosts.made[2].sent[0].name, 'ScriptedBot-3');
  assert.equal(hosts.made.filter((h) => h.sent.length > 1).length, 0);
});

test('a Bed Wars team is given one bot when its first bot joins, and all its bots play that one, in the team\'s own host', async () => {
  const hosts = fakeHosts();
  const plugin = houseBotsPlugin({ spawnHost: hosts.spawnHost, random: sequence(0.3, 0.7, 0.1) });
  const { call } = serverWith(plugin);
  const red1 = await call('POST', '/__house-bots/join', { code: '1234', game: 'bedwars', team: 'red' });
  const red2 = await call('POST', '/__house-bots/join', { code: '1234', game: 'bedwars', team: 'red' });
  const blue = await call('POST', '/__house-bots/join', { code: '1234', game: 'bedwars', team: 'blue' });
  const otherRoomRed = await call('POST', '/__house-bots/join', { code: '9876', game: 'bedwars', team: 'red' });
  assert.deepEqual([red1.body.ai, red2.body.ai, blue.body.ai, otherRoomRed.body.ai], ['Sol', 'Sol', 'DeepSeek', 'Opus']);
  const hostOf = (name) => hosts.made.find((h) => h.sent.some((m) => m.name === name));
  assert.equal(hostOf(red1.body.name), hostOf(red2.body.name), 'one host for the red squad');
  assert.notEqual(hostOf(red1.body.name), hostOf(blue.body.name), 'another for blue');
  assert.notEqual(hostOf(red1.body.name), hostOf(otherRoomRed.body.name), 'and another for red in another room');
  assert.deepEqual(hostOf(red2.body.name).sent.map((m) => [m.name, m.team, m.ai]), [['SolBot-1', 'red', 'Sol'], ['SolBot-2', 'red', 'Sol']]);
  const list = (await call('GET', '/__house-bots')).body;
  assert.deepEqual(list.teams, [{ code: '1234', team: 'red', ai: 'Sol' }, { code: '1234', team: 'blue', ai: 'DeepSeek' }, { code: '9876', team: 'red', ai: 'Opus' }]);
  assert.equal(list.bots.length, 4);
});

test('a bot that leaves or fails is forgotten; a host that exits takes its team\'s bot with it; there is a limit', async () => {
  const hosts = fakeHosts();
  const plugin = houseBotsPlugin({ spawnHost: hosts.spawnHost, random: () => 0, maxBots: 3 });
  const { call } = serverWith(plugin);
  const a = (await call('POST', '/__house-bots/join', { code: '1234', game: 'skywars' })).body;
  const b = (await call('POST', '/__house-bots/join', { code: '1234', game: 'bedwars', team: 'red' })).body;
  const hostA = hosts.made.find((h) => h.sent.some((m) => m.name === a.name));
  const hostB = hosts.made.find((h) => h.sent.some((m) => m.name === b.name));
  hostA.emit('message', { type: 'failed', name: a.name, reason: 'room closed' });
  assert.deepEqual(plugin.state().bots.map((x) => x.name), [b.name]);
  hostB.emit('exit', 0);
  assert.deepEqual(plugin.state().bots, []);
  assert.deepEqual(plugin.state().teams, [], 'the red squad\'s bot is no longer chosen: a new first bot draws again');
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/__house-bots/join', { code: '1234', game: 'skywars' })).statusCode, 200);
  const over = await call('POST', '/__house-bots/join', { code: '1234', game: 'skywars' });
  assert.equal(over.statusCode, 429);
});

test('when the dev server closes, every bot host stops', async () => {
  const hosts = fakeHosts();
  const { call, server } = serverWith(houseBotsPlugin({ spawnHost: hosts.spawnHost }));
  await call('POST', '/__house-bots/join', { code: '1234', game: 'skywars' });
  server.httpServer.emit('close');
  assert.ok(hosts.made.length >= 2 && hosts.made.every((h) => h.killed));
});
