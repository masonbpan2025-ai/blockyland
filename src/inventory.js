import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from './blocks.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from './crafting.js';
import { BuildingLibrary } from './buildingLibrary.js';
import { MobLibrary } from './mobLibrary.js';

export class Inventory {
  constructor(sounds = {}) {
    this.sounds = sounds || {};

    // 9 Hotbar slots + 27 Main Storage slots
    this.hotbar = new Array(9).fill(null);
    this.storage = new Array(27).fill(null);
    this.activeSlot = 0;

    // Armor slots: head, chest, legs, feet
    this.armor = { head: null, chest: null, legs: null, feet: null };

    // Off-hand slot
    this.offhand = null;

    // Crafting grids
    this.craft2x2 = new Array(4).fill(null);
    this.craft2x2Result = null;

    this.craft3x3 = new Array(9).fill(null);
    this.craft3x3Result = null;

    // Item stack currently being held by mouse cursor
    this.cursorItem = null;

    this.initDefaultItems();
  }

  initDefaultItems() {
    // Starting items: hotbar[0] is null so player starts with just bare fist in hand
    this.hotbar[0] = null;
    this.hotbar[1] = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
    this.hotbar[2] = { id: BLOCKS.OAK_LOG, isBlock: true, count: 32 };
    this.hotbar[3] = { id: BLOCKS.COBBLESTONE, isBlock: true, count: 64 };
    this.hotbar[4] = { id: BLOCKS.TORCH, isBlock: true, count: 16 };
    this.hotbar[5] = { id: BLOCKS.TNT, isBlock: true, count: 12 };
    this.hotbar[6] = { id: 'bread', isBlock: false, count: 10 };
    this.hotbar[7] = { id: 'emerald', isBlock: false, count: 15 };
    this.hotbar[8] = { id: 'wheat', isBlock: false, count: 20 };

    // Move sword to storage inventory so player does not start with sword in hand
    this.storage[0] = { id: 'diamond_sword', isBlock: false, count: 1 };
  }

  getItemMeta(item) {
    if (!item) return null;
    if (item.isBuilding || (typeof item.id === 'string' && item.id.startsWith('building_'))) {
      const structId = item.buildingId || item.id.replace('building_', '');
      const st = BuildingLibrary?.getBuilding(structId);
      return {
        id: item.id,
        name: st ? st.name : (item.name || 'Building'),
        icon: st?.icon || item.icon || '/assets/blocks/crafting_table_top.png',
        isBlock: false,
        isBuilding: true,
        buildingId: st?.id || structId,
        count: item.count || 1
      };
    }
    if (item.isSpawnEgg || item.customMobId || (typeof item.id === 'string' && item.id.startsWith('spawn_egg_') && !ITEMS[item.id])) {
      const mobId = item.customMobId || item.id.replace('spawn_egg_', '');
      const mobDef = MobLibrary?.getMob(mobId);
      if (mobDef) {
        const primary = mobDef.eggColors?.primary || mobDef.look?.mainColor || '#7c3aed';
        const secondary = mobDef.eggColors?.secondary || mobDef.look?.accentColor || '#ec4899';
        const icon = item.icon || (MobLibrary.generateEggIcon ? MobLibrary.generateEggIcon(primary, secondary) : '/assets/items/spawn_egg.png');
        return {
          id: item.id,
          name: `${mobDef.name} Spawn Egg`,
          icon,
          isBlock: false,
          isSpawnEgg: true,
          customMobId: mobDef.id,
          mobDef: mobDef,
          count: item.count || 64
        };
      }
    }
    if (item.isBlock) {
      const def = BLOCK_DEFS[item.id];
      const icon = def?.icon || (def && def.textures
        ? `/assets/blocks/${def.textures.all || def.textures.side || def.textures.top || 'dirt.png'}`
        : '/assets/blocks/dirt.png');
      return {
        id: item.id,
        name: def ? def.name : 'Block',
        icon: icon,
        isBlock: true,
        count: item.count
      };
    } else {
      const it = ITEMS[item.id];
      return {
        id: item.id,
        name: it ? it.name : item.id,
        icon: it ? it.icon : '/assets/items/stick.png',
        isBlock: false,
        count: item.count,
        armor: it?.armor || 0,
        toughness: it?.toughness || 0,
        knockbackResistance: it?.knockbackResistance || 0,
        armorSlot: it?.armorSlot || null,
        type: it?.type || null,
        offhand: it?.offhand || false,
      };
    }
  }

  getActiveItem() {
    return this.hotbar[this.activeSlot];
  }

  getOffhandItem() {
    return this.offhand;
  }

  consumeActiveItem() {
    const item = this.hotbar[this.activeSlot];
    if (!item) return;
    item.count--;
    if (item.count <= 0) {
      this.hotbar[this.activeSlot] = null;
    }
  }

  getTotalArmorPoints() {
    let total = 0;
    for (const key of ['head', 'chest', 'legs', 'feet']) {
      const item = this.armor[key];
      if (item) {
        const meta = this.getItemMeta(item);
        if (meta && typeof meta.armor === 'number') {
          total += meta.armor;
        }
      }
    }
    return total;
  }

  getTotalArmorToughness() {
    let total = 0;
    for (const key of ['head', 'chest', 'legs', 'feet']) {
      const item = this.armor[key];
      if (item) {
        const meta = this.getItemMeta(item);
        if (meta && typeof meta.toughness === 'number') {
          total += meta.toughness;
        }
      }
    }
    return total;
  }

  getTotalKnockbackResistance() {
    let total = 0;
    for (const key of ['head', 'chest', 'legs', 'feet']) {
      const item = this.armor[key];
      if (item) {
        const meta = this.getItemMeta(item);
        if (meta && typeof meta.knockbackResistance === 'number') {
          total += meta.knockbackResistance;
        }
      }
    }
    return total;
  }

  swapOffhand() {
    const active = this.hotbar[this.activeSlot];
    this.hotbar[this.activeSlot] = this.offhand;
    this.offhand = active;
    this.sounds.playClick?.();
  }

  equipArmorItem(fromActive = true) {
    const item = fromActive ? this.hotbar[this.activeSlot] : null;
    if (!item) return false;
    const meta = this.getItemMeta(item);
    if (!meta || !meta.armorSlot) return false;

    const slotKey = meta.armorSlot;
    const currentEquipped = this.armor[slotKey];

    if (item.count === 1) {
      this.armor[slotKey] = item;
      this.hotbar[this.activeSlot] = currentEquipped;
    } else {
      if (currentEquipped) return false;
      this.armor[slotKey] = { ...item, count: 1 };
      item.count--;
      if (item.count <= 0) this.hotbar[this.activeSlot] = null;
    }

    this.sounds.playArmorEquip?.();
    return true;
  }

  handleArmorSlotClick(slotKey, isRightClick = false, isShiftClick = false) {
    this.sounds.playClick?.();
    const current = this.armor[slotKey];

    // Shift-click: quick-move from armor to hotbar/storage
    if (isShiftClick && current) {
      for (let i = 0; i < 9; i++) {
        if (!this.hotbar[i]) {
          this.hotbar[i] = current;
          this.armor[slotKey] = null;
          this.sounds.playArmorEquip?.();
          return;
        }
      }
      for (let i = 0; i < 27; i++) {
        if (!this.storage[i]) {
          this.storage[i] = current;
          this.armor[slotKey] = null;
          this.sounds.playArmorEquip?.();
          return;
        }
      }
      return;
    }

    if (!this.cursorItem) {
      if (current) {
        this.cursorItem = current;
        this.armor[slotKey] = null;
        this.sounds.playArmorEquip?.();
      }
    } else {
      const meta = this.getItemMeta(this.cursorItem);
      if (meta?.armorSlot === slotKey) {
        const temp = this.armor[slotKey];
        this.armor[slotKey] = this.cursorItem;
        this.cursorItem = temp;
        this.sounds.playArmorEquip?.();
      }
    }
  }

  handleOffhandSlotClick(isRightClick = false, isShiftClick = false) {
    this.sounds.playClick?.();
    const current = this.offhand;

    // Shift-click: quick-move from offhand to hotbar/storage
    if (isShiftClick && current) {
      for (let i = 0; i < 9; i++) {
        if (!this.hotbar[i]) {
          this.hotbar[i] = current;
          this.offhand = null;
          return;
        }
      }
      for (let i = 0; i < 27; i++) {
        if (!this.storage[i]) {
          this.storage[i] = current;
          this.offhand = null;
          return;
        }
      }
      return;
    }

    if (!this.cursorItem) {
      if (current) {
        this.cursorItem = current;
        this.offhand = null;
      }
    } else {
      const temp = this.offhand;
      this.offhand = this.cursorItem;
      this.cursorItem = temp;
    }
  }

  addItem(itemId, isBlock = true, count = 1, enchantments = null) {
    if (typeof itemId === 'object' && itemId !== null) {
      // Cargo pickups retain names, durability and enchantments. Only identical
      // stacks can merge, and a full inventory must leave the drop untouched.
      if(Object.keys(itemId).some(k=>!['id','isBlock','count','enchantments'].includes(k))){
        const incoming=structuredClone(itemId),limit=stackLimitFor(incoming.id);
        const compatible=s=>s&&JSON.stringify({...s,count:0})===JSON.stringify({...incoming,count:0});
        const slots=[...this.hotbar,...this.storage];
        if(incoming.count>slots.reduce((n,s)=>n+(!s?limit:compatible(s)?Math.max(0,limit-s.count):0),0))return false;
        for(const s of slots)if(compatible(s)){const n=Math.min(incoming.count,limit-s.count);s.count+=n;incoming.count-=n;if(!incoming.count)return true;}
        for(const list of [this.hotbar,this.storage])for(let i=0;i<list.length;i++)if(!list[i]){const n=Math.min(incoming.count,limit);list[i]={...incoming,count:n};incoming.count-=n;if(!incoming.count)return true;}
        return false;
      }
      count = itemId.count !== undefined ? itemId.count : 1;
      isBlock = itemId.isBlock !== undefined ? itemId.isBlock : false;
      enchantments = itemId.enchantments || null;
      itemId = itemId.id;
    }
    // 1. Try to merge into existing stacks (only if unenchanted), up to the item's own limit.
    //
    // This was a literal 64, which is how a stack of two diamond pickaxes was reachable: everything else
    // about stacking was right, and the limit was a constant in eight files rather than one rule.
    // `stackLimitFor` owns it now. The rename commit reintroduced the literal here and in
    // `handleSlotClick`, so `tests/itemStackSizes.test.js` is what found it again.
    const limit = stackLimitFor(itemId);
    if (!enchantments) {
      const allSlots = [...this.hotbar, ...this.storage];
      for (const slot of allSlots) {
        if (slot && slot.id === itemId && slot.isBlock === isBlock && !slot.enchantments && slot.count < limit) {
          const canTake = limit - slot.count;
          const add = Math.min(canTake, count);
          slot.count += add;
          count -= add;
          if (count <= 0) return true;
        }
      }
    }

    // 2. Open new stacks until the count is placed, each capped at the item's limit.
    //
    // The previous version put the whole remaining count into the first empty slot, so asking for 20
    // snowballs produced one stack of 20, and asking for 100 planks produced a stack of 100. The cap has
    // to be applied when a *new* stack is created, not only when an existing one is topped up.
    const placeInto = (list) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i]) continue;
        const n = Math.min(count, limit);
        const stack = { id: itemId, isBlock, count: n };
        if (enchantments) stack.enchantments = enchantments;
        list[i] = stack;
        count -= n;
        if (count <= 0) return true;
      }
      return false;
    };

    // 3. Empty hotbar slots first, then storage.
    if (placeInto(this.hotbar)) return true;
    if (placeInto(this.storage)) return true;

    return false; // full inventory
  }

  // Handle slot click with cursor dragging & right click split
  handleSlotClick(list, index, isRightClick = false, isShiftClick = false) {
    this.sounds.playClick?.();
    const target = list[index];

    // Shift click: Quick transfer
    if (isShiftClick && target) {
      const meta = this.getItemMeta(target);

      // Auto-equip armor if matching slot is empty
      if (meta?.armorSlot && !this.armor[meta.armorSlot]) {
        this.armor[meta.armorSlot] = target;
        list[index] = null;
        this.sounds.playArmorEquip?.();
        return;
      }

      // Auto-equip off-hand if shield and off-hand slot empty
      if (meta?.offhand && !this.offhand) {
        this.offhand = target;
        list[index] = null;
        return;
      }

      // Transfer between hotbar & storage
      if (list === this.hotbar) {
        for (let i = 0; i < 27; i++) {
          if (!this.storage[i]) {
            this.storage[i] = target;
            list[index] = null;
            return;
          }
        }
      } else if (list === this.storage) {
        for (let i = 0; i < 9; i++) {
          if (!this.hotbar[i]) {
            this.hotbar[i] = target;
            list[index] = null;
            return;
          }
        }
      }
      return;
    }

    if (!this.cursorItem) {
      // Pick up item
      if (!target) return;
      if (isRightClick) {
        // Split stack in half
        const half = Math.ceil(target.count / 2);
        this.cursorItem = { ...target, count: half };
        target.count -= half;
        if (target.count <= 0) list[index] = null;
      } else {
        // Pick up entire stack
        this.cursorItem = target;
        list[index] = null;
      }
    } else {
      // Placing cursor item
      if (!target) {
        if (isRightClick) {
          // Drop single item into empty slot
          list[index] = { ...this.cursorItem, count: 1 };
          this.cursorItem.count--;
          if (this.cursorItem.count <= 0) this.cursorItem = null;
        } else {
          // Drop entire stack
          list[index] = this.cursorItem;
          this.cursorItem = null;
        }
      } else if (target.id === this.cursorItem.id && target.isBlock === this.cursorItem.isBlock) {
        // Merge identical stacks, up to the item's own limit rather than a literal 64.
        const slotLimit = stackLimitFor(target.id);
        if (isRightClick) {
          if (target.count < slotLimit) {
            target.count++;
            this.cursorItem.count--;
            if (this.cursorItem.count <= 0) this.cursorItem = null;
          }
        } else {
          const space = slotLimit - target.count;
          const transfer = Math.min(space, this.cursorItem.count);
          target.count += transfer;
          this.cursorItem.count -= transfer;
          if (this.cursorItem.count <= 0) this.cursorItem = null;
        }
      } else {
        // Swap different items
        const tmp = list[index];
        list[index] = this.cursorItem;
        this.cursorItem = tmp;
      }
    }

    this.checkCrafting();
  }

  // Update craft results
  checkCrafting() {
    const res2 = findMatchingRecipe(this.craft2x2, 2, 2, RECIPES_2X2);
    this.craft2x2Result = res2 ? { ...res2 } : null;

    const res3 = findMatchingRecipe(this.craft3x3, 3, 3, RECIPES_3X3);
    this.craft3x3Result = res3 ? { ...res3 } : null;
  }

  takeCraftResult(is3x3 = false) {
    const grid = is3x3 ? this.craft3x3 : this.craft2x2;
    const res = is3x3 ? this.craft3x3Result : this.craft2x2Result;
    if (!res) return;

    // A craft result stacks to its own limit, not to 64: a second pair of boots should open a new stack.
    const resultLimit = stackLimitFor(res.id);
    if (!this.cursorItem) {
      this.cursorItem = { id: res.id, isBlock: res.isBlock, count: res.count };
    } else if (this.cursorItem.id === res.id && this.cursorItem.count + res.count <= resultLimit) {
      this.cursorItem.count += res.count;
    } else {
      return; // Cannot pick up if full
    }

    // Deduct 1 from each item in craft grid
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]) {
        grid[i].count--;
        if (grid[i].count <= 0) grid[i] = null;
      }
    }

    this.sounds.playClick();
    this.checkCrafting();
  }
}
