// A wild Enderman is neutral until provoked.
//
// `spawnEnderman` is also the tournament challenger boss, and the update block applied the *arena* rule to
// the species, in its own words:
//
//     // Periodic arena teleportation
//     if (mob.teleportCooldown <= 0) { ... this.teleportEnderman(mob); }
//     // Aggressively pursue player
//
// So a wild one spawned with `state: 'combat'` and `teleportCooldown: 4.5`, teleported toward the player
// within five seconds of the world loading, chased them and hit for 5 damage -- with no provocation. The
// teleport also biased **toward the player 60% of the time** and fell back to an unvalidated position when it
// found nowhere, so it could reappear beside the player or inside rock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createWildEndermanState, isProvoked, provoke, tickAnger, gazeProvokes,
  isValidTeleportDestination, pickTeleportDestination,
  GAZE_RANGE, ANGER_SECONDS, TELEPORT_CLEARANCE_HEIGHT, ENDERMAN_ATTACK_REACH,
} from '../src/endermanBehavior.js';

/**
 * A world backed by a Map.
 *
 * Unset cells read as AIR (0), because that is what a loaded chunk returns. `markUnloaded` makes specific
 * cells answer `undefined`, which is what `getVoxel` gives for a chunk that is not loaded -- the two are very
 * different and the first version of this fixture conflated them, so every destination looked unloaded.
 */
function world() {
  const cells = new Map();
  const unloaded = new Set();
  return {
    getVoxel: (x, y, z) => {
      const key = `${x},${y},${z}`;
      if (unloaded.has(key)) return undefined;
      return cells.get(key) ?? 0;
    },
    setVoxel: (x, y, z, id) => cells.set(`${x},${y},${z}`, id),
    markUnloaded: (x, y, z) => unloaded.add(`${x},${y},${z}`),
    cells,
  };
}

// --- neutral by default ------------------------------------------------------------------------------

test('a freshly spawned wild Enderman is not hostile', () => {
  const mob = createWildEndermanState();
  assert.equal(mob.state, 'idle');
  assert.equal(mob.anger, 0);
  assert.equal(isProvoked(mob), false);
  // The specific regression: it used to spawn already in combat with a teleport timer running.
  assert.equal(mob.state === 'combat', false, 'it must not spawn in combat');
  assert.equal(mob.teleportCooldown, 0, 'and must not be counting down to a teleport');
});

test('spawnEnderman uses the neutral state and keeps the arena opt-in', () => {
  const raw = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  // Comments stripped: the replacement's own explanation quotes `state: 'combat'` and the 4.5-second timer,
  // so a raw search finds the prose that documents the fix. That was the first version of this test.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const spawn = source.slice(source.indexOf('spawnEnderman(x, y, z, options = {})'),
    source.indexOf('teleportEnderman(mob, targetX'));
  assert.match(spawn, /\.\.\.createWildEndermanState\(\)/, 'the neutral state is spread in');
  assert.equal(/state: 'combat'/.test(spawn), false, 'the combat spawn is gone');
  assert.equal(/teleportCooldown: 4\.5/.test(spawn), false, 'and the 4.5-second timer');
  assert.match(spawn, /arenaChallenger: options\.arenaChallenger === true/, 'the arena is explicit');
});

// --- provocation -------------------------------------------------------------------------------------

test('being hit angers it, and only the first hit is a transition', () => {
  const mob = createWildEndermanState();
  assert.equal(provoke(mob, 'damage'), true, 'the first provocation is the transition');
  assert.equal(isProvoked(mob), true);
  assert.equal(mob.angeredBy, 'damage');
  assert.equal(provoke(mob, 'damage'), false, 'a second hit does not re-trigger it');
});

test('anger runs out, and then it ignores the player again', () => {
  const mob = createWildEndermanState();
  provoke(mob, 'damage', 2);
  assert.equal(tickAnger(mob, 1.5), false, 'still angry');
  assert.equal(isProvoked(mob), true);
  assert.equal(tickAnger(mob, 0.6), true, 'and this tick is the one that ends it');
  assert.equal(isProvoked(mob), false);
  assert.equal(mob.angeredBy, null);
  assert.equal(ANGER_SECONDS > 0, true);
});

test('a gaze reaches 64 blocks, and standing close is not enough on its own', () => {
  const playerPos = { x: 0, y: 0, z: 0 };
  const mobPos = { x: 0, y: 0, z: -10 };
  // Looking straight at it.
  assert.equal(gazeProvokes({ viewDir: { x: 0, y: 0, z: -1 }, playerPos, mobPos }), true);
  // Looking away.
  assert.equal(gazeProvokes({ viewDir: { x: 0, y: 0, z: 1 }, playerPos, mobPos }), false);
  // Nearby but looking elsewhere: proximity must not provoke, which is the whole point of "neutral".
  assert.equal(gazeProvokes({ viewDir: { x: 1, y: 0, z: 0 },
    playerPos, mobPos: { x: 1.5, y: 0, z: 0 } }), false);
  // Beyond the range.
  const far = { x: 0, y: 0, z: -(GAZE_RANGE + 5) };
  assert.equal(gazeProvokes({ viewDir: { x: 0, y: 0, z: -1 }, playerPos, mobPos: far }), false);
});

test('a stolen pumpkin and Creative mode both make the gaze harmless', () => {
  const input = { viewDir: { x: 0, y: 0, z: -1 }, playerPos: { x: 0, y: 0, z: 0 }, mobPos: { x: 0, y: 0, z: -10 } };
  assert.equal(gazeProvokes(input), true, 'the positive control');
  assert.equal(gazeProvokes({ ...input, wearingPumpkin: true }), false, 'a carved pumpkin hides you');
  assert.equal(gazeProvokes({ ...input, playerGameMode: 'creative' }), false, 'Creative does not anger it');
  assert.equal(gazeProvokes({ ...input, playerGameMode: 'spectator' }), false);
  assert.equal(gazeProvokes({ ...input, hasLineOfSight: false }), false, 'nor does a blocked view');
  assert.equal(gazeProvokes({}), false, 'and missing input is not a provocation');
});

// --- teleport destinations ---------------------------------------------------------------------------

test('a destination must hold the Enderman and have something to stand on', () => {
  const w = world();
  // A floor at y=10 with air above.
  w.setVoxel(0, 10, 0, 1);
  assert.equal(isValidTeleportDestination(w, 0, 11, 0, { isSolid: (id) => id === 1 }), true);
  // No floor: it would arrive mid-air.
  assert.equal(isValidTeleportDestination(w, 20, 11, 20, { isSolid: (id) => id === 1 }), false);
  // Floor, but the space above is not tall enough for a 2.9-block mob.
  const low = world();
  low.setVoxel(5, 10, 5, 1);
  low.setVoxel(5, 12, 5, 1);
  assert.equal(isValidTeleportDestination(low, 5, 11, 5, { isSolid: (id) => id === 1 }), false,
    'the clearance is the mob\'s own height, not a fixed three blocks');
  assert.ok(TELEPORT_CLEARANCE_HEIGHT >= 2.9);
});

test('an unloaded chunk is not a destination', () => {
  // `undefined` from `getVoxel` means the chunk is not loaded. Teleporting there would drop the mob out of
  // the world, so it must be refused rather than treated as air.
  const w = world();
  w.setVoxel(0, 10, 0, 1);
  assert.equal(isValidTeleportDestination(w, 0, 11, 0, { isSolid: (id) => id === 1 }), true,
    'the positive control: air above a floor is valid');
  w.markUnloaded(0, 12, 0);
  assert.equal(isValidTeleportDestination(w, 0, 11, 0, { isSolid: (id) => id === 1 }), false,
    'an unloaded cell inside the clearance is not air');
});

test('fluid is refused in the space it occupies but allowed underfoot', () => {
  const w = world();
  w.setVoxel(0, 10, 0, 9);   // water below: it can stand in that
  assert.equal(isValidTeleportDestination(w, 0, 11, 0, {
    isSolid: (id) => id === 1, isFluid: (id) => id === 9,
  }), true);
  w.setVoxel(0, 11, 0, 9);   // water where it would be
  assert.equal(isValidTeleportDestination(w, 0, 11, 0, {
    isSolid: (id) => id === 1, isFluid: (id) => id === 9,
  }), false, 'it must not teleport into fluid');
});

test('a search with nowhere valid returns null instead of moving the mob anyway', () => {
  // The old fallback jittered the mob by up to four blocks with no check at all. Returning null is the fix:
  // no valid destination means no teleport.
  const result = pickTeleportDestination({
    origin: { x: 0, y: 30, z: 0 },
    random: () => 0.5,
    isValid: () => false,
  });
  assert.equal(result, null);
  // And a search with somewhere valid finds it.
  let calls = 0;
  const found = pickTeleportDestination({
    origin: { x: 0, y: 30, z: 0 },
    random: () => 0.75,
    isValid: () => { calls++; return calls === 3; },
  });
  assert.ok(found, 'a valid destination is returned');
  assert.equal(calls, 3, 'and it stops as soon as one is found');
  // Missing input is not a crash.
  assert.equal(pickTeleportDestination({}), null);
  assert.equal(pickTeleportDestination(), null);
});

test('the teleport no longer aims at the player, and refuses instead of guessing', () => {
  const source = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  // Anchored on the METHOD SIGNATURES. `spawnHappyGhast(x, y, z, ...)` is also a call site earlier in the
  // file, so searching for the bare call gave an empty slice and the assertion failed against correct code.
  const start = source.indexOf('\n  teleportEnderman(mob, targetX');
  const end = source.indexOf('\n  spawnHappyGhast(x, y, z');
  assert.ok(start > 0 && end > start, 'the method must be found between its neighbours');
  const fn = source.slice(start, end);
  // The player bias is what made it keep reappearing beside whoever it was following.
  assert.equal(/Math\.random\(\) < 0\.6/.test(fn), false, 'the 60% bias toward the player is gone');
  assert.match(fn, /pickTeleportDestination\(\{/, 'destinations come from the validated search');
  assert.match(fn, /isValidTeleportDestination\(/, 'which checks the destination');
  assert.match(fn, /return false;/, 'and a failed search returns rather than moving the mob');
  assert.equal(/newX = mob\.mesh\.position\.x \+ \(Math\.random\(\) - 0\.5\) \* 8;/.test(fn), false,
    'the unvalidated jitter fallback is gone');
});

// --- the update branch --------------------------------------------------------------------------------

test('the arena behaviour only runs for a provoked or arena Enderman', () => {
  const source = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  const start = source.indexOf("} else if (mob.type === 'enderman') {");
  assert.ok(start > 0, 'the enderman branch exists');
  // Bound the slice at the next branch, which is where the neighbouring AI begins.
  const end = source.indexOf("} else if (mob.isCustomMob) {", start);
  const branch = source.slice(start, end);
  assert.match(branch, /const hostile = mob\.arenaChallenger === true \|\| isProvoked\(mob\)/);
  assert.match(branch, /if \(!hostile\) \{/, 'the neutral case is its own branch');
  assert.match(branch, /gazeProvokes\(\{/, 'gaze provocation is wired in');
  assert.match(branch, /provoke\(mob, 'gaze'\)/);
  // The attack must sit inside the hostile branch, after it, not before.
  const hostileIndex = branch.indexOf('if (!hostile) {');
  const attackIndex = branch.indexOf('ENDERMAN_ATTACK_DAMAGE');
  assert.ok(attackIndex > hostileIndex, 'the attack must be inside the hostile branch');
  // And the periodic teleport must too.
  const teleportIndex = branch.indexOf('this.teleportEnderman(mob);');
  assert.ok(teleportIndex > hostileIndex, 'so must the arena teleport');
  assert.match(branch, /No periodic teleport while neutral/, 'and the neutral case says so');
});

test('hitting one angers it through the damage path', () => {
  const source = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  // Anchored on the hurt handler's own `else if`, not on the sound call inside it: `playEndermanHurt` comes
  // AFTER the branch keyword, so searching forward from the sound found the update branch instead.
  const i = source.indexOf("else if (mob.type === 'enderman') {");
  assert.ok(i > 0, 'the hurt handler is found');
  const block = source.slice(i, i + 500);
  assert.match(block, /provoke\(mob, 'damage'\)/, 'damage is a provocation');
  // Order matters the other way round from what I first asserted: the hurt SOUND comes first, and the
  // provocation is recorded immediately after it, before the random teleport-away reaction.
  const sound = block.indexOf('playEndermanHurt');
  const provoked = block.indexOf("provoke(mob, 'damage')");
  const evade = block.indexOf('teleportEnderman(mob)');
  assert.ok(provoked > sound, 'the provocation is recorded after the hurt sound');
  assert.ok(provoked < evade, 'and before the evade reaction, so anger is never conditional on the roll');
});

test('the attack reach is the constant the branch uses', () => {
  const source = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  assert.match(source, /dist < ENDERMAN_ATTACK_REACH && mob\.attackCooldown <= 0/);
  assert.equal(/dist < 1\.8 && mob\.attackCooldown/.test(source), false, 'the bare 1.8 is gone');
  assert.equal(ENDERMAN_ATTACK_REACH, 1.8, 'and the constant keeps the old value');
});
