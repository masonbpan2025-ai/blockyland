import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { StructureLibrary } from './buildingLibrary.js';
import { showConfirmDialog } from './dialogUtils.js';

export class StructureStudioManager {
  constructor(game) {
    this.game = game;
    this.isActive = false;
    this.currentStructure = null;
    this.currentParameters = {};
    this.placedVoxels = []; // Array of { x, y, z, prevId } to clear upon re-building
    this.buildOrigin = new THREE.Vector3(0, 5, 8); // in front of player spawn (0, 5, 0)
    this.isCustomVoxelBuild = false;
    this.customBuildBlocks = [];
    this.customBuildName = null;

    // DOM Elements
    const hasDoc = typeof document !== 'undefined';
    this.studioPanel = hasDoc ? document.getElementById('structure-parameter-panel') : null;
    this.controlsContainer = hasDoc ? document.getElementById('studio-parameter-controls') : null;
    this.structureNameBadge = hasDoc ? document.getElementById('studio-current-structure-name') : null;
    this.btnSave = hasDoc ? document.getElementById('btn-studio-save') : null;
    this.btnOpen = hasDoc ? document.getElementById('btn-studio-open') : null;

    this.saveModal = hasDoc ? document.getElementById('modal-save-structure') : null;
    this.saveInput = hasDoc ? document.getElementById('input-save-structure-name') : null;
    this.saveConflictMsg = hasDoc ? document.getElementById('save-structure-conflict-msg') : null;
    this.btnConfirmSave = hasDoc ? document.getElementById('btn-confirm-save-structure') : null;
    this.btnCancelSave = hasDoc ? document.getElementById('btn-cancel-save-structure') : null;

    this.openModal = hasDoc ? document.getElementById('modal-open-structure') : null;
    this.openList = hasDoc ? document.getElementById('studio-open-structure-list') : null;
    this.openSearch = hasDoc ? document.getElementById('input-search-open-structure') : null;
    this.btnCloseOpen = hasDoc ? document.getElementById('btn-close-open-structure') : null;
    this.btnRestoreDefaults = hasDoc ? document.getElementById('btn-restore-default-structures') : null;

    if (hasDoc) {
      this.bindEvents();
    }
  }

  bindEvents() {
    this.btnSave?.addEventListener('click', () => {
      this.showSaveModal();
    });

    this.btnOpen?.addEventListener('click', () => {
      this.showOpenModal();
    });

    this.btnConfirmSave?.addEventListener('click', () => {
      this.confirmSave();
    });

    this.saveInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmSave();
      }
    });

    this.btnCancelSave?.addEventListener('click', () => {
      this.hideSaveModal();
    });

    this.btnCloseOpen?.addEventListener('click', () => {
      this.hideOpenModal();
    });

    this.btnRestoreDefaults?.addEventListener('click', () => {
      showConfirmDialog({
        title: '⚠️ Restore Defaults',
        message: 'Restore all default structures to their original names and restore any deleted defaults?',
        confirmText: 'Yes, Restore',
        cancelText: 'Cancel',
        onConfirm: () => {
          StructureLibrary.restoreDefaults();
          this.game?.ui?.addChatMessage?.(
            '<span style="color:#10b981;font-weight:bold;">✦ Default structures restored!</span>'
          );
          this.renderOpenStructureList(this.openSearch?.value || '');
        }
      });
    });

    this.openSearch?.addEventListener('input', (e) => {
      this.renderOpenStructureList(e.target.value);
    });
  }

  // --- Entering Structure Studio Mode ---
  enterStudio() {
    this.isActive = true;
    if (this.game.mechanisms) {
      this.game.mechanisms.setMechanism('default', this.game);
    }
    this.game.player.gamemode = 'creative';
    this.game.worldType = 'structure_studio';

    // Position player facing build origin
    this.game.player.position.set(0, 5, 0);
    this.game.player.yaw = 0; // facing +Z towards (0, 5, 8)
    this.game.player.pitch = 0;
    if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);

    // Open Terminal in Studio Mode
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('gemini-modal');
      if (modal) {
        modal.classList.add('studio-mode');
      }
      if (this.studioPanel) {
        this.studioPanel.classList.remove('hidden');
      }
      this.renderEmptyPanel();
    }

    if (this.game.ui?.openGeminiTerminal) {
      this.game.ui.openGeminiTerminal();
    }

    this.game.ui?.addChatMessage?.(
      '<span style="color:#38bdf8;font-weight:bold;">[Structure Studio]</span> Welcome to Structure Studio! Enter a prompt like "build a stair with a height parameter" to begin.'
    );
  }

  exitStudio() {
    this.isActive = false;
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('gemini-modal');
      if (modal) {
        modal.classList.remove('studio-mode');
      }
      if (this.studioPanel) {
        this.studioPanel.classList.add('hidden');
      }
    }
  }

  /**
   * Adopt a structure the language model built, so it becomes editable in the
   * parameter panel.
   *
   * Called after the agent runs a plan while Structure Studio is open. The point
   * of the Studio is to iterate on parameters, so an AI-built structure that
   * never reaches the panel leaves the user with nothing to tune. Any dimension
   * the model reported is used as the starting parameter value.
   *
   * @returns {boolean} true when a library structure was adopted
   */
  adoptCustomBuild({ name, blocks, plan }) {
    this.isCustomVoxelBuild = true;
    this.customBuildBlocks = Array.isArray(blocks) ? [...blocks] : [];
    this.customBuildName = name || 'Custom Structure';
    this.placedVoxels = (blocks || []).map(b => ({ x: b.x, y: b.y, z: b.z, prevId: b.prevId }));
    this.currentStructure = {
      id: `custom_${(name || 'structure').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      name: name || 'Custom Structure',
      isCustom: true,
      parameters: [],
      icon: '/assets/blocks/crafting_table_top.png'
    };
    this.currentParameters = {};

    if (this.structureNameBadge) {
      this.structureNameBadge.textContent = name || 'Custom Structure';
    }

    if (this.controlsContainer) {
      this.controlsContainer.innerHTML = `
        <div class="studio-empty-params">
          <span class="studio-empty-icon">✦</span>
          <p style="color:#38bdf8;font-weight:bold;font-size:14px;margin-bottom:6px;">${name || 'Custom Structure'}</p>
          <small style="color:#94a3b8;line-height:1.4;">
            AI 3D build active (${(blocks || []).length} voxels).<br>
            Click <strong style="color:#10b981;">💾 Save</strong> to store it in your Structure Library.
          </small>
        </div>
      `;
    }
  }

  captureCurrentVoxels() {
    const blocks = [];
    const candidateCoords = new Map();

    if (Array.isArray(this.placedVoxels)) {
      for (const v of this.placedVoxels) {
        candidateCoords.set(`${v.x},${v.y},${v.z}`, { x: v.x, y: v.y, z: v.z });
      }
    }

    if (Array.isArray(this.customBuildBlocks)) {
      for (const b of this.customBuildBlocks) {
        candidateCoords.set(`${b.x},${b.y},${b.z}`, { x: b.x, y: b.y, z: b.z, id: b.id });
      }
    }

    if (this.game?.world?.getVoxel) {
      if (candidateCoords.size > 0) {
        for (const v of candidateCoords.values()) {
          const id = this.game.world.getVoxel(v.x, v.y, v.z);
          if (id !== undefined && id !== BLOCKS.AIR) {
            blocks.push({ x: v.x, y: v.y, z: v.z, id });
          } else if (v.id && id !== BLOCKS.AIR) {
            blocks.push(v);
          }
        }
      }
    } else if (Array.isArray(this.customBuildBlocks) && this.customBuildBlocks.length > 0) {
      return [...this.customBuildBlocks];
    }

    return blocks.length > 0 ? blocks : (this.customBuildBlocks || []);
  }

  generateCodeFromVoxels(blocks, origin) {
    const orig = origin || this.buildOrigin;
    const relBlocks = blocks.map(b => [b.x - orig.x, b.y - orig.y, b.z - orig.z, b.id]);
    return `
const V = ${JSON.stringify(relBlocks)};
function generate(origin, params, B) {
  const res = [];
  for (let i = 0; i < V.length; i++) {
    const item = V[i];
    res.push({
      x: origin.x + item[0],
      y: origin.y + item[1],
      z: origin.z + item[2],
      id: item[3]
    });
  }
  return res;
}
`.trim();
  }

  adoptFromPlan(plan) {
    if (!plan || typeof plan !== 'object') return false;

    // Plans with explicit operations are custom volumetric builds, not library templates.
    if (Array.isArray(plan.operations) && plan.operations.length > 0) {
      return false;
    }

    const type = String(plan.structureType || plan.structureId || '').toLowerCase().trim();
    if (!type) return false;

    const all = StructureLibrary.getAllStructures();
    const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

    // Exact id, then exact name. Decline unknown structures without substring guessing.
    let structure = StructureLibrary.getStructure(type);
    if (!structure) structure = all.find(st => norm(st.name) === norm(type));
    if (!structure) {
      structure = all.find(st => norm(st.id) === norm(type))
        || all.find(st => norm(st.name) === norm(type));
    }
    if (!structure) return false;

    // Start from the structure's own defaults and fold in anything the model
    // supplied under a recognisable name.
    const params = {};
    const supplied = { ...(plan.dimensions || {}), ...(plan.parameters || {}) };
    for (const param of structure.parameters || []) {
      const wanted = param.id.toLowerCase();
      const symbol = String(param.symbol || '').toLowerCase();
      const raw = supplied[param.id] ?? supplied[wanted] ?? (symbol ? supplied[symbol] : undefined);
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) {
        params[param.id] = Math.max(param.min ?? 1, Math.min(param.max ?? 64, Math.round(value)));
      }
    }

    this.loadStructure(structure, params);
    return true;
  }

  // --- Prompt Parsing & Parameter Extraction ---
  handleAgentPrompt(promptText) {
    if (!promptText || typeof promptText !== 'string') return false;
    const parsed = this.parsePromptParameters(promptText);
    if (!parsed) return false;

    this.loadStructure(parsed.structure, parsed.extractedParams);
    return true;
  }

  /**
   * Parse a parametric prompt into a library structure plus parameter values.
   *
   * Returns null when the prompt is not a parametric structure request, so the
   * caller can hand it to the language model instead. This matters: the parser
   * used to fall back to `stairs` for anything it did not recognise, which meant
   * every prompt — including free-form or non-English ones — was silently
   * answered with a staircase and the agent never reached the model at all.
   */
  parsePromptParameters(promptText) {
    const raw = String(promptText || '').trim();
    if (!raw) return null;
    const p = raw.toLowerCase();

    // 1. Identify structure by name or id.
    let matchedStructure = null;
    const allStructures = StructureLibrary.getAllStructures();

    for (const st of allStructures) {
      if (p.includes(st.name.toLowerCase()) || p.includes(st.id.toLowerCase())) {
        matchedStructure = st;
        break;
      }
    }

    // Keyword fallbacks. Deliberately no catch-all default.
    if (!matchedStructure) {
      if (p.includes('stair') || p.includes('step')) matchedStructure = StructureLibrary.getStructure('stairs');
      else if (p.includes('aquarium') || p.includes('fish tank')) matchedStructure = StructureLibrary.getStructure('aquarium');
      else if (p.includes('skyscraper') || p.includes('highrise')) matchedStructure = StructureLibrary.getStructure('skyscraper');
      else if (p.includes('pyramid') || p.includes('temple')) matchedStructure = StructureLibrary.getStructure('pyramid');
      else if (p.includes('castle') || p.includes('fortress')) matchedStructure = StructureLibrary.getStructure('castle');
      else if (p.includes('house') || p.includes('cottage') || p.includes('cabin')) matchedStructure = StructureLibrary.getStructure('cozy_house');
      else if (p.includes('watchtower') || p.includes('tower')) matchedStructure = StructureLibrary.getStructure('watchtower');
      else if (p.includes('greenhouse') || p.includes('conservatory')) matchedStructure = StructureLibrary.getStructure('greenhouse');
      else if (p.includes('spaceship') || p.includes('ufo') || p.includes('saucer')) matchedStructure = StructureLibrary.getStructure('spaceship');
    }

    // 2. Extract parameters (explicit, variable, numeric)
    const extractedParams = {};

    // Initialize with default parameters of the structure
    if (Array.isArray(matchedStructure?.parameters)) {
      for (const param of matchedStructure.parameters) {
        extractedParams[param.id] = param.default;
      }
    }

    // Pattern A: "with a <param> parameter" (e.g. "with a height parameter")
    const explicitParamRegex = /(?:with\s+(?:a\s+|an\s+)?)([a-zA-Z_]+)(?:\s+parameter)/gi;
    let match;
    while ((match = explicitParamRegex.exec(p)) !== null) {
      const paramName = match[1].toLowerCase();
      const targetParam = this.findParamInStructure(matchedStructure, paramName);
      if (targetParam) {
        extractedParams[targetParam.id] = targetParam.default;
      }
    }

    // Pattern B: "with [a] <param> <SYMBOL>" (e.g. "with a height H", "with height H and width W")
    const symbolParamRegex = /(?:with\s+)?([a-zA-Z_]+)\s+([A-Z])\b/g;
    while ((match = symbolParamRegex.exec(raw)) !== null) {
      const paramName = match[1].toLowerCase();
      const targetParam = this.findParamInStructure(matchedStructure, paramName);
      if (targetParam) {
        extractedParams[targetParam.id] = targetParam.default;
      }
    }

    // Pattern C: Numeric values (e.g. "height 12", "with a height of 10", "width: 14", "floors = 8")
    const numericRegex = /([a-zA-Z_]+)\s*(?:of|:|=)?\s*(\d+)/gi;
    while ((match = numericRegex.exec(p)) !== null) {
      const key = match[1].toLowerCase();
      const val = parseInt(match[2], 10);
      const targetParam = this.findParamInStructure(matchedStructure, key);
      if (targetParam && Number.isFinite(val)) {
        extractedParams[targetParam.id] = Math.max(targetParam.min ?? 1, Math.min(targetParam.max ?? 64, val));
      }
    }

    // 3. Decide whether this is really a parametric request.
    //
    // The prompt must name a structure AND signal a parameter, otherwise it is
    // left to the language model. Naming a structure with a number (for example
    // "build an aquarium with width 14") counts as a signal even when the
    // structure itself was not recognised by name.
    if (!matchedStructure) return null;

    const mentionedParam = Array.isArray(matchedStructure.parameters)
      ? matchedStructure.parameters.some(param => this.findParamInStructure(matchedStructure, param.id) === param
        && new RegExp(`\\b${param.id}\\b`, 'i').test(p))
      : false;
    const parameterCue = /\bparam(?:eter|s)?\b/.test(p)
      || /\bheight\s+[a-z]\b/i.test(raw)
      || /\b(with|using)\b[^.]*\b\d+\b/i.test(raw)
      || /\b(of|:|=)\s*\d+\b/.test(p)
      || mentionedParam;

    if (!parameterCue) return null;

    return {
      structure: matchedStructure,
      extractedParams
    };
  }

  findParamInStructure(structure, name) {
    if (!structure || !Array.isArray(structure.parameters)) return null;
    const n = name.toLowerCase();
    for (const p of structure.parameters) {
      if (p.id.toLowerCase() === n || p.name.toLowerCase() === n || (p.symbol && p.symbol.toLowerCase() === n)) {
        return p;
      }
      if (n.includes(p.id.toLowerCase()) || p.id.toLowerCase().includes(n)) {
        return p;
      }
    }
    return null;
  }

  // --- Loading Structure & Parameters into Studio ---
  loadStructure(structure, initialParams = {}) {
    if (!structure) return;
    this.currentStructure = structure;
    this.currentParameters = {};
    this.isCustomVoxelBuild = false;
    this.customBuildBlocks = [];
    this.customBuildName = null;

    if (Array.isArray(structure.parameters)) {
      for (const p of structure.parameters) {
        this.currentParameters[p.id] = initialParams[p.id] !== undefined ? initialParams[p.id] : p.default;
      }
    }

    if (this.structureNameBadge) {
      this.structureNameBadge.textContent = structure.name;
    }

    this.renderParameterPanel();
    this.rebuildCurrentStructure();
  }

  // --- Render Parameter Panel ---
  renderParameterPanel() {
    if (!this.controlsContainer) return;
    this.controlsContainer.innerHTML = '';

    if (!this.currentStructure || !Array.isArray(this.currentStructure.parameters) || this.currentStructure.parameters.length === 0) {
      this.renderEmptyPanel();
      return;
    }

    for (const param of this.currentStructure.parameters) {
      const paramRow = document.createElement('div');
      paramRow.className = 'studio-param-row';

      const labelGroup = document.createElement('div');
      labelGroup.className = 'studio-param-label-group';

      const label = document.createElement('span');
      label.className = 'studio-param-label';
      label.textContent = param.symbol ? `${param.name} (${param.symbol})` : param.name;

      const valBadge = document.createElement('span');
      valBadge.className = 'studio-param-badge';
      valBadge.id = `studio-val-badge-${param.id}`;
      valBadge.textContent = String(this.currentParameters[param.id]);

      labelGroup.appendChild(label);
      labelGroup.appendChild(valBadge);

      const controlGroup = document.createElement('div');
      controlGroup.className = 'studio-param-controls-group';

      // Range Slider
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'studio-slider';
      slider.min = param.min !== undefined ? param.min : 1;
      slider.max = param.max !== undefined ? param.max : 50;
      slider.step = param.step !== undefined ? param.step : 1;
      slider.value = this.currentParameters[param.id];

      // Number Input
      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.className = 'studio-num-input';
      numInput.min = slider.min;
      numInput.max = slider.max;
      numInput.step = slider.step;
      numInput.value = slider.value;

      const updateValue = (newVal) => {
        const parsed = Math.max(Number(slider.min), Math.min(Number(slider.max), Number(newVal)));
        this.currentParameters[param.id] = parsed;
        slider.value = parsed;
        numInput.value = parsed;
        valBadge.textContent = String(parsed);
        this.rebuildCurrentStructure();
      };

      slider.addEventListener('input', (e) => {
        updateValue(e.target.value);
      });

      numInput.addEventListener('change', (e) => {
        updateValue(e.target.value);
      });

      controlGroup.appendChild(slider);
      controlGroup.appendChild(numInput);

      paramRow.appendChild(labelGroup);
      paramRow.appendChild(controlGroup);
      this.controlsContainer.appendChild(paramRow);
    }
  }

  renderEmptyPanel() {
    if (!this.controlsContainer) return;
    this.controlsContainer.innerHTML = `
      <div class="studio-empty-params">
        <span class="studio-empty-icon">✦</span>
        <p>No parameters yet.</p>
        <small>Ask the Agent in the terminal to build a structure with parameters, e.g.:<br>
        <em>"build a stair with a height parameter"</em><br>
        <em>"build a stair with a height H"</em><br>
        <em>"build an aquarium with width 14 and height 8"</em></small>
      </div>
    `;
    if (this.structureNameBadge) {
      this.structureNameBadge.textContent = 'No Structure';
    }
  }

  // --- Live Re-Building Structure ---
  rebuildCurrentStructure() {
    if (!this.currentStructure || typeof this.currentStructure.generate !== 'function') return;

    // 1. Clear previous voxels
    if (this.game.world) {
      for (const v of this.placedVoxels) {
        // Revert to original block (air, or ground level bedrock/dirt/grass)
        const groundId = v.y === 0 ? BLOCKS.BEDROCK : (v.y <= 3 ? BLOCKS.DIRT : (v.y === 4 ? BLOCKS.GRASS : BLOCKS.AIR));
        this.game.world.setVoxel(v.x, v.y, v.z, groundId);
      }
    }
    this.placedVoxels = [];

    // 2. Generate new voxels with current parameters
    const origin = { x: this.buildOrigin.x, y: this.buildOrigin.y, z: this.buildOrigin.z };
    const newBlocks = this.currentStructure.generate(origin, this.currentParameters, BLOCKS) || [];

    // 3. Place new voxels in the world
    if (this.game.world) {
      for (const b of newBlocks) {
        this.game.world.setVoxel(b.x, b.y, b.z, b.id);
        this.placedVoxels.push({ x: b.x, y: b.y, z: b.z });
      }
    }

    // 4. Refresh dirty chunks so changes appear instantly
    if (typeof this.game.loadChunksAroundPlayer === 'function') {
      this.game.loadChunksAroundPlayer();
    }
    if (typeof this.game.refreshDirtyChunks === 'function') {
      this.game.refreshDirtyChunks(16);
    }
  }

  /**
   * Remove the open structure from the preview and reset the panel.
   *
   * Used when the player asks to destroy or clear the structure they are editing:
   * the studio edits a live library instance, so there are no recorded "before"
   * blocks to restore — reverting the blocks this session placed is the
   * equivalent operation.
   */
  clearCurrentStructure() {
    if (Array.isArray(this.placedVoxels) && this.game?.world?.setVoxel) {
      for (const v of this.placedVoxels) {
        const groundId = v.y === 0 ? BLOCKS.BEDROCK : (v.y <= 3 ? BLOCKS.DIRT : (v.y === 4 ? BLOCKS.GRASS : BLOCKS.AIR));
        this.game.world.setVoxel(v.x, v.y, v.z, groundId);
      }
    }
    this.placedVoxels = [];
    this.currentStructure = null;
    this.currentParameters = {};

    if (this.controlsContainer) this.controlsContainer.innerHTML = '';
    if (this.structureNameBadge) this.structureNameBadge.textContent = 'No structure open';
    this.renderEmptyPanel?.();

    if (typeof this.game?.refreshDirtyChunks === 'function') this.game.refreshDirtyChunks(24);
    else if (typeof this.game?.loadChunksAroundPlayer === 'function') this.game.loadChunksAroundPlayer();

    return true;
  }

  // --- Save to Structure Library Modal ---
  showSaveModal() {
    if (!this.currentStructure && !this.isCustomVoxelBuild && (!this.placedVoxels || this.placedVoxels.length === 0)) {
      alert('Please prompt or open a structure first before saving.');
      return;
    }
    if (this.saveConflictMsg) {
      this.saveConflictMsg.classList.add('hidden');
      this.saveConflictMsg.textContent = '';
    }
    if (this.saveInput) {
      const defaultName = this.customBuildName || (this.currentStructure?.isBuiltin ? `Custom ${this.currentStructure.name}` : (this.currentStructure?.name || ''));
      this.saveInput.value = defaultName;
    }
    if (this.saveModal) {
      this.saveModal.classList.remove('hidden');
      this.saveInput?.focus();
    }
  }

  hideSaveModal() {
    if (this.saveModal) {
      this.saveModal.classList.add('hidden');
    }
  }

  confirmSave() {
    const name = this.saveInput ? this.saveInput.value.trim() : '';
    if (!name) {
      if (this.saveConflictMsg) {
        this.saveConflictMsg.textContent = 'Please enter a name for the structure.';
        this.saveConflictMsg.classList.remove('hidden');
      }
      return;
    }

    // Check if structure of the same name already exists
    let overwrite = false;
    const existing = StructureLibrary.getStructure(name);
    if (existing) {
      if (existing.isBuiltin) {
        if (this.saveConflictMsg) {
          this.saveConflictMsg.textContent = `Cannot overwrite built-in structure "${name}". Please choose a different name.`;
          this.saveConflictMsg.classList.remove('hidden');
        }
        return;
      }
      const wantsOverwrite = typeof confirm === 'function'
        ? confirm(`A structure named "${name}" already exists. Do you want to overwrite it?`)
        : false;
      if (!wantsOverwrite) {
        if (this.saveConflictMsg) {
          this.saveConflictMsg.textContent = `A structure named "${name}" already exists. Please choose a different name or confirm overwrite.`;
          this.saveConflictMsg.classList.remove('hidden');
        }
        return;
      }
      overwrite = true;
    }

    let code = '';
    let parameters = [];
    let icon = this.currentStructure?.icon || '/assets/blocks/crafting_table_top.png';
    let description = `Custom ${name} structure`;

    const isParametric = !this.isCustomVoxelBuild &&
      this.currentStructure &&
      !this.currentStructure.isCustom &&
      typeof this.currentStructure.code === 'string' &&
      this.currentStructure.code.trim().length > 0 &&
      Array.isArray(this.currentStructure.parameters) &&
      this.currentStructure.parameters.length > 0;

    if (isParametric) {
      code = this.currentStructure.code;
      parameters = (this.currentStructure.parameters || []).map(p => ({
        ...p,
        default: this.currentParameters[p.id] !== undefined ? this.currentParameters[p.id] : p.default
      }));
      description = `Custom ${name} with ${parameters.length} parameters`;
    } else {
      const voxels = this.captureCurrentVoxels();
      if (voxels.length > 0) {
        code = this.generateCodeFromVoxels(voxels, this.buildOrigin);
        parameters = [];
        description = `Custom ${name} (${voxels.length} voxels)`;
      } else if (this.currentStructure?.code) {
        code = this.currentStructure.code;
        parameters = this.currentStructure.parameters || [];
      }
    }

    // Save with StructureLibrary
    const result = StructureLibrary.saveStructure({
      name,
      parameters,
      code,
      icon,
      description
    }, overwrite);

    if (!result.success) {
      if (this.saveConflictMsg) {
        this.saveConflictMsg.textContent = result.message;
        this.saveConflictMsg.classList.remove('hidden');
      }
      return;
    }

    this.hideSaveModal();
    if (this.structureNameBadge) {
      this.structureNameBadge.textContent = name;
    }
    this.currentStructure = result.structure;
    this.isCustomVoxelBuild = false;

    const actionText = result.overwritten ? 'overwritten in' : 'saved to';
    this.game.ui?.addChatMessage?.(
      `<span style="color:#10b981;font-weight:bold;">✦ Structure "${name}" successfully ${actionText} Structure Library!</span>`
    );
  }

  // --- Open Structure Library Modal ---
  showOpenModal() {
    if (this.openModal) {
      this.openModal.classList.remove('hidden');
      if (this.openSearch) this.openSearch.value = '';
      this.updateRestoreButtonVisibility();
      this.renderOpenStructureList('');
    }
  }

  hideOpenModal() {
    if (this.openModal) {
      this.openModal.classList.add('hidden');
    }
  }

  updateRestoreButtonVisibility() {
    if (this.btnRestoreDefaults) {
      if (StructureLibrary.hasDeletedOrRenamedDefaults?.()) {
        this.btnRestoreDefaults.classList.remove('hidden');
      } else {
        this.btnRestoreDefaults.classList.add('hidden');
      }
    }
  }

  renderOpenStructureList(query = '') {
    if (!this.openList) return;
    this.openList.innerHTML = '';
    this.updateRestoreButtonVisibility();

    const q = query.trim().toLowerCase();
    const allStructures = StructureLibrary.getAllStructures();
    const filtered = q
      ? allStructures.filter(s => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
      : allStructures;

    if (filtered.length === 0) {
      this.openList.innerHTML = '<div class="studio-open-empty">No structures found matching search.</div>';
      return;
    }

    for (const st of filtered) {
      const card = document.createElement('div');
      card.className = 'studio-open-card';

      const iconImg = document.createElement('img');
      iconImg.className = 'studio-open-card-icon';
      iconImg.src = st.icon || '/assets/blocks/crafting_table_top.png';
      iconImg.alt = st.name;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'studio-open-card-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'studio-open-card-name';
      nameEl.textContent = st.name;
      nameEl.title = 'Double-click to rename';
      nameEl.style.cursor = 'pointer';

      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (nameEl.querySelector('input')) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mc-input-text studio-rename-input';
        input.value = st.name;

        // Prevent events from bubbling to cards or parent modals
        input.addEventListener('click', (ev) => ev.stopPropagation());
        input.addEventListener('mousedown', (ev) => ev.stopPropagation());
        input.addEventListener('dblclick', (ev) => ev.stopPropagation());
        input.addEventListener('keyup', (ev) => ev.stopPropagation());

        let committed = false;
        const finish = (commit) => {
          if (committed) return;
          committed = true;
          if (!commit) {
            nameEl.textContent = st.name;
            return;
          }
          const newName = input.value.trim();
          if (!newName) {
            if (typeof alert === 'function') alert('Please enter a structure name.');
            nameEl.textContent = st.name;
            return;
          }
          if (newName === st.name) {
            nameEl.textContent = st.name;
            return;
          }
          const res = StructureLibrary.renameStructure(st.id, newName);
          if (res.success) {
            st.name = newName;
            nameEl.textContent = newName;
            if (this.currentStructure?.id === st.id) {
              this.currentStructure.name = newName;
              if (this.structureNameBadge) this.structureNameBadge.textContent = newName;
            }
            this.game.ui?.addChatMessage?.(
              `<span style="color:#10b981;font-weight:bold;">✦ Renamed structure to "${newName}"!</span>`
            );
            this.updateRestoreButtonVisibility();
          } else {
            if (typeof alert === 'function') alert(res.message || 'Failed to rename structure.');
            nameEl.textContent = st.name;
          }
        };

        input.addEventListener('keydown', (ke) => {
          ke.stopPropagation();
          if (ke.key === 'Enter') {
            ke.preventDefault();
            finish(true);
          } else if (ke.key === 'Escape') {
            ke.preventDefault();
            finish(false);
          }
        });

        input.addEventListener('blur', () => {
          finish(true);
        });

        nameEl.innerHTML = '';
        nameEl.appendChild(input);
        input.focus();
        input.select();
      });

      const descEl = document.createElement('div');
      descEl.className = 'studio-open-card-desc';
      descEl.textContent = st.description || '';

      const paramCount = Array.isArray(st.parameters) ? st.parameters.length : 0;
      const metaEl = document.createElement('div');
      metaEl.className = 'studio-open-card-meta';
      metaEl.textContent = `${paramCount} Parameter${paramCount === 1 ? '' : 's'}`;

      infoDiv.appendChild(nameEl);
      infoDiv.appendChild(descEl);
      infoDiv.appendChild(metaEl);

      const btnOpenThis = document.createElement('button');
      btnOpenThis.type = 'button';
      btnOpenThis.className = 'mc-btn studio-btn-card-load';
      btnOpenThis.textContent = 'Open';
      btnOpenThis.title = `Open "${st.name}" in studio`;
      btnOpenThis.onclick = () => {
        this.hideOpenModal();
        this.loadStructure(st);
        this.game.ui?.addChatMessage?.(
          `<span style="color:#38bdf8;font-weight:bold;">✦ Loaded structure "${st.name}" into Structure Studio!</span>`
        );
      };

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'mc-btn studio-btn-card-delete';
      btnDelete.textContent = 'Delete';
      btnDelete.disabled = false;
      btnDelete.title = `Delete "${st.name}" from the library`;
      btnDelete.onclick = (e) => {
        e.stopPropagation();
        showConfirmDialog({
          title: '⚠️ Confirm Deletion',
          message: `Are you sure you want to delete "${st.name}"? This cannot be undone.`,
          confirmText: 'Yes, Delete',
          cancelText: 'Cancel',
          onConfirm: () => {
            const removed = StructureLibrary.deleteStructure(st.id);
            if (removed) {
              if (this.currentStructure?.id === st.id) {
                this.clearCurrentStructure();
              }
              this.game?.ui?.addChatMessage?.(
                `<span style="color:#38bdf8;font-weight:bold;">✦ Deleted "${st.name}" from the structure library.</span>`
              );
            } else {
              this.game?.ui?.addChatMessage?.(
                `<span style="color:#ef4444;font-weight:bold;">✦ Could not delete "${st.name}".</span>`
              );
            }
            this.renderOpenStructureList(query);
          }
        });
      };

      card.appendChild(iconImg);
      card.appendChild(infoDiv);
      card.appendChild(btnOpenThis);
      card.appendChild(btnDelete);

      this.openList.appendChild(card);
    }
  }
}

export default StructureStudioManager;
/**
 * The name `main.js` imports.
 *
 * The building/structure rename reached `main.js` before it reached this file, so `main.js` imported
 * `BuildingStudioManager` from a module that exports `StructureStudioManager` and the game failed to load.
 * Both spellings are the same class; this is the alias, not a second implementation. See
 * `buildingLibrary.js` for the same situation one module over.
 */
export { StructureStudioManager as BuildingStudioManager };
