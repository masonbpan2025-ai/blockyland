// A Bot join bot that is stuck breaks out (guestPeer.js escapeWhenStuck): it made no headway toward where it was going
// for 8 s, so it digs through the wall in its way (SkyWars, where the map can be broken), towers up over it (Bed Wars,
// with blocks), or bridges the void (with blocks). Seen in a game: a bot knocked into a notch walled on three sides,
// void on the fourth, its foe on a bridge 8 blocks off -- both stood still for the rest of the game.
// Also: a mini-game keeps going in a background tab (src/mods/backgroundTicker.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GuestPeerSession, BLOCKS } from '../packages/blockyland-mcp/guestPeer.js';
import { keepTicking } from '../src/mods/backgroundTicker.js';

/** A bot at (0.5, 31, 0.5) on a floor at y 30, a wall `wallHeight` high at x 1 in its way, and its goal at x 6. */
function walledIn(gameMode, { escape = true, wallHeight = 4, blocks = 0 } = {}) {
  const s = new GuestPeerSession({ code: '0000', url: 'ws://127.0.0.1:1/ws/share', autopilot: false, escapeWhenStuck: escape });
  s.clientId = 'me';
  s.gameMode = gameMode;
  s.connected = true;
  s.snapshotReceived = true;
  if (gameMode === 'skywars') s.skywarsState = { phase: 'playing', players: [{ id: 'me', name: 'Me', slot: 0, alive: true }] };
  else s.bedwarsState = { phase: 'playing', players: [{ id: 'me', name: 'Me', team: 'red', alive: true }], teams: [{ id: 'red', bed: true, upgrades: {}, traps: [] }] };
  for (let x = -1; x <= 7; x++) for (let z = -1; z <= 1; z++) s.setVoxel(x, 30, z, BLOCKS.STONE);
  for (let y = 31; y < 31 + wallHeight; y++) for (let z = -1; z <= 1; z++) s.setVoxel(1, y, z, BLOCKS.STONE);
  if (blocks) s.inventory.addItem('red_wool', true, blocks);
  s.position = { x: 0.5, y: 31, z: 0.5 };
  s.sendPacket = () => true;
  s.broadcastState = () => {};
  return s;
}
/** Date.now, moved on by `ms` (the bot's stuck watch reads it). */
function clock() {
  const real = Date.now, start = real();
  let offset = 0;
  Date.now = () => real() + offset;
  return { pass: (ms) => { offset += ms; }, restore: () => { Date.now = real; }, start };
}
const towardGoal = (s) => s.moveStepToward(6.5, 31, 0.5, { avoidVoid: true, durationMs: 300, stopWithin: 1 });

test('SkyWars: walled in, a stuck bot digs through the wall after 8 s without headway, and goes on', async (t) => {
  const c = clock(); t.after(c.restore);
  const s = walledIn('skywars');
  await towardGoal(s);
  assert.ok(s.position.x < 1, 'the wall stops it');
  assert.equal(s.getVoxel(1, 31, 0), BLOCKS.STONE);
  c.pass(4000); await towardGoal(s);
  assert.equal(s.getVoxel(1, 31, 0), BLOCKS.STONE, 'not yet: 4 s is not stuck');
  c.pass(5000); await towardGoal(s);
  assert.equal(s.getVoxel(1, 31, 0), BLOCKS.AIR, 'dug at feet height');
  assert.equal(s.getVoxel(1, 32, 0), BLOCKS.AIR, 'and at head height');
  for (let i = 0; i < 6 && s.position.x < 5; i++) await towardGoal(s);
  assert.ok(s.position.x > 5, `through, and on to its goal (x ${s.position.x.toFixed(2)})`);
});

test('Bed Wars: walled in (the map cannot be broken there), a stuck bot with blocks towers up over the wall', async (t) => {
  const c = clock(); t.after(c.restore);
  const s = walledIn('bedwars', { wallHeight: 3, blocks: 16 });
  await towardGoal(s);
  c.pass(9000); await towardGoal(s);
  assert.equal(s.getVoxel(1, 31, 0), BLOCKS.STONE, 'the map is not dug');
  assert.ok(s.position.y >= 34, `up on its own blocks, over the wall (y ${s.position.y})`);
  assert.notEqual(s.getVoxel(0, 31, 0), BLOCKS.AIR, 'a block placed under it');
  assert.ok(s.inventory.countPlaceableBlocks() <= 13, 'its own blocks used');
});

test('with no blocks and the void in the way, a stuck bot says it cannot get there instead of walking on the spot', async (t) => {
  const c = clock(); t.after(c.restore);
  const s = walledIn('bedwars', { wallHeight: 0 });
  for (let z = -1; z <= 1; z++) for (const x of [1, 2, 3]) s.setVoxel(x, 30, z, BLOCKS.AIR); // a gap of void
  await towardGoal(s);
  c.pass(9000);
  const r = await towardGoal(s);
  assert.equal(r.ok, false);
  assert.equal(r.stuck, true);
  assert.match(r.reason, /void/);
});

test('a bot without the escape (an MCP agent, an arena match) never digs the map on its own', async (t) => {
  const c = clock(); t.after(c.restore);
  const s = walledIn('skywars', { escape: false });
  await towardGoal(s);
  c.pass(20000); await towardGoal(s); await towardGoal(s);
  assert.equal(s.getVoxel(1, 31, 0), BLOCKS.STONE);
});

test('a mini-game is stepped by a timer only while its page is hidden and its frames have stopped', () => {
  let now = 0, hidden = false, last = 0;
  const steps = [];
  const t = keepTicking((dt) => { steps.push(+dt.toFixed(2)); last = now; }, () => last, { now: () => now, hidden: () => hidden, useWorker: false, intervalMs: 60000 });
  try {
    now = 1000; t.tick();
    assert.deepEqual(steps, [], 'a visible page runs on its frames');
    hidden = true; last = 990; t.tick();
    assert.deepEqual(steps, [], 'frames still coming (10 ms ago)');
    now = 1500; t.tick();
    assert.deepEqual(steps, [0.25], 'hidden, frames stopped: stepped, by at most 0.25 s');
    now = 1700; t.tick();
    assert.deepEqual(steps, [0.25]);
    now = 1900; t.tick();
    assert.deepEqual(steps, [0.25, 0.25]);
    t.stop(); now = 5000; t.tick();
    assert.equal(steps.length, 2, 'stopped');
  } finally { t.stop(); }
});
