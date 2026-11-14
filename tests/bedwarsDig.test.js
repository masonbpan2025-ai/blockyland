// Digging in Bed Wars takes Java's time (packages/blockyland-mcp/guestPeer.js breakMs, breakBlockAt): the bot client
// used to break any block at once, so a bed's wool or end stone cover cost a rusher nothing. Now each call of
// breakBlockAt digs on, one block at a time, and the block breaks once its time is done; a pause starts it over. The
// Bed Wars referee drops a block change the bot's own code sends past the client.
// Expected times: the Minecraft Wiki's breaking-time tables (Java Edition), not the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GuestPeerSession, buildBedWarsArenaLayout, BLOCKS } from '../packages/blockyland-mcp/guestPeer.js';
import { breakMs } from '../packages/blockyland-mcp/guestPeer.js';
import { normalizeMap, publishedPlan, buildArena } from '../src/mods/bedwars/arena.js';
import { createSkills } from '../agentArena/skills/skills.mjs';
import { bedwarsReferee } from '../agentArena/referee.mjs';

const eff = (level) => [{ id: 'efficiency', level }];

test("Java's breaking times for the Bed Wars blocks", () => {
  assert.equal(breakMs('red_wool', null), 1200, 'wool by hand');
  assert.equal(breakMs('red_wool', { id: 'shears' }), 250, 'wool with shears');
  assert.equal(breakMs('end_stone', null), 15000, 'end stone by hand');
  assert.equal(breakMs('end_stone', { id: 'wooden_pickaxe', enchantments: eff(1) }), 1150, "end stone, the shop's wooden pickaxe (Efficiency I)");
  assert.equal(breakMs('obsidian', { id: 'diamond_pickaxe', enchantments: eff(3) }), 4200, 'obsidian, diamond pickaxe Efficiency III');
  assert.equal(breakMs('oak_planks', null), 3000, 'planks by hand');
  assert.equal(breakMs('red_terracotta', null), 6250, 'terracotta by hand');
  assert.equal(breakMs('glass', null), 450, 'glass');
  assert.equal(breakMs('bed', null), 300, 'a bed');
  // Haste II (Maniac Miner II): 1.4 times as fast; off the ground: 5 times as slow.
  assert.equal(breakMs('red_wool', null, { haste: 2 }), 900);
  assert.equal(breakMs('red_wool', null, { onGround: false }), 6000);
});

function redSession() {
  let now = 1_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  const s = new GuestPeerSession({ code: '0000', url: 'ws://127.0.0.1:1/ws/share', autopilot: false });
  s.clientId = 'b1';
  s.gameMode = 'bedwars';
  const map = normalizeMap({ teams: 5, layout: 'compact', seed: 1 });
  s.bedwarsArena = buildBedWarsArenaLayout(map, publishedPlan(map));
  s.bedwarsState = { phase: 'playing', mode: 'fives', map, players: [{ id: 'b1', name: 'Blue1', team: 'blue', alive: true }], teams: [{ id: 'blue', bed: true, upgrades: {}, traps: [] }, { id: 'red', bed: true, upgrades: {}, traps: [] }] };
  for (const [k, id] of buildArena(map).blocks) { const [x, y, z] = k.split(',').map(Number); s.setVoxel(x, y, z, id); }
  const sent = [];
  s.sendPacket = (m) => { sent.push(m); return true; };
  s.inventory.clearCarried?.();
  return { s, sent, red: s.bedwarsArena.bases.find((b) => b.team === 'red'), tick: (ms) => { now += ms; }, done: () => { Date.now = realNow; } };
}

test('a block breaks only when its time is dug, without a long pause, one block at a time', () => {
  const { s, sent, red, tick, done } = redSession();
  try {
    const [fx, fy, fz] = red.bed.foot;
    s.position = { x: fx + 3.5, y: fy, z: fz + 0.5 };
    const at = [fx + 2, fy + 1, fz];
    s.setVoxel(...at, BLOCKS.RED_WOOL);
    const r0 = s.breakBlockAt(...at);
    assert.equal(r0.ok, false); assert.equal(r0.digging, true);
    for (let t = 0; t < 1100; t += 275) { tick(275); assert.equal(s.breakBlockAt(...at).ok, false, `at ${t + 275} ms`); }
    tick(100);
    assert.equal(s.breakBlockAt(...at).ok, true, 'wool by hand: 1.2 s');
    assert.equal(s.getVoxel(...at), BLOCKS.AIR);
    assert.equal(sent.filter((m) => m.t === 'block_update' && m.blockId === BLOCKS.AIR).length, 1);
    // A pause of 2 s starts it over; digging another block in between does too.
    s.setVoxel(...at, BLOCKS.RED_WOOL);
    const other = [fx + 2, fy + 2, fz];
    s.setVoxel(...other, BLOCKS.RED_WOOL);
    s.breakBlockAt(...at); tick(900); s.breakBlockAt(...at);
    tick(2000); s.breakBlockAt(...at); tick(400);
    assert.equal(s.breakBlockAt(...at).ok, false, 'started over after the pause');
    s.breakBlockAt(...other); tick(900); s.breakBlockAt(...at); tick(400);
    assert.equal(s.breakBlockAt(...at).ok, false, 'started over after another block');
    // Out of reach: refused.
    s.position = { x: fx + 9.5, y: fy, z: fz + 0.5 };
    assert.match(s.breakBlockAt(...at).reason, /reach/);
  } finally { done(); }
}, { concurrency: false });

test("a bed: through an open face in 0.3 s; covered all round, skills.breakBed digs the cover first, holding to one block", () => {
  const { s, red, tick, done } = redSession();
  try {
    const [fx, fy, fz] = red.bed.foot, [hx, hy, hz] = red.bed.head;
    const dx = Math.sign(hx - fx), dz = Math.sign(hz - fz);
    // Stand off the foot's open end, a block away.
    s.position = { x: fx - dx * 2 + 0.5, y: fy, z: fz - dz * 2 + 0.5 };
    // Cover only the top: the sides are open, so the bed itself is dug.
    s.setVoxel(fx, fy + 1, fz, BLOCKS.END_STONE); s.setVoxel(hx, hy + 1, hz, BLOCKS.END_STONE);
    const skills = createSkills(s);
    assert.equal(skills.breakBed([fx, fy, fz]).digging, true);
    tick(330);
    assert.equal(skills.breakBed([fx, fy, fz]).brokeBed, 'red', 'a bed: 0.3 s');
  } finally { done(); }

  const again = redSession();
  try {
    const { s, red, tick } = again;
    const [fx, fy, fz] = red.bed.foot, [hx, hy, hz] = red.bed.head;
    const dx = Math.sign(hx - fx), dz = Math.sign(hz - fz);
    s.position = { x: fx - dx * 2 + 0.5, y: fy, z: fz - dz * 2 + 0.5 };
    // Wool all round: every face of both halves.
    for (const [x, y, z] of [[fx, fy, fz], [hx, hy, hz]]) for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      const c = [x + ox, y + oy, z + oz];
      if (!(c[0] === fx && c[1] === fy && c[2] === fz) && !(c[0] === hx && c[1] === hy && c[2] === hz)) s.setVoxel(...c, BLOCKS.RED_WOOL);
    }
    const skills = createSkills(s);
    let r = skills.breakBed([fx, fy, fz]);
    assert.equal(r.ok, false); assert.equal(r.digging, true, 'digging a cover');
    let t = 0;
    for (; t < 5000 && !r.brokeBed; t += 300) { tick(300); r = skills.breakBed([fx, fy, fz]); }
    assert.equal(r.brokeBed, 'red');
    // One wool (1.2 s by hand) and the bed (0.3 s), dug a tick (300 ms here) at a time: about 2 s, never at once.
    assert.ok(t >= 1500 && t <= 2400, `took ${t} ms`);
  } finally { again.done(); }
});

test('the referee drops a block change sent past the game client', () => {
  const { s, sent, red, done } = redSession();
  try {
    const violations = [];
    bedwarsReferee('Blue1', violations)(s);
    const [fx, fy, fz] = red.bed.foot;
    s.sendPacket({ t: 'block_update', x: fx, y: fy + 1, z: fz, blockId: BLOCKS.AIR });
    s.sendPacket({ t: 'game', data: { type: 'bed', team: 'red' } });
    assert.equal(sent.filter((m) => m.t === 'block_update' || m.data?.type === 'bed').length, 0);
    assert.equal(violations.filter((v) => v.kind === 'block' && v.dropped).length, 2);
  } finally { done(); }
});
