// Scenarios for individual mobs, taken from the "Behavior" sections of their wiki pages.
//
// mobBehaviorScenarios.js covers what every mob shares (health, hitbox, falling, drowning, drops, ...). This file is
// for what makes a particular mob that mob: the creeper's fuse, the enderman's teleport, the cave spider's poison.
// A scenario reports `observed` when the game does what the page says and `not observed` when it does not, with the
// numbers in the detail, so a gap shows up as a red line in the Inspector rather than as a mob that merely feels off.
import * as THREE from 'three';
import { MOB_WIKI_DATA } from './mobWikiData.js';
import { BLOCKS } from './blocks.js';
import { CREEPER_FUSE_SECONDS, explosionDamage } from './creeperBehavior.js';
import { animalScenarios } from './mobAnimalScenarios.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'];

/** Record every hit the player takes, so a scenario can compare the amounts with the wiki. */
function recordHits(s) {
  const p = s.player;
  if (!p._takeDamageOriginal) p._takeDamageOriginal = p.takeDamage;
  p.takeDamage = p._takeDamageOriginal;
  s.hits = [];
  p.takeDamage = function (n, ...rest) { s.hits.push(n); return p._takeDamageOriginal.call(this, n, ...rest); };
}
function stopRecording(s) {
  if (s.player._takeDamageOriginal) s.player.takeDamage = s.player._takeDamageOriginal;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const alive = (s) => s.manager.mobs.includes(s.mob) && s.mob.health > 0;
const survival = (s, z = 1.4) => { s.player.gamemode = 'survival'; s.player.health = 100; s.player.position.set(0, 0, z); };

/** Melee-only mobs whose infobox gives one Easy / Normal / Hard damage figure. Neutral ones must be provoked first. */
// (The drowned is left out: it usually carries a trident, so its damage is a thrown trident's.)
const MELEE_DAMAGE_MOBS = 'zombie husk zombie_villager spider wolf enderman polar_bear ravager warden vex'.split(' ');
const NEEDS_PROVOKING = new Set(['wolf', 'enderman', 'polar_bear', 'panda']);

function meleeDamageScenarios(type) {
  const wiki = MOB_WIKI_DATA[type];
  if (!wiki?.meleeDamage || !MELEE_DAMAGE_MOBS.includes(type)) return [];
  return DIFFICULTIES.map((difficulty) => ({
    id: `damage_${difficulty}`,
    label: `Melee hit deals ${wiki.meleeDamage[difficulty]} damage on ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`,
    duration: 6,
    setup(s) {
      survival(s, 1.2);
      s.manager.game.difficulty = difficulty;
      s.manager.game.worldTime = 18000; s.manager.game.isDaytime = false; // the spider is neutral in daylight
      recordHits(s);
      if (NEEDS_PROVOKING.has(type)) s.manager.damageMob(s.mob, 1, s.player.position, true, s.player);
    },
    check(s) {
      stopRecording(s);
      const first = s.hits[0];
      s.checkDetail = first === undefined ? 'never hit the player' : `hit for ${first}`;
      return first !== undefined && Math.abs(first - wiki.meleeDamage[difficulty]) < 0.01;
    }
  }));
}

function creeperScenarios() {
  const cases = [];
  const add = (id, label, duration, setup, check, update) => cases.push({ id, label, duration, setup, check, ...(update ? { update } : {}) });

  add('creeper_chase', 'Chases a player within 16 blocks', 4, s => { survival(s, 12); s.closest = 12; },
    s => { s.checkDetail = `closest approach ${s.closest.toFixed(1)} blocks (started at 12)`; return s.closest < 8 || !alive(s); },
    s => { if (alive(s)) s.closest = Math.min(s.closest, distance(s.mob.mesh.position, s.player.position)); });

  add('creeper_ignores_far', 'Ignores a player more than 16 blocks away', 4, s => { survival(s, 22); s.startDistance = 22; },
    s => { const d = distance(s.mob.mesh.position, s.player.position); s.checkDetail = `distance ${d.toFixed(1)}`; return alive(s) && d > 18; });

  add('creeper_fuse', `Swells for a ${CREEPER_FUSE_SECONDS} s fuse inside 3 blocks, standing still`, 0.8, s => { survival(s, 2); s.hits = []; },
    s => {
      const v = Math.hypot(s.mob.velocity.x, s.mob.velocity.z);
      s.checkDetail = `fuse ${(s.mob.fuseTime ?? 0).toFixed(2)} s, speed ${v.toFixed(2)}`;
      return alive(s) && s.mob.fuseTime > 0.5 && s.mob.fuseTime < CREEPER_FUSE_SECONDS && v < 0.05;
    });

  add('creeper_explodes', 'Explodes when the fuse runs out and hurts the player', 3, s => { survival(s, 2); recordHits(s); },
    s => {
      stopRecording(s);
      const total = s.hits.reduce((a, b) => a + b, 0);
      s.checkDetail = `${alive(s) ? 'did not explode' : 'exploded'}, player took ${total}`;
      return !alive(s) && total > 0;
    });

  add('creeper_damage', 'Explosion damage follows the wiki formula for the distance', 3, s => { survival(s, 2); recordHits(s); s.expected = null; },
    s => {
      stopRecording(s);
      const total = s.hits.reduce((a, b) => a + b, 0);
      // The creeper stands at about 2.2 blocks (3 to ignite) by the time it goes off, so accept the band that spans
      // 1 to 3.5 blocks rather than pinning one exact distance.
      const lo = explosionDamage(3, 3.5, 'normal'), hi = explosionDamage(3, 1, 'normal');
      s.checkDetail = `took ${total}, wiki formula gives ${lo}-${hi} at 1-3.5 blocks`;
      return total >= lo && total <= hi;
    });

  add('creeper_cancel', 'Fuse winds down if the player leaves', 3, s => { survival(s, 2); s.left = false; },
    s => { s.checkDetail = `${alive(s) ? 'alive' : 'exploded'}, fuse ${(s.mob.fuseTime ?? 0).toFixed(2)}`; return alive(s) && (s.mob.fuseTime ?? 0) < 0.2; },
    (s, elapsed) => { if (!s.left && elapsed > 0.5) { s.left = true; s.player.position.set(0, 0, 40); } });

  add('creeper_creative', 'Ignores a player in Creative mode', 4, s => { survival(s, 1.5); s.player.gamemode = 'creative'; s.hits = []; recordHits(s); },
    s => { stopRecording(s); s.checkDetail = alive(s) ? 'did nothing' : 'exploded'; return alive(s) && s.hits.length === 0; });

  add('creeper_breaks_blocks', 'Explosion destroys nearby blocks', 3, s => { survival(s, 2); s.world.setVoxel(1, 0, 0, BLOCKS.DIRT); s.world.setVoxel(0, 0, 1, BLOCKS.DIRT); },
    s => { const left = [s.world.getVoxel(1, 0, 0), s.world.getVoxel(0, 0, 1)].filter(v => v === BLOCKS.DIRT).length; s.checkDetail = `${left} of 2 blocks left`; return left === 0; });

  add('creeper_no_loot', 'Drops nothing when it explodes', 3, s => { survival(s, 2); s.entities.drops = []; },
    s => { s.checkDetail = `${s.entities.drops.length} drops`; return !alive(s) && s.entities.drops.length === 0; });
  return cases;
}

function skeletonScenarios(type) {
  const slow = type === 'bogged' || type === 'parched';
  const cases = [];
  cases.push({
    id: 'archer_volleys', label: slow ? 'Fires arrows more slowly than a skeleton' : 'Fires an arrow about every 2.5 s', duration: 12,
    setup(s) { survival(s, 8); s.seen = new Set(); s.manager.game.difficulty = 'normal'; },
    update(s) { for (const a of s.manager.arrows) s.seen.add(a); },
    check(s) { s.checkDetail = `${s.seen.size} arrows in 12 s`; return slow ? s.seen.size >= 1 && s.seen.size <= 3 : s.seen.size >= 3; }
  });
  cases.push({
    id: 'archer_holds_range', label: 'Closes to about 10 blocks, then stands and shoots', duration: 8,
    setup(s) { survival(s, 16); },
    check(s) { const d = distance(s.mob.mesh.position, s.player.position); s.checkDetail = `ended ${d.toFixed(1)} blocks away`; return d > 6 && d < 12; }
  });
  return cases;
}

function spiderScenarios(type) {
  const cases = [];
  const daylight = (s) => { s.manager.game.worldTime = 6000; s.manager.game.isDaytime = true; };
  cases.push({
    id: 'spider_night_hostile', label: 'Hostile after dark: attacks an adjacent player', duration: 6,
    setup(s) { survival(s, 1.2); s.manager.game.worldTime = 18000; s.manager.game.isDaytime = false; recordHits(s); },
    check(s) { stopRecording(s); s.checkDetail = `${s.hits.length} hits`; return s.hits.length > 0; }
  });
  cases.push({
    id: 'spider_day_neutral', label: 'Neutral in daylight: leaves an unprovoked player alone', duration: 6,
    setup(s) { survival(s, 1.2); daylight(s); recordHits(s); },
    check(s) { stopRecording(s); s.checkDetail = `${s.hits.length} hits`; return s.hits.length === 0; }
  });
  cases.push({
    id: 'spider_day_provoked', label: 'Attacks in daylight once hit', duration: 6,
    setup(s) { survival(s, 1.2); daylight(s); recordHits(s); s.manager.damageMob(s.mob, 1, s.player.position, true, s.player); },
    check(s) { stopRecording(s); s.checkDetail = `${s.hits.length} hits`; return s.hits.length > 0; }
  });
  if (type === 'cave_spider') {
    cases.push({
      id: 'cave_spider_poison', label: 'Bite poisons the player on Normal and Hard', duration: 6,
      setup(s) { survival(s, 1.2); s.manager.game.difficulty = 'hard'; s.manager.game.worldTime = 18000; s.player.statusEffects = {}; },
      check(s) { s.checkDetail = `effects: ${Object.keys(s.player.statusEffects).join(', ') || 'none'}`; return !!s.player.statusEffects.poison; }
    });
    cases.push({
      id: 'cave_spider_no_poison_easy', label: 'Bite does not poison on Easy', duration: 6,
      setup(s) { survival(s, 1.2); s.manager.game.difficulty = 'easy'; s.manager.game.worldTime = 18000; s.player.statusEffects = {}; },
      check(s) { s.checkDetail = `effects: ${Object.keys(s.player.statusEffects).join(', ') || 'none'}`; return !s.player.statusEffects.poison; }
    });
  }
  return cases;
}

function endermanScenarios() {
  return [
    {
      id: 'enderman_neutral', label: 'Neutral: ignores an unprovoked player beside it', duration: 5,
      setup(s) { survival(s, 1.5); recordHits(s); },
      check(s) { stopRecording(s); s.checkDetail = `${s.hits.length} hits`; return s.hits.length === 0; }
    },
    {
      id: 'enderman_teleports_when_hit', label: 'Tries to teleport away when hurt (up to 32 blocks)', duration: 3,
      // The debug floor offers almost no valid destination, so the evidence is the attempt, not the distance.
      setup(s) {
        survival(s, 3); s.before = s.mob.mesh.position.clone(); s.tries = 0;
        const original = s.manager.teleportEnderman.bind(s.manager);
        s.restoreTeleport = () => { s.manager.teleportEnderman = original; };
        s.manager.teleportEnderman = (...a) => { s.tries++; return original(...a); };
        s.manager.damageMob(s.mob, 1, s.player.position, true, s.player);
      },
      check(s) { s.restoreTeleport?.(); const moved = s.mob.mesh.position.distanceTo(s.before); s.checkDetail = `${s.tries} teleport attempts, moved ${moved.toFixed(1)} blocks`; return s.tries >= 1; }
    },
    {
      id: 'enderman_retaliates', label: 'Attacks the player once provoked', duration: 6,
      setup(s) { survival(s, 1.5); recordHits(s); s.manager.damageMob(s.mob, 1, s.player.position, true, s.player); },
      check(s) { stopRecording(s); s.checkDetail = `${s.hits.length} hits`; return s.hits.length > 0; }
    },
  ];
}

function cubeScenarios(type) {
  return [
    {
      id: 'cube_splits', label: 'A large cube splits into smaller cubes when killed', duration: 2,
      setup(s) { s.mob.playerDamaged = true; s.beforeCount = s.manager.mobs.length; s.manager.damageMob(s.mob, 100000, s.player.position, true, s.player); },
      check(s) {
        const kids = s.manager.mobs.filter(m => m.type === type && m !== s.mob);
        s.checkDetail = `${kids.length} smaller cubes (sizes ${kids.map(k => k.slimeSize).join(', ')})`;
        return kids.length >= 2 && kids.length <= 4 && kids.every(k => k.slimeSize < 4);
      }
    },
    {
      id: 'cube_small_no_split', label: 'The smallest cube does not split', duration: 2,
      setup(s) { const small = type === 'slime' ? s.manager.spawnSlime(3, 0, 0, 1) : s.manager.spawnMagmaCube(3, 0, 0); if (small.slimeSize !== 1) { small.slimeSize = 1; } s.small = small; s.manager.damageMob(small, 100000, s.player.position, true, s.player); },
      check(s) { const kids = s.manager.mobs.filter(m => m.type === type && m !== s.mob && m !== s.small); s.checkDetail = `${kids.length} spawned`; return kids.length === 0; }
    },
  ];
}

export function specificScenarios(type) {
  const cases = [];
  if (type === 'creeper') cases.push(...creeperScenarios());
  if (['skeleton', 'stray', 'bogged', 'parched'].includes(type)) cases.push(...skeletonScenarios(type));
  if (type === 'spider' || type === 'cave_spider') cases.push(...spiderScenarios(type));
  if (type === 'enderman') cases.push(...endermanScenarios());
  if (type === 'slime' || type === 'magma_cube') cases.push(...cubeScenarios(type));
  cases.push(...animalScenarios(type));
  cases.push(...meleeDamageScenarios(type));
  return cases;
}
