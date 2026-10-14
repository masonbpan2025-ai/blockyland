// Death has consequences, respawn is complete, and neither can happen twice.
//
// `die()` used to drop **nothing** -- death showed an overlay reading "You lost, please try again" and a
// Survival player kept every item through every death. `respawn()` restored health and hunger but not
// saturation or exhaustion, and its bed branch `return`ed early, so `statusEffects.clear()` and every reset
// after it were skipped for anyone who had bound a bed: poison survived death if you slept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/mods/dragonball-tournament/runtime.js';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { Inventory } from '../src/inventory.js';
import {
  collectDeathDrops, xpLossFor, resolveRespawn, resetSurvivalState, sleepingAllowedIn, timeAfterSleep,
  RESPAWN_HEALTH, RESPAWN_HUNGER, RESPAWN_SATURATION, RESPAWN_EXHAUSTION,
  RESPAWN_INVULNERABLE_SECONDS, SLEEPABLE_DIMENSIONS,
} from '../src/deathAndRespawn.js';

/** A Player-shaped object with a real Map of effects and a recording game. */
function makePlayer(over = {}) {
  const p = Object.create(Player.prototype);
  p.position = new THREE.Vector3(10, 30, 10);
  p.velocity = new THREE.Vector3(1, -2, 3);
  p.statusEffects = new Map([['poison', { duration: 20, level: 1, tickTimer: 0 }]]);
  p.inventory = new Inventory();
  p.health = 6;
  p.maxHealth = 20;
  p.hunger = 7;
  p.saturation = 1;
  p.exhaustion = 5;
  p.absorption = 8;
  p.fallDistance = 14;
  p.fireTicks = 40;
  p.isBurning = true;
  p.isFlying = true;
  p.elytraActive = true;
  p.isGliding = true;
  p.xpLevel = 0;
  p.level = 0;
  p.spawnPosition = new THREE.Vector3(1.5, 27, -1.5);
  p.world = { getVoxel: () => 0 };
  p.deathDropsDone = false;
  p.dropped = [];
  p.orbs = [];
  p.game = {
    entities: {
      spawnDroppedItem: (pos, id, isBlock, count) => p.dropped.push({ id, isBlock, count, pos }),
      spawnXpOrbs: (pos, points) => p.orbs.push(points),
    },
    ui: { addChatMessage: () => {} },
    settings: { keepInventory: false },
    gamerules: {},
  };
  return Object.assign(p, over);
}

// --- the drop transaction ---------------------------------------------------------------------------

test('death drops every carried stack exactly once', () => {
  const p = makePlayer();
  p.inventory.hotbar[0] = { id: 'stone', isBlock: true, count: 64 };
  p.inventory.hotbar[3] = { id: 'bread', isBlock: false, count: 5 };
  p.inventory.storage[7] = { id: 'diamond', isBlock: false, count: 2 };
  p.inventory.armor.chest = { id: 'iron_chestplate', isBlock: false, count: 1 };
  p.inventory.offhand = { id: 'shield', isBlock: false, count: 1 };
  p.inventory.cursorItem = { id: 'torch', isBlock: true, count: 12 };

  const result = p.dropInventoryOnDeath();
  assert.equal(result.dropped, 6, 'six stacks, one call each');
  const ids = p.dropped.map(d => d.id).sort();
  assert.deepEqual(ids, ['bread', 'diamond', 'iron_chestplate', 'shield', 'stone', 'torch']);
  // Counts survive the trip.
  assert.equal(p.dropped.find(d => d.id === 'stone').count, 64);
  assert.equal(p.dropped.find(d => d.id === 'diamond').count, 2);
});

test('the crafting grid and its previews are not dropped', () => {
  // A grid is a workspace and a result is a calculation, so neither is an owned item. This is a recorded
  // deviation from Java, which does drop the grid.
  const p = makePlayer();
  p.inventory.craft3x3[0] = { id: 'oak_planks', isBlock: true, count: 4 };
  p.inventory.craft3x3[1] = { id: 'stick', isBlock: false, count: 2 };
  p.inventory.craft3x3Result = { id: 'wooden_pickaxe', isBlock: false, count: 1 };
  p.inventory.craft2x2Result = { id: 'oak_planks', isBlock: true, count: 4 };

  p.dropInventoryOnDeath();
  assert.deepEqual(p.dropped.map(d => d.id), [], 'nothing from the grid is dropped');
});

test('a second death callback drops nothing more', () => {
  // Idempotent, because a repeated damage event or a second death callback must not duplicate the drops.
  const p = makePlayer();
  p.inventory.hotbar[0] = { id: 'stone', isBlock: true, count: 64 };
  const first = p.dropInventoryOnDeath();
  assert.equal(first.dropped, 1);
  const second = p.dropInventoryOnDeath();
  assert.equal(second, null, 'the second call is refused');
  assert.equal(p.dropped.length, 1, 'and nothing was dropped again');
});

test('keepInventory preserves the items and the experience', () => {
  const p = makePlayer({ xpLevel: 12 });
  p.game.gamerules = { keepInventory: true };
  p.inventory.hotbar[0] = { id: 'diamond_sword', isBlock: false, count: 1 };

  const result = p.dropInventoryOnDeath();
  assert.equal(result.kept, true);
  assert.equal(result.dropped, 0);
  assert.equal(p.dropped.length, 0, 'nothing hits the ground');
  assert.equal(p.xpLevel, 12, 'and the levels are kept');
  assert.ok(p.inventory.hotbar[0], 'the item is still in the hotbar');
});

test('death costs the level and scatters the experience Java would', () => {
  // Java: `min(level * 7, 100)` points, and the level is lost.
  assert.deepEqual(xpLossFor(0), { levels: 0, points: 0 });
  assert.deepEqual(xpLossFor(3), { levels: 3, points: 21 });
  assert.deepEqual(xpLossFor(30), { levels: 30, points: 100 }, 'the cap is 100 points');
  assert.deepEqual(xpLossFor(1000), { levels: 1000, points: 100 });
  assert.deepEqual(xpLossFor(-5), { levels: 0, points: 0 }, 'and nonsense is not negative');

  const p = makePlayer({ xpLevel: 30, level: 30 });
  p.dropInventoryOnDeath();
  assert.equal(p.xpLevel, 0);
  assert.equal(p.level, 0);
  assert.deepEqual(p.orbs, [100], 'the orbs are spawned once');
});

test('the carried inventory is emptied and the result is reported', () => {
  const p = makePlayer();
  p.inventory.hotbar[0] = { id: 'stone', isBlock: true, count: 64 };
  p.inventory.armor.head = { id: 'iron_helmet', isBlock: false, count: 1 };
  p.inventory.offhand = { id: 'shield', isBlock: false, count: 1 };
  p.dropInventoryOnDeath();
  assert.equal(p.inventory.hotbar.filter(Boolean).length, 0);
  assert.equal(p.inventory.storage.filter(Boolean).length, 0);
  assert.equal(p.inventory.offhand, null);
  assert.equal(p.inventory.armor.head, null);
  assert.equal(p.inventory.cursorItem, null);
});

test('the tournament never drops an inventory', () => {
  const p = makePlayer();
  p.game.tournament = { isTournamentMap: true };
  p.game.modRuntime = createRuntime(p.game);
  p.inventory.hotbar[0] = { id: 'stone', isBlock: true, count: 64 };
  const result = p.dropInventoryOnDeath();
  assert.equal(result.kept, true);
  assert.equal(p.dropped.length, 0);
});

// --- the complete reset -----------------------------------------------------------------------------

test('a respawn restores every Survival figure Java restores', () => {
  const p = makePlayer();
  resetSurvivalState(p);
  assert.equal(p.health, RESPAWN_HEALTH);
  assert.equal(p.hunger, RESPAWN_HUNGER);
  assert.equal(p.saturation, RESPAWN_SATURATION, 'saturation was never reset before');
  assert.equal(p.exhaustion, RESPAWN_EXHAUSTION, 'nor exhaustion');
  assert.equal(p.isDead, false);
  assert.equal(p.invulnerableTimer, RESPAWN_INVULNERABLE_SECONDS, 'and there is respawn protection');
});

test('a respawn clears poison, fire, absorption and every transient', () => {
  const p = makePlayer();
  resetSurvivalState(p);
  assert.equal(p.statusEffects.size, 0, 'effects are gone');
  assert.equal(p.absorption, 0, 'and so is the shield, which the effect was granting');
  assert.equal(p.fireTicks, 0);
  assert.equal(p.isBurning, false);
  assert.equal(p.fallDistance, 0);
  assert.equal(p.isFlying, false);
  assert.equal(p.elytraActive, false);
  assert.equal(p.isGliding, false);
  assert.equal(p.velocity.length(), 0);
});

test('resetSurvivalState does not touch the inventory', () => {
  // The drop is the death transaction's business; a mode change or a load must not be affected by it.
  const p = makePlayer();
  p.inventory.hotbar[0] = { id: 'stone', isBlock: true, count: 64 };
  resetSurvivalState(p);
  assert.equal(p.inventory.hotbar[0].id, 'stone');
});

test('the reset runs on the bed path too, which is where it used to be skipped', () => {
  // The old `respawn()` put `statusEffects.clear()` after a bed branch that `return`ed, so a player with a
  // bed kept their poison through death. The source guard is that the reset is the FIRST thing respawn does.
  const raw = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  // Comments stripped: the method's own explanation contains the word "return", and matching that instead of
  // a statement is how the first version of this test failed against correct code.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fn = source.slice(source.indexOf('  respawn() {'), source.indexOf('  applyStatusEffect(effect'));
  const resetIndex = fn.indexOf('resetSurvivalState(this)');
  const firstReturn = fn.indexOf('return');
  assert.ok(resetIndex > 0, 'respawn calls the reset');
  assert.ok(resetIndex < firstReturn, 'and it is before any early return');
  assert.equal(/this\.statusEffects\.clear\(\);/.test(fn), false,
    'the bare clear at the end of the old method is gone');
  // And there is exactly one reset helper, so the two paths cannot diverge again.
  assert.equal((fn.match(/resetSurvivalState\(this\)/g) || []).length, 1, 'once, at the top');
});

// --- which anchor -----------------------------------------------------------------------------------

test('the world spawn is the last resort, and a blocked one is reported', () => {
  const worldSpawn = { x: 1.5, y: 27, z: -1.5 };
  // No bed, no anchor.
  let d = resolveRespawn({ worldSpawn });
  assert.equal(d.source, 'world_spawn');
  assert.deepEqual(d.position, worldSpawn);
  // A bed wins over the world spawn.
  d = resolveRespawn({ bedPosition: { x: 4, y: 30, z: 9 }, worldSpawn });
  assert.equal(d.source, 'bed');
  assert.deepEqual(d.position, { x: 4, y: 30, z: 9 });
  // An anchor wins over a bed.
  d = resolveRespawn({ validAnchor: true, anchorPosition: { x: 7, y: 8, z: 7 },
    bedPosition: { x: 4, y: 30, z: 9 }, worldSpawn });
  assert.equal(d.source, 'anchor');
  // The world spawn being unsafe is reported rather than silently used.
  d = resolveRespawn({ worldSpawn, isSpaceSafe: () => false });
  assert.equal(d.source, 'world_spawn');
  assert.equal(d.blocked, true);
});

test('a bed that is gone or blocked at respawn falls back and says so', () => {
  // A safe spot before death can be blocked afterwards, so the check is repeated at respawn.
  const worldSpawn = { x: 1.5, y: 27, z: -1.5 };
  const bedPosition = { x: 4, y: 30, z: 9 };
  let d = resolveRespawn({ bedPosition, worldSpawn, isBedStillThere: () => false });
  assert.equal(d.source, 'world_spawn');
  assert.equal(d.lostBed, true, 'the loss is reported');
  d = resolveRespawn({ bedPosition, worldSpawn, isSpaceSafe: () => false });
  assert.equal(d.source, 'world_spawn');
  assert.equal(d.lostBed, true);
  // And a valid one is still used.
  d = resolveRespawn({ bedPosition, worldSpawn, isBedStillThere: () => true, isSpaceSafe: () => true });
  assert.equal(d.source, 'bed');
});

test('a respawn from a bed lands on the bed and resets everything', () => {
  // The end-to-end path: bind a bed, die, respawn.
  const p = makePlayer();
  p.bedSpawnPosition = new THREE.Vector3(4.5, 30, 9.5);
  p.isBedStillThere = () => true;
  p.isRespawnSpaceSafe = () => true;
  p.statusEffects.set('wither', { duration: 10, level: 1, tickTimer: 0 });

  p.respawn();

  assert.equal(p.lastRespawnSource, 'bed', 'it used the bed');
  assert.deepEqual([p.position.x, p.position.y, p.position.z], [4.5, 30, 9.5]);
  assert.equal(p.health, 20);
  assert.equal(p.saturation, 5, 'the reset ran on the bed path');
  assert.equal(p.exhaustion, 0);
  assert.equal(p.statusEffects.size, 0, 'the wither is gone');
  assert.equal(p.isDead, false);
  assert.equal(p.deathDropsDone, false, 'and a later death may drop again');
});

test('a respawn with no bed lands on the world spawn', () => {
  const p = makePlayer();
  p.bedSpawnPosition = null;
  p.respawn();
  assert.equal(p.lastRespawnSource, 'world_spawn');
  assert.equal(p.position.x, 1.5);
  assert.equal(p.position.y, 27);
  assert.equal(p.position.z, -1.5);
});

test('a bed that vanished falls back to the world spawn and is cleared', () => {
  const p = makePlayer();
  p.bedSpawnPosition = new THREE.Vector3(4.5, 30, 9.5);
  p.isBedStillThere = () => false;
  const messages = [];
  p.game.ui.addChatMessage = (m) => messages.push(m);
  p.respawn();
  assert.equal(p.lastRespawnSource, 'world_spawn');
  assert.equal(p.bedSpawnPosition, null, 'the stale binding is cleared');
  assert.ok(messages.some(m => /missing or obstructed/.test(m)), 'and the player is told');
});

// --- dimensions -------------------------------------------------------------------------------------

test('a bed explodes in the Nether and the End, by capability not by name', () => {
  assert.deepEqual([...SLEEPABLE_DIMENSIONS], ['overworld']);
  assert.equal(sleepingAllowedIn('overworld'), true);
  assert.equal(sleepingAllowedIn('nether'), false);
  assert.equal(sleepingAllowedIn('the_end'), false);
  assert.equal(sleepingAllowedIn(undefined), true, 'an unknown dimension reads as the Overworld');
  // The End is the case the old biome-name test never covered.
  assert.equal(sleepingAllowedIn('the_end'), false, 'the End was missed entirely');
});

test('waking advances to dawn of the next day, not to mid-morning', () => {
  assert.equal(timeAfterSleep(), 0, 'dawn, not 1000');
});

test('sleeping does not heal and does not feed', () => {
  // The assertion form of the rule, so a future change has to argue with a named test.
  const source = readFileSync(new URL('../src/bed.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  wakeUp() {'), source.indexOf('  update(dt) {'));
  assert.equal(/player\.health\s*=/.test(fn), false, 'wakeUp must not set health');
  assert.equal(/player\.hunger\s*=/.test(fn), false, 'nor hunger');
  assert.equal(/player\.saturation\s*=/.test(fn), false, 'nor saturation');
  assert.match(fn, /timeAfterSleep\(\)/, 'and it advances the clock through the shared helper');
});

test('binding a bed never moves the world spawn', () => {
  const raw = readFileSync(new URL('../src/bed.js', import.meta.url), 'utf8');
  // Comments stripped FIRST. The fix's own explanation quotes `player.spawnPosition.copy(safeSpawn)` twice,
  // so a raw search finds the prose that documents the bug -- which is how this assertion failed against
  // correct code, the third time in this session that matching a comment beat matching the code.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Bounded by the NEXT method signature rather than by `isHostileMobNearby`, which is defined EARLIER in the
  // file, so the first version of this slice was empty.
  const start = source.indexOf('\n  interact(x, y, z, player) {');
  const rest = source.slice(start + 1);
  const nextMethod = rest.slice(1).search(/\n  [a-zA-Z_]\w*\(/);
  assert.ok(start > 0 && nextMethod > 0, 'the method must have a following sibling');
  const fn = rest.slice(0, nextMethod + 1);
  assert.equal(/player\.spawnPosition\.copy/.test(fn), false,
    'the world spawn must not be overwritten by a bed');
  assert.match(fn, /player\.bedSpawnPosition = safeSpawn\.clone\(\)/, 'only the bed binding is set');
});
