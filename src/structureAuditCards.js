// Spec cards: the facts the wiki states about a structure, as checks the audit engine can run.
//
// One card per structure (see docs/STRUCTURE_AUDIT_PLAN.md, section 4). Every fact names the LAYER it belongs to:
//   L1 placement   L2 layout   L3 content   L4 game integration   L6 saves   (L5, the visual review, is a human
//   look in the Inspector and is recorded in the tracker, not checked here).
// and carries the wiki text it came from, so a failing row says what the wiki says and what was found.
//
// A fact that the game CANNOT yet satisfy is still written down: it fails (or is `waived` with the reason) rather
// than being left off, because a card that omits what is missing says the structure is finished when it is not.
//
// `check(obs)` returns `{ ok, detail }`, or `{ unchecked: reason }` when it needs the real-world mode.

import { resolveSpawnList } from './spawning/biomeSpawnResolver.js';
import { VILLAGE_WIKI as VILLAGE_WIKI_DATA } from './villageWikiData.js';
import { CATALOGUE } from './worldgen/generators/villageCatalogue.js';
import { STYLES } from './worldgen/generators/villageStyles.js';
import { VILLAGE_BLUEPRINTS } from './worldgen/generators/villageBlueprintData.js';
import { buildVillagePart, createVillagePools, abandonBlock, villageElement } from './worldgen/generators/village.js';
import { STRUCTURES, STRUCTURE_SETS } from './worldgen/registry.js';
import { MANSION_LOOT, JAILS as JAIL_ROOMS } from './worldgen/generators/mansion.js';
import { CHAMBER_KINDS as TRIAL_CHAMBER_KINDS, MOB_CATEGORIES as TRIAL_CATEGORIES } from './worldgen/generators/trialChambers.js';
import { CITY_FLOOR_Y, CITY_LOOT } from './worldgen/generators/ancientCity.js';
import { TRAIL_LOOT } from './worldgen/generators/trailRuins.js';
import { BRIDGE_CHANCE, SHIP_CHANCE, SHULKERS, END_CITY_LOOT } from './worldgen/generators/endCity.js';
import { SPIKE_CENTRES, SPIKE_SIZES, spikeColumns } from './worldgen/generators/endFeatures.js';
import { BASTION_TYPES, BASTION_LOOT } from './worldgen/generators/bastion.js';
import { DRIED_GHAST_CHANCE } from './worldgen/generators/netherFossil.js';
import { FORTRESS_PIECES, FORTRESS_LOOT } from './worldgen/generators/fortress.js';
import { PIECE_LIMITS, STRONGHOLD_LOOT } from './worldgen/generators/stronghold.js';
import { MINESHAFT_LOOT } from './worldgen/generators/mineshaft.js';
import { GEODE_CHANCE, CRACK_CHANCE, geodeIsCracked } from './worldgen/generators/geode.js';
import { FOSSIL_DESIGNS, FOSSIL_CHANCE, FOSSIL_ATTEMPTS } from './worldgen/generators/fossil.js';
import { BLUEPRINTS as FOSSIL_BLUEPRINTS } from './worldgen/generators/blueprints/fossil.js';
import { MONSTER_ROOM_ATTEMPTS, UPPER_ATTEMPTS, MONSTER_ROOM_LOOT } from './worldgen/generators/monsterRoom.js';
import { planMonumentRooms, ENTRY_UNIT, MONUMENT_PILLAR_SPOTS } from './worldgen/generators/monument.js';
import { LegacyRandom } from './worldgen/random.js';
import { LARGE_RUIN_CHANCE, CLUSTER_CHANCE, RUIN_LOOT, RUIN_ARCHAEOLOGY, RUIN_DROWNED, integrityOf, ruinDrawing } from './worldgen/generators/oceanRuin.js';
import { SHIPWRECK_TEMPLATES, SHIPWRECK_MATERIALS, SHIPWRECK_LOOT, WOOD_PAIRS } from './worldgen/generators/shipwreck.js';
import { rollStructureLoot } from './structureLoot.js';
import { PORTAL_SETUPS, NORMAL_DESIGNS, GIANT_DESIGNS, GIANT_CHANCE, PORTAL_LOOT, designCells } from './worldgen/generators/ruinedPortal.js';
import { PORTAL_MATERIALS } from './worldgen/generators/ruinedPortalDesigns.js';

const NEEDS_WORLD = 'needs the real-world mode';
const dims = (box) => ({ x: box.maxX - box.minX + 1, y: box.maxY - box.minY + 1, z: box.maxZ - box.minZ + 1 });

// ---------------------------------------------------------------------------------------------------------------
// Swamp hut. Source: https://minecraft.wiki/w/Swamp_Hut (Java Edition).

const HUT_WIKI = 'Swamp Hut';

/** The pillar columns: every column holding an oak log, with the lowest log's Y. */
function pillarColumns(obs) {
  const columns = new Map();
  for (const write of obs.writes) {
    if (write.name !== 'oak_log') continue;
    const key = `${write.x},${write.z}`;
    const column = columns.get(key) ?? { x: write.x, z: write.z, minY: write.y, maxY: write.y };
    column.minY = Math.min(column.minY, write.y);
    column.maxY = Math.max(column.maxY, write.y);
    columns.set(key, column);
  }
  return [...columns.values()];
}

const swampHutFacts = [
  {
    id: 'H1', layer: 'L1', source: `${HUT_WIKI}: "Swamp only ... Mangrove swamps do not generate huts"`,
    text: 'Generates only in the swamp biome (not mangrove swamp).',
    check: (o) => ({ ok: o.registry.biomes.length === 1 && o.registry.biomes[0] === 'swamp', detail: `biome gate: ${o.registry.biomes.join(', ')}` })
  },
  {
    id: 'H2', layer: 'L1', source: `${HUT_WIKI}: "the hut generates on or above the surface, and pillars extend down" (no terrain shaping)`,
    text: 'No terrain adaptation: only the pillars reach the ground.',
    check: (o) => ({ ok: (o.registry.terrainAdaptation || 'none') === 'none', detail: `terrain adaptation: ${o.registry.terrainAdaptation || 'none'}` })
  },
  {
    id: 'H3', layer: 'L2', source: `${HUT_WIKI}: witches and cats spawn in a "7x7x9 (x,y,z) area"`,
    text: 'The hut occupies a 7 x 7 x 9 box (its spawn volume), in either orientation.',
    check: (o) => {
      const d = dims(o.pieces[0].box);
      const ok = d.y === 7 && ((d.x === 7 && d.z === 9) || (d.x === 9 && d.z === 7));
      return { ok, detail: `box is ${d.x} x ${d.y} x ${d.z}` };
    }
  },
  {
    id: 'H4', layer: 'L2', source: `${HUT_WIKI}: "made of spruce planks"`,
    text: 'Walls and floor are spruce planks.',
    check: (o) => {
      const planks = o.writes.filter((write) => /_planks$/.test(write.name));
      const foreign = planks.filter((write) => write.name !== 'spruce_planks');
      const floor = o.writes.filter((write) => write.y === o.start.meta.floorY);
      const floorOk = floor.every((write) => write.name === 'spruce_planks' || write.name === 'oak_log');
      return { ok: planks.length >= 60 && foreign.length === 0 && floorOk, detail: `${planks.length} planks, ${foreign.length} of another wood; floor layer ${floorOk ? 'is spruce' : 'is not all spruce'}` };
    }
  },
  {
    id: 'H5', layer: 'L2', source: `${HUT_WIKI}: "Pillars/legs: oak logs"`,
    text: 'The pillars are oak logs (and nothing else is a log).',
    check: (o) => {
      const logs = o.writes.filter((write) => /_log$/.test(write.name));
      const foreign = logs.filter((write) => write.name !== 'oak_log');
      return { ok: logs.length >= 6 && foreign.length === 0, detail: `${logs.length} log blocks, ${foreign.length} not oak` };
    }
  },
  {
    id: 'H6', layer: 'L2', source: `${HUT_WIKI}: "Roof: spruce stairs and spruce planks"`,
    text: 'The roof is spruce stairs and spruce planks.',
    check: (o) => {
      const stairs = o.writes.filter((write) => /_stairs$/.test(write.name));
      const roofY = o.start.meta.floorY + 3;
      const roofPlanks = o.writes.filter((write) => write.name === 'spruce_planks' && write.y === roofY);
      const ok = stairs.length > 0 && stairs.every((write) => write.name === 'spruce_stairs') && roofPlanks.length >= 20;
      return { ok, detail: `${stairs.length} stairs, ${roofPlanks.length} roof planks` };
    }
  },
  {
    id: 'H7', layer: 'L2', source: `${HUT_WIKI}: "Interior height is two blocks"`,
    text: 'The interior is two blocks high: floor, two open blocks, then the roof.',
    check: (o) => {
      const { floorY } = o.start.meta;
      const roof = o.writes.filter((write) => write.y === floorY + 3 && (write.name === 'spruce_planks' || write.name === 'spruce_stairs'));
      const interiorSolid = o.writes.filter((write) => (write.y === floorY + 1 || write.y === floorY + 2)
        && write.name !== 'spruce_planks' && write.name !== 'oak_log' && !/crafting_table|cauldron|potted|oak_fence/.test(write.name));
      const above = o.writes.filter((write) => write.y > floorY + 3 && write.name !== 'spruce_stairs');
      return { ok: roof.length > 0 && interiorSolid.length === 0 && above.length === 0, detail: `roof layer at floor+3 has ${roof.length} blocks; ${above.length} blocks above it` };
    }
  },
  {
    id: 'H8', layer: 'L2', source: `${HUT_WIKI}: the entrance is a doorway; no door is listed`,
    text: 'There is no door: the entrance is an open doorway.',
    check: (o) => ({ ok: o.countMatching(/_door/) === 0, detail: `${o.countMatching(/_door/)} door blocks` })
  },
  {
    id: 'H9', layer: 'L2', source: `${HUT_WIKI}: "a small platform several blocks above ground, with no stairs up to the hut"`,
    text: 'The porch is raised above the ground and has no stairs leading up to it.',
    check: (o) => {
      const { floorY, ground } = o.start.meta;
      const lowStairs = o.writes.filter((write) => /_stairs$/.test(write.name) && write.y < floorY + 3);
      return { ok: floorY - ground >= 2 && lowStairs.length === 0, detail: `floor is ${floorY - ground} above the average ground; ${lowStairs.length} stairs below the roof` };
    }
  },
  {
    id: 'H10', layer: 'L2', source: `${HUT_WIKI}: "pillars extend down to solid ground. Part of a hut over a canyon will have pillars reaching the canyon bottom"`,
    text: 'Every pillar reaches down to the ground under it.',
    check: (o) => {
      const columns = pillarColumns(o);
      const floating = columns.filter((column) => column.minY > o.groundAt(column.x, column.z) + 1);
      return { ok: columns.length >= 5 && floating.length === 0, detail: `${columns.length} pillars, ${floating.length} not reaching the ground` };
    }
  },
  {
    id: 'H10b', layer: 'L2', source: `${HUT_WIKI}: infobox blocks list "Oak Fence"; the reference image shows fence posts at the porch's front corners and on the wall tops`,
    text: 'It uses oak fences: a post at each front corner of the porch and two on the wall tops.',
    check: (o) => ({ ok: o.count('oak_fence') === 4, detail: `${o.count('oak_fence')} oak fence(s)` })
  },
  {
    id: 'H10c', layer: 'L2', source: `${HUT_WIKI}: interior image shows window openings in the side walls, the pot on a sill`,
    text: 'The side walls have window openings (the upper block is open at the windows).',
    check: (o) => {
      // A side wall (4 blocks long, 2 high) holds 8 wall blocks; each window leaves one out.
      const walls = o.writes.filter((write) => write.name === 'spruce_planks' && (write.y === o.start.meta.floorY + 1 || write.y === o.start.meta.floorY + 2));
      return { ok: walls.length === 20, detail: `${walls.length} wall blocks (20 expected: 26, minus 3 windows, 2 fence posts and the pot)` };
    }
  },
  {
    id: 'H11', layer: 'L3', source: `${HUT_WIKI}: "Crafting table"`,
    text: 'It holds a crafting table.',
    check: (o) => ({ ok: o.count('crafting_table') === 1, detail: `${o.count('crafting_table')} crafting table(s)` })
  },
  {
    id: 'H12', layer: 'L3', source: `${HUT_WIKI}: "Cauldron, always empty in Java"`,
    text: 'It holds an EMPTY cauldron (Java).',
    check: (o) => ({ ok: o.count('cauldron') === 1 && o.countMatching(/water_cauldron|lava_cauldron|powder_snow_cauldron/) === 0, detail: `${o.count('cauldron')} empty cauldron(s), ${o.countMatching(/water_cauldron|lava_cauldron|powder_snow_cauldron/)} filled` })
  },
  {
    id: 'H13', layer: 'L3', source: `${HUT_WIKI}: "Flower pot with a red mushroom"`,
    text: 'It holds a flower pot with a red mushroom.',
    check: (o) => ({ ok: o.count('potted_red_mushroom') === 1, detail: `${o.count('potted_red_mushroom')} potted red mushroom(s)` })
  },
  {
    id: 'H14', layer: 'L3', source: `${HUT_WIKI}: "No chest or loot is listed"`,
    text: 'There is no chest and no loot.',
    check: (o) => {
      const loot = o.writes.filter((write) => write.lootTable);
      return { ok: o.count('chest') === 0 && loot.length === 0, detail: `${o.count('chest')} chests, ${loot.length} loot tables` };
    }
  },
  {
    id: 'H15', layer: 'L3', source: `${HUT_WIKI}: "one witch and one stray black cat spawn inside. Neither naturally despawns."`,
    text: 'One witch and one black cat are placed inside the hut, both marked persistent.',
    check: (o) => {
      const witches = o.spawnsOf('witch');
      const cats = o.spawnsOf('cat');
      const box = o.pieces[0].box;
      const { floorY } = o.start.meta;
      const inside = [...witches, ...cats].every((spawn) => box.contains(Math.floor(spawn.x), Math.floor(spawn.y), Math.floor(spawn.z)) && spawn.y >= floorY + 1);
      const persistent = [...witches, ...cats].every((spawn) => spawn.options.persistent === true);
      const black = cats.length === 1 && cats[0].options.variant === 'all_black';
      return { ok: witches.length === 1 && cats.length === 1 && inside && persistent && black, detail: `${witches.length} witch, ${cats.length} cat; inside the hut: ${inside}; persistent: ${persistent}; black: ${black}` };
    }
  },
  {
    id: 'H16', layer: 'L4', source: `${HUT_WIKI}: "The witch does not spawn on Peaceful difficulty."`,
    text: 'On Peaceful the hut has no witch (the cat still spawns).',
    check: async (o) => {
      if (o.mode !== 'world') return { unchecked: NEEDS_WORLD };
      const { observe } = await import('./structureAudit.js');
      const peaceful = await observe(o.structureId, { seed: o.seed, mode: 'world', biome: o.biome, difficulty: 'peaceful' });
      const mobs = peaceful.integration.recorder.mobs;
      const witches = mobs.filter((mob) => mob.type === 'witch').length;
      const cats = mobs.filter((mob) => mob.type === 'cat').length;
      return { ok: witches === 0 && cats === 1, detail: `on Peaceful: ${witches} witch, ${cats} cat` };
    }
  },
  {
    id: 'H17', layer: 'L4', source: `${HUT_WIKI}: "Additional witches can spawn at any block in the 7x7x9 area"`,
    text: 'The hut\'s box makes the game\'s spawner use the hut\'s monster list (witch) inside it, and the biome\'s list outside.',
    check: (o) => {
      if (!o.integration) return { unchecked: NEEDS_WORLD };
      const box = o.pieces[0].box;
      const centre = [Math.floor((box.minX + box.maxX) / 2), box.minY + 2, Math.floor((box.minZ + box.maxZ) / 2)];
      const inside = resolveSpawnList({ biomeId: 'swamp', category: 'monster', x: centre[0], y: centre[1], z: centre[2], structureAt: o.integration.structureIdAt });
      const outside = resolveSpawnList({ biomeId: 'swamp', category: 'monster', x: box.minX - 3, y: centre[1], z: box.minZ - 3, structureAt: o.integration.structureIdAt });
      const insideWitchOnly = inside.source === 'structure' && inside.entries.length === 1 && inside.entries[0].type === 'witch';
      return { ok: insideWitchOnly && outside.source !== 'structure', detail: `inside: ${inside.source} [${inside.entries.map((e) => e.type)}]; outside: ${outside.source}` };
    }
  },
  {
    id: 'H18', layer: 'L4', source: `${HUT_WIKI}: witches and cats from generation have not despawned since 1.11`,
    text: 'The hut\'s witch and cat are flagged to persist in the game (no despawn by distance).',
    check: (o) => {
      if (!o.integration) return { unchecked: NEEDS_WORLD };
      const mobs = o.integration.recorder.mobs.filter((mob) => mob.type === 'witch' || mob.type === 'cat');
      const flagged = mobs.filter((mob) => mob.mob.persistenceRequired === true);
      return { ok: mobs.length === 2 && flagged.length === 2, detail: `${flagged.length}/${mobs.length} flagged persistent` };
    }
  },
  {
    id: 'H19', layer: 'L4', source: 'game integration of the roof',
    text: 'The roof stairs face up the slope (both sides), registered with the game.',
    check: (o) => {
      if (!o.integration) return { unchecked: NEEDS_WORLD };
      const stairs = [...o.integration.world.structureOrientations.values()].filter((entry) => /_stairs$/.test(entry.name));
      const directions = new Set(stairs.map((entry) => entry.facing));
      return { ok: stairs.length >= 20 && directions.size === 4, detail: `${stairs.length} stairs facing ${[...directions].sort().join(', ')}` };
    }
  },
  {
    id: 'H20', layer: 'L2', source: `${HUT_WIKI}: "Vines can generate from the porch down to the ground."`,
    text: 'Vines can hang from the porch.',
    waived: 'Vines need a wall-attachment facing that the voxel world cannot store yet (plan P0.6). Optional in the wiki ("can generate").'
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Villages. Source: https://minecraft.wiki/w/Village (Java Edition). A partial card: the facts the generator has
// been audited against so far, including the ones it still FAILS (cats, taiga armor stands), so the Inspector
// shows what is left.

const VILLAGE_WIKI = 'Village';
const VILLAGE_TYPE = { village_plains: 'plains', village_desert: 'desert', village_savanna: 'savanna', village_snowy: 'snowy', village_taiga: 'taiga' };
/** The crops the wiki's infobox lists per type. */
const VILLAGE_CROPS = {
  plains: ['wheat', 'carrots', 'potatoes', 'beetroots'], desert: ['wheat', 'beetroots', 'melon_stem'], savanna: ['wheat', 'melon_stem', 'melon'],
  snowy: ['wheat', 'carrots', 'potatoes'], taiga: ['wheat', 'potatoes', 'pumpkin_stem', 'pumpkin']
};
const CROP_OF = (name) => name.replace(/_stage_\d+$/, '');
const isCrop = (name) => /_stage_\d+$/.test(name) || /^(melon|pumpkin)(_stem)?$/.test(name);
const bedFeet = (o) => o.writes.filter((w) => /_bed(_foot)?$/.test(w.name));

const villageElementKind = (type, part) => villageElement(type, part)?.kind ?? null;

/** Our block names as the wiki names them, for the infobox fact (W1). */
export function normaliseVillageBlock(name) {
  return { grass: 'grass_block', red_bed_foot: 'red_bed', farmland_moist: 'farmland' }[name]
    ?? name.replace(/_stage_\d+$/, '').replace(/_door_top$/, '_door').replace(/_bed_head$/, '_bed');
}

const villageFacts = (variant) => {
  const type = VILLAGE_TYPE[variant];
  const catalogue = CATALOGUE[type];
  return [
    {
      id: 'V1', layer: 'L3', source: `${VILLAGE_WIKI}: "A gathering site is defined as a bell"`,
      text: 'There is a meeting point with a bell, and it is one of the wiki\'s meeting points for this village type.',
      check: (o) => {
        const meeting = (o.start.meta.meetingPoint ?? '').replace(/^zombie\//, '');
        const known = catalogue.meetings.some((m) => m.name === meeting);
        return { ok: o.count('bell') >= 1 && known, detail: `${o.count('bell')} bell(s); meeting point ${meeting}` };
      }
    },
    {
      id: 'V2', layer: 'L3', source: `${VILLAGE_WIKI}: "Villagers spawn only in houses that have beds"; abandoned: "all generated villagers are instead zombie villagers"`,
      text: 'There is one villager per bed (zombie villagers in an abandoned village), and none elsewhere.',
      check: (o) => {
        const beds = bedFeet(o).length;
        const villagers = o.spawnsOf('villager').length;
        const zombies = o.spawnsOf('zombie_villager').length;
        const ok = beds > 0 && (o.start.meta.abandoned ? zombies === beds && villagers === 0 : villagers === beds && zombies === 0);
        return { ok, detail: `${beds} beds, ${villagers} villagers, ${zombies} zombie villagers` };
      }
    },
    {
      id: 'V3', layer: 'L3', source: `${VILLAGE_WIKI}: "Iron golems spawn in regular villages only; one spawns near a village meeting point"`,
      text: 'One iron golem stands near the meeting point (none in an abandoned village).',
      check: (o) => {
        const golems = o.spawnsOf('iron_golem').length;
        return { ok: golems === (o.start.meta.abandoned ? 0 : 1), detail: `${golems} iron golem(s)` };
      }
    },
    {
      id: 'V4', layer: 'L3', source: `${VILLAGE_WIKI} infobox (${type}): crops ${VILLAGE_CROPS[type].join(', ')}`,
      text: `Farms grow only this type's crops (${VILLAGE_CROPS[type].join(', ')}) on farmland.`,
      check: (o) => {
        const crops = o.writes.filter((w) => isCrop(w.name)).map((w) => CROP_OF(w.name));
        const foreign = [...new Set(crops.filter((c) => !VILLAGE_CROPS[type].includes(c)))];
        return { ok: foreign.length === 0 && (crops.length > 0) === (o.count('farmland_moist') > 0), detail: `${o.count('farmland_moist')} farmland, ${crops.length} crops${foreign.length ? `, not this type's: ${foreign.join(', ')}` : ''}` };
      }
    },
    {
      id: 'V5', layer: 'L3', source: `${VILLAGE_WIKI}/Structure: farms with "irrigation canals" in every type`,
      text: 'Fields are watered: a village with a farm has water.',
      check: (o) => {
        const farms = o.start.meta.partMix.filter((p) => villageElementKind(type, p) === 'farm').length;
        return { ok: farms === 0 || o.count('water') >= 1, detail: `${farms} farm(s), ${o.count('water')} water block(s)` };
      }
    },
    {
      id: 'V6', layer: 'L2', source: `${VILLAGE_WIKI}: "paths are comprised of dirt paths and grass ... Desert villages are generated with smooth sandstone paths"`,
      text: type === 'desert' ? 'Paths are smooth sandstone.' : 'Paths are dirt paths with some grass.',
      check: (o) => {
        const want = type === 'desert' ? 'smooth_sandstone' : 'dirt_path';
        return { ok: o.count(want) >= 40 && (type === 'desert' || o.count('dirt_path') > 0), detail: `${o.count(want)} ${want}` };
      }
    },
    {
      id: 'V7', layer: 'L3', source: `${VILLAGE_WIKI}: job site buildings hold their job site blocks`,
      text: 'Job-site buildings hold workstation blocks.',
      check: (o) => {
        const stations = ['lectern', 'loom', 'smithing_table', 'grindstone', 'cartography_table', 'fletching_table', 'composter', 'blast_furnace', 'smoker', 'brewing_stand', 'barrel', 'stonecutter', 'water_cauldron']
          .filter((name) => o.count(name) > 0);
        const jobs = o.start.meta.partMix.filter((p) => villageElementKind(type, p) === 'job').length;
        return { ok: jobs === 0 || stations.length >= 1, detail: `${jobs} job building(s); ${stations.length} workstation kind(s): ${stations.join(', ')}` };
      }
    },
    {
      id: 'V8', layer: 'L3', source: `${VILLAGE_WIKI}: "Cats spawn naturally inside villages, one for every four beds for a maximum of five"`,
      text: 'There is one cat for every four beds, up to five.',
      check: (o) => {
        const beds = bedFeet(o).length;
        const want = Math.min(5, Math.floor(beds / 4));
        const cats = o.spawnsOf('cat').length;
        return { ok: cats === want, detail: `${beds} beds -> ${want} cat(s) expected, ${cats} found` };
      }
    },
    {
      id: 'V9', layer: 'L3', source: `${VILLAGE_WIKI} infobox: bed colours of the ${type} village`,
      text: `Beds are this type's colours (${STYLES[type].beds.join(', ')}).`,
      check: (o) => {
        const colours = [...new Set(bedFeet(o).map((w) => w.name.replace(/_bed(_foot)?$/, '')))];
        const foreign = colours.filter((c) => !STYLES[type].beds.includes(c));
        return { ok: colours.length > 0 && foreign.length === 0, detail: `bed colours: ${colours.join(', ')}` };
      }
    },
    {
      id: 'V10', layer: 'L3', source: `${VILLAGE_WIKI}: "One camel spawns at the meeting point of each desert village, excluding abandoned villages"`,
      text: type === 'desert' ? 'A camel stands at the meeting point (not in an abandoned village).' : 'No camel (only desert villages have one).',
      check: (o) => {
        const camels = o.spawnsOf('camel').length;
        const want = type === 'desert' && !o.start.meta.abandoned ? 1 : 0;
        return { ok: camels === want, detail: `${camels} camel(s)` };
      }
    },
    {
      id: 'V11', layer: 'L3', source: `${VILLAGE_WIKI}: "Two armor stands are part of the taiga village with pieces of armor"; taiga_armorer_2: "two armor stands, one with an iron helmet, the other with an iron chestplate"`,
      text: type === 'taiga' ? 'The taiga armorer workshop holds two armor stands, with an iron helmet and an iron chestplate.' : 'No armor stands (taiga villages are the only structure with them).',
      check: (o) => {
        const stands = o.spawnsOf('armor_stand');
        if (type !== 'taiga') return { ok: stands.length === 0, detail: `${stands.length} armor stand(s)` };
        // The stands belong to one building, which a given village may or may not draw: check the building itself.
        const part = buildVillagePart('taiga', 'taiga_armorer_2');
        const equipment = part.entities.filter((e) => e.nbt.type === 'armor_stand').map((e) => e.nbt.equipment?.[0]).sort();
        const inVillage = o.start.meta.partMix.filter((p) => p === 'taiga_armorer_2').length;
        const ok = equipment.join() === 'iron_chestplate,iron_helmet' && stands.length === inVillage * 2;
        return { ok, detail: `taiga_armorer_2 holds ${equipment.join(' + ')}; this village has ${inVillage} armorer workshop(s) and ${stands.length} stand(s)` };
      }
    },
    {
      id: 'V12', layer: 'L1', source: `${VILLAGE_WIKI}: "A village has a 2% chance of generating as an abandoned village"`,
      text: 'One village in fifty is abandoned: zombie villagers, no doors or torches, brown glass, cobwebs, no golem.',
      check: (o) => {
        const pool = createVillagePools(type).resolve('village/town_centres');
        const total = pool.elements.reduce((sum, e) => sum + e.weight, 0);
        const abandoned = pool.elements.filter((e) => e.name.startsWith('zombie/')).reduce((sum, e) => sum + e.weight, 0);
        const rate = abandoned / total;
        const processorOk = abandonBlock('minecraft:torch', STYLES[type], 0, 0, 0) === null
          && abandonBlock(`minecraft:${STYLES[type].door}`, STYLES[type], 0, 0, 0) === null
          && (STYLES[type].window !== 'glass_pane' || abandonBlock('minecraft:glass_pane', STYLES[type], 0, 0, 0) === 'minecraft:brown_stained_glass_pane');
        return { ok: Math.abs(rate - 0.02) < 1e-9 && processorOk, detail: `abandoned share of the town-centre pool: ${(rate * 100).toFixed(2)}%; this village ${o.start.meta.abandoned ? 'IS' : 'is not'} abandoned` };
      }
    },
    {
      id: 'V13', layer: 'L1', source: `${VILLAGE_WIKI}: "The type of the village ... is determined by the biome at the village center or meeting point"`,
      text: `The meeting point stands in a ${type} village biome (${(STRUCTURES[variant]?.biomes ?? []).join(', ')}).`,
      check: (o) => {
        const biomes = o.registry.biomes ?? [];
        return { ok: biomes.includes(o.start.biome), detail: `biome at the meeting point: ${o.start.biome}` };
      }
    },
    {
      id: 'V14', layer: 'L2', source: `${VILLAGE_WIKI}/Structure: the ${type} building list`,
      text: `Every building in the village is one of the wiki's ${type} village structures.`,
      check: (o) => {
        const known = new Set(VILLAGE_WIKI_DATA.templates[type].map((t) => t.name));
        const ours = new Set([...catalogue.decorations.map((d) => d.name)]);
        const unknown = o.start.meta.partMix.filter((p) => !['street', 'terminus'].includes(p) && !known.has(p.replace(/^zombie\//, '')) && !ours.has(p));
        return { ok: unknown.length === 0, detail: `${new Set(o.start.meta.partMix).size} distinct parts${unknown.length ? `; not on the wiki: ${[...new Set(unknown)].join(', ')}` : ''}` };
      }
    }
  ];
};

/** W1 for a village type: the infobox list, plus blocks the type's own building descriptions name (the snowy mason's
 *  stonecutter is in its description but not in the snowy infobox), minus Bedrock-only entries. */
function villageInfobox(type) {
  const wiki = VILLAGE_WIKI_DATA.infobox[type];
  const named = { snowy: ['stonecutter'] }[type] ?? [];
  // The type's blueprints (also the wiki) draw a few blocks the infobox list leaves out; tests/villageWiki.test.js
  // pins exactly which.
  const drawn = Object.entries(VILLAGE_BLUEPRINTS).filter(([name]) => name.startsWith(type + '_'))
    .flatMap(([, bp]) => bp.palette.map((p) => normaliseVillageBlock(p.Name.replace('minecraft:', ''))));
  return [...new Set([...wiki.blocks, ...named, ...drawn])];
}

// ---------------------------------------------------------------------------------------------------------------
// Desert pyramid. Source: https://minecraft.wiki/w/Desert_Pyramid and /Structure (materials table and blueprint).

const PYRAMID_WIKI = 'Desert Pyramid';
/** The /Structure page's materials table (fixed counts; sand and suspicious sand vary). */
const PYRAMID_MATERIALS = {
  blue_terracotta: 2, chest: 4, chiseled_sandstone: 62, cut_sandstone: 238, orange_terracotta: 66,
  sandstone_slab: 2, sandstone_stairs: 17, stone_pressure_plate: 1, tnt: 9
};

const desertPyramidFacts = [
  {
    id: 'P1', layer: 'L1', source: `${PYRAMID_WIKI}: "Desert pyramids generate in desert biomes"`,
    text: 'Generates only in the desert.',
    check: (o) => ({ ok: o.registry.biomes.length === 1 && o.registry.biomes[0] === 'desert', detail: `biome gate: ${o.registry.biomes.join(', ')}` })
  },
  {
    id: 'P2', layer: 'L2', source: `${PYRAMID_WIKI}: "the pyramid's 21x21 ground floor"`,
    text: 'The ground floor is 21 x 21.',
    check: (o) => {
      const floorY = o.start.meta.groundFloorY;
      const floor = o.writes.filter((w) => w.y === floorY);
      const xs = floor.map((w) => w.x); const zs = floor.map((w) => w.z);
      const dx = Math.max(...xs) - Math.min(...xs) + 1; const dz = Math.max(...zs) - Math.min(...zs) + 1;
      return { ok: dx === 21 && dz === 21 && floor.length === 441, detail: `ground floor ${dx} x ${dz}, ${floor.length} blocks` };
    }
  },
  {
    id: 'P3', layer: 'L3', source: `${PYRAMID_WIKI}/Structure: Materials table`,
    text: 'Exactly the materials table: 238 cut sandstone, 62 chiseled sandstone, 66 orange and 2 blue terracotta, 17 stairs, 2 slabs, 9 TNT, 4 chests, 1 pressure plate.',
    check: (o) => {
      const off = Object.entries(PYRAMID_MATERIALS).filter(([name, n]) => o.count(name) !== n).map(([name, n]) => `${name} ${o.count(name)}/${n}`);
      return { ok: off.length === 0, detail: off.length ? `differs: ${off.join(', ')}` : 'every fixed count matches' };
    }
  },
  {
    id: 'P4', layer: 'L3', source: `${PYRAMID_WIKI}: "a secret fosse containing four chests"; /Structure: "Chest -- facing: Pressure Plate"`,
    text: 'Four chests below the ground floor, each facing the pressure plate, with the desert pyramid loot table.',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      const plate = o.writes.find((w) => w.name === 'stone_pressure_plate');
      const below = chests.every((c) => c.y < o.start.meta.groundFloorY);
      const loot = chests.every((c) => c.lootTable === 'minecraft:chests/desert_pyramid');
      const facing = chests.every((c) => {
        const want = Math.abs(plate.x - c.x) > Math.abs(plate.z - c.z) ? (plate.x > c.x ? 'east' : 'west') : (plate.z > c.z ? 'south' : 'north');
        return c.props?.facing === want;
      });
      return { ok: chests.length === 4 && below && loot && facing, detail: `${chests.length} chests; hidden ${below}; loot ${loot}; facing the plate ${facing}` };
    }
  },
  {
    id: 'P5', layer: 'L3', source: `${PYRAMID_WIKI}: "a stone pressure plate directly under the blue terracotta block ... connected to a 3x3 grid of TNT"`,
    text: 'The trap: a stone pressure plate under the centre blue terracotta, over a 3 x 3 grid of TNT.',
    check: (o) => {
      const plate = o.writes.find((w) => w.name === 'stone_pressure_plate');
      const blue = o.writes.filter((w) => w.name === 'blue_terracotta' && w.x === plate.x && w.z === plate.z && w.y > plate.y);
      const tnt = o.writes.filter((w) => w.name === 'tnt');
      const tntYs = new Set(tnt.map((t) => t.y));
      const grid = tntYs.size === 1 && tnt.every((t) => Math.abs(t.x - plate.x) <= 1 && Math.abs(t.z - plate.z) <= 1) && [...tntYs][0] < plate.y;
      return { ok: blue.length >= 1 && tnt.length === 9 && grid, detail: `blue terracotta above the plate: ${blue.length}; TNT ${tnt.length} in a 3x3 below: ${grid}` };
    }
  },
  {
    id: 'P6', layer: 'L2', source: `${PYRAMID_WIKI}: "a checkerboard pattern of terracotta and sandstone in a wind rose symbol, with a block of blue terracotta in the center"`,
    text: 'The ground floor has the wind rose: blue terracotta in the middle, orange terracotta around it.',
    check: (o) => {
      const floorY = o.start.meta.groundFloorY;
      const floor = o.writes.filter((w) => w.y === floorY);
      const cx = (Math.min(...floor.map((w) => w.x)) + Math.max(...floor.map((w) => w.x))) / 2;
      const cz = (Math.min(...floor.map((w) => w.z)) + Math.max(...floor.map((w) => w.z))) / 2;
      const centre = floor.find((w) => w.x === cx && w.z === cz);
      const rose = floor.filter((w) => w.name === 'orange_terracotta' && Math.abs(w.x - cx) <= 3 && Math.abs(w.z - cz) <= 3);
      return { ok: centre?.name === 'blue_terracotta' && rose.length >= 8, detail: `centre ${centre?.name}; ${rose.length} orange terracotta round it` };
    }
  },
  {
    id: 'P7', layer: 'L3', source: `${PYRAMID_WIKI}/Structure: "5 to 7 [cellar blocks] are replaced with suspicious sand ... One of these [roof] blocks is replaced with suspicious sand"`,
    text: 'The buried cellar holds 6 to 8 suspicious sand in all, with the desert pyramid archaeology loot.',
    check: (o) => {
      const sus = o.writes.filter((w) => w.name === 'suspicious_sand');
      const loot = sus.every((w) => w.lootTable === 'minecraft:archaeology/desert_pyramid');
      return { ok: sus.length >= 6 && sus.length <= 8 && loot, detail: `${sus.length} suspicious sand; archaeology loot ${loot}` };
    }
  },
  {
    id: 'P8', layer: 'L2', source: `${PYRAMID_WIKI}: "the top of the pyramid is almost always above ground"`,
    text: 'The pyramid rises above the ground floor (towers and the roof are above the sand).',
    check: (o) => {
      const top = Math.max(...o.writes.map((w) => w.y));
      return { ok: top - o.start.meta.groundFloorY >= 9, detail: `top ${top - o.start.meta.groundFloorY} blocks above the ground floor` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Igloo. Source: https://minecraft.wiki/w/Igloo and /Structure (materials table and blueprint).

const IGLOO_WIKI = 'Igloo';

const iglooFacts = [
  {
    id: 'G1', layer: 'L1', source: `${IGLOO_WIKI}: "Igloos generate uncommonly in snowy taigas, snowy plains, and rarely in snowy slopes"`,
    text: 'Generates in snowy taiga, snowy plains and snowy slopes only.',
    check: (o) => ({ ok: [...o.registry.biomes].sort().join() === 'snowy_plains,snowy_slopes,snowy_taiga', detail: `biome gate: ${o.registry.biomes.join(', ')}` })
  },
  {
    id: 'G2', layer: 'L3', source: `${IGLOO_WIKI}/Structure: Materials (the dome)`,
    text: 'The dome: 94 snow blocks (95 without a basement), 9 white and 3 light gray carpet, 2 ice windows, a red bed, a furnace, a crafting table and a redstone torch.',
    check: (o) => {
      const snow = o.start.meta.hasBasement ? 94 : 95;
      const want = { snow_block: snow, white_carpet: 9, light_gray_carpet: 3, ice: 2, furnace: 1, crafting_table: 1, redstone_torch: 1 };
      // This game names the snow block `snow` (its id is shared with the SNOW_BLOCK alias).
      const count = (n) => (n === 'snow_block' ? o.countMatching(/^snow(_block)?$/) : o.count(n));
      const off = Object.entries(want).filter(([n, c]) => count(n) !== c).map(([n, c]) => `${n} ${count(n)}/${c}`);
      const bed = o.countMatching(/^red_bed(_foot)?$/);
      return { ok: off.length === 0 && bed === 1, detail: off.length ? off.join(', ') : 'every dome count matches' };
    }
  },
  {
    id: 'G3', layer: 'L2', source: `${IGLOO_WIKI}: "It has an entrance without a door"`,
    text: 'The entrance has no door.',
    check: (o) => ({ ok: o.countMatching(/_door/) === 0, detail: `${o.countMatching(/_door/)} door blocks` })
  },
  {
    id: 'G4', layer: 'L1', source: `${IGLOO_WIKI}: "Half of all igloos have an oak trapdoor ... leading down a long ladder shaft to a basement"`,
    text: 'Half of all igloos have a basement.',
    check: async () => {
      const { generateIgloo } = await import('./worldgen/generators/igloo.js');
      let n = 0;
      for (let chunk = 0; chunk < 400; chunk++) if (generateIgloo({ seed: 99, chunkX: chunk, chunkZ: -chunk, context: { surfaceY: () => 40 } }).meta.hasBasement) n++;
      return { ok: n > 160 && n < 240, detail: `${n} of 400 sampled igloos have a basement` };
    }
  },
  {
    id: 'G5', layer: 'L3', source: `${IGLOO_WIKI}: the basement -- trapdoor, ladder shaft, brewing stand with a splash potion of Weakness, potted cactus, cauldron two-thirds full, chest with a golden apple, two clerics behind iron bars`,
    text: 'With a basement: trapdoor, ladder shaft, brewing stand (splash potion of Weakness), potted cactus, a two-thirds-full cauldron, the igloo chest, iron bars, and a cleric villager and zombie villager that never despawn.',
    check: (o) => {
      if (!o.start.meta.hasBasement) return { ok: o.count('chest') === 0 && o.count('brewing_stand') === 0 && o.spawns.length === 0 && o.count('oak_trapdoor') === 0, detail: 'no basement: no trapdoor, chest, brewing stand or mobs (the wiki: "absent in this case")' };
      const chest = o.writes.find((w) => w.name === 'chest');
      const cauldron = o.writes.find((w) => w.name === 'water_cauldron');
      const types = o.spawns.map((s) => s.type).sort().join();
      const ok = o.count('oak_trapdoor') === 1 && o.count('ladder') >= 18 && o.count('brewing_stand') === 1 && o.count('potted_cactus') === 1
        && cauldron?.props?.level === '2' && chest?.lootTable === 'minecraft:chests/igloo_chest' && o.count('iron_bars') === 4
        && types === 'villager,zombie_villager' && o.spawns.every((s) => s.options?.persistent && s.options?.profession === 'cleric');
      return { ok, detail: `ladders ${o.count('ladder')}, cauldron level ${cauldron?.props?.level}, chest ${chest?.lootTable}, mobs ${types}` };
    }
  },
  {
    id: 'G6', layer: 'L3', source: `${IGLOO_WIKI}/Structure: infested chiseled (2), mossy (1) and plain (6) stone bricks`,
    text: 'Some basement bricks are infested with silverfish: 2 chiseled, 1 mossy, 6 plain.',
    check: (o) => {
      if (!o.start.meta.hasBasement) return { ok: o.countMatching(/^infested_/) === 0, detail: 'no basement' };
      const got = [o.count('infested_chiseled_stone_bricks'), o.count('infested_mossy_stone_bricks'), o.count('infested_stone_bricks')];
      return { ok: got.join() === '2,1,6', detail: `infested chiseled/mossy/plain: ${got.join('/')}` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Pillager outpost. Source: https://minecraft.wiki/w/Pillager_Outpost and /Structure (materials tables, blueprints).

const OUTPOST_WIKI = 'Pillager Outpost';

const pillagerOutpostFacts = [
  {
    id: 'O1', layer: 'L1', source: `${OUTPOST_WIKI}: the Java biome list (village biomes plus grove, snowy slopes, jagged, frozen and stony peaks, cherry grove)`,
    text: 'Generates in plains, desert, savanna, snowy plains, taiga, meadow, grove, snowy slopes, jagged peaks, frozen peaks, stony peaks and cherry grove.',
    check: (o) => {
      const want = 'cherry_grove,desert,frozen_peaks,grove,jagged_peaks,meadow,plains,savanna,snowy_plains,snowy_slopes,stony_peaks,taiga';
      return { ok: [...o.registry.biomes].sort().join() === want, detail: `biome gate: ${[...o.registry.biomes].sort().join(', ')}` };
    }
  },
  {
    id: 'O2', layer: 'L1', source: `${OUTPOST_WIKI}: "pillager outposts never generate too close to, or within, villages"`,
    text: 'Outposts keep away from villages (the structure set\'s 10-chunk exclusion zone).',
    check: () => {
      const set = STRUCTURE_SETS.find((s) => s.name === 'pillager_outposts');
      return { ok: set?.exclusionZone?.otherSet === 'villages' && set.exclusionZone.chunkCount === 10, detail: JSON.stringify(set?.exclusionZone) };
    }
  },
  {
    id: 'O3', layer: 'L2', source: `${OUTPOST_WIKI}: "The outpost tower always generates, while up to 4 other smaller structures may spawn"; "Each structure has a 1 in 13 chance"`,
    text: 'The watchtower always generates, with up to four smaller structures; each feature is a 1-in-13 draw.',
    check: async (o) => {
      const { createOutpostPools, OUTPOST_POOLS } = await import('./worldgen/generators/pillagerOutpost.js');
      const pool = createOutpostPools().resolve(OUTPOST_POOLS.features);
      const total = pool.elements.reduce((s, e) => s + e.weight, 0);
      const each = pool.elements.filter((e) => !e.isEmpty).every((e) => e.weight / total === 1 / 13);
      const mix = o.start.meta.partMix;
      return { ok: mix[0] === 'watchtower' && mix.length - 1 <= 4 && each && total === 13, detail: `${mix.length - 1} feature(s): ${mix.slice(1).join(', ')}; pool total ${total}` };
    }
  },
  {
    id: 'O4', layer: 'L3', source: `${OUTPOST_WIKI}/Structure: the watchtower's materials table`,
    text: 'The watchtower: 144 dark oak logs, 244 birch planks, 48 fences, 45 dark oak slabs, 33 cobblestone stairs, 16 dark oak stairs, 8 cobblestone walls, 4 cobblestone slabs, 4 torches, 8 banners and one chest with the outpost loot.',
    check: (o) => {
      const want = { dark_oak_log: 144, birch_planks: 244, dark_oak_slab: 45, cobblestone_stairs: 33, dark_oak_stairs: 16, cobblestone_wall: 8, cobblestone_slab: 4, white_wall_banner: 8, chest: 1 };
      // Features add fences and logs of their own, so the fixed counts are checked on the tower's own blocks.
      const towerBox = o.pieces[0].box;
      const inTower = (w) => w.x >= towerBox.minX && w.x <= towerBox.maxX && w.z >= towerBox.minZ && w.z <= towerBox.maxZ && w.y >= towerBox.minY && w.y <= towerBox.maxY;
      const count = (n) => o.writes.filter((w) => inTower(w) && w.name === n).length;
      const off = Object.entries(want).filter(([n, c]) => count(n) !== c).map(([n, c]) => `${n} ${count(n)}/${c}`);
      const torches = count('torch') + count('wall_torch');
      const chest = o.writes.find((w) => w.name === 'chest');
      return { ok: off.length === 0 && torches === 4 && count('dark_oak_fence') === 48 && chest?.lootTable === 'minecraft:chests/pillager_outpost', detail: off.length ? off.join(', ') : `matches; torches ${torches}; chest ${chest?.lootTable}` };
    }
  },
  {
    id: 'O5', layer: 'L3', source: `${OUTPOST_WIKI}: "iron golem cages spawn one golem, and allay cages spawn two allays"`,
    text: 'Each iron golem cage holds one iron golem and each allay cage two allays.',
    check: (o) => {
      const golemCages = o.start.meta.partMix.filter((p) => p === 'feature_cage').length;
      const allayCages = o.start.meta.partMix.filter((p) => p === 'feature_cage_allay').length;
      const golems = o.spawnsOf('iron_golem').length; const allays = o.spawnsOf('allay').length;
      return { ok: golems === golemCages && allays === 2 * allayCages, detail: `${golemCages} golem cage(s) / ${golems} golem(s); ${allayCages} allay cage(s) / ${allays} allay(s)` };
    }
  },
  {
    id: 'O6', layer: 'L3', source: `${OUTPOST_WIKI}: "A total of eight pillagers, including the pillager captain, spawns in a pillager outpost"`,
    text: 'Eight pillagers, one of them the captain, that never despawn.',
    check: (o) => {
      const pillagers = o.spawnsOf('pillager');
      const captains = pillagers.filter((p) => p.options?.patrolLeader).length;
      return { ok: pillagers.length === 8 && captains === 1 && pillagers.every((p) => p.options?.persistent), detail: `${pillagers.length} pillagers, ${captains} captain` };
    }
  },
  {
    id: 'O7', layer: 'L2', source: `${OUTPOST_WIKI}/Structure notes: "Layer 6 - Cobblestone stair face inside and upside down. Slabs = top." "Layer 9 - Slabs = Top"`,
    text: 'The balcony stairs are upside down and the layer-6 and layer-9 slabs are top slabs.',
    check: (o) => {
      const upside = o.writes.filter((w) => w.name === 'cobblestone_stairs' && w.props?.half === 'top').length;
      const topSlabs = o.writes.filter((w) => w.name === 'dark_oak_slab' && w.props?.type === 'top').length;
      return { ok: upside > 0 && topSlabs > 0, detail: `${upside} upside-down stairs, ${topSlabs} top slabs` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Desert well. Source: https://minecraft.wiki/w/Desert_Well and /Structure.

const WELL_WIKI = 'Desert Well';
/** Count blocks by name, with this game's names (the snow block is `snow`; nothing else differs here). */
const countsOf = (o) => { const out = {}; for (const w of o.writes) out[w.name] = (out[w.name] ?? 0) + 1; return out; };

const desertWellFacts = [
  {
    id: 'DW1', layer: 'L1', source: `${WELL_WIKI}: "Desert wells generate in desert biomes. They have a 1/1000 chance to be generated in the given chunk"`,
    text: 'Desert only, with a 1 in 1000 chance per chunk.',
    check: () => {
      const set = STRUCTURE_SETS.find((s) => s.name === 'desert_wells');
      const ok = STRUCTURES.desert_well.biomes.join() === 'desert' && set?.spacing === 1 && Math.abs(set.frequency - 0.001) < 1e-12;
      return { ok, detail: `biomes ${STRUCTURES.desert_well.biomes}; chance ${set?.frequency}` };
    }
  },
  {
    id: 'DW2', layer: 'L3', source: `${WELL_WIKI}/Structure: Materials -- sand 4, sandstone 89, sandstone slab 12, suspicious sand 2, water 5`,
    text: 'Exactly the materials table: 89 sandstone, 12 sandstone slabs, 5 water, 4 sand, 2 suspicious sand.',
    check: (o) => {
      const n = countsOf(o);
      const got = [n.sandstone, n.sandstone_slab, n.water, n.sand, n.suspicious_sand].join();
      return { ok: got === '89,12,5,4,2', detail: `sandstone/slab/water/sand/suspicious: ${got}` };
    }
  },
  {
    id: 'DW3', layer: 'L3', source: `${WELL_WIKI}: "The first suspicious sand generates directly below the water source blocks, and the second generates below that layer."`,
    text: 'One suspicious sand directly below the water, the other one layer further down; both with the desert well archaeology loot.',
    check: (o) => {
      const water = o.writes.filter((w) => w.name === 'water');
      const waterY = Math.min(...water.map((w) => w.y));
      const sus = o.writes.filter((w) => w.name === 'suspicious_sand').map((w) => w.y).sort((a, b) => b - a);
      const loot = o.writes.filter((w) => w.name === 'suspicious_sand').every((w) => w.lootTable === 'minecraft:archaeology/desert_well');
      return { ok: sus.join() === `${waterY - 1},${waterY - 2}` && loot, detail: `water at y ${waterY}; suspicious sand at ${sus.join(', ')}; loot ${loot}` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Jungle pyramid. Source: https://minecraft.wiki/w/Jungle_Pyramid and /Structure.

const JUNGLE_WIKI = 'Jungle Pyramid';
const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
const STEP = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const ahead = (o, w) => { const [dx, dz] = STEP[w.props?.facing] ?? [0, 0]; return o.writes.find((v) => v.x === w.x + dx && v.y === w.y && v.z === w.z + dz); };

const junglePyramidFacts = [
  {
    id: 'J1', layer: 'L1', source: `${JUNGLE_WIKI} infobox: biome Jungle, Bamboo Jungle (JE)`,
    text: 'Generates in jungles and bamboo jungles only.',
    check: (o) => ({ ok: [...o.registry.biomes].sort().join() === 'bamboo_jungle,jungle', detail: `biome gate: ${o.registry.biomes.join(', ')}` })
  },
  {
    id: 'J2', layer: 'L3', source: `${JUNGLE_WIKI}/Structure: Materials table; "consist of cobblestone, mossy cobblestone, and vines"`,
    text: 'Exactly the materials table (1157 cobblestone or mossy cobblestone, 24 stairs, 2 chests, 2 dispensers, 3 levers, 3 chiseled stone bricks, 15 redstone, 1 repeater, 3 sticky pistons, 5 string, 4 hooks, 3 vines), with both kinds of cobblestone.',
    check: (o) => {
      const want = { chest: 2, chiseled_stone_bricks: 3, cobblestone_stairs: 24, dispenser: 2, lever: 3, redstone_wire: 15, repeater: 1, sticky_piston: 3, tripwire: 5, tripwire_hook: 4, vine: 3 };
      const off = Object.entries(want).filter(([name, n]) => o.count(name) !== n).map(([name, n]) => `${name} ${o.count(name)}/${n}`);
      const cobble = o.count('cobblestone') + o.count('mossy_cobblestone');
      if (cobble !== 1157) off.push(`cobblestone+mossy ${cobble}/1157`);
      if (!o.count('cobblestone') || !o.count('mossy_cobblestone')) off.push('only one kind of cobblestone');
      return { ok: off.length === 0, detail: off.length ? `differs: ${off.join(', ')}` : `every count matches (${o.count('cobblestone')} plain, ${o.count('mossy_cobblestone')} mossy)` };
    }
  },
  {
    id: 'J3', layer: 'L3', source: `${JUNGLE_WIKI}: "two loot chests, one at the end of a hallway of arrow booby traps, and one hidden behind a lever puzzle"`,
    text: 'Two chests with the jungle pyramid loot table, below the ground floor.',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      const ok = chests.length === 2 && chests.every((w) => w.lootTable === 'minecraft:chests/jungle_temple' && w.y < o.start.meta.groundFloorY);
      return { ok, detail: chests.map((w) => `y ${w.y} ${w.lootTable}`).join('; ') };
    }
  },
  {
    id: 'J4', layer: 'L3', source: `${JUNGLE_WIKI}: "dispensers with 2-14 arrows, hidden behind vines"; /Structure: "All Dispensers -- Towards Vines"`,
    text: 'Two dispensers with the dispenser loot table, each facing a vine directly in front of it.',
    check: (o) => {
      const d = o.writes.filter((w) => w.name === 'dispenser');
      const ok = d.length === 2 && d.every((w) => w.lootTable === 'minecraft:chests/jungle_temple_dispenser' && ahead(o, w)?.name === 'vine');
      return { ok, detail: d.map((w) => `facing ${w.props?.facing} at ${ahead(o, w)?.name ?? 'nothing'}`).join('; ') };
    }
  },
  {
    id: 'J5', layer: 'L3', source: `${JUNGLE_WIKI}: "There are two tripwire lines connected to dispensers"`,
    text: 'Two tripwire lines, each a straight run of string with a hook at both ends facing along it.',
    check: (o) => {
      const hooks = o.writes.filter((w) => w.name === 'tripwire_hook');
      const wired = hooks.filter((w) => ahead(o, w)?.name === 'tripwire').length;
      const strings = o.writes.filter((w) => w.name === 'tripwire');
      const lonely = strings.filter((s) => !o.writes.some((v) => (v.name === 'tripwire' || v.name === 'tripwire_hook') && near(s, v))).length;
      return { ok: hooks.length === 4 && wired === 4 && lonely === 0, detail: `${hooks.length} hooks, ${wired} facing string, ${strings.length} string, ${lonely} unconnected` };
    }
  },
  {
    id: 'J6', layer: 'L3', source: `${JUNGLE_WIKI}: "a puzzle consisting of 3 levers on 3 chiseled stone bricks connected to a hidden piston mechanism"`,
    text: 'Three levers, each on a chiseled stone brick, and three sticky pistons.',
    check: (o) => {
      const levers = o.writes.filter((w) => w.name === 'lever');
      const mounted = levers.filter((w) => o.writes.some((v) => v.name === 'chiseled_stone_bricks' && near(v, w))).length;
      return { ok: levers.length === 3 && mounted === 3 && o.count('sticky_piston') === 3, detail: `${mounted}/${levers.length} levers on chiseled bricks; ${o.count('sticky_piston')} sticky pistons` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Ruined portals. Source: https://minecraft.wiki/w/Ruined_Portal and /Structure.

const PORTAL_WIKI = 'Ruined Portal';
/** The Generation table, as the wiki prints it: [placement, mossiness, air pocket, overgrown, vines, blackstone] per setup. */
const PORTAL_TABLE = {
  ruined_portal: [['underground', 0.2, 1, false, false, false], ['on_land_surface', 0.2, 0.5, false, false, false]],
  ruined_portal_desert: [['partly_buried', 0, 0, false, false, false]],
  ruined_portal_jungle: [['on_land_surface', 0.8, 0.5, true, true, false]],
  ruined_portal_swamp: [['on_land_surface', 0.5, 0, false, true, false]],
  ruined_portal_mountain: [['in_mountain', 0.2, 1, false, false, false], ['on_land_surface', 0.2, 0.5, false, false, false]],
  ruined_portal_ocean: [['on_ocean_floor', 0.8, 0, false, false, false]],
  ruined_portal_nether: [['in_nether', 0, 0.5, false, false, true]]
};
const PORTAL_BLOCKS_ALL = ['gold_block', 'chest', 'crying_obsidian', 'lava', 'magma_block', 'netherrack', 'obsidian'];
const PORTAL_BLOCKS_OVERWORLD = ['iron_bars', 'stone', 'stone_slab', 'smooth_stone_slab', 'stone_bricks', 'stone_brick_slab', 'stone_brick_stairs', 'stone_brick_wall', 'chiseled_stone_bricks', 'cracked_stone_bricks', 'mossy_stone_bricks', 'mossy_stone_brick_slab', 'mossy_stone_brick_stairs', 'mossy_stone_brick_wall'];
const PORTAL_BLOCKS_NETHER = ['chain', 'polished_blackstone', 'polished_blackstone_slab', 'polished_blackstone_bricks', 'polished_blackstone_brick_slab', 'polished_blackstone_brick_stairs', 'polished_blackstone_brick_wall', 'cracked_polished_blackstone_bricks', 'chiseled_polished_blackstone'];

function ruinedPortalFacts(id) {
  return [
    {
      id: 'R1', layer: 'L1', source: `${PORTAL_WIKI}: the Generation table (placement, mossiness, air pocket, overgrown, vines, blackstone)`,
      text: 'The setup(s) for this variant are exactly the Generation table\'s, with equal odds where it lists two.',
      check: () => {
        const got = PORTAL_SETUPS[id].map(([, s]) => [s.placement, s.mossiness, s.airPocketProbability, s.overgrown, s.vines, s.replaceWithBlackstone]);
        const weights = new Set(PORTAL_SETUPS[id].map(([w]) => w));
        return { ok: JSON.stringify(got) === JSON.stringify(PORTAL_TABLE[id]) && weights.size === 1, detail: JSON.stringify(got) };
      }
    },
    {
      id: 'R2', layer: 'L2', source: `${PORTAL_WIKI}: "Giant ruined portals have 3 distinct designs, and normal ruined portals have 10 designs ... a 5% chance to be a giant ruined portal"`,
      text: '13 designs (10 normal, 3 giant), 5% giant, and this portal is one of them.',
      check: (o) => ({ ok: NORMAL_DESIGNS.length === 10 && GIANT_DESIGNS.length === 3 && GIANT_CHANCE === 0.05 && [...NORMAL_DESIGNS, ...GIANT_DESIGNS].includes(o.start.meta.design), detail: `design ${o.start.meta.design}` })
    },
    {
      id: 'R3', layer: 'L3', source: `${PORTAL_WIKI}: the Overworld table's "Consists of" counts; /Structure blueprints`,
      text: 'Before the replacement rules, every design has its materials table\'s counts (portal_3\'s drawing has 1 netherrack and 2 slabs more than its table).',
      check: () => {
        const off = [];
        for (const [design, want] of Object.entries(PORTAL_MATERIALS)) {
          const n = {};
          for (const c of designCells(design).cells) { const name = c.name === 'block_of_gold' ? 'gold_block' : c.name; n[name] = (n[name] ?? 0) + 1; }
          if (design === 'portal_3') { n.netherrack -= 1; n.stone_brick_slab -= 2; }
          for (const k of new Set([...Object.keys(n), ...Object.keys(want)])) if (n[k] !== want[k]) off.push(`${design} ${k} ${n[k] ?? 0}/${want[k] ?? 0}`);
        }
        return { ok: off.length === 0, detail: off.join(', ') || 'all 13 match' };
      }
    },
    {
      id: 'R4', layer: 'L3', source: `${PORTAL_WIKI}: "All ruined portals generate with a chest"; Loot: ruined portal`,
      text: 'One chest, with the ruined portal loot table.',
      check: (o) => {
        const chests = o.writes.filter((w) => w.name === 'chest');
        return { ok: chests.length === 1 && chests[0].lootTable === PORTAL_LOOT, detail: chests.map((c) => c.lootTable).join(', ') || 'no chest' };
      }
    },
    ...(id === 'ruined_portal_nether' ? [] : [{
      id: 'R5', layer: 'L3', source: `${PORTAL_WIKI}: "Natural terrain around ruined portals generates as netherrack"`,
      text: 'The ground round the portal is turned to netherrack (with the odd magma block).',
      check: (o) => ({ ok: o.start.meta.spread.length > 0 && (o.report.spreadWritten ?? 0) > 0, detail: `${o.report.spreadWritten} of ${o.start.meta.spread.length} spread blocks written` })
    }])
  ];
}
const ruinedPortalCard = (id, title) => ({
  title, wiki: 'https://minecraft.wiki/w/Ruined_Portal', facts: ruinedPortalFacts(id),
  // The Blocks table's "All ruined portals" column and the Overworld (or Nether) one; an overgrown portal adds jungle
  // leaves and a vine portal vines (the Generation table).
  infoboxBlocks: [...PORTAL_BLOCKS_ALL, ...(PORTAL_TABLE[id][0][5] ? PORTAL_BLOCKS_NETHER : PORTAL_BLOCKS_OVERWORLD), ...(PORTAL_TABLE[id][0][3] ? ['jungle_leaves'] : []), ...(PORTAL_TABLE[id][0][4] ? ['vine'] : [])],
  infoboxSubset: true
});

// ---------------------------------------------------------------------------------------------------------------
// Buried treasure. Source: https://minecraft.wiki/w/Buried_Treasure.

const TREASURE_WIKI = 'Buried Treasure';
const buriedTreasureFacts = [
  {
    id: 'B1', layer: 'L1', source: `${TREASURE_WIKI}: "Buried treasures generate in beach, snowy beach, and stony shore (BE only) biomes"`,
    text: 'Beaches and snowy beaches (Java).',
    check: (o) => ({ ok: [...o.registry.biomes].sort().join() === 'beach,snowy_beach', detail: `biome gate: ${o.registry.biomes.join(', ')}` })
  },
  {
    id: 'B2', layer: 'L2', source: `${TREASURE_WIKI}: "always generate at chunk section relative 9 ... on both the X and Z axis, and are always facing east"`,
    text: 'One chest, at chunk-relative 9, 9, facing east.',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      const c = chests[0];
      const ok = chests.length === 1 && ((c.x % 16) + 16) % 16 === 9 && ((c.z % 16) + 16) % 16 === 9 && c.props?.facing === 'east';
      return { ok, detail: c ? `chest at ${c.x},${c.y},${c.z} facing ${c.props?.facing}` : 'no chest' };
    }
  },
  {
    id: 'B3', layer: 'L3', source: `${TREASURE_WIKI}: "The treasure chest is almost always buried by some material"`,
    text: 'The chest is under the top of the ground, so a ground block covers it.',
    check: (o) => {
      const c = o.writes.find((w) => w.name === 'chest');
      const ground = o.groundAt(c.x, c.z);
      return { ok: c.y < ground, detail: `chest y ${c.y}, ground top ${ground}` };
    }
  },
  {
    id: 'B4', layer: 'L3', source: `${TREASURE_WIKI}: Loot; "A heart of the sea is always present in every buried treasure"`,
    text: 'The buried treasure loot table, which always holds a heart of the sea.',
    check: (o) => {
      const c = o.writes.find((w) => w.name === 'chest');
      const rolled = rollStructureLoot(c.lootTable, 1234);
      return { ok: c.lootTable === 'minecraft:chests/buried_treasure' && rolled.some((s) => s?.id === 'heart_of_the_sea'), detail: `${c.lootTable}` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Shipwrecks. Source: https://minecraft.wiki/w/Shipwreck and /Structure.

const WRECK_WIKI = 'Shipwreck';
const WRECK_WOODS = ['dark_oak', 'oak', 'spruce', 'jungle', 'birch', 'acacia'];
function shipwreckFacts(id) {
  return [
    {
      id: 'S1', layer: 'L1', source: `${WRECK_WIKI}: "Shipwrecks generate in all oceans commonly. On rarer occasions, they generate above sea level nearby the water, in beaches, snowy beaches"`,
      text: id === 'shipwreck' ? 'Every ocean.' : 'Beaches and snowy beaches, above sea level.',
      check: (o) => {
        const want = id === 'shipwreck' ? 'cold_ocean,deep_cold_ocean,deep_frozen_ocean,deep_lukewarm_ocean,deep_ocean,frozen_ocean,lukewarm_ocean,ocean,warm_ocean' : 'beach,snowy_beach';
        return { ok: [...o.registry.biomes].sort().join() === want, detail: `biome gate: ${o.registry.biomes.join(', ')}` };
      }
    },
    {
      id: 'S2', layer: 'L2', source: `${WRECK_WIKI}: the 20 templates (upright, sideways, upside-down; whole, bow, stern; intact and degraded; with mast)`,
      text: 'One of the 20 templates.',
      check: (o) => ({ ok: Object.keys(SHIPWRECK_TEMPLATES).length === 20 && Object.keys(SHIPWRECK_TEMPLATES).includes(o.start.meta.template), detail: o.start.meta.template })
    },
    {
      id: 'S3', layer: 'L3', source: `${WRECK_WIKI}: "Only two wood types are used per ship ... only 8 combinations are possible"`,
      text: 'Exactly two woods, one of the eight pairs, the primary in the logs.',
      check: (o) => {
        const used = [...new Set(o.writes.map((w) => WRECK_WOODS.find((x) => w.name.startsWith(`${x}_`))).filter(Boolean))].sort();
        const pair = o.start.meta.wood;
        const logs = o.writes.filter((w) => /_log$/.test(w.name)).map((w) => w.name);
        const ok = WOOD_PAIRS.some((p) => p.join() === pair.join()) && used.join() === [...pair].sort().join() && logs.every((n) => n === `${pair[0]}_log`);
        return { ok, detail: `pair ${pair.join(' + ')}; woods used ${used.join(', ')}` };
      }
    },
    {
      id: 'S4', layer: 'L3', source: `${WRECK_WIKI}: "Supply chests generate in the bow ... treasure chests ... in the upper section of the stern, and map chests in the lower section ... each shipwreck with at least 2 chests always contains its map chest"`,
      text: 'Up to 3 chests, each with the shipwreck loot for its place; two or more include a map chest; as many as its materials table.',
      check: (o) => {
        const chests = o.writes.filter((w) => w.name === 'chest');
        const tables = chests.map((c) => c.lootTable);
        const want = SHIPWRECK_MATERIALS[o.start.meta.template].chest;
        const ok = chests.length === want && chests.length <= 3 && tables.every((t) => Object.values(SHIPWRECK_LOOT).includes(t)) && (chests.length < 2 || tables.includes(SHIPWRECK_LOOT.map));
        return { ok, detail: `${chests.length}/${want} chests: ${tables.map((t) => t.replace('minecraft:chests/shipwreck_', '')).join(', ')}` };
      }
    }
  ];
}
const SHIPWRECK_INFOBOX = ['birch_fence', 'birch_planks', 'birch_slab', 'birch_stairs', 'chest', 'dark_oak_door', 'dark_oak_fence', 'dark_oak_log', 'dark_oak_planks', 'dark_oak_slab', 'dark_oak_stairs', 'dark_oak_trapdoor', 'jungle_door', 'jungle_fence', 'jungle_log', 'jungle_planks', 'jungle_slab', 'jungle_stairs', 'jungle_trapdoor', 'oak_door', 'oak_fence', 'oak_log', 'oak_planks', 'oak_slab', 'oak_stairs', 'oak_trapdoor', 'spruce_door', 'spruce_fence', 'spruce_log', 'spruce_planks', 'spruce_slab', 'spruce_stairs', 'spruce_trapdoor'];

// ---------------------------------------------------------------------------------------------------------------
// Ocean ruins. Source: https://minecraft.wiki/w/Cold_Ocean_Ruins, /Warm_Ocean_Ruins and their /Structure pages.

function oceanRuinFacts(id) {
  const climate = id === 'ocean_ruin_warm' ? 'warm' : 'cold';
  const page = climate === 'warm' ? 'Warm Ocean Ruins' : 'Cold Ocean Ruins';
  const pieceSummary = (o) => o.pieces.map((p) => p.meta.params);
  return [
    {
      id: 'OR1', layer: 'L1', source: climate === 'warm' ? `${page}: "generate in warm, lukewarm, and deep lukewarm ocean biomes"` : `${page}: "generate in normal, cold, and frozen ocean biomes or in their deep variants"`,
      text: climate === 'warm' ? 'Warm, lukewarm and deep lukewarm oceans.' : 'Oceans, cold and frozen oceans and their deep forms.',
      check: (o) => {
        const want = climate === 'warm' ? 'deep_lukewarm_ocean,lukewarm_ocean,warm_ocean' : 'cold_ocean,deep_cold_ocean,deep_frozen_ocean,deep_ocean,frozen_ocean,ocean';
        return { ok: [...o.registry.biomes].sort().join() === want, detail: o.registry.biomes.join(', ') };
      }
    },
    {
      id: 'OR2', layer: 'L2', source: `${page}: "30% of ocean ruins generate as large ocean ruins ... If the ocean ruin is large, there is a 90% chance for 4-8 (inclusive) small ocean ruins to generate around it in a cluster"`,
      text: '30% large; a large ruin has 4-8 small ones round it (90% of the time); a small ruin stands alone.',
      check: (o) => {
        const [first, ...rest] = pieceSummary(o);
        const big = /^big/.test(first.design);
        const ok = LARGE_RUIN_CHANCE === 0.3 && CLUSTER_CHANCE === 0.9 && rest.every((p) => !/^big/.test(p.design))
          && (big ? rest.length === 0 || (rest.length >= 4 && rest.length <= 8) : rest.length === 0);
        return { ok, detail: `${first.design}${first.material ? ` (${first.material})` : ''} + ${rest.length} small` };
      }
    },
    {
      id: 'OR3', layer: 'L3', source: `${page}: structure integrity (${climate === 'warm' ? '0.9 large, 0.8 small' : 'brick 0.9 large / 0.8 small, cracked 0.7, mossy 0.5'})`,
      text: 'Each ruin keeps about its integrity\'s share of its drawing\'s blocks.',
      check: (o) => {
        const want = climate === 'warm' ? [[true, null, 0.9], [false, null, 0.8]] : [[true, 'brick', 0.9], [false, 'brick', 0.8], [true, 'cracked', 0.7], [false, 'mossy', 0.5]];
        const table = want.every(([big, material, v]) => integrityOf({ climate, big, material }) === v);
        const first = pieceSummary(o)[0];
        const drawn = cellsOfDrawing(first).length;
        const placed = o.pieces[0] ? o.writes.filter((w) => o.pieces[0].box.contains(w.x, w.y, w.z)).length : 0;
        const share = placed / drawn;
        const expect = integrityOf({ climate, big: /^big/.test(first.design), material: first.material });
        return { ok: table && Math.abs(share - expect) < 0.12, detail: `${placed}/${drawn} blocks kept (${share.toFixed(2)}), integrity ${expect}` };
      }
    },
    {
      id: 'OR4', layer: 'L3', source: `${page}: "The chest contains loot for specifically either a small or large sized ocean ruin structure"`,
      text: 'Each chest has the big or small underwater ruin loot, by the size of its ruin.',
      check: (o) => {
        const chests = o.writes.filter((w) => w.name === 'chest');
        const wrong = chests.filter((c) => {
          const piece = o.pieces.find((p) => p.box.contains(c.x, c.y, c.z));
          return c.lootTable !== (/^big/.test(piece?.meta.params.design) ? RUIN_LOOT.big : RUIN_LOOT.small);
        });
        return { ok: wrong.length === 0, detail: `${chests.length} chests, ${wrong.length} with the wrong loot` };
      }
    },
    {
      id: 'OR5', layer: 'L3', source: `${page}: "Suspicious ${climate === 'warm' ? 'sand randomly replaces sand' : 'gravel randomly replaces normal gravel'} during generation"`,
      text: `Suspicious ${climate === 'warm' ? 'sand' : 'gravel'} among the ${climate === 'warm' ? 'sand' : 'gravel'}, with the ${climate} ocean ruin archaeology loot, and no other suspicious block.`,
      check: (o) => {
        const want = climate === 'warm' ? 'suspicious_sand' : 'suspicious_gravel';
        const sus = o.writes.filter((w) => /^suspicious_/.test(w.name));
        const ok = sus.every((w) => w.name === want && w.lootTable === RUIN_ARCHAEOLOGY[climate]);
        return { ok, detail: `${sus.length} ${want}` };
      }
    },
    {
      id: 'OR6', layer: 'L4', source: `${page}: the Types table's drowned per design; "These drowned are persistent, and do not despawn"`,
      text: 'Drowned within each design\'s count, all persistent.',
      check: (o) => {
        const max = pieceSummary(o).reduce((sum, p) => sum + RUIN_DROWNED[p.design][1], 0);
        const drowned = o.spawns.filter((s) => s.type === 'drowned');
        const ok = o.spawns.every((s) => s.type === 'drowned' && s.options.persistent) && drowned.length <= max;
        return { ok, detail: `${drowned.length} drowned (at most ${max})` };
      }
    }
  ];
}
const cellsOfDrawing = (params) => {
  const data = ruinDrawing(params);
  return data.blocks.split(';').filter(Boolean);
};

// ---------------------------------------------------------------------------------------------------------------
// Ocean monument. Source: https://minecraft.wiki/w/Ocean_Monument and /Structure.

const MONUMENT_WIKI = 'Ocean Monument';
const monumentFacts = [
  {
    id: 'M1', layer: 'L1', source: `${MONUMENT_WIKI} infobox: Deep Ocean, Deep Frozen Ocean, Deep Cold Ocean, Deep Lukewarm Ocean`,
    text: 'Deep oceans only.',
    check: (o) => ({ ok: [...o.registry.biomes].sort().join() === 'deep_cold_ocean,deep_frozen_ocean,deep_lukewarm_ocean,deep_ocean', detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'M2', layer: 'L2', source: `${MONUMENT_WIKI}/Structure: "The size of the monument is 58x58 blocks wide and 22 blocks tall (not including the pillars)"; "water generates around the monument as a part of the structure"`,
    text: '58 x 58, 22 tall above the pillars, its whole box filled (water where there is no block).',
    check: (o) => {
      const xs = o.writes.map((w) => w.x); const zs = o.writes.map((w) => w.z);
      const dx = Math.max(...xs) - Math.min(...xs) + 1; const dz = Math.max(...zs) - Math.min(...zs) + 1;
      const top = Math.max(...o.writes.map((w) => w.y)); const base = o.start.meta.base;
      const box = o.start.box; const volume = (box.maxX - box.minX + 1) * (box.maxZ - box.minZ + 1) * (top - base + 1);
      const above = o.writes.filter((w) => w.y >= base).length + o.airWrites;
      return { ok: dx === 58 && dz === 58 && top - base === 22 && above === volume, detail: `${dx} x ${dz}, ${top - base} tall; ${above}/${volume} of the box written` };
    }
  },
  {
    id: 'M3', layer: 'L4', source: `${MONUMENT_WIKI}: "Ocean monuments always contain three elder guardians - one at the top and one in each wing"`,
    text: 'Three elder guardians, persistent.',
    check: (o) => {
      const elders = o.spawns.filter((s) => s.type === 'elder_guardian');
      return { ok: elders.length === 3 && elders.every((e) => e.options.persistent), detail: `${elders.length} elder guardians` };
    }
  },
  {
    id: 'M4', layer: 'L3', source: `${MONUMENT_WIKI}: "the treasure chamber, a tall room with eight blocks of gold encased in dark prismarine"`,
    text: 'Eight gold blocks, each touching dark prismarine.',
    check: (o) => {
      const gold = o.writes.filter((w) => w.name === 'gold_block');
      const dark = new Set(o.writes.filter((w) => w.name === 'dark_prismarine').map((w) => `${w.x},${w.y},${w.z}`));
      const encased = gold.filter((g) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => dark.has(`${g.x + a},${g.y + b},${g.z + c}`))).length;
      return { ok: gold.length === 8 && encased === 8, detail: `${gold.length} gold, ${encased} touching dark prismarine` };
    }
  },
  {
    id: 'M5', layer: 'L2', source: `${MONUMENT_WIKI}/Structure: "Structure generation" (46 units, the core at the back, walls closed while every unit reaches the entry, then rooms by the first rule that fits)`,
    text: 'The maze: all 46 units used once; an 8-unit core at the back; an entry at the front; every room reachable from the entry.',
    check: (o) => {
      const plan = planMonumentRooms(new LegacyRandom(BigInt(o.start.meta.seed ?? 0) * 6364136223846793005n + 1442695040888963407n));
      const all = plan.rooms.flatMap((r) => r.units);
      const core = plan.rooms.find((r) => r.kind === 'core');
      const ok = all.length === 46 && new Set(all).size === 46 && core.units.length === 8 && core.units.every((k) => Number(k.split(',')[2]) >= 2)
        && plan.rooms.some((r) => r.kind === 'entry' && r.units[0] === ENTRY_UNIT);
      const kinds = {}; for (const r of plan.rooms) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
      return { ok, detail: Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ') };
    }
  },
  {
    id: 'M6', layer: 'L2', source: `${MONUMENT_WIKI}/Structure: "Under the monument are 23 giant pillars that stretch to the ocean floor"`,
    text: '23 pillars, each reaching down to the sea floor under it.',
    check: (o) => ({ ok: MONUMENT_PILLAR_SPOTS.length === 23 && o.start.pieces[0].meta.params.pillarDepths.length === 23, detail: `${MONUMENT_PILLAR_SPOTS.length} pillars; depths ${o.start.pieces[0].meta.params.pillarDepths.join(',')}` })
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Monster rooms. Source: https://minecraft.wiki/w/Monster_Room and /Structure.

const ROOM_WIKI = 'Monster Room';
const roomPieces = (o) => o.pieces.map((p) => ({ piece: p, params: p.meta.params, box: p.box }));
const monsterRoomFacts = [
  {
    id: 'MR1', layer: 'L1', source: `${ROOM_WIKI}: "Monster rooms generate uncommonly in the Overworld in any biome ... Each chunk has fourteen attempts"`,
    text: 'Any Overworld biome; fourteen attempts in every chunk (ten in the upper band, four in the deep one).',
    check: (o) => {
      const set = STRUCTURE_SETS.find((s) => s.name === 'monster_rooms');
      return { ok: o.registry.biomes.length === 0 && set?.spacing === 1 && set.frequency === 1 && MONSTER_ROOM_ATTEMPTS === 14 && UPPER_ATTEMPTS === 10, detail: `${MONSTER_ROOM_ATTEMPTS} attempts, ${UPPER_ATTEMPTS} upper` };
    }
  },
  {
    id: 'MR2', layer: 'L2', source: `${ROOM_WIKI}: "an open area with a width and length of 7 or 9 and a height of 6"`,
    text: 'Each room is 7 or 9 blocks each way: a floor, four blocks of room, and the solid ground above as its ceiling.',
    check: (o) => {
      const bad = roomPieces(o).filter(({ box }) => ![7, 9].includes(box.maxX - box.minX + 1) || ![7, 9].includes(box.maxZ - box.minZ + 1) || box.maxY - box.minY !== 4);
      return { ok: bad.length === 0, detail: roomPieces(o).map(({ box }) => `${box.maxX - box.minX + 1}x${box.maxZ - box.minZ + 1}`).join(', ') };
    }
  },
  {
    id: 'MR3', layer: 'L3', source: `${ROOM_WIKI}: "The walls of the potential monster room must have 1-5 openings (2-high air blocks) at floor level"; floor and ceiling solid`,
    text: 'Between 1 and 5 two-high openings in the walls at floor level; the floor and the ground over the room solid.',
    check: (o) => {
      const out = [];
      let ok = true;
      for (const { params } of roomPieces(o)) {
        const sx = 2 * params.rx + 3; const sz = 2 * params.rz + 3;
        const ring = [];
        for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) if (x === 0 || z === 0 || x === sx - 1 || z === sz - 1) ring.push([x, z]);
        const solid = new Set(params.solidWall.map(([x, y, z]) => `${x},${y},${z}`));
        const openings = ring.filter(([x, z]) => !solid.has(`${x},1,${z}`) && !solid.has(`${x},2,${z}`)).length;
        out.push(openings);
        if (openings < 1 || openings > 5) ok = false;
      }
      return { ok, detail: `openings ${out.join(', ')}` };
    }
  },
  {
    id: 'MR4', layer: 'L3', source: `${ROOM_WIKI}: "The monster spawner is placed at the center ... zombie (50%), skeleton (25%), or spider (25%)"`,
    text: 'A spawner in the middle of each room, for a zombie, skeleton or spider, which the game runs.',
    check: (o) => {
      const spawners = o.writes.filter((w) => w.name === 'spawner');
      const centred = roomPieces(o).every(({ box }) => spawners.some((s) => s.x === (box.minX + box.maxX) / 2 && s.z === (box.minZ + box.maxZ) / 2 && s.y === box.minY + 1));
      const mobs = o.start.meta.mobs;
      const running = o.integration ? o.integration.world.spawners().length >= spawners.filter((s) => s.y >= 0).length : true;
      return { ok: spawners.length === mobs.length && centred && mobs.every((m) => ['zombie', 'skeleton', 'spider'].includes(m)) && running, detail: `${spawners.length} spawner(s): ${mobs.join(', ')}` };
    }
  },
  {
    id: 'MR5', layer: 'L3', source: `${ROOM_WIKI}: "3 attempts are made to generate each of two chests ... must have a solid block on exactly one of its four sides"; "Cobblestone has a 75% chance to be mossy when it is on the floor"`,
    text: 'At most two chests a room, each against exactly one wall, with the monster room loot; a cobblestone and mossy cobblestone floor.',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      const perRoom = roomPieces(o).map(({ box }) => chests.filter((c) => box.contains(c.x, c.y, c.z)).length);
      const floors = o.writes.filter((w) => roomPieces(o).some(({ box }) => w.y === box.minY && box.contains(w.x, w.y, w.z)));
      const mossy = floors.filter((w) => w.name === 'mossy_cobblestone').length;
      const ok = perRoom.every((n) => n <= 2) && chests.every((c) => c.lootTable === MONSTER_ROOM_LOOT) && floors.every((w) => /cobblestone$/.test(w.name)) && mossy / floors.length > 0.5;
      return { ok, detail: `chests per room ${perRoom.join(', ')}; floor ${mossy}/${floors.length} mossy` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Fossils. Source: https://minecraft.wiki/w/Fossil and /Structure.

const FOSSIL_WIKI = 'Fossil';
const FOSSIL_TABLE = { skull_1: 86, skull_2: 75, skull_3: 58, skull_4: 32, spine_1: 37, spine_2: 61, spine_3: 97, spine_4: 121 };
const fossilFacts = [
  {
    id: 'F1', layer: 'L1', source: `${FOSSIL_WIKI}: "Fossils randomly generate only in desert, swamp and mangrove swamp biomes. Each chunk has two attempts ... each with a chance of 1/64"`,
    text: 'Deserts, swamps and mangrove swamps; two attempts in each chunk at 1 in 64.',
    check: (o) => ({ ok: [...o.registry.biomes].sort().join() === 'desert,mangrove_swamp,swamp' && FOSSIL_ATTEMPTS === 2 && FOSSIL_CHANCE === 1 / 64, detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'F2', layer: 'L2', source: `${FOSSIL_WIKI}: "an equal chance to generate as any of the four variants of skull or four variants of spine"; the /Structure drawings and the materials column`,
    text: 'One of the eight designs, each drawing with its table\'s block count.',
    check: (o) => {
      const off = Object.entries(FOSSIL_TABLE).filter(([d, n]) => FOSSIL_BLUEPRINTS[d].blocks.split(';').filter(Boolean).length !== n);
      return { ok: FOSSIL_DESIGNS.length === 8 && off.length === 0 && o.start.meta.designs.every((d) => FOSSIL_DESIGNS.includes(d)), detail: `${o.start.meta.designs.join(', ')}${off.length ? `; off: ${off.map(([d]) => d)}` : ''}` };
    }
  },
  {
    id: 'F3', layer: 'L3', source: `${FOSSIL_WIKI}: bone at "structure integrity of 0.9"; ore "with a structure integrity of 0.1 ... coal ore ... above Y level 0. ... diamond ore ... below Y level -8"`,
    text: 'About 90% of the drawing placed; about a tenth ore, coal ore in the upper attempt and deepslate diamond ore in the deep one.',
    check: (o) => {
      const rows = o.pieces.map((p) => {
        const inside = o.writes.filter((w) => p.box.contains(w.x, w.y, w.z));
        const drawn = FOSSIL_TABLE[p.meta.params.design];
        const ore = inside.filter((w) => /_ore$/.test(w.name));
        const want = p.meta.params.deep ? 'deepslate_diamond_ore' : 'coal_ore';
        return { share: inside.length / drawn, ore: ore.length / Math.max(1, inside.length), right: ore.every((w) => w.name === want) };
      });
      const ok = rows.every((r) => r.share > 0.8 && r.share <= 1 && r.ore < 0.3 && r.right);
      return { ok, detail: rows.map((r) => `${Math.round(r.share * 100)}% placed, ${Math.round(r.ore * 100)}% ore`).join('; ') };
    }
  },
  {
    id: 'F4', layer: 'L3', source: `${FOSSIL_WIKI}: "... to generate a fossil" underground`,
    text: 'Buried: no block of it above the ground.',
    check: (o) => {
      const above = o.writes.filter((w) => w.y > o.groundAt(w.x, w.z)).length;
      return { ok: above === 0, detail: `${above} blocks above the ground` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Amethyst geodes. Source: https://minecraft.wiki/w/Amethyst_Geode and /Structure.

const GEODE_WIKI = 'Amethyst Geode';
const geodeFacts = [
  {
    id: 'AG1', layer: 'L1', source: `${GEODE_WIKI}: "Each chunk has a 1/24 chance to attempt to generate a geode"`,
    text: 'Any Overworld biome, 1 in 24 chunks.',
    check: (o) => ({ ok: o.registry.biomes.length === 0 && GEODE_CHANCE === 1 / 24, detail: `chance ${GEODE_CHANCE}` })
  },
  {
    id: 'AG2', layer: 'L2', source: `${GEODE_WIKI}: "three layers: an outer layer of smooth basalt, a middle layer of calcite, and a hollow layer of primarily amethyst blocks"`,
    text: 'Basalt outside calcite outside amethyst outside a hollow: every amethyst block is closer to the middle than every basalt one, on average.',
    check: (o) => {
      const box = o.start.pieces[0].box;
      const c = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2];
      const mean = (name) => { const l = o.writes.filter((w) => w.name === name); return l.reduce((s, w) => s + Math.hypot(w.x - c[0], w.y - c[1], w.z - c[2]), 0) / l.length; };
      const [a, ca, b] = [mean('amethyst_block'), mean('calcite'), mean('smooth_basalt')];
      return { ok: a < ca && ca < b, detail: `mean distance: amethyst ${a.toFixed(1)}, calcite ${ca.toFixed(1)}, basalt ${b.toFixed(1)}` };
    }
  },
  {
    id: 'AG3', layer: 'L3', source: `${GEODE_WIKI}: "with 8.3% replaced by budding amethyst blocks"`,
    text: 'About 8.3% of the amethyst layer is budding amethyst.',
    check: (o) => {
      const b = o.count('budding_amethyst'); const a = o.count('amethyst_block');
      const share = b / (a + b);
      return { ok: share > 0.03 && share < 0.15, detail: `${b}/${a + b} budding (${(share * 100).toFixed(1)}%)` };
    }
  },
  {
    id: 'AG4', layer: 'L3', source: `${GEODE_WIKI}: "Amethyst crystals generate within the structure on budding amethyst"`,
    text: 'Every crystal stands on a budding amethyst, facing away from it.',
    check: (o) => {
      const budding = new Set(o.writes.filter((w) => w.name === 'budding_amethyst').map((w) => `${w.x},${w.y},${w.z}`));
      const back = { up: [0, -1, 0], down: [0, 1, 0], east: [-1, 0, 0], west: [1, 0, 0], south: [0, 0, -1], north: [0, 0, 1] };
      const crystals = o.writes.filter((w) => /amethyst_bud$|amethyst_cluster$/.test(w.name));
      const loose = crystals.filter((w) => { const [dx, dy, dz] = back[w.props?.facing] ?? [9, 9, 9]; return !budding.has(`${w.x + dx},${w.y + dy},${w.z + dz}`); });
      return { ok: crystals.length > 0 && loose.length === 0, detail: `${crystals.length} crystals, ${loose.length} not on budding amethyst` };
    }
  },
  {
    id: 'AG5', layer: 'L3', source: `${GEODE_WIKI}: "Amethyst geodes have a 95% chance of generating with a crack"`,
    text: '95% of geodes are cracked open.',
    check: () => {
      let cracked = 0;
      for (let s = 1; s <= 200; s++) if (geodeIsCracked(s)) cracked++;
      return { ok: CRACK_CHANCE === 0.95 && cracked > 180, detail: `${cracked}/200 cracked` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Mineshafts. Source: https://minecraft.wiki/w/Mineshaft and /Structure.

const SHAFT_WIKI = 'Mineshaft';
const near2 = (o, c, name, r) => o.writes.filter((w) => w.name === name && Math.abs(w.x - c.x) <= r && Math.abs(w.y - c.y) <= r && Math.abs(w.z - c.z) <= r).length;
function mineshaftFacts(id) {
  const mesa = id === 'mineshaft_mesa';
  const wood = mesa ? 'dark_oak' : 'oak';
  return [
    {
      id: 'MS1', layer: 'L1', source: `${SHAFT_WIKI}: "underground in any Overworld biome except for the deep dark"; badlands mineshafts; "a 0.4% chance to attempt to begin generating in every chunk"`,
      text: mesa ? 'Badlands only.' : 'Any Overworld biome but the deep dark (and the badlands, which have their own).',
      check: (o) => {
        const set = STRUCTURE_SETS.find((s) => s.name === 'mineshafts');
        const gate = mesa ? [...o.registry.biomes].sort().join() === 'badlands,eroded_badlands,wooded_badlands' : o.registry.biomes.length === 0 && o.registry.biomeTagExcludes.includes('deep_dark');
        return { ok: gate && set.frequency === 0.004, detail: `${o.registry.biomes.join(', ') || 'all'}; chance ${set.frequency}` };
      }
    },
    {
      id: 'MS2', layer: 'L2', source: `${SHAFT_WIKI}: "Starting point: a 10x10 parlor, with an arched ceiling and one to four exits in each direction"`,
      text: 'One 10 x 10 room with an arched ceiling.',
      check: (o) => {
        const rooms = o.pieces.filter((p) => p.meta.kind === 'room');
        const r = rooms[0]?.box;
        const ok = rooms.length === 1 && r.maxX - r.minX + 1 === 10 && r.maxZ - r.minZ + 1 === 10;
        return { ok, detail: r ? `${r.maxX - r.minX + 1} x ${r.maxZ - r.minZ + 1}` : 'no room' };
      }
    },
    {
      id: 'MS3', layer: 'L3', source: `${SHAFT_WIKI}: corridors "supported by planks and fences ... placed four blocks away from each other"; rails on the ground; ${mesa ? '"composed of dark oak planks and fences"' : 'oak (the /Structure drawing)'}`,
      text: `3 x 3 corridors with ${wood} supports (two fences either side, planks over) and rails; staircases and crossings join them.`,
      check: (o) => {
        const kinds = {}; for (const p of o.pieces) kinds[p.meta.kind] = (kinds[p.meta.kind] ?? 0) + 1;
        const fences = o.count(`${wood}_fence`); const other = o.countMatching(/_fence$/) - fences;
        return { ok: kinds.corridor > 0 && fences > 0 && fences % 2 === 0 && other === 0 && o.count('rail') > 0, detail: `${JSON.stringify(kinds)}; ${fences} ${wood} fences, ${o.count('rail')} rails` };
      }
    },
    {
      id: 'MS4', layer: 'L3', source: `${SHAFT_WIKI}: "Any chest found in a mineshaft always occurs as a minecart with chest"; "Abandoned passageways ... cobwebs concealing cave spider monster spawners"`,
      text: 'No chest blocks: chests ride minecarts with the mineshaft loot; any spawner is a cave spider one buried in cobwebs.',
      check: (o) => {
        const carts = o.spawns.filter((s) => s.type === 'chest_minecart');
        const spawners = o.writes.filter((w) => w.name === 'spawner');
        const webbed = spawners.every((s) => near2(o, s, 'cobweb', 2) >= 8);
        const ok = o.count('chest') === 0 && carts.every((c) => c.options.lootTable === MINESHAFT_LOOT) && webbed && (o.start.meta.cells.filter((c) => c.name === 'spawner').every((c) => c.nbt.SpawnData.entity.id === 'minecraft:cave_spider'));
        return { ok, detail: `${carts.length} chest minecarts, ${spawners.length} cave spider spawners` };
      }
    }
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Strongholds. Source: https://minecraft.wiki/w/Stronghold and /Structure.

const HOLD_WIKI = 'Stronghold';
const strongholdFacts = [
  {
    id: 'SH1', layer: 'L1', source: `${HOLD_WIKI}: "There are eight rings, containing 128 strongholds in total ... The first ring has 3 strongholds within 1,280-2,816 blocks of the origin"`,
    text: '128 strongholds in rings; the nearest ring 1,280-2,816 blocks out.',
    check: (o) => {
      const set = STRUCTURE_SETS.find((s) => s.name === 'strongholds');
      const [x, , z] = o.start.meta.start;
      const d = Math.hypot(x, z);
      return { ok: set.type === 'concentric_rings' && set.count === 128 && d >= 1280 - 112 - 16 && d <= 24320 + 112, detail: `${Math.round(d)} blocks from the origin` };
    }
  },
  {
    id: 'SH2', layer: 'L2', source: `${HOLD_WIKI}: "starts with a spiral staircase room that leads down to a five-way intersection ... The center of the starter staircase will always generate at chunk coordinates 4, ~, 4"; "within a horizontal radius of 112 blocks"`,
    text: 'A spiral staircase at chunk-local 4, 4 leading to a five-way crossing; every piece within 112 blocks.',
    check: (o) => {
      const [x, , z] = o.start.meta.start;
      const far = o.pieces.filter((p) => p.meta.kind !== 'extent' && (Math.hypot(p.box.minX - x, p.box.minZ - z) > 112 || Math.hypot(p.box.maxX - x, p.box.maxZ - z) > 112)).length;
      const ok = ((x % 16) + 16) % 16 === 4 && ((z % 16) + 16) % 16 === 4 && o.start.meta.kinds[0] === 'start' && o.start.meta.kinds[1] === 'five_way' && far === 0;
      return { ok, detail: `start ${x},${z}; then ${o.start.meta.kinds[1]}; ${far} pieces past 112` };
    }
  },
  {
    id: 'SH3', layer: 'L2', source: `${HOLD_WIKI}: the per-stronghold limits (spiral 0-5, straight stairs 0-5, five-way 0-4, prison 0-5, chest corridor 0-4, rooms 0-6, libraries 0-2) and "The End portal room is the only room guaranteed"`,
    text: 'Exactly one portal room; no piece past its limit.',
    check: (o) => {
      const c = o.start.meta.counts;
      const over = Object.entries(PIECE_LIMITS).filter(([k, n]) => (c[k] ?? 0) > n).map(([k]) => k);
      return { ok: c.portal === 1 && over.length === 0, detail: JSON.stringify(c) };
    }
  },
  {
    id: 'SH4', layer: 'L3', source: `${HOLD_WIKI}: the portal room -- "Each portal frame has a 10% chance to generate containing an eye of ender"; a silverfish spawner`,
    text: '12 End portal frames (some may hold eyes) and one silverfish spawner.',
    check: (o) => {
      const frames = o.count('end_portal_frame') + o.count('end_portal_frame_filled');
      const spawners = o.start.meta.cells.filter((c) => c.name === 'spawner');
      return { ok: frames === 12 && spawners.length === 1 && spawners[0].nbt.SpawnData.entity.id === 'minecraft:silverfish', detail: `${frames} frames (${o.count('end_portal_frame_filled')} with eyes), ${spawners.length} spawner` };
    }
  },
  {
    id: 'SH5', layer: 'L3', source: `${HOLD_WIKI}: "Stone Bricks: 45%, Mossy Stone Bricks: 30%, Cracked Stone Bricks: 20%, Infested Stone Bricks: 5%"`,
    text: 'The wall bricks in about those shares.',
    check: (o) => {
      const n = ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'infested_stone_bricks'].map((k) => o.count(k));
      const total = n.reduce((a, b) => a + b, 0);
      const share = n.map((v) => v / total);
      const ok = Math.abs(share[1] - 0.3) < 0.06 && Math.abs(share[2] - 0.2) < 0.05 && Math.abs(share[3] - 0.05) < 0.03 && share[0] > 0.4;
      return { ok, detail: share.map((s) => `${Math.round(s * 100)}%`).join(' / ') };
    }
  },
  {
    id: 'SH6', layer: 'L3', source: `${HOLD_WIKI}: chests in chest corridors, store rooms and libraries (stronghold corridor, crossing and library loot)`,
    text: 'Every chest carries one of the three stronghold loot tables.',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      return { ok: chests.length > 0 && chests.every((c) => Object.values(STRONGHOLD_LOOT).includes(c.lootTable)), detail: `${chests.length} chests` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Nether fortresses. Source: https://minecraft.wiki/w/Nether_Fortress and /Structure.

const FORT_WIKI = 'Nether Fortress';
const fortressFacts = [
  {
    id: 'NF1', layer: 'L1', source: `${FORT_WIKI}: "generate in all Nether biomes ... The chance of a fortress attempting to generate instead of a bastion is 2/5 (40%)"`,
    text: 'Any Nether biome, in the regions it shares with bastions, 2 in 5.',
    check: (o) => {
      const set = STRUCTURE_SETS.find((s) => s.name === 'nether_complexes');
      const w = Object.fromEntries(set.structures);
      return { ok: o.registry.biomes.length === 0 && w.fortress === 2 && w.bastion_remnant === 3 && set.spacing === 27 && set.separation === 4, detail: `weights ${JSON.stringify(w)}` };
    }
  },
  {
    id: 'NF2', layer: 'L2', source: `${FORT_WIKI}: "The fortress generation starts with a plain four-way crossing centered at chunk coordinates 11, ~, 11"`,
    text: 'It starts with a plain four-way crossing centred at chunk-local 11, 11.',
    check: (o) => {
      const [x, , z] = o.start.meta.centre;
      const first = o.pieces[0];
      const mid = [(first.box.minX + first.box.maxX) / 2, (first.box.minZ + first.box.maxZ) / 2];
      const ok = first.meta.kind === 'crossing' && ((x % 16) + 16) % 16 === 11 && ((z % 16) + 16) % 16 === 11 && Math.abs(mid[0] - x) <= 1 && Math.abs(mid[1] - z) <= 1;
      return { ok, detail: `start ${first.meta.kind} centred ${mid.join(',')} (chunk-local ${((x % 16) + 16) % 16}, ${((z % 16) + 16) % 16})` };
    }
  },
  {
    id: 'NF3', layer: 'L2', source: `${FORT_WIKI}: the piece limits (5 crossings, 4 arched crossings, 4 small rooms, 2 blaze platforms; inside 5 crossings, 20 turns, 3 stairways, 2 balconies, 2 gardens)`,
    text: 'Exterior bridges and interior corridors, no piece past its limit.',
    check: (o) => {
      const c = o.start.meta.counts;
      const over = Object.entries(FORTRESS_PIECES).filter(([k, d]) => (c[k] ?? 0) > d.limit).map(([k]) => k);
      return { ok: over.length === 0 && c.bridge > 0, detail: JSON.stringify(c) };
    }
  },
  {
    id: 'NF4', layer: 'L3', source: `${FORT_WIKI}: "blaze monster spawner platforms ... with a blaze monster spawner in the center"; "each with a 1/3 chance of having a loot chest"`,
    text: 'One blaze spawner per platform; every chest with the fortress loot.',
    check: (o) => {
      const spawners = o.start.meta.cells.filter((c) => c.name === 'spawner');
      const chests = o.writes.filter((w) => w.name === 'chest');
      const ok = spawners.length === (o.start.meta.counts.blaze_platform ?? 0) && spawners.every((s) => s.nbt.SpawnData.entity.id === 'minecraft:blaze') && chests.every((c) => c.lootTable === FORTRESS_LOOT);
      return { ok, detail: `${spawners.length} blaze spawners, ${chests.length} chests` };
    }
  },
  {
    id: 'NF5', layer: 'L3', source: `${FORT_WIKI}: "supported by pillars that tower high above the lava seas"`,
    text: 'The bridges stand on pillars down to the ground.',
    check: (o) => {
      const groundOK = o.pieces.filter((p) => p.meta.kind === 'bridge').slice(0, 5).every((p) => o.writes.some((w) => w.name === 'nether_bricks' && w.y < p.box.minY && w.x >= p.box.minX && w.x <= p.box.maxX && w.z >= p.box.minZ && w.z <= p.box.maxZ));
      return { ok: groundOK, detail: groundOK ? 'pillars under the bridges' : 'a bridge with no pillar' };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Nether fossils. Source: https://minecraft.wiki/w/Nether_Fossil and /Structure.

const NFOSSIL_WIKI = 'Nether Fossil';
const NFOSSIL_TABLE = [10, 10, 6, 6, 5, 21, 18, 6, 15, 8, 24, 11, 17, 26];
const netherFossilFacts = [
  {
    id: 'NX1', layer: 'L1', source: `${NFOSSIL_WIKI}: "Nether fossils generate randomly throughout the Nether in soul sand valleys"`,
    text: 'Soul sand valleys only.',
    check: (o) => ({ ok: o.registry.biomes.join() === 'soul_sand_valley', detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'NX2', layer: 'L3', source: `${NFOSSIL_WIKI}: "composed of 5 to 27 bone blocks ... they do not have a lowered structure integrity and no blocks are replaced with coal or diamond ore"; the 14 variants' tables`,
    text: 'Exactly the variant\'s bone blocks, no ore, nothing missing.',
    check: (o) => {
      const want = NFOSSIL_TABLE[o.start.meta.variant - 1];
      return { ok: o.count('bone_block') === want && o.countMatching(/_ore$/) === 0, detail: `fossil_${o.start.meta.variant}: ${o.count('bone_block')}/${want} bone` };
    }
  },
  {
    id: 'NX3', layer: 'L3', source: `${NFOSSIL_WIKI}: "a 1/3 (~33.3%) chance of generating a dried ghast adjacent to them"`,
    text: 'A dried ghast beside the fossil when it rolls one.',
    check: (o) => {
      const g = o.writes.filter((w) => w.name === 'dried_ghast');
      const touching = g.every((d) => o.writes.some((w) => w.name === 'bone_block' && Math.abs(w.x - d.x) + Math.abs(w.z - d.z) <= 2 && Math.abs(w.y - d.y) <= 1));
      return { ok: DRIED_GHAST_CHANCE === 1 / 3 && g.length === (o.start.meta.ghast ? 1 : 0), detail: `${g.length} dried ghast${touching ? '' : ' (not beside)'}` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Bastion remnants. Source: https://minecraft.wiki/w/Bastion_Remnant.

const BASTION_WIKI = 'Bastion Remnant';
const bastionFacts = [
  {
    id: 'BR1', layer: 'L1', source: `${BASTION_WIKI}: "generate in all Nether biomes except basalt deltas"`,
    text: 'Every Nether biome but the basalt deltas.',
    check: (o) => ({ ok: !o.registry.biomes.includes('basalt_deltas') && o.registry.biomes.length === 4, detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'BR2', layer: 'L2', source: `${BASTION_WIKI}: "Bastion remnants generate as 4 types of structures: bridges, hoglin stables, housing units, and treasure rooms"; they "float above, entirely even"`,
    text: 'One of the four types, floating (no pillars down to the lava).',
    check: (o) => ({ ok: BASTION_TYPES.includes(o.start.meta.type) && o.start.meta.floats, detail: o.start.meta.type })
  },
  {
    id: 'BR3', layer: 'L3', source: `${BASTION_WIKI}: Loot -- bridge, generic, hoglin stable and treasure chests`,
    text: 'Every chest carries a bastion loot table fitting its type (treasure chests only in the treasure room).',
    check: (o) => {
      const tables = o.writes.filter((w) => w.name === 'chest').map((w) => w.lootTable);
      const type = o.start.meta.type;
      const allowed = [BASTION_LOOT.generic, BASTION_LOOT[type]];
      return { ok: tables.length > 0 && tables.every((t) => allowed.includes(t)), detail: tables.map((t) => t.replace('minecraft:chests/bastion_', '')).join(', ') };
    }
  },
  {
    id: 'BR4', layer: 'L4', source: `${BASTION_WIKI}: piglin brutes 10%, piglins with a golden sword 40%, with a crossbow 40%; hoglins in the stables; "neither despawn naturally"`,
    text: 'Piglins and piglin brutes (hoglins too in the stables), all persistent.',
    check: (o) => {
      const types = new Set(o.spawns.map((s) => s.type));
      const ok = o.spawns.length > 0 && o.spawns.every((s) => s.options.persistent) && [...types].every((t) => ['piglin', 'piglin_brute', 'hoglin'].includes(t))
        && (o.start.meta.type !== 'hoglin_stable' || types.has('hoglin'));
      return { ok, detail: [...types].map((t) => `${t} ${o.spawns.filter((s) => s.type === t).length}`).join(', ') };
    }
  },
  {
    id: 'BR5', layer: 'L3', source: `${BASTION_WIKI}: the treasure room -- "a magma cube monster spawner, and a center loot area consisting of blocks of gold, as well as 1 or 2 treasure chests"`,
    text: 'A treasure room has its magma cube spawner, gold and 1-2 treasure chests; the others have no spawner.',
    check: (o) => {
      const spawners = o.start.meta.cells.filter((c) => c.name === 'spawner');
      const treasure = o.writes.filter((w) => w.lootTable === BASTION_LOOT.treasure).length;
      const ok = o.start.meta.type === 'treasure'
        ? spawners.length === 1 && spawners[0].nbt.SpawnData.entity.id === 'minecraft:magma_cube' && treasure >= 1 && treasure <= 2 && o.count('gold_block') >= 8
        : spawners.length === 0 && treasure === 0;
      return { ok, detail: `${o.start.meta.type}: ${spawners.length} spawner, ${treasure} treasure chests, ${o.count('gold_block')} gold` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// The End's features. Sources: https://minecraft.wiki/w/End_Spike, /Exit_Portal, /End_Platform.

const endSpikeFacts = [
  {
    id: 'ES1', layer: 'L2', source: 'End Spike: "The following 10 pillars generate in a 43-block radius circle around the exit portal in a random order"; the fixed centres',
    text: 'Ten spikes at the wiki\'s ten centres, every height used once.',
    check: (o) => {
      const spikes = o.start.meta.spikes;
      const centres = spikes.map((s) => `${s.x},${s.z}`).sort().join(';') === SPIKE_CENTRES.map(([x, z]) => `${x},${z}`).sort().join(';');
      const heights = spikes.map((s) => s.vanillaTop).sort((a, b) => a - b).join() === SPIKE_SIZES.map(([, t]) => t).join();
      return { ok: spikes.length === 10 && centres && heights, detail: spikes.map((s) => `${s.vanillaTop}`).join(', ') };
    }
  },
  {
    id: 'ES2', layer: 'L3', source: 'End Spike: radii 3,3,3,4,4,4,5,5,5,6; obsidian totals (1596 = 76 layers of 21 for the first); "The bottom of all pillars are at Y level 0"',
    text: 'Each spike is an obsidian cylinder of its radius\'s cross-section, from y 0 to its top.',
    check: (o) => {
      const wrong = o.start.meta.spikes.filter((s) => {
        const n = o.writes.filter((w) => w.name === 'obsidian' && Math.abs(w.x - s.x) <= s.radius && Math.abs(w.z - s.z) <= s.radius).length;
        return n !== spikeColumns(s.radius).length * s.top;
      });
      const areas = [3, 4, 5, 6].map((r) => spikeColumns(r).length).join();
      return { ok: wrong.length === 0 && spikeColumns(3).length * 76 === 1596 && spikeColumns(4).length * 85 === 3145, detail: `cross-sections ${areas}; ${wrong.length} spikes off` };
    }
  },
  {
    id: 'ES3', layer: 'L3', source: 'End Spike: "a single bedrock block, a fire block, and an End crystal on top of each pillar"; "The second and third shortest pillars include a cage comprised of 73 iron bars"',
    text: 'Bedrock, fire and an End crystal on each; 73 iron bars round each of the two cages.',
    check: (o) => {
      const spikes = o.start.meta.spikes;
      const tops = spikes.every((s) => o.writes.some((w) => w.name === 'bedrock' && w.x === s.x && w.y === s.top && w.z === s.z) && o.writes.some((w) => w.name === 'fire' && w.x === s.x && w.y === s.top + 1 && w.z === s.z));
      const caged = spikes.filter((s) => s.caged);
      const bars = o.count('iron_bars');
      const crystals = o.spawns.filter((s) => s.type === 'end_crystal').length;
      return { ok: tops && caged.length === 2 && caged.every((s) => [79, 82].includes(s.vanillaTop)) && bars === 146 && crystals === 10, detail: `${bars} iron bars, ${crystals} crystals` };
    }
  }
];
const endPodiumFacts = [
  {
    id: 'EP1', layer: 'L2', source: 'Exit Portal: "always generates at the coordinates 0,0 ... placing the End portal blocks at the y-level of the highest block found at 0,0"',
    text: 'At 0, 0, its portal level just above the island\'s top there.',
    check: (o) => ({ ok: o.start.meta.portalY === o.groundAt(0, 0) + 1 && o.writes.some((w) => w.x === 0 && w.z === 0 && w.name === 'bedrock'), detail: `portal level y ${o.start.meta.portalY}, ground ${o.groundAt(0, 0)}` })
  },
  {
    id: 'EP2', layer: 'L3', source: 'Exit Portal: "a 7-block wide bowl-shaped frame of bedrock, and a central pillar of bedrock with a torch on each side ... 16 End stone blocks, one under each outer bedrock block, as well as four torches"; inactive while the dragon lives',
    text: '16 bedrock round the rim with 16 End stone under them, a bedrock pillar with four torches, no portal blocks yet.',
    check: (o) => {
      const y = o.start.meta.portalY;
      const rim = o.writes.filter((w) => w.name === 'bedrock' && w.y === y && !(w.x === 0 && w.z === 0)).length;
      const stone = o.count('end_stone');
      const torches = o.count('wall_torch');
      return { ok: rim === 16 && stone === 16 && torches === 4 && o.count('end_portal') === 0, detail: `rim ${rim}, end stone ${stone}, torches ${torches}, portal ${o.count('end_portal')}` };
    }
  }
];
const endPlatformFacts = [
  {
    id: 'EL1', layer: 'L2', source: 'End Platform: "always generates at coordinates (100, 48, 0)"; 5 x 5 obsidian; "all blocks within 3 blocks above the platform are destroyed"',
    text: 'A 5 x 5 obsidian platform at x 100, z 0 with three empty layers over it, where players arrive.',
    check: (o) => {
      const obsidian = o.writes.filter((w) => w.name === 'obsidian');
      const xs = obsidian.map((w) => w.x); const zs = obsidian.map((w) => w.z);
      const ok = obsidian.length === 25 && Math.min(...xs) === 98 && Math.max(...xs) === 102 && Math.min(...zs) === -2 && Math.max(...zs) === 2 && o.airWrites === 75;
      return { ok, detail: `${obsidian.length} obsidian at x ${Math.min(...xs)}..${Math.max(...xs)}, y ${obsidian[0]?.y}; ${o.airWrites} air above` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// The void start platform. Source: https://minecraft.wiki/w/Void_Start_Platform.

const voidPlatformFacts = [
  {
    id: 'VP1', layer: 'L2', source: 'Void Start Platform: "from block positions (-8, -61, -8) to (24, -61, 24)"; "33x33 platforms, consisting largely of stone, with a lone cobblestone block in the center"',
    text: '33 x 33 stone from -8 to 24 on both axes, one cobblestone at its middle (8, 8).',
    check: (o) => {
      const stone = o.writes.filter((w) => w.name === 'stone');
      const cobble = o.writes.filter((w) => w.name === 'cobblestone');
      const xs = stone.map((w) => w.x);
      return { ok: stone.length === 33 * 33 - 1 && cobble.length === 1 && cobble[0].x === 8 && cobble[0].z === 8 && Math.min(...xs) === -8 && Math.max(...xs) === 24, detail: `${stone.length} stone, cobblestone at ${cobble.map((c) => `${c.x},${c.z}`)}` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// End cities. Source: https://minecraft.wiki/w/End_City and /Structure.

const CITY_WIKI = 'End City';
const endCityFacts = [
  {
    id: 'EC1', layer: 'L1', source: `${CITY_WIKI}: "in 'midlands' or 'highlands' biomes"`,
    text: 'End midlands and highlands only.',
    check: (o) => ({ ok: [...o.registry.biomes].sort().join() === 'end_highlands,end_midlands', detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'EC2', layer: 'L2', source: `${CITY_WIKI}: "Base floors which are empty floors found at the base of every city"; small and large towers; "Each direction of every tower ... a 50% chance of generating a bridge"`,
    text: 'A base, then towers (small with a banner room, or large with a loot room), joined by bridges.',
    check: (o) => {
      const kinds = o.start.meta.kinds;
      const ok = kinds[0] === 'base_room' && (kinds.includes('small_tower_base') || kinds.includes('large_room')) && BRIDGE_CHANCE === 0.5;
      return { ok, detail: kinds.join(', ') };
    }
  },
  {
    id: 'EC3', layer: 'L2', source: `${CITY_WIKI}: "the bridge itself has a 12.5% chance to generate an End ship. At most one ship can generate in a given End city"`,
    text: 'At most one ship.',
    check: (o) => ({ ok: SHIP_CHANCE === 0.125 && o.start.meta.ships <= 1, detail: `${o.start.meta.ships} ship(s)` })
  },
  {
    id: 'EC4', layer: 'L4', source: `${CITY_WIKI}: the shulkers of each piece (base 2, large tower floor 4, large room 1, loot room 2, banner room 1, ship 3)`,
    text: 'Shulkers in the pieces that have them, persistent.',
    check: (o) => {
      const want = o.start.meta.kinds.reduce((sum, k) => sum + (SHULKERS[k === 'ship' ? 'end_ship' : k] ?? 0), 0);
      const got = o.spawns.filter((s) => s.type === 'shulker');
      return { ok: got.length > 0 && got.length <= want && got.every((s) => s.options.persistent), detail: `${got.length} of ${want} shulkers` };
    }
  },
  {
    id: 'EC5', layer: 'L3', source: `${CITY_WIKI}: loot rooms' chests; the ship's "two loot chests", dragon head and brewing stand`,
    text: 'Every chest has the End city loot; a ship carries its dragon head and brewing stand.',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      const shipOK = !o.start.meta.hasShip || (o.count('dragon_head') + o.count('dragon_wall_head') >= 1 && o.count('brewing_stand') >= 1);
      return { ok: chests.every((c) => c.lootTable === END_CITY_LOOT) && shipOK, detail: `${chests.length} chests; ship ${o.start.meta.hasShip}` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Trail ruins. Source: https://minecraft.wiki/w/Trail_Ruins.

const TRAIL_WIKI = 'Trail Ruins';
const trailRuinsFacts = [
  {
    id: 'TR1', layer: 'L1', source: `${TRAIL_WIKI}: "taiga, snowy taiga, old growth spruce taiga, old growth pine taiga, old growth birch forest, and the jungle"`,
    text: 'Those six biomes.',
    check: (o) => ({ ok: [...o.registry.biomes].sort().join() === 'jungle,old_growth_birch_forest,old_growth_pine_taiga,old_growth_spruce_taiga,snowy_taiga,taiga', detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'TR2', layer: 'L2', source: `${TRAIL_WIKI}: "mostly underground with only the top of the tower above the ground"`,
    text: 'Only the tower top rises above the ground.',
    check: (o) => {
      const top = o.pieces.find((p) => p.meta.kind === 'tower_top').box;
      const above = o.writes.filter((w) => w.y > o.groundAt(w.x, w.z) && !top.contains(w.x, w.y, w.z)).length;
      return { ok: above === 0 && top.maxY > o.start.meta.ground, detail: `${above} blocks above the ground besides the tower top (to y ${top.maxY}, ground ${o.start.meta.ground})` };
    }
  },
  {
    id: 'TR3', layer: 'L2', source: `${TRAIL_WIKI}: "a main road ... that connect multiple small buildings and a central tower made of stained terracotta and glazed terracotta ... two rooms"`,
    text: 'A terracotta tower with two rooms beside it and roads of cobblestone, stone and stone bricks.',
    check: (o) => {
      const kinds = o.start.meta.kinds;
      const ok = kinds.filter((k) => k === 'tower_hall').length === 2 && kinds.includes('road') && o.countMatching(/_glazed_terracotta$/) > 0 && o.count('cobblestone') + o.count('stone') + o.count('stone_bricks') > 0;
      return { ok, detail: kinds.join(', ') };
    }
  },
  {
    id: 'TR4', layer: 'L3', source: `${TRAIL_WIKI}: "tower_top ... and everything in the roads folder replace two gravel with two common suspicious gravel. The rest replace nine gravel with six common ... and three rare"; no chests`,
    text: 'Suspicious gravel per piece (2 common in the tower top and roads; 6 common + 3 rare elsewhere), no chests.',
    check: (o) => {
      const sus = o.writes.filter((w) => w.name === 'suspicious_gravel');
      const common = sus.filter((w) => w.lootTable === TRAIL_LOOT.common).length; const rare = sus.filter((w) => w.lootTable === TRAIL_LOOT.rare).length;
      const tops = o.pieces.filter((p) => ['tower_top', 'road'].includes(p.meta.kind)).length;
      const full = o.pieces.filter((p) => !['tower_top', 'road', 'extent'].includes(p.meta.kind)).length;
      return { ok: o.count('chest') === 0 && common <= tops * 2 + full * 6 && rare <= full * 3 && rare > 0 && common > 0, detail: `${common} common, ${rare} rare in ${tops} top/road + ${full} other pieces` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Ancient cities. Source: https://minecraft.wiki/w/Ancient_City and /Structure/Blueprints.

const ANCIENT_WIKI = 'Ancient City';
const ancientCityFacts = [
  {
    id: 'AC1', layer: 'L1', source: `${ANCIENT_WIKI}: "they can only generate in the deep dark"`,
    text: 'Deep dark only.',
    check: (o) => ({ ok: o.registry.biomes.join() === 'deep_dark', detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'AC2', layer: 'L2', source: `${ANCIENT_WIKI}: "The floor of the city always generates at Y=-51 and is about 20 blocks high"`,
    text: 'One fixed floor level for every city (y 13 in this 64-tall world: -51 is 13 above vanilla\'s floor).',
    check: (o) => {
      const corridors = o.pieces.filter((p) => p.meta.kind === 'corridor');
      return { ok: o.start.meta.floorY === CITY_FLOOR_Y && corridors.every((p) => p.box.minY === CITY_FLOOR_Y - 1), detail: `floor y ${o.start.meta.floorY}` };
    }
  },
  {
    id: 'AC3', layer: 'L2', source: `${ANCIENT_WIKI}: "long corridors with 2-block-deep floors of gray wool ... smaller ruin structures ... The city's center features a frame resembling a portal"`,
    text: 'The centre with its reinforced deepslate frame, the entrance, gray-wool corridors and buildings beside them.',
    check: (o) => {
      const kinds = o.start.meta.kinds;
      const ok = kinds.includes('city_center') && kinds.includes('entrance') && kinds.filter((k) => k === 'corridor').length >= 4 && kinds.filter((k) => k === 'building').length >= 6 && o.count('reinforced_deepslate') > 0 && o.count('gray_wool') > 0;
      return { ok, detail: `${kinds.filter((k) => k === 'building').length} buildings, ${kinds.filter((k) => k === 'corridor').length} corridors, ${o.count('reinforced_deepslate')} reinforced deepslate` };
    }
  },
  {
    id: 'AC4', layer: 'L3', source: `${ANCIENT_WIKI}: Loot -- the ancient city chests; ice boxes have their own`,
    text: 'Chests with the ancient city loot (the ice box\'s with its own).',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      return { ok: chests.length > 0 && chests.every((c) => Object.values(CITY_LOOT).includes(c.lootTable)), detail: `${chests.length} chests` };
    }
  },
  {
    id: 'AC5', layer: 'L4', source: `${ANCIENT_WIKI} infobox: mobs -- "Warden (from sculk shrieker)"`,
    text: 'No mob is placed by the structure (the warden comes from shriekers).',
    check: (o) => ({ ok: o.spawns.length === 0, detail: `${o.spawns.length} mobs` })
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Trial chambers. Source: https://minecraft.wiki/w/Trial_Chambers.

const TRIAL_WIKI = 'Trial Chambers';
const trialChamberFacts = [
  {
    id: 'TC1', layer: 'L1', source: `${TRIAL_WIKI}: "generate underground in the Overworld ... unless a deep dark biome cancels the generation"; 34-chunk regions`,
    text: 'Anywhere in the Overworld but the deep dark, one per 34-chunk region.',
    check: (o) => {
      const set = STRUCTURE_SETS.find((s) => s.name === 'trial_chambers');
      return { ok: o.registry.biomes.length === 0 && o.registry.biomeTagExcludes?.includes('deep_dark') && set.spacing === 34, detail: `spacing ${set.spacing}` };
    }
  },
  {
    id: 'TC2', layer: 'L2', source: `${TRIAL_WIKI}: "The starting room of the structure is corridor/end ... an intersection links to another chamber ... ends on the atrium, which then leads to the entrance room"`,
    text: 'The corridor end first, then chambers, an intersection, the atrium and the entrance.',
    check: (o) => {
      const kinds = o.start.meta.kinds;
      const chambers = kinds.filter((k) => TRIAL_CHAMBER_KINDS.includes(k)).length;
      const ok = kinds[0] === 'corridor_end' && chambers >= 2 && kinds.includes('intersection') && kinds.includes('atrium');
      return { ok, detail: kinds.join(', ') };
    }
  },
  {
    id: 'TC3', layer: 'L3', source: `${TRIAL_WIKI}: "one mob from each of the following categories is randomly selected ... Breeze (always) ... Melee ... Ranged ... Small melee"`,
    text: 'Trial spawners, each spawning its category\'s mob for this structure; the breeze is always one of them.',
    check: (o) => {
      const spawners = o.start.meta.cells.filter((c) => c.name === 'trial_spawner');
      const mobs = o.start.meta.mobs;
      const ok = spawners.length > 0 && spawners.every((s) => s.nbt.trialSpawner.mob === mobs[s.nbt.trialSpawner.category] && TRIAL_CATEGORIES[s.nbt.trialSpawner.category].includes(s.nbt.trialSpawner.mob)) && mobs.breeze === 'breeze';
      return { ok, detail: `${spawners.length} trial spawners: ${[...new Set(spawners.map((s) => s.nbt.trialSpawner.mob))].join(', ')}` };
    }
  },
  {
    id: 'TC4', layer: 'L3', source: `${TRIAL_WIKI}: Loot -- vaults and ominous vaults, chests, barrels, decorated pots, dispensers; "Natural mob spawning do not occur"`,
    text: 'Vaults in the chambers; chests with the trial chambers tables; no mob placed by the structure.',
    check: (o) => {
      const vaults = o.count('vault');
      const chests = o.writes.filter((w) => w.name === 'chest');
      const ok = vaults > 0 && chests.every((c) => /trial_chambers/.test(c.lootTable)) && o.spawns.length === 0;
      return { ok, detail: `${vaults} vaults, ${chests.length} chests` };
    }
  }
];

// ---------------------------------------------------------------------------------------------------------------
// Woodland mansions. Source: https://minecraft.wiki/w/Woodland_Mansion and /Structure/Blueprints.

const MANSION_WIKI = 'Woodland Mansion';
const mansionFacts = [
  {
    id: 'WM1', layer: 'L1', source: `${MANSION_WIKI}: "generate rarely in dark forests" (pale gardens are newer than this game)`,
    text: 'Dark forests only.',
    check: (o) => ({ ok: o.registry.biomes.join() === 'dark_forest', detail: o.registry.biomes.join(', ') })
  },
  {
    id: 'WM2', layer: 'L2', source: `${MANSION_WIKI}: "they all have three floors ... The top floor is about half the size of the lower floors"`,
    text: 'Three floors of rooms, the top one smaller.',
    check: (o) => {
      const rooms = o.pieces.filter((p) => p.meta.kind === 'room' || p.meta.kind === 'corridor');
      const floors = [...new Set(rooms.map((p) => p.box.minY))].sort((a, b) => a - b);
      const area = (y) => rooms.filter((p) => p.box.minY === y).reduce((s, p) => s + (p.box.maxX - p.box.minX + 1) * (p.box.maxZ - p.box.minZ + 1), 0);
      const ok = floors.length === 3 && area(floors[2]) < area(floors[0]);
      return { ok, detail: `floors at y ${floors.join(', ')}; areas ${floors.map(area).join(', ')}` };
    }
  },
  {
    id: 'WM3', layer: 'L3', source: `${MANSION_WIKI}: "generate a cobblestone foundation underneath the entire structure if there are any gaps"`,
    text: 'Cobblestone under the floor down to the ground wherever the ground is lower.',
    check: (o) => {
      const y = o.start.meta.floorY;
      const box = o.pieces.find((p) => p.meta.kind === 'foundation').box;
      let gaps = 0;
      for (let bx = box.minX; bx <= box.maxX; bx += 7) for (let bz = box.minZ; bz <= box.maxZ; bz += 7) {
        const ground = o.groundAt(bx, bz);
        for (let by = ground + 1; by < y - 1; by++) if (o.writes.find((w) => w.x === bx && w.y === by && w.z === bz)?.name !== 'cobblestone') gaps++;
      }
      return { ok: gaps === 0, detail: `${gaps} gaps under the floor` };
    }
  },
  {
    id: 'WM4', layer: 'L4', source: `${MANSION_WIKI}: "The first floor ... may only generate rooms that contain vindicators; from the second floor upward, some large rooms may contain both evokers and vindicators ... Allays are found imprisoned in cells inside 'jail' rooms"`,
    text: 'Vindicators; evokers only above the ground floor; allays only in jails; none despawn.',
    check: (o) => {
      const y = o.start.meta.floorY;
      const evokersLow = o.spawns.filter((s) => s.type === 'evoker' && s.y < y + 8).length;
      const jails = o.pieces.filter((p) => JAIL_ROOMS.includes(p.meta.name));
      const strayAllays = o.spawns.filter((s) => s.type === 'allay' && !jails.some((j) => j.box.contains(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)))).length;
      const ok = o.spawns.some((s) => s.type === 'vindicator') && evokersLow === 0 && strayAllays === 0 && o.spawns.every((s) => s.options.persistent && ['vindicator', 'evoker', 'allay'].includes(s.type));
      return { ok, detail: ['vindicator', 'evoker', 'allay'].map((t) => `${t} ${o.spawns.filter((s) => s.type === t).length}`).join(', ') };
    }
  },
  {
    id: 'WM5', layer: 'L3', source: `${MANSION_WIKI}: Loot -- the woodland mansion chests`,
    text: 'Every chest carries the woodland mansion loot.',
    check: (o) => {
      const chests = o.writes.filter((w) => w.name === 'chest');
      return { ok: chests.length > 0 && chests.every((c) => c.lootTable === MANSION_LOOT), detail: `${chests.length} chests` };
    }
  }
];

export const STRUCTURE_AUDIT_CARDS = {
  swamp_hut: {
    title: 'Swamp Hut', wiki: 'https://minecraft.wiki/w/Swamp_Hut', facts: swampHutFacts,
    // The infobox's Blocks list, copied from the wikitext (scripts/fetch-wiki-structure.mjs Swamp_Hut).
    infoboxBlocks: ['cauldron', 'crafting_table', 'oak_fence', 'oak_log', 'potted_red_mushroom', 'spruce_planks', 'spruce_stairs']
  },
  jungle_pyramid: {
    title: 'Jungle Pyramid', wiki: 'https://minecraft.wiki/w/Jungle_Pyramid', facts: junglePyramidFacts,
    // Redstone dust is the redstone_wire block, the repeater is `repeater`, string placed is `tripwire`, vines `vine`.
    infoboxBlocks: ['chest', 'chiseled_stone_bricks', 'cobblestone', 'cobblestone_stairs', 'dispenser', 'lever', 'mossy_cobblestone', 'redstone_repeater', 'redstone_dust', 'sticky_piston', 'string', 'tripwire_hook', 'vines'],
    normaliseBlock: (name) => ({ redstone_wire: 'redstone_dust', repeater: 'redstone_repeater', tripwire: 'string', vine: 'vines' }[name] ?? name)
  },
  ruined_portal: ruinedPortalCard('ruined_portal', 'Ruined Portal (standard)'),
  ruined_portal_desert: ruinedPortalCard('ruined_portal_desert', 'Ruined Portal (desert)'),
  ruined_portal_jungle: ruinedPortalCard('ruined_portal_jungle', 'Ruined Portal (jungle)'),
  ruined_portal_swamp: ruinedPortalCard('ruined_portal_swamp', 'Ruined Portal (swamp)'),
  ruined_portal_mountain: ruinedPortalCard('ruined_portal_mountain', 'Ruined Portal (mountain)'),
  ruined_portal_ocean: ruinedPortalCard('ruined_portal_ocean', 'Ruined Portal (ocean)'),
  ruined_portal_nether: ruinedPortalCard('ruined_portal_nether', 'Ruined Portal (Nether)'),
  buried_treasure: {
    title: 'Buried Treasure', wiki: 'https://minecraft.wiki/w/Buried_Treasure', facts: buriedTreasureFacts,
    // The infobox lists the chest, water (a waterlogged chest) and the terrain that buries it; the structure itself places
    // only the chest.
    infoboxBlocks: ['chest', 'water', 'gravel', 'sand', 'sandstone', 'stone'], infoboxSubset: true
  },
  shipwreck: { title: 'Shipwreck', wiki: 'https://minecraft.wiki/w/Shipwreck', facts: shipwreckFacts('shipwreck'), infoboxBlocks: SHIPWRECK_INFOBOX, infoboxSubset: true, normaliseBlock: (name) => name.replace(/_door_(top|bottom)$/, '_door') },
  shipwreck_beached: { title: 'Shipwreck (beached)', wiki: 'https://minecraft.wiki/w/Shipwreck', facts: shipwreckFacts('shipwreck_beached'), infoboxBlocks: SHIPWRECK_INFOBOX, infoboxSubset: true, normaliseBlock: (name) => name.replace(/_door_(top|bottom)$/, '_door') },
  ocean_ruin_cold: {
    title: 'Cold Ocean Ruins', wiki: 'https://minecraft.wiki/w/Cold_Ocean_Ruins', facts: oceanRuinFacts('ocean_ruin_cold'),
    // The infobox also lists the water, kelp and seagrass the ruins stand in; the structure places none of them.
    infoboxBlocks: ['bricks', 'chest', 'chiseled_stone_bricks', 'cobblestone', 'cracked_stone_bricks', 'dark_oak_planks', 'gravel', 'kelp', 'kelp_plant', 'magma_block', 'mossy_cobblestone', 'mossy_stone_bricks', 'obsidian', 'polished_diorite', 'polished_granite', 'prismarine', 'purple_glazed_terracotta', 'sand', 'sea_lantern', 'seagrass', 'spruce_planks', 'stone_bricks', 'stone_brick_stairs', 'suspicious_gravel', 'tall_seagrass', 'water'],
    infoboxSubset: true
  },
  ocean_ruin_warm: {
    title: 'Warm Ocean Ruins', wiki: 'https://minecraft.wiki/w/Warm_Ocean_Ruins', facts: oceanRuinFacts('ocean_ruin_warm'),
    infoboxBlocks: ['chest', 'chiseled_sandstone', 'cut_sandstone', 'gravel', 'kelp', 'kelp_plant', 'light_blue_terracotta', 'magma_block', 'polished_diorite', 'polished_granite', 'sand', 'sandstone', 'sandstone_stairs', 'sea_lantern', 'seagrass', 'suspicious_sand', 'tall_seagrass', 'water'],
    infoboxSubset: true
  },
  monument: {
    title: 'Ocean Monument', wiki: 'https://minecraft.wiki/w/Ocean_Monument', facts: monumentFacts,
    // Kelp and seagrass in the infobox grow round it; the structure places none.
    infoboxBlocks: ['gold_block', 'dark_prismarine', 'kelp', 'kelp_plant', 'prismarine', 'prismarine_bricks', 'sea_lantern', 'seagrass', 'tall_seagrass', 'water', 'wet_sponge'],
    infoboxSubset: true
  },
  monster_room: {
    title: 'Monster Room', wiki: 'https://minecraft.wiki/w/Monster_Room', facts: monsterRoomFacts,
    infoboxBlocks: ['cobblestone', 'mossy_cobblestone', 'chest', 'spawner']
  },
  fossil: {
    title: 'Fossil', wiki: 'https://minecraft.wiki/w/Fossil', facts: fossilFacts,
    // Plain diamond ore is the Bedrock / pre-deepslate form; this game's deep fossils use deepslate diamond ore.
    infoboxBlocks: ['bone_block', 'coal_ore', 'diamond_ore', 'deepslate_diamond_ore'], infoboxSubset: true
  },
  amethyst_geode: {
    title: 'Amethyst Geode', wiki: 'https://minecraft.wiki/w/Amethyst_Geode', facts: geodeFacts,
    // Which crystal sizes a geode gets is random, so a geode need not show all four.
    infoboxBlocks: ['amethyst_cluster', 'large_amethyst_bud', 'medium_amethyst_bud', 'small_amethyst_bud', 'amethyst_block', 'budding_amethyst', 'calcite', 'smooth_basalt'],
    infoboxSubset: true
  },
  mineshaft: { title: 'Mineshaft', wiki: 'https://minecraft.wiki/w/Mineshaft', facts: mineshaftFacts('mineshaft'), infoboxBlocks: ['rail', 'torch', 'cobweb', 'spawner', 'chain', 'oak_planks', 'oak_fence', 'oak_log', 'dirt', 'stone'], infoboxSubset: true },
  mineshaft_mesa: { title: 'Mineshaft (badlands)', wiki: 'https://minecraft.wiki/w/Mineshaft', facts: mineshaftFacts('mineshaft_mesa'), infoboxBlocks: ['rail', 'torch', 'cobweb', 'spawner', 'chain', 'dark_oak_planks', 'dark_oak_fence', 'dark_oak_log', 'dirt', 'stone'], infoboxSubset: true },
  stronghold: {
    title: 'Stronghold', wiki: 'https://minecraft.wiki/w/Stronghold', facts: strongholdFacts,
    // The Blocks list; the lit portal and water are conditional (the fountain room, a lit portal).
    infoboxBlocks: ['bookshelf', 'chest', 'cobblestone_stairs', 'cobblestone', 'cobweb', 'cracked_stone_bricks', 'end_portal_frame', 'end_portal', 'infested_stone_bricks', 'iron_bars', 'iron_door', 'ladder', 'lava', 'spawner', 'mossy_stone_bricks', 'oak_door', 'oak_fence', 'oak_planks', 'smooth_stone_slab', 'stone_brick_slab', 'stone_brick_stairs', 'stone_bricks', 'stone_button', 'torch', 'water'],
    infoboxSubset: true, normaliseBlock: (name) => ({ end_portal_frame_filled: 'end_portal_frame', wall_torch: 'torch' }[name] ?? name)
  },
  fortress: {
    title: 'Nether Fortress', wiki: 'https://minecraft.wiki/w/Nether_Fortress', facts: fortressFacts,
    infoboxBlocks: ['nether_bricks', 'nether_brick_fence', 'nether_brick_stairs', 'soul_sand', 'nether_wart', 'chest', 'spawner', 'lava'],
    infoboxSubset: true
  },
  nether_fossil: { title: 'Nether Fossil', wiki: 'https://minecraft.wiki/w/Nether_Fossil', facts: netherFossilFacts, infoboxBlocks: ['bone_block', 'dried_ghast'], infoboxSubset: true },
  bastion_remnant: {
    title: 'Bastion Remnant', wiki: 'https://minecraft.wiki/w/Bastion_Remnant', facts: bastionFacts,
    infoboxBlocks: ['basalt', 'polished_basalt', 'blackstone', 'blackstone_slab', 'blackstone_stairs', 'blackstone_wall', 'gilded_blackstone', 'polished_blackstone_bricks', 'polished_blackstone_brick_stairs', 'cracked_polished_blackstone_bricks', 'chiseled_polished_blackstone', 'gold_block', 'chain', 'chest', 'fire', 'glowstone', 'lantern', 'lava', 'magma_block', 'nether_wart', 'netherrack', 'quartz_block', 'smooth_quartz', 'smooth_quartz_slab', 'soul_sand', 'spawner'],
    infoboxSubset: true
  },
  end_spike: { title: 'End Spike', wiki: 'https://minecraft.wiki/w/End_Spike', facts: endSpikeFacts, infoboxBlocks: ['obsidian', 'bedrock', 'fire', 'iron_bars'] },
  end_podium: { title: 'Exit Portal (End podium)', wiki: 'https://minecraft.wiki/w/Exit_Portal', facts: endPodiumFacts, infoboxBlocks: ['bedrock', 'end_stone', 'wall_torch'] },
  end_platform: { title: 'End Platform', wiki: 'https://minecraft.wiki/w/End_Platform', facts: endPlatformFacts, infoboxBlocks: ['obsidian'] },
  void_start_platform: { title: 'Void Start Platform', wiki: 'https://minecraft.wiki/w/Void_Start_Platform', facts: voidPlatformFacts, infoboxBlocks: ['stone', 'cobblestone'] },
  end_city: {
    title: 'End City', wiki: 'https://minecraft.wiki/w/End_City', facts: endCityFacts,
    infoboxBlocks: ['chest', 'end_rod', 'end_stone_bricks', 'ender_chest', 'ladder', 'magenta_stained_glass', 'magenta_wall_banner', 'purple_stained_glass', 'purpur_block', 'purpur_pillar', 'purpur_slab', 'purpur_stairs', 'brewing_stand', 'dragon_head', 'obsidian'],
    infoboxSubset: true
  },
  trail_ruins: {
    title: 'Trail Ruins', wiki: 'https://minecraft.wiki/w/Trail_Ruins', facts: trailRuinsFacts,
    infoboxBlocks: ['black_glazed_terracotta', 'blast_furnace', 'coal_block', 'blue_terracotta', 'brick_slab', 'brick_stairs', 'brick_wall', 'bricks', 'brown_stained_glass', 'brown_terracotta', 'campfire', 'cartography_table', 'cauldron', 'coarse_dirt', 'cobblestone', 'composter', 'cracked_stone_bricks', 'crafting_table', 'cyan_glazed_terracotta', 'cyan_terracotta', 'dirt', 'damaged_anvil', 'furnace', 'gravel', 'gray_terracotta', 'grindstone', 'iron_bars', 'ladder', 'light_blue_glazed_terracotta', 'light_gray_glazed_terracotta', 'light_gray_terracotta', 'loom', 'mud', 'mud_brick_slab', 'mud_brick_stairs', 'mud_brick_wall', 'mud_bricks', 'orange_glazed_terracotta', 'orange_terracotta', 'packed_mud', 'red_terracotta', 'smithing_table', 'smooth_stone_slab', 'suspicious_gravel', 'stone', 'stone_bricks', 'white_terracotta', 'yellow_glazed_terracotta', 'yellow_terracotta'],
    infoboxSubset: true
  },
  ancient_city: {
    title: 'Ancient City', wiki: 'https://minecraft.wiki/w/Ancient_City', facts: ancientCityFacts,
    // The Blocks table's two lists (redstone dust is the redstone_wire block; snow is the snow layer).
    infoboxBlocks: ['deepslate', 'cobbled_deepslate', 'polished_deepslate', 'deepslate_bricks', 'deepslate_tiles', 'chiseled_deepslate', 'cracked_deepslate_bricks', 'cracked_deepslate_tiles', 'cobbled_deepslate_slab', 'cobbled_deepslate_stairs', 'cobbled_deepslate_wall', 'polished_deepslate_slab', 'polished_deepslate_stairs', 'polished_deepslate_wall', 'deepslate_brick_slab', 'deepslate_brick_stairs', 'deepslate_brick_wall', 'deepslate_tile_slab', 'deepslate_tile_stairs', 'deepslate_tile_wall', 'gray_wool', 'polished_basalt', 'smooth_basalt', 'dark_oak_log', 'dark_oak_planks', 'dark_oak_fence', 'ladder', 'candle', 'soul_lantern', 'torch', 'chest', 'reinforced_deepslate', 'sculk_sensor', 'redstone_lamp', 'soul_fire', 'soul_sand', 'redstone_wire', 'comparator', 'repeater', 'redstone_torch', 'redstone_wall_torch', 'redstone_block', 'lectern', 'target', 'furnace', 'lever', 'sticky_piston', 'piston_head', 'gray_carpet', 'glass', 'glass_pane', 'dirt', 'grass_block', 'blue_wool', 'cyan_wool', 'light_blue_wool', 'campfire', 'iron_trapdoor', 'ice', 'packed_ice', 'blue_ice', 'snow', 'note_block', 'stone_pressure_plate', 'skeleton_skull', 'white_candle', 'water', 'blue_carpet', 'cyan_carpet', 'light_blue_carpet'],
    infoboxSubset: true, normaliseBlock: (name) => ({ wall_torch: 'torch', skeleton_wall_skull: 'skeleton_skull', redstone_comparator: 'comparator', grass: 'grass_block' }[name] ?? name)
  },
  trial_chambers: {
    title: 'Trial Chambers', wiki: 'https://minecraft.wiki/w/Trial_Chambers', facts: trialChamberFacts,
    infoboxBlocks: ['barrel', 'chest', 'chiseled_tuff', 'chiseled_tuff_bricks', 'copper_block', 'decorated_pot', 'dispenser', 'magma_block', 'polished_tuff', 'polished_tuff_slab', 'powder_snow', 'trial_spawner', 'tuff_bricks', 'vault', 'water', 'waxed_copper_block', 'waxed_chiseled_copper', 'waxed_copper_bulb', 'waxed_copper_door', 'waxed_copper_grate', 'waxed_cut_copper', 'waxed_cut_copper_slab', 'waxed_cut_copper_stairs', 'waxed_oxidized_chiseled_copper', 'waxed_oxidized_copper', 'waxed_oxidized_copper_door', 'waxed_oxidized_copper_grate', 'waxed_oxidized_cut_copper', 'stone', 'cobweb', 'bone_block', 'podzol', 'red_mushroom', 'chiseled_sandstone', 'mossy_cobblestone'],
    infoboxSubset: true
  },
  mansion: {
    title: 'Woodland Mansion', wiki: 'https://minecraft.wiki/w/Woodland_Mansion', facts: mansionFacts,
    infoboxBlocks: ['attached_melon_stem', 'attached_pumpkin_stem', 'birch_fence', 'birch_planks', 'birch_slab', 'birch_stairs', 'black_wall_banner', 'black_carpet', 'black_wool', 'diamond_block', 'lapis_block', 'blue_carpet', 'blue_wool', 'bookshelf', 'brown_carpet', 'brown_mushroom', 'brown_wool', 'carved_pumpkin', 'cauldron', 'chest', 'coarse_dirt', 'cobblestone', 'cobblestone_slab', 'cobblestone_stairs', 'cobblestone_wall', 'cobweb', 'cyan_carpet', 'cyan_wool', 'damaged_anvil', 'dark_oak_door', 'dark_oak_fence', 'dark_oak_fence_gate', 'dark_oak_leaves', 'dark_oak_log', 'dark_oak_planks', 'dark_oak_sapling', 'dark_oak_stairs', 'dirt', 'farmland', 'glass', 'glass_pane', 'gray_wall_banner', 'gray_carpet', 'gray_wool', 'green_carpet', 'green_wool', 'infested_cobblestone', 'iron_bars', 'iron_door', 'ladder', 'lava', 'lever', 'light_blue_wool', 'light_gray_wall_banner', 'light_gray_carpet', 'light_gray_wool', 'lily_pad', 'lime_carpet', 'lime_wool', 'magenta_carpet', 'melon', 'melon_stem', 'monster_spawner', 'oak_fence', 'oak_planks', 'oak_slab', 'oak_stairs', 'obsidian', 'orange_wool', 'pumpkin', 'pumpkin_stem', 'pink_carpet', 'polished_andesite', 'potted_allium', 'potted_azure_bluet', 'potted_birch_sapling', 'potted_blue_orchid', 'potted_dandelion', 'potted_oxeye_daisy', 'potted_poppy', 'potted_red_tulip', 'potted_white_tulip', 'purple_carpet', 'rail', 'red_carpet', 'red_mushroom', 'red_wool', 'redstone_dust', 'smooth_stone_slab', 'tnt', 'torch', 'trapped_chest', 'vines', 'wall_torch', 'water', 'water_cauldron', 'wheat', 'white_carpet', 'white_wool', 'yellow_carpet', 'yellow_wool'],
    infoboxSubset: true, // Plus blocks the Blueprints page draws that the infobox leaves out (a light blue carpet, empty flower pots); this
    // game places a potted flower as the flower, and dark oak wood where the drawings have it.
    normaliseBlock: (name) => ({ wall_torch: 'torch', grass: 'grass_block', spawner: 'monster_spawner', vine: 'vines', redstone_wire: 'redstone_dust', dark_oak_wood: 'dark_oak_log', light_blue_carpet: 'light_blue_wool', flower_pot: 'potted_dandelion', dandelion: 'potted_dandelion', poppy: 'potted_poppy', red_tulip: 'potted_red_tulip', oxeye_daisy: 'potted_oxeye_daisy', allium: 'potted_allium', blue_orchid: 'potted_blue_orchid' }[name] ?? name.replace(/^wheat_stage_\d$/, 'wheat').replace(/_banner$/, '_wall_banner').replace(/_wall_wall_banner$/, '_wall_banner'))
  },
  desert_well: {
    title: 'Desert Well', wiki: 'https://minecraft.wiki/w/Desert_Well', facts: desertWellFacts,
    infoboxBlocks: ['sand', 'sandstone', 'sandstone_slab', 'suspicious_sand', 'water']
  },
  pillager_outpost: {
    title: 'Pillager Outpost', wiki: 'https://minecraft.wiki/w/Pillager_Outpost', facts: pillagerOutpostFacts,
    infoboxBlocks: ['birch_planks', 'carved_pumpkin', 'chest', 'cobblestone', 'cobblestone_stairs', 'cobblestone_slab', 'cobblestone_wall', 'crafting_table', 'dark_oak_fence', 'dark_oak_log', 'dark_oak_planks', 'dark_oak_slab', 'dark_oak_stairs', 'hay_block', 'mossy_cobblestone', 'mossy_cobblestone_slab', 'mossy_cobblestone_stairs', 'mossy_cobblestone_wall', 'ominous_wall_banner', 'pumpkin', 'torch', 'vines', 'white_wool'],
    // The ominous banner is drawn as a white wall banner (no banner patterns in this game); wall torches are torches.
    infoboxSubset: true, normaliseBlock: (name) => ({ white_wall_banner: 'ominous_wall_banner', wall_torch: 'torch' }[name] ?? name)
  },
  igloo: {
    title: 'Igloo', wiki: 'https://minecraft.wiki/w/Igloo', facts: iglooFacts,
    // The infobox's Blocks list (splash potion is an item in the brewing stand, not a block).
    infoboxBlocks: ['snow_block', 'white_carpet', 'light_gray_carpet', 'ice', 'redstone_torch', 'furnace', 'red_bed', 'crafting_table', 'oak_trapdoor', 'ladder', 'torch', 'wall_torch', 'stone', 'stone_bricks', 'cracked_stone_bricks', 'mossy_stone_bricks', 'chiseled_stone_bricks', 'infested_chiseled_stone_bricks', 'infested_mossy_stone_bricks', 'infested_stone_bricks', 'chest', 'red_carpet', 'polished_andesite', 'cobweb', 'iron_bars', 'oak_wall_sign', 'water_cauldron', 'spruce_stairs', 'spruce_slab', 'brewing_stand', 'potted_cactus'],
    infoboxSubset: true, normaliseBlock: (name) => ({ red_bed_foot: 'red_bed', red_bed_head: 'red_bed', snow: 'snow_block' }[name] ?? name)
  },
  desert_pyramid: {
    title: 'Desert Pyramid', wiki: 'https://minecraft.wiki/w/Desert_Pyramid', facts: desertPyramidFacts,
    infoboxBlocks: ['blue_terracotta', 'chest', 'chiseled_sandstone', 'cut_sandstone', 'orange_terracotta', 'sand', 'sandstone', 'sandstone_slab', 'sandstone_stairs', 'stone_pressure_plate', 'suspicious_sand', 'tnt']
  },
  village_plains: { title: 'Village (plains)', wiki: 'https://minecraft.wiki/w/Village', facts: villageFacts('village_plains'), infoboxBlocks: villageInfobox('plains'), normaliseBlock: normaliseVillageBlock, infoboxSubset: true },
  village_desert: { title: 'Village (desert)', wiki: 'https://minecraft.wiki/w/Village', facts: villageFacts('village_desert'), infoboxBlocks: villageInfobox('desert'), normaliseBlock: normaliseVillageBlock, infoboxSubset: true },
  village_savanna: { title: 'Village (savanna)', wiki: 'https://minecraft.wiki/w/Village', facts: villageFacts('village_savanna'), infoboxBlocks: villageInfobox('savanna'), normaliseBlock: normaliseVillageBlock, infoboxSubset: true },
  village_snowy: { title: 'Village (snowy)', wiki: 'https://minecraft.wiki/w/Village', facts: villageFacts('village_snowy'), infoboxBlocks: villageInfobox('snowy'), normaliseBlock: normaliseVillageBlock, infoboxSubset: true },
  village_taiga: { title: 'Village (taiga)', wiki: 'https://minecraft.wiki/w/Village', facts: villageFacts('village_taiga'), infoboxBlocks: villageInfobox('taiga'), normaliseBlock: normaliseVillageBlock, infoboxSubset: true }
};
