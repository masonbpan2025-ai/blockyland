// Per-mob state persistence.
//
// The save format previously recorded only a mob's type, position, yaw and health plus a few
// mob-specific blobs, so a baby came back an adult, a tamed wolf came back wild, a sheared
// sheep came back woolly, and every mob added in this parity pass lost its variant and timers.
// This suite drives the real serializeWorld/deserializeWorld pair.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { serializeWorld, deserializeWorld } from '../src/mapManager.js';
import { World } from '../src/world.js';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { BABY_GROWTH_SECONDS } from '../src/babyGrowth.js';
import {
  PERSISTED_MOB_FIELDS, PERSISTED_REFERENCES, PLAYER_REFERENCE,
  serializeMobState, restoreMobState, mobAppearanceRestorers
} from '../src/mobState.js';

function session() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = new World(4242);
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: () => false, random: () => 0.5
  });
  const player = {
    position: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), gamemode: 'survival',
    health: 20, keys: {}, pitch: 0, yaw: 0, update() {}, takeDamage() {},
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = {
    active: null, hotbar: [], storage: [], armor: {},
    getActiveItem() { return this.active; }, consumeActiveItem() {}, addItem() { return true; },
    updateUI() {}, updateHotbar() {}
  };
  player.inventory = inventory;
  const game = {
    world, mobs: manager, scene, entities, player, inventory, worldTime: 0,
    mechanisms: null, loadChunksAroundPlayer() {}, rebuildChunkMesh() {}
  };
  manager.game = game;
  return { game, manager, player, world, scene };
}

/** Save and reload a world, returning the freshly spawned mobs. */
function roundTrip(s, mutate) {
  mutate(s);
  const record = JSON.parse(JSON.stringify(serializeWorld(s.game)));
  deserializeWorld(s.game, record);
  return { record, mobs: s.manager.mobs };
}

test('the persisted field list covers every per-mob state this pass added', () => {
  // A regression guard: if a new mob gets a state field, it belongs in the list.
  for (const field of [
    'isBaby', 'babyGrowthTimer', 'ageLocked',
    'isSheared', 'woolColor', 'variant', 'mushroomType', 'size', 'coat', 'rabbitType',
    'isTamed', 'isSaddled', 'isSitting', 'collarColor', 'wolfArmor',
    'angerTimer', 'lifetime', 'moistness', 'carriedBlock', 'gotFish',
    'name', 'persistent', 'breedingCooldown', 'inLove', 'slimeSize'
  ]) {
    assert.ok(PERSISTED_MOB_FIELDS.includes(field), `${field} must be persisted`);
  }
  assert.deepEqual(PERSISTED_REFERENCES, ['owner']);
});

test('serializeMobState records scalars and skips object references', () => {
  const state = serializeMobState({
    isBaby: true, babyGrowthTimer: 1200, woolColor: 'lime', name: 'Dolly',
    // These must be skipped: an object would be written as [object Object].
    mesh: { position: {} }, velocity: { x: 1 }, target: { type: 'cow' }
  });
  assert.deepEqual(state, {
    isBaby: true, babyGrowthTimer: 1200, woolColor: 'lime', name: 'Dolly'
  });
  assert.equal(serializeMobState(null), null);
  assert.equal(serializeMobState({}), null, 'nothing worth saving yields null');
});

test('the owner reference is stored as a marker, never as an object', () => {
  const player = { isPlayer: true };
  const state = serializeMobState({ isTamed: true, owner: player }, { player });
  assert.equal(state.owner, PLAYER_REFERENCE);
  assert.equal(JSON.stringify(state).includes('[object Object]'), false);

  // A mob owned by somebody else cannot be restored, so it is recorded as null.
  const stranger = serializeMobState({ isTamed: true, owner: { isPlayer: true } }, { player });
  assert.equal(stranger.owner, null, 'only the current player is restorable');
});

test('restoreMobState re-links the owner and applies the state', () => {
  const player = { isPlayer: true };
  const mob = { type: 'wolf', health: 30, maxHealth: 40 };
  restoreMobState(mob, { isTamed: true, owner: PLAYER_REFERENCE, collarColor: 'blue' }, { player });
  assert.equal(mob.isTamed, true);
  assert.equal(mob.collarColor, 'blue');
  assert.equal(mob.owner, player, 'the owner reference is resolved back to the player');
  assert.equal(mob.maxHealth, 40, 'a tamed wolf keeps its tamed maximum');
});

test('a restored wolf is clamped to the maximum its taming implies', () => {
  // A wolf saved as wild with 40 health would be above its own cap.
  const wild = { type: 'wolf', health: 40, maxHealth: 40 };
  restoreMobState(wild, { isTamed: false });
  assert.equal(wild.maxHealth, 8, 'a wild wolf has 8 HP');
  assert.equal(wild.health, 8, 'and its health is clamped down to that');

  const tamed = { type: 'wolf', health: 40, maxHealth: 40 };
  restoreMobState(tamed, { isTamed: true });
  assert.equal(tamed.maxHealth, 40);
  assert.equal(tamed.health, 40, 'a tamed wolf may keep 40');

  // An injured tamed wolf keeps its injuries.
  const hurt = { type: 'wolf', health: 12, maxHealth: 40 };
  restoreMobState(hurt, { isTamed: true });
  assert.equal(hurt.health, 12);
});

test('a baby animal survives the save round trip as a baby', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const calf = s.manager.spawnCow(2, 1, 2);
    calf.isBaby = true;
    calf.babyGrowthTimer = BABY_GROWTH_SECONDS;
  });
  const calf = mobs.find(m => m.type === 'cow');
  assert.ok(calf, 'the cow reloaded');
  assert.equal(calf.isBaby, true, 'it must still be a baby');
  assert.ok(calf.babyGrowthTimer > BABY_GROWTH_SECONDS - 5, 'with its growth timer intact');
});

test('an age-locked baby stays age-locked', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const calf = s.manager.spawnCow(2, 1, 2);
    calf.isBaby = true;
    calf.babyGrowthTimer = 600;
    calf.ageLocked = true;
  });
  const calf = mobs.find(m => m.type === 'cow');
  assert.equal(calf.isBaby, true);
  assert.equal(calf.ageLocked, true, 'the golden dandelion lock survives');
  assert.equal(calf.babyGrowthTimer, 600);
});

test('a sheared sheep comes back sheared, in the right colour and still hidden', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const sheep = s.manager.spawnSheep(2, 1, 2, { woolColor: 'lime' });
    sheep.isSheared = true;
  });
  const sheep = mobs.find(m => m.type === 'sheep');
  assert.equal(sheep.woolColor, 'lime', 'the retained colour survives');
  assert.equal(sheep.isSheared, true, 'and it is still sheared');
});

test('shearing state is re-applied to the mesh, not just the flag', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const sheep = s.manager.spawnSheep(2, 1, 2, { woolColor: 'red' });
    sheep.isSheared = true;
  });
  const sheep = mobs.find(m => m.type === 'sheep');
  assert.equal(sheep.woolMesh.visible, false, 'the wool layer must actually be hidden');
});

test('a brown mooshroom survives, with its mushrooms restored', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    s.manager.spawnMooshroom(2, 1, 2, { variant: 'brown' });
  });
  const mooshroom = mobs.find(m => m.type === 'mooshroom');
  assert.equal(mooshroom.variant, 'brown', 'the variant survives');
  assert.equal(mooshroom.mushroomType, 'brown');
  assert.ok(mooshroom.mushroomMeshes.every(m => m.visible), 'an adult keeps its mushrooms');
});

test('a baby mooshroom reloads without mushrooms', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const shroom = s.manager.spawnMooshroom(2, 1, 2);
    shroom.isBaby = true;
  });
  const mooshroom = mobs.find(m => m.type === 'mooshroom');
  assert.equal(mooshroom.isBaby, true);
  assert.ok(mooshroom.mushroomMeshes.every(m => !m.visible),
    'wiki: a baby mooshroom has no mushrooms, and the restore must not show them');
});

test('a tamed wolf reloads tamed, owned, with its collar colour and armour', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const wolf = s.manager.spawnWolf(2, 1, 2, { wolfArmor: 'wolf_armor' });
    wolf.isTamed = true;
    wolf.owner = s.player;
    wolf.collarColor = 'cyan';
    wolf.isSitting = true;
    wolf.health = 40;
    wolf.maxHealth = 40;
  });
  const wolf = mobs.find(m => m.type === 'wolf');
  assert.equal(wolf.isTamed, true, 'taming survives');
  assert.equal(wolf.owner, s.player, 'and the owner is re-linked to the player object');
  assert.equal(wolf.collarColor, 'cyan', 'the collar colour survives');
  assert.equal(wolf.isSitting, true, 'a sitting wolf stays sitting');
  assert.equal(wolf.wolfArmor, 'wolf_armor', 'and its armour survives');
  assert.equal(wolf.maxHealth, 40, 'with the tamed maximum');
});

test('an untamed wolf reloads wild at 8 HP', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    s.manager.spawnWolf(2, 1, 2);
  });
  const wolf = mobs.find(m => m.type === 'wolf');
  assert.equal(wolf.isTamed, false);
  assert.equal(wolf.maxHealth, 8);
  assert.equal(wolf.health, 8);
});

test('a custom name survives the round trip', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const cow = s.manager.spawnCow(2, 1, 2);
    cow.name = 'Bessie';
    cow.persistent = true;
  });
  const cow = mobs.find(m => m.type === 'cow');
  assert.equal(cow.name, 'Bessie', 'a named mob keeps its name');
  assert.equal(cow.persistent, true, 'and its persistence');
});

test('a rabbit reloads with its coat and RabbitType', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    s.manager.spawnRabbit(2, 1, 2, { coat: 'gold' });
  });
  const rabbit = mobs.find(m => m.type === 'rabbit');
  assert.equal(rabbit.coat, 'gold');
  assert.equal(rabbit.rabbitType, 4, 'the gold RabbitType index survives');
});

test('a killer bunny reloads as a killer bunny', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    s.manager.spawnRabbit(2, 1, 2, { killer: true });
  });
  const killer = mobs.find(m => m.type === 'rabbit');
  assert.equal(killer.rabbitType, 99, 'RabbitType 99 survives');
  assert.equal(killer.coat, 'killer');
  assert.equal(killer.armor, 8);
});

test('a Toast-named rabbit comes back as Toast', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const rabbit = s.manager.spawnRabbit(2, 1, 2, { coat: 'brown' });
    rabbit.name = 'Toast';
  });
  const rabbit = mobs.find(m => m.type === 'rabbit');
  assert.equal(rabbit.name, 'Toast');
  // Wiki: naming a rabbit Toast retextures it, and the appearance restorer re-applies that on
  // load, so the reloaded rabbit must not come back as the plain brown it was saved as.
  assert.equal(rabbit.coat, 'toast', 'the Toast pattern is re-applied on load');
  assert.notEqual(rabbit.bodyMat.color.getHex(), 0x8b5a2b, 'and it is no longer brown');
});

test('salmon size, dolphin moistness and enderman carried block survive', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    s.manager.spawnSalmon(2, 1, 2, { size: 'large' });
    const dolphin = s.manager.spawnDolphin(20, 1, 2);
    dolphin.moistness = 1234;
    s.manager.spawnEnderman(30, 1, 2, { carriedBlock: BLOCKS.GRASS_BLOCK });
  });
  assert.equal(mobs.find(m => m.type === 'salmon').size, 'large', 'salmon size survives');
  assert.equal(mobs.find(m => m.type === 'dolphin').moistness, 1234, 'moistness survives');
  assert.equal(mobs.find(m => m.type === 'enderman').carriedBlock, BLOCKS.GRASS_BLOCK,
    'a carried block survives');
});

test('spider anger, endermite lifetime and slime size survive', () => {
  const s = session();
  const { mobs } = roundTrip(s, (s) => {
    const spider = s.manager.spawnMob('spider', 2, 1, 2);
    spider.angerTimer = 12.5;
    const mite = s.manager.spawnMob('endermite', 20, 1, 2);
    mite.lifetime = 42;
    s.manager.spawnSlime(30, 1, 2, 2);
  });
  assert.equal(mobs.find(m => m.type === 'spider').angerTimer, 12.5, 'spider anger survives');
  assert.equal(mobs.find(m => m.type === 'endermite').lifetime, 42, 'endermite lifetime survives');
  assert.equal(mobs.find(m => m.type === 'slime').slimeSize, 2, 'slime size survives');
});

test('a mob with almost no extra state still reloads cleanly', () => {
  const s = session();
  const { mobs, record } = roundTrip(s, (s) => {
    s.manager.spawnVillager(2, 1, 2);
  });
  const villager = mobs.find(m => m.type === 'villager');
  assert.ok(villager, 'it reloaded');
  assert.equal(villager.type, 'villager');
  assert.equal(villager.health > 0, true, 'with a sensible health');
  // Its record carries only whatever state the villager actually has; the point is that a mob
  // with nothing interesting does not acquire spurious state or fail to restore.
  const state = record.mobs[0].state ?? null;
  assert.equal(state === null || typeof state === 'object', true);
});

test('restoring is safe on missing or malformed state', () => {
  const mob = { type: 'cow', health: 10 };
  assert.doesNotThrow(() => restoreMobState(mob, null));
  assert.doesNotThrow(() => restoreMobState(mob, undefined));
  assert.doesNotThrow(() => restoreMobState(null, { isBaby: true }));
  assert.doesNotThrow(() => restoreMobState(mob, 'nonsense'));
  assert.doesNotThrow(() => restoreMobState(mob, { owner: 'someone-else' }));
  assert.equal(mob.owner, null, 'an unknown owner reference resolves to null, not a string');
});

test('the appearance restorers are defensive', () => {
  const restore = mobAppearanceRestorers({
    sheepApplyWool: () => { throw new Error('boom'); },
    applyMooshroomVariant: () => {},
    applyRabbitCoat: () => {},
    applyRabbitName: () => {}
  });
  // A throwing restorer must not break loading the whole map.
  assert.doesNotThrow(() => restore({ type: 'sheep' }));
  assert.doesNotThrow(() => restore(null));
  assert.doesNotThrow(() => restore({ type: 'cow' }));
  // And a missing restorer is tolerated.
  const partial = mobAppearanceRestorers({});
  assert.doesNotThrow(() => partial({ type: 'sheep' }));
  assert.doesNotThrow(() => partial({ type: 'mooshroom' }));
  assert.doesNotThrow(() => partial({ type: 'rabbit' }));
});
