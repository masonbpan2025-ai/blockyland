// scripts/build-future-content.mjs
// Generates src/futureContent.js containing all 189 missing blocks and 84 missing items.
import { readFileSync, writeFileSync } from 'node:fs';

const missing = JSON.parse(readFileSync('.cache-missing.json', 'utf8'));

// Starting block ID above the current max (1220).
let currentBlockId = 1225;

const blockIds = {};
const blockDefs = {};
const futureItems = {};

const assignedIds = new Map();

for (const b of missing.blocks) {
  const id = b.id;
  const name = b.name;
  const upperKey = id.startsWith('potted_') ? id.replace('potted_', 'POT_').toUpperCase() : id.toUpperCase();

  let blockId;
  if (assignedIds.has(id)) {
    blockId = assignedIds.get(id);
  } else {
    blockId = currentBlockId++;
    assignedIds.set(id, blockId);
  }
  blockIds[upperKey] = blockId;

  // Determine textures and properties based on family
  let texture = null;
  let hardness = 1.5;
  let sound = 'stone';
  let resistance = 6.0;
  let extraFlags = {};

  if (id.endsWith('_concrete_slab')) {
    const color = id.replace('_concrete_slab', '');
    texture = `${color}_concrete.png`;
    hardness = 1.8;
    resistance = 1.8;
    sound = 'stone';
    extraFlags = { slab: true };
  } else if (id.endsWith('_concrete_stairs')) {
    const color = id.replace('_concrete_stairs', '');
    texture = `${color}_concrete.png`;
    hardness = 1.8;
    resistance = 1.8;
    sound = 'stone';
    extraFlags = { stair: true };
  } else if (id.endsWith('_wool_slab')) {
    const color = id.replace('_wool_slab', '');
    texture = `${color}_wool.png`;
    hardness = 0.8;
    resistance = 0.8;
    sound = 'cloth';
    extraFlags = { slab: true };
  } else if (id.endsWith('_wool_stairs')) {
    const color = id.replace('_wool_stairs', '');
    texture = `${color}_wool.png`;
    hardness = 0.8;
    resistance = 0.8;
    sound = 'cloth';
    extraFlags = { stair: true };
  } else if (id.endsWith('_shelf')) {
    const wood = id.replace('_shelf', '');
    texture = wood === 'bamboo' ? 'bamboo_planks.png' : `${wood}_planks.png`;
    hardness = 2.0;
    resistance = 3.0;
    sound = 'wood';
  } else if (id.includes('cinnabar')) {
    hardness = 1.5;
    resistance = 6.0;
    sound = 'stone';
    if (id.includes('bricks') || id.includes('brick')) texture = 'cinnabar_bricks.png';
    else if (id.includes('chiseled')) texture = 'chiseled_cinnabar.png';
    else if (id.includes('polished')) texture = 'polished_cinnabar.png';
    else texture = 'cinnabar.png';

    if (id.endsWith('_slab')) extraFlags = { slab: true };
    else if (id.endsWith('_stairs')) extraFlags = { stair: true };
    else if (id.endsWith('_wall')) extraFlags = { wall: true };
  } else if (id.includes('sulfur')) {
    hardness = 1.5;
    resistance = 6.0;
    sound = 'stone';
    if (id.includes('bricks') || id.includes('brick')) texture = 'sulfur_bricks.png';
    else if (id.includes('chiseled')) texture = 'chiseled_sulfur.png';
    else if (id.includes('polished')) texture = 'polished_sulfur.png';
    else if (id.includes('spike')) { texture = 'sulfur_spike.png'; extraFlags = { plant: true, solid: false }; }
    else if (id.includes('potent')) { texture = 'potent_sulfur.png'; extraFlags = { light: 15 }; }
    else texture = 'sulfur.png';

    if (id.endsWith('_slab')) extraFlags = { slab: true };
    else if (id.endsWith('_stairs')) extraFlags = { stair: true };
    else if (id.endsWith('_wall')) extraFlags = { wall: true };
  } else if (id.includes('poplar')) {
    hardness = 2.0;
    resistance = 3.0;
    sound = 'wood';
    if (id.includes('leaves')) {
      texture = `${id}.png`;
      hardness = 0.2;
      resistance = 0.2;
      sound = 'grass';
      extraFlags = { leaves: true, transparent: true };
    } else if (id.includes('door')) {
      texture = 'poplar_door_bottom.png';
      extraFlags = { door: true };
    } else if (id.includes('trapdoor')) {
      texture = 'poplar_trapdoor.png';
      extraFlags = { trapdoor: true };
    } else if (id.includes('sapling')) {
      texture = 'poplar_sapling.png';
      hardness = 0;
      resistance = 0;
      sound = 'grass';
      extraFlags = { plant: true, solid: false };
    } else if (id.includes('log') || id.includes('wood')) {
      const isStripped = id.includes('stripped');
      const sideTex = isStripped ? 'stripped_poplar_log.png' : 'poplar_log.png';
      const topTex = isStripped ? 'stripped_poplar_log_top.png' : 'poplar_log_top.png';
      texture = sideTex;
      extraFlags = { textures: { top: topTex, bottom: topTex, side: sideTex, all: sideTex } };
    } else if (id.endsWith('_slab')) {
      texture = 'poplar_planks.png';
      extraFlags = { slab: true };
    } else if (id.endsWith('_stairs')) {
      texture = 'poplar_planks.png';
      extraFlags = { stair: true };
    } else if (id.endsWith('_fence')) {
      texture = 'poplar_planks.png';
      extraFlags = { fence: true };
    } else if (id.endsWith('_fence_gate')) {
      texture = 'poplar_planks.png';
      extraFlags = { fenceGate: true };
    } else if (id.endsWith('_sign')) {
      texture = 'poplar_planks.png';
      extraFlags = { sign: true };
    } else if (id.endsWith('_hanging_sign')) {
      texture = 'poplar_planks.png';
      extraFlags = { hangingSign: true };
    } else if (id.endsWith('_button')) {
      texture = 'poplar_planks.png';
      extraFlags = { button: true };
    } else if (id.endsWith('_pressure_plate')) {
      texture = 'poplar_planks.png';
      extraFlags = { pressurePlate: true };
    } else {
      texture = 'poplar_planks.png';
    }
  } else if (id.includes('copper') || id.includes('lightning_rod')) {
    hardness = 3.0;
    resistance = 6.0;
    sound = 'copper';
    let prefix = id.replace('waxed_', '');
    let stage = '';
    if (prefix.startsWith('exposed_')) stage = 'exposed_';
    else if (prefix.startsWith('weathered_')) stage = 'weathered_';
    else if (prefix.startsWith('oxidized_')) stage = 'oxidized_';

    if (id.includes('bars')) {
      texture = `${stage}copper_bars.png`;
      extraFlags = { transparent: true };
    } else if (id.includes('chain')) {
      texture = `${stage}copper_chain.png`;
      extraFlags = { transparent: true };
    } else if (id.includes('lantern')) {
      texture = `${stage}copper_lantern.png`;
      extraFlags = { light: 15, transparent: true };
    } else if (id.includes('statue') || id.includes('golem')) {
      texture = `${stage}copper_golem_statue.png`;
    } else if (id.includes('chest')) {
      texture = `${stage}copper_chest.png`;
      extraFlags = {
        chest: true,
        transparent: true,
        textures: {
          top: `${stage}copper_chest_top.png`,
          bottom: `${stage}copper_chest_bottom.png`,
          side: `${stage}copper_chest_side.png`,
          front: `${stage}copper_chest_front.png`,
          all: `${stage}copper_chest_side.png`,
          lock: 'chest_lock.png'
        }
      };
    } else if (id.includes('lightning_rod')) {
      texture = `${stage}lightning_rod.png`;
      extraFlags = { rod: true, transparent: true, redstone: true };
    } else if (id.includes('torch')) {
      texture = 'copper_torch.png';
      hardness = 0;
      resistance = 0;
      sound = 'wood';
      extraFlags = { light: 14, transparent: true, solid: false, shape: 'torch' };
    }
  } else if (id.includes('potted_')) {
    texture = `${id}.png`;
    hardness = 0;
    resistance = 0;
    sound = 'stone';
    extraFlags = { potted: true, transparent: true };
  } else if (['bush', 'cactus_flower', 'golden_dandelion', 'leaf_litter', 'wildflowers', 'short_dry_grass', 'tall_dry_grass', 'red_shrub', 'shelf_mushroom'].includes(id)) {
    texture = `${id}.png`;
    hardness = 0;
    resistance = 0;
    sound = 'grass';
    extraFlags = { plant: true, solid: false, transparent: true };
  } else if (id === 'straw_bed') {
    texture = 'straw_bed.png';
    hardness = 0.2;
    resistance = 0.2;
    sound = 'wood';
    extraFlags = { bed: true, transparent: true };
  } else {
    texture = `${id}.png`;
    hardness = 1.5;
    resistance = 6.0;
    sound = 'stone';
  }

  const texturesObj = extraFlags.textures || { all: texture };
  delete extraFlags.textures;

  blockDefs[blockId] = {
    name,
    hardness,
    sound,
    resistance,
    drop: blockId,
    textures: texturesObj,
    ...extraFlags,
  };

  // Corresponding item so players can obtain and place the block
  futureItems[id] = {
    name,
    isBlock: true,
    blockId,
    type: 'block',
    icon: `/assets/blocks/${texture}`
  };
}

// Special handle: Waxed Weathered Lightning Rod block alias if needed
if (!blockIds['WAXED_WEATHERED_LIGHTNING_ROD']) {
  const wId = currentBlockId++;
  blockIds['WAXED_WEATHERED_LIGHTNING_ROD'] = wId;
  blockDefs[wId] = {
    name: 'Waxed Weathered Lightning Rod',
    hardness: 3.0,
    sound: 'copper',
    resistance: 6.0,
    drop: wId,
    textures: { all: 'weathered_lightning_rod.png' },
    rod: true,
    transparent: true,
    redstone: true
  };
  futureItems['waxed_weathered_lightning_rod'] = {
    name: 'Waxed Weathered Lightning Rod',
    isBlock: true,
    blockId: wId,
    type: 'block',
    icon: '/assets/blocks/weathered_lightning_rod.png'
  };
}

// Now handle the 84 items
for (const it of missing.items) {
  const id = it.id;
  const name = it.name;
  let type = 'item';
  let stackSize = 64;

  if (id.endsWith('_sword')) {
    type = 'weapon';
    stackSize = 1;
  } else if (id.endsWith('_pickaxe') || id.endsWith('_axe') || id.endsWith('_shovel') || id.endsWith('_hoe')) {
    type = 'tool';
    stackSize = 1;
  } else if (id.endsWith('_helmet') || id.endsWith('_chestplate') || id.endsWith('_leggings') || id.endsWith('_boots')) {
    type = 'armor';
    stackSize = 1;
  } else if (id.endsWith('_horse_armor')) {
    type = 'item';
    stackSize = 1;
  } else if (id.endsWith('_spear')) {
    type = 'weapon';
    stackSize = 1;
  } else if (id.endsWith('_spawn_egg')) {
    type = 'item';
    stackSize = 64;
  } else if (id.endsWith('_cushion')) {
    type = 'item';
    stackSize = 64;
  } else if (id.endsWith('_harness')) {
    type = 'item';
    stackSize = 1;
  } else if (id.endsWith('_map')) {
    type = 'item';
    stackSize = 64;
  } else if (id.includes('boat')) {
    type = 'transport';
    stackSize = 1;
  } else if (id.startsWith('music_disc_')) {
    type = 'music_disc';
    stackSize = 1;
  } else if (id === 'copper_nugget') {
    type = 'material';
    stackSize = 64;
  }

  futureItems[id] = {
    name,
    type,
    stackSize,
    icon: `/assets/items/${id}.png`
  };
}

const fileContent = `// Generated content for post-1.21.4 parity: 189 blocks and 84 items.
// Automatically generated by scripts/build-future-content.mjs

export const FUTURE_BLOCK_IDS = ${JSON.stringify(blockIds, null, 2)};

export const FUTURE_BLOCK_DEFS = ${JSON.stringify(blockDefs, null, 2)};

export const FUTURE_ITEMS = ${JSON.stringify(futureItems, null, 2)};
`;

writeFileSync('src/futureContent.js', fileContent);
console.log(`Generated src/futureContent.js with ${Object.keys(blockDefs).length} blocks and ${Object.keys(futureItems).length} items.`);
