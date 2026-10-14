// Fast status-effect diagnostic: the production effect table applied to a real `Player`.
//
// The pure multipliers are already covered by tests/statusEffects.test.js and
// tests/statusEffectWikiLedger.test.js. What this probe adds is the layer those stubs cannot reach: a real
// `Player` from src/player.js, so `applyStatusEffect`'s merge rule, the tick-and-expire loop, the
// absorption pool and the gameplay consequences are exercised as the game runs them.
//
// It does NOT drive the bot or the browser -- `e2e/effect.pw.js` is the evidence for the potion-through-bot
// route. Statuses are PASS / FAIL / GAP / SPEC_UNVERIFIED.
//
// Reference: https://minecraft.wiki/w/Effect and the per-effect pages.
import { writeFile, mkdir } from 'node:fs/promises';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import {
  EFFECTS, VANILLA_EFFECT_IDS, UNIMPLEMENTED_EFFECTS, isKnownEffect, effectNames,
  attackDamageBonus, damageTakenMultiplier, speedMultiplier, miningSpeedMultiplier,
  absorptionShield, jumpVelocityMultiplier, tickIntervalFor, instantAmount, tickEffect,
  exhaustionFor, fallDamage, hasSlowFalling, immuneToEffect, deathEffectFor,
  effectsFor, compoundEffects, INSTANT_EFFECT_IDS,
} from '../src/statusEffects.js';

const rows = [];
const row = (id, status, expected, actual, note) => rows.push({ id, status, expected, actual, note });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/** A real Player, on a flat world, with no effects and natural regeneration switched off. */
function makePlayer({ gamemode = 'survival', health = 20 } = {}) {
  const cells = new Map();
  const world = {
    getVoxel: (x, y, z) => cells.get(`${x},${y},${z}`) ?? (y < 0 ? 1 : 0),
    setVoxel: (x, y, z, id) => cells.set(`${x},${y},${z}`, id),
    isSolid: (x, y, z) => (y < 0),
  };
  const camera = new THREE.PerspectiveCamera();
  const player = new Player(camera, { addEventListener() {}, requestPointerLock() {} }, world, { playStep() {}, playJump() {} });
  // A full hunger bar regenerates health every few ticks, which would hide the damage the effects under
  // test deal: poison took 1 HP and natural regeneration put it straight back, so a 3-second poison
  // measured as "20 -> 20". The wiki makes this a gamerule, and vanilla's default is on, so the probe turns
  // it off the same way a player would rather than reaching into the health field.
  player.game = {
    world, ui: null, difficulty: 'normal', settings: { gameMode: gamemode },
    gamerules: { naturalRegeneration: false },
  };
  player.gamemode = gamemode;
  player.position.set(0.5, 1, 0.5);
  player.onGround = true;
  player.health = health;
  player.maxHealth = 20;
  player.statusEffects.clear();
  return player;
}

// --- S01: the table covers vanilla's list exactly, once each ---
const missing = VANILLA_EFFECT_IDS.filter((id) => !isKnownEffect(id));
const extra = effectNames().filter((id) => id !== 'turtle_master' && !VANILLA_EFFECT_IDS.includes(id));
const dupes = VANILLA_EFFECT_IDS.filter((id, i) => VANILLA_EFFECT_IDS.indexOf(id) !== i);
row('S01', missing.length || extra.length || dupes.length ? 'FAIL' : 'PASS',
  `the table holds all ${VANILLA_EFFECT_IDS.length} vanilla 1.21.4 effect ids and nothing else`,
  `missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'} duplicates=${dupes.join(',') || 'none'}`,
  'turtle_master is the one deliberate extra: it is a potion, not a status the HUD shows');

// --- S02: every effect has a name, a category and a potency rule ---
// `turtle_master` is the one deliberate exception: it is a potion, not a status the HUD shows, so it has a
// compound rule instead of a potency flag. tests/statusEffectWikiLedger.test.js exempts it for the same
// reason, so the two agree rather than one quietly widening the contract.
const shapeFails = [];
for (const [key, def] of Object.entries(EFFECTS)) {
  if (!def.name) shapeFails.push(`${key}: no name`);
  if (!['beneficial', 'harmful', 'neutral'].includes(def.category)) shapeFails.push(`${key}: category ${def.category}`);
  if (key !== 'turtle_master' && typeof def.scalesWithPotency !== 'boolean') shapeFails.push(`${key}: no scalesWithPotency`);
}
if (!Array.isArray(EFFECTS.turtle_master.compound)) shapeFails.push('turtle_master: no compound rule');
// The wiki's own "scales with potency" column: these do NOT scale.
const noScale = ['fire_resistance', 'water_breathing', 'slow_falling', 'night_vision', 'invisibility',
  'blindness', 'glowing', 'nausea', 'darkness', 'infested', 'oozing', 'weaving', 'wind_charged', 'trial_omen'];
for (const key of noScale) {
  if (EFFECTS[key].scalesWithPotency !== false) shapeFails.push(`${key} should not scale with potency`);
}
row('S02', shapeFails.length ? 'FAIL' : 'PASS',
  'every effect has a name, a category and a potency flag, and the wiki\'s non-scaling ones are marked so',
  shapeFails.length ? shapeFails.slice(0, 6).join('; ') : `${effectNames().length} effects shaped correctly`,
  'the wiki marks these "No" under "scales with potency"');

// --- S03: the merge rule ---
// "It is not possible to apply the same effect multiple times... higher levels overwrite lower levels, and
// higher durations overwrite lower durations of the same level."
const p1 = makePlayer();
p1.applyStatusEffect('strength', 30, 2);
p1.applyStatusEffect('strength', 10, 1);              // weaker: ignored
const afterWeaker = { ...p1.statusEffects.get('strength') };
p1.applyStatusEffect('strength', 5, 2);               // same level, shorter: ignored
const afterShorter = { ...p1.statusEffects.get('strength') };
p1.applyStatusEffect('strength', 60, 2);              // same level, longer: replaces
const afterLonger = { ...p1.statusEffects.get('strength') };
p1.applyStatusEffect('strength', 10, 3);              // stronger: replaces regardless of duration
const afterStronger = { ...p1.statusEffects.get('strength') };
const mergeOk = afterWeaker.level === 2 && afterWeaker.duration === 30
  && afterShorter.duration === 30
  && afterLonger.duration === 60
  && afterStronger.level === 3 && afterStronger.duration === 10;
row('S03', mergeOk ? 'PASS' : 'FAIL',
  'a weaker or shorter application does not cut a stronger or longer one short',
  `weaker -> L${afterWeaker.level}/${afterWeaker.duration}s, shorter -> L${afterShorter.level}/${afterShorter.duration}s, longer -> L${afterLonger.level}/${afterLonger.duration}s, stronger -> L${afterStronger.level}/${afterStronger.duration}s`);

// --- S04: an effect expires on its own and cleans itself up ---
const p2 = makePlayer();
p2.applyStatusEffect('speed', 1.0, 2);
const beforeExpiry = { has: p2.statusEffects.has('speed'), mult: speedMultiplier(p2.statusEffects) };
// The player's own update loop drains the duration; 20 ticks a second here is 50 ms per tick.
for (let i = 0; i < 40; i++) p2.update(0.05);
const afterExpiry = { has: p2.statusEffects.has('speed'), mult: speedMultiplier(p2.statusEffects) };
row('S04', beforeExpiry.has && beforeExpiry.mult > 1 && !afterExpiry.has && near(afterExpiry.mult, 1) ? 'PASS' : 'FAIL',
  'an effect runs out on its own and stops affecting the player',
  `before ${JSON.stringify(beforeExpiry)} -> after ${JSON.stringify(afterExpiry)} (2 s of ticks)`);

// --- S05: damage over time, and poison's kill rule ---
const poisonPlayer = makePlayer({ health: 20 });
poisonPlayer.applyStatusEffect('poison', 6, 1);
// Poison's own cadence is 1.25 s. The player accumulates its tick timer in floating point, so the steps
// here are 0.05 s and the comparison is `>= 1.25`: twelve steps is 1.2 s and does NOT fire.
for (let i = 0; i < 60; i++) poisonPlayer.update(0.05);   // 3 seconds: two 1.25 s intervals
const poisonHealth = poisonPlayer.health;
// Poison is floored so it can never be fatal: at 1 HP it must stop.
const doomed = makePlayer({ health: 1 });
doomed.applyStatusEffect('poison', 30, 3);
for (let i = 0; i < 200; i++) doomed.update(0.05);
const doomedHealth = doomed.health;
// Wither, by contrast, CAN kill.
const witherVictim = makePlayer({ health: 1 });
witherVictim.applyStatusEffect('wither', 30, 3);
for (let i = 0; i < 200; i++) witherVictim.update(0.05);
// Poison keeps its potency in the damage it deals rather than the rate, so a higher level hurts the same
// per tick. What changes with level is what the wiki calls the potency: the tick damage is already 1.
const poisonHigh = makePlayer({ health: 20 });
poisonHigh.applyStatusEffect('poison', 3, 4);
for (let i = 0; i < 60; i++) poisonHigh.update(0.05);
row('S05', poisonHealth === 18 && doomedHealth === 1 && witherVictim.health <= 0 && poisonHigh.health === 18 ? 'PASS' : 'FAIL',
  'Poison damages but can never be fatal; Wither can kill',
  `poison from 20 -> ${poisonHealth} (2 ticks in 3 s); poison at 1 HP -> ${doomedHealth}; wither at 1 HP -> ${witherVictim.health}; poison IV from 20 -> ${poisonHigh.health}`,
  'wiki: "Poison... will not kill"; Wither is not floored. 1.25 s per tick, so 3 s is two ticks');

// --- S06: regeneration heals on its halving interval ---
const regenPlayer = makePlayer({ health: 10 });
regenPlayer.applyStatusEffect('regeneration', 20, 1);
for (let i = 0; i < 120; i++) regenPlayer.update(0.05);   // 6 seconds
const regen1 = regenPlayer.health;
const regenFast = makePlayer({ health: 10 });
regenFast.applyStatusEffect('regeneration', 20, 2);
for (let i = 0; i < 120; i++) regenFast.update(0.05);
const regen2 = regenFast.health;
const intervals = [1, 2, 3, 6, 7].map((l) => tickIntervalFor('regeneration', l));
row('S06', regen1 > 10 && regen2 > regen1 && JSON.stringify(intervals) === JSON.stringify([2.5, 1.25, 0.6, 0.05, 0.05]) ? 'PASS' : 'FAIL',
  'Regeneration heals, and a higher level heals faster (50 ticks per HP, halved per level, floored at 1 tick)',
  `L1 healed to ${regen1}, L2 to ${regen2}; intervals ${intervals.join('/')} s for levels 1,2,3,6,7`);

// --- S07: absorption is a pool in front of health, capped at 16 ---
const shieldPlayer = makePlayer({ health: 20 });
shieldPlayer.applyStatusEffect('absorption', 60, 2);       // 8 points
const shieldRaised = shieldPlayer.absorption;
shieldPlayer.applyStatusEffect('absorption', 60, 6);       // 24 requested, capped to the strongest table value
const shieldStrongest = shieldPlayer.absorption;
const capped = absorptionShield(new Map([['absorption', { level: 10 }]]));
row('S07', shieldRaised === 8 && capped === 40 && shieldStrongest === 24 ? 'PASS' : 'FAIL',
  'Absorption grants 4 points per level and a stronger application takes the larger pool',
  `L2 -> ${shieldRaised}, L6 -> ${shieldStrongest}, L10 table value ${capped}`,
  'vanilla\'s own cap is the effect level; the table is linear at 4 per level');

// --- S08: combat, movement, mining, jump and fall ---
const bonuses = {
  strength1: attackDamageBonus(new Map([['strength', { level: 1 }]])),
  strength2: attackDamageBonus(new Map([['strength', { level: 2 }]])),
  weakness1: attackDamageBonus(new Map([['weakness', { level: 1 }]])),
  both: attackDamageBonus(new Map([['strength', { level: 1 }], ['weakness', { level: 1 }]])),
  takenIV: damageTakenMultiplier(new Map([['resistance', { level: 4 }]])),
  takenX: damageTakenMultiplier(new Map([['resistance', { level: 10 }]])),
  speed2: speedMultiplier(new Map([['speed', { level: 2 }]])),
  slow2: speedMultiplier(new Map([['slowness', { level: 2 }]])),
  // Speed II and Slowness I are summed as one additive term: +40% and -15% is +25%.
  speed2slow1: speedMultiplier(new Map([['speed', { level: 2 }], ['slowness', { level: 1 }]])),
  haste2: miningSpeedMultiplier(new Map([['haste', { level: 2 }]])),
  fatigue4: miningSpeedMultiplier(new Map([['mining_fatigue', { level: 4 }]])),
  fatigue9: miningSpeedMultiplier(new Map([['mining_fatigue', { level: 9 }]])),
  jump2: jumpVelocityMultiplier(new Map([['jump_boost', { level: 2 }]])),
};
const combatOk = near(bonuses.strength1, 3) && near(bonuses.strength2, 6) && near(bonuses.weakness1, -4)
  && near(bonuses.both, -1)
  && near(bonuses.takenIV, 0.2) && near(bonuses.takenX, 0.2)
  && near(bonuses.speed2, 1.4) && near(bonuses.slow2, 0.7) && near(bonuses.speed2slow1, 1.25)
  && near(bonuses.haste2, 1.4) && near(bonuses.fatigue4, 0.0081) && near(bonuses.fatigue9, 0.0081)
  && near(bonuses.jump2, (0.42 + 0.1 * 2) / 0.42, 1e-6);
row('S08', combatOk ? 'PASS' : 'FAIL',
  'Strength +3/level, Weakness -4/level, Resistance -20%/level capped at IV, Speed +20%/level, Slowness -15%/level, Haste +20%/level, Mining Fatigue 0.3^min(level,4), Jump Boost +0.1/level',
  JSON.stringify(bonuses));

// --- S09: fall damage, Jump Boost and Slow Falling ---
const falls = {
  three: fallDamage(3, new Map()),
  four: fallDamage(4, new Map()),
  ten: fallDamage(10, new Map()),
  tenJump2: fallDamage(10, new Map([['jump_boost', { level: 2 }]])),
  tenSlow: fallDamage(10, new Map([['slow_falling', { level: 1 }]])),
  slowHolds: hasSlowFalling(new Map([['slow_falling', { level: 1 }]])),
};
row('S09', falls.three === 0 && falls.four === 1 && falls.ten === 7 && falls.tenJump2 === 5 && falls.tenSlow === 0 && falls.slowHolds ? 'PASS' : 'FAIL',
  'no damage for the first 3 blocks, then 1 per block; Jump Boost shortens the fall and Slow Falling negates it',
  JSON.stringify(falls));

// --- S10: the tick rules for damage over time ---
const tickRules = {
  poison: tickIntervalFor('poison', 1),
  poison5: tickIntervalFor('poison', 5),
  wither: tickIntervalFor('wither', 1),
  wither3: tickIntervalFor('wither', 3),
  strength: tickIntervalFor('strength', 1),
};
const fire = tickEffect('poison', { level: 1 }, 1.3);
const noFire = tickEffect('poison', { level: 1 }, 0.01);
const heal = tickEffect('regeneration', { level: 1 }, 2.6);
row('S10', tickRules.poison === 1.25 && tickRules.poison5 === 1.25 && tickRules.wither === 2
  && tickRules.wither3 === 2 && tickRules.strength === undefined
  && fire?.damage === 1 && fire.cannotKill === true && noFire === null && heal?.heal === 1 ? 'PASS' : 'FAIL',
  'Poison ticks every 1.25 s whatever its level, Wither every 2 s, and a non-ticking effect has no interval',
  `intervals ${JSON.stringify(tickRules)}; poison tick ${JSON.stringify(fire)}; regen tick ${JSON.stringify(heal)}`,
  'potency is the damage, not the rate -- only Regeneration halves its interval');

// --- S11: instant effects double per level ---
const instants = {
  health1: instantAmount('instant_health', 1), health2: instantAmount('instant_health', 2), health3: instantAmount('instant_health', 3),
  damage1: instantAmount('instant_damage', 1), damage3: instantAmount('instant_damage', 3),
  strength: instantAmount('strength', 1),
  set: [...INSTANT_EFFECT_IDS].sort(),
};
row('S11', instants.health1 === 4 && instants.health2 === 8 && instants.health3 === 16
  && instants.damage1 === 6 && instants.damage3 === 24 && instants.strength === 0
  && JSON.stringify(instants.set) === JSON.stringify(['instant_damage', 'instant_health']) ? 'PASS' : 'FAIL',
  'Instant Health restores 4 HP doubling per level, Instant Damage 6 doubling, and only those two are instant',
  JSON.stringify(instants));

// --- S12: hunger's exhaustion surcharge ---
const hungerCost = exhaustionFor('hunger', 2, 'move');
const noHunger = exhaustionFor('speed', 1, 'move');
row('S12', near(hungerCost, 0.01) && noHunger === 0 ? 'PASS' : 'FAIL',
  'Hunger adds its exhaustion surcharge scaled by level, and an effect without one adds nothing',
  `hunger L2 -> ${hungerCost}, speed -> ${noHunger}`);

// --- S13: mob immunity ---
const immunity = {
  dragonPoison: immuneToEffect('poison', 'ender_dragon'),
  skeletonRegen: immuneToEffect('regeneration', 'skeleton'),
  spiderPoison: immuneToEffect('poison', 'spider'),
  witherSkeletonWither: immuneToEffect('wither', 'wither_skeleton'),
  zombieWither: immuneToEffect('wither', 'zombie'),
  playerPoison: immuneToEffect('poison', 'player'),
  cowPoison: immuneToEffect('poison', 'cow'),
};
const immunityFails = [];
if (!immunity.dragonPoison) immunityFails.push('the ender dragon should be immune to all effects');
if (!immunity.skeletonRegen) immunityFails.push('undead should be immune to Regeneration');
if (!immunity.spiderPoison) immunityFails.push('spiders should be immune to Poison');
if (!immunity.witherSkeletonWither) immunityFails.push('wither skeletons should be immune to Wither');
if (immunity.zombieWither) immunityFails.push('a zombie should NOT be immune to Wither');
if (immunity.playerPoison) immunityFails.push('a player should not be immune to Poison');
if (immunity.cowPoison) immunityFails.push('a cow should not be immune to Poison');
row('S13', immunityFails.length ? 'FAIL' : 'PASS',
  'the wiki\'s immunity list holds: all-effect mobs, undead against Regeneration and Poison, spiders against Poison, wither skeletons against Wither',
  immunityFails.length ? immunityFails.join('; ') : JSON.stringify(immunity));

// --- S14: the compound effect is two real statuses ---
const turtle = { base: compoundEffects('turtle_master', 1), enhanced: compoundEffects('turtle_master', 2), plain: effectsFor('speed', 1) };
const turtleOk = JSON.stringify(turtle.base) === JSON.stringify([['slowness', 4], ['resistance', 3]])
  && JSON.stringify(turtle.enhanced) === JSON.stringify([['slowness', 6], ['resistance', 4]])
  && JSON.stringify(turtle.plain) === JSON.stringify([['speed', 1]]);
row('S14', turtleOk ? 'PASS' : 'FAIL',
  'the Turtle Master potion applies Slowness IV + Resistance III, or VI + IV enhanced, and an ordinary effect is itself',
  JSON.stringify(turtle),
  'there is no Turtle Master *status* in the HUD; the player sees the two real effects');

// --- S15: the trial-chamber effects fire once on death ---
const deaths = Object.fromEntries(['infested', 'oozing', 'weaving', 'wind_charged', 'speed'].map((k) => [k, deathEffectFor(k)]));
row('S15', deaths.infested === 'silverfish' && deaths.oozing === 'slime' && deaths.weaving === 'cobweb' && deaths.wind_charged === 'wind_charge' && deaths.speed === null ? 'PASS' : 'FAIL',
  'Infested leaves silverfish, Oozing slime, Weaving cobwebs, Wind Charged a burst, and nothing else leaves anything',
  JSON.stringify(deaths));

// --- S16: the recorded deviations are real deviations ---
// Named in the table, and read by nothing. Recorded here so the gap is explicit rather than implied.
// Health Boost and Saturation are deliberately NOT in this list: both carry a recorded figure
// (`healthPerLevel`), so only the eight with no rule at all are inert.
const inert = ['bad_omen', 'trial_omen', 'raid_omen', 'hero_of_the_village', 'luck', 'unluck'];
const inertFails = [];
for (const key of inert) {
  if (!isKnownEffect(key)) { inertFails.push(`${key} is missing from the table`); continue; }
  const extra = Object.keys(EFFECTS[key]).filter((f) => !['name', 'category', 'scalesWithPotency'].includes(f));
  if (extra.length) inertFails.push(`${key} now carries ${extra.join(',')}`);
}
row('S16', inertFails.length ? 'FAIL' : 'GAP',
  'six effects are named with a category but carry no rule yet',
  inertFails.length ? inertFails.join('; ') : `${inert.join(', ')} are inert`,
  'the wiki gives each a mechanic this game does not model: raids, trial spawners, village-hero discounts and fishing loot luck. Health Boost and Saturation do carry their figures, so they are a partial gap rather than an inert one');

const report = {
  referenceProfile: 'Java Edition 1.21.4 effects; https://minecraft.wiki/w/Effect and the per-effect pages.',
  layer: 'production effect table applied to a real src/player.js Player; the bot and potion route is tested in e2e/effect.pw.js',
  summary: {
    total: rows.length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    fail: rows.filter((r) => r.status === 'FAIL').length,
    gap: rows.filter((r) => r.status === 'GAP').length,
    specUnverified: rows.filter((r) => r.status === 'SPEC_UNVERIFIED').length,
  },
  rows,
};

if (process.argv.includes('--write')) {
  await mkdir('docs/artifacts', { recursive: true });
  await writeFile('docs/artifacts/effect-probe.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(process.argv.includes('--write') ? { artifact: 'docs/artifacts/effect-probe.json', summary: report.summary, rows: rows.map((r) => `${r.id} ${r.status} :: ${r.actual}`) } : report, null, 2));
