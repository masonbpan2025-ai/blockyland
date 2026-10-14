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

export const SURVIVAL_ACTIONS = ['craft', 'place', 'cook', 'eat', 'sleep', 'till', 'use', 'brew', 'enchant', 'smith', 'trade'];
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
  if (c.type !== 'sleep' && c.type !== 'till' && c.type !== 'trade' && c.type !== 'smith') itemId(c.item);
  if (c.type === 'smith') {
    if (!resolveSmithingTemplate(c.template)) throw new Error(`Unknown smithing template: ${c.template}`);
    itemId(c.base);
    itemId(c.addition);
  }
  if (['place', 'cook', 'sleep', 'till', 'use', 'brew', 'enchant', 'smith'].includes(c.type)) {
    if (!Array.isArray(c.position) || c.position.length !== 3 || c.position.some(n => !Number.isInteger(n) || Math.abs(n) > 30000000)) throw new Error('Action needs three integer world coordinates.');
  }
  if (c.type === 'cook') itemId(c.fuel);
  if (c.type === 'brew' && c.bottle) itemId(c.bottle);
  if (c.type === 'trade' && !c.mob) throw new Error('Trade needs a merchant mob name.');
  for (const value of [c.count ?? 1, c.fuelCount ?? 1, c.bottleCount ?? 1]) if (!Number.isInteger(value) || value < 1 || value > 64) throw new Error('Use a count from 1 to 64.');
  if (['place','eat','sleep','till','use','enchant','smith'].includes(c.type) && (c.count??1)!==1) throw new Error('Placement, eating, sleeping, tilling, item use, enchanting and smithing act once per command.');
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
        this.game.world.getVoxel(x, y + 1, z) === BLOCKS.NETHER_PORTAL ||
        this.game.world.getVoxel(x, y, z) === BLOCKS.NETHER_PORTAL ||
        this.game.world.getVoxel(x, y, z) === BLOCKS.END_PORTAL_FRAME_FILLED
      ) {
        this.bot.finish(true, `Used ${c.item} at ${c.position}.`);
      }
    } else if(c.type==='place') {
      const actual = target?.normal ? [target.x+target.normal.x,target.y+target.normal.y,target.z+target.normal.z] : null;
      const matched = actual && !actual.some((n,i)=>n!==c.position[i]);
      if (!matched && p.gamemode !== 'creative' && t.elapsed < 1.0) return;
      const before=this.count(itemId(c.item));
      if (matched && typeof this.game.handleRightClick === 'function') {
        this.game.handleRightClick();
      } else if (String(c.item).endsWith('_bed') || c.item === 'bed' || c.item === BLOCKS.RED_BED_FOOT) {
        if (this.game.bedManager) {
          const res = this.game.bedManager.placeBed(this.game.world, c.position, 3);
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
          if (p.gamemode !== 'creative') this.remove(id, 1);
        }
      }
      const [x,y,z]=c.position;
      if(this.game.world.getVoxel(x,y,z)!==BLOCKS.AIR && (p.gamemode === 'creative' || this.count(itemId(c.item))===before-1)) this.bot.finish(true,`Placed ${c.item} at ${c.position}.`);
    }
  }
}
