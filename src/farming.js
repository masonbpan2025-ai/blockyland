import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';

// Tillable ground blocks in Minecraft
export const TILLABLE_BLOCKS = new Set([
  BLOCKS.GRASS,
  BLOCKS.DIRT,
  BLOCKS.PODZOL,
  BLOCKS.MYCELIUM,
  BLOCKS.MOSS_BLOCK
]);

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
  return null;
}

// Check if block is a crop and retrieve its metadata
export function getCropInfo(blockId) {
  // Wheat: 164..171 (stages 0..7)
  if (blockId >= BLOCKS.WHEAT_STAGE_0 && blockId <= BLOCKS.WHEAT_STAGE_7) {
    const stage = blockId - BLOCKS.WHEAT_STAGE_0;
    return {
      type: 'wheat',
      stage,
      maxStage: 7,
      isMature: stage === 7,
      baseBlock: BLOCKS.WHEAT_STAGE_0,
      dropMature: { item: 'wheat', min: 1, max: 1, seed: 'wheat_seeds', minSeeds: 1, maxSeeds: 3 },
      dropImmature: { item: 'wheat_seeds', count: 1 }
    };
  }
  // Carrots: 172..175 (stages 0..3)
  if (blockId >= BLOCKS.CARROTS_STAGE_0 && blockId <= BLOCKS.CARROTS_STAGE_3) {
    const stage = blockId - BLOCKS.CARROTS_STAGE_0;
    return {
      type: 'carrots',
      stage,
      maxStage: 3,
      isMature: stage === 3,
      baseBlock: BLOCKS.CARROTS_STAGE_0,
      dropMature: { item: 'carrot', min: 2, max: 5 },
      dropImmature: { item: 'carrot', count: 1 }
    };
  }
  // Potatoes: 176..179 (stages 0..3)
  if (blockId >= BLOCKS.POTATOES_STAGE_0 && blockId <= BLOCKS.POTATOES_STAGE_3) {
    const stage = blockId - BLOCKS.POTATOES_STAGE_0;
    return {
      type: 'potatoes',
      stage,
      maxStage: 3,
      isMature: stage === 3,
      baseBlock: BLOCKS.POTATOES_STAGE_0,
      dropMature: { item: 'potato', min: 2, max: 5, poisonChance: 0.02 },
      dropImmature: { item: 'potato', count: 1 }
    };
  }
  return null;
}

// Minecraft wiki: water hydrates farmland within horizontal Chebyshev distance of 4 (dx, dz in [-4, 4])
// and dy in [0, 1] (same level or 1 above).
export function isWaterNearby(world, x, y, z) {
  if (!world) return false;
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

export class FarmingManager {
  constructor(game) {
    this.game = game;
    this.world = game?.world || null;
    this.tickTimer = 0;
    this.tickInterval = 1.0; // checks growth and hydration periodically

    // Active crop and farmland tracking for fast O(N) tick updates
    this.crops = new Map(); // key "x,y,z" -> { x, y, z }
    this.farmlands = new Map(); // key "x,y,z" -> { x, y, z }
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
    const hydrated = isWaterNearby(this.world, x, y, z);
    const newFarmland = hydrated ? BLOCKS.FARMLAND_MOIST : BLOCKS.FARMLAND;

    this.world.setVoxel(x, y, z, newFarmland);
    this.registerFarmland(x, y, z);

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
      if (cropInfo.type === 'wheat') {
        // Minecraft wiki: wheat advances by random 2-5 stages
        advance = 2 + Math.floor(Math.random() * 4);
      } else {
        // Carrots & potatoes advance by random 1-3 stages
        advance = 1 + Math.floor(Math.random() * 3);
      }

      const nextStage = Math.min(cropInfo.maxStage, cropInfo.stage + advance);
      const newBlockId = cropInfo.baseBlock + nextStage;

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
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if ((dx === 0 && dz === 0) || Math.random() < 0.45) {
            const gx = x + dx;
            const gz = z + dz;
            const gy = y;
            if (this.world.getVoxel(gx, gy, gz) === BLOCKS.GRASS && this.world.getVoxel(gx, gy + 1, gz) === BLOCKS.AIR) {
              const flowerRoll = Math.random();
              const flowerBlock = flowerRoll < 0.5 ? BLOCKS.DANDELION : BLOCKS.POPPY;
              this.world.setVoxel(gx, gy + 1, gz, flowerBlock);
              createdAny = true;
            }
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
  handleCropBreak(x, y, z, blockId, gamemode) {
    const cropInfo = getCropInfo(blockId);
    this.unregisterCrop(x, y, z);

    if (gamemode === 'survival' && cropInfo) {
      this.spawnCropDrops(x, y, z, cropInfo, false);
    }
  }

  spawnCropDrops(x, y, z, cropInfo, isRightClickHarvest = false) {
    const pos = new THREE.Vector3(x + 0.5, y + 0.3, z + 0.5);
    const spawnItem = (id, count) => {
      for (let i = 0; i < count; i++) {
        this.game?.entities?.spawnDroppedItem?.(pos.clone(), id, false, 1);
      }
    };

    if (cropInfo.isMature) {
      if (cropInfo.type === 'wheat') {
        spawnItem('wheat', 1);
        // Seeds drop 1-3 (if right-click harvested, 1 is replanted so drop 0-2 or 1-3)
        const seedCount = 1 + Math.floor(Math.random() * 3);
        const seedsToDrop = isRightClickHarvest ? Math.max(0, seedCount - 1) : seedCount;
        if (seedsToDrop > 0) spawnItem('wheat_seeds', seedsToDrop);
      } else if (cropInfo.type === 'carrots') {
        const carrotCount = 2 + Math.floor(Math.random() * 4); // 2 to 5 carrots
        const dropCount = isRightClickHarvest ? Math.max(1, carrotCount - 1) : carrotCount;
        spawnItem('carrot', dropCount);
      } else if (cropInfo.type === 'potatoes') {
        const potatoCount = 2 + Math.floor(Math.random() * 4); // 2 to 5 potatoes
        const dropCount = isRightClickHarvest ? Math.max(1, potatoCount - 1) : potatoCount;
        spawnItem('potato', dropCount);
        if (Math.random() < 0.02) {
          spawnItem('poisonous_potato', 1);
        }
      }
    } else {
      // Immature crop yields only 1 seed/crop
      if (cropInfo.type === 'wheat') {
        spawnItem('wheat_seeds', 1);
      } else if (cropInfo.type === 'carrots') {
        spawnItem('carrot', 1);
      } else if (cropInfo.type === 'potatoes') {
        spawnItem('potato', 1);
      }
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
    const isFalling = (fallDist > 0.45) || (player?.velocity?.y < -2.2) || (player?.keys && player.keys['Space']);
    if (!isFalling) return false;

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

      const hydrated = isWaterNearby(this.world, pos.x, pos.y, pos.z);
      if (hydrated && current === BLOCKS.FARMLAND) {
        this.world.setVoxel(pos.x, pos.y, pos.z, BLOCKS.FARMLAND_MOIST);
        dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
      } else if (!hydrated && current === BLOCKS.FARMLAND_MOIST) {
        this.world.setVoxel(pos.x, pos.y, pos.z, BLOCKS.FARMLAND);
        dirtyChunks.add(`${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}`);
      } else if (!hydrated && current === BLOCKS.FARMLAND) {
        // If unplanted and dry, chance to revert to dirt
        const above = this.world.getVoxel(pos.x, pos.y + 1, pos.z);
        if (above === BLOCKS.AIR && Math.random() < 0.08) {
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

      // Minecraft wiki growth probability:
      // Moist farmland accelerates crop growth dramatically (~2.5x to 3x faster than dry)
      const isMoist = soil === BLOCKS.FARMLAND_MOIST;
      const growthChance = isMoist ? 0.35 : 0.12;

      if (Math.random() < growthChance) {
        const nextStage = cropInfo.stage + 1;
        const nextBlock = cropInfo.baseBlock + nextStage;
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
