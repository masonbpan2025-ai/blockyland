// Thrown splash potions.
//
// The throw in `main.js` was hard-coded to one item, and the id it also accepted -- `potion_weakness` -- is
// not an item that exists. So **39 splash potion items did nothing at all** when used, and every one of them
// brews from gunpowder plus any potion.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { isSplashPotion, splashPotionEffect, splashTargets, throwSplashPotion, SPLASH_RADIUS }
  from '../src/splashPotion.js';
import { POTION_DATA } from '../src/brewing.js';
import { ITEMS } from '../src/blocks.js';

/** Every splash item the registry holds. */
const SPLASH_IDS = Object.keys(ITEMS).filter(id => id.startsWith('splash_'));

test('every splash item the registry holds is recognised', () => {
  // The whole point: this was one item before, and the registry has far more.
  assert.ok(SPLASH_IDS.length > 30, 'expected many splash items, got ' + SPLASH_IDS.length);
  const missed = SPLASH_IDS.filter(id => !isSplashPotion(id));
  assert.deepEqual(missed, [], 'these splash items would fall through to block placement: ' + missed.join(', '));
});

test('each splash effect comes from its potion, not from a constant', () => {
  // The old code applied `weakness` for 60 seconds whatever the potion was.
  for (const [splashId, base] of [['splash_potion_of_healing', 'potion_of_healing'],
    ['splash_potion_of_strength', 'potion_of_strength'],
    ['splash_potion_of_poison', 'potion_of_poison'],
    ['splash_potion_of_swiftness_long', 'potion_of_swiftness_long']]) {
    const effect = splashPotionEffect(splashId);
    const data = POTION_DATA[base];
    assert.equal(effect.id, data.effect, splashId + ' should carry ' + data.effect);
    // An INSTANT potion has no duration in the table, which is why the module defaults to one second rather
    // than to zero -- an effect of length zero would be dropped or applied for no time. The first version of
    // this assertion compared against `data.duration` directly and failed on the healing potion.
    assert.equal(effect.seconds, data.duration ?? 1, splashId + ' should last its own potion\'s time');
    assert.ok(effect.seconds > 0, splashId + ' must last a positive time');
    assert.equal(effect.level, data.level ?? 1);
  }
  // The specific regression: a splash Strength must not be weakness for 60 seconds.
  assert.notEqual(splashPotionEffect('splash_potion_of_strength').id, 'weakness');
  assert.notEqual(splashPotionEffect('splash_potion_of_strength').seconds, 60);
});

test('a splash potion that grants nothing is still thrown', () => {
  // A water bottle and the brewing intermediates are throwable in vanilla and do nothing.
  for (const id of ['splash_water_bottle', 'splash_awkward_potion', 'splash_thick_potion']) {
    if (!ITEMS[id]) continue;
    assert.equal(isSplashPotion(id), true, id + ' should be throwable');
    assert.equal(splashPotionEffect(id), null, id + ' grants no effect');
    const game = { mobs: { mobs: [] }, player: { applyStatusEffect() { throw new Error('must not apply'); } } };
    assert.equal(throwSplashPotion(game, new THREE.Vector3(), id), true,
      id + ' should be consumed rather than falling through to placement');
  }
});

test('anything that is not a splash potion is left alone', () => {
  for (const id of ['potion_of_healing', 'arrow', 'weakness', 'potion_weakness', '', undefined, null]) {
    assert.equal(isSplashPotion(id), false, String(id) + ' is not a splash potion');
    assert.equal(splashPotionEffect(id), null);
    const game = { mobs: { mobs: [] }, player: {} };
    assert.equal(throwSplashPotion(game, new THREE.Vector3(), id), false, String(id) + ' must fall through');
  }
  // `potion_weakness` is worth naming: it is the id the old condition also accepted, and it does not exist.
  assert.equal(Object.prototype.hasOwnProperty.call(ITEMS, 'potion_weakness'), false,
    'the old code accepted an item id that was never registered');
});

test('the radius is four blocks and excludes the dead', () => {
  assert.equal(SPLASH_RADIUS, 4.0);
  const center = new THREE.Vector3(0, 0, 0);
  const at = (x, y, z, health) => ({ mesh: { position: new THREE.Vector3(x, y, z) }, health });
  const inside = at(3, 0, 0, 10);
  const edge = at(4, 0, 0, 10);
  const outside = at(4.1, 0, 0, 10);
  const dead = at(1, 0, 0, 0);
  const hits = splashTargets(center, [inside, edge, outside, dead]);
  assert.deepEqual(hits, [inside, edge], 'exactly the two live entities within four blocks');
  // A player has no health field and must not be excluded for that reason.
  const player = { position: new THREE.Vector3(1, 0, 0) };
  assert.deepEqual(splashTargets(center, [player]), [player]);
  // It is a sphere, not a cylinder: high above the centre is out of range.
  assert.deepEqual(splashTargets(center, [at(0, 5, 0, 10)]), []);
  // And nonsense input yields an empty list rather than throwing.
  assert.deepEqual(splashTargets(null, [inside]), []);
  assert.deepEqual(splashTargets(center, null), []);
  assert.deepEqual(splashTargets(center, [null, undefined]), []);
  assert.deepEqual(splashTargets(center, [{}]), [], 'an entity with no position is skipped');
});

test('a throw reaches the player as well as the mobs', () => {
  // The old code looped `this.mobs.mobs` only. A self-splash is how Fire Resistance is meant to be drunk,
  // and standing in your own Harming potion is meant to hurt.
  const applied = [];
  const target = (name) => ({ applyStatusEffect: (id, s, l) => applied.push({ name, id, s, l }) });
  const mob = target('mob');
  mob.mesh = { position: new THREE.Vector3(1, 0, 0) };
  mob.health = 10;
  const player = target('player');
  player.position = new THREE.Vector3(1, 0, 0);
  const far = target('far');
  far.mesh = { position: new THREE.Vector3(50, 0, 0) };
  far.health = 10;

  const game = { mobs: { mobs: [mob, far] }, player };
  assert.equal(throwSplashPotion(game, new THREE.Vector3(0, 0, 0), 'splash_potion_of_fire_resistance'), true);
  assert.deepEqual(applied.map(a => a.name).sort(), ['mob', 'player'],
    'the player and the nearby mob, and not the distant one');
  for (const a of applied) assert.equal(a.id, 'fire_resistance');
});

test('a dead mob is skipped but the player is never excluded for having no health field', () => {
  const applied = [];
  const mob = { mesh: { position: new THREE.Vector3() }, health: 0, applyStatusEffect: () => applied.push('mob') };
  const player = { position: new THREE.Vector3(), applyStatusEffect: () => applied.push('player') };
  throwSplashPotion({ mobs: { mobs: [mob] }, player }, new THREE.Vector3(), 'splash_potion_of_healing');
  assert.deepEqual(applied, ['player']);
});

test('a thrown compound potion lands both of its statuses, not the pair\'s name', () => {
  // The Potion of the Turtle Master is Slowness plus Resistance, and there is no `turtle_master` status
  // in vanilla's HUD. `applyPotionEffect` expanded the pair but this module applied `effect.id` raw, so
  // a thrown Splash Potion of the Turtle Master set a status nothing in `statusEffects.js` reads and
  // granted neither of its two effects. Both paths ask `effectsFor` now.
  const applied = [];
  const player = { position: new THREE.Vector3(), applyStatusEffect: (id, s, l) => applied.push({ id, s, l }) };
  throwSplashPotion({ mobs: { mobs: [] }, player }, new THREE.Vector3(), 'splash_potion_of_turtle_master');
  assert.deepEqual(applied.map(a => a.id), ['slowness', 'resistance'],
    'the pair, and not a `turtle_master` status');
  assert.deepEqual(applied.map(a => a.l), [4, 3], 'regular tier: Slowness IV and Resistance III');
  assert.deepEqual(applied.map(a => a.s), [20, 20], 'for the potion\'s own 0:20');
  assert.equal(applied.some(a => a.id === 'turtle_master'), false);

  applied.length = 0;
  throwSplashPotion({ mobs: { mobs: [] }, player }, new THREE.Vector3(), 'splash_potion_of_turtle_master_2');
  assert.deepEqual(applied.map(a => a.id), ['slowness', 'resistance']);
  assert.deepEqual(applied.map(a => a.l), [6, 4], 'enhanced tier: Slowness VI and Resistance IV');

  applied.length = 0;
  throwSplashPotion({ mobs: { mobs: [] }, player }, new THREE.Vector3(), 'splash_potion_of_turtle_master_long');
  assert.deepEqual(applied.map(a => a.s), [40, 40], 'and the extended brew keeps its 0:40');
});

test('an ordinary splash potion still applies exactly its own single effect', () => {
  // The compound expansion must not turn every potion into a list of one that some caller reads wrongly.
  const effect = splashPotionEffect('splash_potion_of_strength_2');
  assert.equal(effect.id, 'strength');
  assert.deepEqual(effect.effects, [['strength', 2]], 'a one-effect potion expands to itself');
  assert.equal(effect.level, 2);

  const applied = [];
  const player = { position: new THREE.Vector3(), applyStatusEffect: (id, s, l) => applied.push({ id, s, l }) };
  throwSplashPotion({ mobs: { mobs: [] }, player }, new THREE.Vector3(), 'splash_potion_of_strength_2');
  assert.deepEqual(applied, [{ id: 'strength', s: 90, l: 2 }]);
});

test('a mob vanilla makes immune to an effect is skipped for that effect only', () => {
  // "Undead mobs are immune to Regeneration and Poison" and "spiders and cave spiders are immune to
  // Poison". Before this, a splash Potion of Poison thinned out a zombie horde.
  const applied = [];
  const mk = (type) => ({ type, position: new THREE.Vector3(), applyStatusEffect: (id) => applied.push(`${type}:${id}`) });
  const zombie = mk('zombie');
  const spider = mk('spider');
  const pig = mk('pig');
  const game = (player) => ({ mobs: { mobs: [zombie, spider, pig] }, player });

  // Poison: the zombie and the spider are immune, the pig is not.
  applied.length = 0;
  throwSplashPotion(game({ position: new THREE.Vector3(), applyStatusEffect: (id) => applied.push(`player:${id}`) }),
    new THREE.Vector3(), 'splash_potion_of_poison');
  assert.deepEqual(applied.sort(), ['pig:poison', 'player:poison'],
    'only the non-immune mob and the player take poison');

  // Regeneration: the zombie is immune, the others are not. The player is never immune.
  applied.length = 0;
  throwSplashPotion(game({ position: new THREE.Vector3(), applyStatusEffect: (id) => applied.push(`player:${id}`) }),
    new THREE.Vector3(), 'splash_potion_of_regeneration');
  assert.deepEqual(applied.sort(), ['pig:regeneration', 'player:regeneration', 'spider:regeneration']);

  // Speed has no immunity list, so everyone takes it.
  applied.length = 0;
  throwSplashPotion(game({ position: new THREE.Vector3(), applyStatusEffect: (id) => applied.push(`player:${id}`) }),
    new THREE.Vector3(), 'splash_potion_of_swiftness');
  assert.equal(applied.length, 4, 'all three mobs and the player');

  // The ender dragon is immune to everything.
  applied.length = 0;
  const dragon = mk('ender_dragon');
  throwSplashPotion({ mobs: { mobs: [dragon] }, player: { position: new THREE.Vector3(), applyStatusEffect: (id) => applied.push(`player:${id}`) } },
    new THREE.Vector3(), 'splash_potion_of_healing');
  assert.deepEqual(applied, ['player:instant_health'], 'the dragon takes nothing, the player takes the heal');
});

test('a target without the method does not throw', () => {
  const game = {
    mobs: { mobs: [{ mesh: { position: new THREE.Vector3() }, health: 10 }] },
    player: { position: new THREE.Vector3() },
  };
  assert.doesNotThrow(() => throwSplashPotion(game, new THREE.Vector3(), 'splash_potion_of_poison'));
});

test('the use chain calls the general throw, not the old one-item condition', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ isSplashPotion, throwSplashPotion \} from '\.\/splashPotion\.js'/);
  assert.match(source, /if \(isSplashPotion\(splashItem\?\.id\)\) \{/, 'the condition should be general');
  assert.match(source, /throwSplashPotion\(this, splashPos, splashItem\.id\)/);
  // And the hard-coded pair must be gone, or it would shadow the general path.
  assert.equal(/splash_potion_of_weakness' \|\|/.test(source), false,
    'the hard-coded weakness condition should be gone');
  assert.equal(/potion_weakness'/.test(source), false,
    'and so should the id that was never registered');
});
