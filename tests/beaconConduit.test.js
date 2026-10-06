// The beacon and the conduit granted nothing.
//
// `Player.statusEffects` is a `Map` (player.js:69), `hasStatusEffect` uses `.has()`, and the tick loop uses
// `.get()` and `.delete()`. But `beaconConduit.js` wrote:
//
//     player.statusEffects = player.statusEffects || {};
//     player.statusEffects[beaconState.primary] = duration;
//
// `statusEffects` is a Map, so the `|| {}` was a no-op and the write landed as a PROPERTY ON THE MAP rather
// than as an entry. `hasStatusEffect` never saw it. Seven such writes across the file, covering the beacon's
// haste, speed, resistance, jump boost, strength and regeneration, and the conduit's conduit power, water
// breathing, night vision and haste.
//
// So two of the game's progression blocks were inert -- and `haste` had no working source anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { applyBeaconBuffs, applyConduitPower, BEACON_POWERS, calculateBeaconPyramid }
  from '../src/beaconConduit.js';

/** A Player shaped object with a real statusEffects Map. */
function player(over = {}) {
  const p = Object.create(Player.prototype);
  p.statusEffects = new Map();
  p.position = new THREE.Vector3(0, 0, 0);
  p.inWater = false;
  p.messages = [];
  p.game = { ui: { addChatMessage: (m) => p.messages.push(m) } };
  return Object.assign(p, over);
}

const AT_ORIGIN = new THREE.Vector3(0, 0, 0);

test('a beacon grants its primary through the status Map', () => {
  const p = player();
  applyBeaconBuffs({ active: true, range: 20, primary: 'haste' }, p, AT_ORIGIN);
  assert.equal(p.hasStatusEffect('haste'), true,
    'the beacon should grant haste; before the fix this was false because the write went onto the Map as a '
    + 'property');
  assert.equal(p.statusEffects.get('haste').duration, 16);
  assert.equal(p.statusEffects.get('haste').level, 1);
});

test('every power the beacon offers can actually be granted', () => {
  // The list is the block's whole purpose, and every entry of it went through the broken write.
  const powers = new Set(Object.values(BEACON_POWERS).flat());
  assert.ok(powers.size >= 6, 'the beacon should offer several powers, got ' + [...powers].join(', '));
  for (const power of powers) {
    const p = player();
    applyBeaconBuffs({ active: true, range: 20, primary: power }, p, AT_ORIGIN);
    assert.equal(p.hasStatusEffect(power), true, 'a beacon should be able to grant ' + power);
  }
});

test('haste is one of them, which is why it had no working source', () => {
  // `BEACON_POWERS.tier1` includes `haste`, so a sweep looking for `applyStatusEffect('haste'` or `id:
  // 'haste'` finds nothing -- the id sits in an array. That is the blind spot that made an earlier round
  // report haste as an effect nothing grants.
  assert.ok(BEACON_POWERS.tier1.includes('haste'));
  const p = player();
  applyBeaconBuffs({ active: true, range: 20, primary: 'haste' }, p, AT_ORIGIN);
  assert.equal(p.hasStatusEffect('haste'), true);
});

test('a beacon grants regeneration only as its secondary', () => {
  const withSecondary = player();
  applyBeaconBuffs({ active: true, range: 20, primary: 'speed', secondary: 'regeneration' },
    withSecondary, AT_ORIGIN);
  assert.equal(withSecondary.hasStatusEffect('regeneration'), true);
  const withoutSecondary = player();
  applyBeaconBuffs({ active: true, range: 20, primary: 'speed' }, withoutSecondary, AT_ORIGIN);
  assert.equal(withoutSecondary.hasStatusEffect('regeneration'), false);
  assert.equal(withoutSecondary.hasStatusEffect('speed'), true);
});

test('a beacon grants nothing out of range or when inactive', () => {
  const far = player({ position: new THREE.Vector3(100, 0, 0) });
  applyBeaconBuffs({ active: true, range: 20, primary: 'haste' }, far, AT_ORIGIN);
  assert.equal(far.hasStatusEffect('haste'), false, 'out of range grants nothing');
  const off = player();
  applyBeaconBuffs({ active: false, range: 20, primary: 'haste' }, off, AT_ORIGIN);
  assert.equal(off.hasStatusEffect('haste'), false, 'and an inactive beacon grants nothing');
  const none = player();
  applyBeaconBuffs(null, none, AT_ORIGIN);
  assert.equal(none.statusEffects.size, 0);
});

test('the range is a sphere, not a cylinder', () => {
  const above = player({ position: new THREE.Vector3(0, 25, 0) });
  applyBeaconBuffs({ active: true, range: 20, primary: 'haste' }, above, AT_ORIGIN);
  assert.equal(above.hasStatusEffect('haste'), false, 'twenty-five blocks up is out of a twenty block range');
});

test('a conduit grants all four of its powers, and only in water', () => {
  const wet = player({ inWater: true });
  applyConduitPower({ active: true, range: 20 }, wet, AT_ORIGIN);
  for (const effect of ['conduit_power', 'water_breathing', 'night_vision', 'haste']) {
    assert.equal(wet.hasStatusEffect(effect), true, 'a conduit should grant ' + effect);
  }
  const dry = player({ inWater: false });
  applyConduitPower({ active: true, range: 20 }, dry, AT_ORIGIN);
  assert.equal(dry.statusEffects.size, 0, 'and nothing out of water');
  const far = player({ inWater: true, position: new THREE.Vector3(100, 0, 0) });
  applyConduitPower({ active: true, range: 20 }, far, AT_ORIGIN);
  assert.equal(far.statusEffects.size, 0, 'nor out of range');
});

test('refreshing does not flood the chat', () => {
  // `applyStatusEffect` posts a line, and these fields re-apply every frame while the player stands in
  // range -- which is why they get a quiet path rather than being pointed at `applyStatusEffect`.
  const p = player();
  for (let i = 0; i < 100; i++) applyBeaconBuffs({ active: true, range: 20, primary: 'haste' }, p, AT_ORIGIN);
  assert.deepEqual(p.messages, [], 'a hundred refreshes should post nothing');
});

test('no status effect is written as a plain-object property anywhere', () => {
  // The guard for the class of bug rather than the two instances. The Player's map is a Map, so a
  // `statusEffects[name] = value` write is always wrong for it. Mobs use plain objects and are not covered
  // here; this checks the file that was broken and the Player.
  const beacon = readFileSync(new URL('../src/beaconConduit.js', import.meta.url), 'utf8');
  // Comments stripped first: the fix's own explanation quotes the broken line, and matching prose is how the
  // first version of this guard failed against correct code.
  const code = beacon.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const writes = [...code.matchAll(/player\.statusEffects\[[^\]]+\]\s*=/g)];
  assert.deepEqual(writes.map(w => w[0]), [], 'beaconConduit should not write a Map as an object');
  assert.equal(/player\.statusEffects = player\.statusEffects \|\| \{\}/.test(code), false,
    'and should not reassign it to a plain object either');
  // It should go through the quiet helper.
  assert.match(beacon, /player\.refreshStatusEffect\?\.\(/);
});

test('the quiet refresh sets the same record shape the tick loop expects', () => {
  // A mismatched shape would make the effect tick wrongly or never expire.
  const p = player();
  p.refreshStatusEffect('haste', 16, 1);
  const entry = p.statusEffects.get('haste');
  assert.deepEqual(Object.keys(entry).sort(), ['duration', 'level', 'tickTimer']);
  assert.equal(entry.duration, 16);
  assert.equal(entry.level, 1);
  assert.equal(entry.tickTimer, 0);
  // And it must match what `applyStatusEffect` writes, or the two paths would behave differently. Compared
  // with `deepEqual` on the entries: spreading a plain object into an array throws, which is how the first
  // version of this assertion failed.
  const q = player();
  q.applyStatusEffect('haste', 16, 1);
  assert.deepEqual(q.statusEffects.get('haste'), p.statusEffects.get('haste'));
});

test('the pyramid tier calculation is still wired to the powers', () => {
  // A light guard that this file's other export has not been orphaned, since the fix touched the file.
  assert.equal(typeof calculateBeaconPyramid, 'function');
  const world = { getVoxel: () => 0 };
  assert.equal(calculateBeaconPyramid(world, 0, 0, 0).tier ?? 0, 0, 'an empty world is a tier zero beacon');
});
