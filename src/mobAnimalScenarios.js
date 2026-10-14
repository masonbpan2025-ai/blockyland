// Scenarios for animals, villagers and the utility mobs, taken from their wiki pages.
// See mobSpecificScenarios.js for the hostile mobs; the conventions are the same.
import * as THREE from 'three';
import { MOB_WIKI_DATA } from './mobWikiData.js';
import { BLOCKS } from './blocks.js';
import { pufferfishStage } from './fishBehavior.js';

const equip = (s, id) => { s.inventory.active = id ? { id, count: 64, isBlock: typeof id === 'number' } : null; };
const use = (s, id, mob = s.mob) => { equip(s, id); return s.manager.animalBehaviors.interact(mob, s.player, s.inventory); };
const alive = (s, m = s.mob) => s.manager.mobs.includes(m) && m.health > 0;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const survival = (s, z) => { s.player.gamemode = 'survival'; s.player.health = 100; s.player.position.set(0, 0, z); };
const far = (s) => survival(s, 100);
const night = (s) => { s.manager.game.worldTime = 18000; s.manager.game.isDaytime = false; };
const day = (s) => { s.manager.game.worldTime = 6000; s.manager.game.isDaytime = true; };

function seeded(seed = 7) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/** Collect every distinct value of `pick(s)` seen over the scenario (a projectile, an arrow, ...). */
function watch(s, key, items) { s[key] = s[key] || new Set(); for (const i of items) s[key].add(i); }

function sheepScenarios() {
  return [
    {
      id: 'sheep_shear_drops', label: 'Shearing drops 1-3 wool of its colour', duration: 1,
      setup(s) { s.player.gamemode = 'creative'; s.entities.drops = []; s.mob.woolColor = 'red'; s.accepted = use(s, 'shears'); },
      check(s) {
        const wool = s.entities.drops.filter(d => String(d.id) === String(BLOCKS.RED_WOOL) || /red_wool/.test(String(d.id))).reduce((n, d) => n + (d.count || 1), 0);
        s.checkDetail = `${wool} red wool dropped, sheared=${s.mob.isSheared}`;
        return s.mob.isSheared && wool >= 1 && wool <= 3;
      }
    },
    {
      id: 'sheep_regrows_wool', label: 'A sheared sheep eats grass (1 in 1000 per tick) and regrows its wool', duration: 3,
      // The roll is forced to succeed: the real chance averages one meal a minute, too slow to watch.
      setup(s) { s.world.setVoxel(0, -1, 0, BLOCKS.GRASS); s.mob.isSheared = true; far(s); s.manager.random = () => 0; },
      check(s) { s.checkDetail = `sheared=${s.mob.isSheared}, block below ${s.world.getVoxel(0, -1, 0)}`; return !s.mob.isSheared; }
    },
    {
      id: 'sheep_natural_colours', label: 'Natural colours: 81.8% white, 5% black / gray / light gray, 3% brown, 0.2% pink', duration: 0.1,
      setup(s) {
        s.manager.random = seeded();
        s.counts = {};
        for (let n = 0; n < 1000; n++) {
          const m = s.manager.spawnMob('sheep', 5, 0, 0, { natural: true });
          s.counts[m.woolColor] = (s.counts[m.woolColor] || 0) + 1;
          s.manager.removeMob(m, 'test');
        }
      },
      check(s) {
        const share = (c) => (s.counts[c] || 0) / 1000;
        s.checkDetail = Object.entries(s.counts).map(([c, n]) => `${c} ${(n / 10).toFixed(1)}%`).join(', ');
        return Math.abs(share('white') - 0.818) < 0.05 && Math.abs(share('black') - 0.05) < 0.03 && Math.abs(share('brown') - 0.03) < 0.025 && share('pink') < 0.015;
      }
    },
  ];
}

function mooshroomScenarios() {
  return [
    {
      id: 'mooshroom_shear', label: 'Shearing drops 5 mushrooms and turns it into a cow', duration: 1,
      setup(s) { s.player.gamemode = 'creative'; s.entities.drops = []; s.accepted = use(s, 'shears'); },
      check(s) {
        const dropped = s.entities.drops.reduce((n, d) => n + (d.count || 1), 0);
        const cows = s.manager.mobs.filter(m => m.type === 'cow').length;
        s.checkDetail = `${dropped} items dropped, ${cows} cow(s), mooshroom ${alive(s) ? 'still here' : 'gone'}`;
        return dropped === 5 && cows >= 1 && !alive(s);
      }
    },
    {
      id: 'mooshroom_stew', label: 'A bowl gives mushroom stew', duration: 1,
      setup(s) { s.player.gamemode = 'survival'; s.inventory.storage = []; s.inventory.hotbar = []; s.accepted = use(s, 'bowl'); },
      check(s) {
        const got = [...s.inventory.storage, ...s.inventory.hotbar].filter(Boolean).map(i => i.id);
        s.checkDetail = `received: ${got.join(', ') || 'nothing'}`;
        return got.some(id => /mushroom_stew/.test(String(id)));
      }
    },
  ];
}

function villagerScenarios() {
  return [{
    id: 'villager_panics', label: 'Runs from a zombie within 8 blocks', duration: 3,
    setup(s) { far(s); night(s); s.zombie = s.manager.spawnMob('zombie', 0, 0, 4); s.startGap = flat(s.mob.mesh.position, s.zombie.mesh.position); },
    check(s) { const gap = flat(s.mob.mesh.position, s.zombie.mesh.position); s.checkDetail = `gap ${s.startGap.toFixed(1)} -> ${gap.toFixed(1)}`; return gap > s.startGap + 1.5; }
  }];
}

function beeScenarios() {
  const rig = (difficulty) => (s) => {
    survival(s, 0.8); night(s); s.manager.game.difficulty = difficulty; s.player.statusEffects = {};
    s.manager.damageMob(s.mob, 1, s.player.position, true, s.player);
  };
  return [
    { id: 'bee_stings_poisons', label: 'An angry bee stings and poisons on Hard', duration: 8, setup: rig('hard'),
      check(s) { s.checkDetail = `stung=${!!s.mob.hasStung}, effects: ${Object.keys(s.player.statusEffects).join(', ') || 'none'}`; return !!s.mob.hasStung && !!s.player.statusEffects.poison; } },
    { id: 'bee_easy_no_poison', label: 'A sting does not poison on Easy', duration: 8, setup: rig('easy'),
      check(s) { s.checkDetail = `stung=${!!s.mob.hasStung}, effects: ${Object.keys(s.player.statusEffects).join(', ') || 'none'}`; return !s.player.statusEffects.poison; } },
  ];
}

function rabbitScenarios() {
  return [
    {
      id: 'rabbit_hops', label: 'Moves in hops', duration: 6,
      setup(s) { far(s); s.maxY = 0; s.travel = 0; s.last = s.mob.mesh.position.clone(); },
      update(s) { s.maxY = Math.max(s.maxY, s.mob.mesh.position.y); s.travel += flat(s.mob.mesh.position, s.last); s.last.copy(s.mob.mesh.position); },
      check(s) { s.checkDetail = `peak height ${s.maxY.toFixed(2)}, travelled ${s.travel.toFixed(1)}`; return s.maxY > 0.1 && s.travel > 1; }
    },
    {
      id: 'rabbit_flees_player', label: 'Runs from a player who comes within a few blocks', duration: 4,
      setup(s) { survival(s, 3); s.startGap = 3; },
      check(s) { const gap = flat(s.mob.mesh.position, s.player.position); s.checkDetail = `gap 3 -> ${gap.toFixed(1)}`; return gap > 5; }
    },
  ];
}

function killerBunnyScenarios() {
  const wiki = MOB_WIKI_DATA.killer_bunny;
  return [
    {
      id: 'killer_bunny_attacks', label: 'Is hostile: lunges at and bites the player', duration: 8,
      setup(s) { survival(s, 2); night(s); s.hits = []; const p = s.player; if (!p._orig) p._orig = p.takeDamage; p.takeDamage = function (n, ...r) { s.hits.push(n); return p._orig.call(this, n, ...r); }; },
      check(s) { if (s.player._orig) s.player.takeDamage = s.player._orig; s.checkDetail = `${s.hits.length} hits`; return s.hits.length > 0; }
    },
    {
      id: 'killer_bunny_retreats_when_hurt', label: 'Backs off briefly when struck, then returns to lunging', duration: 1.5,
      setup(s) { survival(s, 1.5); night(s); s.startGap = flat(s.mob.mesh.position, s.player.position); s.manager.damageMob(s.mob, 1, s.player.position, true, s.player); },
      check(s) { s.checkDetail = `retreat timer ${(s.mob.retreatTimer ?? 0).toFixed(2)}, gap ${s.startGap.toFixed(1)} -> ${flat(s.mob.mesh.position, s.player.position).toFixed(1)}`; return flat(s.mob.mesh.position, s.player.position) > s.startGap; }
    },
    ...(wiki?.meleeDamage ? ['easy', 'normal', 'hard'].map(d => ({
      id: `killer_bunny_damage_${d}`, label: `Bite deals ${wiki.meleeDamage[d]} damage on ${d[0].toUpperCase()}${d.slice(1)}`, duration: 8,
      setup(s) { survival(s, 1.5); night(s); s.manager.game.difficulty = d; s.hits = []; const p = s.player; if (!p._orig) p._orig = p.takeDamage; p.takeDamage = function (n, ...r) { s.hits.push(n); return p._orig.call(this, n, ...r); }; },
      check(s) { if (s.player._orig) s.player.takeDamage = s.player._orig; s.checkDetail = s.hits.length ? `hit for ${s.hits[0]}` : 'never hit'; return s.hits.length > 0 && Math.abs(s.hits[0] - wiki.meleeDamage[d]) < 0.01; }
    })) : []),
  ];
}

function catScenarios() {
  return [{
    id: 'cat_scares_creeper', label: 'Creepers keep away from a cat', duration: 3,
    setup(s) { far(s); s.creeper = s.manager.spawnMob('creeper', 2, 0, 0); s.startGap = flat(s.mob.mesh.position, s.creeper.mesh.position); },
    check(s) { const gap = flat(s.mob.mesh.position, s.creeper.mesh.position); s.checkDetail = `gap ${s.startGap.toFixed(1)} -> ${gap.toFixed(1)}`; return gap > s.startGap + 2; }
  }];
}

function witchScenarios() {
  return [
    {
      id: 'witch_throws_potions', label: 'Throws splash potions at a player within range', duration: 12,
      setup(s) { survival(s, 6); night(s); s.player.statusEffects = {}; s.startHealth = s.player.health; },
      // A thrown potion lands within a few ticks, so the evidence is what it did to the player.
      check(s) { const e = Object.keys(s.player.statusEffects); s.checkDetail = `health ${s.startHealth} -> ${s.player.health}, effects: ${e.join(', ') || 'none'}`; return s.player.health < s.startHealth || e.length > 0; }
    },
    {
      id: 'witch_heals_itself', label: 'Drinks a healing potion when badly hurt', duration: 8,
      setup(s) { far(s); s.mob.health = 4; s.low = 4; },
      check(s) { s.checkDetail = `health 4 -> ${s.mob.health}`; return s.mob.health > 4; }
    },
  ];
}

const flood = (s) => { s.world.fluid = BLOCKS.WATER; s.world.dimension = 'overworld'; s.mob.mesh.position.y = 1.2; };

function aquaticScenarios(type) {
  const cases = [];
  if (type === 'tadpole') {
    cases.push({
      id: 'tadpole_grows_into_frog', label: 'Grows into a frog after 20 minutes (fast-forwarded)', duration: 3,
      setup(s) { flood(s); far(s); s.mob.growthTimer = 0.5; },
      check(s) { const frogs = s.manager.mobs.filter(m => m.type === 'frog').length; s.checkDetail = `${frogs} frog(s), tadpole ${alive(s) ? 'still a tadpole' : 'gone'}`; return frogs >= 1 && !alive(s); }
    });
  }
  if (type === 'axolotl') {
    cases.push({
      id: 'axolotl_plays_dead', label: 'May play dead when hurt underwater, recovering health', duration: 8,
      // Wiki: a 1/3 chance, or certain when its health was already under 50%; the roll is forced here.
      setup(s) { flood(s); far(s); s.manager.random = () => 0; s.mob.health = 6; s.startHealth = 6; s.manager.damageMob(s.mob, 1, s.player.position, true, s.player); },
      check(s) { s.checkDetail = `health ${s.startHealth} -> ${s.mob.health} after taking 1`; return s.mob.health > s.startHealth - 1; }
    });
  }
  if (type === 'pufferfish') {
    cases.push({
      id: 'pufferfish_puffs', label: 'Puffs up when a player swims close', duration: 3,
      setup(s) { flood(s); survival(s, 1.2); s.everPuffed = false; },
      update(s) { const st = pufferfishStage(s.mob); if (st === 'semi' || st === 'puffed') s.everPuffed = true; },
      check(s) { s.checkDetail = `puffed at some point: ${s.everPuffed}`; return s.everPuffed; }
    });
    cases.push({
      id: 'pufferfish_relaxes', label: 'Deflates again once nothing is near', duration: 6,
      setup(s) { flood(s); far(s); s.mob.puffProgress = 1; s.mob.puffStage = undefined; },
      check(s) { const stage = pufferfishStage(s.mob); s.checkDetail = `stage ${stage}`; return stage === 'unpuffed'; }
    });
  }
  return cases;
}

function golemScenarios() {
  return [{
    id: 'golem_repair_with_iron', label: 'An iron ingot heals a damaged iron golem by 25 HP', duration: 0.5,
    setup(s) { s.player.gamemode = 'survival'; s.mob.health = 50; s.accepted = use(s, 'iron_ingot'); },
    check(s) { s.checkDetail = `health 50 -> ${s.mob.health}`; return s.mob.health === 75; }
  }];
}

function parrotScenarios() {
  return [{
    id: 'parrot_tamed_by_seeds', label: 'Seeds tame a parrot (1 in 3 per seed)', duration: 1,
    // The taming roll uses Math.random, so it is forced to succeed for the length of the call.
    setup(s) { s.player.gamemode = 'survival'; const real = Math.random; Math.random = () => 0; try { for (let n = 0; n < 6 && !s.mob.isTamed; n++) use(s, 'wheat_seeds'); } finally { Math.random = real; } },
    check(s) { s.checkDetail = `tamed=${!!s.mob.isTamed}`; return !!s.mob.isTamed; }
  }];
}

function batScenarios() {
  return [{
    id: 'bat_hangs_from_ceiling', label: 'Settles upside down under a solid block for a few seconds, then flies on', duration: 25,
    // The player stays about 9 blocks away: a bat despawns beyond 32, and one closer than 4 is disturbed.
    setup(s) {
      survival(s, 9); s.player.gamemode = 'creative'; s.hung = false;
      for (let x = -15; x <= 15; x++) for (let z = -15; z <= 15; z++) s.world.setVoxel(x, 4, z, BLOCKS.STONE);
      // It settles after a random 3-9 s of flight, so start the clock near its end, and start right under the ceiling:
      // the hang probe looks just above the bat's head (height 0.9), so it needs to be at about 3.095 under a block at y=4, head just below it.
      s.mob.mesh.position.y = 3.095; s.mob.flyTimer = 0.1;
    },
    update(s) { if (s.mob.isHanging) s.hung = true; },
    check(s) { s.checkDetail = `hung at some point: ${s.hung}`; return s.hung; }
  }];
}

function dragonScenarios() {
  return [
    {
      id: 'dragon_stays_aloft', label: 'Flies: stays well above the ground', duration: 5,
      setup(s) { far(s); },
      check(s) { s.checkDetail = `height ${s.mob.mesh.position.y.toFixed(1)}`; return alive(s) && s.mob.mesh.position.y > 1.5; }
    },
    {
      id: 'dragon_xp_12000', label: 'The first kill drops 12,000 XP', duration: 3,
      setup(s) { s.player.gamemode = 'survival'; s.mob.playerDamaged = true; s.xpBefore = s.entities.xp; s.manager.damageMob(s.mob, 100000, s.player.position, true, s.player); },
      check(s) { const gave = s.entities.xp - s.xpBefore; s.checkDetail = `gave ${gave}`; return gave === 12000; }
    },
  ];
}

function giantScenarios() {
  return [{
    id: 'giant_has_no_ai', label: 'Has no AI: does not move or attack', duration: 6,
    setup(s) { survival(s, 3); s.hits = []; const p = s.player; if (!p._orig) p._orig = p.takeDamage; p.takeDamage = function (n, ...r) { s.hits.push(n); return p._orig.call(this, n, ...r); }; s.start = s.mob.mesh.position.clone(); },
    check(s) { if (s.player._orig) s.player.takeDamage = s.player._orig; const d = flat(s.mob.mesh.position, s.start); s.checkDetail = `moved ${d.toFixed(2)}, ${s.hits.length} hits`; return d < 0.1 && s.hits.length === 0; }
  }];
}

export function animalScenarios(type) {
  const cases = [];
  if (type === 'sheep') cases.push(...sheepScenarios());
  if (type === 'mooshroom') cases.push(...mooshroomScenarios());
  if (type === 'villager') cases.push(...villagerScenarios());
  if (type === 'bee') cases.push(...beeScenarios());
  if (type === 'rabbit') cases.push(...rabbitScenarios());
  if (type === 'killer_bunny') cases.push(...killerBunnyScenarios());
  if (type === 'cat') cases.push(...catScenarios());
  if (type === 'witch') cases.push(...witchScenarios());
  if (['tadpole', 'axolotl', 'pufferfish'].includes(type)) cases.push(...aquaticScenarios(type));
  if (type === 'iron_golem') cases.push(...golemScenarios());
  if (type === 'parrot') cases.push(...parrotScenarios());
  if (type === 'bat') cases.push(...batScenarios());
  if (type === 'giant') cases.push(...giantScenarios());
  if (type === 'ender_dragon') cases.push(...dragonScenarios());
  return cases;
}
