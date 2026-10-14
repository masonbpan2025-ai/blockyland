// UI controller for Resource Packs and Skin Packs modal.
import { resourcePackManager } from './resourcePackManager.js';
import { skinManager } from './skinManager.js';

export class PacksModal {
  constructor() {
    this.modal = null;
    this.activeTab = 'resources'; // 'resources' | 'skins'
    this.init();
  }

  init() {
    if (typeof document === 'undefined') return;

    // Check if modal already exists
    let modal = document.getElementById('packs-skins-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'packs-skins-modal';
      modal.className = 'game-modal hidden';
      modal.style.zIndex = '10010';
      document.body.appendChild(modal);
    }
    this.modal = modal;
    this.render();
  }

  open(tab = 'resources') {
    this.activeTab = tab;
    if (this.modal) {
      this.modal.classList.remove('hidden');
      this.render();
    }
  }

  close() {
    if (this.modal) {
      this.modal.classList.add('hidden');
    }
  }

  render() {
    if (!this.modal) return;

    this.modal.innerHTML = `
      <div class="map-modal-card" style="max-width: 720px; width: 90vw; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #555; padding-bottom: 12px; margin-bottom: 12px;">
          <div class="mc-title" style="margin: 0; font-size: 20px;">🎨 Packs & Customization</div>
          <button type="button" class="gemini-close-btn" id="btn-close-packs-modal" style="cursor: pointer; background: none; border: none; color: #fff; font-size: 18px;">✕</button>
        </div>

        <!-- Navigation Tabs -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <button type="button" class="mc-btn ${this.activeTab === 'resources' ? 'mc-btn-primary' : ''}" id="tab-btn-resources" style="width: auto; flex: 1; height: 34px; font-size: 14px;">
            📦 Resource Packs
          </button>
          <button type="button" class="mc-btn ${this.activeTab === 'skins' ? 'mc-btn-primary' : ''}" id="tab-btn-skins" style="width: auto; flex: 1; height: 34px; font-size: 14px;">
            👤 Skin Packs & Player
          </button>
        </div>

        <!-- Tab Body -->
        <div id="packs-modal-tab-content" style="flex: 1; overflow-y: auto; padding-right: 6px;">
          ${this.activeTab === 'resources' ? this.renderResourcePacksContent() : this.renderSkinPacksContent()}
        </div>

        <!-- Footer -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; border-top: 2px solid #555; padding-top: 12px;">
          <button type="button" class="mc-btn" id="btn-packs-done" style="width: 140px; height: 36px;">Done</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderResourcePacksContent() {
    const activePacks = resourcePackManager.getActivePacks();
    const availablePacks = resourcePackManager.getAvailablePacks();

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Featured Community Presets (Stay True, Faithful 64x, Ashen 16x) -->
        <div>
          <div style="font-size: 13px; font-weight: bold; color: #ffff55; margin-bottom: 8px;">🌟 Featured Resource Packs</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px;">
            <div class="preset-card" style="background: rgba(0,0,0,0.3); border: 2px solid #444; border-radius: 4px; padding: 10px; text-align: center;">
              <div style="font-weight: bold; color: #a3e635; font-size: 13px;">Stay True (16x)</div>
              <div style="font-size: 11px; color: #cbd5e1; margin: 4px 0 8px; line-height: 1.3;">Enhanced vanilla-plus with rich organic foliage & detailed stone.</div>
              <button type="button" class="mc-btn" data-preset="stay_true" style="width: 100%; height: 28px; font-size: 12px;">Activate</button>
            </div>
            <div class="preset-card" style="background: rgba(0,0,0,0.3); border: 2px solid #444; border-radius: 4px; padding: 10px; text-align: center;">
              <div style="font-weight: bold; color: #38bdf8; font-size: 13px;">Faithful 64x</div>
              <div style="font-size: 11px; color: #cbd5e1; margin: 4px 0 8px; line-height: 1.3;">High-definition 64x upscale preserving authentic classic textures.</div>
              <button type="button" class="mc-btn" data-preset="faithful_64x" style="width: 100%; height: 28px; font-size: 12px;">Activate</button>
            </div>
            <div class="preset-card" style="background: rgba(0,0,0,0.3); border: 2px solid #444; border-radius: 4px; padding: 10px; text-align: center;">
              <div style="font-weight: bold; color: #fb923c; font-size: 13px;">Ashen (16x)</div>
              <div style="font-size: 11px; color: #cbd5e1; margin: 4px 0 8px; line-height: 1.3;">Moody, weathered, rustic aesthetic with atmospheric stone & wood.</div>
              <button type="button" class="mc-btn" data-preset="ashen_16x" style="width: 100%; height: 28px; font-size: 12px;">Activate</button>
            </div>
            <div class="preset-card" style="background: rgba(0,0,0,0.3); border: 2px solid #444; border-radius: 4px; padding: 10px; text-align: center;">
              <div style="font-weight: bold; color: #f8fafc; font-size: 13px;">Default Vanilla</div>
              <div style="font-size: 11px; color: #cbd5e1; margin: 4px 0 8px; line-height: 1.3;">Standard official default textures.</div>
              <button type="button" class="mc-btn" data-preset="vanilla" style="width: 100%; height: 28px; font-size: 12px;">Reset Default</button>
            </div>
          </div>
        </div>

        <!-- Custom Upload Section -->
        <div style="background: rgba(15, 23, 42, 0.4); border: 1px dashed #38bdf8; border-radius: 6px; padding: 12px; text-align: center;">
          <div style="font-size: 13px; color: #f1f5f9; margin-bottom: 6px;">📥 Upload Minecraft Java Resource Pack</div>
          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 10px;">Select any official Minecraft Java Resource Pack (.zip or unpacked folder).</div>
          <div style="display: flex; justify-content: center; gap: 8px;">
            <label class="mc-btn mc-btn-primary" style="width: 180px; height: 32px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
              Choose .zip Pack
              <input type="file" id="upload-resource-zip" accept=".zip" style="display: none;">
            </label>
            <label class="mc-btn" style="width: 180px; height: 32px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
              Choose Folder
              <input type="file" id="upload-resource-folder" webkitdirectory directory multiple style="display: none;">
            </label>
          </div>
          <div id="resource-pack-status" style="font-size: 12px; color: #10b981; margin-top: 8px;"></div>
        </div>

        <!-- Active Packs List -->
        <div>
          <div style="font-size: 13px; font-weight: bold; color: #ffff55; margin-bottom: 6px;">Active Resource Packs (Highest priority at top)</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${activePacks.length === 0 ? '<div style="font-size: 12px; color: #94a3b8; padding: 8px;">No extra resource packs active (Using default vanilla).</div>' : ''}
            ${activePacks.map((pack, idx) => `
              <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); border: 1px solid #555; padding: 8px 12px; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 16px;">📦</span>
                  <div>
                    <div style="font-weight: bold; font-size: 13px; color: #fff;">${pack.name}</div>
                    <div style="font-size: 11px; color: #aaa;">${pack.description}</div>
                  </div>
                </div>
                <div style="display: flex; gap: 4px;">
                  ${idx > 0 ? `<button type="button" class="mc-btn" data-action="move-up" data-id="${pack.id}" style="width: 30px; height: 26px; padding: 0;">▲</button>` : ''}
                  ${idx < activePacks.length - 1 ? `<button type="button" class="mc-btn" data-action="move-down" data-id="${pack.id}" style="width: 30px; height: 26px; padding: 0;">▼</button>` : ''}
                  <button type="button" class="mc-btn mc-btn-red" data-action="deactivate" data-id="${pack.id}" style="width: 30px; height: 26px; padding: 0;">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderSkinPacksContent() {
    const equipped = skinManager.getEquippedSkin();
    const allSkins = skinManager.getAllSkins();

    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Equipped Skin Banner -->
        <div style="display: flex; align-items: center; gap: 16px; background: rgba(0,0,0,0.3); border: 2px solid #555; border-radius: 6px; padding: 12px;">
          <img src="${skinManager.getFaceDataUrl(equipped.id)}" alt="Face" style="width: 48px; height: 48px; image-rendering: pixelated; border: 2px solid #fff; border-radius: 4px; background: #222;" />
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: bold; font-size: 15px; color: #ffff55;">${equipped.name}</span>
              <span style="font-size: 11px; background: #0284c7; color: #fff; padding: 1px 6px; border-radius: 3px;">
                ${equipped.model === 'slim' ? 'Slim (Alex 3px)' : 'Classic (Steve 4px)'}
              </span>
            </div>
            <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">${equipped.description || 'Equipped Player Skin'}</div>
          </div>
        </div>

        <!-- Custom Upload Section -->
        <div style="background: rgba(15, 23, 42, 0.4); border: 1px dashed #38bdf8; border-radius: 6px; padding: 12px; text-align: center;">
          <div style="font-size: 13px; color: #f1f5f9; margin-bottom: 6px;">👤 Upload Custom Skin or Skin Pack</div>
          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 10px;">Supports Minecraft 64x64/64x32 .png skins and Bedrock/Java skin packs (.zip / .mcpack).</div>
          <div style="display: flex; justify-content: center; gap: 8px;">
            <label class="mc-btn mc-btn-primary" style="width: 170px; height: 32px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
              Upload Skin (.png)
              <input type="file" id="upload-skin-png" accept="image/png" style="display: none;">
            </label>
            <label class="mc-btn" style="width: 170px; height: 32px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
              Import Skin Pack (.zip)
              <input type="file" id="upload-skin-pack" accept=".zip,.mcpack" style="display: none;">
            </label>
          </div>
          <div id="skin-status" style="font-size: 12px; color: #10b981; margin-top: 8px;"></div>
        </div>

        <!-- Skin Gallery -->
        <div>
          <div style="font-size: 13px; font-weight: bold; color: #ffff55; margin-bottom: 8px;">Available Skins Gallery</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px;">
            ${allSkins.map(skin => `
              <div style="background: ${skin.id === equipped.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(0,0,0,0.3)'}; border: 2px solid ${skin.id === equipped.id ? '#38bdf8' : '#444'}; border-radius: 4px; padding: 8px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                <img src="${skinManager.getFaceDataUrl(skin.id)}" alt="${skin.name}" style="width: 40px; height: 40px; image-rendering: pixelated; margin-bottom: 6px; border: 1px solid #777;" />
                <div style="font-weight: bold; font-size: 12px; color: #fff; margin-bottom: 2px;">${skin.name}</div>
                <div style="font-size: 10px; color: #aaa; margin-bottom: 6px;">${skin.model === 'slim' ? 'Slim' : 'Classic'}</div>
                ${skin.id === equipped.id
                  ? '<div style="font-size: 11px; color: #38bdf8; font-weight: bold; height: 26px; display: flex; align-items: center;">Equipped</div>'
                  : `<button type="button" class="mc-btn" data-equip-skin="${skin.id}" style="width: 100%; height: 26px; font-size: 11px;">Equip</button>`
                }
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.modal) return;

    // Close buttons
    const closeBtn = this.modal.querySelector('#btn-close-packs-modal');
    if (closeBtn) closeBtn.onclick = () => this.close();
    const doneBtn = this.modal.querySelector('#btn-packs-done');
    if (doneBtn) doneBtn.onclick = () => this.close();

    // Tabs
    const tabRes = this.modal.querySelector('#tab-btn-resources');
    if (tabRes) tabRes.onclick = () => { this.activeTab = 'resources'; this.render(); };
    const tabSkins = this.modal.querySelector('#tab-btn-skins');
    if (tabSkins) tabSkins.onclick = () => { this.activeTab = 'skins'; this.render(); };

    // Resource pack preset activations
    this.modal.querySelectorAll('[data-preset]').forEach(btn => {
      btn.onclick = async () => {
        const presetId = btn.getAttribute('data-preset');
        btn.textContent = 'Applying...';
        btn.disabled = true;
        try {
          if (presetId === 'vanilla') {
            await resourcePackManager.reorderPacks([]);
          } else {
            await resourcePackManager.activatePack(presetId);
          }
        } finally {
          this.render();
        }
      };
    });

    // Resource pack action buttons (move-up, move-down, deactivate)
    this.modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = async () => {
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const activeIds = [...resourcePackManager.activePackIds];
        const idx = activeIds.indexOf(id);
        btn.disabled = true;
        try {
          if (action === 'deactivate') {
            await resourcePackManager.deactivatePack(id);
          } else if (action === 'move-up' && idx > 0) {
            activeIds.splice(idx, 1);
            activeIds.splice(idx - 1, 0, id);
            await resourcePackManager.reorderPacks(activeIds);
          } else if (action === 'move-down' && idx < activeIds.length - 1) {
            activeIds.splice(idx, 1);
            activeIds.splice(idx + 1, 0, id);
            await resourcePackManager.reorderPacks(activeIds);
          }
        } finally {
          this.render();
        }
      };
    });

    // Upload Resource Pack (.zip)
    const zipInput = this.modal.querySelector('#upload-resource-zip');
    if (zipInput) {
      zipInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const statusEl = this.modal.querySelector('#resource-pack-status');
        if (statusEl) statusEl.textContent = 'Extracting and loading pack...';
        try {
          const buffer = await file.arrayBuffer();
          const packName = file.name.replace(/\.zip$/i, '');
          const pack = await resourcePackManager.loadPackFromZip(buffer, packName);
          if (statusEl) statusEl.textContent = `Loaded ${pack.name} successfully!`;
          this.render();
        } catch (err) {
          console.error(err);
          if (statusEl) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = `Error loading pack: ${err.message}`;
          }
        }
      };
    }

    // Upload Resource Pack (folder)
    const folderInput = this.modal.querySelector('#upload-resource-folder');
    if (folderInput) {
      folderInput.onchange = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const statusEl = this.modal.querySelector('#resource-pack-status');
        if (statusEl) statusEl.textContent = 'Reading folder entries...';
        try {
          const fileMap = {};
          let rootFolder = 'Custom Pack';
          for (const f of files) {
            const rel = f.webkitRelativePath || f.name;
            const parts = rel.split('/');
            if (parts.length > 1) rootFolder = parts[0];
            fileMap[rel] = new Uint8Array(await f.arrayBuffer());
          }
          const pack = resourcePackManager.loadPackFromExtractedFiles(fileMap, rootFolder);
          if (statusEl) statusEl.textContent = `Loaded ${pack.name} successfully!`;
          this.render();
        } catch (err) {
          console.error(err);
          if (statusEl) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = `Error loading folder: ${err.message}`;
          }
        }
      };
    }

    // Equip Skin button
    this.modal.querySelectorAll('[data-equip-skin]').forEach(btn => {
      btn.onclick = () => {
        const skinId = btn.getAttribute('data-equip-skin');
        skinManager.equipSkin(skinId);
        this.render();
      };
    });

    // Upload Custom Skin (.png)
    const skinPngInput = this.modal.querySelector('#upload-skin-png');
    if (skinPngInput) {
      skinPngInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const dataUrl = evt.target?.result;
          if (dataUrl) {
            const skinName = file.name.replace(/\.png$/i, '');
            skinManager.registerSkin(skinName, dataUrl, 'default');
            this.render();
          }
        };
        reader.readAsDataURL(file);
      };
    }

    // Import Skin Pack (.zip/.mcpack)
    const skinPackInput = this.modal.querySelector('#upload-skin-pack');
    if (skinPackInput) {
      skinPackInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const statusEl = this.modal.querySelector('#skin-status');
        if (statusEl) statusEl.textContent = 'Extracting skin pack...';
        try {
          const buffer = await file.arrayBuffer();
          const packName = file.name.replace(/\.(zip|mcpack)$/i, '');
          const imported = await skinManager.loadSkinPackFromZip(buffer, packName);
          if (statusEl) statusEl.textContent = `Imported ${imported.length} skin(s) from ${packName}!`;
          this.render();
        } catch (err) {
          console.error(err);
          if (statusEl) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = `Error importing skin pack: ${err.message}`;
          }
        }
      };
    }
  }
}

// Global instance
export const packsModal = new PacksModal();
