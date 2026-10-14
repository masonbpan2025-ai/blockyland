import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { spendDurability } from './durability.js';
import { exposedToRain } from './weatherRules.js';
import { NetherPlantSystem } from './netherPlants.js';
import { ChorusSystem } from './chorus.js';

/**
 * The rest of the wiki's fertilizer table, as one block in and one block out.
 *
 * Wiki (Bone Meal), "Fertilizer": "Short Grass / Fern / Seagrass -- A one-block-high tall short grass, fern,
 * or seagrass ... grows into a two-block-high tall grass, large fern, or tall seagrass." In this engine the
 * tall forms are SINGLE blocks rather than a lower and an upper half, so the change is one substitution.
 *
 * Deliberately ABSENT, and why:
 *   - Sugar cane and nether wart: the wiki's own "Bone meal does not affect" list names both, so their
 *     absence is the correct behaviour rather than a gap.
 *   - Saplings and azaleas (45% chance of a stage) need a tree growth generator.
 *     Mushrooms and Nether fungi are handled separately by NetherPlantSystem.
 *   - Cocoa and the sweet berry bush ("matures 1 growth stage"): modelled as single blocks at their mature
 *     stage, so there is no earlier stage to advance from.
 *   - Sea pickles, kelp, cave vines, glow lichen, moss blocks, dripleaf, rooted dirt, pink petals and the
 *     torchflower/pitcher crops: each needs its own mechanic that is out of scope here.
 * The two-block flowers (sunflower, lilac, rose bush, peony) are handled by their drop rows rather than here.
 */
export const BONE_MEAL_PLANTS = {
  [BLOCKS.SHORT_GRASS]: { to: BLOCKS.TALL_GRASS },
  [BLOCKS.FERN]: { to: BLOCKS.LARGE_FERN },
  [BLOCKS.SEAGRASS]: { to: BLOCKS.TALL_SEAGRASS },
  // Wiki (Bone Meal): "Sunflower / Lilac / Rose Bush / Peony -- The corresponding item form drops, without
  // destroying the original plant." A `drop` entry rather than a `to`, because the plant stays put.
  [BLOCKS.LILAC]: { drop: BLOCKS.LILAC },
  [BLOCKS.ROSE_BUSH]: { drop: BLOCKS.ROSE_BUSH },
  [BLOCKS.PEONY]: { drop: BLOCKS.PEONY },
};

// Wiki (Hoe): "Hoes can till dirt blocks, grass blocks and dirt paths" -- and "do not work on mycelium or
// podzol". This set used to include podzol, mycelium and moss, which vanilla refuses.
export const TILLABLE_BLOCKS = new Set([
  BLOCKS.GRASS,
  BLOCKS.DIRT,
  BLOCKS.DIRT_PATH,
].filter(v => v !== undefined));

/** Wiki (Wheat): crops need "a light level of at least 9 to grow". */
export const MIN_CROP_LIGHT = 9;

/**
 * Wiki (Farmland): trampling happens when something "jumps/falls on the block (with chance equal to
 * distance fallen - 0.5)". Walking never tramples.
 */
export function trampleChance(fallDistance) {
  return Math.max(0, Math.min(1, (fallDistance || 0) - 0.5));
}

// Hoes from wooden to netherite
export function isHoe(itemId) {
  if (!itemId || typeof itemId !== 'string') return false;
  return itemId.endsWith('_hoe');
}

// Check if item is a seed or plantable vegetable
export function getSeedCrop(itemId) {
  if (itemId === 'wheat_seeds') {
    return { crop: 'wheat', block0: BLOCKS.WHEAT_STAGE_0 };
  }
  if (itemId === 'carrot') {
    return { crop: 'carrots', block0: BLOCKS.CARROTS_STAGE_0 };
  }
  if (itemId === 'potato') {
    return { crop: 'potatoes', block0: BLOCKS.POTATOES_STAGE_0 };
  }
  // Wiki: beetroot seeds plant beetroots, which grow through four stages like the other three crops.
  if (itemId === 'beetroot_seeds') {
    return { crop: 'beetroots', block0: BLOCKS.BEETROOTS_STAGE_0 };
  }
  return null;
}

/**
 * Each crop's stage blocks, lowest stage first.
 *
 * A table rather than `baseBlock + stage`, because the beetroot's four ids are NOT contiguous: the id space
 * was nearly full when its three earlier stages were added, so they took the only free slots (54 and 150)
 * plus the old single-stage id. `wheat`, `carrots` and `potatoes` remain runs, and their entries say so.
 */
export const CROP_STAGES = {
  wheat: [BLOCKS.WHEAT_STAGE_0, BLOCKS.WHEAT_STAGE_1, BLOCKS.WHEAT_STAGE_2, BLOCKS.WHEAT_STAGE_3,
    BLOCKS.WHEAT_STAGE_4, BLOCKS.WHEAT_STAGE_5, BLOCKS.WHEAT_STAGE_6, BLOCKS.WHEAT_STAGE_7],
  carrots: [BLOCKS.CARROTS_STAGE_0, BLOCKS.CARROTS_STAGE_1, BLOCKS.CARROTS_STAGE_2, BLOCKS.CARROTS_STAGE_3],
  potatoes: [BLOCKS.POTATOES_STAGE_0, BLOCKS.POTATOES_STAGE_1, BLOCKS.POTATOES_STAGE_2, BLOCKS.POTATOES_STAGE_3],
  beetroots: [BLOCKS.BEETROOTS_STAGE_0, BLOCKS.BEETROOTS_STAGE_1, BLOCKS.BEETROOTS_STAGE_2, BLOCKS.BEETROOTS_STAGE_3],
};

/** The block id a crop sits at in a given stage. */
export function cropStageBlock(type, stage) {
  const stages = CROP_STAGES[type];
  if (!stages) return undefined;
  return stages[Math.max(0, Math.min(stages.length - 1, stage))];
}

/** The stage a block is, or null when it is not that crop's. */
function stageOf(type, blockId) {
  const index = CROP_STAGES[type]?.indexOf(blockId) ?? -1;
  return index < 0 ? null : index;
}

/**
 * What a crop drops.
 *
 * Wiki (Beetroot): a mature plant drops 1 beetroot and 0-3 seeds; an immature one drops 1 seed. It does NOT
 * drop a beetroot before maturity, which is the one rule that separates it from carrots and potatoes.
 */
const CROP_DROPS = {
  wheat: {
    // Wiki (Wheat): a mature plant drops "1 wheat and 1-4 wheat seeds" (mean 2 5/7).
    dropMature: { item: 'wheat', min: 1, max: 1, seed: 'wheat_seeds', minSeeds: 1, maxSeeds: 4,
      // Vanilla's loot: 1 seed + Binomial(3, 4/7) more, which is where the wiki's 2 5/7 mean comes from.
      seedExtraTrials: 3, seedExtraChance: 4 / 7 },
    dropImmature: { item: 'wheat_seeds', count: 1 },
  },
  // Wiki (Carrot): "2 drops are fixed, then a drop is attempted three times with a success rate of 57.14286% to
  // yield the extra 0-3 drops" (mean 3 5/7); potatoes the same. They were a flat 2-5 (mean 3.5).
  carrots: { dropMature: { item: 'carrot', min: 2, max: 2, extraTrials: 3, extraChance: 4 / 7 }, dropImmature: { item: 'carrot', count: 1 } },
  potatoes: { dropMature: { item: 'potato', min: 2, max: 2, extraTrials: 3, extraChance: 4 / 7, poisonChance: 0.02 }, dropImmature: { item: 'potato', count: 1 } },
  beetroots: {
    // Wiki (Beetroot Seeds): "Harvesting fully-grown beetroot yields from 1 to 4 seeds" (mean 2 5/7) -- the same
    // binomial as wheat's. They were a flat 0-3 (mean 1.5).
    dropMature: { item: 'beetroot', min: 1, max: 1, seed: 'beetroot_seeds', minSeeds: 1, maxSeeds: 4, seedExtraTrials: 3, seedExtraChance: 4 / 7 },
    dropImmature: { item: 'beetroot_seeds', count: 1 },
  },
};

// Check if block is a crop and retrieve its metadata
export function getCropInfo(blockId) {
  for (const type of Object.keys(CROP_STAGES)) {
    const stage = stageOf(type, blockId);
    if (stage === null) continue;
    const stages = CROP_STAGES[type];
    return {
      type,
      stage,
      maxStage: stages.length - 1,
      isMature: stage === stages.length - 1,
      baseBlock: stages[0],
      ...CROP_DROPS[type],
    };
  }
  return null;
}

// Minecraft wiki: water hydrates farmland within horizontal Chebyshev distance of 4 (dx, dz in [-4, 4])
// and dy in [0, 1] (same level or 1 above).
export function isWaterNearby(world, x, y, z, game = null) {
  if (!world) return false;
  // Wiki (Farmland): "Rain also hydrates farmland" -- when nothing covers its top surface.
  if (exposedToRain(game?.weather,world,{x,y:y+1,z})) return true;
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        const voxel = world.getVoxel(x + dx, y + dy, z + dz);
        if (voxel === BLOCKS.WATER) {
          return true;
        }
      }
    }
  }
  return false;
}

function isSkyExposed(world, x, y, z) {
  for (let yy = y; yy < y + 64; yy++) {
    const id = world.getVoxel(x, yy, z);
    if (id === BLOCKS.AIR || id === undefined || id === null) continue;
    const def = BLOCK_DEFS[id];
    if (def && def.solid === false) continue;
    return false;
  }
  return true;
}

export class FarmingManager {
  constructor(game) {
    this.game = game;
    this.world = game?.world || null;
    this.tickTimer = 0;
    this.random = Math.random; // injectable, so tests can pin trampling and growth rolls
    this.tickInterval = 1.0; // checks growth and hydration periodically

    // Active crop and farmland tracking for fast O(N) tick updates
    this.crops = new Map(); // key "x,y,z" -> { x, y, z }
    this.farmlands = new Map(); // key "x,y,z" -> { x, y, z }
    this.netherPlants=new NetherPlantSystem(this.world,{random:()=>this.random(),changed:(x,y,z)=>this.rebuildBlockChunk(x,z),drop:(x,y,z,id,count)=>this.game?.entities?.spawnDroppedItem?.(new THREE.Vector3(x+.5,y+.2,z+.5),id,true,count)});
    this.chorus=new ChorusSystem(this.world,{random:()=>this.random(),changed:(x,y,z)=>this.rebuildBlockChunk(x,z)});
  }

  getKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  registerFarmland(x, y, z) {
    this.farmlands.set(this.getKey(x, y, z), { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
  }

  unregisterFarmland(x, y, z) {
    this.farmlands.delete(this.getKey(x, y, z));
  }

  registerCrop(x, y, z) {
    this.crops.set(this.getKey(x, y, z), { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
  }

  unregisterCrop(x, y, z) {
    this.crops.delete(this.getKey(x, y, z));
  }

  // --- 1. Farmland Tilling with Hoe ---
  till(x, y, z, player) {
    if (!this.world) this.world = this.game?.world;
    if (!this.world) return false;

    const blockId = this.world.getVoxel(x, y, z);
    if (!TILLABLE_BLOCKS.has(blockId)) return false;

    // Block directly above must be air or passable non-solid
    const aboveId = this.world.getVoxel(x, y + 1, z);
    const aboveDef = BLOCK_DEFS[aboveId];
    if (aboveId !== BLOCKS.AIR && aboveDef && aboveDef.solid !== false) {
      return false;
    }

    // Determine hydration
    const hydrated = isWaterNearby(this.world, x, y, z, this.game);
    const newFarmland = hydrated ? BLOCKS.FARMLAND_MOIST : BLOCKS.FARMLAND;

    this.world.setVoxel(x, y, z, newFarmland);
    this.registerFarmland(x, y, z);

    // Wiki (Hoe): tilling "uses 1 durability".
    if (player && player.gamemode === 'survival') {
      const held = this.game?.inventory?.getActiveItem?.();
      if (held && isHoe(held.id)) {
        const wear = spendDurability(held, 1);
        if (wear.broke) {
          this.game?.inventory?.consumeActiveItem?.(1);
          this.game?.ui?.updateHotbar?.();
        }
      }
    }

    // Audio
    this.game?.sounds?.playHoe?.();

    // Rebuild chunk mesh
    this.rebuildBlockChunk(x, z);
    return true;
  }

  // --- 2. Crop Planting ---
  plant(x, y, z, seedItemId, player) {
    if (!this.world) this.world = this.game?.world;
    if (!this.world) return false;

    const seedInfo = getSeedCrop(seedItemId);
    if (!seedInfo) return false;

    let targetX = x;
    let targetY = y;
    let targetZ = z;

    const clickedBlock = this.world.getVoxel(x, y, z);
    if (clickedBlock === BLOCKS.FARMLAND || clickedBlock === BLOCKS.FARMLAND_MOIST) {
      targetY = y + 1;
    }

    const currentBlock = this.world.getVoxel(targetX, targetY, targetZ);
    if (currentBlock !== BLOCKS.AIR) return false;

    const soilBlock = this.world.getVoxel(targetX, targetY - 1, targetZ);
    if (soilBlock !== BLOCKS.FARMLAND && soilBlock !== BLOCKS.FARMLAND_MOIST) {
      return false;
    }

    // Place stage 0 crop
    this.world.setVoxel(targetX, targetY, targetZ, seedInfo.block0);
    this.registerCrop(targetX, targetY, targetZ);
    this.registerFarmland(targetX, targetY - 1, targetZ);

    this.game?.sounds?.playPlant?.();
    this.rebuildBlockChunk(targetX, targetZ);

    // Consume seed in survival
    if (player && player.gamemode !== 'creative') {
      this.game?.inventory?.consumeActiveItem?.();
      this.game?.ui?.updateHotbar?.();
    }
    return true;
  }

  // --- 3. Bone Meal Application ---
  applyBoneMeal(x, y, z, player) {
    if (!this.world) this.world = this.game?.world;
    if (!this.world) return false;
    this.netherPlants.world=this.world;
    if(this.netherPlants.boneMeal(x,y,z)) {
      if(player?.gamemode!=='creative')this.game?.inventory?.consumeActiveItem?.();
      this.game?.entities?.spawnBoneMealParticles?.(new THREE.Vector3(x+.5,y+.5,z+.5),12);
      this.game?.ui?.updateHotbar?.();return true;
    }

    let cropX = x;
    let cropY = y;
    let cropZ = z;
    let blockId = this.world.getVoxel(cropX, cropY, cropZ);

    // If targeted farmland, check crop above
    if (blockId === BLOCKS.FARMLAND || blockId === BLOCKS.FARMLAND_MOIST) {
      cropY = y + 1;
      blockId = this.world.getVoxel(cropX, cropY, cropZ);
    }

    let cropInfo = getCropInfo(blockId);

    // 3a. Bone meal on crops
    if (cropInfo) {
      if (cropInfo.isMature) return false; // Already fully grown

      let advance = 0;
      if (cropInfo.type === 'wheat' || cropInfo.type === 'carrots' || cropInfo.type === 'potatoes') {
        // Wiki (Bone Meal), the fertilizer table's first row: "Wheat / Carrots / Potatoes -- The plant
        // matures 2-5 growth stages." It is ONE rule for all three. This used to branch, giving wheat 2-5 and
        // everything else 1-3, so a single bone meal on carrots or potatoes could advance them by a single
        // stage -- outside the range the wiki states, and short of what wheat gets from the same item.
        advance = 2 + Math.floor(Math.random() * 4);
      } else if (cropInfo.type === 'beetroots') {
        // Wiki (Bone Meal), the row below that one: "Beetroots -- The plant has a 75% chance of growing to
        // the next growth stage." One stage, and only three times in four, so it is neither the 2-5 rule
        // above nor a guarantee. A miss still spends the bone meal, which is what "wasting bone meal" means.
        if (Math.random() >= 0.75) {
          if (player && player.gamemode !== 'creative') {
            this.game?.inventory?.consumeActiveItem?.();
            this.game?.ui?.updateHotbar?.();
          }
          return true;
        }
        advance = 1;
      } else {
        // Any crop this build models later should state its own rule here rather than inherit one.
        advance = 1;
      }

      const nextStage = Math.min(cropInfo.maxStage, cropInfo.stage + advance);
      // Through the stage TABLE, not `baseBlock + stage`: the beetroot's four stages are not contiguous.
      const newBlockId = cropStageBlock(cropInfo.type, nextStage);

      this.world.setVoxel(cropX, cropY, cropZ, newBlockId);
      this.registerCrop(cropX, cropY, cropZ);

      // Sparkles and chime
      const spawnPos = new THREE.Vector3(cropX + 0.5, cropY + 0.3, cropZ + 0.5);
      this.game?.entities?.spawnBoneMealParticles?.(spawnPos, 18);
      this.game?.sounds?.playBoneMeal?.();
      this.rebuildBlockChunk(cropX, cropZ);

      // Consume bone meal in survival
      if (player && player.gamemode !== 'creative') {
        this.game?.inventory?.consumeActiveItem?.();
        this.game?.ui?.updateHotbar?.();
      }
      return true;
    }

    // 3b. Bone meal on Grass block (spreads flowers & tall grass)
    const targetBlock = this.world.getVoxel(x, y, z);
    if (targetBlock === BLOCKS.GRASS) {
      let createdAny = false;
      // Wiki (Bone Meal), "Creating new plants": "Grass blocks within a 15x15x15 area of the target block
      // randomly choose which type of foliage to grow". This used a 5x5 area at one level, so a bone meal
      // grew a quarter of the foliage vanilla does. The area is a half-extent of 7, giving 15 blocks.
      //
      // Wiki also: the TYPE "depends on external factors like the biome and coordinates", and those factors
      // are not modelled -- the roll below is still a flat dandelion/poppy choice. Recorded as
      // SPEC_UNVERIFIED rather than guessed at.
      const R = 7;
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          for (let dy = -R; dy <= R; dy++) {
            const gx = x + dx;
            const gy = y + dy;
            const gz = z + dz;
            // FIND a candidate before rolling for it. The roll used to run first, so on a small patch -- which
            // is what a test world or a lone grass block is -- the 45% gate almost never coincided with the
            // one cell that held grass, and bone meal appeared to do nothing at all. Vanilla picks from the
            // grass blocks in the volume, so the candidate check comes first and the roll decides sprouting.
            const _v = this.world.getVoxel(gx, gy, gz);
            if (_v !== BLOCKS.GRASS) continue;
            if (this.world.getVoxel(gx, gy + 1, gz) !== BLOCKS.AIR) continue;
            if (Math.random() >= 0.45) continue;
            const flowerRoll = Math.random();
            // The wiki's list of foliage this can create includes flowers, tall grass, ferns and pink petals.
            // Tall grass is included here; the BIOME rule that picks between them is not modelled.
            const flowerBlock = flowerRoll < 0.4 ? BLOCKS.DANDELION : flowerRoll < 0.8 ? BLOCKS.POPPY : BLOCKS.SHORT_GRASS;
            this.world.setVoxel(gx, gy + 1, gz, flowerBlock);
            createdAny = true;
          }
        }
      }

      const spawnPos = new THREE.Vector3(x + 0.5, y + 1.1, z + 0.5);
      this.game?.entities?.spawnBoneMealParticles?.(spawnPos, 22);
      this.game?.sounds?.playBoneMeal?.();
      this.rebuildBlockChunk(x, z);

      if (player && player.gamemode !== 'creative') {
        this.game?.inventory?.consumeActiveItem?.();
        this.game?.ui?.updateHotbar?.();
      }
      return true;
    }

    // 3c. Bone meal on the other plants the wiki's fertilizer table lists.
    //
    // Table-driven, because all of these are the same shape: one block in, one block out. Two whole rows of
    // the wiki's table are of that form -- "Short Grass / Fern / Seagrass: a one-block-high ... grows into a
    // two-block-high ..." and "Cocoa: The cocoa plant matures 1 growth stage". Sugar cane and nether wart are
    // deliberately ABSENT: the wiki's "Bone meal does not affect" list names both.
    const plantRule = BONE_MEAL_PLANTS[targetBlock];
    if (plantRule) {
      if (plantRule.to !== undefined) {
        this.world.setVoxel(x, y, z, plantRule.to);
        // A two-block plant needs its upper half placed as well, or the tall texture hangs over air.
        if (plantRule.upper !== undefined && this.world.getVoxel(x, y + 1, z) === BLOCKS.AIR) {
          this.world.setVoxel(x, y + 1, z, plantRule.upper);
        }
        this.registerCrop?.(x, y, z);
        this.game?.entities?.spawnBoneMealParticles?.(new THREE.Vector3(x + 0.5, y + 0.6, z + 0.5), 12);
        this.game?.sounds?.playBoneMeal?.();
        this.rebuildBlockChunk(x, z);
        if (player && player.gamemode !== 'creative') {
          this.game?.inventory?.consumeActiveItem?.();
          this.game?.ui?.updateHotbar?.();
        }
        return true;
      }
      // A drop-instead-of-growth entry: "The corresponding item form drops, without destroying the original."
      if (plantRule.drop) {
        this.game?.entities?.spawnDroppedItem?.(
          new THREE.Vector3(x + 0.5, y + 0.4, z + 0.5), plantRule.drop, false, 1,
        );
        this.game?.sounds?.playBoneMeal?.();
        if (player && player.gamemode !== 'creative') {
          this.game?.inventory?.consumeActiveItem?.();
          this.game?.ui?.updateHotbar?.();
        }
        return true;
      }
    }

    return false;
  }

  // --- 4. Right-Click Harvest & Replant ---
  harvest(x, y, z, player) {
    if (!this.world) this.world = this.game?.world;
    if (!this.world) return false;

    const blockId = this.world.getVoxel(x, y, z);
    const cropInfo = getCropInfo(blockId);
    if (!cropInfo || !cropInfo.isMature) return false;

    // Spawn harvest drops
    this.spawnCropDrops(x, y, z, cropInfo, true);

    // Replant at stage 0
    this.world.setVoxel(x, y, z, cropInfo.baseBlock);
    this.registerCrop(x, y, z);

    this.game?.sounds?.playPlant?.();
    this.rebuildBlockChunk(x, z);
    return true;
  }

  // --- 5. Break Crop & Drops Handling ---
  handleCropBreak(x, y, z, blockId, gamemode, fortune = 0) {
    const cropInfo = getCropInfo(blockId);
    this.unregisterCrop(x, y, z);

    if (gamemode === 'survival' && cropInfo) {
      this.spawnCropDrops(x, y, z, cropInfo, false, fortune);
    }
  }

  spawnCropDrops(x, y, z, cropInfo, isRightClickHarvest = false, fortune = 0) {
    const pos = new THREE.Vector3(x + 0.5, y + 0.3, z + 0.5);
    for (const { id, count } of cropDrops(cropInfo, { isRightClickHarvest, fortune })) {
      for (let i = 0; i < count; i++) this.game?.entities?.spawnDroppedItem?.(pos.clone(), id, false, 1);
    }
  }

  // --- 6. Farmland Trampling ---
  checkTrample(player, x, y, z, fallDist = 0) {
    if (!this.world) this.world = this.game?.world;
    if (!this.world) return false;

    const blockId = this.world.getVoxel(x, y, z);
    if (blockId !== BLOCKS.FARMLAND && blockId !== BLOCKS.FARMLAND_MOIST) {
      return false;
    }

    // Minecraft wiki: trampling occurs if landing with downward speed or fall distance
    // Only a landing counts, never walking or merely holding jump, and it is a dice roll on the distance
    // fallen: a one-block hop (1.25) tramples 75% of the time, a bare 0.5 never does.
    if (this.random() >= trampleChance(fallDist)) return false;

    // Farmland reverts to dirt
    this.world.setVoxel(x, y, z, BLOCKS.DIRT);
    this.unregisterFarmland(x, y, z);

    // Pop off crop on top if present
    const aboveId = this.world.getVoxel(x, y + 1, z);
    const cropInfo = getCropInfo(aboveId);
    if (cropInfo) {
      this.world.setVoxel(x, y + 1, z, BLOCKS.AIR);
      this.handleCropBreak(x, y + 1, z, aboveId, player?.gamemode || 'survival');
    }

    this.game?.sounds?.playDig?.('gravel');
    this.rebuildBlockChunk(x, z);
    return true;
  }

  // --- 7. Periodic Simulation & Growth Ticks ---
  update(dt, playerPos) {
    if (!this.world) this.world = this.game?.world;
    if (!this.world) return;
    this.netherPlants.world=this.world;
    this.netherPlants.update(dt,playerPos);
    this.chorus.world=this.world;this.chorus.update(dt,playerPos);

    this.tickTimer += dt;
    if (this.tickTimer < this.tickInterval) return;
    this.tickTimer = 0;

    const dirtyChunks = new Set();

    // 7a. Update farmlands: Hydration & Dry reversion
    for (const [key, pos] of this.farmlands.entries()) {
      const current = this.world.getVoxel(pos.x, pos.y, pos.z);
      if (current !== BLOCKS.FARMLAND && current !== BLOCKS.FARMLAND_MOIST) {
        this.farmlands.delete(key);
        continue;
      }

      // Wiki (Farmland): it reverts to dirt when "a solid block covers the top surface". Crops and other
      // non-solid plants do not count.
      const cover = this.world.getVoxel(pos.x, pos.y + 1, pos.z);
      const coverDef = BLOCK_DEFS[cover];
      if (cover !== BLOCKS.AIR && cover != null && coverDef && coverDef.solid !== false) {
        this.world.setVoxel(pos.x, pos.y, pos.z, BLOCKS.DIRT);
        this.farmlands.delete(key);
        dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
        continue;
      }

      const hydrated = isWaterNearby(this.world, pos.x, pos.y, pos.z, this.game);
      if (hydrated && current === BLOCKS.FARMLAND) {
        this.world.setVoxel(pos.x, pos.y, pos.z, BLOCKS.FARMLAND_MOIST);
        dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
      } else if (!hydrated && current === BLOCKS.FARMLAND_MOIST) {
        this.world.setVoxel(pos.x, pos.y, pos.z, BLOCKS.FARMLAND);
        dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
      } else if (!hydrated && current === BLOCKS.FARMLAND) {
        // If unplanted and dry, chance to revert to dirt
        const above = this.world.getVoxel(pos.x, pos.y + 1, pos.z);
        if (above === BLOCKS.AIR && this.random() < 0.08) {
          this.world.setVoxel(pos.x, pos.y, pos.z, BLOCKS.DIRT);
          this.farmlands.delete(key);
          dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
        }
      }
    }

    // 7b. Update crops: Growth progression
    for (const [key, pos] of this.crops.entries()) {
      const blockId = this.world.getVoxel(pos.x, pos.y, pos.z);
      const cropInfo = getCropInfo(blockId);
      if (!cropInfo) {
        this.crops.delete(key);
        continue;
      }

      // Check soil
      const soil = this.world.getVoxel(pos.x, pos.y - 1, pos.z);
      if (soil !== BLOCKS.FARMLAND && soil !== BLOCKS.FARMLAND_MOIST) {
        // Pop off if soil is gone
        this.world.setVoxel(pos.x, pos.y, pos.z, BLOCKS.AIR);
        this.handleCropBreak(pos.x, pos.y, pos.z, blockId, 'survival');
        this.crops.delete(key);
        dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
        continue;
      }

      if (cropInfo.isMature) continue;

      // Wiki (Wheat): "a light level of at least 9 to grow".
      if (this.lightAt(pos.x, pos.y, pos.z) < MIN_CROP_LIGHT) continue;

      // Minecraft wiki growth probability:
      // Moist farmland accelerates crop growth dramatically (~2.5x to 3x faster than dry)
      const isMoist = soil === BLOCKS.FARMLAND_MOIST;
      const growthChance = isMoist ? 0.35 : 0.12;

      if (this.random() < growthChance) {
        const nextStage = cropInfo.stage + 1;
        const nextBlock = cropStageBlock(cropInfo.type, nextStage);
        this.world.setVoxel(pos.x, pos.y, pos.z, nextBlock);
        dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
      }
    }

    // Rebuild any modified chunks
    for (const chunkKey of dirtyChunks) {
      const [cx, cz] = chunkKey.split(',').map(Number);
      const chunk = this.world.getChunk(cx, cz);
      if (chunk && this.game?.rebuildChunkMesh) {
        this.game.rebuildChunkMesh(chunk);
      }
    }
  }

  /** Light at a crop. An unknown or unlit-engine answer counts as bright, so a bare test world still grows. */
  lightAt(x, y, z) {
    try {
      const v = this.world?.getLightLevel?.(x, y, z, this.game?.skyDarken ?? 0);
      return Number.isFinite(v) ? v : 15;
    } catch {
      return 15;
    }
  }

  rebuildBlockChunk(x, z) {
    if (!this.world) return;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const chunk = this.world.getChunk(cx, cz);
    if (chunk && this.game?.rebuildChunkMesh) {
      this.game.rebuildChunkMesh(chunk);
    }
  }
}

/**
 * What a crop gives, as [{id, count}]. Wiki (Fortune, "Seeds"): carrots, potatoes and the seeds of wheat and beetroot
 * "use a binomial distribution. Fortune increases the number of tests for the distribution ... by 1 per level":
 * the extra rolls are 3 + level at 4/7 each, on top of the fixed part (two carrots or potatoes, one seed).
 */
export function cropDrops(cropInfo, { isRightClickHarvest = false, fortune = 0, random = Math.random } = {}) {
  const out = [];
  const spawnItem = (id, count) => { if (count > 0) out.push({ id, count }); };
  const binomial = (trials, chance) => { let n = 0; for (let i = 0; i < trials; i++) if (random() < chance) n++; return n; };
  {

    // Driven by the crop's own drop table rather than a branch per crop, so adding a crop means adding a row
    // rather than a fourth `else if` here and a fifth in the immature block below.
    if (cropInfo.isMature) {
      const mature = cropInfo.dropMature;
      if (!mature) return;
      const rolled = (mature.max !== undefined
        ? mature.min + Math.floor(random() * (mature.max - mature.min + 1))
        : 1) + (mature.extraTrials ? binomial(mature.extraTrials + fortune, mature.extraChance) : 0);
      // A right-click harvest replants one, which vanilla takes out of the yield rather than adding to it.
      const count = isRightClickHarvest ? Math.max(mature.item === 'wheat' ? 1 : 1, rolled - 1) : rolled;
      spawnItem(mature.item, count);
      if (mature.seed) {
        let seedRoll = mature.minSeeds + Math.floor(random() * (mature.maxSeeds - mature.minSeeds + 1));
        if (mature.seedExtraTrials) seedRoll = mature.minSeeds + binomial(mature.seedExtraTrials + fortune, mature.seedExtraChance);
        const seeds = isRightClickHarvest ? Math.max(0, seedRoll - 1) : seedRoll;
        if (seeds > 0) spawnItem(mature.seed, seeds);
      }
      if (mature.poisonChance && random() < mature.poisonChance) spawnItem('poisonous_potato', 1);
    } else {
      // An immature crop yields only its seed -- and for beetroot, ONLY the seed: a beetroot comes off a
      // mature plant alone, which is the rule that separates it from carrots and potatoes.
      const immature = cropInfo.dropImmature;
      if (immature) spawnItem(immature.item, immature.count ?? 1);
    }
  }
  return out;
}
