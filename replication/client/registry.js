// `minecraft-data` for Blockyland: blocks and items by name and by id, with the fields Mineflayer programs read.
// Names are Blockyland's registry names, which match vanilla's for the survival game (oak_log, iron_ore, ender_eye).
// Ids are Blockyland's: a block's id is its block id; an item that is not a block gets an id of 100000 and up. A
// block's item has the block's id, so `bot.inventory.count(mcData.itemsByName.cobblestone.id)` works.
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../../src/blocks.js';
import { breakTimeSeconds, harvestsNothing } from '../../src/miningRules.js';

const ITEM_BASE = 100000;

function build() {
  const blocks = {}, blocksByName = {}, blocksArray = [];
  for (const [key, id] of Object.entries(BLOCKS)) {
    if (blocks[id]) continue; // aliases: the first key names the block
    const def = BLOCK_DEFS[id] ?? {}, name = key.toLowerCase();
    // The game's collision rule (Player.isBlockSolid): air, water, non-solid blocks and plants are passable.
    const solid = id !== BLOCKS.AIR && id !== BLOCKS.WATER && def.solid !== false && !def.plant && !def.liquid;
    const b = {
      id, name, displayName: def.name ?? name,
      hardness: def.hardness ?? 0, resistance: def.resistance ?? def.hardness ?? 0,
      diggable: id !== BLOCKS.AIR && !def.liquid && (def.hardness ?? 0) < 99999 && (def.hardness ?? 0) >= 0,
      boundingBox: solid ? 'block' : 'empty', transparent: !!def.transparent || !solid,
      stackSize: 64, liquid: !!def.liquid,
      // 1.5 blocks tall to a walker (fences, walls, gates): not a step up.
      tall: !!(def.fence || def.wall || (def.fenceGate && def.solid !== false)),
      defaultState: id, minStateId: id, maxStateId: id, states: [],
    };
    blocks[id] = b; blocksByName[name] = b; blocksArray.push(b);
  }
  const items = {}, itemsByName = {}, itemsArray = [];
  for (const b of blocksArray) {
    if (b.id === BLOCKS.AIR) continue;
    const it = { id: b.id, name: b.name, displayName: b.displayName, stackSize: 64, isBlock: true };
    items[it.id] = it; itemsByName[it.name] = it; itemsArray.push(it);
  }
  Object.keys(ITEMS).sort().forEach((name, i) => {
    const def = ITEMS[name];
    // An item that places a block (red_bed): the block's id if the block has that name, else its own.
    const id = itemsByName[name]?.id ?? ITEM_BASE + i;
    const it = { id, name, displayName: def.name ?? name, stackSize: def.stackSize ?? 64, maxDurability: def.durability ?? undefined, isBlock: !!def.isBlock, blockId: def.blockId };
    items[id] = it; itemsByName[name] = it; if (!itemsArray.includes(itemsByName[name])) itemsArray.push(it);
  });
  const foods = {}, foodsByName = {};
  for (const it of itemsArray) { const def = ITEMS[it.name]; if (def?.type === 'food' || def?.food || def?.hunger) { foods[it.id] = it; foodsByName[it.name] = it; } }
  return {
    version: { minecraftVersion: '1.20.4', majorVersion: '1.20', type: 'pc' }, type: 'pc', supportFeature: () => false,
    blocks, blocksByName, blocksArray, items, itemsByName, itemsArray, foods, foodsByName,
    entitiesByName: new Proxy({}, { get: (_, k) => (typeof k === 'string' ? { name: k, displayName: k } : undefined) }),
    // Mineflayer programs ask for the time a block takes; the game's rule answers.
    digTime: (blockId, heldName) => breakTimeSeconds(blockId, ITEMS[heldName] ?? null, heldName ?? null) * 1000,
    canHarvest: (blockId, heldName) => !harvestsNothing(blockId, ITEMS[heldName] ?? null, heldName ?? null),
  };
}

let data = null;
export function registry() { return (data ??= build()); }
/** `require('minecraft-data')(version)` */
export function minecraftData() { return registry(); }

/** An inventory stack (as the server sends it) as Mineflayer's Item. */
export function itemFromStack(stack) {
  if (!stack) return null;
  const r = registry(), def = r.itemsByName[stack.name];
  return {
    type: def?.id ?? -1, name: stack.name, displayName: def?.displayName ?? stack.name, count: stack.count, slot: stack.slot,
    stackSize: def?.stackSize ?? 64, metadata: 0, nbt: null,
    durabilityUsed: stack.maxDurability && stack.durability != null ? stack.maxDurability - stack.durability : 0,
    maxDurability: stack.maxDurability ?? undefined,
    enchants: (stack.enchantments ?? []).map(e => ({ name: e.id ?? e.name, lvl: e.level ?? e.lvl ?? 1 })),
  };
}
