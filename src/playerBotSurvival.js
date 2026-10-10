import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from './blocks.js';
import { RECIPES_2X2, RECIPES_3X3 } from './crafting.js';
import { getSmeltingRecipe, getFuelBurnTime, SMELTING_RECIPES } from './furnace.js';
import { isHoe, getCropInfo } from './farming.js';

export const SURVIVAL_ACTIONS = ['craft', 'place', 'cook', 'eat', 'sleep', 'till', 'use'];
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
  if (c.type !== 'sleep' && c.type !== 'till') itemId(c.item);
  if (['place', 'cook', 'sleep', 'till', 'use'].includes(c.type)) {
    if (!Array.isArray(c.position) || c.position.length !== 3 || c.position.some(n => !Number.isInteger(n) || Math.abs(n) > 30000000)) throw new Error('Action needs three integer world coordinates.');
  }
  if (c.type === 'cook') itemId(c.fuel);
  for (const value of [c.count ?? 1, c.fuelCount ?? 1]) if (!Number.isInteger(value) || value < 1 || value > 64) throw new Error('Use a count from 1 to 64.');
  if (['place','eat','sleep','till','use'].includes(c.type) && (c.count??1)!==1) throw new Error('Placement, eating, sleeping, tilling and item use act once per command.');
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
      const candidates = recipes.filter(({ r }) => String(r.result?.id) === String(id)
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
  tick(t) {
    const c=t.command, p=this.game.player;
    if (c.type === 'place') {
      const [x,y,z]=c.position;
      if (this.game.world.getVoxel(x,y,z)!==BLOCKS.AIR) throw new Error('Placement cell is occupied.');
      if (!this.bot.equip(s => this.sameItem(s.id, itemId(c.item)))) throw new Error(`You do not have ${c.item}.`);
      const faces=[[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];
      t.faces ??= faces.filter(([a,b,d])=>!this.bot.passable(this.game.world.getVoxel(x+a,y+b,z+d)));
      if (!t.faces.length) throw new Error('Placement needs a supporting face.');
      const f=t.faces[Math.floor(t.elapsed/.25)%t.faces.length];
      t.anchor={x:x+f[0],y:y+f[1],z:z+f[2]};
      this.requireReach([t.anchor.x,t.anchor.y,t.anchor.z],[this.game.world.getVoxel(t.anchor.x,t.anchor.y,t.anchor.z)]);
      this.bot.lookAt({x:x+.5+f[0]*.501,y:y+.5+f[1]*.501,z:z+.5+f[2]*.501});
      p.isSneaking=true; p.botControls.ShiftLeft=true;
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
        if(f.input || f.fuel || f.output || f.burnTime>0) throw new Error('Use an empty, unlit furnace.');
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
      if(!this.bot.equip(s => this.sameItem(s.id, itemId(c.item)))) throw new Error('Food is missing.');
      t.before ??= this.count(itemId(c.item));
      if (p.hunger >= (p.maxHunger || 20) && p.health >= (p.maxHealth || 20) && !['golden_apple', 'enchanted_golden_apple', 'chorus_fruit'].includes(c.item)) {
        this.bot.finish(true, `Player is already full; did not consume ${c.item}.`);
        return;
      }
      this.bot.lookAt({x:p.position.x,y:p.position.y-1,z:p.position.z});
      if(t.elapsed>2) throw new Error('Game did not consume the food.');
    } else if(c.type==='sleep') {
      this.requireReach(c.position,[BLOCKS.RED_BED_FOOT,BLOCKS.RED_BED_HEAD]);
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
      this.requireReach(c.position, [BLOCKS.DIRT, BLOCKS.GRASS, BLOCKS.FARMLAND, BLOCKS.FARMLAND_MOIST, BLOCKS.PODZOL, BLOCKS.MYCELIUM, BLOCKS.MOSS_BLOCK].filter(v => v !== undefined));
      if (!this.bot.equip(s => isHoe(s?.id))) throw new Error('You need a hoe to till.');
      this.bot.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      if (t.elapsed > 3) throw new Error('Tilling timed out.');
    } else if (c.type === 'use') {
      const [x, y, z] = c.position;
      const v = this.game.world.getVoxel(x, y, z);
      this.requireReach(c.position, [v]);
      if (!this.bot.equip(s => this.sameItem(s?.id, itemId(c.item)))) throw new Error(`You do not have ${c.item}.`);
      t.before ??= this.count(itemId(c.item));
      this.bot.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      if (t.elapsed > 3) throw new Error(`Using ${c.item} timed out.`);
    }
  }
  afterRaycast(t) {
    const c=t.command, target=this.game.targetBlock, p=this.game.player;
    if(c.type==='eat') {
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
      } else if (this.game.farmingManager && c.item === 'bone_meal') {
        this.game.farmingManager.applyBoneMeal(x, y, z, p);
        let crop = getCropInfo(this.game.world.getVoxel(x, y, z));
        while (crop && !crop.isMature && this.count('bone_meal') > 0) {
          this.game.farmingManager.applyBoneMeal(x, y, z, p);
          crop = getCropInfo(this.game.world.getVoxel(x, y, z));
        }
      }
      const voxAfter = this.game.world.getVoxel(x, y, z);
      if (this.count(itemId(c.item)) < t.before || voxAfter !== t.beforeVoxel) {
        this.bot.finish(true, `Used ${c.item} at ${c.position}.`);
      }
    } else if(c.type==='place' && target?.normal) {
      const actual=[target.x+target.normal.x,target.y+target.normal.y,target.z+target.normal.z];
      if(actual.some((n,i)=>n!==c.position[i])) return;
      const before=this.count(itemId(c.item));
      if (typeof this.game.handleRightClick === 'function') {
        this.game.handleRightClick();
      } else if (String(c.item).endsWith('_bed') || c.item === 'bed' || c.item === BLOCKS.RED_BED_FOOT) {
        if (this.game.bedManager) {
          const res = this.game.bedManager.placeBed(this.game.world, c.position, 3);
          if (res.success) this.remove(itemId(c.item), 1);
        } else {
          this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], BLOCKS.RED_BED_FOOT);
          this.remove(itemId(c.item), 1);
        }
      } else if (String(c.item).endsWith('_door') || c.item === 'door' || c.item === BLOCKS.OAK_DOOR || c.item === BLOCKS.IRON_DOOR) {
        if (this.game.doorManager) {
          const isIron = c.item === 'iron_door' || c.item === BLOCKS.IRON_DOOR;
          const res = this.game.doorManager.placeDoor(this.game.world, c.position, 3, isIron);
          if (res.success) this.remove(itemId(c.item), 1);
        } else {
          this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], BLOCKS.OAK_DOOR);
          this.game.world.setVoxel(c.position[0], c.position[1] + 1, c.position[2], BLOCKS.OAK_DOOR_TOP);
          this.remove(itemId(c.item), 1);
        }
      } else if (c.item === 'wheat_seeds' || c.item === 'seeds') {
        this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], BLOCKS.WHEAT_STAGE_0);
        this.remove(itemId(c.item), 1);
      } else {
        const id = itemId(c.item);
        const blockId = typeof id === 'number' ? id : (ITEMS[id]?.blockId ?? BLOCKS[String(id).toUpperCase()]);
        if (typeof blockId === 'number') {
          this.game.world.setVoxel(c.position[0], c.position[1], c.position[2], blockId);
          this.remove(id, 1);
        }
      }
      const [x,y,z]=c.position;
      if(this.game.world.getVoxel(x,y,z)!==BLOCKS.AIR && this.count(itemId(c.item))===before-1) this.bot.finish(true,`Placed ${c.item} at ${c.position}.`);
    }
  }
}
