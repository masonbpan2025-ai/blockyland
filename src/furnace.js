import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';

// Cook time per item in seconds (Minecraft default is 10s)
export const COOK_DURATION = 10.0;

// Smelting Recipes mapping input ID (item string or block ID) to output object
export const SMELTING_RECIPES = {
  // --- Raw Foods ---
  beef: { id: 'cooked_beef', isBlock: false, count: 1 },
  raw_beef: { id: 'cooked_beef', isBlock: false, count: 1 },
  porkchop: { id: 'cooked_porkchop', isBlock: false, count: 1 },
  raw_porkchop: { id: 'cooked_porkchop', isBlock: false, count: 1 },
  chicken: { id: 'cooked_chicken', isBlock: false, count: 1 },
  raw_chicken: { id: 'cooked_chicken', isBlock: false, count: 1 },
  mutton: { id: 'cooked_mutton', isBlock: false, count: 1 },
  raw_mutton: { id: 'cooked_mutton', isBlock: false, count: 1 },
  rabbit: { id: 'cooked_rabbit', isBlock: false, count: 1 },
  raw_rabbit: { id: 'cooked_rabbit', isBlock: false, count: 1 },
  salmon: { id: 'cooked_salmon', isBlock: false, count: 1 },
  raw_salmon: { id: 'cooked_salmon', isBlock: false, count: 1 },
  cod: { id: 'cooked_cod', isBlock: false, count: 1 },
  raw_cod: { id: 'cooked_cod', isBlock: false, count: 1 },
  potato: { id: 'baked_potato', isBlock: false, count: 1 },
  kelp: { id: 'dried_kelp', isBlock: false, count: 1 },

  // --- Raw Metals & Ores ---
  raw_iron: { id: 'iron_ingot', isBlock: false, count: 1 },
  raw_gold: { id: 'gold_ingot', isBlock: false, count: 1 },
  raw_copper: { id: 'copper_ingot', isBlock: false, count: 1 },
  clay_ball: { id: 'brick', isBlock: false, count: 1 },

  // Block Ores & Natural Blocks
  [BLOCKS.IRON_ORE]: { id: 'iron_ingot', isBlock: false, count: 1 },
  [BLOCKS.DEEPSLATE_IRON_ORE]: { id: 'iron_ingot', isBlock: false, count: 1 },
  [BLOCKS.GOLD_ORE]: { id: 'gold_ingot', isBlock: false, count: 1 },
  [BLOCKS.DEEPSLATE_GOLD_ORE]: { id: 'gold_ingot', isBlock: false, count: 1 },
  [BLOCKS.NETHER_GOLD_ORE]: { id: 'gold_ingot', isBlock: false, count: 1 },
  [BLOCKS.COPPER_ORE]: { id: 'copper_ingot', isBlock: false, count: 1 },
  [BLOCKS.DEEPSLATE_COPPER_ORE]: { id: 'copper_ingot', isBlock: false, count: 1 },

  [BLOCKS.COBBLESTONE]: { id: BLOCKS.STONE, isBlock: true, count: 1 },
  [BLOCKS.COBBLED_DEEPSLATE]: { id: BLOCKS.DEEPSLATE, isBlock: true, count: 1 },
  [BLOCKS.STONE]: { id: BLOCKS.SMOOTH_STONE, isBlock: true, count: 1 },
  [BLOCKS.SAND]: { id: BLOCKS.GLASS, isBlock: true, count: 1 },
  [BLOCKS.RED_SAND]: { id: BLOCKS.GLASS, isBlock: true, count: 1 },
  [BLOCKS.CLAY]: { id: BLOCKS.TERRACOTTA, isBlock: true, count: 1 },
  [BLOCKS.NETHERRACK]: { id: 'nether_brick', isBlock: false, count: 1 },
  [BLOCKS.CACTUS]: { id: 'green_dye', isBlock: false, count: 1 },
  [BLOCKS.WET_SPONGE]: { id: BLOCKS.SPONGE, isBlock: true, count: 1 },

  // Logs -> Charcoal
  [BLOCKS.OAK_LOG]: { id: 'charcoal', isBlock: false, count: 1 },
  [BLOCKS.BIRCH_LOG]: { id: 'charcoal', isBlock: false, count: 1 },
  [BLOCKS.SPRUCE_LOG]: { id: 'charcoal', isBlock: false, count: 1 },
  [BLOCKS.JUNGLE_LOG]: { id: 'charcoal', isBlock: false, count: 1 },
  [BLOCKS.ACACIA_LOG]: { id: 'charcoal', isBlock: false, count: 1 },
  [BLOCKS.DARK_OAK_LOG]: { id: 'charcoal', isBlock: false, count: 1 },
  [BLOCKS.MANGROVE_LOG]: { id: 'charcoal', isBlock: false, count: 1 },
  [BLOCKS.CHERRY_LOG]: { id: 'charcoal', isBlock: false, count: 1 }
};

// Fuel burn durations in seconds
export const FUEL_BURN_TIMES = {
  coal: 80.0,
  charcoal: 80.0,
  [BLOCKS.COAL_BLOCK]: 800.0,
  lava_bucket: 1000.0,
  blaze_rod: 120.0,

  // Wood & Planks
  [BLOCKS.OAK_LOG]: 15.0,
  [BLOCKS.BIRCH_LOG]: 15.0,
  [BLOCKS.SPRUCE_LOG]: 15.0,
  [BLOCKS.JUNGLE_LOG]: 15.0,
  [BLOCKS.ACACIA_LOG]: 15.0,
  [BLOCKS.DARK_OAK_LOG]: 15.0,
  [BLOCKS.MANGROVE_LOG]: 15.0,
  [BLOCKS.CHERRY_LOG]: 15.0,

  [BLOCKS.OAK_PLANKS]: 15.0,
  [BLOCKS.BIRCH_PLANKS]: 15.0,
  [BLOCKS.SPRUCE_PLANKS]: 15.0,
  [BLOCKS.JUNGLE_PLANKS]: 15.0,
  [BLOCKS.ACACIA_PLANKS]: 15.0,
  [BLOCKS.DARK_OAK_PLANKS]: 15.0,
  [BLOCKS.MANGROVE_PLANKS]: 15.0,
  [BLOCKS.CHERRY_PLANKS]: 15.0,

  [BLOCKS.CRAFTING_TABLE]: 15.0,
  [BLOCKS.BOOKSHELF]: 15.0,
  [BLOCKS.LADDER]: 15.0,
  [BLOCKS.OAK_SAPLING]: 5.0,

  // Wooden Tools
  wooden_pickaxe: 10.0,
  wooden_axe: 10.0,
  wooden_shovel: 10.0,
  wooden_sword: 10.0,
  wooden_hoe: 10.0,
  oak_boat: 60.0,

  // Small fuels
  stick: 5.0,
  dried_kelp: 2.5
};

export function getSmeltingRecipe(item) {
  if (!item) return null;
  const id = typeof item === 'object' ? item.id : item;
  const recipe = SMELTING_RECIPES[id];
  return recipe ? { ...recipe } : null;
}

export function getFuelBurnTime(item) {
  if (!item) return 0;
  const id = typeof item === 'object' ? item.id : item;
  return FUEL_BURN_TIMES[id] || 0;
}

export class FurnaceManager {
  constructor(game) {
    this.game = game;
    this.furnaces = new Map(); // key `${x},${y},${z}` -> furnaceData
    this.openFurnaceKey = null;
  }

  getKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  getFurnace(x, y, z) {
    return this.furnaces.get(this.getKey(x, y, z)) || null;
  }

  getOrCreateFurnace(x, y, z) {
    const key = this.getKey(x, y, z);
    let furnace = this.furnaces.get(key);
    if (!furnace) {
      furnace = {
        x: Math.floor(x),
        y: Math.floor(y),
        z: Math.floor(z),
        input: null,
        fuel: null,
        output: null,
        burnTime: 0,
        maxBurnTime: 0,
        cookTime: 0,
        cookDuration: COOK_DURATION,
        lit: false,
        pointLight: null
      };
      this.furnaces.set(key, furnace);
    }
    return furnace;
  }

  openFurnaceAt(x, y, z) {
    const furnace = this.getOrCreateFurnace(x, y, z);
    this.openFurnaceKey = this.getKey(x, y, z);
    return furnace;
  }

  getOpenFurnace() {
    if (!this.openFurnaceKey) return null;
    return this.furnaces.get(this.openFurnaceKey) || null;
  }

  closeOpenFurnace() {
    this.openFurnaceKey = null;
  }

  onBlockBroken(x, y, z) {
    const key = this.getKey(x, y, z);
    const furnace = this.furnaces.get(key);
    if (!furnace) return;

    // Remove PointLight if present
    if (furnace.pointLight) {
      this.game.scene.remove(furnace.pointLight);
      furnace.pointLight.dispose?.();
      furnace.pointLight = null;
    }

    // Drop any items contained inside furnace
    const dropItem = (item) => {
      if (item && item.count > 0) {
        this.game.entities.spawnDroppedItem(
          new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
          item.id,
          item.isBlock,
          item.count
        );
      }
    };

    dropItem(furnace.input);
    dropItem(furnace.fuel);
    dropItem(furnace.output);

    this.furnaces.delete(key);
    if (this.openFurnaceKey === key) {
      this.closeOpenFurnace();
      this.game.ui.closeFurnaceModal();
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.2);
    let updatedActiveGui = false;

    for (const [key, furnace] of this.furnaces.entries()) {
      const { x, y, z } = furnace;

      // 1. Progress active burn time
      if (furnace.burnTime > 0) {
        furnace.burnTime = Math.max(0, furnace.burnTime - dt);
      }

      // 2. Cooking check
      const recipe = getSmeltingRecipe(furnace.input);
      const canOutput = recipe && (
        !furnace.output ||
        (furnace.output.id === recipe.id &&
          furnace.output.isBlock === recipe.isBlock &&
          furnace.output.count + recipe.count <= 64)
      );

      if (recipe && canOutput) {
        // Need fuel burn time
        if (furnace.burnTime <= 0) {
          const fuelTime = getFuelBurnTime(furnace.fuel);
          if (fuelTime > 0) {
            furnace.burnTime = fuelTime;
            furnace.maxBurnTime = fuelTime;

            // Consume 1 fuel
            if (furnace.fuel.id === 'lava_bucket') {
              if (furnace.fuel.count <= 1) {
                furnace.fuel = { id: 'bucket', isBlock: false, count: 1 };
              } else {
                furnace.fuel.count--;
                this.game.inventory.addItem('bucket', false, 1);
              }
            } else {
              furnace.fuel.count--;
              if (furnace.fuel.count <= 0) furnace.fuel = null;
            }
          }
        }

        // Cook if actively burning
        if (furnace.burnTime > 0) {
          furnace.cookTime += dt;
          if (furnace.cookTime >= furnace.cookDuration - 0.0001) {
            furnace.cookTime = Math.max(0, furnace.cookTime - furnace.cookDuration);

            // Decrement input
            furnace.input.count--;
            if (furnace.input.count <= 0) furnace.input = null;

            // Add output
            if (!furnace.output) {
              furnace.output = { ...recipe };
            } else {
              furnace.output.count += recipe.count;
            }

            if (this.game.sounds) this.game.sounds.playPop();
          }
        } else {
          // No fuel active: cook progress resets or slowly decays
          furnace.cookTime = Math.max(0, furnace.cookTime - dt * 2.0);
        }
      } else {
        // Can't cook or no input
        furnace.cookTime = Math.max(0, furnace.cookTime - dt * 2.0);
      }

      // Reset maxBurnTime if burn finishes
      if (furnace.burnTime <= 0) {
        furnace.burnTime = 0;
        furnace.maxBurnTime = 0;
      }

      // 3. Lit state check & world block transformation
      const shouldBeLit = furnace.burnTime > 0;
      if (shouldBeLit !== furnace.lit) {
        furnace.lit = shouldBeLit;
        const currentVoxel = this.game.world.getVoxel(x, y, z);

        if (furnace.lit && currentVoxel === BLOCKS.FURNACE) {
          this.game.world.setVoxel(x, y, z, BLOCKS.LIT_FURNACE);
          this.rebuildBlockChunk(x, z);

          // Add dynamic warm fire PointLight
          if (!furnace.pointLight && this.game.scene) {
            const light = new THREE.PointLight(0xff983d, 1.8, 8);
            light.position.set(x + 0.5, y + 0.5, z + 0.5);
            this.game.scene.add(light);
            furnace.pointLight = light;
          }
        } else if (!furnace.lit && currentVoxel === BLOCKS.LIT_FURNACE) {
          this.game.world.setVoxel(x, y, z, BLOCKS.FURNACE);
          this.rebuildBlockChunk(x, z);

          // Remove PointLight
          if (furnace.pointLight && this.game.scene) {
            this.game.scene.remove(furnace.pointLight);
            furnace.pointLight.dispose?.();
            furnace.pointLight = null;
          }
        }
      }

      // 4. Lit effects (Particles, fire lighting flicker, crackle sound)
      if (furnace.lit) {
        // Spawn sparks and smoke particles around furnace
        if (this.game.entities?.spawnFurnaceParticles) {
          this.game.entities.spawnFurnaceParticles(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
        }

        // Firelight flicker
        if (furnace.pointLight) {
          furnace.pointLight.intensity = 1.7 + Math.sin(Date.now() * 0.018 + (x * 7 + z * 3)) * 0.3 + (Math.random() - 0.5) * 0.15;
        }

        // Occasional crackle sound if player is nearby
        if (this.game.sounds?.playFurnaceCrackle && Math.random() < 0.02) {
          const pPos = this.game.player?.position;
          if (pPos && pPos.distanceTo(new THREE.Vector3(x, y, z)) < 16) {
            this.game.sounds.playFurnaceCrackle();
          }
        }
      }

      // Check if this is the open furnace in GUI
      if (this.openFurnaceKey === key) {
        updatedActiveGui = true;
      }
    }

    if (updatedActiveGui && this.game.ui?.updateFurnaceProgress) {
      const openFurnace = this.getOpenFurnace();
      if (openFurnace) {
        this.game.ui.updateFurnaceProgress(openFurnace);
      }
    }
  }

  rebuildBlockChunk(x, z) {
    if (!this.game) return;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const chunk = this.game.world?.getChunk(cx, cz);
    if (chunk && typeof this.game.rebuildChunkMesh === 'function') {
      this.game.rebuildChunkMesh(chunk);
    }
  }
}
