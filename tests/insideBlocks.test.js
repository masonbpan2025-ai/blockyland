// A player is never inside blocks. In an Agent Arena film (ds-low-vs-max, game 3) a bot fell off the middle island,
// threw an ender pearl up at it from below, and the pearl struck the island's side: the bot was put where the pearl
// touched -- its body in the island's dirt -- and walked on through the island for twelve seconds (movement treats blocks
// it already overlaps as open), hitting its foe from inside the ground. Java puts a pearl's thrower where the pearl
// stopped, outside the face it struck, and pushes a player out of blocks to the closest open space.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyClear, nearestFreeSpot } from '../packages/blockyland-mcp/knockback.js';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';

// The middle island of that game, near where the pearl struck: solid for x <= 6 from y 27 to 29 (grass on top at 30),
// and a ledge one block out (x = 7) at y 27; open air beyond.
const island = (x, y, z) => (x <= 6 && y >= 27 && y <= 30 && Math.abs(z) <= 6) || (x === 7 && y === 27 && Math.abs(z) <= 1);

test("a body is clear only when no solid block is inside its 0.6 x 1.8 box", () => {
  assert.equal(bodyClear({ x: 7.5, y: 28, z: 0.5 }, island), true); // on the ledge, against the wall
  assert.equal(bodyClear({ x: 7.1, y: 28, z: 0.2 }, island), false); // where the pearl put it: 0.2 into the wall
  assert.equal(bodyClear({ x: 4.8, y: 28, z: -3.6 }, island), false); // where it walked to: deep in the island
  assert.equal(bodyClear({ x: 3, y: 31, z: 0 }, island), true); // standing on the grass
});

test('a player put against a wall from the side ends up outside it, not in it', () => {
  const spot = nearestFreeSpot({ x: 7.1, y: 28, z: 0.2 }, island);
  assert.ok(spot && bodyClear(spot, island));
  assert.ok(spot.x >= 7.3 - 1e-9, `outside the wall's face at x 7 (half a body wide): ${spot.x}`);
  assert.ok(Math.abs(spot.y - 28) < 1e-9 && Math.abs(spot.z - 0.2) < 1e-9, 'pushed straight out, the shortest way');
});

test('a player deep inside an island is put in the nearest open space, up on the surface here', () => {
  const at = { x: 4.8, y: 28, z: -3.6 };
  const spot = nearestFreeSpot(at, island);
  assert.ok(spot && bodyClear(spot, island));
  // Two blocks of dirt and grass above; the side wall more than two blocks away: the top (y 31) is the closest space.
  assert.ok(Math.abs(spot.y - 31) < 1e-9, `on top of the grass: ${JSON.stringify(spot)}`);
});

function guestAt(position) {
  const guest = new GuestPeerSession({ code: '0000', url: 'ws://127.0.0.1:1/ws/share', autopilot: false });
  guest.connected = true;
  guest.gamemode = 'survival';
  guest.isSolid = island;
  guest.sendPacket = () => {};
  guest.broadcastState = () => {};
  guest.position = { ...position };
  guest.velocity = { x: 0, y: 0, z: 0 };
  return guest;
}

test('a guest found inside an island is pushed out on its next tick, not left to walk through it', () => {
  const guest = guestAt({ x: 4.8, y: 28, z: -3.6 }); // where the bot in that film walked to, in the dirt
  guest.tick(0.05);
  assert.ok(bodyClear(guest.position, island), `out of the island: ${JSON.stringify(guest.position)}`);
});

test("a guest whose body only brushes a wall is left where it is: the walk lets a body's edge overlap the next column", () => {
  // On the ledge, its centre in the open column x = 7, its body reaching 0.2 into the wall at x < 7: as the walk leaves
  // a player beside any wall, or stepping onto an island's rim.
  const guest = guestAt({ x: 7.1, y: 28, z: 0.2 });
  guest.tick(0.05);
  assert.deepEqual({ x: guest.position.x, z: guest.position.z }, { x: 7.1, z: 0.2 });
});
