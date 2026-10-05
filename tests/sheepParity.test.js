// Sheep parity with https://minecraft.wiki/w/Sheep
//
// Values are asserted against the wiki reference, never against whatever the
// implementation currently happens to do. The audit found sheep at 10 HP against a
// reference of 8, and found that shear/dye wrote to a `woolMesh` that no sheep ever
// created, so both the number and the mesh are pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import {
  SHEEP_COLORS, SHEEP_COLOR_HEX, mixSheepColors, sheepColorsMix,
  inheritSheepColor, sheepApplyWool, rollSheepWoolCount
} from '../src/sheepBehavior.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture(world = null) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const terrain = world || { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR) };
  const entities = new EntityManager(scene, terrain, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world: terrain, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { sheep: new THREE.Texture() },
    isBlockSolid: (x, y, z) => terrain.getVoxel(x, y, z) === BLOCKS.STONE
  });
  manager.animalBehaviors = new AnimalBehaviors(manager, terrain, sounds, entities);
  const player = {
    position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}
  };
  const inventory = {
    active: null, hotbar: [], storage: [], armor: {},
    getActiveItem() { return this.active; },
    consumeActiveItem(n = 1) { if (this.active) this.active.count -= n; },
    addItem(id, isBlock, count = 1) { this.storage.push({ id, isBlock, count }); return true; },
    updateUI() {}, updateHotbar() {}
  };
  player.inventory = inventory;
  manager.game = { player, inventory, difficulty: 'normal', weather: { weatherType: 'clear' }, controls: {} };
  return { manager, entities, player, inventory, sounds, world: terrain };
}

const held = (inventory, id, extra = {}) => { inventory.active = { id, count: 64, ...extra }; return inventory.active; };

/**
 * Record drops as plain data instead of scene objects.
 *
 * The real spawnDroppedItem builds an item mesh, and for a non-block item that means
 * `THREE.TextureLoader`, which needs `document`. Recording the arguments keeps the
 * assertions about *what dropped* rather than about rendering, and avoids assigning a
 * global `document` that would leak into other files sharing this test process.
 */
function recordDrops(entities, into = []) {
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    into.push({ itemType, isBlock, count });
    return into[into.length - 1];
  };
  return into;
}

test('sheep spawn with the reference 8 HP, not the previously implemented 10', () => {
  const { manager } = fixture();
  const sheep = manager.spawnSheep(0, 1, 0);
  assert.equal(sheep.maxHealth, 8, 'wiki: sheep have 8 HP');
  assert.equal(sheep.health, 8);
  assert.equal(manager.getMobDimensions('sheep').height, 1.3, 'adult hitbox height 1.3');
  assert.equal(manager.getMobDimensions('sheep').width, 0.9, 'adult hitbox width 0.9');
});

test('a sheep spawns with a real wool layer that shearing hides and grazing brings back', () => {
  const { manager, entities, player, inventory } = fixture();
  const drops = recordDrops(entities);
  const sheep = manager.spawnSheep(0, 1, 0);
  assert.ok(sheep.woolMesh, 'the model must create the wool layer that shear/dye write to');
  assert.equal(sheep.woolMesh.visible, true, 'an unsheared sheep shows wool');
  assert.equal(sheep.isSheared, false);

  held(inventory, 'shears', { durability: 238 });
  assert.equal(manager.animalBehaviors.interact(sheep, player, inventory), true);
  assert.equal(sheep.isSheared, true);
  assert.equal(sheep.woolMesh.visible, false, 'shearing hides the wool layer');
  assert.ok(drops.length >= 1, 'shearing drops wool');
  assert.equal(inventory.active.durability, 237, 'shears lose one durability');

  // Wiki: shearing yields 1-3 wool regardless of Fortune or Looting.
  const count = drops.reduce((n, i) => n + i.count, 0);
  assert.ok(count >= 1 && count <= 3, `shearing should yield 1-3 wool, got ${count}`);
});

test('shearing drops wool in the sheep\u2019s own colour', () => {
  const { manager, entities, player, inventory } = fixture();
  const drops = recordDrops(entities);
  const sheep = manager.spawnSheep(0, 1, 0, { woolColor: 'cyan' });
  held(inventory, 'shears');
  manager.animalBehaviors.interact(sheep, player, inventory);
  assert.ok(drops.length > 0, 'wool dropped');
  for (const drop of drops) {
    assert.equal(drop.itemType, BLOCKS.CYAN_WOOL, 'the dropped wool matches the sheep colour');
  }
});

test('a sheared sheep cannot be dyed until its wool regrows', () => {
  const { manager, entities, player, inventory } = fixture();
  recordDrops(entities);
  const sheep = manager.spawnSheep(0, 1, 0);
  held(inventory, 'shears');
  manager.animalBehaviors.interact(sheep, player, inventory);
  assert.equal(sheep.isSheared, true);

  held(inventory, 'red_dye');
  assert.equal(
    manager.animalBehaviors.canInteract(sheep, player, inventory), false,
    'the held-dye prompt must not offer a sheared sheep'
  );
  manager.animalBehaviors.interact(sheep, player, inventory);
  assert.equal(sheep.woolColor, 'white', 'dye does not apply while sheared');
  assert.equal(inventory.active.count, 64, 'and the dye is not consumed');
});

test('dyeing recolours the wool layer and survives shearing plus regrowth', () => {
  const { manager, entities, player, inventory } = fixture();
  recordDrops(entities);
  const sheep = manager.spawnSheep(0, 1, 0);

  held(inventory, 'blue_dye');
  assert.equal(manager.animalBehaviors.interact(sheep, player, inventory), true);
  assert.equal(sheep.woolColor, 'blue');
  assert.equal(sheep.woolMesh.material.color.getHex(), SHEEP_COLOR_HEX.blue, 'the mesh tint follows the colour');
  assert.equal(inventory.active.count, 63, 'the dye is consumed in survival');

  // Wiki: a dyed sheep keeps its new colour after shearing and regrowing.
  held(inventory, 'shears');
  manager.animalBehaviors.interact(sheep, player, inventory);
  assert.equal(sheep.isSheared, true);
  assert.equal(sheep.woolColor, 'blue', 'the colour is retained while sheared');

  sheep.isSheared = false;
  sheepApplyWool(sheep);
  assert.equal(sheep.woolMesh.visible, true);
  assert.equal(sheep.woolMesh.material.color.getHex(), SHEEP_COLOR_HEX.blue, 'still blue after regrowth');
});

test('grazing on grass regrows wool and only then', () => {
  // A sheep standing at y=1 looks for grass at y=0, and only grass blocks regrow wool.
  const grassy = {
    edits: new Map(),
    getVoxel(x, y, z) { return this.edits.get(`${x},${y},${z}`) ?? (y <= 0 ? BLOCKS.GRASS_BLOCK : BLOCKS.AIR); },
    setVoxel(x, y, z, id) { this.edits.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, id); },
    getHeightAt() { return 0; }
  };
  const { manager, player, inventory, world } = fixture(grassy);
  recordDrops(manager.entities);
  const sheep = manager.spawnSheep(0, 1, 0, { woolColor: 'red' });

  held(inventory, 'shears');
  manager.animalBehaviors.interact(sheep, player, inventory);
  assert.equal(sheep.isSheared, true);

  // Drive the graze timer past its threshold through the shared per-mob loop.
  sheep.grazeTimer = 0.01;
  manager.animalBehaviors.update(0.02, player);

  assert.equal(sheep.isSheared, false, 'grazing regrows the wool');
  assert.equal(sheep.woolMesh.visible, true);
  assert.equal(sheep.woolMesh.material.color.getHex(), SHEEP_COLOR_HEX.red, 'and restores the retained colour');
  assert.equal(world.getVoxel(0, 0, 0), BLOCKS.DIRT, 'the grass block is eaten into dirt');
});

test('a sheared sheep does not regrow wool without grass to eat', () => {
  const bare = {
    getVoxel(x, y, z) { return y <= 0 ? BLOCKS.DIRT : BLOCKS.AIR; },
    setVoxel() {}, getHeightAt() { return 0; }
  };
  const { manager, player, inventory } = fixture(bare);
  recordDrops(manager.entities);
  const sheep = manager.spawnSheep(0, 1, 0, { woolColor: 'red' });
  held(inventory, 'shears');
  manager.animalBehaviors.interact(sheep, player, inventory);

  sheep.grazeTimer = 0.01;
  manager.animalBehaviors.update(0.02, player);
  assert.equal(sheep.isSheared, true, 'wiki: a sheared sheep only regrows wool after grazing');
  assert.equal(sheep.woolMesh.visible, false);
});

test('a sheared sheep drops no wool on death but still drops mutton', () => {
  const { manager } = fixture();
  const woolly = manager.spawnSheep(0, 1, 0, { woolColor: 'lime' });
  const sheared = manager.spawnSheep(4, 1, 0, { woolColor: 'lime', isSheared: true });

  const woollyRows = manager.getMobDeathDrops(woolly);
  const shearedRows = manager.getMobDeathDrops(sheared);

  assert.deepEqual(woollyRows[0], [BLOCKS.LIME_WOOL, true, 1, 1], 'an unsheared sheep drops one wool of its colour');
  assert.ok(
    !shearedRows.some(row => row[0] === BLOCKS.LIME_WOOL),
    `a sheared sheep must not drop wool, got ${JSON.stringify(shearedRows)}`
  );
  // Mutton is unaffected by shearing.
  for (const rows of [woollyRows, shearedRows]) {
    const mutton = rows.find(row => row[0] === 'mutton');
    assert.ok(mutton, 'mutton is always dropped');
    assert.deepEqual(mutton, ['mutton', false, 1, 2], 'wiki: 1-2 raw mutton');
  }
  assert.deepEqual(manager.getMobDeathDrops(manager.spawnSheep(8, 1, 0))[0], [BLOCKS.WHITE_WOOL, true, 1, 1], 'default colour is white');
});

test('sheep breeding mixes compatible parent colours and otherwise picks a parent', () => {
  // Wiki table: these pairs combine.
  assert.equal(mixSheepColors('blue', 'white'), 'light_blue');
  assert.equal(mixSheepColors('white', 'blue'), 'light_blue', 'order does not matter');
  assert.equal(mixSheepColors('red', 'yellow'), 'orange');
  assert.equal(mixSheepColors('red', 'blue'), 'purple');
  assert.equal(mixSheepColors('gray', 'black'), 'gray');
  assert.equal(mixSheepColors('purple', 'pink'), 'magenta');
  assert.equal(mixSheepColors('blue', 'green'), 'cyan');
  assert.equal(mixSheepColors('yellow', 'green'), 'lime');
  // Pairs absent from the table cannot be crafted together.
  assert.equal(mixSheepColors('yellow', 'blue'), null);
  assert.equal(sheepColorsMix('yellow', 'blue'), false);
  assert.equal(sheepColorsMix('red', 'yellow'), true);

  // Incompatible pairs fall back to one parent, chosen randomly.
  assert.equal(inheritSheepColor('yellow', 'blue', () => 0.1), 'yellow');
  assert.equal(inheritSheepColor('yellow', 'blue', () => 0.9), 'blue');
  // Compatible pairs ignore the random source entirely.
  assert.equal(inheritSheepColor('blue', 'white', () => 0.9), 'light_blue');
});

test('breeding two compatible sheep produces a lamb of the mixed colour', () => {
  const { manager, player, inventory } = fixture();
  const a = manager.spawnSheep(0, 1, 0, { woolColor: 'blue' });
  const b = manager.spawnSheep(1.5, 1, 0, { woolColor: 'white' });
  for (const sheep of [a, b]) {
    held(inventory, 'wheat');
    manager.animalBehaviors.interact(sheep, player, inventory);
    assert.ok(sheep.inLove > 0, 'wheat starts courtship');
  }
  // Advance past the courtship window through the real manager update, which is what
  // drives the breeding tick counter the courtship accumulator depends on.
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);

  const baby = manager.mobs.find(m => m.isBaby && m.type === 'sheep');
  assert.ok(baby, 'a lamb is born');
  assert.equal(baby.woolColor, 'light_blue', 'blue + white = light blue');
  assert.equal(baby.woolMesh.material.color.getHex(), SHEEP_COLOR_HEX.light_blue, 'and the lamb is tinted to match');
});

test('every wool colour has a tint and a wool block', () => {
  assert.equal(SHEEP_COLORS.length, 16, 'wiki: sixteen wool colours');
  for (const colour of SHEEP_COLORS) {
    assert.equal(typeof SHEEP_COLOR_HEX[colour], 'number', `${colour} needs a tint`);
    assert.ok(BLOCKS[`${colour.toUpperCase()}_WOOL`] !== undefined, `${colour} needs a wool block`);
  }
  assert.deepEqual([...new Set(SHEEP_COLORS)].sort(), [...SHEEP_COLORS].sort(), 'no duplicates');
});

test('shearing always yields within the reference 1-3 range', () => {
  for (const r of [0, 0.34, 0.999999]) {
    const n = rollSheepWoolCount(() => r);
    assert.ok(n >= 1 && n <= 3, `roll(${r}) = ${n} must be within 1-3`);
  }
  assert.equal(rollSheepWoolCount(() => 0), 1);
  assert.equal(rollSheepWoolCount(() => 0.999999), 3);
});

test('the Inspector can spawn the improved sheep and reports its new health', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const sheep = s.reset('sheep');
  assert.equal(sheep.type, 'sheep', 'sheep is selectable in the Inspector');
  assert.ok(sheep.woolMesh, 'the Inspector model has the wool layer');
  assert.equal(s.snapshot().health, 8, 'the Inspector telemetry shows 8 HP');
  assert.equal(s.snapshot().maxHealth, 8);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 8, 'and it survives a tick');
});

test('Inspector telemetry exposes the sheep wool state', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  s.reset('sheep');
  assert.equal(s.snapshot().woolColor, 'white');
  assert.equal(s.snapshot().sheared, false);
  assert.equal(s.snapshot().woolVisible, true);

  s.mob.isSheared = true;
  sheepApplyWool(s.mob);
  s.tick(1 / 60);
  assert.equal(s.snapshot().sheared, true, 'shearing is visible in telemetry');
  assert.equal(s.snapshot().woolVisible, false);
});

test('spawn options set colour and sheared state while the defaults stay white and woolly', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  s.reset('cow');

  const plain = s.manager.spawnSheep(0, 1, 0);
  assert.equal(plain.woolColor, 'white');
  assert.equal(plain.isSheared, false);
  assert.equal(plain.health, 8);

  const custom = s.manager.spawnSheep(0, 1, 0, { woolColor: 'pink', isSheared: true });
  assert.equal(custom.woolColor, 'pink');
  assert.equal(custom.isSheared, true);
  assert.equal(custom.woolMesh.visible, false, 'a sheep spawned sheared shows no wool');
  assert.equal(custom.woolMesh.material.color.getHex(), SHEEP_COLOR_HEX.pink);
});
