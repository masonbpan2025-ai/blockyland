import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { VILLAGER_TRADES } from './crafting.js';
import { CREATIVE_TABS, ALL_CREATIVE_ITEMS, getCreativeItemsByTab, searchCreativeItems } from './creativeCatalog.js';
import {
  getDefaultPathInfo,
  fetchSavedMaps,
  fetchDesignedWorlds,
  loadDesignedWorld,
  saveMapToDefault,
  loadMapFromDefault,
  deleteSavedMap,
  saveMapToCustomFile,
  loadMapFromCustomFile
} from './mapManager.js';

export class UIManager {
  constructor(inventory, player, world, mobs, sounds, game = null) {
    this.inv = inventory;
    this.player = player;
    this.world = world;
    this.mobs = mobs;
    this.sounds = sounds;
    this.game = game;

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

    // AI Agent Terminal Elements
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
    this.geminiOfflineBtn = document.getElementById('gemini-offline-btn');
    this.geminiToggleKeyBtn = document.getElementById('gemini-toggle-key');
    this.geminiCloseBtn = document.getElementById('gemini-close-btn');
    this.geminiVendorRow = document.getElementById('gemini-vendor-row');
    this.geminiVendorButtons = Array.from(document.querySelectorAll('.gemini-vendor-btn'));
    this.geminiModelSelect = document.getElementById('gemini-model-select');
    this.geminiEffortField = document.getElementById('gemini-effort-field');
    this.geminiEffortSelect = document.getElementById('gemini-effort-select');
    this.geminiViewToggle = document.getElementById('gemini-view-toggle');
    this.geminiThinkingToggle = document.getElementById('gemini-thinking-toggle');
    this.geminiVendorHint = document.getElementById('gemini-vendor-hint');

    // Attached-image (vision) elements
    this.geminiImagePreviewContainer = document.getElementById('gemini-image-preview-container');
    this.geminiImagePreview = document.getElementById('gemini-image-preview');
    this.geminiImageBadge = document.getElementById('gemini-image-badge');
    this.geminiImageRemoveBtn = document.getElementById('gemini-image-remove-btn');
    this.geminiAttachBtn = document.getElementById('gemini-attach-btn');
    this.geminiFileInput = document.getElementById('gemini-file-input');
    this.geminiTerminalCard = document.querySelector('.gemini-terminal-card');
    this.currentAttachedImage = null;

    // Live thinking display state
    this.liveThoughtEntry = null;
    this.lastLiveThoughtAt = 0;

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

    // Dedicated Designed Worlds Modal Elements
    this.designedWorldsModal = document.getElementById('designed-worlds-modal');
    this.mapDesignedList = document.getElementById('map-designed-list');
    this.mapDesignedCount = document.getElementById('map-designed-count');
    this.mapDesignedFeedback = document.getElementById('map-designed-feedback');
    this.btnCloseDesignedModal = document.getElementById('btn-close-designed-modal');

    // Map Manager Modal Elements (Saved Worlds)
    this.mapModal = document.getElementById('map-modal');
    this.mapDefaultPathDisplay = document.getElementById('map-default-path-display');
    this.tabSaveMap = document.getElementById('tab-save-map');
    this.tabLoadMap = document.getElementById('tab-load-map');
    this.mapTabSaveContent = document.getElementById('map-tab-save-content');
    this.mapTabLoadContent = document.getElementById('map-tab-load-content');
    this.mapSaveNameInput = document.getElementById('map-save-name-input');
    this.btnSaveDefault = document.getElementById('btn-save-default');
    this.btnSaveCustom = document.getElementById('btn-save-custom');
    this.mapSaveFeedback = document.getElementById('map-save-feedback');
    this.btnOpenCustomFile = document.getElementById('btn-open-custom-file');
    this.btnRefreshSaves = document.getElementById('btn-refresh-saves');
    this.mapFileUploadInput = document.getElementById('map-file-upload-input');
    this.mapSavesList = document.getElementById('map-saves-list');
    this.mapSavesCount = document.getElementById('map-saves-count');
    this.mapLoadFeedback = document.getElementById('map-load-feedback');
    this.btnCloseMapModal = document.getElementById('btn-close-map-modal');
    this.btnSaveMap = document.getElementById('btn-save-map');
    this.btnOpenMap = document.getElementById('btn-open-map');

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
    this.bindMapModalEvents();
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

          // C: Open/close the AI Agent Terminal
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
    const defeatOverlay = typeof document !== 'undefined' ? document.getElementById('defeat-overlay') : null;
    const championOverlay = typeof document !== 'undefined' ? document.getElementById('champion-overlay') : null;
    const setupModal = typeof document !== 'undefined' ? document.getElementById('tournament-setup-modal') : null;

    const isDefeatOpen = defeatOverlay && !defeatOverlay.classList.contains('hidden') && defeatOverlay.classList.contains('visible');
    const isChampionOpen = championOverlay && !championOverlay.classList.contains('hidden') && championOverlay.classList.contains('visible');
    const isSetupOpen = setupModal && !setupModal.classList.contains('hidden');

    return (!this.invModal.classList.contains('hidden')) ||
           (this.creativeModal && !this.creativeModal.classList.contains('hidden')) ||
           (!this.craftModal.classList.contains('hidden')) ||
           (!this.villagerModal.classList.contains('hidden')) ||
           (!this.pauseModal.classList.contains('hidden')) ||
           (this.designedWorldsModal && !this.designedWorldsModal.classList.contains('hidden')) ||
           (this.mapModal && !this.mapModal.classList.contains('hidden')) ||
           Boolean(isDefeatOpen) ||
           Boolean(isChampionOpen) ||
           Boolean(isSetupOpen) ||
           this.isGeminiOpen();
  }

  closeAllModals() {
    this.invModal.classList.add('hidden');
    if (this.creativeModal) this.creativeModal.classList.add('hidden');
    this.craftModal.classList.add('hidden');
    this.villagerModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    if (this.designedWorldsModal) this.designedWorldsModal.classList.add('hidden');
    if (this.mapModal) this.mapModal.classList.add('hidden');
    if (this.geminiModal) this.geminiModal.classList.add('hidden');
    this.hideTooltip();

    // Return any cursor item to inventory
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count);
      this.inv.cursorItem = null;
      this.updateFloatingCursor();
    }
  }

  playPopSound() {
    if (this.sounds && typeof this.sounds.playPop === 'function') {
      this.sounds.playPop();
    } else if (this.sounds && typeof this.sounds.playClick === 'function') {
      this.sounds.playClick();
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
        this.playPopSound();
        this.renderCreativeHotbar();
        this.updateHotbar();
      };
    }

    if (this.creativeDestroySlot) {
      this.creativeDestroySlot.onclick = (e) => {
        if (e.shiftKey) {
          this.inv.hotbar.fill(null);
          this.playPopSound();
          this.renderCreativeHotbar();
          this.updateHotbar();
        } else if (this.inv.cursorItem) {
          this.inv.cursorItem = null;
          this.updateFloatingCursor();
          this.playPopSound();
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
        if (this.game.tournament?.isTournamentMap) {
          this.addChatMessage('The World Martial Arts Tournament is survival mode only!', 'system');
          return;
        }
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

    const btnTitle = document.getElementById('btn-title-screen');
    if (btnTitle) {
      btnTitle.onclick = () => {
        document.exitPointerLock();
        this.closeAllModals();
        this.playPopSound();
        if (this.game) {
          this.game.worldGenerated = false;
          for (const chunk of this.game.world.chunks.values()) {
            for (const key of ['opaqueMesh', 'transparentMesh', 'waterMesh', 'lightMesh']) {
              if (chunk[key]) {
                this.game.scene.remove(chunk[key]);
                chunk[key].geometry.dispose();
                chunk[key] = null;
              }
            }
          }
          this.game.world.chunks.clear();
          this.game.world.water?.reset();
          if (this.game.blockLighting?.chunks) {
            this.game.blockLighting.chunks.clear();
            this.game.blockLighting.dirty = true;
          }
          if (this.game.mobs?.clearMobs) this.game.mobs.clearMobs();
          if (this.game.tournament) {
            this.game.tournament.isTournamentMap = false;
            this.game.tournament.cleanup?.();
          }
          if (this.game.trainingSites) this.game.trainingSites.cleanup?.();
          if (this.game.dungeonMode && this.game.dungeonMode.isActive) {
            this.game.dungeonMode.exitDungeonMode(false);
          }
          if (this.game.mechanisms) {
            this.game.mechanisms.setMechanism('default', this.game);
          }
          if (this.game.targetBoxMesh) this.game.targetBoxMesh.visible = false;
          if (this.game.breakOverlayMesh) this.game.breakOverlayMesh.visible = false;
          this.game.targetBlock = null;
          this.game.targetMob = null;
          this.game.isMouseDown = false;
          this.game.miningTime = 0;
          if (this.game.player) {
            this.game.player.position.set(0, 26, 0);
            this.game.player.velocity.set(0, 0, 0);
          }
        }
        if (this.startOverlay) this.startOverlay.style.display = 'flex';
      };
    }

    if (this.btnSaveMap) {
      this.btnSaveMap.onclick = () => this.openMapModal('save');
    }

    if (this.btnOpenMap) {
      this.btnOpenMap.onclick = () => this.openMapModal('load');
    }
  }

  // Dedicated Designed Worlds Modal Management
  openDesignedWorldsModal() {
    document.exitPointerLock();
    this.closeAllModals();
    if (this.startOverlay) this.startOverlay.style.display = 'none';
    if (!this.designedWorldsModal) return;

    this.designedWorldsModal.classList.remove('hidden');
    this.refreshDesignedWorldsList();
  }

  closeDesignedWorldsModal() {
    if (this.designedWorldsModal) this.designedWorldsModal.classList.add('hidden');
    if (this.mapDesignedFeedback) this.mapDesignedFeedback.classList.add('hidden');
    if (this.game && !this.game.worldGenerated && this.startOverlay) {
      this.startOverlay.style.display = 'flex';
    }
  }

  // Map Manager Modal Management (Saved Worlds)
  openMapModal(initialTab = 'load') {
    document.exitPointerLock();
    this.closeAllModals();
    if (this.startOverlay) this.startOverlay.style.display = 'none';
    if (!this.mapModal) return;

    this.mapModal.classList.remove('hidden');
    this.updateDefaultPathDisplay();

    if (this.mapSaveNameInput && !this.mapSaveNameInput.value) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      this.mapSaveNameInput.value = `World_${dateStr}`;
    }

    this.switchMapTab(initialTab);
  }

  closeMapModal() {
    if (this.mapModal) this.mapModal.classList.add('hidden');
    if (this.mapSaveFeedback) this.mapSaveFeedback.classList.add('hidden');
    if (this.mapLoadFeedback) this.mapLoadFeedback.classList.add('hidden');
    if (this.game && !this.game.worldGenerated && this.startOverlay) {
      this.startOverlay.style.display = 'flex';
    }
  }

  switchMapTab(tab) {
    if (tab === 'save') {
      if (this.tabSaveMap) this.tabSaveMap.classList.add('active');
      if (this.tabLoadMap) this.tabLoadMap.classList.remove('active');
      if (this.mapTabSaveContent) this.mapTabSaveContent.classList.remove('hidden');
      if (this.mapTabLoadContent) this.mapTabLoadContent.classList.add('hidden');
      if (this.mapSaveNameInput) {
        setTimeout(() => this.mapSaveNameInput.focus(), 60);
      }
    } else {
      if (this.tabLoadMap) this.tabLoadMap.classList.add('active');
      if (this.tabSaveMap) this.tabSaveMap.classList.remove('active');
      if (this.mapTabLoadContent) this.mapTabLoadContent.classList.remove('hidden');
      if (this.mapTabSaveContent) this.mapTabSaveContent.classList.add('hidden');
      this.refreshSavedMapsList();
    }
  }

  async updateDefaultPathDisplay() {
    if (!this.mapDefaultPathDisplay) return;
    try {
      const path = await getDefaultPathInfo();
      this.mapDefaultPathDisplay.textContent = path;
    } catch (e) {
      this.mapDefaultPathDisplay.textContent = 'saves/ (Local Computer Folder)';
    }
  }

  showMapFeedback(tab, message, isError = false) {
    const el = tab === 'designed' ? this.mapDesignedFeedback : (tab === 'save' ? this.mapSaveFeedback : this.mapLoadFeedback);
    if (!el) return;
    el.textContent = message;
    el.className = `map-feedback ${isError ? 'error' : 'success'}`;
    el.classList.remove('hidden');
    setTimeout(() => {
      if (el) el.classList.add('hidden');
    }, 5500);
  }

  async refreshDesignedWorldsList() {
    if (!this.mapDesignedList) return;
    this.mapDesignedList.innerHTML = '<div class="map-saves-loading">Loading designed worlds...</div>';

    try {
      const { worlds } = await fetchDesignedWorlds();
      if (this.mapDesignedCount) {
        this.mapDesignedCount.textContent = `${worlds.length} world${worlds.length === 1 ? '' : 's'}`;
      }

      if (!worlds || worlds.length === 0) {
        this.mapDesignedList.innerHTML = `
          <div class="map-saves-empty">
            No designed worlds available.<br>
            <span style="font-size:11px; opacity:0.8;">Check the designed_worlds folder.</span>
          </div>
        `;
        return;
      }

      this.mapDesignedList.innerHTML = '';
      for (const world of worlds) {
        const card = document.createElement('div');
        card.className = 'map-save-card';

        const info = document.createElement('div');
        info.className = 'map-card-info';

        const title = document.createElement('div');
        title.className = 'map-card-title';
        title.textContent = world.name || world.filename;

        const meta = document.createElement('div');
        meta.className = 'map-card-meta';

        const modeBadge = document.createElement('span');
        modeBadge.className = 'map-card-badge';
        modeBadge.textContent = world.gamemode || 'survival';

        const mechBadge = document.createElement('span');
        mechBadge.className = 'map-card-mechanism';
        mechBadge.textContent = `⚡ ${world.mechanismName || 'Custom Mechanism'}`;

        meta.append(modeBadge, mechBadge);

        if (world.chunkCount) {
          const chunkSpan = document.createElement('span');
          chunkSpan.textContent = `${world.chunkCount} Chunks`;
          meta.appendChild(chunkSpan);
        }

        info.append(title, meta);

        if (world.description) {
          const desc = document.createElement('div');
          desc.className = 'map-card-desc';
          desc.textContent = world.description;
          info.appendChild(desc);
        }

        // Actions
        const actions = document.createElement('div');
        actions.className = 'map-card-actions';

        const btnPlay = document.createElement('button');
        btnPlay.className = 'map-card-btn mc-btn-designed';
        btnPlay.textContent = 'Play World';
        btnPlay.onclick = async () => {
          if (!this.game) {
            this.showMapFeedback('designed', 'Game instance not ready', true);
            return;
          }
          btnPlay.disabled = true;
          btnPlay.textContent = 'Loading...';
          try {
            await this.runWorldLoad(
              progress => loadDesignedWorld(this.game, world.filename, { progress }),
              'Loading Designed World'
            );
            this.playPopSound();
            this.showMapFeedback('designed', `Designed world "${world.name}" loaded!`, false);
            setTimeout(() => {
              this.closeAllModals();
              if (this.startOverlay) this.startOverlay.style.display = 'none';
              const canvas = document.getElementById('canvas-container');
              if (canvas) canvas.requestPointerLock();
            }, 300);
          } catch (err) {
            btnPlay.disabled = false;
            btnPlay.textContent = 'Play World';
            this.showMapFeedback('designed', `Load failed: ${err.message}`, true);
          }
        };

        actions.appendChild(btnPlay);
        card.append(info, actions);
        this.mapDesignedList.appendChild(card);
      }
    } catch (err) {
      this.mapDesignedList.innerHTML = `<div class="map-saves-empty" style="color:#ef5350;">Failed to load designed worlds: ${err.message}</div>`;
    }
  }

  async refreshSavedMapsList() {
    if (!this.mapSavesList) return;
    this.mapSavesList.innerHTML = '<div class="map-saves-loading">Scanning default saves directory on local computer...</div>';

    try {
      const { saves, defaultPath } = await fetchSavedMaps();
      if (this.mapDefaultPathDisplay && defaultPath) {
        this.mapDefaultPathDisplay.textContent = defaultPath;
      }

      if (this.mapSavesCount) {
        this.mapSavesCount.textContent = `${saves.length} map${saves.length === 1 ? '' : 's'}`;
      }

      if (!saves || saves.length === 0) {
        this.mapSavesList.innerHTML = `
          <div class="map-saves-empty">
            No saved maps found in default location yet.<br>
            <span style="font-size:11px; opacity:0.8;">Switch to the "Save Current Map" tab to save your world!</span>
          </div>
        `;
        return;
      }

      this.mapSavesList.innerHTML = '';
      for (const save of saves) {
        const card = document.createElement('div');
        card.className = 'map-save-card';

        const info = document.createElement('div');
        info.className = 'map-card-info';

        const title = document.createElement('div');
        title.className = 'map-card-title';
        title.textContent = save.name || save.filename;

        const meta = document.createElement('div');
        meta.className = 'map-card-meta';

        const dateStr = save.savedAt ? new Date(save.savedAt).toLocaleString() : 'Unknown Date';
        const kb = save.size ? Math.round(save.size / 1024) : 0;
        const sizeStr = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;

        const modeBadge = document.createElement('span');
        modeBadge.className = 'map-card-badge';
        modeBadge.textContent = save.gamemode || 'creative';

        const dateSpan = document.createElement('span');
        dateSpan.textContent = dateStr;

        const sizeSpan = document.createElement('span');
        sizeSpan.textContent = sizeStr;

        meta.append(modeBadge, dateSpan, sizeSpan);

        if (save.seed !== undefined) {
          const seedSpan = document.createElement('span');
          seedSpan.textContent = `Seed: ${save.seed}`;
          meta.appendChild(seedSpan);
        }

        if (save.mechanism && save.mechanism !== 'default') {
          const mechBadge = document.createElement('span');
          mechBadge.className = 'map-card-mechanism';
          mechBadge.textContent = `⚡ ${save.mechanismName || save.mechanism}`;
          meta.appendChild(mechBadge);
        }

        info.append(title, meta);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'map-card-actions';

        // Load Button
        const btnLoad = document.createElement('button');
        btnLoad.className = 'map-card-btn mc-btn-green';
        btnLoad.textContent = 'Load';
        btnLoad.onclick = async () => {
          if (!this.game) {
            this.showMapFeedback('load', 'Game instance not ready', true);
            return;
          }
          btnLoad.disabled = true;
          btnLoad.textContent = 'Loading...';
          try {
            await this.runWorldLoad(
              progress => loadMapFromDefault(this.game, save.filename, { progress }),
              'Loading Map'
            );
            this.playPopSound();
            this.showMapFeedback('load', `Map "${save.name}" loaded successfully!`, false);
            setTimeout(() => {
              this.closeAllModals();
              if (this.startOverlay) this.startOverlay.style.display = 'none';
              const canvas = document.getElementById('canvas-container');
              if (canvas) canvas.requestPointerLock();
            }, 300);
          } catch (err) {
            btnLoad.disabled = false;
            btnLoad.textContent = 'Load';
            this.showMapFeedback('load', `Load failed: ${err.message}`, true);
          }
        };

        // Export / Download Button
        const btnExport = document.createElement('button');
        btnExport.className = 'map-card-btn';
        btnExport.textContent = 'Export';
        btnExport.title = 'Save copy to custom file / download';
        btnExport.onclick = async () => {
          try {
            const res = await fetch(`/api/saves/${encodeURIComponent(save.filename)}`);
            if (res.ok) {
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = save.filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              this.showMapFeedback('load', `Exported "${save.filename}" to downloads!`, false);
            }
          } catch (e) {
            this.showMapFeedback('load', `Export failed: ${e.message}`, true);
          }
        };

        // Delete Button
        const btnDelete = document.createElement('button');
        btnDelete.className = 'map-card-btn mc-btn-red';
        btnDelete.textContent = 'Delete';
        btnDelete.onclick = async () => {
          if (confirm(`Are you sure you want to delete map "${save.name}" from local storage?`)) {
            try {
              await deleteSavedMap(save.filename);
              this.playPopSound();
              this.refreshSavedMapsList();
              this.showMapFeedback('load', `Deleted "${save.name}".`, false);
            } catch (err) {
              this.showMapFeedback('load', `Delete failed: ${err.message}`, true);
            }
          }
        };

        actions.append(btnLoad, btnExport, btnDelete);
        card.append(info, actions);
        this.mapSavesList.appendChild(card);
      }
    } catch (err) {
      this.mapSavesList.innerHTML = `<div class="map-saves-empty" style="color:#ef5350;">Failed to scan saves: ${err.message}</div>`;
    }
  }

  bindMapModalEvents() {
    if (this.btnCloseDesignedModal) {
      this.btnCloseDesignedModal.onclick = () => {
        this.closeDesignedWorldsModal();
      };
    }

    if (this.tabSaveMap) {
      this.tabSaveMap.onclick = () => this.switchMapTab('save');
    }
    if (this.tabLoadMap) {
      this.tabLoadMap.onclick = () => this.switchMapTab('load');
    }

    if (this.btnCloseMapModal) {
      this.btnCloseMapModal.onclick = () => {
        this.closeMapModal();
        if (this.game?.worldGenerated) {
          const canvas = document.getElementById('canvas-container');
          if (canvas) canvas.requestPointerLock();
        }
      };
    }

    if (this.btnRefreshSaves) {
      this.btnRefreshSaves.onclick = () => this.refreshSavedMapsList();
    }

    // Save to Default Location
    if (this.btnSaveDefault) {
      this.btnSaveDefault.onclick = async () => {
        if (!this.game) {
          this.showMapFeedback('save', 'Game instance not ready', true);
          return;
        }
        const name = (this.mapSaveNameInput?.value || '').trim() || 'World 1';
        this.btnSaveDefault.disabled = true;
        this.btnSaveDefault.textContent = 'Saving to disk...';

        try {
          const res = await saveMapToDefault(this.game, name);
          this.playPopSound();
          this.showMapFeedback('save', `Map saved successfully to: ${res.path}`, false);
          this.addChatMessage(`Saved map "${name}" to local path: ${res.path}`, 'system');
        } catch (err) {
          this.showMapFeedback('save', `Save failed: ${err.message}`, true);
        } finally {
          this.btnSaveDefault.disabled = false;
          this.btnSaveDefault.textContent = '💾 Save to Default Path (Recommended)';
        }
      };
    }

    // Save to Custom File (Pick Path)
    if (this.btnSaveCustom) {
      this.btnSaveCustom.onclick = async () => {
        if (!this.game) {
          this.showMapFeedback('save', 'Game instance not ready', true);
          return;
        }
        const name = (this.mapSaveNameInput?.value || '').trim() || 'World 1';
        this.btnSaveCustom.disabled = true;
        this.btnSaveCustom.textContent = 'Opening file dialog...';

        try {
          const res = await saveMapToCustomFile(this.game, name);
          if (res.cancelled) {
            // User cancelled file picker
          } else {
            this.playPopSound();
            this.showMapFeedback('save', `Map exported to custom file: ${res.name}`, false);
            this.addChatMessage(`Saved map to custom file "${res.name}"`, 'system');
          }
        } catch (err) {
          this.showMapFeedback('save', `Export failed: ${err.message}`, true);
        } finally {
          this.btnSaveCustom.disabled = false;
          this.btnSaveCustom.textContent = '📁 Save to Custom File / Pick Path...';
        }
      };
    }

    // Open Custom File from Computer
    if (this.btnOpenCustomFile && this.mapFileUploadInput) {
      this.btnOpenCustomFile.onclick = () => {
        this.mapFileUploadInput.value = '';
        this.mapFileUploadInput.click();
      };

      this.mapFileUploadInput.onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!this.game) {
          this.showMapFeedback('load', 'Game instance not ready', true);
          return;
        }

        try {
          this.showMapFeedback('load', `Loading file "${file.name}"...`, false);
          await this.runWorldLoad(
            progress => loadMapFromCustomFile(this.game, file, { progress }),
            'Loading Map File'
          );
          this.playPopSound();
          this.showMapFeedback('load', `Map "${file.name}" loaded successfully!`, false);
          setTimeout(() => {
            this.closeAllModals();
          }, 800);
        } catch (err) {
          this.showMapFeedback('load', `Failed to load file: ${err.message}`, true);
        }
      };
    }
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
    if (typeof msg === 'string' && msg.includes('<') && msg.includes('>')) {
      el.innerHTML = msg;
    } else {
      el.textContent = msg;
    }
    this.chatMessages.appendChild(el);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    // Fade out old messages
    setTimeout(() => {
      if (el.parentNode) el.style.opacity = '0.7';
    }, 8000);
  }

  // --- AI World Agent terminal management ---
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

  openGeminiTerminal(options = {}) {
    document.exitPointerLock();
    this.closeAllModals();
    if (this.geminiModal) {
      this.geminiModal.classList.remove('hidden');
      if (options.showSettings && this.geminiKeyDrawer) {
        this.geminiKeyDrawer.classList.remove('hidden');
      }
      setTimeout(() => {
        if (options.showSettings && this.geminiKeyInput) {
          this.geminiKeyInput.focus();
        } else if (this.geminiPromptInput) {
          this.geminiPromptInput.focus();
        }
      }, 50);
    }
  }

  /** Terminal + settings drawer in one step, for quick offline/API switching. */
  openAgentSettings() {
    this.openGeminiTerminal({ showSettings: true });
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

    const vendorLabel = () => {
      const config = geminiAgent.constructor.vendors?.[geminiAgent.vendor];
      return config?.label || geminiAgent.vendor;
    };

    const refreshAgentStatus = () => {
      if (!this.geminiStatusText || geminiAgent.isExecuting) return;
      if (geminiAgent.lastError) {
        this.geminiStatusText.textContent = 'ERROR';
      } else if (geminiAgent.offlineMode) {
        this.geminiStatusText.textContent = 'OFFLINE MODE';
      } else if (!geminiAgent.apiKey) {
        this.geminiStatusText.textContent = 'NO KEY';
      } else {
        this.geminiStatusText.textContent = `${vendorLabel().toUpperCase()} READY`;
      }
    };

    const refreshModelOptions = () => {
      if (!this.geminiModelSelect) return;
      const models = geminiAgent.getVendorModels();
      const active = geminiAgent.model;
      this.geminiModelSelect.innerHTML = '';
      for (const model of models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.note ? `${model.label} — ${model.note}` : model.label;
        this.geminiModelSelect.appendChild(option);
      }
      // A custom model id (env override or hand-edited storage) must stay selectable.
      if (active && !models.some(model => model.id === active)) {
        const option = document.createElement('option');
        option.value = active;
        option.textContent = `${active} (custom)`;
        this.geminiModelSelect.appendChild(option);
      }
      this.geminiModelSelect.value = active;
    };

    const refreshEffortOptions = () => {
      const supported = geminiAgent.constructor.supportsEffort(geminiAgent.vendor);
      if (this.geminiEffortField) this.geminiEffortField.classList.toggle('hidden', !supported);
      if (!this.geminiEffortSelect) return;
      this.geminiEffortSelect.disabled = !supported;
      const effort = geminiAgent.effort;
      if (supported && effort) this.geminiEffortSelect.value = effort;
    };

    const refreshKeyState = () => {
      if (this.geminiKeyInput) {
        const key = geminiAgent.apiKey;
        const focused = document.activeElement === this.geminiKeyInput;
        if (!focused) this.geminiKeyInput.value = '';
        this.geminiKeyInput.placeholder = geminiAgent.apiKey
          ? `Saved key ••••${geminiAgent.apiKey.slice(-4)} (type to replace)`
          : (geminiAgent.constructor.vendors?.[geminiAgent.vendor]?.keyPlaceholder || 'API key');
        this.geminiKeyInput.dataset.hasKey = key ? 'true' : 'false';
      }
      if (this.geminiVendorButtons) {
        for (const button of this.geminiVendorButtons) {
          const vendorId = button.getAttribute('data-vendor');
          const config = geminiAgent.constructor.vendors?.[vendorId];
          button.classList.toggle('active', vendorId === geminiAgent.vendor);
          if (config) {
            const defaultModel = geminiAgent.constructor.defaultModelFor(vendorId);
            const effort = geminiAgent.constructor.supportsEffort(vendorId)
              ? `, effort ${geminiAgent.constructor.defaultEffortFor(vendorId) || 'high'}`
              : '';
            button.title = `Use ${config.label} — default ${defaultModel}${effort}`;
          }
          const state = button.querySelector('[data-key-state]');
          if (state) {
            const hasKey = !!geminiAgent.getApiKey(vendorId);
            state.textContent = hasKey ? 'key saved' : 'key needed';
            state.classList.toggle('ready', hasKey);
          }
        }
      }
      if (this.geminiVendorHint) {
        const config = geminiAgent.constructor.vendors?.[geminiAgent.vendor];
        this.geminiVendorHint.innerHTML = config
          ? `Add a key from <a href="${config.docsUrl}" target="_blank" rel="noopener">${config.docsLabel}</a> for free-form prompts. ${config.keyHint}`
          : '';
      }
    };

    // The offline button reflects state: it offers to leave offline mode when
    // offline, and to enter it when a key is ready to be used.
    const refreshOfflineButton = () => {
      if (!this.geminiOfflineBtn) return;
      const offline = geminiAgent.offlineMode;
      this.geminiOfflineBtn.textContent = offline ? '✓ Offline Mode' : 'Offline Mode';
      this.geminiOfflineBtn.classList.toggle('active', offline);
      this.geminiOfflineBtn.title = offline
        ? 'Offline mode is ON: built-in presets only. Click to use the API again (key is still saved).'
        : 'Stop sending requests and use the built-in offline presets. Your key is kept.';
    };

    const refreshAgentControls = () => {
      refreshModelOptions();
      refreshEffortOptions();
      refreshKeyState();
      refreshOfflineButton();
      refreshAgentStatus();
    };

    const applyVendor = (vendorId) => {
      if (!vendorId || vendorId === geminiAgent.vendor) return;
      geminiAgent.setVendor(vendorId);
      refreshAgentControls();
      this.addGeminiLog(`Vendor switched to ${vendorLabel()} (${geminiAgent.model}${geminiAgent.effort ? `, effort ${geminiAgent.effort}` : ''}).`, 'info');
    };

    refreshAgentControls();

    // Explain a forced-offline start, so a saved key does not look broken.
    if (geminiAgent.offlineMode) {
      this.addGeminiLog(
        `Offline mode is ON: the terminal uses built-in presets and will not call ${vendorLabel()}. Click "✓ Offline Mode" in ⚙️ Settings (or type /offline) to switch back.`,
        'info'
      );
    }

    // Connect agent callbacks
    geminiAgent.onLog = (msg, type) => {
      this.addGeminiLog(msg, type);
    };

    // Live reasoning: one line that is rewritten as tokens stream in, so a long
    // chain of thought never floods the terminal but always shows activity.
    geminiAgent.onThought = ({ phase, reasoning, content, elapsedMs }) => {
      if (!geminiAgent.thinkingEnabled) return;
      const now = Date.now();
      const force = phase === 'start' || phase === 'end';
      if (!force && now - this.lastLiveThoughtAt < 350) return;
      this.lastLiveThoughtAt = now;

      if (phase === 'start') {
        this.liveThoughtEntry = null;
        return;
      }

      const seconds = (Math.max(0, elapsedMs || 0) / 1000).toFixed(1);
      const text = (reasoning || content || '').trim();
      const body = text
        ? (text.length > 1200 ? `…${text.slice(-1200)}` : text)
        : 'connected, waiting for the model\'s first tokens';
      const label = `🧠 thinking (${seconds}s): `;
      const message = `${label}${body}`;

      if (!this.liveThoughtEntry) {
        this.liveThoughtEntry = this.addGeminiLog(message, 'thought');
        return;
      }
      this.liveThoughtEntry.textContent = message;
      if (this.geminiLogFeed) this.geminiLogFeed.scrollTop = this.geminiLogFeed.scrollHeight;
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
      }
      this.liveThoughtEntry = null;
      refreshAgentStatus();
      refreshKeyState();
      if (this.geminiExecBtn) {
        this.geminiExecBtn.disabled = false;
      }
    };

    geminiAgent.onError = () => {
      if (this.geminiStatusPill) {
        this.geminiStatusPill.classList.remove('busy');
        this.geminiStatusText.textContent = 'ERROR';
      }
      this.liveThoughtEntry = null;
      if (this.geminiExecBtn) {
        this.geminiExecBtn.disabled = false;
      }
    };

    // Close button
    if (this.geminiCloseBtn) {
      this.geminiCloseBtn.onclick = () => this.closeGeminiTerminal();
    }

    // Toggle the settings drawer
    if (this.geminiToggleKeyBtn) {
      this.geminiToggleKeyBtn.onclick = () => {
        if (this.geminiKeyDrawer) {
          this.geminiKeyDrawer.classList.toggle('hidden');
        }
      };
    }

    // Vendor picker
    for (const button of this.geminiVendorButtons) {
      button.onclick = () => applyVendor(button.getAttribute('data-vendor'));
    }

    // Model picker (applies and persists immediately)
    if (this.geminiModelSelect) {
      this.geminiModelSelect.onchange = () => {
        geminiAgent.setModel(this.geminiModelSelect.value);
        geminiAgent.lastError = null;
        refreshAgentStatus();
        this.addGeminiLog(`Model set to ${geminiAgent.model} for ${vendorLabel()}.`, 'info');
      };
    }

    // Reasoning effort picker
    if (this.geminiEffortSelect) {
      this.geminiEffortSelect.onchange = () => {
        geminiAgent.setEffort(this.geminiEffortSelect.value);
        this.addGeminiLog(`Reasoning effort set to ${geminiAgent.effort} for ${vendorLabel()}.`, 'info');
      };
    }

    // Current-view screenshot toggle
    if (this.geminiViewToggle) {
      this.geminiViewToggle.checked = this.isViewCaptureEnabled();
      this.geminiViewToggle.onchange = () => {
        this.viewCaptureEnabled = this.geminiViewToggle.checked;
        try {
          localStorage.setItem('mc_agent_capture_view', this.viewCaptureEnabled ? '1' : '0');
        } catch {
          // Storage unavailable; the preference just will not persist.
        }
        this.addGeminiLog(
          this.viewCaptureEnabled
            ? 'Current-view screenshots enabled: every request will include what you are looking at.'
            : 'Current-view screenshots disabled: the agent will rely on world state only.',
          'info'
        );
      };
    }

    // Live thinking display toggle
    if (this.geminiThinkingToggle) {
      geminiAgent.thinkingEnabled = this.isThinkingDisplayEnabled();
      this.geminiThinkingToggle.checked = geminiAgent.thinkingEnabled;
      this.geminiThinkingToggle.onchange = () => {
        geminiAgent.thinkingEnabled = this.geminiThinkingToggle.checked;
        try {
          localStorage.setItem('mc_agent_show_thinking', geminiAgent.thinkingEnabled ? '1' : '0');
        } catch {
          // Storage unavailable; the preference just will not persist.
        }
        this.addGeminiLog(
          geminiAgent.thinkingEnabled
            ? 'Live thinking display enabled: the terminal shows the model\'s reasoning and elapsed time.'
            : 'Live thinking display disabled.',
          'info'
        );
      };
    }

    // A new turn always starts with a fresh live line.
    if (this.geminiForm) {
      this.geminiForm.addEventListener('submit', () => {
        this.liveThoughtEntry = null;
      });
    }

    // Save settings for the active vendor
    if (this.geminiSaveKeyBtn) {
      this.geminiSaveKeyBtn.onclick = () => {
        const key = (this.geminiKeyInput?.value || '').trim();
        if (key) geminiAgent.setApiKey(key);
        geminiAgent.lastError = null;
        refreshAgentControls();
        this.addGeminiLog(
          geminiAgent.apiKey
            ? `✓ ${vendorLabel()} saved (${geminiAgent.model}${geminiAgent.effort ? `, effort ${geminiAgent.effort}` : ''}). Free-form prompts enabled.`
            : `No API key set for ${vendorLabel()}. Offline preset mode remains active.`,
          geminiAgent.apiKey ? 'success' : 'warning'
        );
        if (this.geminiKeyDrawer) this.geminiKeyDrawer.classList.add('hidden');
      };
    }

    // Clear the stored key for the active vendor only
    if (this.geminiClearKeyBtn) {
      this.geminiClearKeyBtn.onclick = () => {
        if (this.geminiKeyInput) this.geminiKeyInput.value = '';
        geminiAgent.setApiKey('');
        geminiAgent.lastError = null;
        refreshAgentControls();
        this.addGeminiLog(`${vendorLabel()} API key removed. Offline preset mode supports limited commands.`, 'info');
      };
    }

    // Force offline presets without discarding the saved key
    if (this.geminiOfflineBtn) {
      this.geminiOfflineBtn.onclick = () => {
        const offline = !geminiAgent.offlineMode;
        geminiAgent.setOfflineMode(offline);
        refreshAgentControls();
        if (!offline && !geminiAgent.apiKey) {
          this.addGeminiLog(`${vendorLabel()} enabled again, but no API key is saved yet — the terminal stays offline until you add one.`, 'warning');
        } else if (offline) {
          this.addGeminiLog(
            `Offline mode ON. Requests go to the built-in presets; your ${vendorLabel()} key is kept. Type /offline to jump back here.`,
            'success'
          );
        } else {
          this.addGeminiLog(`Offline mode OFF. Free-form ${vendorLabel()} requests are enabled again.`, 'success');
        }
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

    // Drag & Drop onto the terminal card
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

        // Capture the player's current view synchronously, before the modal
        // loses focus and the world keeps moving.
        const viewImage = this.captureCurrentView();

        if (!prompt && !image) return;

        const effectivePrompt = prompt || (image ? 'Reconstruct this image in 3D Minecraft voxels' : '');
        this.geminiPromptInput.value = '';
        this.clearAttachedImage();
        if (viewImage) this.addGeminiLog('📷 Attached a screenshot of your current view.', 'info');
        geminiAgent.executePrompt(effectivePrompt, image, { viewImage });
      };
    }
  }

  /** Whether each request should carry a screenshot of the player's view. */
  isViewCaptureEnabled() {
    if (typeof this.viewCaptureEnabled === 'boolean') return this.viewCaptureEnabled;
    try {
      const stored = localStorage.getItem('mc_agent_capture_view');
      this.viewCaptureEnabled = stored === null ? true : stored === '1';
    } catch {
      this.viewCaptureEnabled = true;
    }
    return this.viewCaptureEnabled;
  }

  /** Whether the terminal should show the model's reasoning as it streams in. */
  isThinkingDisplayEnabled() {
    if (typeof this.thinkingDisplayEnabled === 'boolean') return this.thinkingDisplayEnabled;
    try {
      const stored = localStorage.getItem('mc_agent_show_thinking');
      this.thinkingDisplayEnabled = stored === null ? true : stored === '1';
    } catch {
      this.thinkingDisplayEnabled = true;
    }
    return this.thinkingDisplayEnabled;
  }

  /** Ask the game for a framed screenshot; returns null when unavailable. */
  captureCurrentView() {
    const agent = this.geminiAgent;
    if (!agent || !this.isViewCaptureEnabled()) return null;
    if (!agent.constructor.vendors?.[agent.vendor]?.supportsImages) return null;
    const provider = agent.viewCaptureProvider || this.viewCaptureProvider;
    if (typeof provider !== 'function') return null;
    try {
      return provider() || null;
    } catch (err) {
      console.warn('Current-view capture failed:', err);
      return null;
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

      this.addGeminiLog(`📸 Attached image "${this.currentAttachedImage.name}". It will be sent with your next request.`, 'info');
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
    if (!this.geminiLogFeed) return null;
    const entry = document.createElement('div');
    entry.className = `gemini-log-entry ${type}`;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timestamp = document.createElement('span');
    timestamp.style.cssText = 'opacity:0.4; font-size:11px; margin-right:6px;';
    timestamp.textContent = `[${time}]`;
    entry.append(timestamp, document.createTextNode(` ${msg}`));

    this.geminiLogFeed.appendChild(entry);
    this.geminiLogFeed.scrollTop = this.geminiLogFeed.scrollHeight;
    return entry;
  }

  /**
   * Run a world/map load through the game's progress overlay.
   *
   * Loading a map decompresses every chunk and re-meshes the whole world, which
   * blocks the main thread. The overlay is painted first and then updated between
   * load phases, so the button no longer looks frozen while that happens.
   */
  async runWorldLoad(work, title = 'Loading') {
    if (this.game?.loadMapWithProgress) {
      return this.game.loadMapWithProgress(work, { title });
    }
    return work();
  }
}
