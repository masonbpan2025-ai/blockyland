import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { EXTRA_ITEMS } from './extraItems.js';
import { netherPlantSupport } from './netherPlants.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };

export const VISUAL_POLICIES = {
  CUBE: 'cube',
  PARTIAL: 'partial',
  CUTOUT_PLANT: 'cutout_plant',
  THIN_MODEL: 'thin_model',
  CONTAINER: 'container',
  FLUID: 'fluid',
  WEARABLE: 'wearable',
  SPRITE: 'sprite',
  ENTITY: 'entity',
};

/**
 * Checks whether a block below can support a plant/flower.
 */
export function canSupportPlant(belowBlockId, plantBlockId) {
  const netherSupport=netherPlantSupport(belowBlockId,plantBlockId);
  if(netherSupport!==null)return netherSupport;
  if (belowBlockId === undefined || belowBlockId === null || belowBlockId === BLOCKS.AIR) return false;
  const def = BLOCK_DEFS[belowBlockId];
  if (!def || def.solid === false || def.plant) return false;
  if (plantBlockId === BLOCKS.WITHER_ROSE) {
    if (belowBlockId === BLOCKS.NETHERRACK || belowBlockId === BLOCKS.SOUL_SAND || belowBlockId === BLOCKS.SOUL_SOIL) return true;
  }
  return belowBlockId === BLOCKS.GRASS ||
    belowBlockId === BLOCKS.DIRT ||
    belowBlockId === BLOCKS.COARSE_DIRT ||
    belowBlockId === BLOCKS.PODZOL ||
    belowBlockId === BLOCKS.FARMLAND ||
    belowBlockId === BLOCKS.FARMLAND_MOIST ||
    belowBlockId === BLOCKS.MOSS_BLOCK ||
    Boolean(def.soil) ||
    (typeof def.name === 'string' && (def.name.toLowerCase().includes('dirt') || def.name.toLowerCase().includes('mud')));
}

/**
 * Resolves any item ID, numeric block ID, or resource definition to its canonical visual policies
 * across all four visual contexts: placed, held, dropped, and inventory.
 */
export function resolveVisualPolicy(resourceOrId, isBlockHint = undefined) {
  let id = resourceOrId?.id ?? resourceOrId;
  let isBlock = isBlockHint ?? resourceOrId?.isBlock;

  let numericId = typeof id === 'number' ? id : (BLOCKS[String(id).toUpperCase()] ?? null);
  if (numericId === null && typeof id === 'string') {
    if (id === 'chest') numericId = BLOCKS.CHEST;
    else if (id === 'oak_door') numericId = BLOCKS.OAK_DOOR;
    else if (id === 'iron_door') numericId = BLOCKS.IRON_DOOR;
    else if (ALL_ITEMS[id]?.blockId !== undefined) numericId = ALL_ITEMS[id].blockId;
  }

  const blockDef = numericId !== null ? BLOCK_DEFS[numericId] : (BLOCK_DEFS[id] ?? null);
  const itemDef = typeof id === 'string' ? ALL_ITEMS[id] : Object.values(ALL_ITEMS).find(it => it.blockId === numericId);

  if (isBlock === undefined) {
    isBlock = Boolean(blockDef || itemDef?.isBlock);
  }

  // 1. Fluid
  if (numericId === BLOCKS.WATER || numericId === BLOCKS.LAVA || id === 'water' || id === 'lava' || blockDef?.liquid) {
    return {
      policy: VISUAL_POLICIES.FLUID,
      isBlock: true,
      blockId: numericId,
      blockDef,
      itemDef,
      held: 'fluid_cube',
      dropped: 'fluid_cube',
      placed: 'fluid',
      inventory: 'icon',
      textureUrl: blockDef?.textures?.all ? `/assets/blocks/${blockDef.textures.all}` : null,
    };
  }

  // 2. Cutout Plants (Flowers, saplings, crops, mushrooms, tall grass, vines, etc.)
  const isPlant = Boolean(
    blockDef?.plant ||
    blockDef?.crop ||
    blockDef?.waterPlant ||
    blockDef?.hang ||
    (typeof id === 'string' && /flower|tulip|orchid|daisy|dandelion|poppy|allium|bluet|lily|rose|peony|lilac|sunflower|sapling|mushroom|fungus|bush|grass|fern|roots|sprouts|propagule|eyeblossom/.test(id))
  );

  if (isPlant && (blockDef || isBlock)) {
    const texName = blockDef?.textures?.all || blockDef?.textures?.side || blockDef?.textures?.top || `${id}.png`;
    const textureUrl = blockDef?.textures?.all
      ? `/assets/blocks/${blockDef.textures.all}`
      : (itemDef?.icon || `/assets/blocks/${texName}`);

    return {
      policy: VISUAL_POLICIES.CUTOUT_PLANT,
      isBlock: true,
      blockId: numericId,
      blockDef,
      itemDef,
      // In Java Edition, a held flower/plant is held as a flat 2D item sprite with transparent alpha
      held: 'sprite',
      dropped: 'cross_quad',
      placed: 'cross_quad',
      inventory: 'icon',
      textureUrl,
      iconUrl: itemDef?.icon || textureUrl,
      isPlant: true,
      transparent: true,
    };
  }

  // 3. Thin models (torches, lanterns, chains, rods, rails, panes, carpets, heads)
  if (blockDef && (blockDef.shape === 'torch' || blockDef.candle || blockDef.chain || blockDef.rod || blockDef.rail || blockDef.pane || blockDef.carpet || blockDef.head || blockDef.flowerPot)) {
    return {
      policy: VISUAL_POLICIES.THIN_MODEL,
      isBlock: true,
      blockId: numericId,
      blockDef,
      itemDef,
      held: 'partial_model',
      dropped: 'partial_model',
      placed: 'partial_model',
      inventory: 'icon',
      textureUrl: blockDef.textures?.all ? `/assets/blocks/${blockDef.textures.all}` : null,
    };
  }

  // 4. Containers (chests, barrels, etc.)
  if (blockDef && (blockDef.chest || numericId === BLOCKS.CHEST || id === 'chest' || id === 'barrel')) {
    return {
      policy: VISUAL_POLICIES.CONTAINER,
      isBlock: true,
      blockId: numericId,
      blockDef,
      itemDef,
      held: 'partial_model',
      dropped: 'partial_model',
      placed: 'container_model',
      inventory: 'icon',
    };
  }

  // 5. Partial structural shapes (slabs, stairs, fences, gates, walls, doors, trapdoors, beds)
  if (blockDef && (blockDef.slab || blockDef.stair || blockDef.fence || blockDef.fenceGate || blockDef.wall || blockDef.door || blockDef.trapdoor || blockDef.bed || blockDef.sign || blockDef.wallSign || blockDef.hangingSign || blockDef.banner)) {
    return {
      policy: VISUAL_POLICIES.PARTIAL,
      isBlock: true,
      blockId: numericId,
      blockDef,
      itemDef,
      held: 'partial_model',
      dropped: 'partial_model',
      placed: 'partial_model',
      inventory: 'icon',
    };
  }

  // 6. Generic blocks (Cube or transparent cube like glass)
  if (blockDef || isBlock) {
    const isTransp = Boolean(blockDef?.transparent);
    return {
      policy: VISUAL_POLICIES.CUBE,
      isBlock: true,
      blockId: numericId,
      blockDef,
      itemDef,
      held: 'cube',
      dropped: 'cube',
      placed: 'cube',
      inventory: 'icon',
      transparent: isTransp,
    };
  }

  // 7. Non-block Items: Wearables
  if (itemDef?.armorSlot || itemDef?.type === 'armor' || (typeof id === 'string' && /helmet|chestplate|leggings|boots|elytra/.test(id))) {
    return {
      policy: VISUAL_POLICIES.WEARABLE,
      isBlock: false,
      blockId: null,
      blockDef: null,
      itemDef,
      held: 'sprite',
      dropped: 'sprite',
      placed: 'equipment',
      inventory: 'icon',
      iconUrl: itemDef?.icon || `/assets/items/${id}.png`,
    };
  }

  // 8. Non-block Items: Entities (minecart, boat, spawn eggs)
  if (typeof id === 'string' && (id.endsWith('_spawn_egg') || id.includes('minecart') || id.includes('boat') || id.includes('raft'))) {
    return {
      policy: VISUAL_POLICIES.ENTITY,
      isBlock: false,
      blockId: null,
      blockDef: null,
      itemDef,
      held: 'sprite',
      dropped: 'sprite',
      placed: 'entity',
      inventory: 'icon',
      iconUrl: itemDef?.icon || `/assets/items/${id}.png`,
    };
  }

  // 9. Standard 2D Items (tools, weapons, food, materials)
  return {
    policy: VISUAL_POLICIES.SPRITE,
    isBlock: false,
    blockId: null,
    blockDef: null,
    itemDef,
    held: 'sprite',
    dropped: 'sprite',
    placed: null,
    inventory: 'icon',
    iconUrl: itemDef?.icon || `/assets/items/${id}.png`,
  };
}
