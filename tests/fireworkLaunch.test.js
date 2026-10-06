// A firework rocket can be launched.
//
// The item existed with an icon and had no consumer at all. `EntityManager.spawnFireworkRocket` was already
// fully built -- mesh, rising trail, burst and launch sound -- and was called from exactly one place, a
// tournament celebration, so a player could hold a rocket and do nothing with it. That is the same shape as
// the tipped arrows and the potions: content and machinery both present, consumer absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { launchFirework, FIREWORK_BASE_RISE, FIREWORK_RISE_PER_PITCH } from '../src/fireworks.js';
import { ELYTRA_BOOST_SECONDS } from '../src/elytra.js';

/** A game stub that records what a launch did. */
function launcher({ pitch = 0, gamemode = 'survival' } = {}) {
  const log = [];
  const game = {
    player: {
      position: new THREE.Vector3(0, 0, 0), eyeHeight: 1.62, gamemode,
    },
    camera: {
      getWorldDirection: (v) => { v.set(0, pitch, -Math.sqrt(Math.max(0, 1 - pitch * pitch))); return v; },
    },
    entities: { spawnFireworkRocket: (pos, height) => log.push({ did: 'spawn', y: pos.y, height }) },
    inventory: { consumeActiveItem: (n) => log.push({ did: 'consume', n }) },
    ui: { updateHotbar: () => log.push({ did: 'hotbar' }) },
  };
  return { game, log };
}

test('launching a rocket spawns one from eye height and consumes it', () => {
  const { game, log } = launcher();
  assert.equal(launchFirework(game, 'firework_rocket'), true, 'the rocket should launch');
  const spawn = log.find(x => x.did === 'spawn');
  assert.ok(spawn, 'a rocket should be spawned');
  assert.ok(Math.abs(spawn.y - 1.62) < 1e-9, 'from eye height, got ' + spawn.y);
  assert.ok(log.some(x => x.did === 'consume' && x.n === 1), 'and one rocket used');
  assert.ok(log.some(x => x.did === 'hotbar'), 'and the hotbar refreshed');
});

test('looking up throws it higher, looking down still rises', () => {
  const level = launcher({ pitch: 0 });
  launchFirework(level.game, 'firework_rocket');
  const up = launcher({ pitch: 1 });
  launchFirework(up.game, 'firework_rocket');
  const down = launcher({ pitch: -1 });
  launchFirework(down.game, 'firework_rocket');

  const height = (l) => l.log.find(x => x.did === 'spawn').height;
  assert.ok(Math.abs(height(level) - (1.62 + FIREWORK_BASE_RISE)) < 1e-6,
    'a level throw should rise the base amount');
  assert.ok(Math.abs(height(up) - (1.62 + FIREWORK_BASE_RISE + FIREWORK_RISE_PER_PITCH)) < 1e-6,
    'looking straight up should add the full pitch term');
  // Aiming at the ground must not send it downwards: the rocket animates upward and the pitch is clamped to
  // the upper half, so this is the floor rather than a negative rise.
  assert.ok(Math.abs(height(down) - height(level)) < 1e-6,
    'looking down should not lower the burst below a level throw');
});

test('the pitch term is clamped, so a non-unit direction cannot overshoot', () => {
  // `getWorldDirection` returns a unit vector, but the clamp is what makes that an assumption rather than a
  // requirement -- a longer vector must not produce a huge rise.
  const { game, log } = launcher();
  game.camera.getWorldDirection = (v) => { v.set(0, 5, 0); return v; };
  launchFirework(game, 'firework_rocket');
  const spawn = log.find(x => x.did === 'spawn');
  assert.ok(spawn.height <= 1.62 + FIREWORK_BASE_RISE + FIREWORK_RISE_PER_PITCH + 1e-6,
    'a y of 5 must clamp to 1, got a burst at ' + spawn.height);
});

test('anything that is not a rocket falls through untouched', () => {
  for (const id of ['arrow', 'potion_of_healing', 'snowball', 'bread', '', undefined, null]) {
    const { game, log } = launcher();
    assert.equal(launchFirework(game, id), false, String(id) + ' should not launch');
    assert.deepEqual(log, [], String(id) + ' should have no effect at all');
  }
});

test('creative launches without consuming the rocket', () => {
  const { game, log } = launcher({ gamemode: 'creative' });
  assert.equal(launchFirework(game, 'firework_rocket'), true);
  assert.ok(log.some(x => x.did === 'spawn'), 'the rocket still launches');
  assert.equal(log.some(x => x.did === 'consume'), false, 'but nothing is used up');
});

test('a missing entity manager or camera does not throw', () => {
  // The launch is a side effect on another subsystem, so a game without one must not crash the use path.
  const bare = { player: { position: new THREE.Vector3(), eyeHeight: 1.62, gamemode: 'survival' } };
  assert.doesNotThrow(() => launchFirework(bare, 'firework_rocket'));
  const noPlayer = { entities: { spawnFireworkRocket() {} } };
  assert.equal(launchFirework(noPlayer, 'firework_rocket'), false, 'and without a player there is nothing to launch');
});

test('a rocket boosts a glide instead of spawning one', () => {
  // This is what a rocket is primarily FOR in vanilla, and it is why `src/fireworks.js` imports the boost
  // duration from `src/elytra.js` rather than declaring its own.
  const { game, log } = launcher();
  game.player.isGliding = true;
  assert.equal(launchFirework(game, 'firework_rocket'), true, 'the rocket should be used');
  assert.equal(game.player.elytraBoost, ELYTRA_BOOST_SECONDS, 'and set the glide boost');
  assert.equal(log.some(x => x.did === 'spawn'), false,
    'no rising rocket should spawn while gliding -- the thrust goes to the player');
  assert.ok(log.some(x => x.did === 'consume' && x.n === 1), 'and the rocket is still used up');
});

test('the launch hook is wired into the use chain', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ launchFirework \} from '\.\/fireworks\.js'/,
    'main.js should import the launcher');
  const call = source.indexOf('if (launchFirework(this, activeItem?.id)) return;');
  assert.ok(call > 0, 'main.js should call launchFirework in the use chain');
  const drink = source.indexOf('if (drinkPotion(this, activeItem?.id)) return;');
  const place = source.indexOf("['minecart', 'chest_minecart'");
  assert.ok(drink > 0 && place > 0, 'the drinking and placing branches should both still exist');
  assert.ok(call > drink && call < place, 'launching should follow drinking and precede block placement');
});
