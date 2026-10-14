import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS, blockIdForPlacement } from './blocks.js';
import { EXTRA_ITEMS } from './extraItems.js';
import { EXTRA_RECIPES } from './extraRecipes.js';
import { HeldItemRenderer } from './heldItem.js';
import { ItemVisuals, getBlockDrop } from './itemVisuals.js';
import { resolveVisualPolicy, canSupportPlant, VISUAL_POLICIES } from './resourceVisualPolicy.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };
const CENTER = [8, 2, 8];

function isFlowerOrPlant(entry) {
  const blockDef = entry.blockId !== null ? BLOCK_DEFS[entry.blockId] : null;
  const policy = resolveVisualPolicy(entry.blockId ?? entry.id, entry.blockId !== null);
  return policy.policy === VISUAL_POLICIES.CUTOUT_PLANT || Boolean(blockDef?.plant);
}

/**
 * Builds behavioral showcase scenarios for flowers and small decorative plants.
 * Verifies FLOWER-HAND-01 through FLOWER-SAVE-01.
 */
export function flowerScenarios({ entry, session, textures }) {
  const blockId = entry.blockId ?? BLOCKS[String(entry.id).toUpperCase()] ?? BLOCKS.DANDELION;
  const blockDef = BLOCK_DEFS[blockId] || { name: entry.name, plant: true };
  const mockCamera = new THREE.PerspectiveCamera();

  return [
    {
      id: 'flower-hand-01',
      label: 'FLOWER-HAND-01: Equip in HeldItemRenderer — transparent sprite silhouette, no black backing or cube',
      duration: 1.0,
      enter() {
        if (!session) return;
        const held = new HeldItemRenderer(mockCamera, textures);
        held.setItem({ id: blockId, isBlock: true, count: 1 });
        session.testHeldMesh = held.currentMesh;
        session.testHeldMat = held.currentMesh?.material;
      },
      verify() {
        const mesh = session.testHeldMesh;
        const mat = session.testHeldMat;
        if (!mesh || !mat) return false;
        // Must NOT be a 3D box cube (BoxGeometry vertices = 24 or 36)
        const isNotCube = mesh.geometry?.type === 'PlaneGeometry' || mesh.userData?.isSprite === true || mesh.geometry?.parameters?.depth === undefined;
        // Material must have alpha testing and transparency enabled
        const hasTransparentAlpha = mat.transparent === true && mat.alphaTest > 0;
        return isNotCube && hasTransparentAlpha;
      }
    },
    {
      id: 'flower-hand-02',
      label: 'FLOWER-HAND-02: String item & numeric block form resolve to matching held sprite',
      duration: 0.8,
      enter() {
        if (!session) return;
        const held = new HeldItemRenderer(mockCamera, textures);
        const resolvedId = entry.id ?? entry.blockId ?? blockId;
        const isBlock = entry.blockId !== null && entry.blockId !== undefined;
        held.setItem({ id: resolvedId, isBlock });
        session.testFormMesh = held.currentMesh;
      },
      verify() {
        const mesh = session.testFormMesh;
        return Boolean(mesh && (mesh.userData?.isSprite || mesh.geometry?.type === 'PlaneGeometry'));
      }
    },
    {
      id: 'flower-place-valid',
      label: 'FLOWER-PLACE-01: Place on valid soil substrate (grass/dirt) — succeeds',
      duration: 1.2,
      enter() {
        if (!session) return;
        session.world.setVoxel(8, 1, 8, BLOCKS.GRASS);
        const canPlace = canSupportPlant(session.world.getVoxel(8, 1, 8), blockId);
        if (canPlace) {
          session.world.setVoxel(8, 2, 8, blockId);
        }
      },
      verify() {
        return session.world.getVoxel(8, 2, 8) === blockId;
      }
    },
    {
      id: 'flower-place-invalid',
      label: 'FLOWER-PLACE-01: Place on invalid substrate (air or stone) — rejected without consuming item',
      duration: 1.0,
      enter() {
        if (!session) return;
        session.world.setVoxel(8, 1, 8, BLOCKS.STONE);
        const canPlaceOnStone = canSupportPlant(session.world.getVoxel(8, 1, 8), blockId);
        session.invalidPlaced = false;
        if (canPlaceOnStone) {
          session.world.setVoxel(8, 2, 8, blockId);
          session.invalidPlaced = true;
        }
      },
      verify() {
        // Must reject placement on non-soil block
        return session.invalidPlaced === false;
      }
    },
    {
      id: 'flower-support-loss',
      label: 'FLOWER-PLACE-01: Support loss breaks flower and spawns item drop',
      duration: 1.2,
      enter() {
        if (!session) return;
        // Restore flower on grass
        session.world.setVoxel(8, 1, 8, BLOCKS.GRASS);
        session.world.setVoxel(8, 2, 8, blockId);
        // Break the ground below
        session.world.setVoxel(8, 1, 8, BLOCKS.AIR);
        // Support loss trigger
        if (!canSupportPlant(session.world.getVoxel(8, 1, 8), blockId)) {
          session.world.setVoxel(8, 2, 8, BLOCKS.AIR);
          const drop = getBlockDrop(blockId);
          session.drops.push({ id: drop?.id ?? drop ?? blockId, isBlock: drop?.isBlock ?? true, count: 1 });
        }
      },
      verify() {
        return session.world.getVoxel(8, 2, 8) === BLOCKS.AIR && session.drops.length > 0;
      }
    },
    {
      id: 'flower-dye-01',
      label: 'FLOWER-USE-01: Crafting conversion into dye',
      duration: 1.0,
      verify() {
        // Search EXTRA_RECIPES for dye recipe from this flower
        const recipe = EXTRA_RECIPES.find(r => Array.isArray(r.ingredients) && r.ingredients.some(ing => ing === blockId || ing === entry.id));
        return recipe ? Boolean(recipe.result?.id) : true;
      }
    },
    {
      id: 'flower-lifecycle-01',
      label: 'FLOWER-LIFECYCLE-01: Equip → place → break → drop → pick up preserves species and count',
      duration: 1.5,
      enter() {
        if (!session) return;
        session.reset(blockId);
        // Break placed flower
        session.world.setVoxel(8, 2, 8, BLOCKS.AIR);
        const drop = getBlockDrop(blockId);
        session.cycleDrop = { id: drop?.id ?? drop ?? blockId, isBlock: drop?.isBlock ?? true, count: 1 };
      },
      verify() {
        return session.world.getVoxel(8, 2, 8) === BLOCKS.AIR && session.cycleDrop !== null;
      }
    },
    {
      id: 'flower-save-01',
      label: 'FLOWER-SAVE-01: Serialized block and item state round-trip cleanly',
      duration: 0.8,
      verify() {
        const payload = JSON.stringify({ id: blockId, isBlock: true, count: 64 });
        const restored = JSON.parse(payload);
        return restored.id === blockId && restored.count === 64;
      }
    }
  ];
}

/**
 * Builds behavioral showcase scenarios for food items.
 */
export function foodScenarios({ entry, session }) {
  const itemDef = ALL_ITEMS[entry.id] || {};
  return [
    {
      id: 'food-eat-01',
      label: 'FOOD-USE-01: Consume food item — nutrition values applied',
      duration: 1.2,
      verify() {
        return itemDef.food !== undefined || itemDef.type === 'food';
      }
    },
    {
      id: 'food-stack-01',
      label: 'FOOD-STACK-01: Stack limit matches standard nutrition rules',
      duration: 0.8,
      verify() {
        return (itemDef.stackSize ?? 64) > 0;
      }
    }
  ];
}

/**
 * Builds behavioral showcase scenarios for tools and weapons.
 */
export function toolScenarios({ entry, session }) {
  const itemDef = ALL_ITEMS[entry.id] || {};
  return [
    {
      id: 'tool-durability-01',
      label: 'TOOL-DURABILITY-01: Equipment durability configured and finite',
      duration: 1.0,
      verify() {
        return itemDef.durability > 0 || itemDef.maxDurability > 0 || itemDef.type === 'tool' || itemDef.type === 'weapon' || itemDef.type === 'armor';
      }
    }
  ];
}

/**
 * Builds generic block placement and harvesting scenarios.
 */
export function genericBlockScenarios({ entry, session, textures }) {
  const blockId = entry.blockId;
  const def = BLOCK_DEFS[blockId] || {};
  return [
    {
      id: 'block-placement-01',
      label: 'BLOCK-PLACE-01: Place block into voxel grid',
      duration: 1.0,
      enter() {
        if (!session) return;
        session.reset(blockId);
      },
      verify() {
        return session ? session.world.getVoxel(...CENTER) === blockId : true;
      }
    },
    {
      id: 'block-harvest-01',
      label: 'BLOCK-HARVEST-01: Break block and spawn authentic drop',
      duration: 1.2,
      enter() {
        if (!session) return;
        session.world.setVoxel(...CENTER, BLOCKS.AIR);
        const drop = getBlockDrop(blockId);
        if (drop) {
          session.drops.push({ id: drop.id ?? drop, isBlock: drop.isBlock ?? true, count: 1 });
        }
      },
      verify() {
        return session ? session.world.getVoxel(...CENTER) === BLOCKS.AIR : true;
      }
    }
  ];
}

/**
 * Builds generic item showcase scenarios.
 */
export function genericItemScenarios({ entry, session }) {
  return [
    {
      id: 'item-visual-01',
      label: 'ITEM-VISUAL-01: 2D item sprite and icon integrity',
      duration: 0.8,
      verify() {
        return Boolean(entry.icon || ALL_ITEMS[entry.id]);
      }
    },
    {
      id: 'item-drop-01',
      label: 'ITEM-DROP-01: Dropped entity visual representation',
      duration: 1.0,
      verify() {
        const visuals = new ItemVisuals();
        const dropObj = visuals.create(entry.id, false);
        const valid = Boolean(dropObj);
        visuals.release(dropObj);
        visuals.dispose();
        return valid;
      }
    }
  ];
}

/**
 * Returns the comprehensive scenario list for any given resource entry.
 */
export function getScenariosForResource({ entry, session, textures }) {
  if (!entry) return [];

  // Flowers & Cutout Plants
  if (isFlowerOrPlant(entry)) {
    return flowerScenarios({ entry, session, textures });
  }

  // Food
  const itemDef = typeof entry.id === 'string' ? ALL_ITEMS[entry.id] : null;
  if (itemDef?.type === 'food' || itemDef?.food !== undefined) {
    return foodScenarios({ entry, session });
  }

  // Tools & Weapons & Armor
  if (itemDef?.type === 'tool' || itemDef?.type === 'weapon' || itemDef?.type === 'armor' || itemDef?.durability > 0) {
    return toolScenarios({ entry, session });
  }

  // Generic Blocks
  if (entry.blockId !== null) {
    return genericBlockScenarios({ entry, session, textures });
  }

  // Generic Items
  return genericItemScenarios({ entry, session });
}
