// Haste and Mining Fatigue had no reader, and the two structures that grant them were writing into the
// wrong place.
//
// The player's `statusEffects` is a Map. `applyBeaconBuffs` and `applyConduitPower` assigned
// `player.statusEffects[name] = duration`, which sets a plain property on the Map object: `has`, `get`
// and `hasStatusEffect` all ignore it. So every beacon power did nothing, and the conduit's four were
// written for an effect (`conduit_power`) the game did not even know about. Neither function was called
// from anywhere either, so the beacon pyramid was calculated for its panel and never applied.
//
// The Elder Guardian is the third part: it has been applying Mining Fatigue III to the player since it was
// written, through the correct path, and nothing read it. Its curse is the reason mining near an ocean
// monument is hopeless in vanilla, and it did nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { Inventory } from '../src/inventory.js';
import { Player } from '../src/player.js';
import { EFFECTS, isKnownEffect, miningSpeedMultiplier } from '../src/statusEffects.js';
import { breakTimeSeconds } from '../src/miningRules.js';
import { applyBeaconBuffs, applyConduitPower } from '../src/beaconConduit.js';

const atLevel = (name, level) => new Map([[name, { duration: 10, level }]]);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);

/** A real player, so `hasStatusEffect` is the Map reader the bug defeated. */
function player({ inWater = false } = {}) {
  const camera = new THREE.PerspectiveCamera();
  const sounds = { playHurt: () => {}, playStep: () => {}, playShieldBlock: () => {} };
  const world = { getVoxel: () => BLOCKS.AIR, setVoxel: () => {}, redstone: { interact: () => null } };
  const p = new Player(camera, { requestPointerLock: () => {} }, world, sounds);
  p.inventory = new Inventory(sounds);
  p.position.set(0, 5, 0);
  p.inWater = inWater;
  return p;
}

// --- the rule -----------------------------------------------------------------

test('Haste adds and Mining Fatigue multiplies, as Java does', () => {
  near(miningSpeedMultiplier(new Map()), 1, 'no effect');
  // Additive on the multiplier, so level II is 1.4 and not 1.44.
  near(miningSpeedMultiplier(atLevel('haste', 1)), 1.2, 'haste I');
  near(miningSpeedMultiplier(atLevel('haste', 2)), 1.4, 'haste II');
  // 0.3^min(level, 4): the wiki's table is 30%, 9%, 2.7%, 0.81% for levels I to IV, and 0.81% beyond.
  near(miningSpeedMultiplier(atLevel('mining_fatigue', 1)), 0.3, 'fatigue I');
  near(miningSpeedMultiplier(atLevel('mining_fatigue', 2)), 0.09, 'fatigue II');
  near(miningSpeedMultiplier(atLevel('mining_fatigue', 3)), 0.027, 'fatigue III, the Guardian curse');
  near(miningSpeedMultiplier(atLevel('mining_fatigue', 4)), 0.0081, 'fatigue IV');
  near(miningSpeedMultiplier(atLevel('mining_fatigue', 9)), 0.0081, 'and it does not go lower');
  // They multiply when both are running.
  near(miningSpeedMultiplier(new Map([['haste', { level: 1 }], ['mining_fatigue', { level: 3 }]])), 0.027 * 1.2, 'both');
  // An unrelated effect changes nothing.
  near(miningSpeedMultiplier(atLevel('speed', 3)), 1, 'speed is not a mining effect');
});

test('a block takes longer with the curse and less with Haste', () => {
  const stone = BLOCKS.STONE;
  const pick = { speed: 8, tool: 'pickaxe' };
  const base = breakTimeSeconds(stone, pick, 'iron_pickaxe');
  const hasted = breakTimeSeconds(stone, pick, 'iron_pickaxe', 0, miningSpeedMultiplier(atLevel('haste', 2)));
  const cursed = breakTimeSeconds(stone, pick, 'iron_pickaxe', 0, miningSpeedMultiplier(atLevel('mining_fatigue', 3)));
  assert.ok(base > 0, 'the control block should be breakable');
  // Breaking counts whole ticks (wiki, Breaking: ceil(hardness x 30 / speed)), so the multiplier is applied to the
  // speed and the time is that speed's tick count: Haste II is 1.4 times the speed, the curse 0.027 times.
  const ticks = (speed) => Math.ceil(1.5 * 30 / speed - 1e-9) / 20;
  near(base, ticks(8), 'the plain time');
  near(hasted, ticks(8 * 1.4), 'Haste II is 1.4 times the speed');
  near(cursed, ticks(8 * 0.027), 'and the curse is 0.027 times the speed');
  assert.ok(hasted < base && cursed > 10, `a cursed player should take seconds per block, took ${cursed}`);
  // The wiki's own table gives a mining duration of 123x at level IV, which is 1/0.0081.
  const capped = breakTimeSeconds(stone, pick, 'iron_pickaxe', 0, 0.0081);
  near(capped, ticks(8 * 0.0081), 'and level IV is 123 times the duration');
});

test('a multiplier that is zero or negative never produces a nonsensical time', () => {
  const stone = BLOCKS.STONE;
  const pick = { speed: 8, tool: 'pickaxe' };
  // However the rule is fed, a speed of zero is an infinite time, not a negative or instant one.
  assert.equal(breakTimeSeconds(stone, pick, 'iron_pickaxe', 0, 0), Infinity);
  assert.equal(breakTimeSeconds(stone, pick, 'iron_pickaxe', 0, -1), Infinity);
  // And the default is unchanged, which is what every existing caller relies on.
  assert.equal(breakTimeSeconds(stone, pick, 'iron_pickaxe'), breakTimeSeconds(stone, pick, 'iron_pickaxe', 0, 1));
});

// --- the Guardian -------------------------------------------------------------

test('the Elder Guardian curse reaches the mining time through a real player', () => {
  const cursed = player();
  cursed.applyStatusEffect('mining_fatigue', 300, 3);
  assert.equal(cursed.hasStatusEffect('mining_fatigue'), true);
  const multiplier = miningSpeedMultiplier(cursed.statusEffects);
  near(multiplier, 0.027, 'Mining Fatigue III');

  const clean = player();
  const pick = { speed: 8, tool: 'pickaxe' };
  const normal = breakTimeSeconds(BLOCKS.STONE, pick, 'iron_pickaxe', 0, miningSpeedMultiplier(clean.statusEffects));
  const cursedTime = breakTimeSeconds(BLOCKS.STONE, pick, 'iron_pickaxe', 0, multiplier);
  assert.ok(cursedTime > normal * 30, `the curse should slow mining by ~37x, got ${(cursedTime / normal).toFixed(1)}x`);
});

// --- the structures -----------------------------------------------------------

test('a beacon power lands where the game reads it', () => {
  const p = player();
  applyBeaconBuffs({ active: true, range: 50, tier: 4, primary: 'haste', secondary: 'regeneration' }, p, { x: 0, y: 0, z: 0 });
  // `hasStatusEffect` reads the Map. Assigning a property on the Map object used to make this false.
  assert.equal(p.hasStatusEffect('haste'), true, 'the primary power must be readable');
  assert.equal(p.hasStatusEffect('regeneration'), true, 'and the secondary');
  assert.equal(p.statusEffects.get('haste').level, 2, 'a full four-tier pyramid gives the primary at level II');
  assert.equal(p.statusEffects.get('haste').duration, 16);

  const small = player();
  applyBeaconBuffs({ active: true, range: 50, tier: 2, primary: 'speed' }, small, { x: 0, y: 0, z: 0 });
  assert.equal(small.statusEffects.get('speed').level, 1, 'a smaller pyramid gives level I');

  // Out of range, and inactive, grant nothing.
  const far = player();
  applyBeaconBuffs({ active: true, range: 10, tier: 4, primary: 'haste' }, far, { x: 500, y: 0, z: 0 });
  assert.equal(far.hasStatusEffect('haste'), false, 'out of range is out of range');
  const off = player();
  applyBeaconBuffs({ active: false, range: 50, tier: 4, primary: 'haste' }, off, { x: 0, y: 0, z: 0 });
  assert.equal(off.hasStatusEffect('haste'), false, 'an inactive beacon grants nothing');
});

test('a conduit grants Conduit Power and the three effects it carries', () => {
  assert.equal(isKnownEffect('conduit_power'), true, 'Conduit Power has to be an effect the game knows');
  const p = player({ inWater: true });
  applyConduitPower({ active: true, range: 50, complete: false }, p, { x: 0, y: 0, z: 0 }, []);
  for (const name of ['conduit_power', 'water_breathing', 'night_vision', 'haste']) {
    assert.equal(p.hasStatusEffect(name), true, `${name} should be applied`);
  }
  // And the haste it grants is now worth something.
  near(miningSpeedMultiplier(p.statusEffects), 1.2, 'Conduit Power grants Haste I');

  // A dry player gets nothing: the conduit only works underwater.
  const dry = player({ inWater: false });
  applyConduitPower({ active: true, range: 50, complete: false }, dry, { x: 0, y: 0, z: 0 }, []);
  assert.equal(dry.hasStatusEffect('conduit_power'), false);
});

test('no effect is left without a name and a category', () => {
  // `conduit_power` was being applied while absent from the table, which is how an effect ends up with no
  // display name in the HUD and no category for the tests to check.
  for (const [name, def] of Object.entries(EFFECTS)) {
    assert.equal(typeof def.name, 'string', `${name} has no display name`);
    assert.ok(['beneficial', 'harmful', 'neutral'].includes(def.category), `${name} has no category`);
  }
});
