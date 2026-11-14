// Open fence gates and lit candles (blockStateVariants.js, blockStateActions.js), against the Minecraft Wiki's Fence
// Gate and Candle pages, and what a wind charge's burst does to them (Wind Charge).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { STATE_VARIANT_IDS, LIT_CANDLE_LIGHT } from '../src/blockStateVariants.js';
import { toggleFenceGate, lightCandle, extinguishCandle, isOpenFenceGate, isLitCandle } from '../src/blockStateActions.js';
import { windBurstBlocks } from '../src/windCharge.js';
import { blockParticleSources } from '../src/ambientParticleRules.js';
import { createBlockGeometry } from '../src/blockGeometry.js';
import { Player } from '../src/player.js';

const GATES = Object.keys(BLOCKS).filter((k) => /_FENCE_GATE$/.test(k));
const CANDLES = Object.keys(BLOCKS).filter((k) => /CANDLE(_CAKE)?$/.test(k));

function world() {
  const v = new Map();
  return { getVoxel: (x, y, z) => v.get(`${x},${y},${z}`) ?? BLOCKS.AIR, setVoxel: (x, y, z, id) => v.set(`${x},${y},${z}`, id) };
}

test('every fence gate has an open state, and every candle and candle cake a lit one', () => {
  assert.equal(GATES.length, 13);
  assert.equal(CANDLES.length, 34);
  for (const k of GATES) {
    const open = BLOCKS[`${k}_OPEN`];
    assert.equal(BLOCK_DEFS[BLOCKS[k]].openId, open, k);
    assert.equal(BLOCK_DEFS[open].closedId, BLOCKS[k], k);
  }
  for (const k of CANDLES) assert.equal(BLOCK_DEFS[BLOCK_DEFS[BLOCKS[k]].litId]?.unlitId, BLOCKS[k], k);
});

test('their ids are fixed, unique and never shared: a saved world keeps an open gate an open gate', () => {
  for (const [key, id] of Object.entries(STATE_VARIANT_IDS)) assert.equal(BLOCKS[key], id, key);
  const owners = new Map();
  for (const [key, id] of Object.entries(BLOCKS)) {
    if (!Number.isInteger(id)) continue;
    assert.ok(!owners.has(id) || owners.get(id) === key || BLOCK_DEFS[id] === BLOCK_DEFS[BLOCKS[owners.get(id)]], `${key} and ${owners.get(id)} share ${id}`);
    owners.set(id, key);
  }
  const ids = Object.values(STATE_VARIANT_IDS);
  assert.equal(new Set(ids).size, ids.length);
});

test('a closed gate is a barrier a block and a half high; an open one is "completely non-solid" (Fence Gate)', () => {
  const player = (gate) => {
    const w = { getVoxel: (x, y, z) => (x === 0 && y === 4 && z === 0 ? gate : y === 3 ? BLOCKS.STONE : BLOCKS.AIR), setVoxel() {} };
    return new Player(new THREE.PerspectiveCamera(), { requestPointerLock() {} }, w, { playStep() {}, playHurt() {} });
  };
  const closed = player(BLOCKS.OAK_FENCE_GATE), open = player(BLOCKS.OAK_FENCE_GATE_OPEN);
  // Walking into the gate's block, and standing a quarter block above its top.
  assert.equal(closed.checkCollision(new THREE.Vector3(0.5, 4, 0.5)), true);
  assert.equal(closed.checkCollision(new THREE.Vector3(0.5, 5.25, 0.5)), true, 'the half block above it is solid too');
  assert.equal(open.checkCollision(new THREE.Vector3(0.5, 4, 0.5)), false);
  assert.equal(open.checkCollision(new THREE.Vector3(0.5, 5.25, 0.5)), false);
});

test('using a gate opens it, using it again closes it; breaking an open one gives the gate', () => {
  const w = world();
  w.setVoxel(0, 0, 0, BLOCKS.SPRUCE_FENCE_GATE);
  const creaks = [];
  assert.deepEqual(toggleFenceGate(w, 0, 0, 0, { sounds: { playFenceGate: (o) => creaks.push(o) } }), { open: true });
  assert.equal(isOpenFenceGate(w.getVoxel(0, 0, 0)), true);
  assert.deepEqual(toggleFenceGate(w, 0, 0, 0, { sounds: { playFenceGate: (o) => creaks.push(o) } }), { open: false });
  assert.equal(w.getVoxel(0, 0, 0), BLOCKS.SPRUCE_FENCE_GATE);
  assert.deepEqual(creaks, [true, false]);
  assert.equal(toggleFenceGate(w, 5, 0, 0), null, 'nothing there');
  assert.equal(BLOCK_DEFS[BLOCKS.SPRUCE_FENCE_GATE_OPEN].drop, BLOCKS.SPRUCE_FENCE_GATE);
  assert.equal(BLOCK_DEFS[BLOCKS.SPRUCE_FENCE_GATE_OPEN].internal, true, 'not a separate item in the catalogue');
});

test('an open gate is drawn open: its rails run from the posts, not across the gap', () => {
  const tm = { getFaceUVs: () => ({ u0: 0, u1: 1, v0: 0, v1: 1 }) };
  const span = (id) => { const g = createBlockGeometry(id, tm); g.computeBoundingBox(); return g; };
  // Faces that reach across the middle of the block, from one side's posts to the other's.
  const railsAcross = (g) => {
    const p = g.attributes.position, idx = g.index ? g.index.array : [...Array(p.count).keys()];
    let n = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const xs = [idx[i], idx[i + 1], idx[i + 2]].map((k) => p.getX(k));
      if (Math.min(...xs) < 0.4 && Math.max(...xs) > 0.6) n++;
    }
    return n;
  };
  assert.ok(railsAcross(span(BLOCKS.OAK_FENCE_GATE)) > 0, 'closed: rails cross the middle');
  assert.equal(railsAcross(span(BLOCKS.OAK_FENCE_GATE_OPEN)), 0, 'open: nothing in the middle');
});

test('a candle is lit by use, gives light 3 and flames, and is put out again (Candle)', () => {
  assert.equal(LIT_CANDLE_LIGHT, 3);
  const w = world();
  w.setVoxel(0, 0, 0, BLOCKS.RED_CANDLE);
  assert.equal(BLOCK_DEFS[BLOCKS.RED_CANDLE].light ?? 0, 0, 'unlit: no light');
  assert.deepEqual(blockParticleSources(BLOCKS.RED_CANDLE), []);
  assert.equal(lightCandle(w, 0, 0, 0), true);
  const lit = w.getVoxel(0, 0, 0);
  assert.equal(isLitCandle(lit), true);
  assert.equal(BLOCK_DEFS[lit].light, 3);
  assert.deepEqual(blockParticleSources(lit), ['flame', 'smoke']);
  assert.equal(lightCandle(w, 0, 0, 0), false, 'already lit');
  assert.equal(extinguishCandle(w, 0, 0, 0), true);
  assert.equal(w.getVoxel(0, 0, 0), BLOCKS.RED_CANDLE);
  assert.equal(extinguishCandle(w, 0, 0, 0), false, 'already out');
});

test('a lit candle drops the candle; a lit candle cake drops its candle, as the unlit one does', () => {
  assert.equal(BLOCK_DEFS[BLOCKS.RED_CANDLE_LIT].drop, BLOCKS.RED_CANDLE);
  const cake = BLOCK_DEFS[BLOCKS.RED_CANDLE_CAKE], litCake = BLOCK_DEFS[BLOCKS.RED_CANDLE_CAKE_LIT];
  assert.equal(litCake.dropItem, cake.dropItem);
  assert.equal(litCake.drop, cake.drop);
  assert.equal(litCake.light, 3);
});

test('a wind charge\'s burst flips a closed gate open and an open one shut, and puts out lit candles and candle cakes', () => {
  const w = world();
  w.setVoxel(1, 0, 0, BLOCKS.OAK_FENCE_GATE);
  w.setVoxel(-1, 0, 0, BLOCKS.BIRCH_FENCE_GATE_OPEN);
  w.setVoxel(0, 0, 1, BLOCKS.WHITE_CANDLE_LIT);
  w.setVoxel(0, 0, -1, BLOCKS.CANDLE_CAKE_LIT);
  w.setVoxel(0, 1, 0, BLOCKS.BLUE_CANDLE); // unlit: nothing to put out
  const out = windBurstBlocks({ world: w, center: { x: 0.5, y: 0.2, z: 0.5 } });
  assert.equal(w.getVoxel(1, 0, 0), BLOCKS.OAK_FENCE_GATE_OPEN);
  assert.equal(w.getVoxel(-1, 0, 0), BLOCKS.BIRCH_FENCE_GATE);
  assert.equal(w.getVoxel(0, 0, 1), BLOCKS.WHITE_CANDLE);
  assert.equal(w.getVoxel(0, 0, -1), BLOCKS.CANDLE_CAKE);
  assert.equal(w.getVoxel(0, 1, 0), BLOCKS.BLUE_CANDLE);
  assert.equal(out.flipped.length, 2);
  assert.equal(out.extinguished.length, 2);
});
