// Minecraft block-entity data <-> what this game shows: a chest's contents and a sign's text.
//
// A block entity imported from a .schem is kept exactly as Minecraft wrote it (see buildingStudio.js), so export
// never depends on this module getting every item right. This module only decides what the world SHOWS: it turns
// `Items` into the chest manager's stacks and `front_text`/`back_text` into lines on the sign, and, for export,
// turns a chest the player changed back into Minecraft items.
//
// Item data follows Minecraft 1.20.5+ (`count`, `components`) and also reads the older form (`Count`, `tag`), so a
// schematic from an older WorldEdit still fills its chests.

import { BLOCKS, BLOCK_DEFS } from '../blocks.js';
import { resolveItem } from '../commands.js';
import { enchantmentEntry } from '../enchanting.js';
import { maxDurabilityFor } from '../durability.js';
import { TagType } from './nbt.js';
import { blockIdToCanonicalState, orientationForState } from './gameBlockStates.js';
import { CanonicalBlockState } from './canonical.js';
import { decodeNbtJson } from './nbtJson.js';

const CHEST_SLOTS = 27;
const strip = (id) => String(id ?? '').replace(/^minecraft:/, '');

// --- chests ----------------------------------------------------------------------------------------------------

/** Enchantments as `{ key: level }`, from either item format. */
function enchantmentsOf(item) {
  const components = item.components ?? {};
  const map = components['minecraft:enchantments'] ?? components['minecraft:stored_enchantments'];
  const out = {};
  if (map) {
    // 1.21.4 wraps the levels ({ levels: {...}, show_in_tooltip }); 1.21.5 writes the map directly.
    const levels = map.levels && typeof map.levels === 'object' ? map.levels : map;
    for (const [id, level] of Object.entries(levels)) if (typeof level === 'number') out[strip(id)] = level;
  }
  for (const e of [...(item.tag?.Enchantments ?? []), ...(item.tag?.StoredEnchantments ?? [])]) {
    if (e?.id !== undefined) out[strip(e.id)] = Number(e.lvl ?? 1);
  }
  return out;
}

/** One Minecraft item compound as a game stack, or null when the game has no such item. */
export function gameStackFromItem(item) {
  if (!item?.id) return null;
  const resolved = resolveItem(strip(item.id));
  if (!resolved.ok) return null;
  const count = Number(item.count ?? item.Count ?? 1);
  if (!(count > 0)) return null;
  const stack = { id: resolved.id, isBlock: resolved.isBlock, count };
  const enchantments = Object.entries(enchantmentsOf(item)).map(([key, level]) => enchantmentEntry(key, level)).filter(Boolean);
  if (enchantments.length) stack.enchantments = enchantments;
  const damage = Number(item.components?.['minecraft:damage'] ?? item.tag?.Damage ?? 0);
  const max = resolved.isBlock ? null : maxDurabilityFor(resolved.id);
  if (damage > 0 && max) stack.durability = Math.max(0, max - damage);
  return stack;
}

/** A chest's `Items` as the chest manager's 27 slots (null where empty). */
export function chestSlotsFromItems(items) {
  const slots = new Array(CHEST_SLOTS).fill(null);
  (Array.isArray(items) ? items : []).forEach((item, i) => {
    const slot = Number(item?.Slot ?? i);
    if (slot >= 0 && slot < CHEST_SLOTS) slots[slot] = gameStackFromItem(item);
  });
  return slots;
}

/** A game stack's Minecraft item id. */
function itemIdOf(stack) {
  if (stack.isBlock) return blockIdToCanonicalState(stack.id).name;
  return `minecraft:${strip(stack.id)}`;
}

/** The chest manager's slots as Minecraft 1.21 `Items`, with the tag types Minecraft requires. */
export function itemsFromChestSlots(slots) {
  const items = [];
  (slots ?? []).forEach((stack, slot) => {
    if (!stack || !(stack.count > 0)) return;
    const item = { Slot: slot, id: itemIdOf(stack), count: stack.count };
    const components = {};
    if (stack.enchantments?.length) {
      const levels = Object.fromEntries(stack.enchantments.map((e) => [`minecraft:${strip(e.id)}`, e.level]));
      components[strip(stack.id) === 'enchanted_book' ? 'minecraft:stored_enchantments' : 'minecraft:enchantments'] = { levels };
    }
    const max = stack.isBlock ? null : maxDurabilityFor(stack.id);
    if (max && typeof stack.durability === 'number' && stack.durability < max) components['minecraft:damage'] = max - stack.durability;
    if (Object.keys(components).length) item.components = components;
    items.push(item);
  });
  return items;
}

/** The tag types `itemsFromChestSlots`' output needs: a slot is a byte; counts, levels and damage are ints. */
export const ITEM_TYPES = {
  'Items[].Slot': TagType.BYTE,
  'Items[].count': TagType.INT,
  'Items[].components.minecraft:damage': TagType.INT
};

// --- signs -----------------------------------------------------------------------------------------------------

/** A text component (JSON string, plain string or compound) as plain text. */
export function plainText(component) {
  if (component === null || component === undefined) return '';
  if (typeof component === 'string') {
    const trimmed = component.trim();
    if (/^[{["]/.test(trimmed)) {
      try { return plainText(JSON.parse(trimmed)); } catch { /* not JSON: the string is the text */ }
    }
    return component;
  }
  if (Array.isArray(component)) return component.map(plainText).join('');
  if (typeof component === 'object') {
    return `${component.text ?? component.translate ?? ''}${(component.extra ?? []).map(plainText).join('')}`;
  }
  return String(component);
}

function side(text, legacy = null) {
  if (text) return { lines: (text.messages ?? []).slice(0, 4).map(plainText), color: text.color ?? 'black', glowing: Boolean(text.has_glowing_text) };
  if (legacy) return legacy;
  return null;
}

/**
 * A sign block entity as `{ front, back }`, each `{ lines: [4 strings], color, glowing }` or null. Reads 1.20+
 * (`front_text`, `back_text`) and the older single-sided form (`Text1`..`Text4`, `Color`, `GlowingText`).
 */
export function signTextFromNbt(data) {
  if (!data || typeof data !== 'object') return null;
  const legacy = ['Text1', 'Text2', 'Text3', 'Text4'].some((k) => k in data)
    ? { lines: ['Text1', 'Text2', 'Text3', 'Text4'].map((k) => plainText(data[k])), color: data.Color ?? 'black', glowing: Boolean(data.GlowingText) }
    : null;
  const front = side(data.front_text, legacy);
  const back = side(data.back_text);
  const has = (s) => s && s.lines.some((line) => line.trim() !== '');
  if (!has(front) && !has(back)) return null;
  return { front: has(front) ? front : null, back: has(back) ? back : null };
}

// --- what a placed block entity adds to the world ----------------------------------------------------------------

const isChest = (id) => id === BLOCKS.CHEST || id === BLOCKS.TRAPPED_CHEST;
const isSign = (id) => Boolean(BLOCK_DEFS[id]?.sign || BLOCK_DEFS[id]?.wallSign || BLOCK_DEFS[id]?.hangingSign);

/**
 * The extra fields a block entity adds to `world.applyStructureOrientation`'s request for the block it sits on:
 * `items` for a chest, `signText` for a sign. `data` is the block entity's decoded NBT. Null when there is nothing
 * the game can show.
 */
export function worldExtrasForBlockEntity(blockId, data) {
  if (!data) return null;
  if (isChest(blockId) && Array.isArray(data.Items)) return { items: chestSlotsFromItems(data.Items) };
  if (isSign(blockId)) {
    const signText = signTextFromNbt(data);
    return signText ? { signText } : null;
  }
  return null;
}

// --- placing a stored block in the world ---------------------------------------------------------------------------

const parsedStates = new Map();
function parseState(text) {
  if (!parsedStates.has(text)) {
    let state = null;
    try { state = CanonicalBlockState.parse(text); } catch { /* not a state string */ }
    parsedStates.set(text, state);
  }
  return parsedStates.get(text);
}

/**
 * Everything `world.applyStructureOrientation` needs for one stored building block `{ x, y, z, id, state?,
 * blockEntity? }`: its facing (from the Minecraft state) and what its block entity shows (chest items, sign text).
 * Null when the world has nothing to remember about it.
 */
export function worldRequestFor(block) {
  const parsed = block.state ? parseState(block.state) : null;
  const orientation = parsed ? orientationForState(parsed) : null;
  const extras = block.blockEntity ? worldExtrasForBlockEntity(block.id, decodeNbtJson(block.blockEntity.data ?? {})) : null;
  if (!orientation && !extras) return null;
  // A chest only reaches the chest manager with a facing; an imported chest without one faces north, as Minecraft's does.
  const facing = orientation?.facing ?? (extras?.items ? 'north' : undefined);
  return { x: block.x, y: block.y, z: block.z, id: block.id, name: parsed?.name, ...orientation, ...extras, ...(facing ? { facing } : {}) };
}

// --- exporting a chest the player changed -----------------------------------------------------------------------------

/** A chest's slots as a comparable snapshot. */
export const chestSnapshot = (chest) => JSON.stringify(chest?.items ?? null);

/**
 * The block entity to export for a chest, given what the building stored (`stored`, nbtJson form or null), the
 * chest manager's chest at that spot, and the snapshot taken when it was placed. Unchanged contents export the
 * stored data exactly; changed (or never stored) contents are written from the chest as it is now.
 */
export function chestBlockEntityForExport(blockId, stored, chest, placedSnapshot) {
  // No live chest, or no snapshot to compare against (nothing says the player changed it): the stored data stands.
  if (!chest || (stored && (placedSnapshot === undefined || chestSnapshot(chest) === placedSnapshot))) {
    return stored ? { id: stored.id, nbt: decodeNbtJson(stored.data ?? {}), nbtTypes: stored.types } : null;
  }
  const items = itemsFromChestSlots(chest.items);
  if (!stored && items.length === 0) return null;
  const data = stored ? decodeNbtJson(stored.data ?? {}) : {};
  data.Items = items;
  // The contents are now explicit, so a loot table would refill a chest the player emptied.
  delete data.LootTable;
  delete data.LootTableSeed;
  const types = Object.fromEntries(Object.entries(stored?.types ?? {}).filter(([path]) => !path.startsWith('Items')));
  return {
    id: stored?.id ?? (blockId === BLOCKS.TRAPPED_CHEST ? 'minecraft:trapped_chest' : 'minecraft:chest'),
    nbt: data,
    nbtTypes: { ...types, ...ITEM_TYPES }
  };
}

export { isChest };
