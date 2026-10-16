// Sculk sensors as redstone (src/sculkSensor.js, wired into redstone.js). Found by the wiki-tutorial play-test (Sculk
// redstone): a sensor gave no redstone signal at all. Every number is the wiki's (Sculk Sensor, Vibration).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS as B } from '../src/blocks.js';
import { Redstone } from '../src/redstone.js';
import { sensorStrength, VIBRATION } from '../src/sculkSensor.js';

function rig() {
  const voxels = new Map();
  const world = { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? B.AIR, getChunk: () => ({}), light: null };
  const engine = new Redstone(world);
  world.set = (x, y, z, id) => { voxels.set(`${x},${y},${z}`, id); engine.notify(x, y, z); };
  world.setVoxel = world.set; // pistons move blocks through it
  const ticks = (n) => { for (let i = 0; i < n; i++) engine.tick([]); };
  return { world, engine, ticks };
}

test('"redstone_strength = max(1, 15 - floor(15 / detection_range * distance))"', () => {
  assert.equal(sensorStrength(0), 15); assert.equal(sensorStrength(1), 14); assert.equal(sensorStrength(4), 8); assert.equal(sensorStrength(8), 1);
  assert.equal(VIBRATION.step, 1); assert.equal(VIBRATION.block_place, 13); assert.equal(VIBRATION.block_destroy, 12); assert.equal(VIBRATION.entity_die, 15);
});

test('a vibration travels a block per game tick, the sensor stays on 30 game ticks, then cools down 10', () => {
  const { world, engine, ticks } = rig();
  world.set(0, 5, 0, B.SCULK_SENSOR); ticks(6); // past the placement cooldown
  const s = engine.state([0, 5, 0]);
  assert.equal(engine.vibrate(4, 5, 0, 'block_place'), 1);
  ticks(1); assert.equal(s.output, 0, '4 blocks away: still travelling after 2 game ticks');
  ticks(1); assert.equal(s.output, 15 - Math.floor(15 / 8 * 4), 'arrived after 4 game ticks');
  assert.equal(engine.getContainerSignal([0, 5, 0]), 13, 'a comparator reads the frequency');
  assert.equal(engine.vibrate(1, 5, 0, 'step'), 0, '"cannot detect any other vibrations while activated"');
  ticks(15); assert.equal(s.output, 0, 'off after 30 game ticks');
  assert.equal(engine.vibrate(1, 5, 0, 'step'), 0, 'cooldown');
  ticks(5); assert.equal(engine.vibrate(1, 5, 0, 'step'), 1, 'listening again');
});

test('8-block sphere, wool occlusion, sneaking steps, and amethyst resonance', () => {
  const { world, engine, ticks } = rig();
  world.set(0, 5, 0, B.SCULK_SENSOR); ticks(6);
  assert.equal(engine.vibrate(6, 5, 6, 'step'), 0, '8.5 blocks away is out of range');
  assert.equal(engine.vibrate(3, 5, 0, 'step', { sneaking: true }), 0, 'a sneaking step is silent');
  world.set(2, 5, 0, B.WHITE_WOOL); ticks(1);
  // Placing the wool itself is not heard; nor is anything behind it.
  assert.equal(engine.vibrate(3, 5, 0, 'block_place'), 0, 'occluded by wool');
  // Resonance: a second sensor 10 blocks away hears the amethyst next to the first.
  world.set(0, 5, 0, B.AIR); world.set(2, 5, 0, B.AIR);
  world.set(0, 5, 0, B.SCULK_SENSOR); world.set(1, 5, 0, B.AMETHYST_BLOCK); world.set(9, 5, 0, B.SCULK_SENSOR); ticks(6);
  engine.vibrate(-1, 5, 0, 'block_place'); // 1 block from the first sensor, 10 from the second
  ticks(8);
  assert.ok(engine.state([9, 5, 0]).output > 0, 'the second sensor fires from the amethyst re-emitting');
  assert.equal(engine.state([9, 5, 0]).frequency, 13, 'at the same frequency');
});

test('it powers dust beside it and strongly powers only the block below', () => {
  const { world, engine, ticks } = rig();
  world.set(0, 5, 0, B.SCULK_SENSOR); world.set(1, 5, 0, B.REDSTONE_WIRE); world.set(0, 4, 0, B.STONE); ticks(6);
  engine.vibrate(0, 6, 0, 'block_place'); ticks(2);
  assert.equal(engine.state([1, 5, 0]).power, 14, 'the dust beside it carries the signal');
  assert.equal(engine.strongOutput(engine.state([0, 5, 0]), [0, 4, 0]), 14);
  assert.equal(engine.strongOutput(engine.state([0, 5, 0]), [1, 5, 0]), 0);
});

test('Daylight detector (Java): 15 at noon, 0 from 13,670 to 22,330 in clear weather, inverted 15 minus the internal sky light', async () => {
  const { daylightDetectorPower } = await import('../src/redstoneComponents.js');
  const { javaSkyDarken } = await import('../src/redstoneComponents.js');
  const at = (t, inverted = false) => daylightDetectorPower({ skyLight: 15, dayTime: t, inverted });
  assert.equal(at(6000), 15);
  assert.equal(at(13219), 1, '"1: 13,219-13,669" going down'); assert.equal(at(13669), 1); assert.equal(at(13218) > 1, true);
  for (const t of [13700, 18000, 22300]) assert.equal(at(t), 0, `night ${t}`);
  assert.equal(at(22331), 1, '"1: 22,331-22,781"'); assert.equal(at(22781), 1); assert.ok(at(22782) > 1);
  assert.equal(at(18000, true), javaSkyDarken(18000), 'inverted at midnight: 15 minus the internal sky light (11)');
  assert.equal(javaSkyDarken(18000), 11); assert.equal(javaSkyDarken(6000), 0);
  assert.equal(at(6000, true), 0);
});

test('Lectern: a 15-page book on page 7 gives a comparator 7; turning a page pulses; one page gives 15', async () => {
  const { lecternSignal, useLectern } = await import('../src/lectern.js');
  const { world, engine, ticks } = rig();
  world.set(0, 5, 0, B.LECTERN); ticks(1);
  const s = engine.state([0, 5, 0]);
  const book = { id: 'writable_book', count: 1, itemData: { pages: Array.from({ length: 15 }, (_, i) => `page ${i + 1}`) } };
  assert.equal(useLectern(engine, s, false, book), 'Book placed on the lectern');
  assert.equal(book.count, 0);
  assert.equal(engine.getContainerSignal([0, 5, 0]), 1, 'page 1 gives 1');
  for (let i = 0; i < 6; i++) useLectern(engine, s, false, null);
  assert.equal(s.book.page, 7); assert.equal(lecternSignal(s), 7, '"page #7 makes it output power level 7"');
  assert.equal(s.output, 15, 'the page turn is a full-strength pulse'); ticks(1); assert.equal(s.output, 0, 'two game ticks long');
  assert.equal(lecternSignal({ book: { pages: 1, page: 1 } }), 15);
  assert.equal(lecternSignal({ book: { pages: 2, page: 1 } }), 1); assert.equal(lecternSignal({ book: { pages: 2, page: 2 } }), 15);
});

test('String: breaking a tripwire activates its hooks for 5 redstone ticks, unless shears cut it', () => {
  const { world, engine, ticks } = rig();
  world.set(0, 5, 0, B.TRIPWIRE_HOOK); engine.configure([0, 5, 0], 4);
  for (let z = 1; z <= 3; z++) world.set(0, 5, z, B.TRIPWIRE);
  world.set(0, 5, 4, B.TRIPWIRE_HOOK); engine.configure([0, 5, 4], 5);
  ticks(2);
  const hook = engine.state([0, 5, 0]);
  assert.equal(hook.output, 0);
  world.set(0, 5, 2, B.AIR); ticks(1);
  assert.equal(hook.output, 15, 'broken by hand: the hook fires');
  ticks(5); assert.equal(hook.output, 0, 'for 5 redstone ticks');
  engine.shearing = true; world.set(0, 5, 1, B.AIR); engine.shearing = false; ticks(1);
  assert.equal(hook.output, 0, 'sheared: no signal');
});

test('a sculk sensor alone, or a shrieker a player placed, never warns or summons a warden', async () => {
  const { DeepDarkWardenManager } = await import('../src/deepDarkWarden.js');
  const THREE = await import('three');
  const voxels = new Map(); const world = { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? B.AIR, structureOrientations: new Map() };
  const player = { applyStatusEffect() {}, position: new THREE.Vector3(0, 5, 0) };
  const m = new DeepDarkWardenManager({ spawnWarden: () => ({ mesh: null }), spawnParticleBurst() {} }, world, null, null);
  voxels.set('2,5,2', B.SCULK_SENSOR);
  for (let i = 0; i < 5; i++) { m.shriekCooldown = 0; m.onPlayerVibration(player.position, 1, player); }
  assert.equal(m.warningLevel, 0, 'a sensor is not a shrieker');
  voxels.set('3,5,3', B.SCULK_SHRIEKER); world.structureOrientations.set('3,5,3', { playerPlaced: true });
  for (let i = 0; i < 5; i++) { m.shriekCooldown = 0; m.onPlayerVibration(player.position, 1, player); }
  assert.equal(m.warningLevel, 0, 'a placed shrieker cannot summon');
  world.structureOrientations.delete('3,5,3');
  m.shriekCooldown = 0; m.onPlayerVibration(player.position, 1, player);
  assert.equal(m.warningLevel, 1, 'a natural one warns');
});

test('a dropper dispenses from a random filled slot; an item presses a wooden plate but not a stone one', () => {
  const { world, engine, ticks } = rig();
  const kinds = new Set();
  engine.game = { player: null, entities: { spawnDroppedItem: (p, id) => kinds.add(id) } };
  world.set(0, 5, 0, B.DROPPER); ticks(1);
  const s = engine.state([0, 5, 0]);
  for (let i = 0; i < 30; i++) { s.inventory = [{ id: 'stick', count: 1 }, { id: 'bone', count: 1 }, { id: 'string', count: 1 }]; engine.dispense(s); }
  assert.ok(kinds.size >= 2, [...kinds].join());
  world.set(3, 5, 0, B.OAK_PRESSURE_PLATE); world.set(5, 5, 0, B.STONE_PRESSURE_PLATE ?? B.PRESSURE_PLATE);
  const item = (x) => ({ position: { x: x + 0.5, y: 5.05, z: 0.5 }, isItem: true });
  engine.tick([item(3), item(5)]);
  assert.equal(engine.state([3, 5, 0]).output, 15); assert.equal(engine.state([5, 5, 0]).output, 0);
});

// Tutorial:Zero-ticking: "All 0-tick pulses are created by powering a redstone line then removing the power source with
// pistons later in the tick"; a sticky piston given one "instantly drop[s] their block and start[s] retracting".
test('zero-tick: a piston that removes the line\'s power in the same tick makes a sticky piston spit its block', () => {
  const { world, engine, ticks } = rig();
  for (let x = -1; x <= 4; x++) for (let z = -2; z <= 6; z++) world.set(x, 4, z, B.STONE);
  world.set(0, 5, 0, B.LEVER); engine.attach([0, 5, 0], { x: 0, y: 1, z: 0 });
  world.set(1, 5, 0, B.REPEATER); engine.configure([1, 5, 0], 0); // facing east
  world.set(2, 5, 0, B.STONE);                                     // the powered block X
  world.set(2, 4, 0, B.STICKY_PISTON); engine.configure([2, 4, 0], 2); // A: under X, pushes it up
  world.set(2, 5, 1, B.REDSTONE_WIRE); world.set(2, 5, 2, B.REDSTONE_WIRE);
  world.set(2, 5, 3, B.STICKY_PISTON); engine.configure([2, 5, 3], 4);  // P: facing south
  world.set(2, 5, 4, B.COBBLESTONE);
  ticks(3);
  engine.interact([0, 5, 0]);
  let seen = null;
  for (let i = 0; i < 6 && !seen; i++) { ticks(1); if (world.getVoxel(2, 5, 5) === B.COBBLESTONE) seen = { p: engine.state([2, 5, 3]) }; }
  assert.ok(seen, 'the block was pushed');
  assert.equal(seen.p.extended, false, 'and the piston is already back: it dropped the block in the same tick');
  assert.equal(world.getVoxel(2, 5, 4), B.AIR);
  assert.equal(seen.p.zeroTicked, true);
});
