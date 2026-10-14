// Behaviour scenarios that apply across mobs, driven by what https://minecraft.wiki/w/Mob and each mob's own page say.
//
// The Mob Inspector's showcase used to give most mobs only "movement", "damage" and "death". Every scenario here
// states one wiki fact (a number from src/mobWikiData.js, or a rule from the mob's page) and observes the real
// game for it, so the showcase reads as a checklist of that mob's expected behaviour:
//
//   observed      the game does what the wiki says
//   not observed  the game does something else, which is a parity bug (the detail says what it did instead)
//   unsupported   the scenario cannot be evaluated here
//
// A mob outside a trait set simply gets no scenario for that rule, so a scenario never asserts a rule the wiki does
// not state for that mob.
import * as THREE from 'three';
import { MOB_WIKI_DATA } from './mobWikiData.js';
import { BREEDING_FOODS } from './animalBehaviors.js';
import { BLOCKS } from './blocks.js';
import { fallDamageFor, AIR_SUPPLY_SECONDS } from './mobEnvironment.js';
import { DespawnManager, SURVIVES_PEACEFUL } from './spawning/despawnManager.js';

const set = (s) => new Set(s.split(/\s+/).filter(Boolean));

/** Immune to fire and lava. https://minecraft.wiki/w/Fire#Fire_immunity */
export const FIRE_IMMUNE = set('blaze magma_cube ghast zombified_piglin zoglin strider wither_skeleton wither');
/** Mobs with no gravity or physics of their own here (the giant has no AI at all), so environment rules cannot be observed. */
const NO_PHYSICS = set('giant');
/** Undead that burn in sunlight (page text). The husk, wither skeleton and zombified piglin do not. */
export const BURNS_IN_DAYLIGHT = set('zombie zombie_villager skeleton stray bogged drowned phantom zombie_horse');
export const SUN_SAFE_UNDEAD = set('husk wither_skeleton zombified_piglin skeleton_horse');
export const AQUATIC = set('cod salmon pufferfish tropical_fish squid glow_squid dolphin axolotl guardian elder_guardian tadpole turtle');
export const FLYERS = set('bat bee ghast blaze phantom vex allay happy_ghast parrot ender_dragon wither breeze');
/** Take damage from contact with water. https://minecraft.wiki/w/Enderman, /Snow_Golem */
export const WATER_DAMAGE = set('enderman');
/** Farm and wild animals that run away when hurt (the panic goal). */
export const PANICS = set('cow pig sheep chicken horse donkey mule rabbit llama cat ocelot mooshroom fox camel sniffer frog goat');

const dataOf = (type) => MOB_WIKI_DATA[type];
const behaviorOf = (type) => (dataOf(type)?.behavior || '').toLowerCase();
export const isWikiHostile = (type) => behaviorOf(type).startsWith('hostile');
export const isWikiPassive = (type) => behaviorOf(type).startsWith('passive');
export const isWikiNeutral = (type) => behaviorOf(type).startsWith('neutral');
/** `Monster` mobs disappear on Peaceful (except the four that override it). */
export const isMonsterClass = (type) => (dataOf(type)?.mobtype || []).includes('Monster');
export const breathesUnderwater = (type) => (dataOf(type)?.tags || []).includes('can_breathe_under_water');

/** Lower-case id for a wiki item name: "Raw Salmon" -> raw_salmon. */
export const itemId = (name) => name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Engine item ids that stand for a wiki item name, when the two differ. Cooked and raw forms count for each other:
 * a burning mob drops the cooked item.
 */
export const DROP_ALIASES = {
  slimeball: ['slime_ball'],   raw_beef: ['beef'], steak: ['cooked_beef'], raw_porkchop: ['porkchop'], cooked_porkchop: ['cooked_porkchop'],
  raw_chicken: ['chicken'], raw_mutton: ['mutton'], raw_rabbit: ['rabbit'], raw_cod: ['cod'], raw_salmon: ['salmon'],
  rabbit_s_foot: ['rabbit_foot'], rabbits_foot: ['rabbit_foot'], rabbit_hide: ['rabbit_hide'], ink_sac: ['ink_sac'],
  glow_ink_sac: ['glow_ink_sac'], spider_eye: ['spider_eye'], bone_meal: ['bone_meal'], nautilus_shell: ['nautilus_shell'],
  music_disc: ['music_disc'], zombie_head: ['zombie_head'], skeleton_skull: ['skeleton_skull'], creeper_head: ['creeper_head'],
  wither_skeleton_skull: ['wither_skeleton_skull'], gold_nugget: ['gold_nugget'], golden_carrot: ['golden_carrot']
};
export function dropIdsFor(name) {
  const base = itemId(name);
  return [base, ...(DROP_ALIASES[base] || [])];
}

const BLOCK_NAMES = Object.fromEntries(Object.entries(BLOCKS).map(([name, id]) => [id, name.toLowerCase()]));
/** An item the game reports by block id (wool, flowers, sponges) as the lower-case name the wiki uses. */
const dropName = (id) => (typeof id === 'number' || /^\d+$/.test(String(id)) ? (BLOCK_NAMES[id] ?? String(id)) : String(id));
/** Equipment a mob spawned with and drops: the wiki lists it under "equipment", not in the drop table. */
const GEAR = /(nautilus_shell|sword|axe|helmet|chestplate|leggings|boots|crossbow|bow|trident|shield|spear|carpet|saddle|arrow)$/;

const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const range = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`);

/** A deterministic random source for scenarios that need many rolls. */
function seeded(seed = 20240229) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** Fill a column of water around the origin, deep enough to cover a tall mob's head. */
function flood(s, top = 9) {
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y <= top; y++) s.world.setVoxel(x, y, z, BLOCKS.WATER);
  // Walls and a lid: a mob with a way out walks or floats out of the water and breathes, which is not what is being tested.
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) s.world.setVoxel(x, top + 1, z, BLOCKS.STONE);
  for (let i = -4; i <= 4; i++) for (let y = 0; y <= top + 1; y++) for (const [x, z] of [[i, -4], [i, 4], [-4, i], [4, i]]) s.world.setVoxel(x, y, z, BLOCKS.STONE);
  s.world.dimension = 'overworld';
  s.mob.mesh.position.y = 1;
}

const alive = (s) => s.manager.mobs.includes(s.mob) && s.mob.health > 0;
const hurt = (s) => !alive(s) || s.mob.health < s.mob.maxHealth;

export function universalScenarios(type, SCENARIO_SKIP) {
  const wiki = dataOf(type);
  // The killer bunny shares the rabbit's wiki page but is a hostile variant; its own scenarios cover it.
  if (!wiki || type === 'killer_bunny') return [];
  const cases = [];
  // A check may return `{ ok, detail }`. It is handed on as a plain boolean (the contract every other scenario and test
  // keeps), with the explanation left on the session for the Inspector to print next to a failed scenario.
  const add = (id, label, duration, setup, check, update) => {
    const verdict = (s) => {
      const r = check(s);
      if (r && typeof r === 'object') { s.checkDetail = r.detail || ''; return r.ok; }
      s.checkDetail = '';
      return r;
    };
    cases.push({ id, label, duration, setup, check: verdict, ...(update ? { update } : {}) });
  };
  const aquatic = AQUATIC.has(type);
  const flies = FLYERS.has(type);

  // --- stats --------------------------------------------------------------------------------------
  if (wiki.health.length) {
    const lo = Math.min(...wiki.health), hi = Math.max(...wiki.health);
    add('stat_health', `Health is ${lo === hi ? lo : `${lo}-${hi}`} HP, as on the wiki`, 0.05, () => {},
      s => ({ ok: s.mob.maxHealth >= lo && s.mob.maxHealth <= hi && s.mob.health === s.mob.maxHealth, detail: `spawned with ${s.mob.health}/${s.mob.maxHealth}` }));
  }
  if (wiki.sizes?.length) {
    add('stat_hitbox', `Hitbox is ${wiki.size.width} wide x ${wiki.size.height} tall, as on the wiki`, 0.05, () => {}, s => {
      const base = s.manager.getMobDimensions(type);
      const d = { width: s.mob.width ?? base.width, height: s.mob.height ?? base.height };
      return { ok: wiki.sizes.some(w => near(d.width, w.width) && near(d.height, w.height)), detail: `game uses ${d.width} x ${d.height}` };
    });
  }

  // --- reaction to being hurt ---------------------------------------------------------------------
  // Wiki: a mob takes (1 - knockback resistance) of the push. A punch pushes 3.5 blocks/s; the scenario measures the
  // push the game applied rather than where the mob ended up, because a hostile mob turns and charges the attacker.
  const resist = wiki.knockbackResistance || 0;
  const wet = () => aquatic;
  const hit = (s) => {
    if (wet()) { s.world.fluid = BLOCKS.WATER; s.world.dimension = 'overworld'; s.mob.mesh.position.y = 1.2; }
    s.player.position.set(0, 0, 100);
    s.kbStart = s.mob.mesh.position.clone();
    s.kbMin = 0; s.kbMax = 0;
    s.manager.damageMob(s.mob, Math.min(1, s.mob.health * 0.1), new THREE.Vector3(0, 0, 3), true, null);
    s.kbApplied = s.mob.knockback ? Math.hypot(s.mob.knockback.x, s.mob.knockback.z) : 0;
  };
  const track = (s) => { const dz = s.mob.mesh.position.z - s.kbStart.z; s.kbMin = Math.min(s.kbMin, dz); s.kbMax = Math.max(s.kbMax, dz); };
  const BASE_PUNCH = 3.5;
  // The dragon and the wither: the wiki states no resistance, but they are treated as immovable bosses here.
  if (!NO_PHYSICS.has(type) && !['ender_dragon', 'wither'].includes(type)) {
    const expected = BASE_PUNCH * (1 - resist);
    add('knockback', resist >= 1 ? 'Immune to knockback (resistance 100%)' : `Knockback strength is ${Math.round((1 - resist) * 100)}% of normal (resistance ${Math.round(resist * 100)}%)`, 0.1, hit,
      s => ({ ok: Math.abs(s.kbApplied - expected) < 0.2, detail: `game applied ${s.kbApplied.toFixed(2)}, wiki implies ${expected.toFixed(2)}` }));
    // Mobs that charge the attacker (hostile and neutral ones) cannot be told apart from the push, so only the
    // others are checked for actually moving away.
    if (resist < 0.5 && isWikiPassive(type)) {
      add('knockback_moves', 'Is pushed away from the attacker', 0.6, hit,
        s => ({ ok: !s.manager.mobs.includes(s.mob) || s.kbMin < -0.03 * Math.max(0.2, 1 - resist), detail: `pushed ${(-s.kbMin).toFixed(2)} blocks away` }), track);
    }
  }

  // --- falling ------------------------------------------------------------------------------------
  // The strider has its own fall rule (it ignores landings in lava), and a creeper's fall adds to its fuse instead:
  // both have their own scenarios.
  if (!aquatic && !flies && !NO_PHYSICS.has(type) && type !== 'strider' && type !== 'creeper') {
    const rule = wiki.fall;
    if (rule?.immune) {
      add('fall_immune', 'Takes no fall damage', 3, s => { s.mob.mesh.position.y = 20; s.mob.velocity.y = 0; }, s => ({ ok: s.mob.health === s.mob.maxHealth, detail: `health ${s.mob.health}/${s.mob.maxHealth}` }));
    } else {
      const expected = fallDamageFor(type, 20);
      add('fall_damage', `Takes ${expected} damage from a 20-block fall`, 4, s => { s.mob.mesh.position.y = 20; s.mob.velocity.y = 0; s.mob.onGround = false; s.healthBefore = s.mob.health; },
        s => { const lost = s.healthBefore - Math.max(0, s.mob.health); /* llamas regenerate 1 HP at random, which can land during the measurement */ return { ok: lost >= Math.min(expected, s.healthBefore) - 1 && lost <= Math.min(expected, s.healthBefore), detail: `lost ${lost} HP, wiki rule says ${expected}` }; });
      add('fall_safe', `Takes no damage from a ${rule?.safeBlocks ?? 3}-block fall`, 3, s => { s.mob.mesh.position.y = rule?.safeBlocks ?? 3; s.mob.velocity.y = 0; s.mob.onGround = false; },
        s => ({ ok: s.mob.health === s.mob.maxHealth, detail: `health ${s.mob.health}/${s.mob.maxHealth}` }));
    }
  }

  // --- fire, lava and sunlight --------------------------------------------------------------------
  if (!aquatic && !NO_PHYSICS.has(type) && (!flies || FIRE_IMMUNE.has(type))) {
    if (FIRE_IMMUNE.has(type)) {
      add('fire_immune', 'Immune to lava and fire', 3, s => { s.world.fluid = BLOCKS.LAVA; }, s => ({ ok: s.mob.health === s.mob.maxHealth, detail: `health ${s.mob.health}/${s.mob.maxHealth}` }));
    } else {
      add('lava_damage', 'Burns and takes damage in lava', 3, s => { s.world.fluid = BLOCKS.LAVA; s.mob.mesh.position.y = 1; }, s => ({ ok: hurt(s), detail: `health ${s.mob.health}/${s.mob.maxHealth}` }));
    }
  }
  if (BURNS_IN_DAYLIGHT.has(type)) {
    add('daylight_burn', 'Catches fire and takes damage in sunlight', 4, s => { s.manager.game.worldTime = 6000; s.manager.game.isDaytime = true; },
      s => ({ ok: hurt(s) || !!s.mob.isBurning, detail: `burning=${!!s.mob.isBurning}, health ${s.mob.health}/${s.mob.maxHealth}` }));
  }
  if (SUN_SAFE_UNDEAD.has(type)) {
    add('daylight_safe', 'Does not burn in sunlight', 4, s => { s.manager.game.worldTime = 6000; s.manager.game.isDaytime = true; },
      s => ({ ok: s.mob.health === s.mob.maxHealth && !s.mob.isBurning, detail: `burning=${!!s.mob.isBurning}, health ${s.mob.health}/${s.mob.maxHealth}` }));
  }

  // --- water --------------------------------------------------------------------------------------
  if (WATER_DAMAGE.has(type)) {
    add('water_damage', 'Takes damage from water', 3, s => flood(s), s => ({ ok: hurt(s), detail: `health ${s.mob.health}/${s.mob.maxHealth}` }));
  }
  // The hoglin turns into a zoglin in the Overworld before it can drown, a giant is taller than the test pool, and the
  // spiders climb the pool wall and press against its lid, out of the water.
  if (!aquatic && !flies && !breathesUnderwater(type) && !WATER_DAMAGE.has(type) && !FIRE_IMMUNE.has(type) && type !== 'hoglin' && type !== 'spider' && type !== 'cave_spider' && (wiki.size?.height ?? 1) <= 3) {
    add('drowning', `Drowns after ${AIR_SUPPLY_SECONDS} s underwater, then takes 2 damage a second`, AIR_SUPPLY_SECONDS + 5, s => flood(s), s => ({ ok: hurt(s), detail: `health ${s.mob.health}/${s.mob.maxHealth}, air ${(s.mob.airSupply ?? 'untracked')}` }));
  }

  // --- difficulty ---------------------------------------------------------------------------------
  const peacefulRig = (s) => {
    s.manager.game.difficulty = 'peaceful';
    const adapter = {
      world: s.world, difficulty: 'peaceful', random: () => 0.5, get mobs() { return s.manager.mobs; },
      removeMob: (m, why) => s.manager.removeMob(m, why), shouldSurvivePeaceful: () => false,
      despawnDistanceFor: () => 128, requiresCustomPersistence: () => false, lightLevelAt: () => 0
    };
    s.despawner = new DespawnManager({ mobSpawnManager: adapter });
  };
  const peacefulTick = (s) => { s.despawner?.tick([{ position: s.player.position, gamemode: 'survival' }]); };
  if (isMonsterClass(type) && !SURVIVES_PEACEFUL.has(type)) {
    add('peaceful', 'Is removed on Peaceful difficulty', 2, peacefulRig, s => ({ ok: !s.manager.mobs.includes(s.mob), detail: 'still present' }), peacefulTick);
  }
  if (SURVIVES_PEACEFUL.has(type)) {
    add('peaceful_survives', 'Stays on Peaceful difficulty', 2, peacefulRig, s => ({ ok: s.manager.mobs.includes(s.mob), detail: 'was removed' }), peacefulTick);
  }

  // --- temperament --------------------------------------------------------------------------------
  if (isWikiPassive(type) && !aquatic) {
    add('passive_calm', 'Passive: never attacks an adjacent player', 5, s => { s.player.gamemode = 'survival'; s.player.position.set(0, 0, 1); },
      s => ({ ok: (s.player.damageEvents || 0) === 0, detail: `${s.player.damageEvents} hits landed` }));
  }
  if (PANICS.has(type)) {
    add('panic', 'Runs away when hurt', 3, s => {
      s.player.gamemode = 'survival'; s.player.position.set(0, 0, 2); s.startPos = s.mob.mesh.position.clone();
      s.manager.damageMob(s.mob, Math.min(1, s.mob.health * 0.1), s.player.position, true, s.player);
    }, s => { const d = horizontal(s.mob.mesh.position, s.startPos); return { ok: !s.manager.mobs.includes(s.mob) || d > 1.5, detail: `fled ${d.toFixed(1)} blocks` }; });
  }
  const foods = BREEDING_FOODS[type];
  if (foods?.length && !aquatic) {
    add('tempt', 'Follows a player holding its breeding food', 8, s => {
      s.player.gamemode = 'survival'; s.player.position.set(0, 0, 5); // inside every follow range (the frog's is 6)
      s.inventory.active = { id: foods[0], count: 64, isBlock: typeof foods[0] === 'number' };
      s.startDistance = horizontal(s.mob.mesh.position, s.player.position);
    }, s => { const d = horizontal(s.mob.mesh.position, s.player.position); return { ok: d < s.startDistance - 0.8, detail: `distance ${s.startDistance.toFixed(1)} -> ${d.toFixed(1)}` }; });

    // Babies: growth takes 20 minutes, which the scenario fast-forwards by setting the timer near its end.
    add('baby_grows_up', 'A baby grows into an adult', 3, s => { s.mob.isBaby = true; s.mob.babyGrowthTimer = 1; if (type === 'sniffer') s.mob.growthTimer = 1; /* a snifflet's own 40-minute timer */ s.mob.mesh.scale.setScalar(0.5); },
      s => ({ ok: !s.mob.isBaby, detail: `isBaby=${s.mob.isBaby}, timer ${s.mob.babyGrowthTimer}` }));
  }

  // --- drops and experience -----------------------------------------------------------------------
  if (wiki.drops.length) {
    const allowed = new Set(wiki.drops.flatMap(dropIdsFor));
    add('drops_match_wiki', `Only drops what the wiki lists (${wiki.drops.slice(0, 3).join(', ')}${wiki.drops.length > 3 ? ', ...' : ''})`, 3, s => {
      s.manager.random = seeded();
      s.player.gamemode = 'survival';
      for (let n = 0; n < 40; n++) {
        // A slime only drops slimeballs when it is the smallest size, so that is the one this kills.
        const m = type === 'slime' ? s.manager.spawnSlime(0, 0, 0, 1) : s.manager.spawnMob(type, 0, 0, 0);
        if (!m) continue;
        m.playerDamaged = true;
        s.manager.damageMob(m, 100000, s.player.position, true, s.player);
      }
    }, s => {
      const got = new Set(s.entities.drops.map(d => dropName(d.id)));
      const listed = (id) => allowed.has(id) || GEAR.test(id) || (id.endsWith('_wool') && allowed.has('wool')) || id.startsWith('tipped_arrow') && [...allowed].some(a => a.includes('arrow'));
      const stray = [...got].filter(id => !listed(id));
      return { ok: got.size > 0 && stray.length === 0, detail: got.size ? (stray.length ? `unexpected: ${stray.join(', ')}` : '') : 'nothing dropped in 40 kills' };
    });
  }
  if (wiki.xp) {
    add('xp_on_kill', `Gives ${range(wiki.xp)} XP when killed by a player`, 3, s => {
      s.player.gamemode = 'survival'; s.mob.playerDamaged = true; s.xpBefore = s.entities.xp;
      s.gearCount = Object.values(s.mob.equipment || {}).filter(Boolean).length + (s.mob.weapon ? 1 : 0) + (s.mob.armor ? 1 : 0) + (s.mob.heldItem ? 1 : 0);
      s.manager.damageMob(s.mob, 100000, s.player.position, true, s.player);
    }, s => {
      // Wiki: a mob that spawned with equipment drops 1-3 more XP for each item.
      const gear = s.gearCount;
      const gave = s.entities.xp - s.xpBefore;
      return { ok: gave >= wiki.xp[0] && gave <= wiki.xp[1] + 3 * gear, detail: `gave ${gave}${gear ? ` (${gear} equipped)` : ''}` };
    });
  }
  return cases;
}
