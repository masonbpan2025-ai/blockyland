// The Agent Terminal knows where the player is, so the player does not have to say.
//
// The case this was built for: standing inside a house and saying "decorate the house with some paintings". The
// agent has to know the player is indoors, which walls are that room's, where the door, the windows and the
// furniture are, and turn "the house" into that room without being told.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import {
  analyzeEnclosure, compassDirection, describeEntities, facingName, findStructures, formatPerception,
  perceiveSurroundings, relativeBearing
} from '../src/agentPerception.js';
import { hangPaintingsInRoom, wallRuns } from '../src/agentDecor.js';
import { PaintingManager, FACINGS } from '../src/paintings.js';
import { WorldAgent } from '../src/worldAgent.js';
import { AgentSettings } from '../src/agentProviders.js';
import { houseGame, houseWorld } from './helpers/houseWorld.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
};

// --- directions ---------------------------------------------------------------------------------------------

test('directions follow the camera: yaw 0 faces north (-Z), a positive quarter turn faces west', () => {
  assert.equal(facingName(0), 'north');
  assert.equal(facingName(Math.PI / 2), 'west');
  assert.equal(facingName(Math.PI), 'south');
  assert.equal(facingName(-Math.PI / 2), 'east');
  assert.equal(compassDirection(0, -10), 'north');
  assert.equal(compassDirection(10, 10), 'south-east');
  assert.equal(relativeBearing(0, 0, -5), 'ahead');
  assert.equal(relativeBearing(0, 5, 0), 'right', 'facing north, east is on the right');
  assert.equal(relativeBearing(0, 0, 5), 'behind');
  const agent = new WorldAgent({});
  assert.equal(agent.describeFacing(Math.PI / 2), 'west (-X)');
});

// --- rooms --------------------------------------------------------------------------------------------------

test('standing inside the house, the scan finds the room, its walls, door, windows and furniture', () => {
  const room = analyzeEnclosure(houseWorld(), { x: 4.5, y: 11.1, z: 3.5 });
  assert.ok(room, 'the player is indoors');
  assert.equal(room.kind, 'building');
  assert.deepEqual(room.interior, { minX: 1, maxX: 7, minY: 11, maxY: 13, minZ: 1, maxZ: 5 });
  assert.equal(room.floorY, 11);
  assert.equal(room.ceilingHeight, 3);
  assert.equal(room.floorArea, 35);
  assert.equal(room.truncated, false);
  assert.deepEqual(room.doors.map(d => [d.x, d.y, d.z]), [[4, 11, 0]]);
  assert.deepEqual(room.windows.map(w => w.side).sort(), ['east', 'west']);
  assert.deepEqual(room.furniture.map(f => f.block).sort(), ['CHEST', 'RED_BED']);
  assert.deepEqual(room.wallMaterials[0], { block: 'OAK_PLANKS', count: room.wallMaterials[0].count });
  assert.deepEqual(room.floorMaterials.map(m => m.block), ['OAK_PLANKS'], 'the chest is furniture, not floor');
  assert.deepEqual(Object.keys(room.walls).sort(), ['east', 'north', 'south', 'west']);
  assert.equal(room.walls.north.doors, 1);
  assert.equal(room.walls.south.freeEyeLevel, 7);
  assert.equal(room.walls.west.freeEyeLevel, 4, 'the window is not free wall');
});

test('outside, under open sky, there is no room', () => {
  assert.equal(analyzeEnclosure(houseWorld(), { x: 20.5, y: 11.1, z: 20.5 }), null);
});

test('an open doorway is an exit to the sky, not a leak into the whole world', () => {
  const world = houseWorld({ door: false });
  world.setVoxel(4, 11, 0, BLOCKS.AIR);
  world.setVoxel(4, 12, 0, BLOCKS.AIR);
  const room = analyzeEnclosure(world, { x: 4.5, y: 11.1, z: 3.5 });
  assert.ok(room);
  assert.ok(room.openings.length >= 1, 'the doorway leads outside');
  assert.ok(room.interior.minZ >= 0 && room.interior.maxZ <= 5, 'and the room stops at it');
});

test('a hollow in stone is a cave, not a building', () => {
  const world = {
    getVoxel: (x, y, z) => (Math.abs(x) <= 2 && Math.abs(z) <= 2 && y >= 20 && y <= 22 ? BLOCKS.AIR : y < 40 ? BLOCKS.STONE : BLOCKS.AIR)
  };
  const room = analyzeEnclosure(world, { x: 0.5, y: 20.1, z: 0.5 });
  assert.equal(room.kind, 'cave');
});

// --- structures, view and creatures ---------------------------------------------------------------------------

test('the house is a nearby structure the player is inside, and a wall further off is a separate one', () => {
  const world = houseWorld();
  for (let x = 15; x <= 22; x++) world.setVoxel(x, 11, 12, BLOCKS.COBBLESTONE);
  for (let x = 15; x <= 22; x++) world.setVoxel(x, 12, 12, BLOCKS.COBBLESTONE);
  const structures = findStructures(world, { x: 4.5, y: 11, z: 3.5 });
  assert.equal(structures.length, 2);
  assert.equal(structures[0].inside, true);
  assert.equal(structures[0].kind, 'building');
  assert.equal(structures[0].features.doors, 1);
  assert.equal(structures[1].inside, false);
  assert.equal(structures[1].direction, 'south-east');
});

test('trees and terrain are not structures', () => {
  const world = {
    getVoxel: (x, y, z) => (y <= 10 ? BLOCKS.DIRT : x === 3 && z === 3 && y <= 15 ? BLOCKS.OAK_LOG : Math.abs(x - 3) <= 2 && Math.abs(z - 3) <= 2 && y >= 14 && y <= 16 ? BLOCKS.OAK_LEAVES : BLOCKS.AIR)
  };
  assert.deepEqual(findStructures(world, { x: 0, y: 11, z: 0 }), []);
});

test('the view sweep reports what fills the screen, and creatures are placed relative to the player', () => {
  const game = houseGame();
  const snapshot = perceiveSurroundings(game);
  assert.equal(snapshot.view.facing, 'south');
  assert.ok(snapshot.view.regions.some(r => /OAK_PLANKS/.test(r.text)));
  assert.equal(snapshot.lookingAt.target, 'current_room', 'the crosshair is on a wall of this room');

  game.mobs = { mobs: [
    { type: 'cow', health: 10, mesh: { position: { x: 4.5, y: 11, z: 12 } } },
    { type: 'cow', health: 10, mesh: { position: { x: 6.5, y: 11, z: 14 } } },
    { type: 'zombie', health: 20, mesh: { position: { x: 4.5, y: 11, z: -10 } } }
  ] };
  const creatures = describeEntities(game, snapshot.view);
  const cows = creatures.find(c => c.type === 'cow');
  assert.equal(cows.count, 2);
  assert.equal(cows.bearing, 'ahead', 'the player faces south, toward the cows');
  const zombie = creatures.find(c => c.type === 'zombie');
  assert.equal(zombie.hostile, true);
  assert.equal(zombie.bearing, 'behind');
});

test('the prompt section says the player is indoors and lists the ids a plan may target', () => {
  const text = formatPerception(perceiveSurroundings(houseGame()));
  assert.match(text, /INDOORS: the player is inside a building/);
  assert.match(text, /"current_room"/);
  assert.match(text, /north wall \(x 1\.\.7, plane z=0\)/);
  assert.match(text, /Doors: OAK_DOOR at \(4, 11, 0\)/);
  assert.match(text, /Furniture: .*CHEST/);
  assert.match(text, /CROSSHAIR: OAK_PLANKS/);
  assert.match(text, /"nearby_1": building/);
});

// --- decorating -------------------------------------------------------------------------------------------------

function paintedHouse(options = {}) {
  const game = houseGame();
  const room = analyzeEnclosure(game.world, { x: 4.5, y: 11.1, z: 3.5 });
  const manager = new PaintingManager(game, { random: () => 0.4 });
  const result = hangPaintingsInRoom(manager, room, options);
  return { game, room, manager, result };
}

function assertOnPlainWall(game, room, painting) {
  const n = FACINGS[painting.facing];
  for (const c of painting.cells) {
    assert.ok(c.x >= room.interior.minX && c.x <= room.interior.maxX && c.z >= room.interior.minZ && c.z <= room.interior.maxZ, `${painting.variantId} hangs inside the room`);
    assert.equal(game.world.getVoxel(c.x - n.x, c.y, c.z - n.z), BLOCKS.OAK_PLANKS, `${painting.variantId} hangs on plank wall, not glass or the door`);
  }
}

test('decorating the room spreads different paintings over its plain walls', () => {
  const { game, room, result } = paintedHouse();
  assert.ok(result.placed.length >= 4, `expected a handful of paintings, got ${result.placed.length}`);
  for (const p of result.placed) assertOnPlainWall(game, room, p);
  assert.equal(new Set(result.placed.map(p => p.variantId)).size, result.placed.length, 'no picture repeats');
  assert.ok(new Set(result.placed.map(p => p.facing)).size >= 3, 'more than one wall is used');
  for (const p of result.placed) assert.ok(p.height <= 2, 'a 3-high room keeps a gap above each painting');
});

test('a named wall and a count are respected', () => {
  const { game, room, result } = paintedHouse({ sides: ['south'], count: 2 });
  assert.equal(result.placed.length, 2);
  for (const p of result.placed) {
    assert.equal(p.facing, 'north', 'paintings on the south wall face north, into the room');
    assertOnPlainWall(game, room, p);
  }
});

test('small paintings stay small', () => {
  const { result } = paintedHouse({ size: 'small' });
  for (const p of result.placed) assert.ok(p.height === 1 && p.width <= 2);
});

test('wall runs split at windows and doors', () => {
  const room = analyzeEnclosure(houseWorld(), { x: 4.5, y: 11.1, z: 3.5 });
  const west = wallRuns(room, ['west']);
  assert.deepEqual(west.map(r => r.faces.length).sort(), [2, 2]);
  const north = wallRuns(room, ['north']);
  assert.deepEqual(north.map(r => r.faces.length).sort(), [3, 3]);
});

// --- the agent ------------------------------------------------------------------------------------------------

function agentInHouse() {
  const game = houseGame();
  const agent = new WorldAgent(game);
  agent.settings = new AgentSettings(memoryStorage());
  agent.firstTokenTimeoutMs = 2000;
  agent.idleTimeoutMs = 2000;
  agent.reloadSettings();
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  return { agent, game, logs };
}

const chatReply = plan => ({ choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: 'stop' }] });

test('"decorate the house with some paintings" inside a house decorates that house', async t => {
  const { agent, game, logs } = agentInHouse();
  agent.setVendor('deepseek');
  agent.setApiKey('k');
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => chatReply({ action: 'hang_paintings', target: 'current_room', explanation: 'Hanging paintings around this room' }) };
  });
  await agent.executePrompt('decorate the house with some paintings');
  assert.equal(agent.lastError, null, agent.lastError?.message);

  // The model was told where the player is, without the player saying.
  const system = bodies[0].messages[0].content;
  assert.match(system, /INDOORS: the player is inside a building/);
  assert.match(system, /"current_room"/);
  assert.match(system, /RESOLVING WHAT THE PLAYER MEANS/);
  assert.match(system, /hang_paintings/);

  const room = analyzeEnclosure(game.world, { x: 4.5, y: 11.1, z: 3.5 });
  assert.ok(game.paintings.paintings.length >= 4);
  for (const p of game.paintings.paintings) assertOnPlainWall(game, room, p);
  assert.ok(logs.some(l => l.type === 'success' && /Hung \d+ paintings/.test(l.message)));
});

test('an edit aimed at the room the player is in uses the room as its origin', async t => {
  const { agent, game } = agentInHouse();
  agent.setVendor('deepseek');
  agent.setApiKey('k');
  // Origin is the room's minimum corner with walls: (0, 10, 0). A lantern hung from the middle of the ceiling.
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => chatReply({
    action: 'edit', targetBuilding: 'current_room', dimensions: { width: 9, height: 5, depth: 7 },
    operations: [{ type: 'set_voxels', voxels: [{ x: 4, y: 3, z: 3, block: 'LANTERN' }] }]
  }) }));
  await agent.executePrompt('hang a lantern from the ceiling');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.equal(game.world.getVoxel(4, 13, 3), BLOCKS.LANTERN);
  assert.equal(agent.builtStructures.length, 0, 'the house is not recorded as the agent\'s build');
});

test('without an API key the offline terminal still decorates the room', async () => {
  const { agent, game } = agentInHouse();
  await agent.executePrompt('decorate the house with some paintings');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.ok(game.paintings.paintings.length >= 4);
});

test('offline: "hang 2 paintings on the south wall" hangs two there', async () => {
  const { agent, game } = agentInHouse();
  await agent.executePrompt('hang 2 paintings on the south wall');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.equal(game.paintings.paintings.length, 2);
  assert.ok(game.paintings.paintings.every(p => p.facing === 'north'));
});

test('"hang a painting there" puts one where the crosshair is', async () => {
  const { agent, game } = agentInHouse();
  // Facing south at eye level: the crosshair is on the south wall at (4, 12, 6).
  await agent.executePrompt('hang a painting there');
  assert.equal(agent.lastError, null, agent.lastError?.message);
  assert.equal(game.paintings.paintings.length, 1);
  const [p] = game.paintings.paintings;
  assert.equal(p.facing, 'north');
  assert.ok(p.cells.some(c => c.x === 4 && c.y === 12 && c.z === 5));
});

test('asking for paintings outdoors explains that there is no room, and changes nothing', async () => {
  const { agent, game } = agentInHouse();
  game.player.position = { x: 20.5, y: 11, z: 20.5 };
  await agent.executePrompt('decorate with some paintings');
  assert.ok(agent.lastError);
  assert.match(agent.lastError.message, /not inside a room/);
  assert.equal(game.paintings?.paintings.length ?? 0, 0);
});

test('the crosshair face is reported, which it never was', () => {
  const agent = new WorldAgent({ targetBlock: { x: 1, y: 2, z: 3, blockId: BLOCKS.STONE, normal: { x: 0, y: 0, z: -1 } } });
  assert.equal(agent.describeTargetBlock().face, 'north side');
});
