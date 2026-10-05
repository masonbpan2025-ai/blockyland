import { renderHorseInventory } from './horseInventory.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { getBiomeDef, BIOMES } from './biomes.js';
import { VILLAGER_TRADES } from './crafting.js';
import { PROFESSIONS, VILLAGER_LEVELS, calculateTradeCost, executeTrade } from './villagerEconomy.js';
import { CREATIVE_TABS, ALL_CREATIVE_ITEMS, getCreativeItemsByTab, searchCreativeItems, refreshCreativeCatalog } from './creativeCatalog.js';
import { getSmeltingRecipe, getFuelBurnTime } from './furnace.js';
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
import {
  isEnchantableItem,
  calculateBookshelfCount,
  generateEnchantmentOffers,
  applyEnchantment
} from './enchanting.js';
import { getExpProgress, consumePlayerLevels, addPlayerExperience } from './experience.js';
import { renderPlayerDoll } from './playerDoll.js';
import { BrewingStand, getBrewingResult, POTION_DATA } from './brewing.js';
import { calculateAnvilResult, getAnvilDegradation } from './anvil.js';
import { calculateGrindstoneResult } from './grindstone.js';
import { calculateBeaconPyramid, applyBeaconBuffs, calculateConduitFrame, applyConduitPower } from './beaconConduit.js';

/**
 * Resolve an item icon path, falling back to a generated tile when the asset is missing.
 *
 * Generated content references icon paths that may not exist. Rather than let that render as a
 * broken image, a missing icon becomes a small coloured square carrying the item name's initial,
 * which stays legible and tells the player which item they are looking at.
 */
export function resolveItemIcon(icon, name = '') {
  if (icon) return icon;
  return placeholderItemIcon(name);
}

const placeholderIconCache = new Map();

/** Draw a placeholder icon for a named item. Cached, because the hotbar re-renders every frame. */
export function placeholderItemIcon(name = '') {
  const label = (name || '?').trim();
  const key = label || '?';
  if (placeholderIconCache.has(key)) return placeholderIconCache.get(key);
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Deterministic colour per name, so the same item always looks the same.
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  ctx.fillStyle = `hsl(${hue}, 38%, 34%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = `hsl(${hue}, 38%, 22%)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((label[0] || '?').toUpperCase(), size / 2, size / 2 + 1);
  const url = canvas.toDataURL();
  placeholderIconCache.set(key, url);
  return url;
}

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
    this.armorBarEl = document.getElementById('armor-bar');
    this.hungerBarEl = document.getElementById('hunger-bar');
    this.offhandHudEl = document.getElementById('offhand-hud-slot');
    this.expBarEl = document.getElementById('exp-bar');
    this.expLevelEl = document.getElementById('exp-level');

    this.debugScreen = document.getElementById('debug-screen');
    this.debugScreenRight = document.getElementById('debug-screen-right');
    this.showDebug = false;

    // Modals
    this.invModal = document.getElementById('inventory-modal');
    this.craftModal = document.getElementById('crafting-modal');
    this.furnaceModal = document.getElementById('furnace-modal');
    this.closeFurnaceBtn = document.getElementById('close-furnace');
    this.furnaceInputSlot = document.getElementById('furnace-input-slot');
    this.furnaceFuelSlot = document.getElementById('furnace-fuel-slot');
    this.furnaceOutputSlot = document.getElementById('furnace-output-slot');
    this.furnaceFlameActive = document.getElementById('furnace-flame-active');
    this.furnaceArrowFill = document.getElementById('furnace-arrow-fill');
    this.currentFurnacePos = null;

    this.chestModal = document.getElementById('chest-modal');
    this.closeChestBtn = document.getElementById('close-chest');
    this.chestTitle = document.getElementById('chest-title');
    this.chestSlotsGrid = document.getElementById('chest-slots-grid');
    this.currentChestPos = null;

    this.enchantingModal = document.getElementById('enchanting-modal');
    this.closeEnchantingBtn = document.getElementById('close-enchanting');
    this.enchantItemSlot = document.getElementById('enchant-item-slot');
    this.enchantLapisSlot = document.getElementById('enchant-lapis-slot');
    this.enchantBookshelvesNum = document.getElementById('enchant-bookshelves-num');
    this.currentEnchantingPos = null;
    this.enchantSlottedItem = null;
    this.enchantSlottedLapis = null;
    this.currentOffers = [];

    this.villagerModal = document.getElementById('villager-modal');

    // Brewing Stand
    this.brewingModal = document.getElementById('brewing-modal');
    this.closeBrewingBtn = document.getElementById('close-brewing');
    this.brewingStand = new BrewingStand();
    this.currentBrewingPos = null;

    // Anvil
    this.anvilModal = document.getElementById('anvil-modal');
    this.closeAnvilBtn = document.getElementById('close-anvil');
    this.anvilLeftItem = null;
    this.anvilRightItem = null;
    this.anvilCustomName = '';
    this.currentAnvilPos = null;

    // Grindstone
    this.grindstoneModal = document.getElementById('grindstone-modal');
    this.closeGrindstoneBtn = document.getElementById('close-grindstone');
    this.grindstoneTopItem = null;
    this.grindstoneBottomItem = null;
    this.currentGrindstonePos = null;

    // Beacon
    this.beaconModal = document.getElementById('beacon-modal');
    this.closeBeaconBtn = document.getElementById('close-beacon');
    this.beaconPos = null;
    this.beaconState = null;
    this.beaconPaymentItem = null;
    this.beaconSelectedPrimary = null;
    this.beaconSelectedSecondary = null;

    this.pauseModal = document.getElementById('pause-menu');
    this.mobDebugButton = document.getElementById('btn-mob-debug');
    this.mobDebugEnabled = false;
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
    this.creativeSlotsScroll = document.getElementById('creative-slots-scroll');
    this.creativeSurvivalView = document.getElementById('creative-survival-view');
    this.creativeStorageGrid = document.getElementById('creative-storage-grid');
    this.creativePlayerPreview = document.getElementById('creative-player-preview');
    this.creativeSearchWrapper = document.getElementById('creative-search-wrapper');
    this.creativeItemGrid = document.getElementById('creative-item-grid');
    this.creativeHotbarGrid = document.getElementById('creative-hotbar-grid');
    this.creativeSearchInput = document.getElementById('creative-search-input');
    this.creativeClearSearchBtn = document.getElementById('creative-clear-search-btn');
    this.creativeTabTitle = document.getElementById('creative-tab-title');
    this.creativeItemCount = document.getElementById('creative-item-count');
    this.creativeDestroySlot = document.getElementById('creative-destroy-slot');
    this.btnClearHotbar = document.getElementById('btn-clear-hotbar');
    this.closeCreative = document.getElementById('close-creative');
    this.playerPreviewBox = document.getElementById('player-preview-box');
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

    // Biome Selection Modal Elements
    this.biomeModal = document.getElementById('world-biome-modal');
    this.worldBiomeSelect = document.getElementById('world-biome-select');
    this.worldSeedInput = document.getElementById('world-seed-input');
    this.btnRandomizeSeed = document.getElementById('btn-randomize-seed');
    this.btnCreateWorldConfirm = document.getElementById('btn-create-world-confirm');
    this.btnCloseBiomeModal = document.getElementById('btn-close-biome-modal');
    this.biomeInfoCard = document.getElementById('biome-info-card');
    this.biomeInfoIcon = document.getElementById('biome-info-icon');
    this.biomeInfoName = document.getElementById('biome-info-name');
    this.biomeInfoDimension = document.getElementById('biome-info-dimension');
    this.biomeInfoDesc = document.getElementById('biome-info-desc');
    this.biomeTagCategory = document.getElementById('biome-tag-category');
    this.biomeTagBlocks = document.getElementById('biome-tag-blocks');
    this.biomeTagMobs = document.getElementById('biome-tag-mobs');

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
    this.bindBiomeModalEvents();
    this.bindChatEvents();
    this.bindFloatingCursor();

    const leaveBedBtn = document.getElementById('leave-bed-btn');
    if (leaveBedBtn) {
      leaveBedBtn.onclick = () => {
        if (this.game?.bedManager?.isSleeping) {
          this.game.bedManager.leaveBed();
        }
      };
    }

    if (this.closeFurnaceBtn) {
      this.closeFurnaceBtn.onclick = () => this.closeFurnaceModal();
    }
    if (this.closeChestBtn) {
      this.closeChestBtn.onclick = () => this.closeChestModal();
    }
    if (this.closeEnchantingBtn) {
      this.closeEnchantingBtn.onclick = () => this.closeEnchantingModal();
    }

    window.addEventListener('keydown', (e) => {
      // Toggle F3 Debug
      if (e.code === 'F3') {
        e.preventDefault();
        this.showDebug = !this.showDebug;
        this.debugScreen.style.display = this.showDebug ? 'block' : 'none';
        this.debugScreenRight.style.display = this.showDebug ? 'block' : 'none';
      }

      // Hotbar selection 1-9
      if (e.code >= 'Digit1' && e.code <= 'Digit9' && !this.isChatOpen && !this.isGeminiOpen() && !this.isModalOpen()) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          this.inv.activeSlot = parseInt(e.code.replace('Digit', '')) - 1;
          this.updateHotbar();
        }
      }

      // E: Open/close inventory or close current open modal
      if (e.code === 'KeyE' && !this.isChatOpen && !this.isGeminiOpen()) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          if (this.isModalOpen()) {
            this.closeAllModals();
          } else {
            this.toggleInventory();
          }
        }
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
      if ((e.code === 'KeyT' || e.code === 'Slash') && !this.isModalOpen() && !this.isChatOpen && !this.isGeminiOpen()) {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          this.openChat(e.code === 'Slash' ? '/' : '');
        }
      }

      // ESC: Close open modals or toggle pause menu
      if (e.code === 'Escape') {
        if (this.game?.bedManager?.isSleeping) {
          this.game.bedManager.leaveBed();
          return;
        } else if (this.isChatOpen) {
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
      if (this.isModalOpen() || this.isChatOpen || this.isGeminiOpen()) return;
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

    if (typeof document !== 'undefined') {
      const anyGameModal = document.querySelector('.game-modal:not(.hidden)');
      if (anyGameModal) return true;
    }

    return (!this.invModal.classList.contains('hidden')) ||
           (this.creativeModal && !this.creativeModal.classList.contains('hidden')) ||
           (!this.craftModal.classList.contains('hidden')) ||
           (this.furnaceModal && !this.furnaceModal.classList.contains('hidden')) ||
           (this.chestModal && !this.chestModal.classList.contains('hidden')) ||
           (this.enchantingModal && !this.enchantingModal.classList.contains('hidden')) ||
           (!this.villagerModal.classList.contains('hidden')) ||
           (!this.pauseModal.classList.contains('hidden')) ||
           (this.designedWorldsModal && !this.designedWorldsModal.classList.contains('hidden')) ||
           (this.mapModal && !this.mapModal.classList.contains('hidden')) ||
           (this.biomeModal && !this.biomeModal.classList.contains('hidden')) ||
           Boolean(isDefeatOpen) ||
           Boolean(isChampionOpen) ||
           Boolean(isSetupOpen) ||
           this.isGeminiOpen();
  }

  closeAllModals() {
    this.invModal.classList.add('hidden');
    if (this.creativeModal) this.creativeModal.classList.add('hidden');
    this.craftModal.classList.add('hidden');
    if (this.furnaceModal) this.furnaceModal.classList.add('hidden');
    if (this.game?.furnaceManager) this.game.furnaceManager.closeOpenFurnace();
    this.currentFurnacePos = null;
    if (this.chestModal) this.chestModal.classList.add('hidden');
    if (this.game?.chestManager) this.game.chestManager.closeChest();
    this.currentChestPos = null;
    if (this.enchantingModal && !this.enchantingModal.classList.contains('hidden')) {
      this.closeEnchantingModal();
    }
    if (this.brewingModal && !this.brewingModal.classList.contains('hidden')) {
      this.closeBrewingModal();
    }
    if (this.anvilModal && !this.anvilModal.classList.contains('hidden')) {
      this.closeAnvilModal();
    }
    if (this.grindstoneModal && !this.grindstoneModal.classList.contains('hidden')) {
      this.closeGrindstoneModal();
    }
    if (this.beaconModal && !this.beaconModal.classList.contains('hidden')) {
      this.closeBeaconModal();
    }
    this.villagerModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    if (this.designedWorldsModal) this.designedWorldsModal.classList.add('hidden');
    if (this.mapModal) this.mapModal.classList.add('hidden');
    if (this.biomeModal) this.biomeModal.classList.add('hidden');
    if (this.geminiModal) this.geminiModal.classList.add('hidden');
    this.hideTooltip();

    // Return any cursor item to inventory
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count);
      this.inv.cursorItem = null;
    }
    // Always sync the ghost icon, whether or not an item was held: this is the
    // single place every close path funnels through, so it cannot be left visible.
    this.updateFloatingCursor();
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
    if (!this.hotbarEl) return;
    const slots = this.hotbarEl.children;
    for (let i = 0; i < 9; i++) {
      const slot = slots[i];
      if (!slot) continue;
      slot.className = 'hotbar-slot' + (i === this.inv.activeSlot ? ' active' : '');
      slot.innerHTML = '';

      const item = this.inv.hotbar[i];
      if (item) {
        const meta = this.inv.getItemMeta(item);
        if (meta) {
          const img = document.createElement('img');
          img.className = 'slot-icon';
          img.src = resolveItemIcon(meta.icon, meta.name);
          // Generated icon paths may not exist as an asset; fall back rather than showing a broken image.
          img.onerror = () => { img.onerror = null; img.src = placeholderItemIcon(meta.name); };
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

    // Off-hand HUD slot update
    const offhandSlot = document.getElementById('offhand-hud-slot') || this.offhandHudEl;
    if (offhandSlot) {
      offhandSlot.innerHTML = '';
      const offhandItem = this.inv.getOffhandItem ? this.inv.getOffhandItem() : this.inv.offhand;
      if (offhandItem) {
        offhandSlot.style.display = 'flex';
        const meta = this.inv.getItemMeta(offhandItem);
        if (meta) {
          const img = document.createElement('img');
          img.className = 'slot-icon';
          img.src = resolveItemIcon(meta.icon, meta.name);
          // Generated icon paths may not exist as an asset; fall back rather than showing a broken image.
          img.onerror = () => { img.onerror = null; img.src = placeholderItemIcon(meta.name); };
          offhandSlot.appendChild(img);

          if (meta.count > 1) {
            const count = document.createElement('span');
            count.className = 'slot-count';
            count.textContent = meta.count;
            offhandSlot.appendChild(count);
          }
        }
      } else {
        offhandSlot.style.display = 'none';
      }
    }
  }

  initStatusBarsDOM() {
    const isTournament = !!(this.game?.tournament?.isTournamentMap || (this.player && this.player.maxHealth > 20));
    const maxHearts = isTournament ? 30 : Math.max(10, Math.ceil((this.player?.maxHealth || 20) / 2));

    // Armor shields (10 shields = up to 20 armor points)
    if (this.armorBarEl) {
      this.armorBarEl.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const shield = document.createElement('div');
        shield.className = 'stat-icon armor-icon';
        this.armorBarEl.appendChild(shield);
      }
    }

    // Hearts (30 in tournament mode = 3x long, 10 in standard mode)
    if (this.healthBarEl) {
      this.healthBarEl.innerHTML = '';
      for (let i = 0; i < maxHearts; i++) {
        const heart = document.createElement('div');
        heart.className = 'stat-icon';
        heart.style.backgroundImage = 'radial-gradient(circle, #ff2222 60%, #880000 90%)';
        heart.style.borderRadius = '3px';
        this.healthBarEl.appendChild(heart);
      }
    }

    // 10 Drumsticks
    if (this.hungerBarEl) {
      this.hungerBarEl.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const drum = document.createElement('div');
        drum.className = 'stat-icon';
        drum.style.backgroundImage = 'radial-gradient(circle, #c87834 60%, #5a2e0a 90%)';
        drum.style.borderRadius = '3px';
        this.hungerBarEl.appendChild(drum);
      }
    }
  }

  updateStats() {
    const isCreative = this.player.gamemode === 'creative';
    const statusBars = document.getElementById('status-bars');
    const expContainer = document.getElementById('exp-container');
    if (statusBars) statusBars.style.display = isCreative ? 'none' : 'flex';
    if (expContainer) expContainer.style.display = isCreative ? 'none' : 'block';
    if (isCreative) return;

    const isTournament = !!(this.game?.tournament?.isTournamentMap || (this.player && this.player.maxHealth > 20));
    const expectedHearts = isTournament ? 30 : Math.max(10, Math.ceil((this.player?.maxHealth || 20) / 2));

    if (this.healthBarEl && this.healthBarEl.children.length !== expectedHearts) {
      this.initStatusBarsDOM();
    }

    if (statusBars) {
      if (isTournament) {
        statusBars.classList.add('tournament-mode');
      } else {
        statusBars.classList.remove('tournament-mode');
      }
    }

    // Armor Bar calculation
    const armorPoints = this.inv?.getTotalArmorPoints ? this.inv.getTotalArmorPoints() : 0;
    if (this.armorBarEl) {
      if (armorPoints <= 0) {
        this.armorBarEl.style.display = 'none';
      } else {
        this.armorBarEl.style.display = 'flex';
        const shields = this.armorBarEl.children;
        for (let i = 0; i < shields.length; i++) {
          const val = (i + 1) * 2;
          if (armorPoints >= val) {
            shields[i].style.opacity = '1';
            shields[i].style.background = 'radial-gradient(circle, #f1f5f9 60%, #94a3b8 90%)';
            shields[i].style.border = '1px solid #475569';
          } else if (armorPoints >= val - 1) {
            shields[i].style.opacity = '1';
            shields[i].style.background = 'linear-gradient(to right, #f1f5f9 50%, rgba(30, 41, 59, 0.4) 50%)';
            shields[i].style.border = '1px solid #475569';
          } else {
            shields[i].style.opacity = '0.25';
            shields[i].style.background = '#1e293b';
            shields[i].style.border = '1px solid #0f172a';
          }
        }
      }
    }

    // Health hearts
    const hearts = this.healthBarEl.children;
    const hp = Math.ceil(this.player.health);
    const withered = this.player.hasStatusEffect?.('wither');
    for (let i = 0; i < hearts.length; i++) {
      const heartVal = (i + 1) * 2;
      if (hp >= heartVal) {
        hearts[i].style.opacity = '1';
        hearts[i].style.background = withered ? 'radial-gradient(circle, #292929 60%, #080808 90%)' : 'radial-gradient(circle, #ff2222 60%, #880000 90%)';
      } else if (hp >= heartVal - 1) {
        hearts[i].style.opacity = '1';
        hearts[i].style.background = withered ? 'linear-gradient(to right, #292929 50%, #444444 50%)' : 'linear-gradient(to right, #ff2222 50%, #444444 50%)';
      } else {
        hearts[i].style.opacity = '0.35';
        hearts[i].style.background = '#222';
      }
    }

    // Hunger drumsticks
    const drumsticks = this.hungerBarEl.children;
    const hunger = Math.ceil(this.player.hunger);
    for (let i = 0; i < drumsticks.length; i++) {
      const val = (i + 1) * 2;
      drumsticks[i].style.opacity = (hunger >= val) ? '1' : '0.35';
    }

    // Experience
    if (this.expLevelEl) {
      this.expLevelEl.textContent = this.player.level > 0 ? this.player.level : '';
    }
    if (this.expBarEl) {
      const progress = getExpProgress(this.player);
      this.expBarEl.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
    }
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

  setBossBar(id, title, progress, color = '#a855f7') {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('boss-bars-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'boss-bars-container';
      container.style.position = 'fixed';
      container.style.top = '12px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.alignItems = 'center';
      container.style.zIndex = '9999';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    let barEl = document.getElementById(`boss-bar-${id}`);
    if (!barEl) {
      barEl = document.createElement('div');
      barEl.id = `boss-bar-${id}`;
      barEl.style.width = '360px';
      barEl.style.display = 'flex';
      barEl.style.flexDirection = 'column';
      barEl.style.alignItems = 'center';
      barEl.innerHTML = `
        <div class="boss-bar-title" style="color:#ffffff;font-size:13px;font-weight:bold;text-shadow:1px 1px 2px #000;margin-bottom:3px;font-family:sans-serif;">${title}</div>
        <div class="boss-bar-track" style="width:100%;height:10px;background:#18181b;border:2px solid #27272a;box-shadow:0 0 6px rgba(0,0,0,0.8);border-radius:2px;overflow:hidden;">
          <div class="boss-bar-fill" style="width:${Math.round(progress * 100)}%;height:100%;background:${color};transition:width 0.15s ease-out;"></div>
        </div>
      `;
      container.appendChild(barEl);
    } else {
      const titleEl = barEl.querySelector('.boss-bar-title');
      const fillEl = barEl.querySelector('.boss-bar-fill');
      if (titleEl) titleEl.textContent = title;
      if (fillEl) {
        fillEl.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
        if (color) fillEl.style.background = color;
      }
    }
  }

  removeBossBar(id) {
    if (typeof document === 'undefined') return;
    const barEl = document.getElementById(`boss-bar-${id}`);
    if (barEl) barEl.remove();
  }

  setHorseJumpMeter(charge) {
    if (typeof document === 'undefined') return;
    let meter = document.getElementById('horse-jump-meter');
    if (charge <= 0) {
      if (meter) meter.style.display = 'none';
      return;
    }
    if (!meter) {
      meter = document.createElement('div');
      meter.id = 'horse-jump-meter';
      meter.style.position = 'fixed';
      meter.style.bottom = '85px';
      meter.style.left = '50%';
      meter.style.transform = 'translateX(-50%)';
      meter.style.width = '240px';
      meter.style.height = '8px';
      meter.style.background = '#1e293b';
      meter.style.border = '2px solid #475569';
      meter.style.borderRadius = '3px';
      meter.style.zIndex = '9999';
      meter.style.overflow = 'hidden';
      meter.innerHTML = `<div class="jump-fill" style="width:0%;height:100%;background:#38bdf8;"></div>`;
      document.body.appendChild(meter);
    }
    meter.style.display = 'block';
    const fill = meter.querySelector('.jump-fill');
    if (fill) fill.style.width = `${Math.round(charge * 100)}%`;
  }

  // Inventory Modal Management
  openHorseInventory(mount) {
    if(!mount?.isTamed || mount.isBaby)return;
    document.exitPointerLock();this.closeAllModals();this.invModal.classList.remove('hidden');this.renderInventoryGrids();renderHorseInventory(this,mount);
  }

  toggleInventory() {
    const mount=this.player.ridingMob;
    if(mount && ['horse','donkey','mule'].includes(mount.type)){
      if(!mount.isTamed)return;
      if(document.getElementById('horse-equipment')&&!this.invModal.classList.contains('hidden')){this.closeAllModals();return;}
      this.openHorseInventory(mount);return;
    }
    document.getElementById('horse-equipment')?.remove();
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
    refreshCreativeCatalog();
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
        if (this.activeCreativeTab === 'survival_inventory') {
          this.renderCreativeSurvivalView();
        }
        this.updateHotbar();
      };
    }

    if (this.creativeDestroySlot) {
      this.creativeDestroySlot.onclick = (e) => {
        if (e.shiftKey) {
          this.inv.hotbar.fill(null);
          this.playPopSound();
          this.renderCreativeHotbar();
          if (this.activeCreativeTab === 'survival_inventory') {
            this.renderCreativeSurvivalView();
          }
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

    // Top Tabs: building, colored, natural, functional, redstone, building, search/all
    const topTabIds = ['building_blocks', 'colored_blocks', 'natural_blocks', 'functional_blocks', 'redstone_blocks', 'building', 'all_items'];
    // Bottom Tabs: tools_utilities, combat, food_drinks, ingredients, spawn_eggs, survival_inventory
    const bottomTabIds = ['tools_utilities', 'combat', 'food_drinks', 'ingredients', 'spawn_eggs', 'survival_inventory'];

    const renderTabRow = (container, ids) => {
      container.innerHTML = '';
      ids.forEach(id => {
        const tabDef = CREATIVE_TABS.find(t => t.id === id) || (id === 'survival_inventory' ? {
          id: 'survival_inventory',
          name: 'Survival Inventory',
          icon: '/assets/items/chest.png'
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
    if (this.activeCreativeTab === 'survival_inventory') {
      if (this.creativeSlotsScroll) this.creativeSlotsScroll.classList.add('hidden');
      if (this.creativeSurvivalView) this.creativeSurvivalView.classList.remove('hidden');
      if (this.creativeSearchWrapper) this.creativeSearchWrapper.style.visibility = 'hidden';
      if (this.creativeTabTitle) this.creativeTabTitle.textContent = 'Survival Inventory';
      if (this.creativeItemCount) this.creativeItemCount.textContent = '';
      if (this.creativeDestroySlot) {
        this.creativeDestroySlot.innerHTML = '<span class="destroy-x-icon">✕</span>';
      }

      this.renderCreativeSurvivalView();
      return;
    }

    if (this.creativeSlotsScroll) this.creativeSlotsScroll.classList.remove('hidden');
    if (this.creativeSurvivalView) this.creativeSurvivalView.classList.add('hidden');
    if (this.creativeSearchWrapper) this.creativeSearchWrapper.style.visibility = 'visible';
    if (this.creativeDestroySlot) {
      this.creativeDestroySlot.innerHTML = '<img src="/assets/items/lava_bucket.png" alt="Destroy" class="slot-icon">';
    }

    if (!this.creativeItemGrid) return;
    this.creativeItemGrid.innerHTML = '';

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
      img.src = resolveItemIcon(item.icon, item.name);
      // Generated icon paths may not exist as an asset; fall back rather than showing a broken image.
      img.onerror = () => { img.onerror = null; img.src = placeholderItemIcon(item.name); };
      img.alt = item.name;
      slot.appendChild(img);

      if (item.count > 1) {
        const countSpan = document.createElement('span');
        countSpan.className = 'slot-count';
        countSpan.textContent = item.count;
        slot.appendChild(countSpan);
      }

      slot.onclick = (e) => {
        const itemObj = {
          id: item.id,
          isBlock: item.isBlock,
          count: item.count,
          isBuilding: item.isBuilding,
          buildingId: item.buildingId,
          icon: item.icon
        };
        if (e.shiftKey) {
          // Transfer directly into first empty hotbar slot
          for (let i = 0; i < 9; i++) {
            if (!this.inv.hotbar[i]) {
              this.inv.hotbar[i] = itemObj;
              this.sounds.playClick();
              this.renderCreativeHotbar();
              this.updateHotbar();
              return;
            }
          }
          // If hotbar full, replace active slot
          this.inv.hotbar[this.inv.activeSlot] = itemObj;
          this.sounds.playClick();
          this.renderCreativeHotbar();
          this.updateHotbar();
        } else {
          // Left click: pickup full stack to cursor
          this.inv.cursorItem = itemObj;
          this.sounds.playClick();
          this.updateFloatingCursor();
        }
      };

      slot.oncontextmenu = (e) => {
        e.preventDefault();
        // Right click: pickup single item to cursor
        this.inv.cursorItem = {
          id: item.id,
          isBlock: item.isBlock,
          count: 1,
          isBuilding: item.isBuilding,
          buildingId: item.buildingId,
          icon: item.icon
        };
        this.sounds.playClick();
        this.updateFloatingCursor();
      };

      slot.onmouseenter = (e) => {
        const sub = item.isBuilding ? 'Building' : (item.isBlock ? 'Block' : (item.id.replace(/_/g, ' ')));
        this.showTooltip(e.clientX, e.clientY, item.name, sub);
      };
      slot.onmousemove = (e) => {
        this.positionTooltip(e.clientX, e.clientY);
      };
      slot.onmouseleave = () => this.hideTooltip();

      this.creativeItemGrid.appendChild(slot);
    });
  }

  renderCreativeSurvivalView() {
    // 1. Render Armor Slots
    const slotKeys = ['head', 'chest', 'legs', 'feet'];
    const slotNames = { head: 'Helmet', chest: 'Chestplate', legs: 'Leggings', feet: 'Boots' };

    slotKeys.forEach(slotKey => {
      const slot = document.getElementById(`creative-armor-slot-${slotKey}`);
      if (!slot) return;
      const item = this.inv.armor ? this.inv.armor[slotKey] : null;
      this.renderSlotContent(slot, item);
      slot.classList.toggle('has-item', Boolean(item));

      slot.onclick = (e) => {
        this.inv.handleArmorSlotClick?.(slotKey, e.button === 2, e.shiftKey);
        this.renderCreativeSurvivalView();
        this.renderCreativeHotbar();
        this.updateHotbar();
        this.updateStats();
      };
      slot.oncontextmenu = (e) => {
        e.preventDefault();
        this.inv.handleArmorSlotClick?.(slotKey, true, e.shiftKey);
        this.renderCreativeSurvivalView();
        this.renderCreativeHotbar();
        this.updateHotbar();
        this.updateStats();
      };

      if (item) {
        const meta = this.inv.getItemMeta(item);
        slot.onmouseenter = (e) => {
          let desc = `Armor: +${meta.armor || 0}`;
          if (meta.toughness) desc += ` | Toughness: +${meta.toughness}`;
          this.showTooltip(e.clientX, e.clientY, meta.name, desc);
        };
        slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
        slot.onmouseleave = () => this.hideTooltip();
      } else {
        slot.onmouseenter = (e) => {
          this.showTooltip(e.clientX, e.clientY, `${slotNames[slotKey]} Slot`, 'Click with armor or shift-click from inventory to equip');
        };
        slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
        slot.onmouseleave = () => this.hideTooltip();
      }
    });

    // 2. Render Player Character Doll with equipped armor
    const dollContainer = document.getElementById('creative-player-preview');
    if (dollContainer) {
      renderPlayerDoll(dollContainer, this.inv.armor);
    }

    // 3. Render 27 Storage Slots
    const storageGrid = document.getElementById('creative-storage-grid');
    if (storageGrid) {
      storageGrid.innerHTML = '';
      this.inv.storage.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        this.renderSlotContent(slot, item);

        slot.onclick = (e) => {
          this.inv.handleSlotClick(this.inv.storage, idx, e.button === 2, e.shiftKey);
          this.renderCreativeSurvivalView();
          this.renderCreativeHotbar();
          this.updateHotbar();
          this.updateStats();
        };
        slot.oncontextmenu = (e) => {
          e.preventDefault();
          this.inv.handleSlotClick(this.inv.storage, idx, true, e.shiftKey);
          this.renderCreativeSurvivalView();
          this.renderCreativeHotbar();
          this.updateHotbar();
          this.updateStats();
        };
        if (item) {
          const meta = this.inv.getItemMeta(item);
          slot.onmouseenter = (e) => this.showTooltip(e.clientX, e.clientY, meta.name, `Count: ${item.count}`);
          slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
          slot.onmouseleave = () => this.hideTooltip();
        }
        storageGrid.appendChild(slot);
      });
    }

    this.updateFloatingCursor();
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
        if (this.activeCreativeTab === 'survival_inventory') {
          this.renderCreativeSurvivalView();
        }
        this.updateHotbar();
        this.updateStats();
      };

      slot.oncontextmenu = (e) => {
        e.preventDefault();
        this.inv.handleSlotClick(this.inv.hotbar, i, true, e.shiftKey);
        this.renderCreativeHotbar();
        if (this.activeCreativeTab === 'survival_inventory') {
          this.renderCreativeSurvivalView();
        }
        this.updateHotbar();
        this.updateStats();
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

  showTooltip(x, y, title, subtitle = '', enchantments = []) {
    if (!this.mcTooltip) return;
    if (this.mcTooltipTitle) this.mcTooltipTitle.textContent = title;
    if (this.mcTooltipSub) {
      let content = subtitle ? `<div>${subtitle}</div>` : '';
      if (Array.isArray(enchantments) && enchantments.length > 0) {
        for (const e of enchantments) {
          content += `<div class="mc-tooltip-ench">${e.name || e.id}</div>`;
        }
      }
      this.mcTooltipSub.innerHTML = content;
      this.mcTooltipSub.style.display = content ? 'block' : 'none';
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
    if (this.closeFurnaceBtn) this.closeFurnaceBtn.onclick = () => this.closeAllModals();
    document.getElementById('close-villager').onclick = () => this.closeAllModals();
    document.getElementById('close-brewing')?.addEventListener('click', () => this.closeAllModals());
    document.getElementById('close-anvil')?.addEventListener('click', () => this.closeAllModals());
    document.getElementById('close-grindstone')?.addEventListener('click', () => this.closeAllModals());
    document.getElementById('close-beacon')?.addEventListener('click', () => this.closeAllModals());

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

    // Armor equipment slots
    const slotNames = { head: 'Helmet', chest: 'Chestplate', legs: 'Leggings', feet: 'Boots' };
    ['head', 'chest', 'legs', 'feet'].forEach(slotKey => {
      const slot = document.getElementById(`armor-slot-${slotKey}`);
      if (slot) {
        const item = this.inv.armor ? this.inv.armor[slotKey] : null;
        this.renderSlotContent(slot, item);
        slot.classList.toggle('has-item', Boolean(item));

        slot.onclick = (e) => {
          this.inv.handleArmorSlotClick?.(slotKey, e.button === 2, e.shiftKey);
          this.renderInventoryGrids();
          this.updateHotbar();
          this.updateStats();
        };
        slot.oncontextmenu = (e) => {
          e.preventDefault();
          this.inv.handleArmorSlotClick?.(slotKey, true, e.shiftKey);
          this.renderInventoryGrids();
          this.updateHotbar();
          this.updateStats();
        };

        if (item) {
          const meta = this.inv.getItemMeta(item);
          slot.onmouseenter = (e) => {
            let desc = `Armor: +${meta.armor || 0}`;
            if (meta.toughness) desc += ` | Toughness: +${meta.toughness}`;
            this.showTooltip(e.clientX, e.clientY, meta.name, desc);
          };
          slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
          slot.onmouseleave = () => this.hideTooltip();
        } else {
          slot.onmouseenter = (e) => {
            this.showTooltip(e.clientX, e.clientY, `${slotNames[slotKey]} Slot`, 'Click with armor or shift-click from inventory to equip');
          };
          slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
          slot.onmouseleave = () => this.hideTooltip();
        }
      }
    });

    // Player character preview doll in survival modal
    if (this.playerPreviewBox) {
      renderPlayerDoll(this.playerPreviewBox, this.inv.armor);
    }

    // Off-hand equipment slot
    const offhandSlot = document.getElementById('inv-offhand-slot');
    if (offhandSlot) {
      const item = this.inv.offhand;
      this.renderSlotContent(offhandSlot, item);
      offhandSlot.classList.toggle('has-item', Boolean(item));
      offhandSlot.onclick = (e) => {
        this.inv.handleOffhandSlotClick?.(e.button === 2, e.shiftKey);
        this.renderInventoryGrids();
        this.updateHotbar();
        this.updateStats();
      };
      offhandSlot.oncontextmenu = (e) => {
        e.preventDefault();
        this.inv.handleOffhandSlotClick?.(true, e.shiftKey);
        this.renderInventoryGrids();
        this.updateHotbar();
        this.updateStats();
      };
    }

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

  openFurnace(x, y, z) {
    document.exitPointerLock();
    this.closeAllModals();
    if (!this.furnaceModal) return;
    this.currentFurnacePos = { x, y, z };
    if (this.game?.furnaceManager) {
      this.game.furnaceManager.openFurnaceAt(x, y, z);
    }
    this.furnaceModal.classList.remove('hidden');
    this.renderFurnaceGrids();
  }

  closeFurnaceModal() {
    if (this.furnaceModal) this.furnaceModal.classList.add('hidden');
    this.currentFurnacePos = null;
    if (this.game?.furnaceManager) this.game.furnaceManager.closeOpenFurnace();
  }

  renderFurnaceGrids() {
    const furnace = this.game?.furnaceManager?.getOpenFurnace();
    if (!furnace) return;

    // 1. Input Slot
    if (this.furnaceInputSlot) {
      this.renderSlotContent(this.furnaceInputSlot, furnace.input);
      this.furnaceInputSlot.onclick = (e) => {
        this.handleFurnaceSlotClick(furnace, 'input', e.button === 2, e.shiftKey);
      };
      this.furnaceInputSlot.oncontextmenu = (e) => {
        e.preventDefault();
        this.handleFurnaceSlotClick(furnace, 'input', true, e.shiftKey);
      };
    }

    // 2. Fuel Slot
    if (this.furnaceFuelSlot) {
      this.renderSlotContent(this.furnaceFuelSlot, furnace.fuel);
      this.furnaceFuelSlot.onclick = (e) => {
        this.handleFurnaceSlotClick(furnace, 'fuel', e.button === 2, e.shiftKey);
      };
      this.furnaceFuelSlot.oncontextmenu = (e) => {
        e.preventDefault();
        this.handleFurnaceSlotClick(furnace, 'fuel', true, e.shiftKey);
      };
    }

    // 3. Output Slot
    if (this.furnaceOutputSlot) {
      this.renderSlotContent(this.furnaceOutputSlot, furnace.output);
      this.furnaceOutputSlot.onclick = (e) => {
        this.handleFurnaceOutputClick(furnace, e.button === 2, e.shiftKey);
      };
      this.furnaceOutputSlot.oncontextmenu = (e) => {
        e.preventDefault();
        this.handleFurnaceOutputClick(furnace, true, e.shiftKey);
      };
    }

    // 4. Storage Grid
    this.renderSlotGrid('furnace-storage-grid', this.inv.storage, (idx, right, shift) => {
      if (shift) {
        this.quickMoveToFurnace(this.inv.storage, idx, furnace);
      } else {
        this.inv.handleSlotClick(this.inv.storage, idx, right, false);
      }
      this.renderFurnaceGrids();
      this.updateHotbar();
    });

    // 5. Hotbar Grid
    this.renderSlotGrid('furnace-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      if (shift) {
        this.quickMoveToFurnace(this.inv.hotbar, idx, furnace);
      } else {
        this.inv.handleSlotClick(this.inv.hotbar, idx, right, false);
      }
      this.renderFurnaceGrids();
      this.updateHotbar();
    });

    this.updateFurnaceProgress(furnace);
    this.updateFloatingCursor();
  }

  handleFurnaceSlotClick(furnace, slotKey, isRightClick, isShiftClick) {
    const target = furnace[slotKey];
    this.sounds.playClick();

    // Shift-click moves item into player inventory
    if (isShiftClick && target) {
      this.inv.addItem(target.id, target.isBlock, target.count);
      furnace[slotKey] = null;
      this.renderFurnaceGrids();
      this.updateHotbar();
      return;
    }

    if (!this.inv.cursorItem) {
      if (!target) return;
      if (isRightClick) {
        const half = Math.ceil(target.count / 2);
        this.inv.cursorItem = { ...target, count: half };
        target.count -= half;
        if (target.count <= 0) furnace[slotKey] = null;
      } else {
        this.inv.cursorItem = target;
        furnace[slotKey] = null;
      }
    } else {
      if (!target) {
        if (isRightClick) {
          furnace[slotKey] = { ...this.inv.cursorItem, count: 1 };
          this.inv.cursorItem.count--;
          if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
        } else {
          furnace[slotKey] = this.inv.cursorItem;
          this.inv.cursorItem = null;
        }
      } else if (target.id === this.inv.cursorItem.id && target.isBlock === this.inv.cursorItem.isBlock) {
        if (isRightClick) {
          if (target.count < 64) {
            target.count++;
            this.inv.cursorItem.count--;
            if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
          }
        } else {
          const space = 64 - target.count;
          const transfer = Math.min(space, this.inv.cursorItem.count);
          target.count += transfer;
          this.inv.cursorItem.count -= transfer;
          if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
        }
      } else {
        const tmp = furnace[slotKey];
        furnace[slotKey] = this.inv.cursorItem;
        this.inv.cursorItem = tmp;
      }
    }

    this.renderFurnaceGrids();
    this.updateHotbar();
  }

  handleFurnaceOutputClick(furnace, isRightClick, isShiftClick) {
    const target = furnace.output;
    if (!target) return;
    this.sounds.playClick();

    if (isShiftClick) {
      this.inv.addItem(target.id, target.isBlock, target.count);
      furnace.output = null;
      this.renderFurnaceGrids();
      this.updateHotbar();
      return;
    }

    if (!this.inv.cursorItem) {
      if (isRightClick) {
        const half = Math.ceil(target.count / 2);
        this.inv.cursorItem = { ...target, count: half };
        target.count -= half;
        if (target.count <= 0) furnace.output = null;
      } else {
        this.inv.cursorItem = target;
        furnace.output = null;
      }
    } else if (this.inv.cursorItem.id === target.id && this.inv.cursorItem.isBlock === target.isBlock) {
      const space = 64 - this.inv.cursorItem.count;
      const transfer = Math.min(space, target.count);
      this.inv.cursorItem.count += transfer;
      target.count -= transfer;
      if (target.count <= 0) furnace.output = null;
    }

    this.renderFurnaceGrids();
    this.updateHotbar();
  }

  quickMoveToFurnace(list, idx, furnace) {
    const item = list[idx];
    if (!item) return;

    const burnTime = getFuelBurnTime(item);
    const recipe = getSmeltingRecipe(item);

    // If item is fuel and fuel slot can take it
    if (burnTime > 0 && (!furnace.fuel || (furnace.fuel.id === item.id && furnace.fuel.isBlock === item.isBlock && furnace.fuel.count < 64))) {
      this.transferToFurnaceSlot(list, idx, furnace, 'fuel');
      this.sounds.playClick();
      return;
    }

    // If item is cookable and input slot can take it
    if (recipe && (!furnace.input || (furnace.input.id === item.id && furnace.input.isBlock === item.isBlock && furnace.input.count < 64))) {
      this.transferToFurnaceSlot(list, idx, furnace, 'input');
      this.sounds.playClick();
      return;
    }

    // Default hotbar <-> storage shift
    this.inv.handleSlotClick(list, idx, false, true);
  }

  transferToFurnaceSlot(fromList, fromIdx, furnace, slotKey) {
    const item = fromList[fromIdx];
    if (!item) return;
    const dest = furnace[slotKey];
    if (!dest) {
      furnace[slotKey] = { ...item };
      fromList[fromIdx] = null;
    } else if (dest.id === item.id && dest.isBlock === item.isBlock) {
      const space = 64 - dest.count;
      const transfer = Math.min(space, item.count);
      dest.count += transfer;
      item.count -= transfer;
      if (item.count <= 0) fromList[fromIdx] = null;
    }
  }

  updateFurnaceProgress(furnace) {
    if (!furnace || !this.furnaceModal || this.furnaceModal.classList.contains('hidden')) return;

    // 1. Flame progress (drains downwards)
    if (this.furnaceFlameActive) {
      const flamePct = furnace.maxBurnTime > 0 ? (furnace.burnTime / furnace.maxBurnTime) * 100 : 0;
      this.furnaceFlameActive.style.clipPath = `inset(${Math.max(0, 100 - flamePct)}% 0 0 0)`;
      this.furnaceFlameActive.style.opacity = flamePct > 0 ? '1' : '0';
    }

    // 2. Arrow progress (fills left to right)
    if (this.furnaceArrowFill) {
      const cookPct = (furnace.cookTime / furnace.cookDuration) * 100;
      this.furnaceArrowFill.style.clipPath = `inset(0 ${Math.max(0, 100 - cookPct)}% 0 0)`;
      this.furnaceArrowFill.style.opacity = cookPct > 0 ? '1' : '0.2';
    }

    // 3. Keep slot visuals in sync if counts updated during live cooking
    if (this.furnaceInputSlot) {
      this.renderSlotContent(this.furnaceInputSlot, furnace.input);
    }
    if (this.furnaceFuelSlot) {
      this.renderSlotContent(this.furnaceFuelSlot, furnace.fuel);
    }
    if (this.furnaceOutputSlot) {
      this.renderSlotContent(this.furnaceOutputSlot, furnace.output);
    }
  }

  // --- Chest GUI (Single & Double Chest) -----------------------------------
  openChest(x, y, z) {
    if (document.exitPointerLock) document.exitPointerLock();
    this.closeAllModals();
    if (!this.chestModal) return;
    this.currentChestPos = { x, y, z };
    const chest = this.game?.chestManager?.getChest(x, y, z);
    if (this.chestTitle) {
      this.chestTitle.textContent = chest?.isDouble ? 'Large Chest' : 'Chest';
    }
    this.chestModal.classList.remove('hidden');
    this.renderChestGrids();
  }

  closeChestModal() {
    if (this.chestModal) this.chestModal.classList.add('hidden');
    if (this.game?.chestManager) this.game.chestManager.closeChest();
    this.currentChestPos = null;
    this.currentVehicle = null;
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count);
      this.inv.cursorItem = null;
    }
    this.updateFloatingCursor();
    this.updateHotbar();
  }

  openVehicleChestModal(vehicle) {
    if (document.exitPointerLock) document.exitPointerLock();
    this.closeAllModals();
    if (!this.chestModal) return;
    this.currentVehicle = vehicle;
    this.currentChestPos = null;
    if (this.chestTitle) {
      this.chestTitle.textContent = vehicle.kind === 'boat' ? 'Boat with Chest' : 'Minecart with Chest';
    }
    this.chestModal.classList.remove('hidden');
    this.renderVehicleChestGrids();
  }

  renderVehicleChestGrids() {
    if (!this.currentVehicle) return;
    const items = this.currentVehicle.chestItems || this.currentVehicle.items;
    if (!items) return;
    const totalSlots = items.length;

    if (this.chestSlotsGrid) {
      this.chestSlotsGrid.innerHTML = '';
      for (let i = 0; i < totalSlots; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'inv-slot';
        slotEl.dataset.chestSlot = i;
        const item = items[i];
        this.renderSlotContent(slotEl, item);

        slotEl.onclick = (e) => {
          this.inv.handleSlotClick(items, i, e.button === 2, false);
          this.renderVehicleChestGrids();
        };
        slotEl.oncontextmenu = (e) => {
          e.preventDefault();
          this.inv.handleSlotClick(items, i, true, false);
          this.renderVehicleChestGrids();
        };
        this.chestSlotsGrid.appendChild(slotEl);
      }
    }

    this.renderSlotGrid('chest-storage-grid', this.inv.storage, (idx, right) => {
      this.inv.handleSlotClick(this.inv.storage, idx, right, false);
      this.renderVehicleChestGrids();
      this.updateHotbar();
    });

    this.renderSlotGrid('chest-hotbar-grid', this.inv.hotbar, (idx, right) => {
      this.inv.handleSlotClick(this.inv.hotbar, idx, right, false);
      this.renderVehicleChestGrids();
      this.updateHotbar();
    });
  }

  renderChestGrids() {
    if (!this.currentChestPos || !this.game?.chestManager) return;
    const { x, y, z } = this.currentChestPos;
    const chest = this.game.chestManager.getChest(x, y, z);
    if (!chest) return;

    const items = this.game.chestManager.getCombinedItems(x, y, z);
    const totalSlots = items.length;

    // 1. Chest slots grid (27 slots for single, 54 slots for double)
    if (this.chestSlotsGrid) {
      this.chestSlotsGrid.innerHTML = '';
      for (let i = 0; i < totalSlots; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'inv-slot';
        slotEl.dataset.chestSlot = i;
        const item = items[i];
        this.renderSlotContent(slotEl, item);

        slotEl.onclick = (e) => {
          this.handleChestSlotClick(x, y, z, i, e.button === 2, e.shiftKey);
        };
        slotEl.oncontextmenu = (e) => {
          e.preventDefault();
          this.handleChestSlotClick(x, y, z, i, true, e.shiftKey);
        };
        this.chestSlotsGrid.appendChild(slotEl);
      }
    }

    // 2. Player storage grid
    this.renderSlotGrid('chest-storage-grid', this.inv.storage, (idx, right, shift) => {
      if (shift) {
        this.quickMoveToChest(this.inv.storage, idx, x, y, z);
      } else {
        this.inv.handleSlotClick(this.inv.storage, idx, right, false);
      }
      this.renderChestGrids();
      this.updateHotbar();
    });

    // 3. Player hotbar grid
    this.renderSlotGrid('chest-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      if (shift) {
        this.quickMoveToChest(this.inv.hotbar, idx, x, y, z);
      } else {
        this.inv.handleSlotClick(this.inv.hotbar, idx, right, false);
      }
      this.renderChestGrids();
      this.updateHotbar();
    });

    this.updateFloatingCursor();
  }

  handleChestSlotClick(x, y, z, slotIdx, isRightClick, isShiftClick) {
    this.sounds.playClick();
    const target = this.game.chestManager.getCombinedSlot(x, y, z, slotIdx);

    // Shift-click: move from chest to player inventory
    if (isShiftClick && target) {
      this.quickMoveChestToPlayer(x, y, z, slotIdx);
      this.renderChestGrids();
      this.updateHotbar();
      return;
    }

    if (!this.inv.cursorItem) {
      if (!target) return;
      if (isRightClick) {
        const half = Math.ceil(target.count / 2);
        this.inv.cursorItem = { ...target, count: half };
        target.count -= half;
        if (target.count <= 0) {
          this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, null);
        } else {
          this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, target);
        }
      } else {
        this.inv.cursorItem = target;
        this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, null);
      }
    } else {
      if (!target) {
        if (isRightClick) {
          this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, { ...this.inv.cursorItem, count: 1 });
          this.inv.cursorItem.count--;
          if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
        } else {
          this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, this.inv.cursorItem);
          this.inv.cursorItem = null;
        }
      } else if (target.id === this.inv.cursorItem.id && target.isBlock === this.inv.cursorItem.isBlock) {
        if (isRightClick) {
          if (target.count < 64) {
            target.count++;
            this.inv.cursorItem.count--;
            if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
            this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, target);
          }
        } else {
          const space = 64 - target.count;
          const transfer = Math.min(space, this.inv.cursorItem.count);
          target.count += transfer;
          this.inv.cursorItem.count -= transfer;
          if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
          this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, target);
        }
      } else {
        const tmp = target;
        this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, this.inv.cursorItem);
        this.inv.cursorItem = tmp;
      }
    }

    this.renderChestGrids();
    this.updateHotbar();
  }

  quickMoveChestToPlayer(x, y, z, slotIdx) {
    const item = this.game.chestManager.getCombinedSlot(x, y, z, slotIdx);
    if (!item || item.count <= 0) return;

    // 1. Try stacking into player hotbar
    for (let i = 0; i < 9; i++) {
      const slot = this.inv.hotbar[i];
      if (slot && slot.id === item.id && slot.isBlock === item.isBlock && slot.count < 64) {
        const space = 64 - slot.count;
        const add = Math.min(space, item.count);
        slot.count += add;
        item.count -= add;
        if (item.count <= 0) {
          this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, null);
          return;
        }
      }
    }

    // 2. Try stacking into player storage
    for (let i = 0; i < 27; i++) {
      const slot = this.inv.storage[i];
      if (slot && slot.id === item.id && slot.isBlock === item.isBlock && slot.count < 64) {
        const space = 64 - slot.count;
        const add = Math.min(space, item.count);
        slot.count += add;
        item.count -= add;
        if (item.count <= 0) {
          this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, null);
          return;
        }
      }
    }

    // 3. Put into empty hotbar slot
    for (let i = 0; i < 9; i++) {
      if (!this.inv.hotbar[i]) {
        this.inv.hotbar[i] = { ...item };
        this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, null);
        return;
      }
    }

    // 4. Put into empty storage slot
    for (let i = 0; i < 27; i++) {
      if (!this.inv.storage[i]) {
        this.inv.storage[i] = { ...item };
        this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, null);
        return;
      }
    }

    // Update remaining count if partially moved
    this.game.chestManager.setCombinedSlot(x, y, z, slotIdx, item);
  }

  quickMoveToChest(list, slotIdx, x, y, z) {
    const item = list[slotIdx];
    if (!item || item.count <= 0) return;

    const items = this.game.chestManager.getCombinedItems(x, y, z);
    const totalSlots = items.length;

    // 1. Try stacking into existing matching chest slots
    for (let i = 0; i < totalSlots; i++) {
      const slot = items[i];
      if (slot && slot.id === item.id && slot.isBlock === item.isBlock && slot.count < 64) {
        const space = 64 - slot.count;
        const add = Math.min(space, item.count);
        slot.count += add;
        item.count -= add;
        this.game.chestManager.setCombinedSlot(x, y, z, i, slot);
        if (item.count <= 0) {
          list[slotIdx] = null;
          return;
        }
      }
    }

    // 2. Put into first empty chest slot
    for (let i = 0; i < totalSlots; i++) {
      if (!items[i]) {
        this.game.chestManager.setCombinedSlot(x, y, z, i, { ...item });
        list[slotIdx] = null;
        return;
      }
    }
  }

  // --- Enchanting Table GUI ------------------------------------------------
  openEnchantingTable(x, y, z) {
    if (document.exitPointerLock) document.exitPointerLock();
    this.closeAllModals();
    if (!this.enchantingModal) return;

    this.currentEnchantingPos = { x, y, z };
    this.enchantingModal.classList.remove('hidden');

    const bookshelfCount = this.game?.enchantingManager
      ? this.game.enchantingManager.getBookshelvesAround(x, y, z)
      : calculateBookshelfCount(this.world, x, y, z);

    if (this.enchantBookshelvesNum) {
      this.enchantBookshelvesNum.textContent = bookshelfCount;
    }

    if (this.enchantSlottedItem) {
      this.currentOffers = generateEnchantmentOffers(this.enchantSlottedItem, bookshelfCount);
    } else {
      this.currentOffers = [];
    }

    this.renderEnchantingGUI();
  }

  closeEnchantingModal() {
    if (this.enchantingModal) this.enchantingModal.classList.add('hidden');
    this.currentEnchantingPos = null;

    if (this.enchantSlottedItem) {
      this.inv.addItem(this.enchantSlottedItem.id, this.enchantSlottedItem.isBlock, this.enchantSlottedItem.count, this.enchantSlottedItem.enchantments);
      this.enchantSlottedItem = null;
    }
    if (this.enchantSlottedLapis) {
      this.inv.addItem(this.enchantSlottedLapis.id, this.enchantSlottedLapis.isBlock, this.enchantSlottedLapis.count);
      this.enchantSlottedLapis = null;
    }
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count, this.inv.cursorItem.enchantments);
      this.inv.cursorItem = null;
    }
    this.currentOffers = [];
    this.updateFloatingCursor();
    this.updateHotbar();
  }

  renderEnchantingGUI() {
    if (!this.enchantingModal || this.enchantingModal.classList.contains('hidden')) return;

    const bookshelfCount = this.currentEnchantingPos
      ? (this.game?.enchantingManager
          ? this.game.enchantingManager.getBookshelvesAround(this.currentEnchantingPos.x, this.currentEnchantingPos.y, this.currentEnchantingPos.z)
          : calculateBookshelfCount(this.world, this.currentEnchantingPos.x, this.currentEnchantingPos.y, this.currentEnchantingPos.z))
      : 0;

    if (this.enchantBookshelvesNum) {
      this.enchantBookshelvesNum.textContent = bookshelfCount;
    }

    // 1. Item Slot
    if (this.enchantItemSlot) {
      this.renderSlotContent(this.enchantItemSlot, this.enchantSlottedItem);
      this.enchantItemSlot.onclick = (e) => {
        this.handleEnchantSlotClick('item', e.button === 2, e.shiftKey);
      };
      this.enchantItemSlot.oncontextmenu = (e) => {
        e.preventDefault();
        this.handleEnchantSlotClick('item', true, e.shiftKey);
      };
    }

    // 2. Lapis Slot
    if (this.enchantLapisSlot) {
      this.renderSlotContent(this.enchantLapisSlot, this.enchantSlottedLapis);
      this.enchantLapisSlot.onclick = (e) => {
        this.handleEnchantSlotClick('lapis', e.button === 2, e.shiftKey);
      };
      this.enchantLapisSlot.oncontextmenu = (e) => {
        e.preventDefault();
        this.handleEnchantSlotClick('lapis', true, e.shiftKey);
      };
    }

    // 3. Offers
    for (let slotIdx = 0; slotIdx < 3; slotIdx++) {
      const offerEl = document.getElementById(`enchant-offer-${slotIdx}`);
      const runesEl = document.getElementById(`enchant-runes-${slotIdx}`);
      const hintEl = document.getElementById(`enchant-hint-${slotIdx}`);
      const reqEl = document.getElementById(`enchant-req-${slotIdx}`);
      const offer = this.currentOffers[slotIdx];

      if (!offer || !this.enchantSlottedItem) {
        if (offerEl) {
          offerEl.className = 'enchant-offer disabled';
          offerEl.onclick = null;
        }
        if (hintEl) hintEl.textContent = 'Insert item & lapis...';
        if (reqEl) reqEl.textContent = `Req: ${slotIdx + 1} Lvl`;
      } else {
        const hasLevel = (this.player?.level || 0) >= offer.levelRequirement;
        const hasLapis = (this.enchantSlottedLapis?.count || 0) >= offer.lapisCost;
        const canAfford = hasLevel && hasLapis;

        if (offerEl) {
          offerEl.className = `enchant-offer ${canAfford ? '' : 'disabled'}`;
          offerEl.onclick = canAfford ? () => this.selectEnchantOffer(slotIdx) : null;
        }
        if (runesEl) runesEl.textContent = offer.runes;
        if (hintEl) hintEl.textContent = offer.hint;
        if (reqEl) {
          reqEl.textContent = `Req: ${offer.levelRequirement} Lvl, Cost: ${offer.levelCost} Lvl + ${offer.lapisCost} Lapis`;
        }
      }
    }

    // 4. Storage & Hotbar Grids
    this.renderSlotGrid('enchant-storage-grid', this.inv.storage, (idx, right, shift) => {
      if (shift) {
        this.quickMoveToEnchanting(this.inv.storage, idx);
      } else {
        this.inv.handleSlotClick(this.inv.storage, idx, right, false);
      }
      this.renderEnchantingGUI();
      this.updateHotbar();
    });

    this.renderSlotGrid('enchant-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      if (shift) {
        this.quickMoveToEnchanting(this.inv.hotbar, idx);
      } else {
        this.inv.handleSlotClick(this.inv.hotbar, idx, right, false);
      }
      this.renderEnchantingGUI();
      this.updateHotbar();
    });

    this.updateFloatingCursor();
  }

  handleEnchantSlotClick(slotType, isRightClick = false, isShiftClick = false) {
    this.sounds.playClick?.();
    const bookshelfCount = this.currentEnchantingPos
      ? (this.game?.enchantingManager
          ? this.game.enchantingManager.getBookshelvesAround(this.currentEnchantingPos.x, this.currentEnchantingPos.y, this.currentEnchantingPos.z)
          : calculateBookshelfCount(this.world, this.currentEnchantingPos.x, this.currentEnchantingPos.y, this.currentEnchantingPos.z))
      : 0;

    if (slotType === 'item') {
      if (!this.inv.cursorItem) {
        if (this.enchantSlottedItem) {
          this.inv.cursorItem = this.enchantSlottedItem;
          this.enchantSlottedItem = null;
          this.currentOffers = [];
        }
      } else {
        if (isEnchantableItem(this.inv.cursorItem)) {
          const temp = this.enchantSlottedItem;
          this.enchantSlottedItem = this.inv.cursorItem;
          this.inv.cursorItem = temp;
          this.currentOffers = generateEnchantmentOffers(this.enchantSlottedItem, bookshelfCount);
        }
      }
    } else if (slotType === 'lapis') {
      const isLapis = (item) => item && (item.id === 'lapis_lazuli' || item.id === BLOCKS.LAPIS_LAZULI);
      if (!this.inv.cursorItem) {
        if (this.enchantSlottedLapis) {
          if (isRightClick) {
            const half = Math.ceil(this.enchantSlottedLapis.count / 2);
            this.inv.cursorItem = { ...this.enchantSlottedLapis, count: half };
            this.enchantSlottedLapis.count -= half;
            if (this.enchantSlottedLapis.count <= 0) this.enchantSlottedLapis = null;
          } else {
            this.inv.cursorItem = this.enchantSlottedLapis;
            this.enchantSlottedLapis = null;
          }
        }
      } else if (isLapis(this.inv.cursorItem)) {
        if (!this.enchantSlottedLapis) {
          if (isRightClick) {
            this.enchantSlottedLapis = { ...this.inv.cursorItem, count: 1 };
            this.inv.cursorItem.count--;
            if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
          } else {
            this.enchantSlottedLapis = this.inv.cursorItem;
            this.inv.cursorItem = null;
          }
        } else {
          const space = 64 - this.enchantSlottedLapis.count;
          if (isRightClick) {
            if (space > 0) {
              this.enchantSlottedLapis.count++;
              this.inv.cursorItem.count--;
              if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
            }
          } else {
            const transfer = Math.min(space, this.inv.cursorItem.count);
            this.enchantSlottedLapis.count += transfer;
            this.inv.cursorItem.count -= transfer;
            if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
          }
        }
      }
    }

    this.renderEnchantingGUI();
    this.updateHotbar();
  }

  selectEnchantOffer(offerIndex) {
    if (!this.enchantSlottedItem || !this.currentOffers[offerIndex]) return;
    const offer = this.currentOffers[offerIndex];

    if ((this.player?.level || 0) < offer.levelRequirement) return;
    if (!this.enchantSlottedLapis || this.enchantSlottedLapis.count < offer.lapisCost) return;

    // Deduct lapis lazuli
    this.enchantSlottedLapis.count -= offer.lapisCost;
    if (this.enchantSlottedLapis.count <= 0) {
      this.enchantSlottedLapis = null;
    }

    // Apply enchantment
    applyEnchantment(this.enchantSlottedItem, offer, this.player, this, this.sounds);

    // After enchant, offers for this item become empty (cannot re-enchant on table)
    this.currentOffers = [];

    this.renderEnchantingGUI();
    this.updateHotbar();
    this.updateStats();
  }

  quickMoveToEnchanting(list, idx) {
    const item = list[idx];
    if (!item) return;

    const isLapis = item.id === 'lapis_lazuli' || item.id === BLOCKS.LAPIS_LAZULI;
    if (isLapis) {
      if (!this.enchantSlottedLapis) {
        this.enchantSlottedLapis = item;
        list[idx] = null;
        this.sounds.playClick?.();
        return;
      } else if (this.enchantSlottedLapis.count < 64) {
        const space = 64 - this.enchantSlottedLapis.count;
        const add = Math.min(space, item.count);
        this.enchantSlottedLapis.count += add;
        item.count -= add;
        if (item.count <= 0) list[idx] = null;
        this.sounds.playClick?.();
        return;
      }
    }

    if (isEnchantableItem(item) && !this.enchantSlottedItem) {
      this.enchantSlottedItem = item;
      list[idx] = null;
      const bookshelfCount = this.currentEnchantingPos
        ? (this.game?.enchantingManager
            ? this.game.enchantingManager.getBookshelvesAround(this.currentEnchantingPos.x, this.currentEnchantingPos.y, this.currentEnchantingPos.z)
            : calculateBookshelfCount(this.world, this.currentEnchantingPos.x, this.currentEnchantingPos.y, this.currentEnchantingPos.z))
        : 0;
      this.currentOffers = generateEnchantmentOffers(this.enchantSlottedItem, bookshelfCount);
      this.sounds.playClick?.();
      return;
    }

    // Regular hotbar <-> storage shift transfer
    this.inv.handleSlotClick(list, idx, false, true);
  }

  // --- Brewing Stand GUI ----------------------------------------------------
  openBrewingStand(x, y, z) {
    if (document.exitPointerLock) document.exitPointerLock();
    this.closeAllModals();
    if (!this.brewingModal) return;

    this.currentBrewingPos = { x, y, z };
    this.brewingModal.classList.remove('hidden');
    this.renderBrewingGUI();
  }

  closeBrewingModal() {
    if (this.brewingModal) this.brewingModal.classList.add('hidden');
    this.currentBrewingPos = null;

    if (this.brewingStand.ingredient) {
      this.inv.addItem(this.brewingStand.ingredient.id, false, this.brewingStand.ingredient.count);
      this.brewingStand.ingredient = null;
    }
    for (let i = 0; i < 3; i++) {
      const b = this.brewingStand.bottles[i];
      if (b) {
        this.inv.addItem(b.id, false, b.count);
        this.brewingStand.bottles[i] = null;
      }
    }
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count);
      this.inv.cursorItem = null;
    }
    this.updateFloatingCursor();
    this.updateHotbar();
  }

  renderBrewingGUI() {
    if (!this.brewingModal || this.brewingModal.classList.contains('hidden')) return;

    // Fuel slot & fuel bar
    const fuelSlot = document.getElementById('brewing-fuel-slot');
    const fuelBar = document.getElementById('brewing-fuel-bar');
    if (fuelSlot) {
      const fuelItem = this.brewingStand.fuel > 0 ? { id: 'blaze_powder', count: this.brewingStand.fuel } : null;
      this.renderSlotContent(fuelSlot, fuelItem);
      fuelSlot.onclick = () => this.handleBrewingSlotClick('fuel');
    }
    if (fuelBar) {
      const fuelPct = Math.round((this.brewingStand.fuel / this.brewingStand.maxFuel) * 100);
      fuelBar.style.width = `${fuelPct}%`;
    }

    // Ingredient slot
    const ingSlot = document.getElementById('brewing-ingredient-slot');
    if (ingSlot) {
      this.renderSlotContent(ingSlot, this.brewingStand.ingredient);
      ingSlot.onclick = (e) => this.handleBrewingSlotClick('ingredient', e.button === 2, e.shiftKey);
      ingSlot.oncontextmenu = (e) => { e.preventDefault(); this.handleBrewingSlotClick('ingredient', true, e.shiftKey); };
    }

    // Progress bar & text
    const progBar = document.getElementById('brewing-progress-bar');
    const statusText = document.getElementById('brewing-status-text');
    if (progBar) {
      const prog = Math.round(this.brewingStand.getProgress() * 100);
      progBar.style.width = `${prog}%`;
    }
    if (statusText) {
      statusText.textContent = this.brewingStand.isBrewing ? 'Brewing...' : (this.brewingStand.canBrew() ? 'Ready' : 'Idle');
    }

    // 3 Bottle slots
    for (let i = 0; i < 3; i++) {
      const bottleSlot = document.getElementById(`brewing-bottle-${i}`);
      if (bottleSlot) {
        this.renderSlotContent(bottleSlot, this.brewingStand.bottles[i]);
        bottleSlot.onclick = (e) => this.handleBrewingSlotClick(`bottle-${i}`, e.button === 2, e.shiftKey);
        bottleSlot.oncontextmenu = (e) => { e.preventDefault(); this.handleBrewingSlotClick(`bottle-${i}`, true, e.shiftKey); };
      }
    }

    // Inventory grids
    this.renderSlotGrid('brewing-storage-grid', this.inv.storage, (idx, right, shift) => {
      if (shift) this.quickMoveToBrewing(this.inv.storage, idx);
      else this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderBrewingGUI();
      this.updateHotbar();
    });

    this.renderSlotGrid('brewing-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      if (shift) this.quickMoveToBrewing(this.inv.hotbar, idx);
      else this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderBrewingGUI();
      this.updateHotbar();
    });
  }

  handleBrewingSlotClick(slotKey, rightClick = false, shiftClick = false) {
    if (slotKey === 'fuel') {
      if (this.inv.cursorItem && this.inv.cursorItem.id === 'blaze_powder') {
        if (this.brewingStand.addFuel(this.inv.cursorItem)) {
          this.inv.cursorItem.count -= 1;
          if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
          this.sounds.playClick?.();
        }
      }
    } else if (slotKey === 'ingredient') {
      if (!this.inv.cursorItem) {
        if (this.brewingStand.ingredient) {
          this.inv.cursorItem = this.brewingStand.ingredient;
          this.brewingStand.ingredient = null;
          this.sounds.playClick?.();
        }
      } else {
        if (!this.brewingStand.ingredient) {
          this.brewingStand.ingredient = this.inv.cursorItem;
          this.inv.cursorItem = null;
          this.sounds.playClick?.();
        } else if (this.brewingStand.ingredient.id === this.inv.cursorItem.id) {
          const space = 64 - this.brewingStand.ingredient.count;
          const add = Math.min(space, this.inv.cursorItem.count);
          this.brewingStand.ingredient.count += add;
          this.inv.cursorItem.count -= add;
          if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
          this.sounds.playClick?.();
        } else {
          const tmp = this.brewingStand.ingredient;
          this.brewingStand.ingredient = this.inv.cursorItem;
          this.inv.cursorItem = tmp;
          this.sounds.playClick?.();
        }
      }
    } else if (slotKey.startsWith('bottle-')) {
      const idx = parseInt(slotKey.split('-')[1], 10);
      const currentBottle = this.brewingStand.bottles[idx];
      if (!this.inv.cursorItem) {
        if (currentBottle) {
          this.inv.cursorItem = currentBottle;
          this.brewingStand.bottles[idx] = null;
          this.sounds.playClick?.();
        }
      } else {
        if (!currentBottle) {
          this.brewingStand.bottles[idx] = this.inv.cursorItem;
          this.inv.cursorItem = null;
          this.sounds.playClick?.();
        } else {
          const tmp = currentBottle;
          this.brewingStand.bottles[idx] = this.inv.cursorItem;
          this.inv.cursorItem = tmp;
          this.sounds.playClick?.();
        }
      }
    }

    this.updateFloatingCursor();
    this.renderBrewingGUI();
  }

  quickMoveToBrewing(list, idx) {
    const item = list[idx];
    if (!item) return;

    if (item.id === 'blaze_powder') {
      if (this.brewingStand.fuel < this.brewingStand.maxFuel) {
        this.brewingStand.addFuel(item);
        item.count -= 1;
        if (item.count <= 0) list[idx] = null;
        this.sounds.playClick?.();
        return;
      }
    }

    if (item.id === 'glass_bottle' || item.id === 'water_bottle' || item.id.includes('potion')) {
      for (let i = 0; i < 3; i++) {
        if (!this.brewingStand.bottles[i]) {
          this.brewingStand.bottles[i] = item;
          list[idx] = null;
          this.sounds.playClick?.();
          return;
        }
      }
    }

    if (!this.brewingStand.ingredient) {
      this.brewingStand.ingredient = item;
      list[idx] = null;
      this.sounds.playClick?.();
      return;
    }

    this.inv.handleSlotClick(list, idx, false, true);
  }

  // --- Anvil GUI ------------------------------------------------------------
  openAnvil(x, y, z) {
    if (document.exitPointerLock) document.exitPointerLock();
    this.closeAllModals();
    if (!this.anvilModal) return;

    this.currentAnvilPos = { x, y, z };
    this.anvilLeftItem = null;
    this.anvilRightItem = null;
    this.anvilCustomName = '';
    const nameInput = document.getElementById('anvil-name-input');
    if (nameInput) {
      nameInput.value = '';
      nameInput.oninput = (e) => {
        this.anvilCustomName = e.target.value;
        this.renderAnvilGUI();
      };
    }
    this.anvilModal.classList.remove('hidden');
    this.renderAnvilGUI();
  }

  closeAnvilModal() {
    if (this.anvilModal) this.anvilModal.classList.add('hidden');
    this.currentAnvilPos = null;

    if (this.anvilLeftItem) {
      this.inv.addItem(this.anvilLeftItem.id, this.anvilLeftItem.isBlock, this.anvilLeftItem.count, this.anvilLeftItem.enchantments);
      this.anvilLeftItem = null;
    }
    if (this.anvilRightItem) {
      this.inv.addItem(this.anvilRightItem.id, this.anvilRightItem.isBlock, this.anvilRightItem.count, this.anvilRightItem.enchantments);
      this.anvilRightItem = null;
    }
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count, this.inv.cursorItem.enchantments);
      this.inv.cursorItem = null;
    }
    this.updateFloatingCursor();
    this.updateHotbar();
  }

  renderAnvilGUI() {
    if (!this.anvilModal || this.anvilModal.classList.contains('hidden')) return;

    const leftSlot = document.getElementById('anvil-left-slot');
    const rightSlot = document.getElementById('anvil-right-slot');
    const outputSlot = document.getElementById('anvil-output-slot');
    const costLabel = document.getElementById('anvil-cost-label');

    if (leftSlot) {
      this.renderSlotContent(leftSlot, this.anvilLeftItem);
      leftSlot.onclick = () => this.handleAnvilSlotClick('left');
    }
    if (rightSlot) {
      this.renderSlotContent(rightSlot, this.anvilRightItem);
      rightSlot.onclick = () => this.handleAnvilSlotClick('right');
    }

    const calculation = calculateAnvilResult(
      this.anvilLeftItem,
      this.anvilRightItem,
      this.anvilCustomName,
      this.player?.gamemode
    );

    if (outputSlot) {
      this.renderSlotContent(outputSlot, calculation.valid ? calculation.result : null);
      outputSlot.onclick = () => {
        if (calculation.valid) {
          this.takeAnvilOutput(calculation);
        }
      };
    }

    if (costLabel) {
      if (!this.anvilLeftItem && !this.anvilRightItem) {
        costLabel.textContent = '';
      } else if (calculation.tooExpensive) {
        costLabel.textContent = 'Too Expensive!';
        costLabel.style.color = '#ef4444';
      } else if (calculation.valid) {
        const canAfford = (this.player?.gamemode === 'creative') || (this.player?.level >= calculation.levelCost);
        costLabel.textContent = `Enchantment Cost: ${calculation.levelCost}`;
        costLabel.style.color = canAfford ? '#10b981' : '#ef4444';
      } else {
        costLabel.textContent = '';
      }
    }

    this.renderSlotGrid('anvil-storage-grid', this.inv.storage, (idx, right, shift) => {
      if (shift) this.quickMoveToAnvil(this.inv.storage, idx);
      else this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderAnvilGUI();
      this.updateHotbar();
    });

    this.renderSlotGrid('anvil-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      if (shift) this.quickMoveToAnvil(this.inv.hotbar, idx);
      else this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderAnvilGUI();
      this.updateHotbar();
    });
  }

  handleAnvilSlotClick(slotType) {
    if (slotType === 'left') {
      const tmp = this.anvilLeftItem;
      this.anvilLeftItem = this.inv.cursorItem;
      this.inv.cursorItem = tmp;
      if (this.anvilLeftItem && (!this.anvilCustomName || this.anvilCustomName === '')) {
        const nameInput = document.getElementById('anvil-name-input');
        if (nameInput) nameInput.value = this.anvilLeftItem.customName || ITEMS[this.anvilLeftItem.id]?.name || this.anvilLeftItem.id;
      }
    } else if (slotType === 'right') {
      const tmp = this.anvilRightItem;
      this.anvilRightItem = this.inv.cursorItem;
      this.inv.cursorItem = tmp;
    }

    this.updateFloatingCursor();
    this.renderAnvilGUI();
  }

  takeAnvilOutput(calculation) {
    if (!calculation.valid || !calculation.result) return;
    if (this.player.gamemode !== 'creative' && this.player.level < calculation.levelCost) {
      this.sounds.playHurt?.();
      return;
    }

    if (this.player.gamemode !== 'creative' && calculation.levelCost > 0) {
      consumePlayerLevels(this.player, calculation.levelCost);
    }

    this.inv.cursorItem = calculation.result;
    this.anvilLeftItem = null;

    if (this.anvilRightItem) {
      const consumed = calculation.materialUnitsConsumed || 1;
      this.anvilRightItem.count -= consumed;
      if (this.anvilRightItem.count <= 0) this.anvilRightItem = null;
    }

    this.sounds.playAnvil?.();

    if (this.currentAnvilPos && this.world) {
      const curBlock = this.world.getVoxel(this.currentAnvilPos.x, this.currentAnvilPos.y, this.currentAnvilPos.z);
      const nextBlock = getAnvilDegradation(curBlock);
      if (nextBlock !== curBlock) {
        this.world.setVoxel(this.currentAnvilPos.x, this.currentAnvilPos.y, this.currentAnvilPos.z, nextBlock);
        if (nextBlock === BLOCKS.AIR) {
          this.closeAnvilModal();
          return;
        }
      }
    }

    this.updateFloatingCursor();
    this.renderAnvilGUI();
    this.updateHotbar();
    this.updateStats();
  }

  quickMoveToAnvil(list, idx) {
    const item = list[idx];
    if (!item) return;

    if (!this.anvilLeftItem) {
      this.anvilLeftItem = item;
      list[idx] = null;
      this.sounds.playClick?.();
      return;
    }
    if (!this.anvilRightItem) {
      this.anvilRightItem = item;
      list[idx] = null;
      this.sounds.playClick?.();
      return;
    }

    this.inv.handleSlotClick(list, idx, false, true);
  }

  // --- Grindstone GUI -------------------------------------------------------
  openGrindstone(x, y, z) {
    if (document.exitPointerLock) document.exitPointerLock();
    this.closeAllModals();
    if (!this.grindstoneModal) return;

    this.currentGrindstonePos = { x, y, z };
    this.grindstoneTopItem = null;
    this.grindstoneBottomItem = null;
    this.grindstoneModal.classList.remove('hidden');
    this.renderGrindstoneGUI();
  }

  closeGrindstoneModal() {
    if (this.grindstoneModal) this.grindstoneModal.classList.add('hidden');
    this.currentGrindstonePos = null;

    if (this.grindstoneTopItem) {
      this.inv.addItem(this.grindstoneTopItem.id, this.grindstoneTopItem.isBlock, this.grindstoneTopItem.count, this.grindstoneTopItem.enchantments);
      this.grindstoneTopItem = null;
    }
    if (this.grindstoneBottomItem) {
      this.inv.addItem(this.grindstoneBottomItem.id, this.grindstoneBottomItem.isBlock, this.grindstoneBottomItem.count, this.grindstoneBottomItem.enchantments);
      this.grindstoneBottomItem = null;
    }
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count, this.inv.cursorItem.enchantments);
      this.inv.cursorItem = null;
    }
    this.updateFloatingCursor();
    this.updateHotbar();
  }

  renderGrindstoneGUI() {
    if (!this.grindstoneModal || this.grindstoneModal.classList.contains('hidden')) return;

    const topSlot = document.getElementById('grindstone-top-slot');
    const bottomSlot = document.getElementById('grindstone-bottom-slot');
    const outputSlot = document.getElementById('grindstone-output-slot');
    const xpLabel = document.getElementById('grindstone-xp-label');

    if (topSlot) {
      this.renderSlotContent(topSlot, this.grindstoneTopItem);
      topSlot.onclick = () => this.handleGrindstoneSlotClick('top');
    }
    if (bottomSlot) {
      this.renderSlotContent(bottomSlot, this.grindstoneBottomItem);
      bottomSlot.onclick = () => this.handleGrindstoneSlotClick('bottom');
    }

    const calculation = calculateGrindstoneResult(this.grindstoneTopItem, this.grindstoneBottomItem);

    if (outputSlot) {
      this.renderSlotContent(outputSlot, calculation.valid ? calculation.result : null);
      outputSlot.onclick = () => {
        if (calculation.valid) {
          this.takeGrindstoneOutput(calculation);
        }
      };
    }

    if (xpLabel) {
      if (calculation.valid && calculation.xpDrop > 0) {
        xpLabel.textContent = `+${calculation.xpDrop} Experience Points`;
      } else {
        xpLabel.textContent = '';
      }
    }

    this.renderSlotGrid('grindstone-storage-grid', this.inv.storage, (idx, right, shift) => {
      if (shift) this.quickMoveToGrindstone(this.inv.storage, idx);
      else this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderGrindstoneGUI();
      this.updateHotbar();
    });

    this.renderSlotGrid('grindstone-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      if (shift) this.quickMoveToGrindstone(this.inv.hotbar, idx);
      else this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderGrindstoneGUI();
      this.updateHotbar();
    });
  }

  handleGrindstoneSlotClick(slotType) {
    if (slotType === 'top') {
      const tmp = this.grindstoneTopItem;
      this.grindstoneTopItem = this.inv.cursorItem;
      this.inv.cursorItem = tmp;
    } else if (slotType === 'bottom') {
      const tmp = this.grindstoneBottomItem;
      this.grindstoneBottomItem = this.inv.cursorItem;
      this.inv.cursorItem = tmp;
    }

    this.updateFloatingCursor();
    this.renderGrindstoneGUI();
  }

  takeGrindstoneOutput(calculation) {
    if (!calculation.valid || !calculation.result) return;

    this.inv.cursorItem = calculation.result;
    if (calculation.consumedBoth) {
      this.grindstoneTopItem = null;
      this.grindstoneBottomItem = null;
    } else {
      if (this.grindstoneTopItem) this.grindstoneTopItem = null;
      else if (this.grindstoneBottomItem) this.grindstoneBottomItem = null;
    }

    if (calculation.xpDrop > 0) {
      addPlayerExperience(this.player, calculation.xpDrop, this.sounds, this);
    }

    this.sounds.playClick?.();
    this.updateFloatingCursor();
    this.renderGrindstoneGUI();
    this.updateHotbar();
    this.updateStats();
  }

  quickMoveToGrindstone(list, idx) {
    const item = list[idx];
    if (!item) return;

    if (!this.grindstoneTopItem) {
      this.grindstoneTopItem = item;
      list[idx] = null;
      this.sounds.playClick?.();
      return;
    }
    if (!this.grindstoneBottomItem) {
      this.grindstoneBottomItem = item;
      list[idx] = null;
      this.sounds.playClick?.();
      return;
    }

    this.inv.handleSlotClick(list, idx, false, true);
  }

  // --- Beacon GUI -----------------------------------------------------------
  openBeacon(x, y, z) {
    if (document.exitPointerLock) document.exitPointerLock();
    this.closeAllModals();
    if (!this.beaconModal) return;

    this.beaconPos = { x, y, z };
    this.beaconState = calculateBeaconPyramid(this.world, x, y, z);
    this.beaconPaymentItem = null;
    this.beaconSelectedPrimary = null;
    this.beaconSelectedSecondary = null;
    this.beaconModal.classList.remove('hidden');
    this.renderBeaconGUI();
  }

  closeBeaconModal() {
    if (this.beaconModal) this.beaconModal.classList.add('hidden');
    this.beaconPos = null;

    if (this.beaconPaymentItem) {
      this.inv.addItem(this.beaconPaymentItem.id, false, this.beaconPaymentItem.count);
      this.beaconPaymentItem = null;
    }
    if (this.inv.cursorItem) {
      this.inv.addItem(this.inv.cursorItem.id, this.inv.cursorItem.isBlock, this.inv.cursorItem.count);
      this.inv.cursorItem = null;
    }
    this.updateFloatingCursor();
    this.updateHotbar();
  }

  renderBeaconGUI() {
    if (!this.beaconModal || this.beaconModal.classList.contains('hidden')) return;

    const tierLabel = document.getElementById('beacon-tier-label');
    const rangeLabel = document.getElementById('beacon-range-label');
    if (tierLabel) {
      tierLabel.textContent = `Pyramid Tier: ${this.beaconState?.tier || 0} (${this.beaconState?.active ? 'Active' : 'Inactive'})`;
      tierLabel.style.color = this.beaconState?.active ? '#10b981' : '#ef4444';
    }
    if (rangeLabel) {
      rangeLabel.textContent = `Range: ${this.beaconState?.range || 0}m`;
    }

    const primaries = ['speed', 'haste', 'resistance', 'jump_boost', 'strength'];
    for (const p of primaries) {
      const btn = document.getElementById(`beacon-btn-${p}`);
      if (btn) {
        const isAvailable = this.beaconState?.availablePrimaries?.includes(p);
        btn.disabled = !isAvailable;
        btn.style.opacity = isAvailable ? '1.0' : '0.4';
        btn.style.borderColor = (this.beaconSelectedPrimary === p) ? '#10b981' : '';
        btn.onclick = () => {
          if (isAvailable) {
            this.beaconSelectedPrimary = p;
            this.renderBeaconGUI();
          }
        };
      }
    }

    const secondaries = ['regeneration', 'level2'];
    for (const s of secondaries) {
      const btn = document.getElementById(`beacon-btn-${s}`);
      if (btn) {
        const isAvailable = Boolean(this.beaconState?.hasSecondary);
        btn.disabled = !isAvailable;
        btn.style.opacity = isAvailable ? '1.0' : '0.4';
        btn.style.borderColor = (this.beaconSelectedSecondary === s) ? '#10b981' : '';
        btn.onclick = () => {
          if (isAvailable) {
            this.beaconSelectedSecondary = s;
            this.renderBeaconGUI();
          }
        };
      }
    }

    const paySlot = document.getElementById('beacon-payment-slot');
    if (paySlot) {
      this.renderSlotContent(paySlot, this.beaconPaymentItem);
      paySlot.onclick = () => {
        const allowed = ['iron_ingot', 'gold_ingot', 'emerald', 'diamond', 'netherite_ingot'];
        if (this.inv.cursorItem && allowed.includes(this.inv.cursorItem.id)) {
          if (!this.beaconPaymentItem) {
            this.beaconPaymentItem = { ...this.inv.cursorItem, count: 1 };
            this.inv.cursorItem.count -= 1;
            if (this.inv.cursorItem.count <= 0) this.inv.cursorItem = null;
          }
        } else if (!this.inv.cursorItem && this.beaconPaymentItem) {
          this.inv.cursorItem = this.beaconPaymentItem;
          this.beaconPaymentItem = null;
        }
        this.updateFloatingCursor();
        this.renderBeaconGUI();
      };
    }

    const actBtn = document.getElementById('beacon-activate-btn');
    if (actBtn) {
      actBtn.onclick = () => {
        if (!this.beaconPaymentItem || !this.beaconSelectedPrimary) {
          this.sounds.playHurt?.();
          return;
        }
        this.beaconPaymentItem = null;
        this.sounds.playLevelUp?.();
        if (this.beaconPos) {
          this.activeBeaconEffects = this.activeBeaconEffects || {};
          const key = `${this.beaconPos.x},${this.beaconPos.y},${this.beaconPos.z}`;
          this.activeBeaconEffects[key] = {
            ...this.beaconState,
            primary: this.beaconSelectedPrimary,
            secondary: this.beaconSelectedSecondary,
            pos: this.beaconPos
          };
        }
        this.closeBeaconModal();
      };
    }

    this.renderSlotGrid('beacon-storage-grid', this.inv.storage, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderBeaconGUI();
      this.updateHotbar();
    });

    this.renderSlotGrid('beacon-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderBeaconGUI();
      this.updateHotbar();
    });
  }

  renderSlotGrid(containerId, list, onClickCallback) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    list.forEach((item, i) => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      this.renderSlotContent(slot, item);

      if (item) {
        const meta = this.inv.getItemMeta(item);
        slot.onmouseenter = (e) => {
          this.showTooltip(e.clientX, e.clientY, meta?.name || item.id, item.count > 1 ? `Count: ${item.count}` : '', item.enchantments || []);
        };
        slot.onmousemove = (e) => this.positionTooltip(e.clientX, e.clientY);
        slot.onmouseleave = () => this.hideTooltip();
      }

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
    if (item.enchantments && item.enchantments.length > 0) {
      img.classList.add('enchanted-item');
    }
    img.src = resolveItemIcon(meta.icon, meta.name);
    // Generated icon paths may not exist as an asset; fall back rather than showing a broken image.
    img.onerror = () => { img.onerror = null; img.src = placeholderItemIcon(meta.name); };
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
      // Remember the pointer position: without it the ghost icon would keep the
      // coordinates of the last mousemove even after the modal that owned it closed.
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      if (this.inv.cursorItem) {
        this.floatingItem.style.left = `${e.clientX}px`;
        this.floatingItem.style.top = `${e.clientY}px`;
      }
    });
  }

  updateFloatingCursor() {
    if (!this.floatingItem) return;

    const meta = this.inv.cursorItem ? this.inv.getItemMeta(this.inv.cursorItem) : null;

    // Hide whenever there is no usable item. Clearing src matters: a stale icon
    // with a live src rendered a leftover item image (a "ghost") pinned to the
    // last known cursor position, which is what got stuck on screen before.
    if (!meta) {
      this.floatingItem.classList.add('hidden');
      const icon = this.floatingItem.querySelector('.slot-icon');
      if (icon) {
        icon.removeAttribute('src');
        icon.alt = '';
      }
      const count = this.floatingItem.querySelector('.slot-count');
      if (count) count.textContent = '';
      return;
    }

    const icon = this.floatingItem.querySelector('.slot-icon');
    const count = this.floatingItem.querySelector('.slot-count');
    // Only reveal once the icon is valid, so a broken image can never be shown.
    if (icon) {
      icon.src = meta.icon || '';
      icon.alt = meta.name || '';
      if (!icon.src) {
        this.floatingItem.classList.add('hidden');
        return;
      }
    }
    if (count) count.textContent = meta.count > 1 ? meta.count : '';

    // Keep the ghost under the pointer, even if no mousemove arrives after this.
    if (Number.isFinite(this.lastPointerX) && Number.isFinite(this.lastPointerY)) {
      this.floatingItem.style.left = `${this.lastPointerX}px`;
      this.floatingItem.style.top = `${this.lastPointerY}px`;
    }
    this.floatingItem.classList.remove('hidden');
  }

  // Villager Trades
  bindVillagerTradeEvents() {
    this.renderVillagerTrades();
  }

  renderVillagerTrades(villagerMob) {
    const list = document.getElementById('villager-trades');
    if (!list) return;
    list.innerHTML = '';

    const mob = villagerMob || this.activeVillager;
    if (mob) this.activeVillager = mob;

    const profId = mob?.profession || 'farmer';
    const profDef = PROFESSIONS[profId] || { name: 'Farmer', workstationName: 'Composter' };
    const levelNum = mob?.level || 1;
    const levelDef = VILLAGER_LEVELS.find(l => l.level === levelNum) || VILLAGER_LEVELS[0];

    // Update Header and Badges
    const titleEl = document.getElementById('villager-title');
    if (titleEl) titleEl.textContent = `${levelDef.title} ${profDef.name}`;

    const descEl = document.getElementById('villager-profession-desc');
    if (descEl) descEl.textContent = `(${profDef.workstationName})`;

    const badgeEl = document.getElementById('villager-badge');
    if (badgeEl) {
      badgeEl.textContent = `${levelDef.title} (${levelDef.badge})`;
      badgeEl.style.background = levelDef.badgeColor;
    }

    // Update XP Bar
    const xpTextEl = document.getElementById('villager-xp-text');
    const xpFillEl = document.getElementById('villager-xp-fill');
    const currentXp = mob?.xp || 0;
    const nextLevel = VILLAGER_LEVELS.find(l => l.level === levelNum + 1);

    if (nextLevel) {
      const prevXp = levelDef.xpRequired;
      const progress = Math.min(100, Math.max(0, ((currentXp - prevXp) / (nextLevel.xpRequired - prevXp)) * 100));
      if (xpTextEl) xpTextEl.textContent = `${currentXp} / ${nextLevel.xpRequired} XP`;
      if (xpFillEl) xpFillEl.style.width = `${progress}%`;
    } else {
      if (xpTextEl) xpTextEl.textContent = `${currentXp} XP (Master Tier)`;
      if (xpFillEl) xpFillEl.style.width = `100%`;
    }

    // Trades
    const trades = (mob && mob.trades && mob.trades.length > 0) ? mob.trades : VILLAGER_TRADES;

    trades.forEach((trade) => {
      const row = document.createElement('div');
      const isOutOfStock = (trade.uses !== undefined && trade.maxUses !== undefined && trade.uses >= trade.maxUses) || trade.disabled;
      row.className = `trade-row ${isOutOfStock ? 'out-of-stock' : ''}`;

      const { effectiveCount, originalCount, discounted, markup } = calculateTradeCost(trade, mob, {
        heroOfTheVillage: this.player?.hasStatusEffect?.('hero_of_the_village')
      });

      const costDisplay = discounted
        ? `<span class="trade-price-orig">${originalCount}</span><span style="color:#10b981; font-weight:bold;">${effectiveCount}</span><span class="trade-discount-badge">SALE</span>`
        : markup
          ? `<span style="color:#ef4444; font-weight:bold;">${effectiveCount}</span><span class="trade-demand-badge">HIGH</span>`
          : `<span>${effectiveCount}</span>`;

      const secondaryCostHtml = trade.cost2 ? `
        <span style="color:#94a3b8; font-size:12px;">+</span>
        <div style="display: flex; align-items: center; gap: 4px;">
          <img class="slot-icon" src="${trade.cost2.icon}">
          <span>${trade.cost2.count}</span>
        </div>
      ` : '';

      const usesTagHtml = trade.maxUses !== undefined ? `
        <span class="trade-uses-tag">${isOutOfStock ? '❌ Sold Out' : `${trade.maxUses - trade.uses}/${trade.maxUses}`}</span>
      ` : '';

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img class="slot-icon" src="${trade.cost.icon}">
          <div style="display:flex; align-items:center; gap: 4px;">
            ${costDisplay}
            <span style="margin-left: 2px;">${trade.cost.name.replace(/^\\d+\\s*/, '')}</span>
          </div>
          ${secondaryCostHtml}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="trade-arrow">➔</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <img class="slot-icon" src="${trade.reward.icon}">
            <span style="font-weight: 500;">${trade.reward.name}</span>
          </div>
          ${usesTagHtml}
        </div>
      `;

      row.onclick = () => {
        if (isOutOfStock) {
          this.sounds?.playHurt?.();
          return;
        }

        const result = executeTrade(trade, mob, this.inv, this.sounds);
        if (result.success) {
          this.renderVillagerTrades(mob);
          this.updateHotbar();
        }
      };

      list.appendChild(row);
    });

    this.renderSlotGrid('villager-storage-grid', this.inv.storage, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.storage, idx, right, shift);
      this.renderVillagerTrades(mob);
      this.updateHotbar();
    });

    this.renderSlotGrid('villager-hotbar-grid', this.inv.hotbar, (idx, right, shift) => {
      this.inv.handleSlotClick(this.inv.hotbar, idx, right, shift);
      this.renderVillagerTrades(mob);
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

    // Mob inspection is intentionally opt-in: it adds scene sprites and is
    // useful for diagnosing skins, hit points and raid entities while paused.
    const btnMobDebug = this.mobDebugButton || document.getElementById('btn-mob-debug');
    if (btnMobDebug) {
      const updateMobDebugButton = (enabled) => {
        this.mobDebugEnabled = Boolean(enabled);
        btnMobDebug.textContent = `Mob Debug Labels: ${this.mobDebugEnabled ? 'ON' : 'OFF'}`;
        btnMobDebug.setAttribute('aria-pressed', String(this.mobDebugEnabled));
        this.mobs?.setDebugLabelsEnabled?.(this.mobDebugEnabled);
      };
      updateMobDebugButton(false);
      btnMobDebug.onclick = () => {
        updateMobDebugButton(!this.mobDebugEnabled);
        this.playPopSound();
      };
      this.setMobDebugLabels = updateMobDebugButton;
    }

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
          if (this.game.buildingStudio) {
            this.game.buildingStudio.exitStudio();
          }
          if (this.game.world) {
            this.game.world.isFlatWorld = false;
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

  // Biome Selection Modal Management
  bindBiomeModalEvents() {
    if (this.worldBiomeSelect) {
      this.worldBiomeSelect.addEventListener('change', () => {
        this.updateBiomeInfoCard();
      });
    }

    if (this.btnRandomizeSeed) {
      this.btnRandomizeSeed.addEventListener('click', () => {
        this.playPopSound();
        if (this.worldSeedInput) {
          const randSeed = Math.floor(Math.random() * 2147483647) + 1;
          this.worldSeedInput.value = String(randSeed);
        }
      });
    }

    if (this.btnCloseBiomeModal) {
      this.btnCloseBiomeModal.addEventListener('click', () => {
        this.playPopSound();
        this.closeBiomeModal();
      });
    }

    if (this.btnCreateWorldConfirm) {
      this.btnCreateWorldConfirm.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.playPopSound();
        if (!this.game) return;
        if (this.game._worldStartInFlight) return;

        this.game._worldStartInFlight = true;
        this.sounds?.init();
        this.btnCreateWorldConfirm.disabled = true;

        try {
          const biomeId = this.worldBiomeSelect ? this.worldBiomeSelect.value : 'all';
          const seedVal = this.worldSeedInput ? this.worldSeedInput.value.trim() : '';
          let seedNum;
          if (!seedVal) {
            // Generate a fresh random seed so every generation is substantially different!
            seedNum = Math.floor(Math.random() * 2147483647) + 1;
          } else if (/^-?\d+$/.test(seedVal)) {
            seedNum = parseInt(seedVal, 10);
          } else {
            let h = 0;
            for (let i = 0; i < seedVal.length; i++) {
              h = ((h << 5) - h + seedVal.charCodeAt(i)) | 0;
            }
            seedNum = Math.abs(h) || 1337;
          }

          // Reseed world with chosen/random seed and biome
          this.game.world.reseed(seedNum, biomeId);

          this.closeBiomeModal();

          await this.game.generateNewWorld();
          if (this.startOverlay) this.startOverlay.style.display = 'none';
        } catch (err) {
          console.error('[World] Failed to generate world with biome:', err);
          this.game.failWorldStart?.(err);
        } finally {
          this.btnCreateWorldConfirm.disabled = false;
          this.game._worldStartInFlight = false;
          if (this.game.worldReady) this.game.overlay?.hide();
        }
      });
    }
  }

  openBiomeModal() {
    document.exitPointerLock();
    this.closeAllModals();
    if (this.startOverlay) this.startOverlay.style.display = 'none';
    if (!this.biomeModal) return;

    this.biomeModal.classList.remove('hidden');
    if (this.worldSeedInput) {
      this.worldSeedInput.value = '';
    }
    this.updateBiomeInfoCard();
  }

  closeBiomeModal() {
    if (this.biomeModal) this.biomeModal.classList.add('hidden');
    if (this.game && !this.game.worldGenerated && this.startOverlay) {
      this.startOverlay.style.display = 'flex';
    }
  }

  updateBiomeInfoCard() {
    if (!this.worldBiomeSelect) return;
    const biomeId = this.worldBiomeSelect.value || 'all';
    const def = getBiomeDef(biomeId);

    const icons = {
      all: '🌍',
      offshore: '🌊',
      highland: '🏔️',
      woodland: '🌲',
      wetland: '🌿',
      flatland: '🌾',
      arid: '🏜️',
      cave: '🕳️',
      nether: '🔥',
      end: '🌌'
    };

    if (this.biomeInfoIcon) {
      this.biomeInfoIcon.textContent = icons[def.category] || '🗺️';
    }
    if (this.biomeInfoName) {
      this.biomeInfoName.textContent = def.name;
    }
    if (this.biomeInfoDimension) {
      const dim = def.dimension ? def.dimension.toUpperCase() : 'OVERWORLD';
      this.biomeInfoDimension.textContent = dim;
      if (def.isNether) {
        this.biomeInfoDimension.style.background = '#dc2626';
      } else if (def.isEnd) {
        this.biomeInfoDimension.style.background = '#7c3aed';
      } else {
        this.biomeInfoDimension.style.background = '#2563eb';
      }
    }
    if (this.biomeInfoDesc) {
      this.biomeInfoDesc.textContent = def.description || 'Authentic Minecraft biome with native terrain generation, blocks, and wildlife.';
    }
    if (this.biomeTagCategory) {
      this.biomeTagCategory.textContent = `Category: ${def.category ? def.category.charAt(0).toUpperCase() + def.category.slice(1) : 'Overworld'}`;
    }
    if (this.biomeTagBlocks) {
      const blocksText = def.surfaceBlock ? `Surface: ${BLOCK_DEFS[def.surfaceBlock]?.name || 'Natural'}` : 'Varied';
      this.biomeTagBlocks.textContent = `Blocks: ${blocksText}`;
    }
    if (this.biomeTagMobs) {
      const mobsList = (def.mobs && def.mobs.length > 0) ? def.mobs.slice(0, 3).join(', ') : 'Natural wildlife';
      this.biomeTagMobs.textContent = `Native Mobs: ${mobsList}`;
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
    if (this.player) {
      this.player.keys = {};
      this.player.velocity.x = 0;
      this.player.velocity.z = 0;
    }
  }

  closeChat() {
    this.isChatOpen = false;
    this.chatInputWrapper.style.display = 'none';
    this.chatInput.value = '';
    this.chatInput.blur();
    if (this.player) {
      this.player.keys = {};
    }
    const canvas = document.getElementById('canvas-container');
    if (canvas && !this.isModalOpen() && !this.isGeminiOpen()) {
      canvas.requestPointerLock();
    }
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
    if (this.player) {
      this.player.keys = {};
      this.player.velocity.x = 0;
      this.player.velocity.z = 0;
    }
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
    if (this.player) {
      this.player.keys = {};
    }
    const canvas = document.getElementById('canvas-container');
    if (canvas && !this.isModalOpen() && !this.isChatOpen) {
      canvas.requestPointerLock();
    }
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
      // A custom model id (env override or hand-edited storage) must stay selectable,
      // but migrate fictional gemini-3.x models to the valid default.
      if (active && !models.some(model => model.id === active)) {
        if (/^gemini-3\./i.test(active)) {
          const fallback = models[0]?.id || 'gemini-2.5-flash';
          geminiAgent.model = fallback;
          this.geminiModelSelect.value = fallback;
        } else {
          const option = document.createElement('option');
          option.value = active;
          option.textContent = `${active} (custom)`;
          this.geminiModelSelect.appendChild(option);
          this.geminiModelSelect.value = active;
        }
      } else {
        this.geminiModelSelect.value = active;
      }
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

    if (this.geminiCloseBtn) {
      this.geminiCloseBtn.onclick = () => {
        this.closeGeminiTerminal();
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
