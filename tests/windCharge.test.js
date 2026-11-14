// The wind charge (src/windCharge.js) against the Minecraft Wiki's "Wind Charge", "Explosion" and "Blast Protection"
// pages. Expected values are the wiki's, or worked by hand from its formula:
//   magnitude = (1 - distance / (2 x power)) x exposure x knockback multiplier x (1 - explosion knockback resistance)
// with power 1.2 (the wiki's "2.4-block sphere") and the player-thrown multiplier 1.22.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WIND_CHARGE, burstImpulse, exposure, blastProtectionResistance, windBurstBlocks, WindChargeSystem, stopsWindCharge } from '../src/windCharge.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { EXTRA_RECIPES } from '../src/extraRecipes.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
/** A world of voxels in a map, with an optional floor at y 30 (standing at 31). */
function world(floor = true) {
  const v = new Map();
  const w = { getVoxel: (x, y, z) => v.get(`${x},${y},${z}`) ?? BLOCKS.AIR, setVoxel: (x, y, z, id) => v.set(`${x},${y},${z}`, id) };
  if (floor) for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) w.setVoxel(x, 30, z, BLOCKS.STONE);
  return w;
}
function player(at = { x: 0.5, y: 31, z: 0.5 }) {
  return {
    position: new THREE.Vector3(at.x, at.y, at.z), velocity: new THREE.Vector3(), onGround: true, eyeHeight: 1.62, height: 1.8,
    gamemode: 'survival', fallDistance: 0, hurt: [], takeDamage(n, from, type) { this.hurt.push({ n, type }); },
  };
}
function inventory(stack = { id: 'wind_charge', isBlock: false, count: 16 }) {
  return { active: stack, armor: {}, getActiveItem() { return this.active?.count > 0 ? this.active : null; }, consumeActiveItem(n = 1) { this.active.count -= n; } };
}

test('the item: wind charges stack to 64, and a breeze rod crafts into four', () => {
  assert.equal(WIND_CHARGE.stackSize, 64);
  assert.ok(EXTRA_ITEMS.wind_charge, 'an item');
  const r = EXTRA_RECIPES.find((x) => x.result?.id === 'wind_charge');
  assert.deepEqual(r.ingredients, ['breeze_rod']);
  assert.equal(r.result.count, 4);
});

test('the burst\'s reach: 2.4 blocks (2 x power 1.2); one block further out, nothing', () => {
  const center = { x: 0, y: 31, z: 0 };
  assert.ok(burstImpulse({ center, feet: { x: 2.39, y: 31, z: 0 } }));
  assert.equal(burstImpulse({ center, feet: { x: 2.41, y: 31, z: 0 } }), null);
});

test('the push: at the feet 1.22 blocks a tick straight up; 1.2 away, half that, toward the eyes', () => {
  const center = { x: 0, y: 31, z: 0 };
  const at = burstImpulse({ center, feet: { x: 0, y: 31, z: 0 } });
  close(at.magnitude, 1.22);
  close(at.x, 0); close(at.z, 0); close(at.y, 1.22);
  const off = burstImpulse({ center, feet: { x: 1.2, y: 31, z: 0 } });
  close(off.magnitude, (1 - 1.2 / 2.4) * 1.22); // 0.61
  // Along the line from the centre to the eyes (1.2 across, 1.62 up): its parts in that proportion.
  close(off.y / off.x, 1.62 / 1.2);
});

test('the self-launch: a charge at one\'s own feet throws a player about 8 blocks up (the "Who Needs Rockets?" 8)', () => {
  // Java's player physics a tick: move, then (v - 0.08) x 0.98 (Explosion's 1.22 at the feet).
  let v = burstImpulse({ center: { x: 0, y: 31, z: 0 }, feet: { x: 0, y: 31, z: 0 } }).y, y = 0, peak = 0;
  for (let t = 0; t < 60; t++) { y += v; v = (v - 0.08) * 0.98; peak = Math.max(peak, y); }
  assert.ok(peak >= 8 && peak < 9, `peak ${peak.toFixed(2)}`);
});

test('exposure: open air 1; a wall between the burst and the player stops every ray (0); half hidden, about half', () => {
  const w = world();
  close(exposure(w, { x: 0.5, y: 31.2, z: 0.5 }, { x: 2.5, y: 31, z: 0.5, width: 0.6, height: 1.8 }), 1);
  for (let y = 31; y <= 33; y++) for (let z = -2; z <= 3; z++) w.setVoxel(1, y, z, BLOCKS.STONE);
  close(exposure(w, { x: 0.5, y: 31.2, z: 0.5 }, { x: 2.5, y: 31, z: 0.5, width: 0.6, height: 1.8 }), 0);
  const h = world();
  for (let y = 31; y <= 33; y++) h.setVoxel(1, y, 0, BLOCKS.STONE); // a pillar hiding the player's near half (z below 1)
  const e = exposure(h, { x: 0.5, y: 31.5, z: 1 }, { x: 2.5, y: 31, z: 1, width: 0.6, height: 1.8 });
  assert.ok(e > 0.2 && e < 0.8, `partly hidden: ${e}`);
});

test('Blast Protection: 15% less explosion knockback a level, summed over every piece of armour', () => {
  const armor = { head: { id: 'iron_helmet', enchantments: [{ id: 'blast_protection', level: 4 }] }, chest: { id: 'iron_chestplate', enchantments: [{ id: 'blast_protection', level: 2 }] } };
  close(blastProtectionResistance(armor), 0.9); // 6 levels x 15%
  close(blastProtectionResistance({ a: { enchantments: [{ id: 'blast_protection', level: 4 }] }, b: { enchantments: [{ id: 'blast_protection', level: 4 }] } }), 1); // capped
  const center = { x: 0, y: 31, z: 0 }, feet = { x: 0, y: 31, z: 0 };
  close(burstImpulse({ center, feet, resistance: 0.9 }).magnitude, 1.22 * 0.1);
});

test('throwing: it flies straight (no gravity) at 1.5 blocks a tick, is used up, and the 0.5 s cooldown holds the next', () => {
  const p = player(), inv = inventory(), sys = new WindChargeSystem({ world: world(false), player: p, inventory: inv }, { random: () => 0.5 });
  p.pitch = 0; p.yaw = 0; // looking along -z, level
  assert.equal(sys.use(), true);
  assert.equal(inv.active.count, 15, 'used up');
  const c = sys.charges[0];
  close(c.velocity.length(), WIND_CHARGE.speed, 1e-6);
  const y0 = c.position.y;
  sys.update(0.5);
  close(c.position.y, y0, 1e-9); // half a second later: the same height
  close(c.position.z, 0.5 - 15, 1e-6); // 30 blocks a second along -z
  // The cooldown: 0.5 s from the throw. At 0.5 s it has just run out (0.5 of the update above).
  assert.equal(sys.cooldownFraction(), 0);
  sys.use(); const second = sys.time;
  assert.equal(inv.active.count, 14);
  sys.update(0.25);
  assert.equal(sys.use(), true, 'still a wind charge in hand');
  assert.equal(inv.active.count, 14, 'but nothing thrown inside the cooldown');
  void second;
});

test('in Creative it is not used up; in a liquid it slows', () => {
  const p = player(); p.gamemode = 'creative'; p.pitch = 0; p.yaw = 0;
  const inv = inventory(), w = world(false), sys = new WindChargeSystem({ world: w, player: p, inventory: inv }, { random: () => 0.5 });
  sys.use();
  assert.equal(inv.active.count, 16);
  for (let z = -40; z <= 0; z++) w.setVoxel(0, 32, z, BLOCKS.WATER);
  sys.update(0.05);
  assert.ok(sys.charges[0].velocity.length() < WIND_CHARGE.speed - 1, `slowed: ${sys.charges[0].velocity.length()}`);
});

test('a direct hit on a mob: 1 damage, and the burst pushes it', () => {
  const mob = { type: 'zombie', health: 20, mesh: { position: new THREE.Vector3(0.5, 31, -5.5) }, velocity: new THREE.Vector3() };
  const damaged = [];
  const mobs = { mobs: [mob], getMobDimensions: () => ({ width: 0.6, height: 1.95 }), damageMob: (m, n) => { damaged.push(n); m.health -= n; } };
  const p = player(); p.pitch = 0; p.yaw = 0;
  const sys = new WindChargeSystem({ world: world(), player: p, inventory: inventory(), mobs }, { random: () => 0.5 });
  sys.use();
  for (let i = 0; i < 20 && sys.charges.length; i++) sys.update(0.05);
  assert.deepEqual(damaged, [1]);
  assert.ok(mob.knockback && mob.knockback.length() > 0, 'pushed');
});

test('the burst pushes but hurts no one nearby; a mob that resists knockback (iron golem) is not moved', () => {
  const zombie = { type: 'zombie', health: 20, mesh: { position: new THREE.Vector3(1.5, 31, 0.5) }, velocity: new THREE.Vector3() };
  const golem = { type: 'iron_golem', health: 100, mesh: { position: new THREE.Vector3(-0.5, 31, 0.5) }, velocity: new THREE.Vector3() };
  const hurt = [];
  const mobs = { mobs: [zombie, golem], getMobDimensions: () => ({ width: 0.6, height: 1.9 }), damageMob: (m) => hurt.push(m.type) };
  const far = player({ x: 30.5, y: 31, z: 0.5 });
  const sys = new WindChargeSystem({ world: world(), player: far, inventory: inventory(), mobs });
  sys.burst(new THREE.Vector3(0.5, 31, 0.5));
  assert.deepEqual(hurt, [], 'no damage from the burst');
  assert.ok(zombie.knockback?.length() > 0);
  assert.ok(!golem.knockback || golem.knockback.length() === 0, 'iron golem not pushed');
});

test('the thrower is pushed too (a rocket jump), and its fall damage then counts only below the burst', () => {
  const p = player(), sys = new WindChargeSystem({ world: world(), player: p, inventory: inventory() });
  sys.burst(new THREE.Vector3(0.5, 31, 0.5), { source: 'player', owner: p });
  close(p.velocity.y, 1.22 * 20, 1e-6); // 1.22 blocks a tick, in blocks a second
  assert.equal(p.pvpKnockbackActive, true, 'moved by Java\'s tick physics');
  assert.equal(p.windChargeFloorY, 31);
  // A Creative player who is flying is not pushed (Explosion).
  const f = player(); f.gamemode = 'creative'; f.isFlying = true;
  new WindChargeSystem({ world: world(), player: f, inventory: inventory() }).burst(new THREE.Vector3(0.5, 31, 0.5));
  close(f.velocity.y, 0);
});

test('the burst acts on blocks: wooden doors and trapdoors flip (iron ones do not), levers flip, buttons are pressed, bells ring, chorus flowers and decorated pots break', () => {
  const w = world();
  const id = (name) => BLOCKS[name];
  w.setVoxel(1, 31, 0, id('OAK_TRAPDOOR'));
  w.setVoxel(-1, 31, 0, id('IRON_TRAPDOOR'));
  w.setVoxel(0, 31, 1, BLOCKS.LEVER);
  w.setVoxel(0, 31, -1, id('STONE_BUTTON'));
  w.setVoxel(1, 31, 1, BLOCKS.BELL);
  w.setVoxel(-1, 31, -1, BLOCKS.CHORUS_FLOWER);
  w.setVoxel(1, 31, -1, BLOCKS.DECORATED_POT);
  const toggled = [], pressed = [], rung = [], dropped = [];
  const out = windBurstBlocks({
    world: w, center: { x: 0.5, y: 31.2, z: 0.5 },
    doors: { toggleTrapdoor: (x, y, z) => { toggled.push(`${x},${y},${z}`); return { success: true }; }, toggleDoor: () => ({ success: true }) },
    redstone: { interact: (p) => pressed.push(p.join(',')) },
    sounds: { playBell: () => rung.push(1) },
    entities: { spawnDroppedItem: (pos, item) => dropped.push(item) },
  });
  assert.deepEqual(toggled, ['1,31,0'], 'the oak trapdoor, not the iron one');
  assert.deepEqual(pressed.sort(), ['0,31,-1', '0,31,1'], 'lever and button');
  assert.equal(rung.length, 1);
  assert.deepEqual(dropped.sort(), [BLOCKS.CHORUS_FLOWER, BLOCKS.DECORATED_POT].sort());
  assert.equal(w.getVoxel(-1, 31, -1), BLOCKS.AIR);
  assert.equal(w.getVoxel(1, 31, -1), BLOCKS.AIR);
  assert.equal(out.flipped.length + out.pressed.length, 3);
});

test('a melee hit deflects it: it flies off along the hitter\'s look', () => {
  const p = player(), sys = new WindChargeSystem({ world: world(false), player: p, inventory: inventory() }, { random: () => 0.5 });
  const c = sys.launch({ origin: new THREE.Vector3(0.5, 32.5, -1.5), direction: new THREE.Vector3(0, 0, 1), owner: null, source: 'dispenser' });
  assert.equal(sys.deflect(new THREE.Vector3(0.5, 32.6, 0.5), new THREE.Vector3(0, 0, -1)), true);
  assert.ok(c.velocity.z < 0, 'now flying away along -z');
  assert.equal(c.owner, p);
});

test('what stops it: solid blocks; not air, water or plants', () => {
  assert.equal(stopsWindCharge(BLOCKS.STONE), true);
  assert.equal(stopsWindCharge(BLOCKS.AIR), false);
  assert.equal(stopsWindCharge(BLOCKS.WATER), false);
  const plant = Object.keys(BLOCKS).find((k) => BLOCK_DEFS[BLOCKS[k]]?.plant);
  assert.equal(stopsWindCharge(BLOCKS[plant]), false);
});

test('the Item Inspector shows every wind charge property, and every step passes', async () => {
  const { windChargeScenarios } = await import('../src/windChargeScenarios.js');
  const { gameplayScenarios } = await import('../src/resourceGameplayScenarios.js');
  const steps = gameplayScenarios({ id: 'wind_charge' });
  assert.ok(steps.length >= 25, `${steps.length} steps`);
  assert.equal(steps.filter((s) => s.id.startsWith('wind-charge-')).length, windChargeScenarios({ id: 'wind_charge' }).length);
  for (const s of steps) assert.equal(s.verify(), true, `${s.id}: ${s.detail}`);
  assert.deepEqual(windChargeScenarios({ id: 'snowball' }), []);
});

test('in the game: after a launch, a landing back at the burst\'s height costs nothing; the same drop without one costs 5', async () => {
  const { Player } = await import('../src/player.js');
  const { Inventory } = await import('../src/inventory.js');
  const drop = (launched) => {
    const sounds = { playHurt() {}, playStep() {}, playShieldBlock() {} };
    const world = { getVoxel: (x, y, z) => (y === 4 ? BLOCKS.STONE : BLOCKS.AIR), setVoxel() {}, redstone: { interact: () => null } };
    const p = new Player(new THREE.PerspectiveCamera(), { requestPointerLock() {} }, world, sounds);
    p.inventory = new Inventory(sounds);
    p.gamemode = 'survival'; p.health = 20; p.invulnerableTimer = 0;
    p.position.set(0.5, 13, 0.5); // 8 blocks above the floor (standing height 5)
    if (launched) p.windChargeFloorY = 5; // the burst was at the floor: a self-launch straight up
    for (let i = 0; i < 80 && !p.onGround; i++) p.update(1 / 20);
    assert.ok(p.onGround, 'landed');
    return { health: p.health, floor: p.windChargeFloorY };
  };
  assert.equal(drop(false).health, 15, 'an 8-block fall: 8 - 3 = 5 damage');
  const after = drop(true);
  assert.equal(after.health, 20);
  assert.equal(after.floor, null, 'the next fall counts in full again');
});

test('in the game: a powered dispenser fires a wind charge and uses one up', async () => {
  const { World, Chunk } = await import('../src/world.js');
  const w = new World();
  for (let x = -1; x < 3; x++) for (let z = -1; z < 2; z++) w.chunks.set(w.chunkKey(x, z), new Chunk(x, z));
  const put = (p, id, dir = 0) => { w.setVoxel(...p, id); w.redstone.configure(p, dir); return w.redstone.state(p); };
  const shots = [];
  w.redstone.game = { player: { position: new THREE.Vector3() }, windCharges: { launch: (o) => shots.push(o) } };
  const d = put([6, 2, 2], BLOCKS.DISPENSER); // facing east
  d.inventory = [{ id: 'wind_charge', isBlock: false, count: 3 }];
  put([5, 2, 2], BLOCKS.LEVER).on = true;
  for (let i = 0; i < 4; i++) w.redstone.tick([]);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].source, 'dispenser');
  assert.ok(shots[0].direction.x > 0.9, 'out of its face');
  assert.equal(d.inventory[0].count, 2);
});
