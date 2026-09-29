import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { VILLAGER_TRADES } from './crafting.js';
import { CREATIVE_TABS, ALL_CREATIVE_ITEMS, getCreativeItemsByTab, searchCreativeItems } from './creativeCatalog.js';

export class UIManager {
  constructor(inventory, player, world, mobs, sounds) {
    this.inv = inventory;
    this.player = player;
    this.world = world;
    this.mobs = mobs;
    this.sounds = sounds;

    // Elements
    this.hotbarEl = document.getElementById('hotbar-wrapper');
    this.healthBarEl = document.getElementById('health-bar');
    this.hungerBarEl = document.getElementById('hunger-bar');
    this.expBarEl = document.getElementById('exp-bar');
    this.expLevelEl = document.getElementById('exp-level');

    this.debugScreen = document.getElementById('debug-screen');
    this.debugScreenRight = document.getElementById('debug-screen-right');
    this.showDebug = false;

    // Modals
    this.invModal = document.getElementById('inventory-modal');
    this.craftModal = document.getElementById('crafting-modal');
    this.villagerModal = document.getElementById('villager-modal');
    this.pauseModal = document.getElementById('pause-menu');
    this.startOverlay = document.getElementById('start-overlay');
    this.geminiModal = document.getElementById('gemini-modal');

    // Gemini Terminal Elements
    this.geminiLogFeed = document.getElementById('gemini-log-feed');
    this.geminiForm = document.getElementById('gemini-form');
    this.geminiPromptInput = document.getElementById('gemini-prompt-input');
    this.geminiExecBtn = document.getElementById('gemini-exec-btn');
    this.geminiStatusPill = document.getElementById('gemini-status-pill');
    this.geminiStatusText = document.getElementById('gemini-status-text');
    this.geminiProgressWrapper = document.getElementById('gemini-progress-wrapper');
    this.geminiProgressBar = document.getElementById('gemini-progress-bar');
    this.geminiProgressLabel = document.getElementById('gemini-progress-label');
    this.geminiKeyDrawer = document.getElementById('gemini-key-drawer');
    this.geminiKeyInput = document.getElementById('gemini-key-input');
    this.geminiSaveKeyBtn = document.getElementById('gemini-save-key-btn');
    this.geminiClearKeyBtn = document.getElementById('gemini-clear-key-btn');
    this.geminiToggleKeyBtn = document.getElementById('gemini-toggle-key');
    this.geminiCloseBtn = document.getElementById('gemini-close-btn');

    // Gemini Image Attachment Elements
    this.geminiImagePreviewContainer = document.getElementById('gemini-image-preview-container');
    this.geminiImagePreview = document.getElementById('gemini-image-preview');
    this.geminiImageBadge = document.getElementById('gemini-image-badge');
    this.geminiImageRemoveBtn = document.getElementById('gemini-image-remove-btn');
    this.geminiAttachBtn = document.getElementById('gemini-attach-btn');
    this.geminiFileInput = document.getElementById('gemini-file-input');
    this.geminiTerminalCard = document.querySelector('.gemini-terminal-card');
    this.currentAttachedImage = null;

    this.geminiAgent = null;

    // Floating item cursor
    this.floatingItem = document.getElementById('floating-cursor-item');

    // Creative Mode Inventory Elements
    this.creativeModal = document.getElementById('creative-modal');
    this.creativeTabsTop = document.getElementById('creative-tabs-top');
    this.creativeTabsBottom = document.getElementById('creative-tabs-bottom');
    this.creativeItemGrid = document.getElementById('creative-item-grid');
    this.creativeHotbarGrid = document.getElementById('creative-hotbar-grid');
    this.creativeSearchInput = document.getElementById('creative-search-input');
    this.creativeClearSearchBtn = document.getElementById('creative-clear-search-btn');
    this.creativeTabTitle = document.getElementById('creative-tab-title');
    this.creativeItemCount = document.getElementById('creative-item-count');
    this.creativeDestroySlot = document.getElementById('creative-destroy-slot');
    this.btnClearHotbar = document.getElementById('btn-clear-hotbar');
    this.closeCreative = document.getElementById('close-creative');
    this.mcTooltip = document.getElementById('mc-tooltip');
    this.mcTooltipTitle = document.getElementById('mc-tooltip-title');
    this.mcTooltipSub = document.getElementById('mc-tooltip-sub');
    this.activeCreativeTab = 'building_blocks';
    this.creativeSearchQuery = '';

    // Chat
    this.chatContainer = document.getElementById('chat-container');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInputWrapper = document.getElementById('chat-input-wrapper');
    this.chatInput = document.getElementById('chat-input');
    this.isChatOpen = false;

    // Callbacks
    this.onCommand = null;

    this.setupUI();
  }

  setupUI() {
    this.initHotbarDOM();
    this.initStatusBarsDOM();
    this.bindInventoryEvents();
    this.bindCreativeEvents();
    this.bindVillagerTradeEvents();
    this.bindPauseEvents();
    this.bindChatEvents();
    this.bindFloatingCursor();

    window.addEventListener('keydown', (e) => {
      // Toggle F3 Debug
      if (e.code === 'F3') {
        e.preventDefault();
        this.showDebug = !this.showDebug;
        this.debugScreen.style.display = this.showDebug ? 'block' : 'none';
        this.debugScreenRight.style.display = this.showDebug ? 'block' : 'none';
      }

      // Hotbar selection 1-9
      if (e.code >= 'Digit1' && e.code <= 'Digit9' && !this.isChatOpen) {
        this.inv.activeSlot = parseInt(e.code.replace('Digit', '')) - 1;
        this.updateHotbar();
      }

      // E: Open/close inventory
      if (e.code === 'KeyE' && !this.isChatOpen && !this.isGeminiOpen()) {
        e.preventDefault();
        this.toggleInventory();
      }

      // C: Open/close Gemini Terminal
      if (e.code === 'KeyC') {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && !this.isChatOpen) {
          e.preventDefault();
          this.toggleGeminiTerminal();
        }
      }

      // T or /: Open chat
      if ((e.code === 'KeyT' || e.code === 'Slash') && !this.isModalOpen() && !this.isChatOpen) {
        e.preventDefault();
        this.openChat(e.code === 'Slash' ? '/' : '');
      }

      // ESC: Close open modals or toggle pause menu
      if (e.code === 'Escape') {
        if (this.isChatOpen) {
          this.closeChat();
        } else if (this.isGeminiOpen()) {
          this.closeGeminiTerminal();
        } else if (this.isModalOpen()) {
          this.closeAllModals();
        } else {
          this.togglePauseMenu();
        }
      }
    });

    // Mouse scroll wheel cycles hotbar slots
    window.addEventListener('wheel', (e) => {
      if (this.isModalOpen() || this.isChatOpen) return;
      if (e.deltaY > 0) {
        this.inv.activeSlot = (this.inv.activeSlot + 1) % 9;
      } else if (e.deltaY < 0) {
        this.inv.activeSlot = (this.inv.activeSlot + 8) % 9;
      }
      this.updateHotbar();
    });
  }

  isModalOpen() {
    return (!this.invModal.classList.contains('hidden')) ||
           (this.creativeModal && !this.creativeModal.classList.contains('hidden')) ||
           (!this.craftModal.classList.contains('hidden')) ||
           (!this.villagerModal.classList.contains('hidden')) ||
           (!this.pauseModal.classList.contains('hidden')) ||
           this.isGeminiOpen();
  }

  closeAllModals() {
    this.invModal.classList.add('hidden');
    if (this.creativeModal) this.creativeModal.classList.add('hidden');
    this.craftModal.classList.add('hidden');
    this.villagerModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    if (this.geminiModal) this.geminiModal.classList.add('hidden');
    this.hideTooltip();

    // Return any cursor item to inventory
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count);
      this.inv.cursorItem = null;
      this.updateFloatingCursor();
    }
  }

  initHotbarDOM() {
    this.hotbarEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === this.inv.activeSlot ? ' active' : '');
      slot.dataset.slot = i;

      slot.addEventListener('click', () => {
        this.inv.activeSlot = i;
        this.updateHotbar();
      });

      this.hotbarEl.appendChild(slot);
    }
    this.updateHotbar();
  }

  updateHotbar() {
    const slots = this.hotbarEl.children;
    for (let i = 0; i < 9; i++) {
      const slot = slots[i];
      slot.className = 'hotbar-slot' + (i === this.inv.activeSlot ? ' active' : '');
      slot.innerHTML = '';

      const item = this.inv.hotbar[i];
      if (item) {
        const meta = this.inv.getItemMeta(item);
        if (meta) {
          const img = document.createElement('img');
          img.className = 'slot-icon';
          img.src = meta.icon;
          slot.appendChild(img);

          if (meta.count > 1) {
            const count = document.createElement('span');
            count.className = 'slot-count';
            count.textContent = meta.count;
            slot.appendChild(count);
          }
        }
      }
    }
  }

  initStatusBarsDOM() {
    // 10 Hearts
    this.healthBarEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('div');
      heart.className = 'stat-icon';
      heart.style.backgroundImage = 'radial-gradient(circle, #ff2222 60%, #880000 90%)';
      heart.style.borderRadius = '3px';
      this.healthBarEl.appendChild(heart);
    }

    // 10 Drumsticks
    this.hungerBarEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const drum = document.createElement('div');
      drum.className = 'stat-icon';
      drum.style.backgroundImage = 'radial-gradient(circle, #c87834 60%, #5a2e0a 90%)';
      drum.style.borderRadius = '3px';
      this.hungerBarEl.appendChild(drum);
    }
  }

  updateStats() {
    const isCreative = this.player.gamemode === 'creative';
    const statusBars = document.getElementById('status-bars');
    const expContainer = document.getElementById('exp-container');
    if (statusBars) statusBars.style.display = isCreative ? 'none' : 'flex';
    if (expContainer) expContainer.style.display = isCreative ? 'none' : 'block';
    if (isCreative) return;

    // Health hearts
    const hearts = this.healthBarEl.children;
    const hp = Math.ceil(this.player.health);
    for (let i = 0; i < 10; i++) {
      const heartVal = (i + 1) * 2;
      if (hp >= heartVal) {
        hearts[i].style.opacity = '1';
        hearts[i].style.background = 'radial-gradient(circle, #ff2222 60%, #880000 90%)';
      } else if (hp >= heartVal - 1) {
        hearts[i].style.opacity = '1';
        hearts[i].style.background = 'linear-gradient(to right, #ff2222 50%, #444444 50%)';
      } else {
        hearts[i].style.opacity = '0.35';
        hearts[i].style.background = '#222';
      }
    }

    // Hunger drumsticks
    const drumsticks = this.hungerBarEl.children;
    const hunger = Math.ceil(this.player.hunger);
    for (let i = 0; i < 10; i++) {
      const val = (i + 1) * 2;
      drumsticks[i].style.opacity = (hunger >= val) ? '1' : '0.35';
    }

    // Experience
    this.expLevelEl.textContent = this.player.level;
    this.expBarEl.style.width = `${Math.min(100, (this.player.exp % 100))}%`;
  }

  updateDebug(fps, rendererInfo) {
    if (!this.showDebug) return;

    const pos = this.player.position;
    document.getElementById('dbg-fps').textContent = `${Math.round(fps)} fps`;
    document.getElementById('dbg-pos').textContent = `XYZ: ${pos.x.toFixed(2)} / ${pos.y.toFixed(2)} / ${pos.z.toFixed(2)}`;
    document.getElementById('dbg-block').textContent = `Block: ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`;

    const cx = Math.floor(pos.x / 16);
    const cz = Math.floor(pos.z / 16);
    document.getElementById('dbg-chunk').textContent = `Chunk: ${cx}, ${cz}`;

    // Facing direction
    const yaw = (this.player.yaw % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    let facing = 'south (+Z)';
    if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) facing = 'west (-X)';
    else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) facing = 'north (-Z)';
    else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) facing = 'east (+X)';
    document.getElementById('dbg-facing').textContent = `Facing: ${facing}`;

    const biome = this.world.getBiome(Math.floor(pos.x), Math.floor(pos.z));
    document.getElementById('dbg-biome').textContent = `Biome: ${biome.charAt(0).toUpperCase() + biome.slice(1)}`;

    document.getElementById('dbg-mem').textContent = `Draw Calls: ${rendererInfo ? rendererInfo.render.calls : 2} | Chunks: ${this.world.chunks.size}`;
    document.getElementById('dbg-entities').textContent = `Entities: ${this.mobs.mobs.length + this.mobs.arrows.length}`;
    document.getElementById('dbg-mode').textContent = `Mode: ${this.player.gamemode.toUpperCase()}`;
  }

  // Inventory Modal Management
  toggleInventory() {
    if (this.player.gamemode === 'creative') {
      if (this.creativeModal && !this.creativeModal.classList.contains('hidden')) {
        this.closeAllModals();
      } else {
        this.openCreativeInventory();
      }
      return;
    }

    if (this.invModal.classList.contains('hidden')) {
      document.exitPointerLock();
      this.closeAllModals();
      this.invModal.classList.remove('hidden');
      this.renderInventoryGrids();
    } else {
      this.closeAllModals();
    }
  }

  openCreativeInventory() {
    document.exitPointerLock();
    this.closeAllModals();
    if (!this.creativeModal) return;
    this.creativeModal.classList.remove('hidden');
    this.renderCreativeTabs();
    this.renderCreativeItems();
    this.renderCreativeHotbar();
  }

  bindCreativeEvents() {
    if (this.closeCreative) {
      this.closeCreative.onclick = () => this.closeAllModals();
    }

    if (this.creativeSearchInput) {
      this.creativeSearchInput.addEventListener('input', (e) => {
        this.creativeSearchQuery = e.target.value.trim();
        if (this.creativeSearchQuery && this.activeCreativeTab !== 'all_items') {
          this.activeCreativeTab = 'all_items';
          this.renderCreativeTabs();
        }
        this.renderCreativeItems();
      });
    }

    if (this.creativeClearSearchBtn) {
      this.creativeClearSearchBtn.onclick = () => {
        if (this.creativeSearchInput) this.creativeSearchInput.value = '';
        this.creativeSearchQuery = '';
        this.renderCreativeItems();
      };
    }

    if (this.btnClearHotbar) {
      this.btnClearHotbar.onclick = () => {
        this.inv.hotbar.fill(null);
        this.sounds.playPop();
        this.renderCreativeHotbar();
        this.updateHotbar();
      };
    }

    if (this.creativeDestroySlot) {
      this.creativeDestroySlot.onclick = (e) => {
        if (e.shiftKey) {
          this.inv.hotbar.fill(null);
          this.sounds.playPop();
          this.renderCreativeHotbar();
          this.updateHotbar();
        } else if (this.inv.cursorItem) {
          this.inv.cursorItem = null;
          this.updateFloatingCursor();
          this.sounds.playPop();
        }
      };

      this.creativeDestroySlot.onmouseenter = (e) => {
        this.showTooltip(e.clientX, e.clientY, 'Destroy Item', 'Click with held item, or Shift+Click to clear hotbar');
      };
      this.creativeDestroySlot.onmouseleave = () => this.hideTooltip();
    }
  }

  renderCreativeTabs() {
    if (!this.creativeTabsTop || !this.creativeTabsBottom) return;

    // Top Tabs: first 6
    const topTabIds = ['building_blocks', 'colored_blocks', 'natural_blocks', 'functional_blocks', 'redstone_blocks', 'all_items'];
    // Bottom Tabs: tools_utilities, combat, food_drinks, ingredients, spawn_eggs, survival_inventory
    const bottomTabIds = ['tools_utilities', 'combat', 'food_drinks', 'ingredients', 'spawn_eggs', 'survival_inventory'];

    const renderTabRow = (container, ids) => {
      container.innerHTML = '';
      ids.forEach(id => {
        const tabDef = CREATIVE_TABS.find(t => t.id === id) || (id === 'survival_inventory' ? {
          id: 'survival_inventory',
          name: 'Survival Inventory',
          icon: '/assets/gui/inventory.png'
        } : null);
        if (!tabDef) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'creative-tab-btn' + (this.activeCreativeTab === id ? ' active' : '');
        btn.title = tabDef.name;
        btn.innerHTML = `<img class="tab-icon" src="${tabDef.icon}" alt="${tabDef.name}">`;

        btn.onclick = () => {
          this.sounds.playClick();
          this.activeCreativeTab = id;
          if (id !== 'all_items') {
            this.creativeSearchQuery = '';
            if (this.creativeSearchInput) this.creativeSearchInput.value = '';
          }
          this.renderCreativeTabs();
          this.renderCreativeItems();
        };

        btn.onmouseenter = (e) => {
          this.showTooltip(e.clientX, e.clientY, tabDef.name, `Switch to ${tabDef.name}`);
        };
        btn.onmouseleave = () => this.hideTooltip();

        container.appendChild(btn);
      });
    };

    renderTabRow(this.creativeTabsTop, topTabIds);
    renderTabRow(this.creativeTabsBottom, bottomTabIds);
  }

  renderCreativeItems() {
    if (!this.creativeItemGrid) return;
    this.creativeItemGrid.innerHTML = '';

    if (this.activeCreativeTab === 'survival_inventory') {
      if (this.creativeTabTitle) this.creativeTabTitle.textContent = 'Survival Inventory';
      if (this.creativeItemCount) this.creativeItemCount.textContent = '(Carried Storage)';

      // Render 27 storage slots inside grid
      this.inv.storage.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        this.renderSlotContent(slot, item);

        slot.onclick = (e) => {
          this.inv.handleSlotClick(this.inv.storage, idx, e.button === 2, e.shiftKey);
          this.renderCreativeItems();
          this.renderCreativeHotbar();
          this.updateHotbar();
        };
        slot.oncontextmenu = (e) => {
          e.preventDefault();
          this.inv.handleSlotClick(this.inv.storage, idx, true, e.shiftKey);
          this.renderCreativeItems();
          this.renderCreativeHotbar();
          this.updateHotbar();
        };
        if (item) {
          const meta = this.inv.getItemMeta(item);
          slot.onmouseenter = (e) => this.showTooltip(e.clientX, e.clientY, meta.name, `Count: ${item.count}`);
          slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
          slot.onmouseleave = () => this.hideTooltip();
        }
        this.creativeItemGrid.appendChild(slot);
      });
      return;
    }

    const items = searchCreativeItems(this.creativeSearchQuery, this.activeCreativeTab);
    const tabDef = CREATIVE_TABS.find(t => t.id === this.activeCreativeTab);
    const tabName = this.creativeSearchQuery ? `Search: "${this.creativeSearchQuery}"` : (tabDef ? tabDef.name : 'Items');

    if (this.creativeTabTitle) this.creativeTabTitle.textContent = tabName;
    if (this.creativeItemCount) this.creativeItemCount.textContent = `(${items.length} items)`;

    items.forEach(item => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot creative-slot';

      const img = document.createElement('img');
      img.className = 'slot-icon';
      img.src = item.icon;
      img.alt = item.name;
      slot.appendChild(img);

      if (item.count > 1) {
        const countSpan = document.createElement('span');
        countSpan.className = 'slot-count';
        countSpan.textContent = item.count;
        slot.appendChild(countSpan);
      }

      slot.onclick = (e) => {
        if (e.shiftKey) {
          // Transfer directly into first empty hotbar slot
          for (let i = 0; i < 9; i++) {
            if (!this.inv.hotbar[i]) {
              this.inv.hotbar[i] = { id: item.id, isBlock: item.isBlock, count: item.count };
              this.sounds.playClick();
              this.renderCreativeHotbar();
              this.updateHotbar();
              return;
            }
          }
          // If hotbar full, replace active slot
          this.inv.hotbar[this.inv.activeSlot] = { id: item.id, isBlock: item.isBlock, count: item.count };
          this.sounds.playClick();
          this.renderCreativeHotbar();
          this.updateHotbar();
        } else {
          // Left click: pickup full stack to cursor
          this.inv.cursorItem = { id: item.id, isBlock: item.isBlock, count: item.count };
          this.sounds.playClick();
          this.updateFloatingCursor();
        }
      };

      slot.oncontextmenu = (e) => {
        e.preventDefault();
        // Right click: pickup single item to cursor
        this.inv.cursorItem = { id: item.id, isBlock: item.isBlock, count: 1 };
        this.sounds.playClick();
        this.updateFloatingCursor();
      };

      slot.onmouseenter = (e) => {
        const sub = item.isBlock ? 'Block' : (item.id.replace(/_/g, ' '));
        this.showTooltip(e.clientX, e.clientY, item.name, sub);
      };
      slot.onmousemove = (e) => {
        this.positionTooltip(e.clientX, e.clientY);
      };
      slot.onmouseleave = () => this.hideTooltip();

      this.creativeItemGrid.appendChild(slot);
    });
  }

  renderCreativeHotbar() {
    if (!this.creativeHotbarGrid) return;
    this.creativeHotbarGrid.innerHTML = '';

    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (i === this.inv.activeSlot ? ' active' : '');
      const item = this.inv.hotbar[i];
      this.renderSlotContent(slot, item);

      slot.onclick = (e) => {
        this.inv.handleSlotClick(this.inv.hotbar, i, e.button === 2, e.shiftKey);
        this.renderCreativeHotbar();
        this.updateHotbar();
      };

      slot.oncontextmenu = (e) => {
        e.preventDefault();
        this.inv.handleSlotClick(this.inv.hotbar, i, true, e.shiftKey);
        this.renderCreativeHotbar();
        this.updateHotbar();
      };

      if (item) {
        const meta = this.inv.getItemMeta(item);
        slot.onmouseenter = (e) => {
          this.showTooltip(e.clientX, e.clientY, meta.name, `Count: ${item.count}`);
        };
        slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
        slot.onmouseleave = () => this.hideTooltip();
      }

      this.creativeHotbarGrid.appendChild(slot);
    }
  }

  showTooltip(x, y, title, subtitle = '') {
    if (!this.mcTooltip) return;
    if (this.mcTooltipTitle) this.mcTooltipTitle.textContent = title;
    if (this.mcTooltipSub) {
      this.mcTooltipSub.textContent = subtitle;
      this.mcTooltipSub.style.display = subtitle ? 'block' : 'none';
    }
    this.mcTooltip.classList.remove('hidden');
    this.positionTooltip(x, y);
  }

  positionTooltip(x, y) {
    if (!this.mcTooltip) return;
    const pad = 14;
    let left = x + pad;
    let top = y + pad;
    if (left + 180 > window.innerWidth) left = x - 180 - pad;
    if (top + 60 > window.innerHeight) top = y - 60 - pad;
    this.mcTooltip.style.left = `${Math.max(4, left)}px`;
    this.mcTooltip.style.top = `${Math.max(4, top)}px`;
  }

  hideTooltip() {
    if (this.mcTooltip) this.mcTooltip.classList.add('hidden');
  }


  openCraftingTable() {
    document.exitPointerLock();
    this.closeAllModals();
    this.craftModal.classList.remove('hidden');
    this.renderCraftingGrids();
  }

  openVillagerTrade(villagerMob) {
    document.exitPointerLock();
    this.closeAllModals();
    this.villagerModal.classList.remove('hidden');
    this.renderVillagerTrades(villagerMob);
  }

  togglePauseMenu() {
    if (this.pauseModal.classList.contains('hidden')) {
      document.exitPointerLock();
      this.closeAllModals();
      this.pauseModal.classList.remove('hidden');
    } else {
      this.closeAllModals();
    }
  }

  bindInventoryEvents() {
    document.getElementById('close-inv').onclick = () => this.closeAllModals();
    document.getElementById('close-crafting').onclick = () => this.closeAllModals();
    document.getElementById('close-villager').onclick = () => this.closeAllModals();

    // 2x2 Craft Result
    const res2 = document.getElementById('craft2x2-result');
    res2.onclick = () => {
      this.inv.takeCraftResult(false);
      this.renderInventoryGrids();
      this.updateHotbar();
    };

    // 3x3 Craft Result
    const res3 = document.getElementById('craft3x3-result');
    res3.onclick = () => {
      this.inv.takeCraftResult(true);
      this.renderCraftingGrids();
      this.updateHotbar();
    };
  }

  renderInventoryGrids() {
    this.renderSlotGrid('inv-storage-grid', this.inv.storage, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderInventoryGrids();
      this.updateHotbar();
    });

    this.renderSlotGrid('inv-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderInventoryGrids();
      this.updateHotbar();
    });

    // 2x2 Craft slots
    const craftSlots = document.querySelectorAll('[data-craft]');
    craftSlots.forEach((slot, i) => {
      this.renderSlotContent(slot, this.inv.craft2x2[i]);
      slot.onclick = (e) => {
        this.inv.handleSlotClick(this.inv.craft2x2, i, e.button === 2, e.shiftKey);
        this.renderInventoryGrids();
        this.updateHotbar();
      };
      slot.oncontextmenu = (e) => {
        e.preventDefault();
        this.inv.handleSlotClick(this.inv.craft2x2, i, true, e.shiftKey);
        this.renderInventoryGrids();
        this.updateHotbar();
      };
    });

    // 2x2 Result slot
    const resSlot = document.getElementById('craft2x2-result');
    this.renderSlotContent(resSlot, this.inv.craft2x2Result);
    this.updateFloatingCursor();
  }

  renderCraftingGrids() {
    this.renderSlotGrid('craft-storage-grid', this.inv.storage, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderCraftingGrids();
      this.updateHotbar();
    });

    this.renderSlotGrid('craft-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderCraftingGrids();
      this.updateHotbar();
    });

    // 3x3 Craft slots
    const craftSlots = document.querySelectorAll('[data-craft3]');
    craftSlots.forEach((slot, i) => {
      this.renderSlotContent(slot, this.inv.craft3x3[i]);
      slot.onclick = (e) => {
        this.inv.handleSlotClick(this.inv.craft3x3, i, e.button === 2, e.shiftKey);
        this.renderCraftingGrids();
        this.updateHotbar();
      };
      slot.oncontextmenu = (e) => {
        e.preventDefault();
        this.inv.handleSlotClick(this.inv.craft3x3, i, true, e.shiftKey);
        this.renderCraftingGrids();
        this.updateHotbar();
      };
    });

    const resSlot = document.getElementById('craft3x3-result');
    this.renderSlotContent(resSlot, this.inv.craft3x3Result);
    this.updateFloatingCursor();
  }

  renderSlotGrid(containerId, list, onClickCallback) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    list.forEach((item, i) => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      this.renderSlotContent(slot, item);

      slot.addEventListener('click', (e) => {
        onClickCallback(i, false, e.shiftKey);
      });
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onClickCallback(i, true, e.shiftKey);
      });

      el.appendChild(slot);
    });
  }

  renderSlotContent(slotEl, item) {
    slotEl.innerHTML = '';
    if (!item) return;

    const meta = this.inv.getItemMeta(item);
    if (!meta) return;

    const img = document.createElement('img');
    img.className = 'slot-icon';
    img.src = meta.icon;
    slotEl.appendChild(img);

    if (meta.count > 1) {
      const count = document.createElement('span');
      count.className = 'slot-count';
      count.textContent = meta.count;
      slotEl.appendChild(count);
    }
  }

  bindFloatingCursor() {
    window.addEventListener('mousemove', (e) => {
      if (this.inv.cursorItem) {
        this.floatingItem.style.left = `${e.clientX}px`;
        this.floatingItem.style.top = `${e.clientY}px`;
      }
    });
  }

  updateFloatingCursor() {
    if (!this.inv.cursorItem) {
      this.floatingItem.classList.add('hidden');
    } else {
      this.floatingItem.classList.remove('hidden');
      const meta = this.inv.getItemMeta(this.inv.cursorItem);
      this.floatingItem.querySelector('.slot-icon').src = meta.icon;
      this.floatingItem.querySelector('.slot-count').textContent = meta.count > 1 ? meta.count : '';
    }
  }

  // Villager Trades
  bindVillagerTradeEvents() {
    this.renderVillagerTrades();
  }

  renderVillagerTrades(villagerMob) {
    const list = document.getElementById('villager-trades');
    list.innerHTML = '';

    VILLAGER_TRADES.forEach((trade) => {
      const row = document.createElement('div');
      row.className = 'trade-row';

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img class="slot-icon" src="${trade.cost.icon}">
          <span>${trade.cost.name}</span>
        </div>
        <span class="trade-arrow">➔</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <img class="slot-icon" src="${trade.reward.icon}">
          <span>${trade.reward.name}</span>
        </div>
      `;

      row.onclick = () => {
        // Check if player has the cost items
        if (this.consumePlayerItem(trade.cost.id, trade.cost.isBlock, trade.cost.count)) {
          this.inv.addItem(trade.reward.id, trade.reward.isBlock, trade.reward.count);
          this.sounds.playLevelUp();
          this.sounds.playVillager();
          this.renderVillagerTrades(villagerMob);
          this.updateHotbar();
        } else {
          this.sounds.playHurt();
        }
      };

      list.appendChild(row);
    });

    this.renderSlotGrid('villager-storage-grid', this.inv.storage, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderVillagerTrades(villagerMob);
      this.updateHotbar();
    });

    this.renderSlotGrid('villager-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderVillagerTrades(villagerMob);
      this.updateHotbar();
    });
  }

  consumePlayerItem(id, isBlock, count) {
    let available = 0;
    const allSlots = [...this.inv.hotbar, ...this.inv.storage];
    for (const slot of allSlots) {
      if (slot && slot.id === id && slot.isBlock === isBlock) {
        available += slot.count;
      }
    }

    if (available < count) return false;

    let remaining = count;
    for (const slot of allSlots) {
      if (slot && slot.id === id && slot.isBlock === isBlock) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) {
          const hotIdx = this.inv.hotbar.indexOf(slot);
          if (hotIdx !== -1) this.inv.hotbar[hotIdx] = null;
          const storIdx = this.inv.storage.indexOf(slot);
          if (storIdx !== -1) this.inv.storage[storIdx] = null;
        }
        if (remaining <= 0) break;
      }
    }
    return true;
  }

  // Pause Menu Buttons
  bindPauseEvents() {
    document.getElementById('btn-resume').onclick = () => {
      this.closeAllModals();
      const canvas = document.getElementById('canvas-container');
      canvas.requestPointerLock();
    };

    const btnGamemode = document.getElementById('btn-gamemode');
    if (btnGamemode) {
      btnGamemode.textContent = `Game Mode: ${this.player.gamemode.charAt(0).toUpperCase() + this.player.gamemode.slice(1)}`;
      btnGamemode.onclick = () => {
        this.player.gamemode = (this.player.gamemode === 'survival') ? 'creative' : 'survival';
        btnGamemode.textContent = `Game Mode: ${this.player.gamemode.charAt(0).toUpperCase() + this.player.gamemode.slice(1)}`;
        this.addChatMessage(`Set game mode to ${this.player.gamemode} mode`, 'system');

        if (this.player.gamemode === 'creative') {
          this.closeAllModals();
          this.openCreativeInventory();
        }
      };
    }

    const btnTime = document.getElementById('btn-time');
    btnTime.onclick = () => {
      if (this.onCommand) this.onCommand('/time set day');
    };

    document.getElementById('btn-spawn-golem').onclick = () => {
      const p = this.player.position;
      this.mobs.spawnIronGolem(p.x + 2, p.y + 1, p.z + 2);
      this.sounds.playIronGolem();
      this.addChatMessage('Spawned Iron Golem!', 'system');
    };

    document.getElementById('btn-spawn-villager').onclick = () => {
      const p = this.player.position;
      this.mobs.spawnVillager(p.x + 2, p.y + 1, p.z + 2);
      this.sounds.playVillager();
      this.addChatMessage('Spawned Villager!', 'system');
    };

    document.getElementById('btn-spawn-pillager').onclick = () => {
      const p = this.player.position;
      this.mobs.spawnPillager(p.x + 4, p.y + 1, p.z + 4);
      this.sounds.playPillager();
      this.addChatMessage('Spawned Pillager!', 'system');
    };

    document.getElementById('btn-reset').onclick = () => {
      window.location.reload();
    };
  }

  // Chat / Commands
  bindChatEvents() {
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        const val = this.chatInput.value.trim();
        if (val) {
          if (val.startsWith('/')) {
            if (this.onCommand) this.onCommand(val);
          } else {
            this.addChatMessage(`<Player> ${val}`);
          }
        }
        this.closeChat();
      }
    });
  }

  openChat(initialText = '') {
    this.isChatOpen = true;
    document.exitPointerLock();
    this.chatInputWrapper.style.display = 'block';
    this.chatInput.value = initialText;
    this.chatInput.focus();
  }

  closeChat() {
    this.isChatOpen = false;
    this.chatInputWrapper.style.display = 'none';
    this.chatInput.value = '';
    this.chatInput.blur();
    const canvas = document.getElementById('canvas-container');
    canvas.requestPointerLock();
  }

  addChatMessage(msg, type = 'normal') {
    const el = document.createElement('div');
    el.className = `chat-msg ${type}`;
    el.textContent = msg;
    this.chatMessages.appendChild(el);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    // Fade out old messages
    setTimeout(() => {
      if (el.parentNode) el.style.opacity = '0.7';
    }, 8000);
  }

  // --- Gemini AI Terminal Management ---
  isGeminiOpen() {
    return this.geminiModal && !this.geminiModal.classList.contains('hidden');
  }

  toggleGeminiTerminal() {
    if (this.isGeminiOpen()) {
      this.closeGeminiTerminal();
    } else {
      this.openGeminiTerminal();
    }
  }

  openGeminiTerminal() {
    document.exitPointerLock();
    this.closeAllModals();
    if (this.geminiModal) {
      this.geminiModal.classList.remove('hidden');
      setTimeout(() => {
        if (this.geminiPromptInput) {
          this.geminiPromptInput.focus();
        }
      }, 50);
    }
  }

  closeGeminiTerminal() {
    if (this.geminiModal) {
      this.geminiModal.classList.add('hidden');
    }
    const canvas = document.getElementById('canvas-container');
    if (canvas) canvas.requestPointerLock();
  }

  initGemini(geminiAgent) {
    this.geminiAgent = geminiAgent;
    const refreshAgentStatus = () => {
      if (this.geminiStatusText && !geminiAgent.isExecuting) {
        this.geminiStatusText.textContent = geminiAgent.lastError ? 'ERROR' : (geminiAgent.apiKey ? 'GEMINI READY' : 'OFFLINE');
      }
    };
    refreshAgentStatus();

    // Load saved API key into input
    if (this.geminiKeyInput && geminiAgent.apiKey) {
      this.geminiKeyInput.value = geminiAgent.apiKey;
    }

    // Connect agent callbacks
    geminiAgent.onLog = (msg, type) => {
      this.addGeminiLog(msg, type);
    };

    geminiAgent.onProgress = (pct, label) => {
      if (this.geminiProgressWrapper) {
        this.geminiProgressWrapper.classList.add('active');
      }
      if (this.geminiProgressBar) {
        this.geminiProgressBar.style.width = `${pct}%`;
      }
      if (this.geminiProgressLabel) {
        this.geminiProgressLabel.textContent = `${label} (${pct}%)`;
      }
      if (this.geminiStatusPill) {
        this.geminiStatusPill.classList.add('busy');
        this.geminiStatusText.textContent = 'EXECUTING';
      }
      if (this.geminiExecBtn) {
        this.geminiExecBtn.disabled = true;
      }
    };

    geminiAgent.onComplete = () => {
      setTimeout(() => {
        if (this.geminiProgressWrapper) {
          this.geminiProgressWrapper.classList.remove('active');
        }
      }, 1500);
      if (this.geminiStatusPill) {
        this.geminiStatusPill.classList.remove('busy');
        refreshAgentStatus();
      }
      if (this.geminiExecBtn) {
        this.geminiExecBtn.disabled = false;
      }
    };

    geminiAgent.onError = () => {
      if (this.geminiStatusPill) {
        this.geminiStatusPill.classList.remove('busy');
        this.geminiStatusText.textContent = 'ERROR';
      }
      if (this.geminiExecBtn) {
        this.geminiExecBtn.disabled = false;
      }
    };

    // Close button
    if (this.geminiCloseBtn) {
      this.geminiCloseBtn.onclick = () => this.closeGeminiTerminal();
    }

    // Toggle API Key Drawer
    if (this.geminiToggleKeyBtn) {
      this.geminiToggleKeyBtn.onclick = () => {
        if (this.geminiKeyDrawer) {
          this.geminiKeyDrawer.classList.toggle('hidden');
        }
      };
    }

    // Save API key
    if (this.geminiSaveKeyBtn) {
      this.geminiSaveKeyBtn.onclick = () => {
        const key = this.geminiKeyInput.value.trim();
        geminiAgent.setApiKey(key);
        geminiAgent.lastError = null;
        refreshAgentStatus();
        this.addGeminiLog(key ? '✓ API key saved. Free-form Gemini prompts enabled.' : 'API key cleared. Offline preset mode enabled.', 'success');
        this.geminiKeyDrawer.classList.add('hidden');
      };
    }

    // Clear API key
    if (this.geminiClearKeyBtn) {
      this.geminiClearKeyBtn.onclick = () => {
        if (this.geminiKeyInput) this.geminiKeyInput.value = '';
        geminiAgent.setApiKey('');
        geminiAgent.lastError = null;
        refreshAgentStatus();
        this.addGeminiLog('API key removed. Offline mode supports limited presets; free-form prompts require Gemini.', 'info');
      };
    }

    // Quick suggestion chips
    const chips = document.querySelectorAll('.gemini-chip');
    chips.forEach(chip => {
      chip.onclick = () => {
        const prompt = chip.getAttribute('data-prompt');
        if (this.geminiPromptInput) {
          this.geminiPromptInput.value = prompt;
          this.geminiPromptInput.focus();
        }
      };
    });

    // Image paste (Ctrl+V) listener
    window.addEventListener('paste', (e) => {
      if (!this.geminiModal || this.geminiModal.classList.contains('hidden')) return;
      const items = (e.clipboardData || window.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            this.handleAttachedImageFile(file);
            break;
          }
        }
      }
    });

    // Drag & Drop onto Gemini Terminal
    if (this.geminiTerminalCard) {
      this.geminiTerminalCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.geminiTerminalCard.classList.add('drag-over');
      });
      this.geminiTerminalCard.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.geminiTerminalCard.classList.remove('drag-over');
      });
      this.geminiTerminalCard.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.geminiTerminalCard.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          const file = e.dataTransfer.files[0];
          if (file.type && file.type.startsWith('image/')) {
            this.handleAttachedImageFile(file);
          }
        }
      });
    }

    // Attach button click & hidden file input
    if (this.geminiAttachBtn && this.geminiFileInput) {
      this.geminiAttachBtn.onclick = () => {
        this.geminiFileInput.click();
      };
      this.geminiFileInput.onchange = () => {
        if (this.geminiFileInput.files && this.geminiFileInput.files[0]) {
          this.handleAttachedImageFile(this.geminiFileInput.files[0]);
          this.geminiFileInput.value = '';
        }
      };
    }

    // Remove image button
    if (this.geminiImageRemoveBtn) {
      this.geminiImageRemoveBtn.onclick = () => {
        this.clearAttachedImage();
      };
    }

    // Form submit
    if (this.geminiForm) {
      this.geminiForm.onsubmit = (e) => {
        e.preventDefault();
        const prompt = this.geminiPromptInput.value.trim();
        const image = this.currentAttachedImage;

        if (!prompt && !image) return;

        const effectivePrompt = prompt || (image ? 'Reconstruct this image in 3D Minecraft voxels' : '');
        this.geminiPromptInput.value = '';
        this.clearAttachedImage();
        geminiAgent.executePrompt(effectivePrompt, image);
      };
    }
  }

  handleAttachedImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1] || '';
      this.currentAttachedImage = {
        name: file.name || 'Pasted Image',
        mimeType: file.type || 'image/png',
        size: file.size,
        dataUrl,
        base64
      };

      if (this.geminiImagePreview) {
        this.geminiImagePreview.src = dataUrl;
      }
      if (this.geminiImageBadge) {
        const kb = Math.max(1, Math.round(file.size / 1024));
        this.geminiImageBadge.textContent = `${this.currentAttachedImage.name} (${kb} KB)`;
      }
      if (this.geminiImagePreviewContainer) {
        this.geminiImagePreviewContainer.classList.remove('hidden');
      }

      this.addGeminiLog(`📸 Attached image "${this.currentAttachedImage.name}". Gemini multimodal vision active!`, 'info');
      if (this.geminiPromptInput) {
        if (!this.geminiPromptInput.value.trim()) {
          this.geminiPromptInput.value = 'Reconstruct this in 3D Minecraft voxels';
        }
        this.geminiPromptInput.focus();
      }
    };
    reader.readAsDataURL(file);
  }

  clearAttachedImage() {
    this.currentAttachedImage = null;
    if (this.geminiImagePreviewContainer) {
      this.geminiImagePreviewContainer.classList.add('hidden');
    }
    if (this.geminiImagePreview) {
      this.geminiImagePreview.src = '';
    }
  }

  addGeminiLog(msg, type = 'info') {
    if (!this.geminiLogFeed) return;
    const entry = document.createElement('div');
    entry.className = `gemini-log-entry ${type}`;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timestamp = document.createElement('span');
    timestamp.style.cssText = 'opacity:0.4; font-size:11px; margin-right:6px;';
    timestamp.textContent = `[${time}]`;
    entry.append(timestamp, document.createTextNode(` ${msg}`));

    this.geminiLogFeed.appendChild(entry);
    this.geminiLogFeed.scrollTop = this.geminiLogFeed.scrollHeight;
  }
}
