// Bedrock's simple bridging (minecraft.wiki Tutorial:Bridging): facing the void and looking down ahead of the feet places
// the next block beside the one underfoot, so a bridge is built walking forward. SkyWars turns it on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeTarget, BRIDGE_MIN_LOOK_DOWN } from '../src/bedrockBridging.js';
import { createRuntime } from '../src/mods/skywars/index.js';

const EYE = 1.62;
/** A strip of blocks at y 30 along x = 0 for z >= `edge` (the void is toward -z), and anything in `extra`. */
function world(edge = 0, extra = []) {
  const solid = (x, y, z) => (x === 0 && y === 30 && z >= edge) || extra.some(([a, b, c]) => a === x && b === y && c === z);
  return { isSolid: solid, isReplaceable: (x, y, z) => !solid(x, y, z) };
}
/** A player on the strip at (0.5, 31, z), facing -z (this game's yaw 0), looking `down` radians below level. */
function look(z, down, w = world(), extra = {}) {
  const position = { x: 0.5, y: 31, z };
  return bridgeTarget({
    origin: { x: 0.5, y: 31 + EYE, z }, direction: { x: 0, y: -Math.sin(down), z: -Math.cos(down) },
    reach: 5.2, position, yaw: 0, ...w, ...extra,
  });
}

test('facing the void at the edge and looking down: the block goes in front, beside the one underfoot', () => {
  const t = look(0.4, 1.0);
  assert.deepEqual(t, { x: 0, y: 30, z: -1, support: { x: 0, y: 30, z: 0 }, normal: { x: 0, y: 0, z: -1 } });
});

test('walking forward at a fixed view, every step from the middle of the block to the overhang offers the next place', () => {
  for (const down of [0.6, 0.95, 1.15, 1.4]) {
    for (let z = 0.6; z >= -0.29; z -= 0.05) {
      const t = look(z, down);
      assert.ok(t, `down ${down}, z ${z.toFixed(2)}`);
      assert.deepEqual([t.x, t.y, t.z], [0, 30, -1]);
    }
  }
});

test('looking level, or only a little down, offers nothing: the player must look down at the place', () => {
  assert.equal(look(0.4, 0), null);
  assert.equal(look(0.4, BRIDGE_MIN_LOOK_DOWN - 0.1), null);
});

test('the exact place looked at wins: looking down to the side of the strip puts the block there', () => {
  const position = { x: 0.5, y: 31, z: 0.5 };
  // Facing -z, but the look ray drops into the cell at x = 1 beside the block underfoot.
  const t = bridgeTarget({ origin: { x: 0.5, y: 32.62, z: 0.5 }, direction: { x: 0.45, y: -0.85, z: -0.05 }, reach: 5.2, position, yaw: 0, ...world() });
  assert.deepEqual([t.x, t.y, t.z], [1, 30, 0]);
  assert.deepEqual(t.normal, { x: 1, y: 0, z: 0 });
});

test('nothing in the air, and nothing where a block already is', () => {
  assert.equal(look(0.4, 1.0, world(), { onGround: false }), null);
  assert.equal(look(0.4, 1.0, world(0, [[0, 30, -1]])), null);
  // Not standing on anything.
  assert.equal(look(0.4, 1.0, world(5)), null);
});

test('SkyWars bridges the Bedrock way while a match is on, and the rest of the game keeps Java\'s', () => {
  const game = { skywars: { active: true } };
  const runtime = createRuntime(game);
  assert.equal(runtime.bedrockBridging(), true);
  game.skywars.active = false;
  assert.equal(runtime.bedrockBridging(), false);
});
