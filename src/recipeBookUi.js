// The recipe book's panel, beside the inventory's 2x2 grid and the crafting table's 3x3 (recipeBook.js has the rules).
//
// Bedrock and Education Edition open it by default in Survival; a book button on the crafting window shows and hides
// it. A search box, the five tabs, the All / Craftable toggle, and pages of recipe buttons, red when the inventory
// cannot make them. Click to fill the grid, shift-click for as many as possible. It is not shown in Creative, which
// has its own catalogue.
import { RECIPE_BOOK_TABS, visibleEntries, placeRecipe, learnFromInventory } from './recipeBook.js';

const PAGE_SIZE = 20;

/** Where each screen's book lives: its modal, its grid and that grid's width. */
const SCREENS = {
  inventory: { modal: 'inventory-modal', gridName: 'craft2x2', size: 2, slots: '[data-craft]' },
  crafting: { modal: 'crafting-modal', gridName: 'craft3x3', size: 3, slots: '[data-craft3]' }
};

export class RecipeBookPanel {
  constructor(ui) {
    this.ui = ui;
    this.open = true;
    this.tab = 'all';
    this.search = '';
    this.craftableOnly = false;
    this.page = 0;
    this.panels = {};
  }

  /** The player can use it: Survival and Adventure (Creative has its own inventory screen). */
  enabled() {
    const mode = this.ui.player?.gamemode;
    return mode !== 'creative' && mode !== 'spectator';
  }

  /** Build the panel and its toggle button for a screen, once. */
  ensure(screen) {
    if (this.panels[screen]) return this.panels[screen];
    const spec = SCREENS[screen];
    const modal = typeof document !== 'undefined' ? document.getElementById(spec.modal) : null;
    const gui = modal?.querySelector('.container-gui');
    if (!modal || !gui) return null;
    const panel = document.createElement('div');
    panel.className = 'recipe-book';
    panel.id = `recipe-book-${screen}`;
    panel.innerHTML = `
      <div class="rb-top">
        <input class="rb-search" type="search" placeholder="Search..." aria-label="Search recipes">
        <button type="button" class="rb-toggle" title="Show only what you can craft now"></button>
      </div>
      <div class="rb-tabs" role="tablist"></div>
      <div class="rb-grid"></div>
      <div class="rb-pages"><button type="button" class="rb-prev" aria-label="Previous page">◀</button><span class="rb-page"></span><button type="button" class="rb-next" aria-label="Next page">▶</button></div>`;
    modal.insertBefore(panel, gui);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rb-open';
    button.id = `btn-recipe-book-${screen}`;
    button.title = 'Recipe Book';
    button.textContent = '📖';
    gui.appendChild(button);
    const tabs = panel.querySelector('.rb-tabs');
    for (const t of RECIPE_BOOK_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rb-tab';
      b.dataset.tab = t.id;
      b.title = t.label;
      b.textContent = t.icon;
      b.onclick = () => { this.tab = t.id; this.page = 0; this.render(screen); };
      tabs.appendChild(b);
    }
    const search = panel.querySelector('.rb-search');
    search.oninput = () => { this.search = search.value; this.page = 0; this.render(screen); };
    // Typing in the box must not walk the player or open the inventory.
    search.onkeydown = (e) => e.stopPropagation();
    panel.querySelector('.rb-toggle').onclick = () => { this.craftableOnly = !this.craftableOnly; this.page = 0; this.render(screen); };
    panel.querySelector('.rb-prev').onclick = () => { this.page = Math.max(0, this.page - 1); this.render(screen); };
    panel.querySelector('.rb-next').onclick = () => { this.page += 1; this.render(screen); };
    button.onclick = () => { this.open = !this.open; this.render(screen); };
    this.panels[screen] = { panel, button, spec, modal };
    return this.panels[screen];
  }

  /** Redraw a screen's book, and the ghost of a recipe that could not be made. */
  render(screen) {
    const built = this.ensure(screen);
    if (!built) return;
    const { panel, button, spec } = built;
    const usable = this.enabled();
    button.hidden = !usable;
    panel.hidden = !usable || !this.open;
    button.classList.toggle('active', this.open);
    this.drawGhost(spec);
    if (panel.hidden) return;
    const inv = this.ui.inv;
    const entries = visibleEntries({ player: this.ui.player, inventory: inv, size: spec.size, tab: this.tab, search: this.search, craftableOnly: this.craftableOnly, gridName: spec.gridName });
    const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    for (const b of panel.querySelectorAll('.rb-tab')) b.classList.toggle('active', b.dataset.tab === this.tab);
    const search = panel.querySelector('.rb-search');
    search.hidden = this.tab !== 'all';
    if (search.value !== this.search) search.value = this.search;
    const toggle = panel.querySelector('.rb-toggle');
    toggle.textContent = this.craftableOnly ? 'Craftable' : 'All';
    toggle.classList.toggle('active', this.craftableOnly);
    panel.querySelector('.rb-page').textContent = `${this.page + 1}/${pages}`;
    panel.querySelector('.rb-prev').disabled = this.page === 0;
    panel.querySelector('.rb-next').disabled = this.page >= pages - 1;
    const grid = panel.querySelector('.rb-grid');
    grid.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'rb-empty';
      empty.textContent = this.craftableOnly ? 'Nothing you can craft yet.' : 'No recipes unlocked here yet. Pick up materials to unlock them.';
      grid.appendChild(empty);
    }
    for (const entry of entries.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)) {
      const slot = document.createElement('div');
      slot.className = `inv-slot rb-recipe${entry.craftable ? '' : ' rb-missing'}`;
      slot.dataset.recipe = entry.id;
      this.ui.renderSlotContent(slot, { ...entry.result, isBlock: entry.result.isBlock ?? typeof entry.result.id === 'number', count: entry.result.count ?? 1 });
      slot.onclick = (e) => this.choose(screen, entry, e.shiftKey);
      slot.onmouseenter = (e) => this.ui.showTooltip?.(e.clientX, e.clientY, entry.name, entry.craftable ? 'Click: fill the grid · Shift-click: as many as you can' : 'Missing materials: click to see where they go');
      slot.onmousemove = (e) => this.ui.positionTooltip?.(e.clientX, e.clientY);
      slot.onmouseleave = () => this.ui.hideTooltip?.();
      grid.appendChild(slot);
    }
  }

  /** A recipe clicked: fill the grid (or lay out its ghost), then redraw the screen it is on. */
  choose(screen, entry, all = false) {
    const spec = SCREENS[screen];
    const result = placeRecipe(this.ui.inv, entry, { size: spec.size, all });
    if (!result) this.ui.addChatMessage?.('Your inventory is too full to clear the crafting grid.', 'error');
    this.ui.sounds?.playClick?.();
    if (screen === 'inventory') this.ui.renderInventoryGrids();
    else this.ui.renderCraftingGrids();
    this.ui.updateHotbar?.();
    return result;
  }

  /** The ghost: a recipe the player could not make, shown faintly in the empty cells of its grid. */
  drawGhost(spec) {
    const inv = this.ui.inv;
    const slots = typeof document !== 'undefined' ? document.querySelectorAll(spec.slots) : [];
    for (const el of slots) el.classList.remove('rb-ghost');
    const ghost = inv.recipeGhost;
    if (!ghost || ghost.gridName !== spec.gridName) return;
    // Anything put in the grid by hand replaces the ghost.
    if (inv[spec.gridName].some(Boolean)) { inv.recipeGhost = null; return; }
    for (const cell of ghost.cells) {
      const el = slots[cell.index];
      if (!el) continue;
      this.ui.renderSlotContent(el, { id: cell.value, isBlock: typeof cell.value === 'number', count: 1 });
      el.classList.add('rb-ghost');
    }
  }

  /** Unlock recipes from what the player now holds; says so when there are new ones. */
  learn() {
    const fresh = learnFromInventory(this.ui.player, this.ui.inv);
    if (fresh.length && this.enabled() && this.ui.player?.recipeBookAnnounce !== false) {
      this.ui.addChatMessage?.(`New recipes unlocked! (${fresh.length}) Open the recipe book in your inventory.`, 'system');
    }
    return fresh;
  }
}
