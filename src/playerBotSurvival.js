import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from './blocks.js';
import { RECIPES_2X2, RECIPES_3X3 } from './crafting.js';
import { getSmeltingRecipe, getFuelBurnTime, SMELTING_RECIPES } from './furnace.js';
import { isHoe, getCropInfo } from './farming.js';
import { lightPortal } from './netherPortal.js';
import { insertEye, tryActivateAround } from './endPortal.js';
import { calculateBookshelfCount, generateEnchantmentOffers, applyEnchantment } from './enchanting.js';
import { executeTrade } from './villagerEconomy.js';
import { BrewingManager } from './brewing.js';
import { calculateSmithingResult, resolveSmithingTemplate } from './smithing.js';
import { ChestManager } from './chest.js';
import { calculateAnvilResult, getAnvilDegradation } from './anvil.js';
import { consumePlayerLevels } from './experience.js';
import { isDrinkablePotion, drinkPotion } from './potionUse.js';
import { canEat } from './hunger.js';

export const SURVIVAL_ACTIONS = ['craft', 'place', 'cook', 'eat', 'sleep', 'till', 'use', 'activate', 'brew', 'enchant', 'smith', 'anvil', 'trade', 'store', 'withdraw', 'open', 'build', 'wire'];

export const BUILTIN_SCHEMATICS = {
  shelter: [
    // 4x4 cobblestone floor
    ...Array.from({ length: 4 }, (_, x) => Array.from({ length: 4 }, (_, z) => ({ offset: [x, 0, z], item: 'cobblestone' }))).flat(),
    // 4x4 oak planks walls (h=1..2) leaving door opening at [1, 1, 0] and [1, 2, 0]
    ...[1, 2].flatMap(y => [
      { offset: [0, y, 0], item: 'oak_planks' },
      { offset: [2, y, 0], item: 'oak_planks' },
      { offset: [3, y, 0], item: 'oak_planks' },
      { offset: [0, y, 1], item: 'oak_planks' },
      { offset: [3, y, 1], item: 'oak_planks' },
      { offset: [0, y, 2], item: 'oak_planks' },
      { offset: [3, y, 2], item: 'oak_planks' },
      { offset: [0, y, 3], item: 'oak_planks' },
      { offset: [1, y, 3], item: 'oak_planks' },
      { offset: [2, y, 3], item: 'oak_planks' },
      { offset: [3, y, 3], item: 'oak_planks' }
    ]),
    // Doorway
    { offset: [1, 1, 0], item: 'oak_door' },
    // 4x4 roof at y=3
    ...Array.from({ length: 4 }, (_, x) => Array.from({ length: 4 }, (_, z) => ({ offset: [x, 3, z], item: 'oak_planks' }))).flat(),
    // Interior torch
    { offset: [2, 2, 2], item: 'torch' }
  ]
};

export function itemId(name) {
  if (typeof name === 'number' && BLOCK_DEFS[name]) return name;
  if (typeof name !== 'string') throw new Error('Specify an item name or block ID.');
  const key = name.trim().toLowerCase().replace(/\s+/g, '_');
  const aliases = {
    raw_beef: 'beef',
    raw_porkchop: 'porkchop',
    raw_mutton: 'mutton',
    raw_chicken: 'chicken',
    raw_cod: 'cod',
    raw_salmon: 'salmon',
    raw_rabbit: 'rabbit'
  };
  const canonical = aliases[key] || key;
  if (ITEMS[canonical]) return canonical;
  if (BLOCKS[canonical.toUpperCase()] !== undefined) return BLOCKS[canonical.toUpperCase()];
  throw new Error(`Unknown item: ${name}`);
}
export function validateSurvivalAction(c) {
  if (!SURVIVAL_ACTIONS.includes(c.type)) return c;
  if(c.type==='activate'){
    if(!Array.isArray(c.position)||c.position.length!==3||c.position.some(v=>!Number.isInteger(v)||Math.abs(v)>30000000))throw new Error('Activate needs three integer world coordinates.');
    return c;
  }
  if(c.type==='build'&&Array.isArray(c.schematic))for(const cell of c.schematic){
    if(!Array.isArray(cell.offset)||cell.offset.length!==3||cell.offset.some(n=>!Number.isInteger(n)||Math.abs(n)>128))throw new Error('Invalid schematic offset.');
    itemId(cell.item);
    if(cell.dir!==undefined&&(!Number.isInteger(cell.dir)||cell.dir<0||cell.dir>5))throw new Error('Invalid component facing.');
    if(cell.delay!==undefined&&(!Number.isInteger(cell.delay)||cell.delay<1||cell.delay>4))throw new Error('Repeater delay must be 1–4.');
    if(cell.note!==undefined&&(!Number.isInteger(cell.note)||cell.note<0||cell.note>24))throw new Error('Note must be 0–24.');
  }
  if (c.type !== 'sleep' && c.type !== 'till' && c.type !== 'trade' && c.type !== 'smith' && c.type !== 'anvil' && c.type !== 'open' && c.type !== 'build') itemId(c.item || 'redstone');
  if (c.type === 'smith') {
    if (!resolveSmithingTemplate(c.template)) throw new Error(`Unknown smithing template: ${c.template}`);
    itemId(c.base);
    itemId(c.addition);
  }
  if (c.type === 'anvil') {
    itemId(c.left);
    if (c.right) itemId(c.right);
  }
  if (['place', 'cook', 'sleep', 'till', 'use', 'brew', 'enchant', 'smith', 'anvil', 'store', 'withdraw', 'open', 'build'].includes(c.type)) {
    if (!Array.isArray(c.position) || c.position.length !== 3 || c.position.some(n => !Number.isInteger(n) || Math.abs(n) > 30000000)) throw new Error('Action needs three integer world coordinates.');
  }
  if (c.type === 'wire') {
    if (!Array.isArray(c.from) || c.from.length !== 3 || c.from.some(n => !Number.isInteger(n))) throw new Error('Wire needs 3 integer starting coordinates.');
    if (!Array.isArray(c.to) || c.to.length !== 3 || c.to.some(n => !Number.isInteger(n))) throw new Error('Wire needs 3 integer ending coordinates.');
  }
  if (c.type === 'cook') itemId(c.fuel);
  if (c.type === 'brew' && c.bottle) itemId(c.bottle);
  if (c.type === 'trade' && !c.mob) throw new Error('Trade needs a merchant mob name.');
  for (const value of [c.count ?? 1, c.fuelCount ?? 1, c.bottleCount ?? 1]) if (!Number.isInteger(value) || value < 1 || value > 64) throw new Error('Use a count from 1 to 64.');
  if (['place','eat','sleep','till','use','enchant','smith','anvil','open','build'].includes(c.type) && (c.count??1)!==1) throw new Error('Placement, eating, sleeping, tilling, item use, enchanting, smithing, anvil, opening and building act once per command.');
  return c;
}

// Inventory gestures without opening a modal. No recipe, loot or world writes are
// synthesized: crafting uses the real result handler, and world actions raycast.
export class BotSurvival {
  constructor(bot) { this.bot = bot; this.game = bot.game; }
  get inventory() { return this.game.inventory; }
  slots() { return [this.inventory.hotbar, this.inventory.storage]; }
  /**
   * Do a stack's id and a wanted id name the same thing?
   *
   * They need not be written the same way: a recipe names its ingredient by BLOCK id (43 for white wool) while
   * the inventory stack that dropped from a sheep carries the item name. `count` compared them raw, so it
   * reported zero wool while `itemCount` -- which normalises -- reported three, and the bed recipe could never
   * be satisfied however much wool the player had.
   */
  /** What the player holds, stack by stack (id, count, durability), to notice any change a use makes. */
  inventorySignature() {
    return JSON.stringify([...(this.inventory.hotbar || []), ...(this.inventory.storage || [])].map((i) => i ? `${i.id}x${i.count}d${i.durability ?? ''}${i.lodestone ? 'L' : ''}` : '')); // a lodestone link is a change too
  }
  sameItem(stackId, wanted) {
    if (stackId === wanted) return true;
    const name = (value) => {
      if (typeof value === 'number') {
        const key = Object.keys(BLOCKS).find((id) => BLOCKS[id] === value);
        return key ? key.toLowerCase() : String(value);
      }
      return String(value ?? '').toLowerCase();
    };
    const s = name(stackId);
    const w = name(wanted);
    if (s === w) return true;
    const aliases = {
      raw_beef: 'beef',
      raw_porkchop: 'porkchop',
      raw_mutton: 'mutton',
      raw_chicken: 'chicken',
      raw_cod: 'cod',
      raw_salmon: 'salmon',
      raw_rabbit: 'rabbit'
    };
    if ((aliases[s] || s) === (aliases[w] || w)) return true;
    const bedFamily = (v) => String(v).endsWith('_bed') || v === 'bed';
    return bedFamily(s) && bedFamily(w);
  }
  count(id) { return this.slots().flat().reduce((n, s) => n + (s && this.sameItem(s.id, id) ? s.count : 0), 0); }
  capacity(item) {
    const limit = stackLimitFor(item.id);
    return this.slots().flat().reduce((n, s) => n + (!s ? limit : this.sameItem(s.id, item.id) && s.isBlock === item.isBlock && !s.enchantments ? Math.max(0, limit - s.count) : 0), 0);
  }
  remove(id, count) {
    if (this.count(id) < count) throw new Error(`Not enough ${id} in inventory.`);
    let sample;
    for (const list of this.slots()) for (let i = 0; i < list.length && count; i++) {
      const s = list[i]; if (!s || !this.sameItem(s.id, id)) continue;
      sample ??= { ...s, count: 0 }; const n = Math.min(count, s.count);
      count -= n; sample.count += n; s.count -= n; if (!s.count) list[i] = null;
    }
    return sample;
  }
  nearby(id) {
    const p = this.game.player.position;
    for (let x = Math.floor(p.x)-4; x <= Math.floor(p.x)+4; x++) for (let y = Math.floor(p.y)-3; y <= Math.floor(p.y)+3; y++) for (let z = Math.floor(p.z)-4; z <= Math.floor(p.z)+4; z++) {
      if (this.game.world.getVoxel(x,y,z) === id && Math.hypot(x+.5-p.x,y+.5-p.y,z+.5-p.z) <= 4.5) return true;
    }
    return false;
  }
  /**
   * A point on a supporting face of the cell (x, y, z) that the eye can see: the first block a ray toward it meets is
   * that face's block, through that face. Faces turned away from the eye are skipped, and each face is sampled on a
   * 3 x 3 grid, nearest-to-centre first.
   */
  placementAim(x, y, z, faces, eyeAt = null) {
    const p = this.game.player;
    const eye = eyeAt ?? { x: p.position.x, y: p.position.y + (p.isSneaking ? 1.38 : p.eyeHeight || 1.62), z: p.position.z };
    const offsets = [0.5, 0.2, 0.8];
    for (const f of faces) {
      const anchor = { x: x + f[0], y: y + f[1], z: z + f[2] };
      // The face shared by the anchor and the cell, seen from the cell's side: its normal is -f.
      const cx = x + 0.5 + f[0] * 0.5, cy = y + 0.5 + f[1] * 0.5, cz = z + 0.5 + f[2] * 0.5;
      if (-f[0] * (eye.x - cx) - f[1] * (eye.y - cy) - f[2] * (eye.z - cz) <= 0) continue;
      for (const u of offsets) for (const v of offsets) {
        const point = f[0] ? { x: cx, y: y + u, z: z + v } : f[1] ? { x: x + u, y: cy, z: z + v } : { x: x + u, y: y + v, z: cz };
        const hit = this.raycastBlock(eye, point, 5.2);
        if (hit && hit.x === anchor.x && hit.y === anchor.y && hit.z === anchor.z && hit.nx === -f[0] && hit.ny === -f[1] && hit.nz === -f[2]) {
          return { anchor, point: { x: point.x - f[0] * 0.001, y: point.y - f[1] * 0.001, z: point.z - f[2] * 0.001 } };
        }
      }
    }
    return null;
  }
  /**
   * The nearest cell the player could stand in (solid, safe floor; two clear cells) from which a supporting face of
   * (x, y, z) is visible within reach.
   */
  /** The nearest cell (to the player) a player can stand in with the block at x,y,z in arm's reach. */
  standingSpotNear(x, y, z) {
    const p = this.game.player.position, world = this.game.world, bot = this.bot;
    let best = null;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -4; dy <= 2; dy++) {
      const sx = x + dx, sy = y + dy, sz = z + dz;
      if (sx === x && sz === z) continue;
      const floor = world.getVoxel(sx, sy - 1, sz);
      if (bot.passable(floor) || bot.hazard(floor) || !bot.passable(world.getVoxel(sx, sy, sz)) || !bot.passable(world.getVoxel(sx, sy + 1, sz))) continue;
      if (Math.hypot(x + 0.5 - (sx + 0.5), y + 0.5 - (sy + 1.62), z + 0.5 - (sz + 0.5)) > 4) continue;
      const d = Math.hypot(sx + 0.5 - p.x, sy - p.y, sz + 0.5 - p.z);
      if (!best || d < best.d) best = { x: sx, y: sy, z: sz, d };
    }
    return best;
  }
  vantagePoint(x, y, z, faces) {
    const p = this.game.player.position, world = this.game.world, bot = this.bot;
    let best = null;
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -3; dy <= 2; dy++) {
      const sx = x + dx, sy = y + dy, sz = z + dz;
      if (sx === x && sz === z && (sy === y || sy + 1 === y)) continue;
      const floor = world.getVoxel(sx, sy - 1, sz);
      if (bot.passable(floor) || bot.hazard(floor) || !bot.passable(world.getVoxel(sx, sy, sz)) || !bot.passable(world.getVoxel(sx, sy + 1, sz))) continue;
      const eye = { x: sx + 0.5, y: sy + 1.38, z: sz + 0.5 };
      if (Math.hypot(x + 0.5 - eye.x, y + 0.5 - (sy + 0.5), z + 0.5 - eye.z) > 4.3) continue;
      if (!this.placementAim(x, y, z, faces, eye)) continue;
      const d = Math.hypot(sx + 0.5 - p.x, sy - p.y, sz + 0.5 - p.z);
      if (!best || d < best.d) best = { x: sx, y: sy, z: sz, d };
    }
    return best;
  }
  /** The game's block raycast (main.js updateRaycast), from `from` toward `to`: the first non-air, non-water block. */
  raycastBlock(from, to, maxDist) {
    const world = this.game.world;
    let dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    let x = Math.floor(from.x), y = Math.floor(from.y), z = Math.floor(from.z);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
    let tx = (sx > 0 ? x + 1 - from.x : from.x - x) * tdx, ty = (sy > 0 ? y + 1 - from.y : from.y - y) * tdy, tz = (sz > 0 ? z + 1 - from.z : from.z - z) * tdz;
    let nx = 0, ny = 0, nz = 0, dist = 0;
    for (let i = 0; i < 24; i++) {
      const id = world.getVoxel(x, y, z);
      if (id !== BLOCKS.AIR && id !== BLOCKS.WATER) return { x, y, z, nx, ny, nz, dist };
      if (tx < ty) { if (tx < tz) { x += sx; dist = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; } else { z += sz; dist = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; } }
      else if (ty < tz) { y += sy; dist = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; } else { z += sz; dist = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (dist > maxDist) return null;
    }
    return null;
  }
  requireReach(position, ids) {
    const [x,y,z] = position, p = this.game.player.position;
    if (Math.hypot(x+.5-p.x,y+.5-p.y,z+.5-p.z) > 4.5) throw new Error('Walk within reach of the station first.');
    const voxel = this.game.world.getVoxel(x,y,z);
    if (!ids.includes(voxel) && !BLOCK_DEFS[voxel]?.bed) throw new Error('Required station is missing at those coordinates.');
  }
  craft(c) {
    const inv = this.inventory, id = itemId(c.item), times = c.count ?? 1;
    if (inv.cursorItem || [...inv.craft2x2,...inv.craft3x3].some(Boolean)) throw new Error('Empty the cursor and crafting grids first.');
    const recipes = [...RECIPES_2X2.map(r => ({r,size:2})), ...RECIPES_3X3.map(r => ({r,size:3}))];
    // Dyeable recipes are one entry per colour, so asking for `red_bed` while holding white wool has no exact
    // match even though the bed the player can actually make does. Only the bed family falls back: planks and
    // wool also share a suffix, and substituting those would quietly craft a different wood or colour than the
    // caller asked for. This is what lets the survival fixture observe the colour the game chooses.
    const bedFamily = (name) => String(name).endsWith('_bed');
    let choice;
    for (const exact of [true, false]) {
      for (const candidate of recipes) {
        const {r,size} = candidate; if (size === 3 && !this.nearby(BLOCKS.CRAFTING_TABLE)) continue;
        const matches = exact ? this.sameItem(r.result.id, id) : bedFamily(r.result.id) && bedFamily(id);
        if (!matches) continue;
        const needed = new Map(); for (const part of r.ingredients || r.pattern.flat()) if (part != null) needed.set(part,(needed.get(part)||0)+times);
        if ([...needed].every(([part,n]) => this.count(part) >= n)) { choice = candidate; break; }
      }
      if (choice) break;
    }
    if (!choice) {
      // Say WHY. A bare "no usable recipe" cost a whole debugging round: the recipe existed, the ingredients
      // were in the inventory and the table was one block away, so the message has to carry the three facts
      // that decide it -- whether a table is in reach, whether any candidate matched the id, and which
      // ingredient is short.
      const nearTable = this.nearby(BLOCKS.CRAFTING_TABLE);
      const candidates = recipes.filter(({ r }) => this.sameItem(r.result?.id, id)
        || (bedFamily(r.result?.id) && bedFamily(id)));
      const detail = candidates.slice(0, 3).map(({ r }) => {
        const needed = new Map();
        for (const part of r.ingredients || r.pattern.flat()) if (part != null) needed.set(part, (needed.get(part) || 0) + times);
        return `${r.result.id} needs ` + [...needed].map(([p, n]) => `${p} x${n} (have ${this.count(p)})`).join(', ');
      }).join(' | ');
      throw new Error(`No usable recipe for ${id}${c.item ? ` (${c.item})` : ''}: crafting table nearby=${nearTable}, matching recipes=${candidates.length}${detail ? `, ${detail}` : ''}. Held: ${[...new Set(this.slots().flat().filter(Boolean).map((s) => `${s.id}${s.isBlock ? ':block' : ':item'}`))].slice(0, 14).join(', ')}`);
    }
    // Roll back all gestures if the real recipe matcher rejects the grid or the
    // result will not fit; never lose ingredients or partially insert a result.
    const saved = structuredClone({hotbar:inv.hotbar,storage:inv.storage});
    try {
      const {r,size} = choice, grid = size === 3 ? inv.craft3x3 : inv.craft2x2;
      for (let repeat = 0; repeat < times; repeat++) {
        const parts = r.ingredients ? r.ingredients.map((part,i)=>[i,part]) : r.pattern.flatMap((row,y)=>row.map((part,x)=>[y*size+x,part]));
        for (const [index,part] of parts) if (part != null) grid[index] = this.remove(part,1);
        inv.checkCrafting();
        const result = size === 3 ? inv.craft3x3Result : inv.craft2x2Result;
        const expectedResultId = choice.r.result.id;
        const matches = this.sameItem(result.id, id) || this.sameItem(result.id, expectedResultId) || (bedFamily(result.id) && (bedFamily(id) || bedFamily(expectedResultId)));
        if (!result || !matches) throw new Error('Game recipe matcher rejected the crafting grid.');
        inv.takeCraftResult(size === 3);
        if (!inv.cursorItem || this.capacity(inv.cursorItem) < inv.cursorItem.count) throw new Error('Inventory is full; crafting cancelled.');
        inv.addItem(inv.cursorItem); inv.cursorItem = null;
      }
      inv.updateHotbar?.();
      return {ok:true,message:`Crafted ${times*r.result.count} ${c.item}.`, crafted:times*r.result.count};
    } catch (e) {
      Object.assign(inv,saved); inv.craft2x2.fill(null); inv.craft3x3.fill(null); inv.cursorItem=null; inv.checkCrafting(); throw e;
    }
  }
  store(c) {
    this.requireReach(c.position, [BLOCKS.CHEST, BLOCKS.TRAPPED_CHEST]);
    this.game.chestManager ??= new ChestManager(this.game);
    const cm = this.game.chestManager;
    let chest = cm.getChest(...c.position);
    if (!chest) {
      chest = cm.placeChest(this.game.world, c.position, 0);
    }
    if (!cm.canOpen(c.position[0], c.position[1], c.position[2], this.game.world)) {
      throw new Error('This chest is obstructed.');
    }
    const id = itemId(c.item);
    const count = c.count ?? 1;
    const isBlock = typeof id === 'number' || (BLOCKS[String(c.item).toUpperCase()] !== undefined);
    if (this.game.player.gamemode !== 'creative' && this.count(id) < count) {
      throw new Error(`Not enough ${c.item} in inventory.`);
    }
    cm.addItem(c.position[0], c.position[1], c.position[2], id, isBlock, count);
    if (this.game.player.gamemode !== 'creative') {
      this.remove(id, count);
    }
    this.inventory.updateHotbar?.();
    return this.bot.finish(true, `Stored ${count} ${c.item} in chest at ${c.position}.`);
  }
  withdraw(c) {
    this.requireReach(c.position, [BLOCKS.CHEST, BLOCKS.TRAPPED_CHEST]);
    this.game.chestManager ??= new ChestManager(this.game);
    const cm = this.game.chestManager;
    let chest = cm.getChest(...c.position);
    if (!chest) throw new Error('No chest at specified coordinates.');
    if (!cm.canOpen(c.position[0], c.position[1], c.position[2], this.game.world)) {
      throw new Error('This chest is obstructed.');
    }
    const id = itemId(c.item);
    const count = c.count ?? 1;
    const items = cm.getCombinedItems(c.position[0], c.position[1], c.position[2]);
    const available = items.reduce((sum, s) => sum + (s && this.sameItem(s.id, id) ? s.count : 0), 0);
    if (available < count) {
      throw new Error(`Not enough ${c.item} in chest (found ${available}).`);
    }
    let remaining = count;
    for (let i = 0; i < items.length && remaining > 0; i++) {
      const s = items[i];
      if (s && this.sameItem(s.id, id)) {
        const take = Math.min(remaining, s.count);
        s.count -= take;
        remaining -= take;
        if (s.count <= 0) cm.setCombinedSlot(c.position[0], c.position[1], c.position[2], i, null);
        else cm.setCombinedSlot(c.position[0], c.position[1], c.position[2], i, s);
      }
    }
    const isBlock = typeof id === 'number' || (BLOCKS[String(c.item).toUpperCase()] !== undefined);
    this.inventory.addItem(c.item, isBlock, count);
    this.inventory.updateHotbar?.();
    return this.bot.finish(true, `Withdrew ${count} ${c.item} from chest at ${c.position}.`);
  }
  open(c) {
    this.requireReach(c.position, [BLOCKS.CHEST, BLOCKS.TRAPPED_CHEST]);
    this.game.chestManager ??= new ChestManager(this.game);
    const cm = this.game.chestManager;
    if (!cm.canOpen(c.position[0], c.position[1], c.position[2], this.game.world)) {
      throw new Error('This chest is obstructed.');
    }
    cm.interact(c.position[0], c.position[1], c.position[2], this.game.player);
    return this.bot.finish(true, `Opened chest at ${c.position}.`);
  }
  build(c) {
    const [origX, origY, origZ] = c.position;
    let blocks = Array.isArray(c.schematic) ? c.schematic : (BUILTIN_SCHEMATICS[c.schematic] || BUILTIN_SCHEMATICS.shelter);
    if (!blocks || !blocks.length) throw new Error(`Unknown schematic: ${c.schematic}`);

    const sorted = [...blocks].sort((a, b) => a.offset[1] - b.offset[1]);
    let placedCount = 0;
    const isCreative = this.game.player.gamemode === 'creative';

    for (const b of sorted) {
      const bx = origX + b.offset[0], by = origY + b.offset[1], bz = origZ + b.offset[2];
      const itemKey = b.item;
      const id = itemId(itemKey);
      if (!isCreative && this.count(id) < 1) {
        continue;
      }
      if (String(itemKey).endsWith('_door') || itemKey === 'door' || itemKey === BLOCKS.OAK_DOOR) {
        if (this.game.doorManager) {
          this.game.doorManager.placeDoor(this.game.world, [bx, by, bz], 0);
        } else {
          this.game.world.setVoxel(bx, by, bz, BLOCKS.OAK_DOOR);
          this.game.world.setVoxel(bx, by + 1, bz, BLOCKS.OAK_DOOR_TOP);
        }
      } else if (itemKey === 'torch' || id === BLOCKS.TORCH) {
        this.game.world.setVoxel(bx, by, bz, BLOCKS.TORCH);
      } else {
        const blockId = typeof id === 'number' ? id : (ITEMS[id]?.blockId ?? BLOCKS[String(id).toUpperCase()]);
        if (typeof blockId === 'number') {
          this.game.world.setVoxel(bx, by, bz, blockId);
          const redstone=this.game.world.redstone;
          redstone?.configure?.([bx,by,bz],b.dir??0);
          const state=redstone?.state?.([bx,by,bz]);
          if(state){if(b.delay!==undefined)state.delay=b.delay;if(b.note!==undefined)state.note=b.note;if(b.subtract!==undefined)state.subtract=!!b.subtract;if(b.dot!==undefined)state.dot=!!b.dot;if(b.attach)state.attach=[...b.attach];}
        }
      }
      if (!isCreative) {
        this.remove(id, 1);
      }
      placedCount++;
    }
    this.inventory.updateHotbar?.();
    return this.bot.finish(true, `Built ${c.schematic} at ${c.position} (${placedCount} blocks placed).`);
  }
  wire(c) {
    const from = c.from, to = c.to;
    const id = itemId(c.item || 'redstone');
    const blockId = typeof id === 'number' ? id : (ITEMS[id]?.blockId ?? BLOCKS.REDSTONE_WIRE);
    const isCreative = this.game.player.gamemode === 'creative';

    const dx = Math.sign(to[0] - from[0]);
    const dy = Math.sign(to[1] - from[1]);
    const dz = Math.sign(to[2] - from[2]);
    let cx = from[0], cy = from[1], cz = from[2];
    let wiredCount = 0;

    while (true) {
      if (!isCreative && this.count(id) < 1) {
        throw new Error(`Out of ${c.item} for wiring.`);
      }
      this.game.world.setVoxel(cx, cy, cz, blockId);
      this.game.world?.redstone?.updateNeighbors?.([cx, cy, cz]);
      if (!isCreative) this.remove(id, 1);
      wiredCount++;
      if (cx === to[0] && cy === to[1] && cz === to[2]) break;
      if (cx !== to[0]) cx += dx;
      else if (cy !== to[1]) cy += dy;
      else if (cz !== to[2]) cz += dz;
    }
    this.inventory.updateHotbar?.();
    return this.bot.finish(true, `Wired ${c.item || 'redstone'} from ${c.from} to ${c.to} (${wiredCount} placed).`);
  }
  tick(t) {
    const c=t.command, p=this.game.player;
    // Out of reach of the block an action is aimed at: walk to the nearest spot in reach first, once, as a player does.
    // Every such action used to refuse with "Walk within reach of the station first." (Shelters play-test).
    // A trade is aimed at a mob: walk up to the nearest one of that kind first.
    if (c.type === 'trade' && c.mob && !t.approached) {
      t.approached = true;
      const mobs = (this.game.mobs?.mobs ?? []).filter((m) => m.type === c.mob && m.health > 0);
      const mob = mobs.sort((a, b) => a.mesh.position.distanceTo(p.position) - b.mesh.position.distanceTo(p.position))[0];
      if (mob && mob.mesh.position.distanceTo(p.position) > 2.5) {
        const m = mob.mesh.position, spot = this.standingSpotNear(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z));
        if (spot) { this.bot.walkForSurvival(spot); return; }
      }
    }
    if (Array.isArray(c.position) && !t.approached && c.type !== 'build' && c.type !== 'wire') {
      t.approached = true;
      const [x, y, z] = c.position;
      const eye = { x: p.position.x, y: p.position.y + 1.62, z: p.position.z };
      if (Math.hypot(x + .5 - eye.x, y + .5 - eye.y, z + .5 - eye.z) > 4.3) {
        const spot = this.standingSpotNear(x, y, z);
        if (spot) { this.bot.walkForSurvival(spot); return; }
      }
    }
    if(c.type==='activate'){
      if(!this.game.world.redstone?.state(c.position))throw new Error('There is no redstone control at that position.');
      this.requireReach(c.position,[this.game.world.getVoxel(...c.position)]);
      this.bot.lookAt({x:c.position[0]+.5,y:c.position[1]+.3,z:c.position[2]+.5});
      if(t.elapsed>5)throw new Error('Cannot see the redstone control.');
      return;
    }
    if (c.type === 'store') return this.store(c);
    if (c.type === 'withdraw') return this.withdraw(c);
    if (c.type === 'open') return this.open(c);
    if (c.type === 'build') return this.build(c);
    if (c.type === 'wire') return this.wire(c);
    if (c.type === 'place') {
      const [x,y,z]=c.position;
      if (this.game.world.getVoxel(x,y,z)!==BLOCKS.AIR) throw new Error('Placement cell is occupied.');
      if (!this.bot.equip(s => this.sameItem(s.id, itemId(c.item)))) {
        if (this.game.player.gamemode === 'creative') {
          const id = itemId(c.item);
          const isBlock = typeof id === 'number' || (BLOCKS[String(c.item).toUpperCase()] !== undefined);
          this.game.inventory.addItem(c.item, isBlock, 64);
          this.bot.equip(s => this.sameItem(s.id, id));
        }
      }
      if (!this.bot.equip(s => this.sameItem(s.id, itemId(c.item)))) throw new Error(`You do not have ${c.item}.`);
      const faces=[[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];
      t.faces ??= faces.filter(([a,b,d])=>!this.bot.passable(this.game.world.getVoxel(x+a,y+b,z+d)));
      if (!t.faces.length) throw new Error('Placement needs a supporting face.');
      p.isSneaking=true; p.botControls.ShiftLeft=true;
      // Aim where a player would: at a part of a supporting face that can actually be seen from the eye (the game's
      // own block raycast reaches that face first). A face's centre is often hidden or only grazed -- the block
      // beside it is in the way -- and the old aim at the centres then fell back to writing the block directly.
      const aim = this.placementAim(x, y, z, t.faces);
      // Nothing visible from here: step to a spot that has a view of a supporting face, as a player would, once.
      if (!aim && !t.repositioned) {
        t.repositioned = true;
        const spot = this.vantagePoint(x, y, z, t.faces);
        if (spot) { this.bot.walkForSurvival(spot); return; }
      }
      if (aim) {
        t.anchor = aim.anchor;
        this.requireReach([aim.anchor.x, aim.anchor.y, aim.anchor.z], [this.game.world.getVoxel(aim.anchor.x, aim.anchor.y, aim.anchor.z)]);
        this.bot.lookAt(aim.point);
      } else {
        const f=t.faces[Math.floor(t.elapsed/.25)%t.faces.length];
        t.anchor={x:x+f[0],y:y+f[1],z:z+f[2]};
        this.requireReach([t.anchor.x,t.anchor.y,t.anchor.z],[this.game.world.getVoxel(t.anchor.x,t.anchor.y,t.anchor.z)]);
        this.bot.lookAt({x:x+.5+f[0]*.501,y:y+.5+f[1]*.501,z:z+.5+f[2]*.501});
      }
      if(t.elapsed>4) throw new Error('No visible supporting face could place this block.');
    } else if(c.type==='cook') {
      this.requireReach(c.position,[BLOCKS.FURNACE,BLOCKS.LIT_FURNACE]);
      const manager=this.game.furnaceManager, f=manager.getOrCreateFurnace(...c.position);
      if(!t.loaded) {
        let id=itemId(c.item), fuel=itemId(c.fuel), count=c.count??1, fuelCount=c.fuelCount??1;
        let recipe=getSmeltingRecipe({id,isBlock:typeof id==='number'});
        if (!recipe) {
          for (const [inputKey, r] of Object.entries(SMELTING_RECIPES)) {
            if (this.sameItem(r.id, id)) {
              const candId = isNaN(Number(inputKey)) ? inputKey : Number(inputKey);
              if (this.count(candId) >= count) {
                id = candId;
                recipe = r;
                break;
              }
            }
          }
        }
        if(!recipe || !getFuelBurnTime(fuel)) throw new Error('Invalid smelting input or fuel.');
        // Empty slots are enough: a furnace still burning off its last fuel cooks the next batch with what is left of
        // it, as it does for a player who drops more in. Refusing a lit furnace stalled every second batch.
        if(f.input || f.fuel || f.output) throw new Error('Use an empty furnace (input, fuel and output slots).');
        if(this.count(id)<count || this.count(fuel)<fuelCount+(id===fuel?count:0)) throw new Error('Not enough input or fuel.');
        if(this.capacity(recipe)<count*recipe.count) throw new Error('Inventory has no room for cooked output.');
        manager.addItem(...c.position,id,typeof id==='number',count,'input'); this.remove(id,count);
        manager.addItem(...c.position,fuel,typeof fuel==='number',fuelCount,'fuel'); this.remove(fuel,fuelCount);
        t.loaded=true; t.recipe=recipe;
      }
      if((f.output?.count??0)>=(c.count??1)*t.recipe.count) {
        // Same shift-click output extraction as a human; parity probes separately
        // check whether the game grants the expected smelting experience.
        if (this.game.ui?.handleFurnaceOutputClick) {
          this.game.ui.handleFurnaceOutputClick(f,false,true);
        } else {
          this.inventory.addItem(f.output.id, f.output.isBlock, f.output.count);
          f.output = null;
        }
        this.bot.finish(true,`Cooked and collected ${c.count??1} ${c.item}.`);
        return;
      }
      if(!f.input && !f.output) throw new Error('Cooking output disappeared.');
    } else if(c.type==='eat') {
      // Eating finishes inside the game loop (eating.js), so by this tick the food may already be gone: that is done.
      if (t.before !== undefined && this.count(itemId(c.item)) < t.before) { this.bot.finish(true, `Ate ${c.item}.`); return; }
      if(!this.bot.equip(s => this.sameItem(s.id, itemId(c.item)))) throw new Error('Food is missing.');
      t.before ??= this.count(itemId(c.item));
      // The game's own rule (canEat): hunger decides, health does not; milk and potions can always be drunk.
      if (!canEat(c.item, p.hunger, { creative: p.gamemode === 'creative', maxHunger: p.maxHunger || 20 }) && c.item !== 'milk_bucket' && !isDrinkablePotion(c.item) && !c.item.includes('potion')) {
        this.bot.finish(true, `Player is already full; did not consume ${c.item}.`);
        return;
      }
      this.bot.lookAt({x:p.position.x,y:p.position.y-1,z:p.position.z});
      // Eating is held for 1.6 s (2 s for a honey bottle; eating.js) before the game consumes the food.
      if(t.elapsed>3.5) throw new Error('Game did not consume the food.');
    } else if(c.type==='sleep') {
      const targetVoxel = this.game.world?.getVoxel(...c.position);
      if (BLOCK_DEFS[targetVoxel]?.bed) {
        this.requireReach(c.position, [targetVoxel]);
      } else {
        this.requireReach(c.position, [BLOCKS.RED_BED_FOOT, BLOCKS.RED_BED_HEAD]);
      }
      if (!t.started) {
        const result=this.game.bedManager ? this.game.bedManager.interact(...c.position,p) : { success: true, reason: 'Entered the bed.' };
        if (!result.success) {
          this.bot.finish(false, result.reason || 'Entered the bed.');
          return;
        }
        t.started = true;
      }
      if (this.game.bedManager?.isSleeping) {
        return;
      }
      this.bot.finish(true, 'Slept through the night and woke up at dawn.');
    } else if (c.type === 'till') {
      const [x, y, z] = c.position;
      this.requireReach(c.position, [BLOCKS.DIRT, BLOCKS.GRASS, BLOCKS.DIRT_PATH, BLOCKS.FARMLAND, BLOCKS.FARMLAND_MOIST, BLOCKS.PODZOL, BLOCKS.MYCELIUM, BLOCKS.MOSS_BLOCK].filter(v => v !== undefined));
      if (!this.bot.equip(s => isHoe(s?.id))) throw new Error('You need a hoe to till.');
      this.bot.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      if (t.elapsed > 3) throw new Error('Tilling timed out.');
    } else if (c.type === 'use') {
      const [x, y, z] = c.position;
      const v = this.game.world.getVoxel(x, y, z);
      this.requireReach(c.position, [v]);
      if (!this.bot.equip(s => this.sameItem(s?.id, itemId(c.item)))) {
        if (this.game.player.gamemode === 'creative') {
          const id = itemId(c.item);
          const isBlock = typeof id === 'number' || (BLOCKS[String(c.item).toUpperCase()] !== undefined);
          this.game.inventory.addItem(c.item, isBlock, 64);
          this.bot.equip(s => this.sameItem(s?.id, id));
        }
      }
      if (!this.bot.equip(s => this.sameItem(s?.id, itemId(c.item)))) throw new Error(`You do not have ${c.item}.`);
      t.before ??= this.count(itemId(c.item));
      // Shears on a full hive give honeycomb and change no block: any change to the inventory is the use landing.
      t.beforeInventory ??= this.inventorySignature();
      this.bot.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      if (t.elapsed > 3) throw new Error(`Using ${c.item} timed out.`);
    } else if (c.type === 'brew') {
      this.requireReach(c.position, [BLOCKS.BREWING_STAND]);
      const bm = this.game.brewingManager || this.game.ui?.brewingManager || (this.game.brewingManager = new BrewingManager());
      const stand = bm.getOrCreateStand(...c.position);
      const isCreative = p.gamemode === 'creative';
      const ingId = itemId(c.item);
      const bottleId = itemId(c.bottle || 'water_bottle');
      const count = c.count ?? 1;
      const bottleCount = Math.min(3, c.bottleCount ?? 3);

      if (!t.loaded) {
        if (isCreative) {
          if (stand.fuel <= 0) stand.addFuel({ id: 'blaze_powder' });
          if (this.count(ingId) < count) {
            this.inventory.addItem(ingId, false, count);
          }
          if (this.count(bottleId) < bottleCount) {
            this.inventory.addItem(bottleId, false, bottleCount);
          }
        } else {
          if (stand.fuel <= 0) {
            if (!this.bot.equip(s => s && s.id === 'blaze_powder') || !stand.addFuel({ id: 'blaze_powder' })) {
              throw new Error('Brewing stand needs blaze powder fuel.');
            }
            this.remove('blaze_powder', 1);
          }
        }

        if (this.count(ingId) < count) throw new Error(`Not enough ${c.item} to brew.`);
        if (this.count(bottleId) < bottleCount) throw new Error(`Not enough ${c.bottle || 'water_bottle'} to brew.`);

        stand.ingredient = { id: ingId, count };
        this.remove(ingId, count);

        stand.bottles = [null, null, null];
        for (let i = 0; i < bottleCount; i++) {
          stand.bottles[i] = { id: bottleId, count: 1 };
          this.remove(bottleId, 1);
        }

        if (!stand.canBrew()) throw new Error(`Cannot brew ${c.item} into ${c.bottle || 'water_bottle'}.`);
        t.loaded = true;
      }

      if (isCreative || t.elapsed >= stand.brewDuration) {
        stand.completeBrew();
        let collectedCount = 0;
        let resultId = null;
        for (let i = 0; i < 3; i++) {
          if (stand.bottles[i]) {
            resultId = stand.bottles[i].id;
            this.inventory.addItem(stand.bottles[i].id, false, stand.bottles[i].count);
            collectedCount += stand.bottles[i].count;
            stand.bottles[i] = null;
          }
        }
        stand.ingredient = null;
        this.bot.finish(true, `Brewed and collected ${collectedCount} ${resultId || 'potions'}.`);
        return;
      } else {
        stand.update(0.5);
      }
    } else if (c.type === 'enchant') {
      this.requireReach(c.position, [BLOCKS.ENCHANTING_TABLE]);
      const isCreative = p.gamemode === 'creative';
      const targetId = itemId(c.item);

      if (!this.bot.equip(s => this.sameItem(s?.id, targetId))) {
        if (isCreative) {
          this.inventory.addItem(targetId, typeof targetId === 'number', 1);
          this.bot.equip(s => this.sameItem(s?.id, targetId));
        }
      }
      if (!this.bot.equip(s => this.sameItem(s?.id, targetId))) {
        throw new Error(`You do not have ${c.item} to enchant.`);
      }

      const stack = this.inventory.getActiveItem();
      if (!stack) throw new Error('No active item selected for enchanting.');

      const shelves = calculateBookshelfCount(this.game.world, c.position[0], c.position[1], c.position[2]);
      const offers = generateEnchantmentOffers(stack, shelves);
      if (!offers.length) throw new Error(`Item ${c.item} cannot be enchanted or no offers available.`);

      const slot = Math.max(0, Math.min(offers.length - 1, c.slot ?? 2));
      const chosenOffer = offers[slot];

      if (!isCreative) {
        if (this.count('lapis_lazuli') < chosenOffer.lapisCost) {
          throw new Error(`Enchanting slot requires ${chosenOffer.lapisCost} lapis lazuli.`);
        }
        this.remove('lapis_lazuli', chosenOffer.lapisCost);
      }

      const success = applyEnchantment(stack, chosenOffer, p, this.game.ui, this.game.sounds);
      if (!success) throw new Error('Enchantment failed: level requirement not met.');

      this.inventory.updateHotbar?.();
      const enchNames = [chosenOffer.primary, ...(chosenOffer.additional || [])].map(e => `${e.name} ${e.level}`).join(', ');
      this.bot.finish(true, `Enchanted ${stack.id} with ${enchNames}.`);
      return;
    } else if (c.type === 'smith') {
      // The table's own slots and its own take-output rule, so the bot cannot produce a result the player's
      // clicks could not. The inputs are moved out of the inventory first, as a click moves them into a slot,
      // and put back on any refusal so a failed smith leaves the inventory as it was.
      this.requireReach(c.position, [BLOCKS.SMITHING_TABLE]);
      const ui = this.game.ui;
      if (!ui || typeof ui.takeSmithingOutput !== 'function') throw new Error('The smithing table has no interface to use.');
      if (this.inventory.cursorItem) throw new Error('Empty the cursor before smithing.');
      if (ui.smithingTemplateItem || ui.smithingBaseItem || ui.smithingAdditionItem) throw new Error('The smithing table already has items in it.');
      const templateId = resolveSmithingTemplate(c.template);
      if (!templateId) throw new Error(`Unknown smithing template: ${c.template}`);
      const isCreative = p.gamemode === 'creative';
      const freeSlots = () => this.slots().flat().filter(s => !s).length;
      const stow = (stack) => {
        const list = this.slots().find(l => l.some(s => !s));
        if (!list) return false;
        list[list.findIndex(s => !s)] = stack;
        return true;
      };
      const fetch = (name) => {
        const id = itemId(name);
        if (isCreative && this.count(id) === 0) this.inventory.addItem(id, typeof id === 'number', 1);
        const one = this.remove(id, 1);
        if (!one) throw new Error(`You do not have ${name}.`);
        return one;
      };

      const taken = [];
      const giveBack = () => { for (const s of taken) if (s) stow(s); taken.length = 0; };
      try {
        const template = fetch(templateId); taken.push(template);
        const base = fetch(c.base); taken.push(base);
        const addition = fetch(c.addition); taken.push(addition);

        const calc = calculateSmithingResult(template, base, addition);
        if (!calc.valid) throw new Error(calc.reason);
        // The result needs a slot, and an upgrade's surviving template needs another. Checked before the table
        // consumes anything, so a full inventory refuses rather than losing the result.
        if (freeSlots() < (calc.templateSurvives ? 2 : 1)) throw new Error('Make room in the inventory for the smithing result.');

        ui.smithingTemplateItem = template; ui.smithingBaseItem = base; ui.smithingAdditionItem = addition;
        ui.takeSmithingOutput(calc);
        const result = this.inventory.cursorItem;
        this.inventory.cursorItem = null;
        taken.length = 0;
        // An upgrade keeps its template: the table leaves it in its slot, so it goes back to the inventory here.
        if (ui.smithingTemplateItem) { stow(ui.smithingTemplateItem); ui.smithingTemplateItem = null; }
        if (!result || !stow(result)) throw new Error('The smithing result could not be stored.');
        ui.renderSmithingGUI?.();
        this.inventory.updateHotbar?.();
        this.bot.finish(true, `Smithed ${result.id}${result.trim ? ` with a ${result.trim.name} trim` : ''}.`);
      } catch (error) {
        giveBack();
        ui.smithingTemplateItem = null; ui.smithingBaseItem = null; ui.smithingAdditionItem = null;
        throw error;
      }
      return;
    } else if (c.type === 'anvil') {
      this.requireReach(c.position, [BLOCKS.ANVIL, BLOCKS.CHIPPED_ANVIL, BLOCKS.DAMAGED_ANVIL]);
      const isCreative = p.gamemode === 'creative';
      const leftId = itemId(c.left);
      const rightId = c.right ? itemId(c.right) : null;
      if (this.count(leftId) < 1) throw new Error(`You do not have ${c.left}.`);
      if (rightId && this.count(rightId) < 1) throw new Error(`You do not have ${c.right}.`);

      const left = this.remove(leftId, 1);
      const right = rightId ? this.remove(rightId, 1) : null;
      const calc = calculateAnvilResult(left, right, c.customName || '', p.gamemode);
      if (!calc.valid || !calc.result) {
        if (left) this.inventory.addItem(left);
        if (right) this.inventory.addItem(right);
        throw new Error(calc.tooExpensive ? 'Too Expensive!' : 'Anvil combination is invalid.');
      }
      if (!isCreative && (p.level || 0) < calc.levelCost) {
        if (left) this.inventory.addItem(left);
        if (right) this.inventory.addItem(right);
        throw new Error(`Enchantment cost (${calc.levelCost}) exceeds player level (${p.level || 0}).`);
      }
      if (!isCreative && calc.levelCost > 0) {
        consumePlayerLevels(p, calc.levelCost);
      }
      if (right && calc.materialUnitsConsumed < (right.count || 1)) {
        right.count -= (calc.materialUnitsConsumed || 1);
        if (right.count > 0) this.inventory.addItem(right);
      }
      this.inventory.addItem(calc.result);
      const curBlock = this.game.world.getVoxel(c.position[0], c.position[1], c.position[2]);
      const nextBlock = getAnvilDegradation(curBlock);
      if (nextBlock !== curBlock) {
        this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], nextBlock);
      }
      this.inventory.updateHotbar?.();
      this.bot.finish(true, `Used anvil to produce ${calc.result.customName || calc.result.id} (cost: ${calc.levelCost} levels).`);
      return;
    } else if (c.type === 'trade') {
      const isCreative = p.gamemode === 'creative';
      const mobsList = this.game.mobs?.mobs || [];
      const targetMob = mobsList.find(m => {
        if (c.mob === 'wandering_trader' || c.mob === 'trader') {
          return m.type === 'wandering_trader';
        }
        if (c.mob === 'villager') {
          return m.type === 'villager';
        }
        return m.type === c.mob || m.profession === c.mob;
      }) || this.game.targetMob;

      if (!targetMob) throw new Error(`Merchant ${c.mob} not found nearby.`);

      const pPos = p.position;
      const mPos = targetMob.mesh ? targetMob.mesh.position : targetMob.position || pPos;
      if (Math.hypot(pPos.x - mPos.x, pPos.y - mPos.y, pPos.z - mPos.z) > 4.5) {
        throw new Error('Walk within reach of the merchant first.');
      }

      if (!targetMob.trades || !targetMob.trades.length) {
        throw new Error('Merchant has no trades available.');
      }

      let trade = null;
      if (c.item) {
        const itemTarget = itemId(c.item);
        trade = targetMob.trades.find(t => this.sameItem(t.reward?.id, itemTarget) || this.sameItem(t.cost?.id, itemTarget));
      }
      if (!trade) {
        trade = targetMob.trades.find(t => !t.disabled && t.uses < t.maxUses) || targetMob.trades[0];
      }

      const times = c.count ?? 1;
      let tradesCompleted = 0;
      for (let i = 0; i < times; i++) {
        const res = executeTrade(trade, targetMob, this.inventory, this.game.sounds, {
          player: p,
          ui: this.game.ui,
          isCreative,
          kind: targetMob.type === 'wandering_trader' ? 'wandering_trader' : 'villager'
        });
        if (!res.success) {
          if (tradesCompleted === 0) throw new Error(`Trade failed: ${res.reason}`);
          break;
        }
        tradesCompleted++;
      }

      this.inventory.updateHotbar?.();
      this.bot.finish(true, `Completed ${tradesCompleted} trades with ${c.mob}.`);
      return;
    }
  }
  afterRaycast(t) {
    const c=t.command, target=this.game.targetBlock, p=this.game.player;
    if(c.type==='activate'){
      if(!target||[target.x,target.y,target.z].some((v,i)=>v!==c.position[i]))return;
      const state=this.game.world.redstone.state(c.position),before=JSON.stringify(state);
      if(!this.game.handleRightClick)throw new Error('Gameplay interaction is unavailable.');
      this.game.handleRightClick();
      this.bot.finish(JSON.stringify(this.game.world.redstone.state(c.position))!==before,'Activated redstone control at '+c.position+'.');
      return;
    }
    if(c.type==='eat') {
      if (isDrinkablePotion(c.item)) {
        drinkPotion(c.item, p, this.inventory, { gamemode: p.gamemode });
        this.bot.finish(true, `Drank ${c.item}.`);
        return;
      }
      if (typeof this.game.handleRightClick === 'function') {
        this.game.handleRightClick();
      } else {
        this.remove(itemId(c.item), 1);
        p.hunger = Math.min(p.maxHunger || 20, (p.hunger || 0) + 4);
      }
      if(this.count(itemId(c.item))<t.before) this.bot.finish(true,`Ate ${c.item}.`);
    } else if (c.type === 'till') {
      const [x, y, z] = c.position;
      if (typeof this.game.handleRightClick === 'function') {
        this.game.handleRightClick();
      } else if (this.game.farmingManager) {
        this.game.farmingManager.till(x, y, z, p);
      } else {
        this.game.world.setVoxel(x, y, z, BLOCKS.FARMLAND);
      }
      const vox = this.game.world.getVoxel(x, y, z);
      if (vox === BLOCKS.FARMLAND || vox === BLOCKS.FARMLAND_MOIST) {
        this.bot.finish(true, `Tilled soil at ${c.position}.`);
      }
    } else if (c.type === 'use') {
      const [x, y, z] = c.position;
      t.beforeVoxel ??= this.game.world.getVoxel(x, y, z);
      if (typeof this.game.handleRightClick === 'function') {
        this.game.handleRightClick();
        if (c.item === 'bone_meal') {
          let crop = getCropInfo(this.game.world.getVoxel(x, y, z));
          while (crop && !crop.isMature && this.count('bone_meal') > 0) {
            this.game.handleRightClick();
            crop = getCropInfo(this.game.world.getVoxel(x, y, z));
          }
        }
      } else if (c.item === 'flint_and_steel') {
        if (this.game.portalManager) {
          this.game.portalManager.ignitePortal(this.game.world, x, y, z);
        } else {
          lightPortal(this.game.world, x, y, z);
        }
      } else if (c.item === 'ender_eye') {
        if (insertEye(this.game.world, x, y, z)) {
          if (p.gamemode !== 'creative') this.remove('ender_eye', 1);
          tryActivateAround(this.game.world, x, y, z);
        }
      } else if (this.game.farmingManager && c.item === 'bone_meal') {
        this.game.farmingManager.applyBoneMeal(x, y, z, p);
        let crop = getCropInfo(this.game.world.getVoxel(x, y, z));
        while (crop && !crop.isMature && this.count('bone_meal') > 0) {
          this.game.farmingManager.applyBoneMeal(x, y, z, p);
          crop = getCropInfo(this.game.world.getVoxel(x, y, z));
        }
      }
      const voxAfter = this.game.world.getVoxel(x, y, z);
      if (
        this.count(itemId(c.item)) < t.before ||
        voxAfter !== t.beforeVoxel ||
        (t.beforeInventory !== undefined && this.inventorySignature() !== t.beforeInventory) ||
        this.game.world.getVoxel(x, y + 1, z) === BLOCKS.NETHER_PORTAL ||
        this.game.world.getVoxel(x, y, z) === BLOCKS.NETHER_PORTAL ||
        this.game.world.getVoxel(x, y, z) === BLOCKS.END_PORTAL_FRAME_FILLED
      ) {
        this.bot.finish(true, `Used ${c.item} at ${c.position}.`);
      }
    } else if(c.type==='place') {
      const actual = target?.normal ? [target.x+target.normal.x,target.y+target.normal.y,target.z+target.normal.z] : null;
      const matched = actual && !actual.some((n,i)=>n!==c.position[i]);
      // Only ever place the way a player does: through the game's own right-click, once the crosshair is on a face
      // next to the target. The aim phase above keeps turning between the supporting faces and gives up after 4 s.
      // This used to fall through after 1 s (at once in creative) to writing the block straight into the world --
      // seeds became a crop on bare grass, beds and doors skipped their placement rules -- so a "placed" result did
      // not show that a player could have placed it. The direct paths remain only for a host with no right-click.
      if (!matched && (typeof this.game.handleRightClick === 'function' || (p.gamemode !== 'creative' && t.elapsed < 1.0))) return;
      const before=this.count(itemId(c.item));
      if (matched && typeof this.game.handleRightClick === 'function') {
        this.game.handleRightClick();
      } else if (String(c.item).endsWith('_bed') || c.item === 'bed' || c.item === BLOCKS.RED_BED_FOOT || BLOCK_DEFS[c.item]?.bed) {
        if (this.game.bedManager) {
          const res = this.game.bedManager.placeBed(this.game.world, c.position, 3, c.item);
          if (res.success && p.gamemode !== 'creative') this.remove(itemId(c.item), 1);
        } else {
          this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], BLOCKS.RED_BED_FOOT);
          if (p.gamemode !== 'creative') this.remove(itemId(c.item), 1);
        }
      } else if (String(c.item).endsWith('_door') || c.item === 'door' || c.item === BLOCKS.OAK_DOOR || c.item === BLOCKS.IRON_DOOR) {
        if (this.game.doorManager) {
          const isIron = c.item === 'iron_door' || c.item === BLOCKS.IRON_DOOR;
          const res = this.game.doorManager.placeDoor(this.game.world, c.position, 3, isIron);
          if (res.success && p.gamemode !== 'creative') this.remove(itemId(c.item), 1);
        } else {
          this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], BLOCKS.OAK_DOOR);
          this.game.world.setVoxel(c.position[0], c.position[1] + 1, c.position[2], BLOCKS.OAK_DOOR_TOP);
          if (p.gamemode !== 'creative') this.remove(itemId(c.item), 1);
        }
      } else if (c.item === 'wheat_seeds' || c.item === 'seeds') {
        this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], BLOCKS.WHEAT_STAGE_0);
        if (p.gamemode !== 'creative') this.remove(itemId(c.item), 1);
      } else {
        const id = itemId(c.item);
        const blockId = typeof id === 'number' ? id : (ITEMS[id]?.blockId ?? BLOCKS[String(id).toUpperCase()]);
        if (typeof blockId === 'number') {
          this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], blockId);
          // The same vibration a player's placement makes (sculkSensor.js).
          this.game.vibration?.(c.position[0], c.position[1], c.position[2], 'block_place', { fromWool: /WOOL|CARPET/.test(Object.keys(BLOCKS).find((k) => BLOCKS[k] === blockId) ?? '') });
          if (p.gamemode !== 'creative') this.remove(id, 1);
          if (blockId === BLOCKS.WITHER_SKELETON_SKULL_BLOCK || blockId === BLOCKS.WITHER_SKELETON_SKULL) {
            this.game.bossManager?.checkWitherSummon?.(c.position[0], c.position[1], c.position[2]);
          }
          if (blockId === BLOCKS.CARVED_PUMPKIN || blockId === BLOCKS.JACK_O_LANTERN) this.game.buildGolemAt?.(c.position[0], c.position[1], c.position[2]);
        }
      }
      const [x,y,z]=c.position;
      const witherSpawned = !!(this.game.bossManager?.wither && this.game.bossManager.wither.health > 0);
      if((this.game.world.getVoxel(x,y,z)!==BLOCKS.AIR || witherSpawned) && (p.gamemode === 'creative' || this.count(itemId(c.item))===before-1)) this.bot.finish(true,`Placed ${c.item} at ${c.position}.`);
    }
  }
}
