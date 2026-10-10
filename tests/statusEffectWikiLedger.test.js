// Status effect parity ledger against https://minecraft.wiki/w/Effect.
//
// The per-effect intervals and the level-I magnitudes are asserted in statusEffects.test.js,
// miningEffects.test.js and fallDamage.test.js. This file covers what those do not: which of the wiki's
// effects this table knows at all, how each one scales with LEVEL, and where it still knowingly differs.
//
// Four deviations this file used to record as passing "known deviation" cases were fixed rather than kept:
// Resistance, Speed/Slowness and Strength/Weakness were multiplicative where the wiki is additive, and nine
// of the wiki's effects were absent from the table. Each of those is now asserted as the wiki's rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECTS, VANILLA_EFFECT_IDS, UNIMPLEMENTED_EFFECTS, EFFECT_IMMUNITY,
  isKnownEffect, absorptionShield, attackDamageBonus, damageTakenMultiplier,
  jumpVelocityMultiplier, miningSpeedMultiplier, compoundEffects, speedMultiplier, tickEffect,
  tickIntervalFor, instantAmount, exhaustionFor, immuneToEffect, deathEffectFor, effectNames,
  INSTANT_EFFECT_IDS, VANILLA_JUMP,
} from '../src/statusEffects.js';

/** Effect entries shaped the way player.statusEffects yields them: `amplifier` is 0-based. */
const active = (...pairs) => new Map(pairs.map(([name, level = 1]) => [name, { amplifier: level - 1 }]));
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${what}: expected ${expected}, got ${actual}`);

// --- the list itself -------------------------------------------------------------

test('the table holds every effect vanilla 1.21.4 defines, and nothing it does not', () => {
  // The wiki's own list. `turtle_master` is the deliberate extra: it is not a status the player holds but
  // the rule that expands the potion into Slowness and Resistance, and it lives here next to them.
  const have = Object.keys(EFFECTS).filter((k) => k !== 'turtle_master');
  assert.deepEqual(have.filter((k) => !VANILLA_EFFECT_IDS.includes(k)), [],
    'these are in the table and are not vanilla effects');
  assert.deepEqual(VANILLA_EFFECT_IDS.filter((k) => !have.includes(k)), [],
    'these vanilla effects are missing from the table');
  assert.equal(have.length, 39, 'vanilla 1.21.4 defines 39 effects');
  // And the four the wiki lists that this game cannot express are named rather than silently absent.
  assert.deepEqual(Object.keys(UNIMPLEMENTED_EFFECTS).sort(),
    ['breath_of_the_nautilus', 'fatal_poison', 'freezing', 'village_hero']);
});

test('every effect has a name, a category and a potency rule', () => {
  for (const [key, def] of Object.entries(EFFECTS)) {
    assert.equal(typeof def.name, 'string', `${key} needs a display name`);
    assert.ok(def.name.length > 0, `${key} has an empty display name`);
    assert.ok(['beneficial', 'harmful', 'neutral'].includes(def.category),
      `${key} has an unknown category ${def.category}`);
    // Every effect carries the wiki's own "scales with potency" answer, except the compound rule which is
    // not an effect the player holds.
    if (key !== 'turtle_master') {
      assert.equal(typeof def.scalesWithPotency, 'boolean', `${key} must say whether potency matters`);
    }
  }
});

test('the wiki\'s "scales with potency" column is reproduced', () => {
  // The wiki lists which effects get stronger with level. Reproducing that column is what stops a level II
  // potion from silently doing nothing more than a level I one.
  const scales = ['speed', 'slowness', 'haste', 'mining_fatigue', 'strength', 'instant_health',
    'instant_damage', 'jump_boost', 'regeneration', 'resistance', 'hunger', 'weakness', 'poison',
    'wither', 'health_boost', 'absorption', 'saturation', 'levitation', 'luck', 'unluck',
    'conduit_power', 'dolphins_grace', 'bad_omen', 'hero_of_the_village', 'raid_omen'];
  const doesNot = ['fire_resistance', 'water_breathing', 'invisibility', 'blindness', 'night_vision',
    'slow_falling', 'glowing', 'nausea', 'darkness', 'trial_omen', 'wind_charged', 'weaving', 'oozing',
    'infested'];
  for (const key of scales) {
    assert.equal(EFFECTS[key]?.scalesWithPotency, true, `${key} should scale with potency`);
  }
  for (const key of doesNot) {
    assert.equal(EFFECTS[key]?.scalesWithPotency, false, `${key} should not scale with potency`);
  }
  // Together those two lists are the whole table bar the compound rule.
  assert.equal(scales.length + doesNot.length, Object.keys(EFFECTS).length - 1);
});

// --- the per-level rules that the wiki gives ---------------------------------------

test('Absorption, Haste and Mining Fatigue keep the wiki\'s figures', () => {
  // Absorption: "adds 4 absorption points per level", and a stronger application replaces rather than adds.
  near(absorptionShield(active(['absorption', 1])), 4, 'absorption I');
  near(absorptionShield(active(['absorption', 2])), 8, 'absorption II');
  near(absorptionShield(active(['absorption', 2], ['absorption', 4])), 16, 'the strongest application wins');

  // Haste: "+20% mining speed per level", additive on the multiplier.
  near(miningSpeedMultiplier(active(['haste', 1])), 1.2, 'haste I');
  near(miningSpeedMultiplier(active(['haste', 2])), 1.4, 'haste II');
  near(miningSpeedMultiplier(active(['haste', 4])), 1.8, 'haste IV');

  // Mining Fatigue: 0.3^level, floored at level IV, which is the shape the wiki describes and the reason
  // the Elder Guardian's level III curse stops mining almost entirely.
  near(miningSpeedMultiplier(active(['mining_fatigue', 1])), 0.3, 'mining fatigue I');
  near(miningSpeedMultiplier(active(['mining_fatigue', 2])), 0.09, 'mining fatigue II');
  near(miningSpeedMultiplier(active(['mining_fatigue', 3])), 0.027, 'mining fatigue III, the guardian curse');
  near(miningSpeedMultiplier(active(['mining_fatigue', 4])), 0.0081, 'mining fatigue IV');
  near(miningSpeedMultiplier(active(['mining_fatigue', 8])), 0.0081, 'and it stops falling at level IV');

  // The two multiply, which is what makes a guardian's curse plus Haste still hopeless.
  near(miningSpeedMultiplier(active(['haste', 2], ['mining_fatigue', 3])), 1.4 * 0.027, 'both at once');

  // Jump Boost: vanilla's jump is 0.42 blocks/tick and the effect adds 0.1 per level.
  near(jumpVelocityMultiplier(active(['jump_boost', 1])),
    (VANILLA_JUMP.velocity + VANILLA_JUMP.boostPerLevel) / VANILLA_JUMP.velocity, 'jump boost I');
  near(jumpVelocityMultiplier(active(['jump_boost', 2])),
    (VANILLA_JUMP.velocity + 2 * VANILLA_JUMP.boostPerLevel) / VANILLA_JUMP.velocity, 'jump boost II');
  near(jumpVelocityMultiplier(active()), 1, 'no effect leaves the jump alone');

  // Turtle Master is one brew standing for two statuses: Slowness IV and Resistance III regular, Slowness
  // VI and Resistance IV enhanced.
  assert.deepEqual(compoundEffects('turtle_master'), [['slowness', 4], ['resistance', 3]]);
  assert.deepEqual(compoundEffects('turtle_master', 2), [['slowness', 6], ['resistance', 4]]);
  assert.deepEqual(compoundEffects('speed'), [], 'an ordinary effect stands for nothing');
});

test('resistance, speed, slowness, strength and weakness are additive, as the wiki writes them', () => {
  // "Resistance reduces damage by 20% x level" -> 0.8, 0.6, 0.4, 0.2, capped at level IV.
  for (const [level, expected] of [[1, 0.8], [2, 0.6], [3, 0.4], [4, 0.2], [9, 0.2]]) {
    near(damageTakenMultiplier(active(['resistance', level])), expected, `resistance ${level}`);
  }
  // "Speed increases movement speed by 20% per level" and Slowness removes 15%, in one additive term.
  for (const [level, expected] of [[1, 1.2], [2, 1.4], [3, 1.6]]) {
    near(speedMultiplier(active(['speed', level])), expected, `speed ${level}`);
  }
  for (const [level, expected] of [[1, 0.85], [2, 0.7], [3, 0.55]]) {
    near(speedMultiplier(active(['slowness', level])), expected, `slowness ${level}`);
  }
  near(speedMultiplier(active(['speed'], ['slowness'])), 1.05, 'one level of each is exactly +5%');
  // "Strength increases melee damage by 3 HP x level"; Weakness subtracts a flat 4.
  near(attackDamageBonus(active(['strength', 2])), 6, 'strength II adds six damage');
  near(attackDamageBonus(active(['weakness', 3])), -12, 'weakness III removes twelve');
  near(attackDamageBonus(active(['strength', 2], ['weakness', 1])), 2, 'and they add together');
});

test('Regeneration halves its interval per level, with the wiki\'s floor', () => {
  // The wiki's table is "ticks per HP": 50, 25, 12, 6, 3, then 1 from level VI. At 20 ticks a second that
  // is 2.5 s, 1.25, 0.6, 0.3, 0.15, 0.05, and 0.05 thereafter.
  const expected = [2.5, 1.25, 0.6, 0.3, 0.15, 0.05, 0.05, 0.05];
  expected.forEach((seconds, i) => near(tickIntervalFor('regeneration', i + 1), seconds, `regeneration ${i + 1}`));
  // Every other ticking effect has a flat interval, so a higher level is duration and not speed.
  for (const name of ['poison', 'wither']) {
    for (const level of [1, 2, 5]) {
      near(tickIntervalFor(name, level), EFFECTS[name].tickInterval, `${name} at level ${level}`);
    }
  }
  assert.equal(tickIntervalFor('speed', 3), undefined, 'an effect with no interval has none');
  assert.equal(tickIntervalFor('not_an_effect', 1), undefined);
});

test('the damage-over-time effects tick on their own interval and carry their kill rule', () => {
  // Poison cannot kill and Wither can, which is the difference the wiki draws between them.
  const poison = {};
  assert.equal(tickEffect('poison', poison, 1.0), null, 'nothing before the interval');
  assert.deepEqual(tickEffect('poison', poison, 0.3), { damage: 1, cannotKill: true, damageType: 'magic' },
    'poison ticks 1.25 s in and cannot kill');
  const wither = {};
  assert.deepEqual(tickEffect('wither', wither, 2.0), { damage: 1, cannotKill: false, damageType: 'wither' },
    'wither ticks 2 s in and can kill');
  assert.equal(tickEffect('speed', {}, 10), null, 'an effect with no per-tick rule returns nothing');
  assert.equal(tickEffect('not_an_effect', {}, 10), null, 'and neither does an unknown one');
});

test('the instant effects double their amount per level', () => {
  // Instant Health restores 4 HP at level I and doubles; Instant Damage deals 6 and doubles. The table
  // read a flat 4 and 6 before, so a level III potion -- which a command or a data pack can make, and
  // which the potion data's own `level` field describes -- delivered a quarter of what it should.
  for (const [level, expected] of [[1, 4], [2, 8], [3, 16], [4, 32]]) {
    near(instantAmount('instant_health', level), expected, `instant health ${level}`);
  }
  for (const [level, expected] of [[1, 6], [2, 12], [3, 24], [4, 48]]) {
    near(instantAmount('instant_damage', level), expected, `instant damage ${level}`);
  }
  assert.equal(instantAmount('speed', 3), 0, 'a held effect has no instant amount');
  assert.deepEqual([...INSTANT_EFFECT_IDS].sort(), ['instant_damage', 'instant_health']);
});

test('Hunger costs extra exhaustion, which it previously did not', () => {
  // The wiki gives Hunger a per-action exhaustion surcharge scaled by level. It had a name and a category
  // here and no rule behind it, so the effect changed nothing about hunger at all.
  assert.ok(exhaustionFor('hunger', 1) > 0, 'hunger I costs something');
  near(exhaustionFor('hunger', 2), exhaustionFor('hunger', 1) * 2, 'and level II costs twice as much');
  near(exhaustionFor('speed', 3), 0, 'an effect with no exhaustion rule costs nothing');
  near(exhaustionFor('not_an_effect', 1), 0);
});

// --- immunity ----------------------------------------------------------------------

test('the mobs vanilla makes immune to an effect are immune here', () => {
  // "The ender dragon, the wither, NPCs and the agent are immune to all effects."
  for (const mob of EFFECT_IMMUNITY.all) {
    for (const effect of ['poison', 'wither', 'speed', 'regeneration']) {
      assert.equal(immuneToEffect(effect, mob), true, `${mob} is immune to everything`);
    }
  }
  // "Undead mobs are immune to Regeneration and Poison."
  for (const mob of ['zombie', 'skeleton', 'wither_skeleton', 'drowned', 'husk', 'zoglin']) {
    assert.equal(immuneToEffect('regeneration', mob), true, `${mob} is undead`);
    assert.equal(immuneToEffect('poison', mob), true, `${mob} is undead`);
    assert.equal(immuneToEffect('speed', mob), false, `${mob} is still affected by Speed`);
  }
  // "Wither skeletons are immune to Wither in addition to Regeneration and Poison."
  assert.equal(immuneToEffect('wither', 'wither_skeleton'), true);
  assert.equal(immuneToEffect('wither', 'zombie'), false, 'a plain zombie still withers');
  // "Spiders and cave spiders are immune to Poison."
  assert.equal(immuneToEffect('poison', 'spider'), true);
  assert.equal(immuneToEffect('poison', 'cave_spider'), true);
  assert.equal(immuneToEffect('poison', 'pig'), false, 'a pig is not immune to poison');
  // The trial-chamber effects, each immune on the mob that applies it.
  assert.equal(immuneToEffect('oozing', 'slime'), true);
  assert.equal(immuneToEffect('infested', 'silverfish'), true);
  assert.equal(immuneToEffect('wind_charged', 'breeze'), true);
  assert.equal(immuneToEffect('raid_omen', 'pillager'), true);
  assert.equal(immuneToEffect('raid_omen', 'zombie'), false);
  // Nonsense in, false out rather than a throw.
  assert.equal(immuneToEffect('poison', null), false);
  assert.equal(immuneToEffect(null, 'zombie'), false);
  assert.equal(immuneToEffect('not_an_effect', 'zombie'), false);
});

test('the four trial-chamber effects each leave something behind on death', () => {
  // These fire once when the bearer dies rather than ticking, which is what `onDeath` records.
  assert.equal(deathEffectFor('infested'), 'silverfish');
  assert.equal(deathEffectFor('oozing'), 'slime');
  assert.equal(deathEffectFor('weaving'), 'cobweb');
  assert.equal(deathEffectFor('wind_charged'), 'wind_charge');
  assert.equal(deathEffectFor('speed'), null, 'an ordinary effect leaves nothing');
  assert.equal(deathEffectFor('not_an_effect'), null);
});

// --- what is still not modelled ------------------------------------------------------

test('known deviation: the ominous and fishing effects are named but inert', () => {
  // Bad Omen, Trial Omen, Raid Omen and Hero of the Village are in the table with the wiki's category and
  // potency flag, and nothing reads them: this game has no raid, no trial spawner and no village-hero
  // discount. Luck and Bad Luck are likewise named, since fishing loot quality is not modelled.
  for (const key of ['bad_omen', 'trial_omen', 'raid_omen', 'hero_of_the_village', 'luck', 'unluck']) {
    assert.equal(isKnownEffect(key), true, `${key} is a known effect`);
    const def = EFFECTS[key];
    const hasRule = Object.keys(def).some((f) => !['name', 'category', 'scalesWithPotency'].includes(f));
    assert.equal(hasRule, false, `${key} is expected to carry no rule yet`);
  }
});

test('known deviation: Health Boost and Saturation are named but inert', () => {
  // Both scale with potency in vanilla -- Health Boost raises the maximum by 4 per level and Saturation
  // restores hunger and saturation -- and neither is read by the player. They are in the table so a
  // command or an apple that grants one attaches to a real effect.
  assert.equal(EFFECTS.health_boost.healthPerLevel, 4, 'the figure is recorded');
  assert.equal(isKnownEffect('saturation'), true);
  // And the game does not yet consume the recorded figure, which is the deviation.
  assert.equal(typeof EFFECTS.health_boost.maxHealthBonus, 'undefined');
});
