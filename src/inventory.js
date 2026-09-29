import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from './crafting.js';

export class Inventory {
  constructor(sounds) {
    this.sounds = sounds;

    // 9 Hotbar slots + 27 Main Storage slots
    this.hotbar = new Array(9).fill(null);
    this.storage = new Array(27).fill(null);
    this.activeSlot = 0;

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
    // Starting items for immediate fun & testing
    this.hotbar[0] = { id: 'diamond_sword', isBlock: false, count: 1 };
    this.hotbar[1] = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
    this.hotbar[2] = { id: BLOCKS.OAK_LOG, isBlock: true, count: 32 };
    this.hotbar[3] = { id: BLOCKS.COBBLESTONE, isBlock: true, count: 64 };
    this.hotbar[4] = { id: BLOCKS.TORCH, isBlock: true, count: 16 };
    this.hotbar[5] = { id: BLOCKS.TNT, isBlock: true, count: 12 };
    this.hotbar[6] = { id: 'bread', isBlock: false, count: 10 };
    this.hotbar[7] = { id: 'emerald', isBlock: false, count: 15 };
    this.hotbar[8] = { id: 'wheat', isBlock: false, count: 20 };
  }

  getItemMeta(item) {
    if (!item) return null;
    if (item.isBlock) {
      const def = BLOCK_DEFS[item.id];
      const icon = def && def.textures
        ? `/assets/blocks/${def.textures.all || def.textures.side || def.textures.top || 'dirt.png'}`
        : '/assets/blocks/dirt.png';
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
        count: item.count
      };
    }
  }

  getActiveItem() {
    return this.hotbar[this.activeSlot];
  }

  consumeActiveItem() {
    const item = this.hotbar[this.activeSlot];
    if (!item) return;
    item.count--;
    if (item.count <= 0) {
      this.hotbar[this.activeSlot] = null;
    }
  }

  addItem(itemId, isBlock = true, count = 1) {
    // 1. Try to merge into existing stacks
    const allSlots = [...this.hotbar, ...this.storage];
    for (const slot of allSlots) {
      if (slot && slot.id === itemId && slot.isBlock === isBlock && slot.count < 64) {
        const canTake = 64 - slot.count;
        const add = Math.min(canTake, count);
        slot.count += add;
        count -= add;
        if (count <= 0) return true;
      }
    }

    // 2. Put into empty hotbar slot
    for (let i = 0; i < 9; i++) {
      if (!this.hotbar[i]) {
        this.hotbar[i] = { id: itemId, isBlock, count };
        return true;
      }
    }

    // 3. Put into empty storage slot
    for (let i = 0; i < 27; i++) {
      if (!this.storage[i]) {
        this.storage[i] = { id: itemId, isBlock, count };
        return true;
      }
    }

    return false; // full inventory
  }

  // Handle slot click with cursor dragging & right click split
  handleSlotClick(list, index, isRightClick = false, isShiftClick = false) {
    this.sounds.playClick();
    const target = list[index];

    // Shift click: Quick transfer between hotbar & storage
    if (isShiftClick && target) {
      if (list === this.hotbar) {
        // Move to storage
        for (let i = 0; i < 27; i++) {
          if (!this.storage[i]) {
            this.storage[i] = target;
            list[index] = null;
            return;
          }
        }
      } else if (list === this.storage) {
        // Move to hotbar
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
        // Merge identical stacks
        if (isRightClick) {
          if (target.count < 64) {
            target.count++;
            this.cursorItem.count--;
            if (this.cursorItem.count <= 0) this.cursorItem = null;
          }
        } else {
          const space = 64 - target.count;
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

    if (!this.cursorItem) {
      this.cursorItem = { id: res.id, isBlock: res.isBlock, count: res.count };
    } else if (this.cursorItem.id === res.id && this.cursorItem.count + res.count <= 64) {
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
