// Breeze parity with https://minecraft.wiki/w/Breeze
//
// A new hostile mob with three mechanics nothing else in this codebase has: it LEAPS up to 15 blocks
// instead of walking, it fires WIND CHARGES, and it DEFLECTS every projectile that hits it except
// another wind charge. It is also fall-damage immune and the only source of breeze rods.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { spawnArrow } from '../src/arrows.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  BREEZE_HEALTH, BREEZE_DIMENSIONS, WIND_CHARGE_DAMAGE, BREEZE_JUMP, BREEZE_ATTACK,
  BREEZE_JUMP_COOLDOWN, WIND_CHARGE_SPEED, WIND_CHARGE_BURST, BREEZE_TRAITS,
  BREEZE_NON_RETALIATION, BREEZE_PREFERRED_PREY, BREEZE_ROD_DROP, BREEZE_ALWAYS_VISIBLE,
  BREEZE_COLORS,
  isBreeze, windChargeDamageFor, rollBreezeJumpDelay, breezeJumpVelocity, canBreezeLeap,
  findBreezeTarget, breezeRetaliates, shouldDeflect, deflectVelocity, updateBreezeLeap,
  fireWindCharge, windChargeBurst, breezeDrops, breezeXp, createBreezeModel, poseBreeze
} from '../src/breezeBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal', light = 15 } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => light,
    setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, isBlock, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(20, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities };
}

test('breeze is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  assert.equal(breeze.type, 'breeze');
  assert.equal(breeze.name, 'Breeze');
  assert.notEqual(breeze.type, 'villager');
});

test('the health and hitbox match the wiki', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  assert.equal(BREEZE_HEALTH, 30);
  assert.equal(breeze.maxHealth, 30, 'wiki: 30 HP');
  assert.deepEqual(BREEZE_DIMENSIONS, { width: 0.6, height: 1.77 });
  assert.deepEqual([breeze.width, breeze.height], [0.6, 1.77]);
  assert.deepEqual(manager.getMobDimensions('breeze'), { width: 0.6, height: 1.77 });
});

test('the entity tags match the wiki', () => {
  // Wiki: deflects_arrows, deflects_tridents, fall_damage_immune, can_turn_in_boats,
  // no_anger_from_wind_charge.
  assert.deepEqual(BREEZE_TRAITS, {
    deflectsArrows: true, deflectsTridents: true, fallDamageImmune: true,
    canTurnInBoats: true, noAngerFromWindCharge: true
  });
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  for (const [key, value] of Object.entries(BREEZE_TRAITS)) {
    assert.equal(breeze[key], value, `wiki: ${key}`);
  }
});

test('the wind charge damage table matches the wiki', () => {
  // Wiki: 1 damage on Easy and Normal, 1.5 on Hard.
  assert.deepEqual(WIND_CHARGE_DAMAGE, { peaceful: 0, easy: 1, normal: 1, hard: 1.5 });
  assert.equal(windChargeDamageFor('easy'), 1);
  assert.equal(windChargeDamageFor('normal'), 1);
  assert.equal(windChargeDamageFor('hard'), 1.5);
  assert.equal(windChargeDamageFor('peaceful'), 0);
  assert.equal(windChargeDamageFor('nonsense'), 1, 'an unknown difficulty falls back to Normal');
});

test('the leap rules match the wiki', () => {
  // Wiki: up to 15 blocks horizontally and 5 vertically; only one block up in lava.
  assert.deepEqual(BREEZE_JUMP, {
    horizontal: 15, vertical: 5, lavaVertical: 1, compressSeconds: 0.4
  });
  // Wiki: it attempts a shot at a target within 16 blocks on a 1.6 s cooldown.
  assert.equal(BREEZE_ATTACK.range, 16);
  assert.equal(BREEZE_ATTACK.cooldown, 1.6);
  assert.equal(BREEZE_ROD_DROP.min, 1);
  assert.equal(BREEZE_ROD_DROP.max, 2);
});

test('a leap actually covers the horizontal distance it aims for', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  const gravity = 18;
  // A 10-block leap must travel 10 blocks, not 15 and not 3.
  for (const distance of [4, 10, 15]) {
    const velocity = breezeJumpVelocity(breeze, new THREE.Vector3(distance, 1, 0), { gravity });
    const airtime = (2 * velocity.y) / gravity;
    const travelled = Math.abs(velocity.x) * airtime;
    assert.ok(Math.abs(travelled - distance) < 0.01,
      `a ${distance}-block leap travelled ${travelled.toFixed(2)}`);
    // And the rise stays inside the wiki's cap.
    const rise = (velocity.y * velocity.y) / (2 * gravity);
    assert.ok(rise <= BREEZE_JUMP.vertical + 1e-9, `rise ${rise.toFixed(2)} exceeds the 5-block cap`);
  }
});

test('a leap is capped at 15 blocks horizontally and 5 vertically', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  const gravity = 18;
  // A target 100 blocks away must not produce a 100-block leap.
  const far = breezeJumpVelocity(breeze, new THREE.Vector3(100, 1, 0), { gravity });
  const airtime = (2 * far.y) / gravity;
  assert.ok(Math.abs(far.x) * airtime <= BREEZE_JUMP.horizontal + 0.01,
    'the horizontal distance is capped at 15');
  // A target below does not produce a negative launch.
  const below = breezeJumpVelocity(breeze, new THREE.Vector3(5, -40, 0), { gravity });
  assert.ok(below.y > 0, 'the leap always launches upward');
});

test('in lava a breeze can only jump one block up', () => {
  // Wiki: "If the breeze is in lava, it can jump only one block into the air."
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  const gravity = 18;
  const inLava = breezeJumpVelocity(breeze, new THREE.Vector3(6, 1, 0), { inLava: true, gravity });
  const rise = (inLava.y * inLava.y) / (2 * gravity);
  assert.ok(rise <= BREEZE_JUMP.lavaVertical + 1e-9, `lava rise ${rise.toFixed(2)} should be 1`);
  const normal = breezeJumpVelocity(breeze, new THREE.Vector3(6, 1, 0), { inLava: false, gravity });
  assert.ok(normal.y > inLava.y, 'and a normal leap goes higher');
});

test('the leap cycle compresses, leaps, lands and slides', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  // It spawns standing on the ground, which the leap cycle requires: an undefined `onGround` took the
  // airborne path and skipped the compression entirely.
  assert.equal(breeze.onGround, true, 'a breeze spawns on the ground');
  // A target is supplied throughout: with no target the breeze wanders rather than attack-leaping, so
  // the cycle is only entered with one.
  const target = { position: new THREE.Vector3(10, 1, 0) };
  breeze.jumpCooldown = 0.01;
  assert.equal(breeze.leapState, 'idle', 'it starts idle');
  assert.equal(updateBreezeLeap(manager, breeze, 0.016, target), 'compressing',
    'wiki: it "compresses itself like a spring" before jumping');
  assert.equal(breeze.leapState, 'compressing');
  // The squash is visible while it charges. Asserted part-way through the compression, because the
  // squash is released on the frame it launches.
  updateBreezeLeap(manager, breeze, 0.15, target);
  assert.equal(breeze.leapState, 'compressing', 'still charging');
  // `poseBreeze` is the single owner of `mesh.scale`, so the squash is asserted through it. Two writers
  // used to fight over the scale and the model never visibly compressed.
  poseBreeze(breeze, 0);
  assert.ok(breeze.mesh.scale.y < 1, `the model squashes while charging, got ${breeze.mesh.scale.y}`);
  // Finishing the compression launches it.
  const outcome = updateBreezeLeap(manager, breeze, 0.5, target);
  assert.equal(outcome, 'leaping');
  assert.equal(breeze.leapState, 'leaping');
  assert.equal(breeze.onGround, false);
  poseBreeze(breeze, 0);
  assert.equal(breeze.mesh.scale.y, 1, 'and unsquashes as it leaves');
  assert.ok(breeze.velocity.y > 0, 'with an upward launch');
  // Landing.
  breeze.onGround = true;
  assert.equal(updateBreezeLeap(manager, breeze, 0.016, target), 'landed');
  assert.equal(breeze.leapState, 'sliding', 'wiki: it slides on landing');
  // And the slide ends, returning to idle.
  for (let i = 0; i < 30; i++) updateBreezeLeap(manager, breeze, 0.016, target);
  assert.equal(breeze.leapState, 'idle');
});

test('the jump delay is inside the documented window', () => {
  assert.equal(BREEZE_JUMP_COOLDOWN.min, 1.2);
  assert.equal(BREEZE_JUMP_COOLDOWN.max, 2.6);
  for (const r of [0, 0.5, 0.999]) {
    const d = rollBreezeJumpDelay(() => r);
    assert.ok(d >= 1.2 && d <= 2.6, `roll ${r} gave ${d}`);
  }
  assert.equal(rollBreezeJumpDelay(() => 0), 1.2);
});

test('it targets a player within 16 blocks and pursues iron golems', () => {
  // Wiki: it shoots at a player or enemy within 16 blocks, and "actively pursue[s] and attack[s] iron
  // golems".
  assert.deepEqual(BREEZE_PREFERRED_PREY, ['iron_golem']);
  const { manager, player } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  player.position.set(10, 1, 0);
  assert.equal(findBreezeTarget(manager, breeze, player), player, 'a player in range');

  player.position.set(100, 1, 0);
  assert.equal(findBreezeTarget(manager, breeze, player), null, 'a player out of range');
  player.position.set(10, 1, 0);

  // Wiki: it "actively pursue[s] and attack[s] iron golems", so at an EQUAL distance the golem wins.
  // The golem has to be at least as near as the player for this to mean anything.
  const golem = manager.spawnMob('iron_golem', 10, 1, 0);
  assert.equal(findBreezeTarget(manager, breeze, player), golem, 'wiki: iron golems are pursued');

  // Creative players are not attacked, and neither is anything on Peaceful.
  player.gamemode = 'creative';
  assert.equal(findBreezeTarget(manager, breeze, player), golem, 'the golem is still a target');
  manager.mobs.splice(manager.mobs.indexOf(golem), 1);
  assert.equal(findBreezeTarget(manager, breeze, player), null, 'not a creative player');
  player.gamemode = 'survival';
  assert.equal(findBreezeTarget(manager, breeze, player, { difficulty: 'peaceful' }), null);
});

test('it does not retaliate against the trial-spawner mobs', () => {
  // Wiki: "Breezes do not retaliate if attacked by mobs that can spawn from trial spawners."
  assert.deepEqual(BREEZE_NON_RETALIATION,
    ['zombie', 'husk', 'skeleton', 'bogged', 'stray', 'spider', 'cave_spider', 'slime']);
  for (const type of BREEZE_NON_RETALIATION) {
    assert.equal(breezeRetaliates({ type }), false, `${type} should not provoke retaliation`);
  }
  assert.equal(breezeRetaliates({ type: 'player' }), true, 'a player does');
  assert.equal(breezeRetaliates({ type: 'iron_golem' }), true);
  assert.equal(breezeRetaliates(null), true, 'an unknown source is treated as a provocation');
  assert.equal(breezeRetaliates({ type: 'cow' }), true, 'a passive mob does not get the exemption');
});

test('wind charges are not deflected, and everything else is', () => {
  // Wiki: "deflect all projectiles that hit them except wind charges".
  assert.equal(shouldDeflect({ isWindCharge: true }), false);
  assert.equal(shouldDeflect({ isWindCharge: false }), true);
  assert.equal(shouldDeflect({}), true, 'an arrow has no flag, so it is deflected');
  assert.equal(shouldDeflect(null), false);
});

test('a deflection preserves the speed and reverses it toward the shooter', () => {
  // Wiki: "deflected projectiles maintain the same velocity, and can potentially harm the attacker".
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  const velocity = new THREE.Vector3(-22, 0, 0);
  const projectile = { velocity, mesh: { position: new THREE.Vector3(1, 0.9, 0) } };
  const out = deflectVelocity(projectile, breeze);
  assert.ok(out.x > 0, 'it now travels back the way it came');
  assert.ok(Math.abs(out.length() - velocity.length()) < 1e-6, 'at the same speed');
  // A deflection from directly above still reverses rather than doing nothing.
  const above = deflectVelocity(
    { velocity: new THREE.Vector3(0, -10, 0), mesh: { position: new THREE.Vector3(0, 5, 0) } },
    breeze
  );
  assert.ok(above.y > 0, 'a downward projectile goes back up');
});

test('a real arrow hitting a breeze is deflected and can no longer hit its firer for credit', () => {
  const { manager, player } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  spawnArrow(manager, new THREE.Vector3(3, 1.5, 0), new THREE.Vector3(-1, 0, 0), player, { speed: 22 });
  const arrow = manager.arrows[0];
  assert.ok(arrow, 'the arrow exists');
  assert.equal(arrow.velocity.x < 0, true, 'travelling toward the breeze');

  // Move it inside the breeze's box, then run the deflection pass.
  arrow.mesh.position.set(0.25, breeze.mesh.position.y + 0.9, 0);
  const deflected = manager.deflectBreezeProjectiles();
  assert.equal(deflected, 1, 'one projectile deflected');
  assert.equal(arrow.deflectedByBreeze, true);
  // Wiki: "deflected projectiles maintain the same velocity". The speed is what must be preserved, and
  // the dot product with the original direction must be negative, so it is heading back the way it came.
  assert.ok(Math.abs(arrow.velocity.length() - 22) < 0.5, 'at the same speed');
  assert.ok(arrow.velocity.dot(new THREE.Vector3(-1, 0, 0)) < 0, 'and now travelling away');
  assert.equal(arrow.shooter, null, 'so it is a loose arrow that can strike anyone');
  // It is deflected only once.
  assert.equal(manager.deflectBreezeProjectiles(), 0, 'not deflected again');
});

test('a wind charge is not deflected by a breeze', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  // A wind charge in flight approaching the breeze.
  const charge = {
    isWindCharge: true,
    position: breeze.mesh.position.clone().add(new THREE.Vector3(0.2, 0.9, 0)),
    velocity: new THREE.Vector3(-14, 0, 0),
    age: 0,
    shooter: null,
    mesh: new THREE.Mesh()
  };
  manager.windCharges = [charge];
  const before = charge.velocity.x;
  manager.deflectBreezeProjectiles();
  assert.equal(charge.velocity.x, before, 'a wind charge passes through');
});

test('it fires a wind charge on the wiki cooldown and the burst damages and knocks back', () => {
  const { manager, player } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  player.position.set(8, 1, 0);
  breeze.chargeCooldown = 0;
  const charge = fireWindCharge(manager, breeze, 0.016, player);
  assert.ok(charge, 'a charge was created');
  assert.equal(charge.isWindCharge, true);
  assert.ok(Math.abs(charge.velocity.length() - WIND_CHARGE_SPEED) < 1e-6, 'at the wiki speed');
  assert.equal(breeze.chargeCooldown, BREEZE_ATTACK.cooldown, 'and the cooldown is set');
  // On cooldown it does not fire again.
  assert.equal(fireWindCharge(manager, breeze, 0.016, player), null);
  // Out of range it does not fire.
  breeze.chargeCooldown = 0;
  player.position.set(100, 1, 0);
  assert.equal(fireWindCharge(manager, breeze, 0.016, player), null, 'wiki: within 16 blocks');
});

test('the wind burst knocks back but is not itself the damage', () => {
  // Wiki: the burst "deals knockback but does not deal any damage by itself".
  assert.equal(WIND_CHARGE_BURST.radius, 3);
  const { manager, player } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  player.position.set(1.5, 1, 0);
  const charge = {
    isWindCharge: true, position: new THREE.Vector3(1, 1, 0),
    velocity: new THREE.Vector3(), age: 0, shooter: breeze, target: player
  };
  const before = player.health;
  const pushed = windChargeBurst(manager, charge);
  assert.ok(pushed.includes(player), 'the player is caught in the burst');
  assert.equal(player.health, before, 'the burst itself deals no damage');
  assert.ok(player.velocity.y > 0, 'but it knocks them upward');
  assert.ok(player.velocity.x !== 0 || player.velocity.z !== 0, 'and away');
});

test('a wind charge fired through the real loop damages the player', () => {
  const { manager, player } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  player.position.set(8, 1, 0);
  let sawCharge = false;
  let sawBurst = false;
  for (let i = 0; i < 400; i++) {
    manager.update(1 / 60, player);
    if (manager.windCharges?.length) sawCharge = true;
    else if (sawCharge) { sawBurst = true; break; }
  }
  assert.equal(sawCharge, true, 'a wind charge was fired');
  assert.equal(sawBurst, true, 'and it burst');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
  assert.ok(player.damageTaken > 0, 'and the direct hit hurt the player');
});

test('it leaps through the real loop rather than standing still', () => {
  const { manager, player } = fixture();
  player.position.set(200, 1, 200);
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  const start = breeze.mesh.position.clone();
  let becameAirborne = false;
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    if (!breeze.onGround) becameAirborne = true;
  }
  assert.equal(becameAirborne, true, 'the breeze left the ground');
  assert.ok(breeze.mesh.position.distanceTo(start) > 1,
    `and travelled, moved ${breeze.mesh.position.distanceTo(start).toFixed(2)}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('the drops and XP match the wiki', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  breeze.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(breeze, () => 0.9), [['breeze_rod', false, 1, 2]],
    'wiki: 1-2 breeze rods');
  assert.deepEqual(breezeDrops(breeze), [['breeze_rod', false, 1, 2]]);
  // Looting adds.
  breeze.lootingLevel = 2;
  const looted = breezeDrops(breeze)[0];
  assert.ok(looted[3] > 2, `Looting should raise the cap, got ${looted[3]}`);

  assert.equal(breezeXp(breeze), 10, 'wiki: a flat 10 XP');
  assert.equal(breezeXp(manager.spawnMob('cow', 0, 1, 0)), 0, 'only breezes');
  assert.ok(ITEMS.breeze_rod, 'the breeze rod is a real item');
  // Without credit there is no loot.
  const unc = manager.spawnMob('breeze', 5, 1, 0);
  assert.deepEqual(manager.getMobDeathDrops(unc, () => 0.1), []);
});

test('the model has rods and a wind overlay, which stay visible when invisible', () => {
  // Wiki: "Breezes are partially unaffected by the Invisibility effect. The eyebrows and surrounding
  // wind remain visible." So the model must expose those parts by name.
  assert.deepEqual(BREEZE_ALWAYS_VISIBLE, ['eyebrows', 'wind']);
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  assert.equal(breeze.rods.length, 4, 'four rods, which is the silhouette');
  assert.ok(breeze.wind, 'a wind overlay');
  assert.equal(breeze.wind.children.length, 3, 'made of rings');
  assert.equal(breeze.eyebrows.length, 2, 'and two eyebrows');
  assert.equal(breeze.eyes.length, 2);
  assert.ok(BREEZE_COLORS.body > 0);
});

test('the pose animates the wind and splays the rods in the air', () => {
  const { manager } = fixture();
  const breeze = manager.spawnMob('breeze', 0, 1, 0);
  breeze.onGround = true;
  poseBreeze(breeze, 0.5);
  const groundRot = breeze.rods[0].rotation.z;
  breeze.onGround = false;
  poseBreeze(breeze, 0.5);
  assert.notEqual(breeze.rods[0].rotation.z, groundRot, 'the rods splay while leaping');
  assert.notEqual(breeze.wind.rotation.y, 0, 'the wind swirls');
  breeze.leapState = 'compressing';
  poseBreeze(breeze, 0.5);
  assert.ok(breeze.mesh.scale.y < 1, 'and the body squashes before a leap');
  assert.doesNotThrow(() => poseBreeze(null));
  assert.doesNotThrow(() => poseBreeze({}));
});

test('the model factory builds the same parts standalone', () => {
  const model = createBreezeModel(
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial(),
    new THREE.MeshBasicMaterial()
  );
  assert.ok(model.group && model.head && model.body);
  assert.equal(model.rods.length, 4);
  assert.equal(model.eyes.length, 2);
  assert.equal(model.eyebrows.length, 2);
  assert.ok(model.wind);
});

test('the Inspector can spawn the breeze and reports its leap state', () => {
  assert.ok(DEBUG_MOBS.includes('breeze'), 'breeze must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const breeze = s.reset('breeze');
  assert.equal(breeze.type, 'breeze', 'the Inspector spawns a real breeze');
  const snap = s.snapshot();
  assert.equal(snap.health, 30, 'Inspector telemetry shows 30 HP');
  assert.equal(snap.maxHealth, 30);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 30);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.breeze_spawn_egg, 'the breeze has a spawn egg');
  assert.equal(ITEMS.breeze_spawn_egg.mob, 'breeze');
  assert.equal(ITEMS.breeze_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-breezes and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isBreeze(cow), false);
  assert.equal(updateBreezeLeap(manager, cow, 0.1, player), null);
  assert.equal(fireWindCharge(manager, cow, 0.1, player), null);
  assert.equal(findBreezeTarget(manager, cow, player), null);
  assert.deepEqual(breezeDrops(cow), []);
  assert.equal(breezeXp(cow), 0);
  assert.equal(deflectVelocity({}, cow), null, 'a projectile without a velocity is safe');
  assert.equal(canBreezeLeap(manager, cow, player.position), false);
  assert.doesNotThrow(() => poseBreeze(null));
  assert.doesNotThrow(() => windChargeBurst(manager, { position: new THREE.Vector3(), velocity: new THREE.Vector3() }));
  // The behaviour is reachable through the dispatcher, not just the named spawner.
  assert.equal(manager.spawnMob('breeze', 9, 1, 9).type, 'breeze');
  assert.equal(manager.spawnMob('breeze', 9, 1, 9, { isBaby: true }).mesh.scale.x, 0.6);
});
