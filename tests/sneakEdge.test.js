// Sneaking at an edge, as Java does it: the player stops only once the whole 0.6-wide box would be over air, so they
// lean 0.3 blocks out and can see, and click, the side of the block they stand on. That is how a bridge is built
// (Tutorial:SkyWars: "bridge to the middle"). With the centre alone checked, a sneaking player stopped with their eyes
// above the edge block and could not place a block beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';

/** A Player on a one-block-wide strip of stone at y 30 running along x = 0, for z <= 0. */
function onStrip() {
  const p = Object.create(Player.prototype);
  p.width = 0.6;
  p.position = { x: 0.5, y: 31, z: 0 };
  p.world = { getVoxel: (x, y, z) => (x === 0 && y === 30 && z <= 0 ? 1 : 0) };
  return p;
}

test('a sneaking player leans out until the box, not the centre, leaves the edge', () => {
  const p = onStrip();
  // The edge is the plane z = 1. The centre may go up to 0.3 past it.
  assert.equal(p.hasGroundAhead(0.5, 0.9), true, 'centre over the block');
  assert.equal(p.hasGroundAhead(0.5, 1.2), true, 'centre 0.2 over air: the box still touches the block');
  assert.equal(p.hasGroundAhead(0.5, 1.29), true);
  assert.equal(p.hasGroundAhead(0.5, 1.31), false, 'the whole box over air');
  // Sideways off the strip, the same 0.3.
  assert.equal(p.hasGroundAhead(1.25, 0.5), true);
  assert.equal(p.hasGroundAhead(1.35, 0.5), false);
  assert.equal(p.hasGroundAhead(-0.25, 0.5), true);
  assert.equal(p.hasGroundAhead(-0.35, 0.5), false);
});
