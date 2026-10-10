// Status effect parity ledger against https://minecraft.wiki/w/Effect.
//
// The per-effect intervals and the level-I magnitudes are already asserted in statusEffects.test.js,
// miningEffects.test.js and fallDamage.test.js. This file covers what those do not: how the effects scale
// with LEVEL, which of the wiki's effects this build knows at all, and where it knowingly differs from the
// wiki. Those deviations are written as `known deviation:` cases that pass while pinning today's figure
// with the wiki's figure in the message, so changing the behaviour fails the test and points at the rule
// rather than sliding past unnoticed. Nothing here changes gameplay; it records it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECTS, isKnownEffect, absorptionShield, attackMultiplier, damageTakenMultiplier,
  jumpVelocityMultiplier, miningSpeedMultiplier, compoundEffects, speedMultiplier, tickEffect, effectNames,
  VANILLA_JUMP,
} from '../src/statusEffects.js';

/** Effect entries shaped the way player.statusEffects yields them: `amplifier` is 0-based. */
const active = (...pairs) => new Map(pairs.map(([name, level = 1]) => [name, { amplifier: level - 1 }]));
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${what}: expected ${expected}, got ${actual}`);

test('the wiki\'s per-level rules that DO hold here', () => {
  // Absorption: "adds 4 absorption points per level", and a stronger application replaces rather than adds.
  near(absorptionShield(active(['absorption', 1])), 4, 'absorption I');
  near(absorptionShield(active(['absorption', 2])), 8, 'absorption II');
  near(absorptionShield(active(['absorption', 2], ['absorption', 4])), 16, 'the strongest application wins');

  // Haste: "+20% mining speed per level", additive on the multiplier.
  near(miningSpeedMultiplier(active(['haste', 1])), 1.2, 'haste I');
  near(miningSpeedMultiplier(active(['haste', 2])), 1.4, 'haste II');
  near(miningSpeedMultiplier(active(['haste', 4])), 1.8, 'haste IV');

  // Mining Fatigue: this build's rule is 0.3^level, floored at level IV, which is the shape the wiki
  // describes and the reason the Elder Guardian's level III curse stops mining almost entirely.
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

  // Turtle Master is one brew standing for two statuses, as the wiki describes it: Slowness IV and
  // Resistance III regular, Slowness VI and Resistance IV enhanced.
  assert.deepEqual(compoundEffects('turtle_master'), [['slowness', 4], ['resistance', 3]]);
  assert.deepEqual(compoundEffects('turtle_master', 2), [['slowness', 6], ['resistance', 4]]);
  assert.deepEqual(compoundEffects('speed'), [], 'an ordinary effect stands for nothing');
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

test('known deviation: regeneration does not quicken with level', () => {
  // The wiki: Regeneration restores 1 HP every 50 ticks, halved for each level (50 >> (level - 1)), so
  // Regeneration II heals every 1.25 s and IV every 0.3125 s. Here the interval is flat, so a level IV
  // potion heals at exactly the level I rate.
  assert.equal(EFFECTS.regeneration.tickInterval, 2.5, 'the flat interval this build uses');
  const first = {};
  const second = {};
  near(tickEffect('regeneration', first, 2.5).heal, 1, 'regeneration I heals 1 HP after 2.5 s');
  near(tickEffect('regeneration', second, 2.5).heal, 1, 'and regeneration IV heals the same, not four times');
});

test('known deviation: resistance is multiplicative, the wiki is additive', () => {
  // The wiki: "reduces damage by 20% x level" -> 0.8, 0.6, 0.4, 0.2 for levels I-IV. This build multiplies
  // 0.8^level, so level II takes 36% off where the wiki says 40%, and level IV takes 59% off where the wiki
  // says 80%. Level I agrees, which is why the deviation was invisible.
  near(damageTakenMultiplier(active(['resistance', 1])), 0.8, 'resistance I agrees with the wiki');
  near(damageTakenMultiplier(active(['resistance', 2])), 0.64, 'resistance II here (wiki: 0.6)');
  near(damageTakenMultiplier(active(['resistance', 4])), 0.4096, 'resistance IV here (wiki: 0.2)');
  near(damageTakenMultiplier(active(['resistance', 9])), 0.4096, 'and the level IV cap holds');
});

test('known deviation: speed and slowness are multiplicative, the wiki is additive', () => {
  // The wiki: Speed adds 20% per level and Slowness removes 15% per level, both additive, so Speed II is
  // +40% and Slowness II is -30%. Here each is raised to the level, so Speed II is +44% and Slowness II is
  // -27.75%. Level I agrees for both.
  near(speedMultiplier(active(['speed', 1])), 1.2, 'speed I agrees');
  near(speedMultiplier(active(['speed', 2])), 1.44, 'speed II here (wiki: 1.4)');
  near(speedMultiplier(active(['slowness', 1])), 0.85, 'slowness I agrees');
  near(speedMultiplier(active(['slowness', 2])), 0.7225, 'slowness II here (wiki: 0.7)');
});

test('known deviation: strength and weakness scale the damage instead of adding to it', () => {
  // The wiki: Strength adds a flat 3 attack damage per level and Weakness subtracts a flat 4, so their size
  // relative to a hit depends on the weapon. This build multiplies the whole hit (1.3^level, 0.8^level),
  // which is the Mineclonia rule docs/survival-parity-rules.md was written against.
  near(attackMultiplier(active(['strength', 1])), 1.3, 'strength I');
  near(attackMultiplier(active(['strength', 2])), 1.69, 'strength II here; the wiki would add 6 damage');
  near(attackMultiplier(active(['weakness', 1])), 0.8, 'weakness I');
  near(attackMultiplier(active(['weakness', 2])), 0.64, 'weakness II here; the wiki would subtract 4, flat');
});

test('known deviation: the table is missing nine of the wiki\'s effects', () => {
  // Every effect Java 1.20.2 defines should be nameable, even before it has a rule. These nine are not, so
  // a potion or a command that applies one has nothing to attach it to.
  const present = [
    'poison', 'wither', 'regeneration', 'strength', 'weakness', 'resistance', 'speed', 'slowness',
    'jump_boost', 'levitation', 'haste', 'mining_fatigue', 'fire_resistance', 'water_breathing',
    'conduit_power', 'dolphins_grace', 'slow_falling', 'night_vision', 'invisibility', 'absorption',
    'hunger', 'blindness', 'glowing', 'turtle_master',
  ];
  for (const name of present) assert.equal(isKnownEffect(name), true, `${name} is known`);
  assert.equal(effectNames().length, present.length, 'and the table holds exactly these');

  const missing = [
    'bad_omen', 'hero_of_the_village', 'darkness', 'nausea', 'health_boost',
    'instant_health', 'instant_damage', 'saturation', 'unluck',
  ];
  for (const name of missing) {
    assert.equal(isKnownEffect(name), false, `${name} is still absent (wiki: ${name.replace(/_/g, ' ')})`);
  }
});

test('known deviation: the Hunger effect carries no exhaustion rule', () => {
  // The wiki gives Hunger an extra exhaustion cost for moving, jumping and mining, scaled by level. Here it
  // is named and categorised, with no rule behind it, so the effect changes nothing about hunger.
  assert.equal(isKnownEffect('hunger'), true, 'hunger is a known effect');
  assert.equal(EFFECTS.hunger.tickInterval, undefined, 'but it has no per-tick rule');
  assert.equal(EFFECTS.hunger.exhaustionPerLevel, undefined, 'and no exhaustion figure');
});
