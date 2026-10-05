// Snow Golem parity with https://minecraft.wiki/w/Snow_Golem
//
// The snow golem fills a real gap: it had a LOOT TABLE and freeze immunity already, but no dispatcher case and
// no dimension row, so it was unreachable and its loot was dead data. What makes it worth implementing
// properly is that its snowballs deal no damage yet PROVOKE whatever they hit, and that it dies in hot biomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  SNOW_GOLEM_HEALTH, SNOW_GOLEM_DIMENSIONS, SNOW_GOLEM_SPEED, SNOW_GOLEM_RANGE,
  SNOW_GOLEM_THROW_SECONDS, SNOWBALL_DAMAGE, SNOW_GOLEM_HEAT, SNOW_GOLEM_HOT_BIOMES,
  SNOW_GOLEM_TRAITS, SNOW_GOLEM_TRAIL, SNOW_GOLEM_SHEAR_DROP, SNOW_GOLEM_PUMPKIN,
  SNOW_GOLEM_HOSTILES, SNOW_GOLEM_NEVER_TARGETS, SNOW_GOLEM_COLORS,
  isSnowGolem, snowGolemDimensions, isHotBiome, snowGolemTakesHeatDamage, updateSnowGolemHeat,
  snowballDamageFor, snowGolemTargets, findSnowGolemTarget, snowGolemThrow, updateSnowGolemThrow,
  snowGolemTrailAt, shearSnowGolem, snowGolemXp, createSnowGolemModel, poseSnowGolem
} from '../src/snowGolemBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 6000, weatherType = 'clear' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, isBlock, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [], snowballs: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(300, 1, 300), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime, weather: { weatherType }, controls: {}, ui: null };
  return { manager, player, entities };
}

test('snow golem is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  assert.equal(golem.type, 'snow_golem');
  assert.equal(golem.name, 'Snow Golem');
  assert.notEqual(golem.type, 'villager');
});

test('the health, hitbox, speed and traits match the wiki', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  assert.equal(SNOW_GOLEM_HEALTH, 4);
  assert.equal(golem.maxHealth, 4, 'wiki: 4 HP');
  assert.deepEqual(SNOW_GOLEM_DIMENSIONS, { width: 0.7, height: 1.9 });
  assert.deepEqual([golem.width, golem.height], [0.7, 1.9]);
  // The dimension row matters because the loot table already existed while this was missing.
  assert.deepEqual(manager.getMobDimensions('snow_golem'), { width: 0.7, height: 1.9 });
  assert.equal(SNOW_GOLEM_SPEED, 0.2);
  assert.equal(golem.speed, 0.2);
  // Wiki: passive, and it "never intentionally attack[s] the player".
  assert.equal(golem.isHostile, false);
  // Wiki: immune to powder snow and to fall damage, and it avoids water.
  assert.deepEqual(SNOW_GOLEM_TRAITS, { powderSnowImmune: true, fallDamageImmune: true, avoidsWater: true });
  assert.equal(golem.powderSnowImmune, true);
  assert.equal(golem.fallDamageImmune, true);
  assert.equal(golem.avoidsWater, true);
  assert.equal(golem.onGround, true, 'a definite groundedness at spawn');
});

test('snowballs deal no damage except to blazes', () => {
  // Wiki: "Thrown snowballs do not deal damage except to blazes, but they still knock back any mobs that they
  // hit." That is the whole point of the mob, so the table is nearly empty.
  assert.deepEqual(SNOWBALL_DAMAGE, { default: 0, blaze: 3 });
  assert.equal(snowballDamageFor('blaze'), 3);
  for (const type of ['zombie', 'creeper', 'skeleton', 'warden', 'wither', 'player']) {
    assert.equal(snowballDamageFor(type), 0, `${type} takes no damage`);
  }
  assert.equal(snowballDamageFor(undefined), 0);
  assert.equal(snowballDamageFor('BLAZE'), 3, 'the lookup is case-insensitive');
});

test('it throws one snowball a second at a monster ten blocks away', () => {
  // Wiki: it throws "up to 10 blocks away", or 16 "when captured", and "one snowball per second".
  assert.deepEqual(SNOW_GOLEM_RANGE, { roam: 10, tethered: 16 });
  assert.equal(SNOW_GOLEM_THROW_SECONDS, 1);
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  const zombie = manager.spawnMob('zombie', 5, 1, 0);
  const throwInfo = snowGolemThrow(golem, zombie, { dt: 0.016 });
  assert.ok(throwInfo, 'it threw');
  assert.equal(throwInfo.damage, 0, 'no damage to a zombie');
  assert.equal(throwInfo.provokes, true, 'but it provokes');
  assert.equal(golem.throwCooldown, SNOW_GOLEM_THROW_SECONDS);
  // Only one a second.
  assert.equal(snowGolemThrow(golem, zombie, { dt: 0.016 }), null, 'still on cooldown');
  updateSnowGolemThrow(golem, 1);
  assert.ok(snowGolemThrow(golem, zombie, { dt: 0.016 }), 'ready again');
  // Out of range is out of range.
  golem.throwCooldown = 0;
  zombie.mesh.position.set(20, 1, 0);
  assert.equal(snowGolemThrow(golem, zombie, { dt: 0.016 }), null, 'beyond 10 blocks');
  // Tethered it reaches 16, so 14 blocks is the distance that actually shows the difference. Asserting at 20
  // -- which is beyond the tethered range too -- was my mistake in the first version.
  zombie.mesh.position.set(14, 1, 0);
  assert.equal(snowGolemThrow(golem, zombie, { dt: 0.016 }), null, 'still beyond the roam range');
  assert.ok(snowGolemThrow(golem, zombie, { dt: 0.016, tethered: true }), 'but reachable when tethered');
  // And 18 is beyond even the tethered range.
  golem.throwCooldown = 0;
  zombie.mesh.position.set(18, 1, 0);
  assert.equal(snowGolemThrow(golem, zombie, { dt: 0.016, tethered: true }), null, 'beyond 16 too');
  // A blaze takes the damage.
  golem.throwCooldown = 0;
  const blaze = manager.spawnMob('blaze', 5, 1, 0);
  assert.equal(snowGolemThrow(golem, blaze, { dt: 0.016 }).damage, 3, 'a blaze takes 3');
});

test('the target list is the wiki\'s provocation table, not just "is hostile"', () => {
  // Wiki: it "move[s] toward all monsters (except ghasts and undead mounts)" and "also attack[s] creepers".
  // The exclusions matter: an enderman and a phantom are hostile but it does NOT attack them, so a flag would
  // get this wrong.
  for (const type of ['zombie', 'husk', 'creeper', 'skeleton', 'stray', 'bogged', 'spider', 'witch',
    'pillager', 'vindicator', 'evoker', 'ravager', 'slime', 'warden', 'wither', 'zoglin', 'blaze']) {
    assert.equal(snowGolemTargets(type), true, `it attacks a ${type}`);
  }
  for (const type of ['ghast', 'skeleton_horse', 'zombie_horse', 'camel_husk']) {
    assert.equal(snowGolemTargets(type), false, `wiki: never a ${type}`);
  }
  // Hostile but NOT on the table.
  for (const type of ['enderman', 'phantom', 'shulker']) {
    if (type === 'shulker') continue; // the shulker IS on the table
    assert.equal(snowGolemTargets(type), false, `it does not attack a ${type}`);
  }
  // Passive mobs, other golems and the player are never targets.
  for (const type of ['cow', 'pig', 'sheep', 'iron_golem', 'snow_golem', 'player', 'villager']) {
    assert.equal(snowGolemTargets(type), false, `it does not attack a ${type}`);
  }
  assert.equal(snowGolemTargets(''), false);
  assert.equal(snowGolemTargets(undefined), false);
  assert.deepEqual(SNOW_GOLEM_NEVER_TARGETS, ['ghast', 'happy_ghast', 'skeleton_horse', 'zombie_horse', 'camel_husk']);
  assert.equal(SNOW_GOLEM_HOSTILES.includes('creeper'), true);
});

test('it finds the nearest target within range and ignores the excluded', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  assert.equal(findSnowGolemTarget(manager, golem), null, 'nothing around');
  const far = manager.spawnMob('zombie', 9, 1, 0);
  assert.equal(findSnowGolemTarget(manager, golem), far);
  const near = manager.spawnMob('creeper', 3, 1, 0);
  assert.equal(findSnowGolemTarget(manager, golem), near, 'the nearest wins');
  // A ghast at point-blank is still ignored.
  const ghast = manager.spawnMob('ghast', 1, 3, 0);
  assert.notEqual(findSnowGolemTarget(manager, golem), ghast, 'a ghast is never a target');
  // A cow is ignored.
  manager.mobs.splice(manager.mobs.indexOf(near), 1);
  manager.mobs.splice(manager.mobs.indexOf(far), 1);
  manager.spawnMob('cow', 2, 1, 0);
  assert.equal(findSnowGolemTarget(manager, golem), null, 'a cow is not a monster');
  assert.equal(findSnowGolemTarget(manager, manager.spawnCow(0, 1, 0)), null);
});

test('it takes heat damage in a hot biome, but only with rain or water', () => {
  // Wiki: "take 1 damage per tick when in contact with rain or water AND in biomes with a temperature greater
  // than 1.0", and "The Fire Resistance effect allows them to survive in these biomes."
  assert.equal(SNOW_GOLEM_HEAT.damagePerTick, 1);
  assert.equal(SNOW_GOLEM_HEAT.maxTemperature, 1.0);
  for (const biome of ['desert', 'savanna', 'badlands', 'nether_wastes']) {
    assert.equal(isHotBiome(biome), true, `${biome} is hot`);
  }
  for (const biome of ['plains', 'taiga', 'snowy_plains', null, undefined]) {
    assert.equal(isHotBiome(biome), false, `${biome} is not hot`);
  }
  assert.ok(SNOW_GOLEM_HOT_BIOMES.includes('desert'));

  const golem = { type: 'snow_golem', health: 4 };
  // Both conditions are required.
  assert.equal(snowGolemTakesHeatDamage(golem, { biome: 'desert', inWater: false, raining: false }), false,
    'a dry golem in a hot biome is safe');
  assert.equal(snowGolemTakesHeatDamage(golem, { biome: 'plains', inWater: true }), false,
    'water in a cold biome is safe');
  assert.equal(snowGolemTakesHeatDamage(golem, { biome: 'desert', inWater: true }), true, 'both together');
  assert.equal(snowGolemTakesHeatDamage(golem, { biome: 'desert', raining: true }), true, 'rain counts too');
  // Fire Resistance saves it.
  assert.equal(snowGolemTakesHeatDamage({ type: 'snow_golem', hasFireResistance: true },
    { biome: 'desert', inWater: true }), false);
  // The mob's own biome is used when none is passed.
  assert.equal(snowGolemTakesHeatDamage({ type: 'snow_golem', biome: 'desert' }, { raining: true }), true);
  assert.equal(snowGolemTakesHeatDamage({ type: 'cow' }, { biome: 'desert', raining: true }), false);
});

test('the heat damage is per tick, so it is lethal fast', () => {
  const golem = { type: 'snow_golem', health: 4 };
  // 0.05 s is one tick, so 1 damage.
  assert.ok(Math.abs(updateSnowGolemHeat(golem, 0.05, { biome: 'desert', inWater: true }) - 1) < 1e-9);
  assert.ok(golem.health < 4);
  // A whole second is 20 ticks, which kills it outright, which is the wiki's intent.
  const doomed = { type: 'snow_golem', health: 4 };
  updateSnowGolemHeat(doomed, 1, { biome: 'desert', inWater: true });
  assert.ok(doomed.health <= 0, `a second in a hot biome kills it, health ${doomed.health}`);
  // No damage in a safe situation.
  const safe = { type: 'snow_golem', health: 4 };
  assert.equal(updateSnowGolemHeat(safe, 1, { biome: 'plains' }), 0);
  assert.equal(safe.health, 4);
  assert.equal(updateSnowGolemHeat({ type: 'cow', health: 4 }, 1, { biome: 'desert', inWater: true }), 0);
});

test('it dies of heat through the real update loop', () => {
  const { manager, player } = fixture({ weatherType: 'rain' });
  // A desert golem standing in the rain.
  const golem = manager.spawnSnowGolem(0, 1, 0, { biome: 'desert' });
  const startHealth = golem.health;
  for (let i = 0; i < 120 && golem.health > 0; i++) manager.update(1 / 60, player);
  assert.ok(golem.health < startHealth, `it lost health, ${startHealth} -> ${golem.health}`);
  assert.ok(golem.heatDamageTaken > 0, 'and the damage was recorded');
  assert.deepEqual([...(manager.mobErrors || [])], []);
  // A plains golem in the same rain is untouched.
  const safe = manager.spawnSnowGolem(20, 1, 0, { biome: 'plains' });
  for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  assert.equal(safe.health, safe.maxHealth, 'a cold biome is safe');
});

test('the snow trail is suppressed by mobGriefing, and reported rather than faked', () => {
  // Wiki: "leaves a trail of snow on the ground if the blocks can support it", and "If the mobGriefing game
  // rule is false, the snow trail does not appear."
  assert.equal(SNOW_GOLEM_TRAIL.suppressedByMobGriefing, true);
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  // `snow_block` is not a registered block in this build, so the trail is deliberately not written.
  assert.equal(snowGolemTrailAt(golem, { mobGriefing: true, canPlace: false }), null,
    'no block is written when the world cannot hold one');
  assert.equal(snowGolemTrailAt(golem, { mobGriefing: false, canPlace: true }), null,
    'mobGriefing false suppresses it entirely');
  // When a caller CAN place it, the position is the block under the golem.
  const trail = snowGolemTrailAt(golem, { mobGriefing: true, canPlace: true });
  assert.ok(trail, 'a placeable trail is reported');
  assert.equal(trail.block, 'snow');
  assert.equal(trail.position.y, golem.mesh.position.y - 1);
  assert.equal(snowGolemTrailAt(manager.spawnCow(0, 1, 0), { canPlace: true }), null);
});

test('shearing removes the pumpkin, reveals the face and drops it', () => {
  // Wiki: "Shearing a snow golem removes the pumpkin, revealing its derpy face and making it drop the
  // pumpkin." The pumpkin is its own tag rather than armour, which is why shearing is the only way to see it.
  assert.equal(SNOW_GOLEM_PUMPKIN, 'carved_pumpkin');
  assert.equal(SNOW_GOLEM_SHEAR_DROP, 'carved_pumpkin');
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  assert.equal(golem.hasPumpkin, true, 'it starts helmeted');
  assert.equal(golem.faceMesh.visible, false, 'and the face is hidden');
  assert.equal(golem.pumpkinMesh.visible, true);
  assert.equal(shearSnowGolem(golem, 'shears'), 'carved_pumpkin');
  assert.equal(golem.hasPumpkin, false);
  assert.equal(golem.faceMesh.visible, true, 'the derpy face is revealed');
  assert.equal(golem.pumpkinMesh.visible, false);
  // Shearing twice does nothing.
  assert.equal(shearSnowGolem(golem, 'shears'), null);
  // Only shears work.
  const other = manager.spawnMob('snow_golem', 0, 1, 0);
  assert.equal(shearSnowGolem(other, 'sword'), null);
  assert.equal(other.hasPumpkin, true);
  assert.equal(shearSnowGolem(manager.spawnCow(0, 1, 0), 'shears'), null);
});

test('it drops 0-15 snowballs and no experience', () => {
  // Wiki: 0-15 snowballs. The pumpkin is a SHEAR drop, not a death drop.
  //
  // REGRESSION: this row already existed in the base loot table, and I ALSO added a computed row, so the
  // manager produced two snowball drops -- one 0-15 roll and one flat 15 -- instead of one. The base table is
  // the single source of truth, so the test now asserts the shape it actually routes through.
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  assert.equal(snowGolemXp(), 0, 'golems are worth no experience');
  golem.playerDamaged = true;
  for (const roll of [0, 0.3, 0.7, 0.99]) {
    const drops = manager.getMobDeathDrops(golem, () => roll);
    assert.equal(drops.length, 1, `exactly one drop row on roll ${roll}, got ${JSON.stringify(drops)}`);
    assert.deepEqual(drops[0].slice(0, 1), ['snowball']);
    assert.equal(drops[0][2], 0, 'the minimum is 0');
    assert.equal(drops[0][3], 15, 'the maximum is 15');
    // Never a pumpkin on death.
    assert.equal(drops.some(r => r[0] === 'carved_pumpkin'), false);
  }
  assert.deepEqual(manager.getMobDeathDrops(manager.spawnCow(0, 1, 0), () => 0.99).some(r => r[0] === 'snowball'),
    false, 'only snow golems drop snowballs');
});

test('it throws through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  const zombie = manager.spawnMob('zombie', 6, 1, 0);
  let sawSnowball = false;
  assert.doesNotThrow(() => {
    for (let i = 0; i < 400; i++) {
      manager.update(1 / 60, player);
      if ((manager.snowballs || []).length) sawSnowball = true;
    }
  });
  assert.equal(sawSnowball, true, 'it threw a snowball');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
  // Wiki: snowballs do no damage, so the zombie is untouched by them.
  assert.equal(zombie.health, 20, 'the zombie took no snowball damage');
  // The golem is not hurt by its own snowball.
  assert.equal(golem.health, golem.maxHealth, 'it did not shoot itself');
});

test('a thrown snowball has the shape the shared updater needs', () => {
  // REGRESSION. `manager.snowballs` was DEAD CODE: `updateSnowballs` runs every frame but nothing populated
  // it. The snow golem is now its only producer, and the updater reads `p.mesh.position`,
  // `p.mesh.geometry`, `p.mesh.material` and `p.owner.position` -- so an entry with `mesh: null` would have
  // thrown a TypeError inside the shared updater on the first throw.
  const { manager, player } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  manager.spawnMob('zombie', 6, 1, 0);
  let shot = null;
  for (let i = 0; i < 400 && !shot; i++) {
    manager.update(1 / 60, player);
    if ((manager.snowballs || []).length) shot = manager.snowballs[0];
  }
  assert.ok(shot, 'a snowball was produced');
  assert.ok(shot.mesh, 'it has a mesh');
  assert.ok(shot.mesh.position, 'with a position');
  assert.ok(shot.mesh.geometry, 'and geometry, which the updater disposes');
  assert.ok(shot.mesh.material, 'and a material, which the updater also disposes');
  assert.ok(shot.owner, 'and an owner, which the updater uses as the damage origin');
  assert.equal(shot.owner, golem);
  assert.ok(shot.velocity.length() > 0);
});

test('it wanders when there is nothing to shoot', () => {
  const { manager, player } = fixture();
  player.position.set(300, 1, 300);
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  const start = golem.mesh.position.clone();
  for (let i = 0; i < 400; i++) manager.update(1 / 60, player);
  assert.equal(golem.target, null, 'no target');
  assert.ok(golem.mesh.position.distanceTo(start) > 0.02, 'it moved');
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('the model has a hidden face under a pumpkin helmet and stick arms', () => {
  // Wiki: "it wears its carved pumpkin like a helmet. Its actual head is hidden beneath the pumpkin."
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  assert.ok(golem.lower && golem.middle && golem.head, 'three stacked snowballs');
  assert.ok(golem.pumpkinMesh, 'a pumpkin helmet');
  assert.ok(golem.faceMesh, 'and a face underneath');
  assert.equal(golem.faceMesh.visible, false, 'hidden by default');
  assert.equal(golem.arms.length, 2, 'two stick arms');
  assert.equal(golem.arms[0].geometry.parameters.depth > 0.5, true, 'which are stick-like and long');
  assert.ok(SNOW_GOLEM_COLORS.pumpkin > 0);
  const model = createSnowGolemModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial()
  );
  assert.ok(model.group && model.pumpkin && model.face);
});

test('the throwing pose raises both arms and relaxes afterwards', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('snow_golem', 0, 1, 0);
  golem.throwCooldown = 0;
  poseSnowGolem(golem, 0);
  assert.equal(golem.arms.every(a => Math.abs(a.rotation.x) < 0.5), true, 'arms relaxed');
  golem.throwCooldown = SNOW_GOLEM_THROW_SECONDS;
  poseSnowGolem(golem, 0);
  assert.equal(golem.arms.every(a => a.rotation.x < -1), true, 'arms forward on the throw');
  // The pose keeps the pumpkin and face in step with the flag. Clear the cooldown first: leaving it set keeps
  // the THROW pose active, so the arms would still be forward for a reason unrelated to what follows.
  golem.throwCooldown = 0;
  golem.hasPumpkin = false;
  poseSnowGolem(golem, 0);
  assert.equal(golem.faceMesh.visible, true);
  assert.equal(golem.pumpkinMesh.visible, false);
  assert.doesNotThrow(() => poseSnowGolem(null));
  assert.doesNotThrow(() => poseSnowGolem({}));
});

test('the Inspector can spawn the snow golem', () => {
  assert.ok(DEBUG_MOBS.includes('snow_golem'), 'snow_golem must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const golem = s.reset('snow_golem');
  assert.equal(golem.type, 'snow_golem');
  assert.equal(s.snapshot().maxHealth, 4, 'Inspector telemetry shows 4 HP');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.snow_golem_spawn_egg, 'the snow golem has a spawn egg');
  assert.equal(ITEMS.snow_golem_spawn_egg.mob, 'snow_golem');
  assert.equal(ITEMS.snow_golem_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.snowball, 'and a snowball item exists');
  assert.ok(ITEMS.carved_pumpkin, 'and the pumpkin it wears');
});

test('the helpers are safe on non-golems and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isSnowGolem(cow), false);
  assert.equal(snowGolemTakesHeatDamage(cow, { biome: 'desert', inWater: true }), false);
  assert.equal(updateSnowGolemHeat(cow, 1, { biome: 'desert', inWater: true }), 0);
  assert.equal(findSnowGolemTarget(manager, cow), null);
  assert.equal(snowGolemThrow(cow, manager.spawnMob('zombie', 1, 1, 0)), null);
  assert.equal(updateSnowGolemThrow(cow, 1), false);
  assert.equal(shearSnowGolem(cow, 'shears'), null);
  assert.deepEqual(snowGolemDimensions(), { width: 0.7, height: 1.9 });
  assert.equal(isSnowGolem(null), false);
  assert.equal(snowGolemThrow(null, null), null);
  assert.equal(snowGolemThrow({ type: 'snow_golem', mesh: { position: new THREE.Vector3() } }, null), null);
  assert.doesNotThrow(() => poseSnowGolem(null));
  assert.equal(manager.spawnMob('snow_golem', 9, 1, 9).type, 'snow_golem');
});
