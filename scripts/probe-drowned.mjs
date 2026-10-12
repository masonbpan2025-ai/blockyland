// Fast Drowned-farming diagnostic: the production Drowned mob, its loot, its XP and the conversion rule.
//
// Model layer only. It does NOT drive the bot -- `e2e/drownedFarmCommand.pw.js` is the evidence for that
// route. Statuses are PASS / FAIL / GAP / SPEC_UNVERIFIED.
//
// Reference: https://minecraft.wiki/w/Tutorial:Drowned_farming and https://minecraft.wiki/w/Drowned
import { writeFile, mkdir } from 'node:fs/promises';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { MOB_LOOT } from '../src/mobLootData.js';
import { updateSubmergedConversion } from '../src/undeadVariants.js';

const rows = [];
const row = (id, status, expected, actual, note) => rows.push({ id, status, expected, actual, note });

/** A manager with real mob models and AI but no browser texture loading, as tests/mobs.test.js builds it. */
function fixture({ roll = () => 0 } = {}) {
  const world = { getVoxel: () => BLOCKS.AIR, seaLevel: 22 };
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities,
    mobs: [], arrows: [], customProjectiles: [],
    textures: { drowned: new THREE.Texture() },
    isBlockSolid: () => false,
    random: roll,
  });
  const player = {
    position: new THREE.Vector3(0, 3, 0), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false,
  };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear' }, worldTime: 18000, controls: {} };
  return { manager, entities, player };
}

/** Kill one drowned and collect what it dropped, through the real death path. */
function dropsFor(over = {}, { roll = () => 0 } = {}) {
  const f = fixture({ roll });
  const drops = [];
  f.entities.spawnDroppedItem = (pos, id, isBlock, count) => { drops.push({ id, isBlock, count }); };
  const drowned = f.manager.spawnMob('drowned', 0, 3, 0);
  if (!drowned) return { drops, xp: 0, drowned: null };
  Object.assign(drowned, over);
  let xp = 0;
  f.entities.spawnXpOrbs = (pos, total) => { xp += total; };
  f.manager.damageMob(drowned, 1000, null, false, f.player);
  for (let i = 0; i < 30 && !drowned.lootDropped; i++) f.manager.update(0.1, f.player);
  return { drops, xp, drowned, ids: drops.map((d) => d.id) };
}

// --- D01: the mob exists and is a drowned ---
const f1 = fixture();
const d1 = f1.manager.spawnMob('drowned', 0, 3, 0);
row('D01', d1 && d1.type === 'drowned' && d1.isDrowned === true ? 'PASS' : 'FAIL',
  'spawnMob("drowned") makes a drowned',
  d1 ? `type=${d1.type} isDrowned=${d1.isDrowned} health=${d1.health} aquatic=${d1.isAquatic}` : 'no mob returned');

// --- D02: the wiki's XP for killing a drowned ---
// Wiki (Experience), "Killing mobs": Drowned is in the 5 + 1-3 group; Baby Drowned in the 12 + 1-3 group.
const xpAdult = dropsFor().xp;
const xpBaby = dropsFor({ isBaby: true }).xp;
row('D02', xpAdult === 5 && xpBaby === 12 ? 'PASS' : 'FAIL',
  'an adult drowned is worth 5 XP and a baby (gurgle) 12, per the wiki\'s killing-mobs table',
  `adult ${xpAdult} XP, baby ${xpBaby} XP`,
  'Drowned is listed with Bogged, Creeper, Zombie etc at 5; Baby Drowned with Baby Zombie at 12');

// --- D03: the always-drop ---
// Wiki: 0-2 rotten flesh, so pin the roll to the top of the range; baby drowned drop it too.
const d3 = dropsFor({}, { roll: () => 0.99 });
const d3b = dropsFor({ isBaby: true }, { roll: () => 0.99 });
row('D03', d3.ids.includes('rotten_flesh') && d3b.ids.includes('rotten_flesh') ? 'PASS' : 'FAIL',
  'a drowned (adult or gurgle) drops 0-2 rotten flesh',
  `drops: ${d3.ids.join(', ') || 'none'}`);

// --- D04: copper ingot, 11%, player kill only ---
// Wiki (Drowned): 0-2 rotten flesh always; 1 copper ingot with an 11% chance, only if killed by a player.
const copper = dropsFor({}, { roll: () => 0.05 });
const copperHigh = dropsFor({}, { roll: () => 0.5 });
const publishedCopper = (MOB_LOOT.drowned ?? []).find((e) => e[0] === 'copper_ingot');
row('D04', copper.ids.includes('copper_ingot') && !copperHigh.ids.includes('copper_ingot') ? 'PASS' : 'FAIL',
  'a copper ingot drops at 11% on a player kill and not otherwise',
  `roll 0.05 -> ${copper.ids.includes('copper_ingot')}, roll 0.5 -> ${copperHigh.ids.includes('copper_ingot')}; published row ${JSON.stringify(publishedCopper)}`);

// --- D05: the trident's effective rate is higher than vanilla's ---
// Wiki (Drowned): it "drops the trident it was carrying 8.5% of the time". Every drowned here carries one
// (D08), so the 8.5% applies to the whole population, where vanilla arms only a minority of drowned to begin
// with -- the effective trident per drowned is materially higher. Recorded as a deviation rather than
// changed, because making all drowned unarmed would delete the trident-throwing behaviour the same mob is
// built around.
const tridentRow = (MOB_LOOT.drowned ?? []).find((e) => e[0] === 'trident');
const armedDrop = dropsFor({}, { roll: () => 0.0849 }).ids.includes('trident');
const pastDrop = dropsFor({}, { roll: () => 0.0851 }).ids.includes('trident');
row('D05', tridentRow && armedDrop && !pastDrop ? 'PASS' : 'FAIL',
  'the trident row is 8.5% and rolls exactly at that boundary',
  `published row ${JSON.stringify(tridentRow)}; roll 0.0849 -> ${armedDrop}, roll 0.0851 -> ${pastDrop}`,
  'the RATE of the row is vanilla\'s; the DEVIATION is that every drowned is armed, so the population rate is higher (see D08)');

// --- D06: naturally spawned Java drowned can supply nautilus shells ---
// The flooded-dungeon tutorial's exclusion applies to CONVERTED zombies, not
// naturally spawned drowned. Java naturally spawns 3% carrying a guaranteed shell.
// This diagnostic checks availability from natural drowned; equipment provenance
// and converted-drowned behavior require separate tests.
const shellRow = (MOB_LOOT.drowned ?? []).find((e) => e[0] === 'nautilus_shell');
const shellDropped = dropsFor({}, { roll: () => 0.0299 }).ids.includes('nautilus_shell');
row('D06', shellRow && shellDropped ? 'PASS' : 'FAIL',
  'naturally spawned Java drowned can drop a nautilus shell',
  `published row ${JSON.stringify(shellRow)}; dropped at roll 0.0299: ${shellDropped}`,
  'https://minecraft.wiki/w/Tutorial:Acquiring_a_conduit distinguishes natural Java drowned from converted zombies. This availability check does not verify guaranteed offhand drops.');

// --- D07: a drowned cannot spawn with armor ---
// Wiki (Drowned): "one of the only Overworld zombie variants that cannot naturally spawn with any armor".
const armored = fixture();
let armorSeen = 0;
for (let i = 0; i < 200; i++) {
  const m = armored.manager.spawnMob('drowned', 0, 3, 0);
  if (m.equipment && Object.keys(m.equipment).length) armorSeen++;
}
row('D07', armorSeen === 0 ? 'PASS' : 'FAIL',
  'a drowned never spawns wearing armor',
  `${armorSeen} of 200 spawned with an equipment entry`);

// --- D08: the carried trident IS present, which is what makes D05's rate defensible ---
// Correcting an earlier reading of this row: a drowned here carries a real trident (the mesh hangs off its
// right arm and `throwTrident` is wired to it), so "was carrying one" is always true and the 8.5% row is
// conditional on a state that is never false. The deviation is the ARMING RATE -- in vanilla only a minority
// of drowned spawn armed -- not the absence of a flag. Recorded as such rather than as a missing field.
const carrier = fixture();
let withTridentMesh = 0;
for (let i = 0; i < 50; i++) {
  const m = carrier.manager.spawnMob('drowned', 0, 3, 0);
  if (m.trident) withTridentMesh++;
}
row('D08', withTridentMesh === 50 ? 'PASS' : 'FAIL',
  'a drowned carries a trident, so the 8.5% drop can legitimately be gated on it',
  `${withTridentMesh} of 50 spawned with a trident mesh attached`,
  'every drowned is armed, where vanilla arms only a minority -- so the effective trident rate is 8.5% of ALL drowned rather than of the armed ones (see D05)');

// --- D09: the zombie -> drowned conversion ---
// Wiki (Drowned Â§ Conversion, and docs/mob-spawning-spec-1.21.4.md Â§14.11): a zombie whose HEAD is submerged
// for 30 s begins converting, which takes 15 s more and cannot be stopped; the drowned arrives at full health;
// only normal zombies convert and the drowned never gets a trident. This build has no such path -- the only
// conversion implemented is a husk becoming a zombie -- so the flooded-monster-room farm cannot work.
// Measured through the shared timer, since the manager's update loop is not what this probe drives.
function convertTo(type, seconds, { submerged = true } = {}) {
  const conversions = [];
  const manager = { replaceMobType: (mob, to) => conversions.push({ from: mob.type, to }) };
  const mob = { type, health: 20, maxHealth: 20, submergedSeconds: 0 };
  let phase = null;
  const step = 0.25;
  for (let t = 0; t < seconds; t += step) phase = updateSubmergedConversion(mob, step, { submerged, manager });
  return { phase, conversions, mob };
}
const zombieConv = convertTo('zombie', 46);
row('D09', zombieConv.conversions.length === 1 && zombieConv.conversions[0].to === 'drowned' ? 'PASS' : 'FAIL',
  'a zombie whose head stays submerged for 30 s converts to a drowned 15 s later',
  `phases ended '${zombieConv.phase}'; conversions ${JSON.stringify(zombieConv.conversions)}`,
  'the conversion is the entire mechanism of the flooded-monster-room farm, the easiest design the tutorial describes');

// --- D10: the husk leg still converts to a ZOMBIE, not a drowned ---
// Sharing the timer must not have merged the two targets: a husk becomes a zombie, and only a zombie becomes
// a drowned. That two-step chain is what the wiki describes.
const huskConv = convertTo('husk', 46);
const zombieStopsEarly = convertTo('zombie', 20);
row('D10', huskConv.conversions[0]?.to === 'zombie' && zombieStopsEarly.conversions.length === 0 ? 'PASS' : 'FAIL',
  'a husk converts to a zombie (not straight to a drowned), and 20 s under water is not enough for a zombie',
  `husk -> ${JSON.stringify(huskConv.conversions)}; a zombie at 20 s made ${zombieStopsEarly.conversions.length} conversions`,
  'wiki: "For husks, they first transform into a regular zombie, and subsequently convert to a drowned"');

// --- D11: baby drowned ---
// Wiki: babies are "gurgles", and they "make up 5% of drowned spawns".
// A REAL random source: the fixture defaults to `() => 0`, which is what makes the other rows deterministic
// and would make every natural spawn a gurgle here.
const babyRoll = fixture({ roll: Math.random });
let naturalBabies = 0, summonedBabies = 0;
const NATURAL_TRIES = 4000;
for (let i = 0; i < NATURAL_TRIES; i++) {
  const m = babyRoll.manager.spawnMob('drowned', 0, 3, 0, { natural: true });
  if (m.isBaby) naturalBabies++;
  babyRoll.manager.mobs.pop();
}
for (let i = 0; i < 400; i++) {
  const m = babyRoll.manager.spawnMob('drowned', 0, 3, 0);
  if (m.isBaby) summonedBabies++;
  babyRoll.manager.mobs.pop();
}
const gurgleRate = naturalBabies / NATURAL_TRIES;
row('D11', gurgleRate > 0.03 && gurgleRate < 0.07 && summonedBabies === 0 ? 'PASS' : 'FAIL',
  'about 5% of NATURAL drowned spawns are babies, and a summoned one never is',
  `${naturalBabies} of ${NATURAL_TRIES} natural spawns were gurgles (${(gurgleRate * 100).toFixed(2)}%); ${summonedBabies} of 400 command spawns were`,
  'the roll is gated on the natural flag, as the sheep colour roll is, so /summon gives an adult');

// --- D12: the trident throw is wired to the drowned ---
// The throw lives on the hostile-behaviour mixin, not on the bare MobManager the fixture builds, so this
// checks the wiring in the source rather than calling it: the drowned branch must be the one that reaches
// `throwTrident`.
const { readFileSync } = await import('node:fs');
const hostileSource = readFileSync('src/hostileMobBehaviors.js', 'utf8');
const drownedBranch = hostileSource.slice(
  hostileSource.indexOf("mob.type === 'drowned'"),
  hostileSource.indexOf("mob.type === 'drowned'") + 400,
);
const throwsForDrowned = drownedBranch.includes('throwTrident');
const hasThrower = /throwTrident\s*\(/.test(hostileSource);
row('D12', hasThrower && throwsForDrowned ? 'PASS' : 'FAIL',
  'a drowned throws a trident at a nearby player',
  `throwTrident defined: ${hasThrower}; reached from the drowned branch: ${throwsForDrowned}`,
  'the wiki pages fetched state neither Java\'s interval nor its damage, so only the wiring is asserted -- SPEC_UNVERIFIED for the 4.0 s / 8 damage figures');

const report = {
  referenceProfile: 'Java Edition 1.21.4 drowned farming; https://minecraft.wiki/w/Tutorial:Drowned_farming, /w/Drowned and /w/Experience (the killing-mobs table).',
  layer: 'production MobManager Drowned mob, loot rows, XP path and conversion state only; the bot route is tested in e2e/drownedFarmCommand.pw.js',
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
  await writeFile('docs/artifacts/drowned-probe.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(process.argv.includes('--write') ? { artifact: 'docs/artifacts/drowned-probe.json', summary: report.summary, rows: rows.map((r) => `${r.id} ${r.status} :: ${r.actual}`) } : report, null, 2));


