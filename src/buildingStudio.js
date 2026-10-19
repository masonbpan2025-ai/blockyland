import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { BuildingLibrary } from './buildingLibrary.js';
import { showConfirmDialog } from './dialogUtils.js';
import { CanonicalBlockState, CanonicalStructure, CanonicalRegion, AIR } from './io/canonical.js';
import { readSpongeSchematic, writeSpongeSchematic } from './io/codecs.js';
import { blockIdToCanonicalState, canonicalStateToBlockId, gameBlockFromState } from './io/gameBlockStates.js';
import { JAVA_1_21_4_BLOCKS } from './io/java1214Blocks.js';
import { encodeNbtJson, decodeNbtJson } from './io/nbtJson.js';
import { worldRequestFor, chestSnapshot, chestBlockEntityForExport, isChest } from './io/blockEntityGame.js';
import {
  SchematicWatcher, DevServerSchematicSource, DirectorySchematicSource,
  saveFolderHandle, loadFolderHandle, canPickFolder
} from './studioSchematicWatch.js';

// Block states <-> game blocks now live in io/gameBlockStates.js; re-exported so existing callers keep working.
export { blockIdToCanonicalState, canonicalStateToBlockId };

const ACTIVE_FILE_KEY = 'minecraft_studio_active_schem_v1';
const FILE_BUILDINGS_KEY = 'minecraft_studio_file_buildings_v1';

/**
 * The generator code a voxel building is stored as. `packed` rows are [dx, dy, dz, id], then optionally a
 * stateIndex into `states` (-1 for none) and a blockEntityIndex into `blockEntities`. A block that came from a
 * .schem keeps its exact Minecraft state (written back on export, its facing shown in the world) and its block
 * entity: sign text, chest contents, banner patterns, as `{ id, data, types }` with `data` in nbtJson form.
 * `entities` (mobs, armor stands, item frames...) are not tied to a block: they are stored beside the blocks as
 * `{ x, y, z, nbt, types }` relative to the origin, and `generate.entities(origin)` lists them for export.
 */
export function voxelGeneratorCode(packed, states = [], blockEntities = [], entities = []) {
  const entityCode = entities.length ? `
const M = ${JSON.stringify(entities)};
generate.entities = (origin) => M.map((e) => ({ ...e, x: origin.x + e.x, y: origin.y + e.y, z: origin.z + e.z }));` : '';
  return `
const S = ${JSON.stringify(states)};
const E = ${JSON.stringify(blockEntities)};
const V = ${JSON.stringify(packed)};
function generate(origin, params, B) {
  const res = [];
  for (let i = 0; i < V.length; i++) {
    const item = V[i];
    const block = { x: origin.x + item[0], y: origin.y + item[1], z: origin.z + item[2], id: item[3] };
    if (item.length > 4 && item[4] >= 0) block.state = S[item[4]];
    if (item.length > 5) block.blockEntity = E[item[5]];
    res.push(block);
  }
  return res;
}${entityCode}
`.trim();
}

/** Pack voxels for `voxelGeneratorCode`, interning their state strings. */
function packVoxels(voxels, origin) {
  const states = [];
  const stateIndex = new Map();
  const blockEntities = [];
  const entityIndex = new Map();
  const packed = voxels.map((b) => {
    const row = [b.x - origin.x, b.y - origin.y, b.z - origin.z, b.id];
    if (b.state) {
      if (!stateIndex.has(b.state)) { stateIndex.set(b.state, states.length); states.push(b.state); }
      row.push(stateIndex.get(b.state));
    }
    if (b.blockEntity) {
      if (row.length === 4) row.push(-1);
      const key = JSON.stringify(b.blockEntity);
      if (!entityIndex.has(key)) { entityIndex.set(key, blockEntities.length); blockEntities.push(b.blockEntity); }
      row.push(entityIndex.get(key));
    }
    return row;
  });
  return { packed, states, blockEntities };
}

/**
 * A block's block-entity data as a building stores it. `types` keeps only the paths this entity uses, from the
 * file-wide map the reader collected, so a byte stays a byte when it is exported again.
 */
function storedBlockEntity(nbt, nbtTypes) {
  const { id = null, ...data } = nbt;
  const roots = new Set(Object.keys(data));
  const types = {};
  for (const [path, type] of Object.entries(nbtTypes ?? {})) if (roots.has(path.split(/[.[]/)[0])) types[path] = type;
  return { id, data: encodeNbtJson(data), ...(Object.keys(types).length ? { types } : {}) };
}

const parsedStates = new Map();
function parseState(text) {
  let state = parsedStates.get(text);
  if (!state) {
    try { state = CanonicalBlockState.parse(text); } catch { state = null; }
    parsedStates.set(text, state);
  }
  return state;
}

/** `My Castle.schem` and `my castle` both become `my_castle.schem`. */
export function schematicFilename(name) {
  const base = String(name || '')
    .replace(/\.schem$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base || 'building'}.schem`;
}

/** Read a File/Blob (or a plain byte holder) into a Uint8Array. */
async function readBytes(file) {
  if (!file) return null;
  if (file instanceof Uint8Array) return file;
  if (file.bytes instanceof Uint8Array) return file.bytes;
  if (file.data instanceof Uint8Array) return file.data;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return null;
}

const readStoredJson = (key) => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeStoredJson = (key, value) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage is a convenience; the studio still works this session */ }
};

/**
 * Building Studio is not a world: there is no terrain, only an invisible ground at this height. The cells below
 * it are solid but never drawn, so the player can stand, walk and build on it and cannot go beneath it, and
 * every building sits on or above it. The build origin (0, 5, 8) is on this ground.
 *
 * The studio edits one Sponge `.schem` file at a time (WorldEdit saves the same format). Save writes that file
 * into the studio's folder and Open loads one; the folder is then watched, and a file an AI agent rewrites on
 * disk is read back and redrawn without re-importing.
 */
export const STUDIO_GROUND_Y = 5;
const STUDIO_GRID_SIZE = 128;

export class BuildingStudioManager {
  constructor(game) {
    this.game = game;
    this.isActive = false;
    this.currentBuilding = null;
    this.currentParameters = {};
    this.placedVoxels = []; // Array of { x, y, z, prevId } to clear upon re-building
    this.buildOrigin = new THREE.Vector3(0, 5, 8); // in front of player spawn (0, 5, 0)
    this.isCustomVoxelBuild = false;
    this.customBuildBlocks = [];
    this.customBuildName = null;

    // The .schem file this studio edits and watches. `source` is the folder it lives in (dev server or a
    // directory the player picked), and `pendingFileName` remembers a name for a build that has no file yet.
    this.activeFile = null;
    this.pendingFileName = null;
    this.source = null;
    this.liveWatcher = null;
    this.liveBuildingIds = new Map(Object.entries(readStoredJson(FILE_BUILDINGS_KEY) || {}));
    this.liveFolderAction = null;
    this.liveSyncStatus = null;
    this._savePrompted = false;

    // DOM Elements
    const hasDoc = typeof document !== 'undefined';
    this.studioPanel = hasDoc ? document.getElementById('building-parameter-panel') : null;
    this.buildingNameBadge = hasDoc ? document.getElementById('studio-current-building-name') : null;
    this.filePrompt = hasDoc ? document.getElementById('studio-file-prompt') : null;
    this.filePromptTitle = hasDoc ? document.getElementById('studio-file-prompt-title') : null;
    this.filePromptText = hasDoc ? document.getElementById('studio-file-prompt-text') : null;
    this.btnSave = hasDoc ? document.getElementById('btn-studio-save') : null;
    this.btnOpen = hasDoc ? document.getElementById('btn-studio-open') : null;
    this.fileInputOpenSchem = hasDoc ? document.getElementById('input-studio-open-schem') : null;
    this.liveSyncDot = hasDoc ? document.getElementById('studio-live-dot') : null;
    this.liveSyncText = hasDoc ? document.getElementById('studio-live-text') : null;
    this.btnLiveFolder = hasDoc ? document.getElementById('btn-studio-live-folder') : null;

    this.saveModal = hasDoc ? document.getElementById('modal-save-building') : null;
    this.saveInput = hasDoc ? document.getElementById('input-save-building-name') : null;
    this.saveConflictMsg = hasDoc ? document.getElementById('save-building-conflict-msg') : null;
    this.saveHint = hasDoc ? document.getElementById('save-building-hint') : null;
    this.saveTarget = hasDoc ? document.getElementById('studio-save-target') : null;
    this.btnConfirmSave = hasDoc ? document.getElementById('btn-confirm-save-building') : null;
    this.btnCancelSave = hasDoc ? document.getElementById('btn-cancel-save-building') : null;

    this.openModal = hasDoc ? document.getElementById('modal-open-building') : null;
    this.openFileList = hasDoc ? document.getElementById('studio-open-file-list') : null;
    this.openFilesPath = hasDoc ? document.getElementById('studio-open-files-path') : null;
    this.btnOpenBrowse = hasDoc ? document.getElementById('btn-studio-open-browse') : null;
    this.openFilesPane = hasDoc ? document.getElementById('studio-open-files-pane') : null;
    this.openLibraryPane = hasDoc ? document.getElementById('studio-open-library-pane') : null;
    this.tabFiles = hasDoc ? document.getElementById('tab-studio-open-files') : null;
    this.tabLibrary = hasDoc ? document.getElementById('tab-studio-open-library') : null;
    this.openList = hasDoc ? document.getElementById('studio-open-building-list') : null;
    this.openSearch = hasDoc ? document.getElementById('input-search-open-building') : null;
    this.btnCloseOpen = hasDoc ? document.getElementById('btn-close-open-building') : null;
    this.btnRestoreDefaults = hasDoc ? document.getElementById('btn-restore-default-buildings') : null;

    if (hasDoc) this.bindEvents();
  }

  bindEvents() {
    this.btnSave?.addEventListener('click', () => {
      this.showSaveModal();
    });

    this.btnOpen?.addEventListener('click', () => {
      this.showOpenModal();
    });

    this.btnConfirmSave?.addEventListener('click', () => {
      void this.confirmSave();
    });

    this.saveInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.confirmSave();
      }
    });

    this.saveInput?.addEventListener('input', () => {
      this.updateSaveDialog();
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
        message: 'Restore all default buildings to their original names and restore any deleted defaults?',
        confirmText: 'Yes, Restore',
        cancelText: 'Cancel',
        onConfirm: () => {
          BuildingLibrary.restoreDefaults();
          this.game?.ui?.addChatMessage?.(
            '<span style="color:#10b981;font-weight:bold;">✦ Default buildings restored!</span>'
          );
          this.renderOpenBuildingList(this.openSearch?.value || '');
        }
      });
    });

    this.openSearch?.addEventListener('input', (e) => {
      this.renderOpenBuildingList(e.target.value);
    });

    this.btnLiveFolder?.addEventListener('click', () => {
      void this.liveFolderAction?.();
    });

    this.tabFiles?.addEventListener('click', () => this.switchOpenTab('files'));
    this.tabLibrary?.addEventListener('click', () => this.switchOpenTab('library'));

    this.btnOpenBrowse?.addEventListener('click', () => {
      this.fileInputOpenSchem?.click();
    });

    this.fileInputOpenSchem?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) await this.openSchematicFromFile(file);
      e.target.value = '';
    });
  }

  // --- Entering Building Studio Mode ---
  enterStudio() {
    this.isActive = true;
    this._savePrompted = false;
    // The studio starts on the file it last watched (restored by startLiveSync), not on a build left over from
    // the previous session: the world was torn down, so that build is no longer on screen.
    this.currentBuilding = null;
    this.currentParameters = {};
    this.placedVoxels = [];
    this.placedStates = new Map();
    this.placedBlockEntities = new Map();
    this.isCustomVoxelBuild = false;
    this.customBuildBlocks = [];
    this.customBuildName = null;
    this.activeFile = null;
    this.pendingFileName = null;
    if (this.game.mechanisms) {
      this.game.mechanisms.setMechanism('default', this.game);
    }
    this.game.player.gamemode = 'creative';
    this.game.worldType = 'building_studio';

    // The ground: invisible, solid, and the lowest anything can be built (world.floorY). A grid like the Mob
    // Inspector's shows where it is.
    if (this.game.world) this.game.world.floorY = STUDIO_GROUND_Y;
    this.showGroundGrid();

    // Daytime and clear skies that stay put, so the light does not change while building. The Agent Terminal's
    // time and weather requests still change them, and stick. The player's own rules come back on exit.
    this.savedGamerules = this.game.gamerules ? { ...this.game.gamerules } : null;
    this.game.gamerules = { ...(this.game.gamerules || {}), doDaylightCycle: false, doWeatherCycle: false, doMobSpawning: false };
    this.game.worldTime = 6000;
    this.game.weather?.setWeather?.('clear');

    // Stand on the ground facing the build origin at (0, 5, 8). Yaw 0 looks toward -Z, so +Z is a half turn.
    this.game.player.position.set(0.5, STUDIO_GROUND_Y, 0.5);
    this.game.player.yaw = Math.PI;
    this.game.player.pitch = 0;
    this.game.player.isFlying = false;
    if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);

    if (typeof document !== 'undefined') {
      // The studio opens docked: the panel and the terminal share a narrow left column so the structure fills
      // the rest of the screen. AI Settings expands the terminal (ui.js toggles this class).
      const modal = document.getElementById('gemini-modal');
      if (modal) {
        modal.classList.add('studio-mode');
        modal.classList.remove('studio-settings-expanded');
      }
      document.getElementById('gemini-key-drawer')?.classList.add('hidden');
      document.getElementById('gemini-toggle-key')?.setAttribute('aria-expanded', 'false');
      if (this.studioPanel) this.studioPanel.classList.remove('hidden');
      this.updateFileBadge();
    }

    if (this.game.ui?.openGeminiTerminal) {
      this.game.ui.openGeminiTerminal();
    }

    if (typeof document !== 'undefined') void this.startLiveSync();

    this.game.ui?.addChatMessage?.(
      '<span style="color:#38bdf8;font-weight:bold;">[Building Studio]</span> Ask the agent to build, then Save it as a .schem file. The studio watches that file, so an agent can edit it on disk and the build reloads here.'
    );
  }

  /** The grid marking the invisible ground, recentred under the player as they move (see update). */
  showGroundGrid() {
    const scene = this.game?.scene;
    if (!scene || typeof THREE.GridHelper !== 'function') return;
    if (!this.groundGrid) {
      // The Mob Inspector's grid colours (mobDebug.js), one line per block.
      this.groundGrid = new THREE.GridHelper(STUDIO_GRID_SIZE, STUDIO_GRID_SIZE, 0x66758b, 0x435269);
      this.groundGrid.name = 'building-studio-ground';
      for (const material of [].concat(this.groundGrid.material)) {
        material.transparent = true;
        material.opacity = 0.55;
        material.depthWrite = false;
      }
    }
    this.groundGrid.position.set(0, STUDIO_GROUND_Y + 0.002, 0);
    if (!this.groundGrid.parent) scene.add(this.groundGrid);
  }

  hideGroundGrid() {
    this.groundGrid?.parent?.remove(this.groundGrid);
  }

  /** Keep the grid under the player, in whole-block steps so its lines stay on block edges. */
  update() {
    if (!this.isActive || !this.groundGrid) return;
    const p = this.game?.player?.position;
    if (!p) return;
    const step = 8;
    this.groundGrid.position.x = Math.round(p.x / step) * step;
    this.groundGrid.position.z = Math.round(p.z / step) * step;
  }

  exitStudio() {
    const wasActive = this.isActive;
    this.isActive = false;
    this.stopLiveSync();
    this.source = null;
    this.hideGroundGrid();
    if (this.game?.world) this.game.world.floorY = -Infinity;
    if (wasActive && this.savedGamerules !== undefined) {
      if (this.savedGamerules) this.game.gamerules = this.savedGamerules;
      else delete this.game.gamerules;
      this.savedGamerules = undefined;
    }
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('gemini-modal');
      if (modal) {
        modal.classList.remove('studio-mode');
        modal.classList.remove('studio-settings-expanded');
      }
      if (this.studioPanel) {
        this.studioPanel.classList.add('hidden');
      }
    }
  }

  /**
   * Adopt a building the language model built, so it becomes the studio's build to save.
   *
   * Called after the agent runs a plan while Building Studio is open. The building is not associated with a
   * file yet, so this also prompts for one: the file is what the studio watches from then on.
   *
   * @returns {boolean} true when a library building was adopted
   */
  adoptCustomBuild({ name, blocks, plan }) {
    this.isCustomVoxelBuild = true;
    this.customBuildBlocks = Array.isArray(blocks) ? [...blocks] : [];
    this.customBuildName = name || 'Custom Building';
    this.placedVoxels = (blocks || []).map(b => ({ x: b.x, y: b.y, z: b.z, prevId: b.prevId }));
    this.currentBuilding = {
      id: `custom_${(name || 'building').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      name: name || 'Custom Building',
      isCustom: true,
      parameters: [],
      icon: '/assets/blocks/crafting_table_top.png'
    };
    this.currentParameters = {};

    this.updateFileBadge();
    this.maybePromptSaveFile();
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
            const state = this.placedStates?.get(`${v.x},${v.y},${v.z}`);
            const placedEntity = this.placedBlockEntities?.get(`${v.x},${v.y},${v.z}`);
            blocks.push({
              x: v.x, y: v.y, z: v.z, id,
              ...(state ? { state } : {}),
              ...(placedEntity && placedEntity.blockId === id ? { blockEntity: placedEntity.blockEntity } : {})
            });
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

  getActiveVoxels() {
    let voxels = this.captureCurrentVoxels();
    const orig = this.buildOrigin || { x: 0, y: STUDIO_GROUND_Y, z: 8 };
    if ((!voxels || voxels.length === 0) && this.currentBuilding && typeof this.currentBuilding.generate === 'function') {
      const generated = this.currentBuilding.generate(orig, this.currentParameters || {}, BLOCKS) || [];
      voxels = generated.map(b => ({
        x: b.x !== undefined ? b.x : (orig.x + (b.dx || 0)),
        y: b.y !== undefined ? b.y : (orig.y + (b.dy || 0)),
        z: b.z !== undefined ? b.z : (orig.z + (b.dz || 0)),
        id: b.id,
        ...(b.state ? { state: b.state } : {}),
        ...(b.blockEntity ? { blockEntity: b.blockEntity } : {})
      }));
    }
    return (voxels || []).filter(v => v && v.id !== undefined && v.id !== BLOCKS.AIR);
  }

  /**
   * The Minecraft state to export for one voxel. A block that came from a .schem and has not changed since writes
   * its original state back exactly; anything else is described from its id and the orientation the world stores.
   */
  exportStateOf(voxel) {
    if (voxel.state) {
      const parsed = parseState(voxel.state);
      if (parsed && gameBlockFromState(parsed).id === voxel.id) return parsed;
    }
    return blockIdToCanonicalState(voxel.id, this.storedOrientationAt(voxel.x, voxel.y, voxel.z, voxel.id));
  }

  /**
   * The orientation the world stores for a block. A door keeps it on its lower half and a bed on its foot, so the
   * other half asks its partner, and both halves export facing the same way.
   */
  storedOrientationAt(x, y, z, id) {
    const orientations = this.game?.world?.structureOrientations;
    if (!orientations?.get) return null;
    const own = orientations.get(`${x},${y},${z}`);
    if (own) return own;
    const def = BLOCK_DEFS[id];
    if (def?.door && def.isTop) return orientations.get(`${x},${y - 1},${z}`) ?? null;
    if (def?.bed && def.isHead) {
      const steps = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
      for (const [facing, [dx, dz]] of Object.entries(steps)) {
        const foot = orientations.get(`${x - dx},${y},${z - dz}`);
        if (foot?.facing === facing) return foot;
      }
    }
    return null;
  }

  /** The chest manager's chest at a spot, if the game has one there. */
  chestAt(x, y, z) {
    const chests = this.game?.chestManager ?? this.game?.world?.chestManager;
    return chests?.getChest?.(x, y, z) ?? null;
  }

  /**
   * Serialize the open building as a WorldEdit-compatible Sponge `.schem` file.
   *
   * This is the only export path: Save writes these bytes into the studio folder. `download` keeps the old
   * browser-download behaviour for a static build with no studio folder; `announce` controls the chat log.
   */
  async exportCurrentToSchematic({ version = 3, gzipped = true, download = true, announce = true } = {}) {
    const voxels = this.getActiveVoxels();
    if (!voxels || voxels.length === 0) {
      if (announce) {
        const msg = 'No building voxels to save. Ask the agent to build something first.';
        this.game?.ui?.addChatMessage?.(`<span style="color:#ef4444;font-weight:bold;">✦ ${msg}</span>`);
        if (typeof alert === 'function') alert(msg);
      }
      return null;
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of voxels) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.z < minZ) minZ = b.z;
      if (b.x > maxX) maxX = b.x;
      if (b.y > maxY) maxY = b.y;
      if (b.z > maxZ) maxZ = b.z;
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const length = maxZ - minZ + 1;

    const canonicalBlocks = voxels.map(b => ({
      pos: { x: b.x - minX, y: b.y - minY, z: b.z - minZ },
      state: this.exportStateOf(b)
    }));

    const orig = this.buildOrigin || { x: 0, y: 5, z: 8 };
    const offsetOrigin = {
      x: minX - orig.x,
      y: minY - orig.y,
      z: minZ - orig.z
    };

    const buildingName = this.currentBuilding?.name || this.customBuildName || 'Building';
    // Stored block entities as imported; a chest whose contents the player changed is written as it is now.
    const blockEntities = [];
    for (const b of voxels) {
      let entity = null;
      if (isChest(b.id)) {
        const placed = this.placedBlockEntities?.get(`${b.x},${b.y},${b.z}`);
        entity = chestBlockEntityForExport(b.id, b.blockEntity ?? null, this.chestAt(b.x, b.y, b.z), placed?.blockId === b.id ? placed.chestSnapshot : undefined);
      } else if (b.blockEntity?.id) {
        entity = { id: b.blockEntity.id, nbt: decodeNbtJson(b.blockEntity.data ?? {}), nbtTypes: b.blockEntity.types };
      }
      if (entity) blockEntities.push({ pos: { x: b.x - minX, y: b.y - minY, z: b.z - minZ }, id: entity.id, nbt: entity.nbt, ...(entity.nbtTypes ? { nbtTypes: entity.nbtTypes } : {}) });
    }

    // Mobs, armor stands and other entities the open building came with.
    const entities = (this.currentBuilding?.generate?.entities?.(orig) ?? []).map((e) => ({
      pos: { x: e.x - minX, y: e.y - minY, z: e.z - minZ },
      nbt: decodeNbtJson(e.nbt ?? {}),
      ...(e.types ? { nbtTypes: e.types } : {})
    }));

    const region = new CanonicalRegion({
      name: 'main',
      origin: offsetOrigin,
      size: { x: width, y: height, z: length },
      blocks: canonicalBlocks,
      blockEntities,
      entities
    });

    const structure = new CanonicalStructure({
      name: buildingName,
      regions: [region],
      source: {
        format: `sponge-schem-v${version}`,
        edition: 'java',
        dataVersion: 4189,
        gameVersion: '1.21.4'
      },
      metadata: {
        author: 'Minecraft in Browser'
      }
    });

    const bytes = await writeSpongeSchematic(structure, { version, gzipped });
    // Blocks Minecraft 1.21.4 does not have (shelves, copper chests, poplar wood and the other later additions).
    // The file is still a valid schematic, but WorldEdit on 1.21.4 loads each of them as air: say so rather than
    // let a build come out with holes.
    const newerThanTarget = [...new Set(canonicalBlocks.map(b => b.state.name.replace(/^minecraft:/, '')))]
      .filter(name => name !== 'air' && !JAVA_1_21_4_BLOCKS.has(name)).sort();
    const filename = schematicFilename(buildingName);

    if (download) this.downloadSchematic(bytes, filename);

    if (announce) {
      this.game?.ui?.addChatMessage?.(
        `<span style="color:#10b981;font-weight:bold;">✦ Saved "${buildingName}" as ${filename} (WorldEdit .schem)!</span>`
      );
      if (newerThanTarget.length) {
        const shown = newerThanTarget.slice(0, 6).join(', ') + (newerThanTarget.length > 6 ? `, and ${newerThanTarget.length - 6} more` : '');
        this.game?.ui?.addChatMessage?.(
          `<span style="color:#f59e0b;">✦ ${newerThanTarget.length} block type${newerThanTarget.length === 1 ? ' is' : 's are'} newer than Minecraft 1.21.4 (${shown}). WorldEdit on 1.21.4 loads them as air; a Minecraft version that has them loads the build whole.</span>`
        );
      }
    }

    return { bytes, structure, filename, newerThanTarget };
  }

  /** Legacy alias. */
  exportSchematic(options) {
    return this.exportCurrentToSchematic(options);
  }

  /** Save a .schem through the browser's download path (a static build with no studio folder). */
  downloadSchematic(bytes, filename) {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof document.createElement !== 'function') return false;
    try {
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      if (document.body) {
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (err) {
      console.warn('Auto download failed:', err);
      return false;
    }
  }

  /**
   * Turn .schem bytes into what the Building Library stores: a name from the file, a generator over the voxels, and
   * a description. Returns null when the file holds no placeable blocks. Shared by Open, Save and live sync.
   */
  async buildingSpecFromSchematic(bytes, filename = 'imported.schem') {
    const { structure } = await readSpongeSchematic(bytes);
    if (!structure || !structure.main || !structure.main.blocks) return null;

    const rawBase = (filename || structure.name || 'imported')
      .replace(/\.schem$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    let baseName = rawBase
      ? rawBase.split(/\s+/).map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join(' ')
      : 'Imported Building';

    if (baseName.toLowerCase() === 'sponge schematic') {
      baseName = 'Imported Structure';
    }

    const region = structure.main;
    const blocks = region.blocks;
    if (!blocks || blocks.length === 0) {
      return null;
    }

    const hasCustomOrigin = region.origin && (region.origin.x !== 0 || region.origin.y !== 0 || region.origin.z !== 0);
    const centerX = Math.floor(region.size.x / 2);
    const centerZ = Math.floor(region.size.z / 2);

    const relBlocks = [];
    let minDy = Infinity;

    for (const b of blocks) {
      const { id } = gameBlockFromState(b.state);
      if (id === BLOCKS.AIR) continue;
      // Keep the file's exact state unless the id alone writes it back identically.
      const text = b.state.toString();
      const state = blockIdToCanonicalState(id).toString() === text ? null : text;

      let dx, dy, dz;
      if (hasCustomOrigin) {
        dx = b.pos.x + region.origin.x;
        dy = b.pos.y + region.origin.y;
        dz = b.pos.z + region.origin.z;
      } else {
        dx = b.pos.x - centerX;
        dy = b.pos.y;
        dz = b.pos.z - centerZ;
      }

      if (dy < minDy) minDy = dy;
      const blockEntity = b.nbt ? storedBlockEntity(b.nbt, b.nbtTypes) : null;
      relBlocks.push({ dx, dy, dz, id, state, blockEntity });
    }

    if (relBlocks.length === 0) return null;

    // Entities, moved exactly as the blocks are.
    const relEntities = (region.entities ?? []).map((e) => ({
      x: hasCustomOrigin ? e.pos.x + region.origin.x : e.pos.x - centerX,
      y: hasCustomOrigin ? e.pos.y + region.origin.y : e.pos.y,
      z: hasCustomOrigin ? e.pos.z + region.origin.z : e.pos.z - centerZ,
      nbt: encodeNbtJson(e.nbt ?? {}),
      ...(e.nbtTypes && Object.keys(e.nbtTypes).length ? { types: e.nbtTypes } : {})
    }));

    if (minDy < 0) {
      const shift = -minDy;
      for (const rb of relBlocks) {
        rb.dy += shift;
      }
      for (const e of relEntities) e.y += shift;
    }

    const { packed, states, blockEntities } = packVoxels(relBlocks.map((b) => ({ x: b.dx, y: b.dy, z: b.dz, id: b.id, state: b.state, blockEntity: b.blockEntity })), { x: 0, y: 0, z: 0 });
    const code = voxelGeneratorCode(packed, states, blockEntities, relEntities);

    // Calculate player spawn position from metadata or schematic offset:
    let playerSpawn = null;
    const meta = region.metadata || structure.metadata;
    if (Array.isArray(meta?.PlayerSpawn) && meta.PlayerSpawn.length >= 3) {
      playerSpawn = {
        x: Number(meta.PlayerSpawn[0]),
        y: Number(meta.PlayerSpawn[1]),
        z: Number(meta.PlayerSpawn[2]),
        yaw: meta.PlayerSpawn[3] !== undefined ? Number(meta.PlayerSpawn[3]) : Math.PI,
        pitch: meta.PlayerSpawn[4] !== undefined ? Number(meta.PlayerSpawn[4]) : 0
      };
    } else if (meta?.PlayerSpawn && typeof meta.PlayerSpawn === 'object') {
      playerSpawn = {
        x: Number(meta.PlayerSpawn.x ?? 0),
        y: Number(meta.PlayerSpawn.y ?? 0),
        z: Number(meta.PlayerSpawn.z ?? 0),
        yaw: meta.PlayerSpawn.yaw !== undefined ? Number(meta.PlayerSpawn.yaw) : Math.PI,
        pitch: meta.PlayerSpawn.pitch !== undefined ? Number(meta.PlayerSpawn.pitch) : 0
      };
    } else if (hasCustomOrigin) {
      playerSpawn = {
        x: -region.origin.x,
        y: -region.origin.y,
        z: -region.origin.z,
        yaw: Math.PI,
        pitch: 0
      };
    }

    let worldSpawn = null;
    if (playerSpawn) {
      const spawnDx = hasCustomOrigin ? playerSpawn.x + region.origin.x : playerSpawn.x - centerX;
      const spawnDy = (hasCustomOrigin ? playerSpawn.y + region.origin.y : playerSpawn.y) + (minDy < 0 ? -minDy : 0);
      const spawnDz = hasCustomOrigin ? playerSpawn.z + region.origin.z : playerSpawn.z - centerZ;
      const orig = this.buildOrigin || { x: 0, y: STUDIO_GROUND_Y, z: 8 };
      worldSpawn = {
        x: orig.x + spawnDx + 0.5,
        y: orig.y + spawnDy,
        z: orig.z + spawnDz + 0.5,
        yaw: playerSpawn.yaw,
        pitch: playerSpawn.pitch
      };
    }

    return {
      baseName,
      code,
      description: `Saved as ${filename} (${relBlocks.length} voxels, ${region.size.x}x${region.size.y}x${region.size.z})`,
      playerSpawn: worldSpawn
    };
  }

  // --- Save: the .schem file is the studio's document ---------------------------------------------------------

  /** A short file name for the current build, without the extension. */
  defaultSaveName() {
    const base = this.activeFile || this.pendingFileName || this.customBuildName || this.currentBuilding?.name || 'building';
    return String(base).replace(/\.schem$/i, '');
  }

  /** True when there is something that could become a .schem file. */
  hasSavableBuild() {
    return Boolean(
      (this.placedVoxels?.length)
      || (this.customBuildBlocks?.length)
      || (this.currentBuilding && typeof this.currentBuilding.generate === 'function')
    );
  }

  showSaveModal({ prompted = false } = {}) {
    if (this.saveConflictMsg) {
      this.saveConflictMsg.classList.add('hidden');
      this.saveConflictMsg.textContent = '';
    }
    if (this.saveInput) this.saveInput.value = this.defaultSaveName();
    this.updateSaveDialog();
    if (this.saveHint) {
      this.saveHint.textContent = this.hasSavableBuild()
        ? (prompted ? 'No .schem file yet: saving creates the file the studio watches.' : '')
        : 'Nothing to save yet. Ask the agent to build something, then Save.';
    }
    if (this.saveModal) {
      this.saveModal.classList.remove('hidden');
      this.saveInput?.focus();
      this.saveInput?.select?.();
    }
  }

  hideSaveModal() {
    if (this.saveModal) {
      this.saveModal.classList.add('hidden');
    }
  }

  /** The folder line under the name field: where this file will go. */
  updateSaveDialog() {
    const filename = schematicFilename(this.saveInput?.value ?? '');
    if (this.saveTarget) {
      this.saveTarget.textContent = this.source
        ? `Saves to ${this.source.label}${filename}`
        : `No studio folder yet: ${filename} downloads to your computer. Choose a folder for live sync.`;
    }
    if (this.saveHint && this.hasSavableBuild()) {
      this.saveHint.textContent = '';
    }
  }

  setSaveError(message) {
    if (!this.saveConflictMsg) return;
    this.saveConflictMsg.textContent = message;
    this.saveConflictMsg.classList.remove('hidden');
  }

  /**
   * Save the open building as `<name>.schem` in the studio folder. An existing file is only replaced after the
   * player confirms, and the file becomes the one the studio watches.
   */
  async confirmSave() {
    const raw = (this.saveInput?.value || '').trim();
    if (!raw) {
      this.setSaveError('Please enter a file name.');
      return null;
    }
    if (!this.hasSavableBuild()) {
      this.setSaveError('Nothing to save yet. Ask the agent to build something first.');
      return null;
    }
    const filename = schematicFilename(raw);

    if (await this.fileExists(filename)) {
      const overwrite = await this.askOverwrite(filename);
      if (!overwrite) {
        this.setSaveError(`"${filename}" already exists. Choose another name, or confirm overwrite.`);
        return null;
      }
    }
    return this.writeSchematicFile(filename, raw);
  }

  /** Ask before replacing an existing .schem file. Resolves true when the player confirms. */
  askOverwrite(filename) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => { if (!settled) { settled = true; resolve(value); } };
      showConfirmDialog({
        title: '⚠️ Overwrite .schem file?',
        message: `"${filename}" already exists in ${this.source?.label || 'the studio folder'}. Overwrite it with this build?`,
        confirmText: 'Yes, overwrite',
        cancelText: 'Cancel',
        onConfirm: () => done(true),
        onCancel: () => done(false)
      });
    });
  }

  async fileExists(filename) {
    const source = this.source;
    if (!source) return false;
    try {
      if (typeof source.exists === 'function') return await source.exists(filename);
      const files = await source.list();
      return files.some((f) => f.name.toLowerCase() === filename.toLowerCase());
    } catch {
      return false;
    }
  }

  /** Serialize the build and write it to the studio folder (or download it with no folder). */
  async writeSchematicFile(filename, displayName = null) {
    if (this._writingFile) return null;
    this._writingFile = true;
    try {
      const result = await this.exportCurrentToSchematic({ version: 3, gzipped: true, download: false, announce: false });
      if (!result) {
        this.setSaveError('Nothing to save yet. Ask the agent to build something first.');
        return null;
      }

      const source = this.source;
      let wroteToFolder = false;
      if (source?.write && source.writable !== false) {
        try {
          await source.write(filename, result.bytes);
          wroteToFolder = true;
        } catch (error) {
          // An already-running dev server from before this route existed answers 404/405. Save still gives the
          // player the file (a download) and says what to do, rather than failing with no way forward.
          const missingRoute = source.kind === 'dev-server' && /save failed: (404|405)/.test(error.message);
          if (!missingRoute) {
            const message = `Could not save ${filename}: ${error.message}`;
            this.setSaveError(message);
            this.setLiveStatus('warn', message, this.changeFolderButton());
            return null;
          }
          this.downloadSchematic(result.bytes, filename);
          this.game?.ui?.addChatMessage?.(
            '<span style="color:#f59e0b;">✦ The running dev server has no save route yet, so the file was downloaded. Restart npm run dev to save into the studio folder.</span>'
          );
        }
      } else {
        this.downloadSchematic(result.bytes, filename);
      }

      this.activeFile = filename;
      this.pendingFileName = null;
      this.persistActiveFile();
      this.hideSaveModal();
      // Keep the Building Library in step with the file: the same save also makes the build placeable
      // from the creative Buildings tab, as it did before the file became the studio's document.
      const library = this.saveCurrentBuildToLibrary(displayName || filename);
      if (library) {
        this.liveBuildingIds.set(filename, library.id);
        this.persistFileBuildings();
      }
      this.updateFileBadge();
      // The write is ours, not an external edit: settle it so the watcher does not reload it as a change.
      await this.liveWatcher?.settle?.(filename);

      const where = wroteToFolder ? `${source.label}${filename}` : filename;
      this.game?.ui?.addChatMessage?.(
        `<span style="color:#10b981;font-weight:bold;">✦ Saved ${where} (WorldEdit .schem).</span>${wroteToFolder ? ' <span style="color:#94a3b8;">The studio reloads it whenever it changes.</span>' : ''}`
      );
      if (wroteToFolder) this.setLiveStatus('on', `Watching ${filename}`, this.changeFolderButton());
      else this.setLiveStatus('warn', 'Saved a download; choose a folder to live-watch a .schem file', this.changeFolderButton());

      if (result.newerThanTarget?.length) {
        const shown = result.newerThanTarget.slice(0, 6).join(', ') + (result.newerThanTarget.length > 6 ? `, and ${result.newerThanTarget.length - 6} more` : '');
        this.game?.ui?.addChatMessage?.(
          `<span style="color:#f59e0b;">✦ ${result.newerThanTarget.length} block type${result.newerThanTarget.length === 1 ? ' is' : 's are'} newer than Minecraft 1.21.4 (${shown}). WorldEdit on 1.21.4 loads them as air.</span>`
        );
      }
      return filename;
    } finally {
      this._writingFile = false;
    }
  }

  /**
   * Add or update the build in the Building Library under the name that was saved, so the file save keeps the
   * library entry (and the creative Buildings tab) in step. A built-in name is never overwritten.
   */
  saveCurrentBuildToLibrary(rawName) {
    const name = String(rawName || '').replace(/\.schem$/i, '').trim();
    if (!name) return null;
    const existing = BuildingLibrary.getBuilding(name);
    if (existing?.isBuiltin) return null;

    let code = '';
    let parameters = [];
    let description = `Saved as ${schematicFilename(name)}`;
    const isParametric = !this.isCustomVoxelBuild &&
      this.currentBuilding &&
      !this.currentBuilding.isCustom &&
      typeof this.currentBuilding.code === 'string' &&
      this.currentBuilding.code.trim().length > 0 &&
      Array.isArray(this.currentBuilding.parameters) &&
      this.currentBuilding.parameters.length > 0;

    if (isParametric) {
      code = this.currentBuilding.code;
      parameters = (this.currentBuilding.parameters || []).map(p => ({
        ...p,
        default: this.currentParameters[p.id] !== undefined ? this.currentParameters[p.id] : p.default
      }));
      description = `${name} with ${parameters.length} parameters`;
    } else {
      const voxels = this.captureCurrentVoxels();
      if (voxels.length === 0) return null;
      code = this.generateCodeFromVoxels(voxels, this.buildOrigin);
      parameters = [];
      description = `${name} (${voxels.length} voxels)`;
    }

    const result = BuildingLibrary.saveBuilding({
      name,
      parameters,
      code,
      icon: this.currentBuilding?.icon || '/assets/blocks/crafting_table_top.png',
      description
    }, Boolean(existing));
    return result.success ? result.building : null;
  }

  // --- The active file, remembered across reloads -------------------------------------------------------------

  updateFileBadge() {
    if (this.buildingNameBadge) {
      if (this.activeFile) {
        this.buildingNameBadge.textContent = this.activeFile;
        this.buildingNameBadge.title = `Watching ${this.activeFile}`;
      } else if (this.currentBuilding || this.customBuildName || this.pendingFileName) {
        const name = this.customBuildName || this.currentBuilding?.name || this.pendingFileName || 'Building';
        this.buildingNameBadge.textContent = `${name} · unsaved`;
        this.buildingNameBadge.title = 'This build is not saved to a .schem file yet';
      } else {
        this.buildingNameBadge.textContent = 'No file';
        this.buildingNameBadge.title = 'The studio watches one .schem file';
      }
    }
    this.renderFilePrompt();
  }

  /** The "no file yet" prompt in the panel. */
  renderFilePrompt() {
    if (!this.filePrompt) return;
    const needsFile = !this.activeFile;
    this.filePrompt.classList.toggle('hidden', !needsFile);
    if (!needsFile) return;
    const hasBuild = this.hasSavableBuild();
    if (this.filePromptTitle) this.filePromptTitle.textContent = hasBuild ? 'Not saved to a file yet' : 'No .schem file yet';
    if (this.filePromptText) {
      this.filePromptText.textContent = hasBuild
        ? 'Click 💾 Save to write this build as a .schem file the studio will watch.'
        : 'Ask the agent to build something, then click 💾 Save. The studio watches the file you save.';
    }
  }

  persistActiveFile() {
    if (!this.activeFile) {
      writeStoredJson(ACTIVE_FILE_KEY, null);
      return;
    }
    writeStoredJson(ACTIVE_FILE_KEY, { name: this.activeFile, sourceLabel: this.source?.label || '' });
  }

  readActiveFileRecord() {
    const record = readStoredJson(ACTIVE_FILE_KEY);
    return record && typeof record.name === 'string' ? record : null;
  }

  persistFileBuildings() {
    writeStoredJson(FILE_BUILDINGS_KEY, Object.fromEntries(this.liveBuildingIds));
  }

  // --- Live .schem sync: the saved file is watched -----------------------------------------------------------

  /**
   * Start watching the studio's .schem file, so an agent rewriting it on disk redraws the build.
   *
   * Running locally, the dev server's build_studio_schematics/ folder is used with no setup. A deployed build
   * has no server, so it uses the folder the player chose last time (if the browser still allows it), or asks.
   */
  async startLiveSync() {
    this.stopLiveSync();
    this.source = null;
    const dev = new DevServerSchematicSource();
    if (await dev.probe()) {
      await this.watchSource(dev);
      await this.restoreActiveFile();
      this.updateFileBadge();
      return;
    }
    if (!canPickFolder()) {
      this.setLiveStatus('off', 'Live folder sync needs Chrome or Edge', null);
      this.updateFileBadge();
      return;
    }
    const handle = await loadFolderHandle();
    if (handle) {
      const permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
      if (permission === 'granted') {
        await this.watchSource(new DirectorySchematicSource(handle));
        await this.restoreActiveFile();
        this.updateFileBadge();
        return;
      }
      this.setLiveStatus('warn', `Live sync paused: allow access to ${handle.name}/`, {
        label: '▶ Resume',
        run: () => this.resumeLiveFolder(handle)
      });
      this.updateFileBadge();
      return;
    }
    this.setLiveStatus('warn', 'Live sync off: choose a local folder of .schem files', { label: '📁 Choose folder', run: () => this.chooseLiveFolder() });
    this.updateFileBadge();
  }

  stopLiveSync() {
    this.liveWatcher?.stop();
    this.liveWatcher = null;
  }

  /** The watcher's hook: only the studio's own .schem file is reloaded. */
  async handleWatchedFileChange(name, bytes) {
    if (!this.activeFile || String(name).toLowerCase() !== this.activeFile.toLowerCase()) return null;
    return this.applyLiveSchematic(name, bytes);
  }

  /** Ask for a folder that holds the .schem file. The picker only opens from a click. */
  async chooseLiveFolder() {
    if (!canPickFolder()) return;
    let handle;
    let writable = true;
    try {
      handle = await globalThis.showDirectoryPicker({ id: 'building-studio-schematics', mode: 'readwrite' });
    } catch (error) {
      if (error?.name === 'AbortError') return; // the player cancelled
      // A browser that cannot grant edit access can still watch a read-only folder.
      try {
        handle = await globalThis.showDirectoryPicker({ id: 'building-studio-schematics', mode: 'read' });
        writable = false;
      } catch {
        return;
      }
    }
    if (!handle) return;
    await saveFolderHandle(handle);
    await this.watchSource(new DirectorySchematicSource(handle, { writable }));
    await this.restoreActiveFile();
    this.updateFileBadge();
  }

  async resumeLiveFolder(handle) {
    let permission = await handle.requestPermission?.({ mode: 'readwrite' });
    let writable = permission === 'granted';
    if (!writable) permission = await handle.requestPermission?.({ mode: 'read' });
    if (permission === 'granted') {
      await this.watchSource(new DirectorySchematicSource(handle, { writable }));
      await this.restoreActiveFile();
      this.updateFileBadge();
    } else {
      await this.chooseLiveFolder();
    }
  }

  async watchSource(source) {
    this.stopLiveSync();
    this.source = source;
    const watcher = new SchematicWatcher({
      source,
      // Two quick polls: the file has to hold still for one interval before it is read, so an agent's write
      // lands in about a second rather than two.
      intervalMs: 500,
      // Only the studio's own file is the document. Other files an agent leaves in the folder are listed in
      // Open, but do not replace what is on screen.
      onChange: (name, bytes) => this.handleWatchedFileChange(name, bytes),
      onStatus: (status) => {
        if (status.state === 'error' && status.name) {
          this.setLiveStatus('warn', `Could not read ${status.name}: ${status.error?.message || status.error}`, this.changeFolderButton());
        }
      }
    });
    try {
      await watcher.start();
    } catch (error) {
      this.source = null;
      this.setLiveStatus('warn', `Cannot read ${source.label}: ${error.message}`, { label: '📁 Choose folder', run: () => this.chooseLiveFolder() });
      return;
    }
    this.liveWatcher = watcher;
    this.setLiveStatus('on', this.activeFile ? `Watching ${this.activeFile}` : `${source.label} · no file yet`, this.changeFolderButton());
    this.updateSaveDialog();
  }

  changeFolderButton() {
    return canPickFolder() ? { label: '📁 Change', run: () => this.chooseLiveFolder() } : null;
  }

  /** Reopen the file this studio was last editing, if it is still in the folder. */
  async restoreActiveFile() {
    const record = this.readActiveFileRecord();
    if (!record || !this.source || record.sourceLabel !== this.source.label) {
      if (record) writeStoredJson(ACTIVE_FILE_KEY, null);
      this.activeFile = null;
      this.updateFileBadge();
      return false;
    }
    let files;
    try {
      files = await this.source.list();
    } catch {
      return false;
    }
    if (!files.some((f) => f.name === record.name)) {
      writeStoredJson(ACTIVE_FILE_KEY, null);
      this.activeFile = null;
      this.updateFileBadge();
      this.setLiveStatus('warn', `${record.name} is no longer in ${this.source.label}`, this.changeFolderButton());
      return false;
    }
    try {
      await this.liveWatcher?.settle?.(record.name);
      const bytes = await this.source.read(record.name);
      await this.applyLiveSchematic(record.name, bytes, { teleportPlayer: true });
      this.setLiveStatus('on', `Watching ${record.name}`, this.changeFolderButton());
      return true;
    } catch (error) {
      this.setLiveStatus('warn', `Could not reopen ${record.name}: ${error.message}`, this.changeFolderButton());
      return false;
    }
  }

  /** Prompt for a file as soon as a build exists, so the studio always has a document to watch. */
  maybePromptSaveFile() {
    if (this.activeFile || !this.saveModal || this._savePrompted) return;
    if (!this.hasSavableBuild()) return;
    this._savePrompted = true;
    this.showSaveModal({ prompted: true });
  }

  /**
   * A watched file changed: read it, update the library building it became (or make one), and show it.
   *
   * The same file always maps to the same building, overwritten in place, so an agent's tenth rewrite does not
   * leave ten copies in the library. If that building is already on screen it is redrawn where it stands.
   */
  async applyLiveSchematic(filename, bytes, { active = true, teleportPlayer = false } = {}) {
    const spec = await this.buildingSpecFromSchematic(bytes, filename);
    if (!spec) throw new Error('no placeable blocks');

    if (active) {
      this.activeFile = filename;
      this.pendingFileName = null;
      this.persistActiveFile();
    } else {
      // Opened from the computer: remember the name so Save proposes the same .schem filename.
      this.pendingFileName = filename;
    }

    const knownId = this.liveBuildingIds.get(filename);
    const existing = knownId ? BuildingLibrary.getBuilding(knownId) : null;
    let name = existing ? existing.name : spec.baseName;
    if (!existing) {
      let counter = 2;
      while (BuildingLibrary.hasBuilding(name)) name = `${spec.baseName} (${counter++})`;
    }
    const result = BuildingLibrary.saveBuilding({
      name,
      parameters: [],
      code: spec.code,
      icon: '/assets/blocks/crafting_table_top.png',
      description: spec.description
    }, Boolean(existing));
    if (!result.success || !result.building) throw new Error(result.message || 'could not save the building');

    const building = result.building;
    this.liveBuildingIds.set(filename, building.id);
    this.persistFileBuildings();
    if (this.currentBuilding?.id === building.id) {
      this.currentBuilding = building;
      this.rebuildCurrentBuilding();
    } else {
      this.loadBuilding(building);
    }
    if (teleportPlayer && spec.playerSpawn && this.game?.player?.position) {
      this.positionPlayerForSpawn(spec.playerSpawn);
    }
    this.updateFileBadge();
    if (this.openModal && !this.openModal.classList.contains('hidden')) {
      void this.renderOpenFileList();
      this.renderOpenBuildingList(this.openSearch?.value || '');
    }
    if (active) {
      this.setLiveStatus('on', `Watching ${filename} · reloaded ${new Date().toLocaleTimeString()}`, this.changeFolderButton());
    } else {
      this.setLiveStatus('warn', `Opened ${filename}; save it into the studio folder to watch it`, this.changeFolderButton());
    }
    return building;
  }

  positionPlayerForSpawn(spawn) {
    if (!this.game?.player?.position || !spawn) return;
    let { x, y, z, yaw, pitch } = spawn;
    const world = this.game.world;
    if (world?.getVoxel) {
      const blockX = Math.floor(x);
      const blockZ = Math.floor(z);
      let blockY = Math.floor(y);
      while (blockY < 250) {
        const feet = world.getVoxel(blockX, blockY, blockZ);
        const head = world.getVoxel(blockX, blockY + 1, blockZ);
        if ((feet === undefined || feet === BLOCKS.AIR) && (head === undefined || head === BLOCKS.AIR)) {
          break;
        }
        blockY++;
      }
      y = Math.max(y, blockY);
    }
    this.game.player.position.set(x, y, z);
    if (yaw !== undefined) this.game.player.yaw = yaw;
    if (pitch !== undefined) this.game.player.pitch = pitch;
    if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);
    if (y > STUDIO_GROUND_Y + 1) {
      this.game.player.isFlying = true;
    }
  }

  setLiveStatus(tone, text, action) {
    this.liveSyncStatus = { tone, text };
    if (this.liveSyncDot) this.liveSyncDot.dataset.tone = tone;
    if (this.liveSyncText) {
      this.liveSyncText.textContent = text;
      this.liveSyncText.title = text;
    }
    this.liveFolderAction = action?.run ?? null;
    if (this.btnLiveFolder) {
      this.btnLiveFolder.classList.toggle('hidden', !action);
      if (action) this.btnLiveFolder.textContent = action.label;
    }
  }

  // --- Open: a .schem file from the studio folder, or from the computer ---------------------------------------

  showOpenModal() {
    if (!this.openModal) return;
    this.switchOpenTab('files');
    if (this.openSearch) this.openSearch.value = '';
    void this.renderOpenFileList();
    this.renderOpenBuildingList('');
    this.openModal.classList.remove('hidden');
  }

  hideOpenModal() {
    if (this.openModal) {
      this.openModal.classList.add('hidden');
    }
  }

  switchOpenTab(tab) {
    const files = tab !== 'library';
    this.tabFiles?.classList.toggle('active', files);
    this.tabLibrary?.classList.toggle('active', !files);
    this.tabFiles?.setAttribute('aria-selected', String(files));
    this.tabLibrary?.setAttribute('aria-selected', String(!files));
    this.openFilesPane?.classList.toggle('hidden', !files);
    this.openLibraryPane?.classList.toggle('hidden', files);
  }

  /** List the .schem files in the studio folder, newest first. */
  async renderOpenFileList() {
    if (!this.openFileList) return;
    const list = this.openFileList;
    list.innerHTML = '';

    if (this.openFilesPath) {
      this.openFilesPath.textContent = this.source ? this.source.label : 'No studio folder selected';
    }

    const loading = document.createElement('div');
    loading.className = 'studio-open-empty';
    loading.textContent = `Looking in ${this.source?.label || 'the studio folder'}…`;
    list.appendChild(loading);

    const emptyState = (text, withChoose) => {
      list.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'studio-open-empty';
      wrap.textContent = text;
      if (withChoose) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'mc-btn';
        choose.style.marginTop = '10px';
        choose.textContent = '📁 Choose studio folder';
        choose.onclick = () => {
          this.hideOpenModal();
          void this.chooseLiveFolder();
        };
        wrap.appendChild(document.createElement('br'));
        wrap.appendChild(choose);
      }
      list.appendChild(wrap);
    };

    if (!this.source) {
      emptyState('Choose a folder for the studio to save and watch .schem files.', canPickFolder());
      return;
    }

    let files;
    try {
      files = await this.source.list();
    } catch (error) {
      emptyState(`Could not read ${this.source.label}: ${error.message}`, false);
      return;
    }
    if (files.length === 0) {
      emptyState('No .schem files yet. Save a build to create one.', false);
      return;
    }
    list.innerHTML = '';
    files.sort((a, b) => (Number(b.mtime) || 0) - (Number(a.mtime) || 0) || a.name.localeCompare(b.name));

    for (const file of files) {
      const card = document.createElement('div');
      card.className = 'studio-open-card';

      const iconImg = document.createElement('img');
      iconImg.className = 'studio-open-card-icon';
      iconImg.src = '/assets/blocks/crafting_table_top.png';
      iconImg.alt = '';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'studio-open-card-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'studio-open-card-name';
      nameEl.textContent = file.name;
      nameEl.title = file.name;

      const metaEl = document.createElement('div');
      metaEl.className = 'studio-open-card-meta';
      const bytes = Number(file.size ?? file.stamp?.split(':')?.[1] ?? 0);
      const when = file.mtime ? new Date(Number(file.mtime)).toLocaleString() : '';
      metaEl.textContent = `${bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`}${when ? ` · ${when}` : ''}${file.name === this.activeFile ? ' · watching' : ''}`;

      const descEl = document.createElement('div');
      descEl.className = 'studio-open-card-desc';
      descEl.textContent = file.name === this.activeFile ? 'The studio reloads this file when it changes.' : '';

      infoDiv.appendChild(nameEl);
      infoDiv.appendChild(descEl);
      infoDiv.appendChild(metaEl);

      const btnOpenThis = document.createElement('button');
      btnOpenThis.type = 'button';
      btnOpenThis.className = 'mc-btn studio-btn-card-load';
      btnOpenThis.textContent = 'Open';
      btnOpenThis.title = `Open ${file.name} in the studio`;
      btnOpenThis.onclick = () => { void this.openSchematicFromSource(file.name); };

      card.appendChild(iconImg);
      card.appendChild(infoDiv);
      card.appendChild(btnOpenThis);
      list.appendChild(card);
    }
  }

  /** Open one file from the studio folder and make it the one being watched. */
  async openSchematicFromSource(filename) {
    if (!this.source) return null;
    try {
      const bytes = await this.source.read(filename);
      await this.liveWatcher?.settle?.(filename);
      const building = await this.applyLiveSchematic(filename, bytes, { teleportPlayer: true });
      this.hideOpenModal();
      this.game?.ui?.addChatMessage?.(
        `<span style="color:#38bdf8;font-weight:bold;">✦ Opened ${filename} into Building Studio (watching it for changes).</span>`
      );
      return building;
    } catch (error) {
      this.game?.ui?.addChatMessage?.(
        `<span style="color:#ef4444;font-weight:bold;">✦ Could not open ${filename}: ${error.message}</span>`
      );
      return null;
    }
  }

  /** Open a .schem from anywhere on the computer. Only a file also in the studio folder can be watched. */
  async openSchematicFromFile(file) {
    const bytes = await readBytes(file);
    if (!bytes) return null;
    const filename = file.name || 'opened.schem';
    let active = false;
    try {
      active = await this.fileExists(filename);
    } catch { active = false; }
    this.pendingFileName = filename;
    try {
      const building = await this.applyLiveSchematic(filename, bytes, { active, teleportPlayer: true });
      this.hideOpenModal();
      this.game?.ui?.addChatMessage?.(
        active
          ? `<span style="color:#38bdf8;font-weight:bold;">✦ Opened ${filename} (watching it for changes).</span>`
          : `<span style="color:#38bdf8;font-weight:bold;">✦ Opened ${filename}.</span> <span style="color:#94a3b8;">Save it into the studio folder to let an agent edit it on disk.</span>`
      );
      if (!active) this.showSaveModal({ prompted: true });
      return building;
    } catch (error) {
      this.game?.ui?.addChatMessage?.(
        `<span style="color:#ef4444;font-weight:bold;">✦ Could not open ${filename}: ${error.message}</span>`
      );
      return null;
    }
  }

  /**
   * Load one or more .schem files into the Building Library (used by the library/agent paths; the panel's Open
   * button opens a single file directly instead).
   */
  async importSchematicFiles(files) {
    if (!files) return [];
    const fileList = Array.isArray(files) ? files : (files.length !== undefined ? Array.from(files) : [files]);
    if (fileList.length === 0) return [];

    const importedBuildings = [];

    for (const file of fileList) {
      try {
        const bytes = await readBytes(file);
        if (!bytes) continue;
        const filename = file.name || file.filename || 'imported.schem';

        const spec = await this.buildingSpecFromSchematic(bytes, filename);
        if (!spec) continue;

        let candidateName = spec.baseName;
        let counter = 2;
        while (BuildingLibrary.hasBuilding(candidateName)) {
          candidateName = `${spec.baseName} (${counter++})`;
        }

        const saveRes = BuildingLibrary.saveBuilding({
          name: candidateName,
          parameters: [],
          code: spec.code,
          icon: '/assets/blocks/crafting_table_top.png',
          description: spec.description
        });

        if (saveRes.success && saveRes.building) {
          importedBuildings.push(saveRes.building);
        }
      } catch (err) {
        console.error(`Failed to import schematic ${file?.name || 'file'}:`, err);
      }
    }

    if (importedBuildings.length > 0) {
      this.game?.ui?.addChatMessage?.(
        `<span style="color:#10b981;font-weight:bold;">✦ Added ${importedBuildings.length} schematic structure(s) to the Building Library.</span>`
      );
      if (this.openModal && !this.openModal.classList.contains('hidden')) {
        this.renderOpenBuildingList(this.openSearch?.value || '');
      }
      if (this.game?.ui?.creativeModal && !this.game.ui.creativeModal.classList.contains('hidden')) {
        this.game.ui.renderCreativeItems?.();
      }
      if (importedBuildings.length === 1 && this.isActive && !this.currentBuilding) {
        this.loadBuilding(importedBuildings[0]);
      }
    }

    return importedBuildings;
  }

  async importSchematic(fileOrBytes, filename = 'imported.schem') {
    let fileObj;
    if (fileOrBytes instanceof Uint8Array || fileOrBytes instanceof ArrayBuffer) {
      fileObj = { bytes: fileOrBytes, name: filename };
    } else {
      fileObj = fileOrBytes;
    }
    const res = await this.importSchematicFiles([fileObj]);
    return res[0] || null;
  }

  generateCodeFromVoxels(blocks, origin) {
    const orig = origin || this.buildOrigin;
    const { packed, states, blockEntities } = packVoxels(blocks, orig);
    const entities = (this.currentBuilding?.generate?.entities?.(orig) ?? []).map((e) => ({ ...e, x: e.x - orig.x, y: e.y - orig.y, z: e.z - orig.z }));
    return voxelGeneratorCode(packed, states, blockEntities, entities);
  }

  adoptFromPlan(plan) {
    if (!plan || typeof plan !== 'object') return false;

    // Plans with explicit operations are custom volumetric builds, not library templates.
    if (Array.isArray(plan.operations) && plan.operations.length > 0) {
      return false;
    }

    // The structure's name arrives as `structureType` from the model and the tests, and as `buildingType`
    // or `buildingId` from the older callers. All three are accepted rather than one being renamed.
    const type = String(plan.structureType || plan.buildingType || plan.buildingId || '').toLowerCase().trim();
    if (!type) return false;

    const all = BuildingLibrary.getAllBuildings();
    const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

    // Exact id, then exact name. Decline unknown buildings without substring guessing.
    let building = BuildingLibrary.getBuilding(type);
    if (!building) building = all.find(st => norm(st.name) === norm(type));
    if (!building) {
      building = all.find(st => norm(st.id) === norm(type))
        || all.find(st => norm(st.name) === norm(type));
    }
    if (!building) return false;

    // Start from the building's own defaults and fold in anything the model
    // supplied under a recognisable name.
    const params = {};
    const supplied = { ...(plan.dimensions || {}), ...(plan.parameters || {}) };
    for (const param of building.parameters || []) {
      const wanted = param.id.toLowerCase();
      const symbol = String(param.symbol || '').toLowerCase();
      const raw = supplied[param.id] ?? supplied[wanted] ?? (symbol ? supplied[symbol] : undefined);
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) {
        params[param.id] = Math.max(param.min ?? 1, Math.min(param.max ?? 64, Math.round(value)));
      }
    }

    this.loadBuilding(building, params);
    return true;
  }

  // --- Prompt Parsing & Parameter Extraction ---
  handleAgentPrompt(promptText) {
    if (!promptText || typeof promptText !== 'string') return false;
    const parsed = this.parsePromptParameters(promptText);
    if (!parsed) return false;

    this.loadBuilding(parsed.building, parsed.extractedParams);
    return true;
  }

  /**
   * Parse a parametric prompt into a library building plus parameter values.
   *
   * Returns null when the prompt is not a parametric building request, so the
   * caller can hand it to the language model instead. This matters: the parser
   * used to fall back to `stairs` for anything it did not recognise, which meant
   * every prompt — including free-form or non-English ones — was silently
   * answered with a staircase and the agent never reached the model at all.
   */
  parsePromptParameters(promptText) {
    const raw = String(promptText || '').trim();
    if (!raw) return null;
    const p = raw.toLowerCase();

    // 1. Identify building by name or id.
    let matchedBuilding = null;
    const allBuildings = BuildingLibrary.getAllBuildings();

    for (const st of allBuildings) {
      if (p.includes(st.name.toLowerCase()) || p.includes(st.id.toLowerCase())) {
        matchedBuilding = st;
        break;
      }
    }

    // Keyword fallbacks. Deliberately no catch-all default.
    if (!matchedBuilding) {
      if (p.includes('stair') || p.includes('step')) matchedBuilding = BuildingLibrary.getBuilding('stairs');
      else if (p.includes('aquarium') || p.includes('fish tank')) matchedBuilding = BuildingLibrary.getBuilding('aquarium');
      else if (p.includes('skyscraper') || p.includes('highrise')) matchedBuilding = BuildingLibrary.getBuilding('skyscraper');
      else if (p.includes('pyramid') || p.includes('temple')) matchedBuilding = BuildingLibrary.getBuilding('pyramid');
      else if (p.includes('castle') || p.includes('fortress')) matchedBuilding = BuildingLibrary.getBuilding('castle');
      else if (p.includes('house') || p.includes('cottage') || p.includes('cabin')) matchedBuilding = BuildingLibrary.getBuilding('cozy_house');
      else if (p.includes('watchtower') || p.includes('tower')) matchedBuilding = BuildingLibrary.getBuilding('watchtower');
      else if (p.includes('greenhouse') || p.includes('conservatory')) matchedBuilding = BuildingLibrary.getBuilding('greenhouse');
      else if (p.includes('spaceship') || p.includes('ufo') || p.includes('saucer')) matchedBuilding = BuildingLibrary.getBuilding('spaceship');
    }

    // 2. Extract parameters (explicit, variable, numeric)
    const extractedParams = {};

    // Initialize with default parameters of the building
    if (Array.isArray(matchedBuilding?.parameters)) {
      for (const param of matchedBuilding.parameters) {
        extractedParams[param.id] = param.default;
      }
    }

    // Pattern A: "with a <param> parameter" (e.g. "with a height parameter")
    const explicitParamRegex = /(?:with\s+(?:a\s+|an\s+)?)([a-zA-Z_]+)(?:\s+parameter)/gi;
    let match;
    while ((match = explicitParamRegex.exec(p)) !== null) {
      const paramName = match[1].toLowerCase();
      const targetParam = this.findParamInBuilding(matchedBuilding, paramName);
      if (targetParam) {
        extractedParams[targetParam.id] = targetParam.default;
      }
    }

    // Pattern B: "with [a] <param> <SYMBOL>" (e.g. "with a height H", "with height H and width W")
    const symbolParamRegex = /(?:with\s+)?([a-zA-Z_]+)\s+([A-Z])\b/g;
    while ((match = symbolParamRegex.exec(raw)) !== null) {
      const paramName = match[1].toLowerCase();
      const targetParam = this.findParamInBuilding(matchedBuilding, paramName);
      if (targetParam) {
        extractedParams[targetParam.id] = targetParam.default;
      }
    }

    // Pattern C: Numeric values (e.g. "height 12", "with a height of 10", "width: 14", "floors = 8")
    const numericRegex = /([a-zA-Z_]+)\s*(?:of|:|=)?\s*(\d+)/gi;
    while ((match = numericRegex.exec(p)) !== null) {
      const key = match[1].toLowerCase();
      const val = parseInt(match[2], 10);
      const targetParam = this.findParamInBuilding(matchedBuilding, key);
      if (targetParam && Number.isFinite(val)) {
        extractedParams[targetParam.id] = Math.max(targetParam.min ?? 1, Math.min(targetParam.max ?? 64, val));
      }
    }

    // 3. Decide whether this is really a parametric request.
    //
    // The prompt must name a building AND signal a parameter, otherwise it is
    // left to the language model. Naming a building with a number (for example
    // "build an aquarium with width 14") counts as a signal even when the
    // building itself was not recognised by name.
    if (!matchedBuilding) return null;

    const mentionedParam = Array.isArray(matchedBuilding.parameters)
      ? matchedBuilding.parameters.some(param => this.findParamInBuilding(matchedBuilding, param.id) === param
        && new RegExp(`\\b${param.id}\\b`, 'i').test(p))
      : false;
    const parameterCue = /\bparam(?:eter|s)?\b/.test(p)
      || /\bheight\s+[a-z]\b/i.test(raw)
      || /\b(with|using)\b[^.]*\b\d+\b/i.test(raw)
      || /\b(of|:|=)\s*\d+\b/.test(p)
      || mentionedParam;

    if (!parameterCue) return null;

    return {
      building: matchedBuilding,
      // The same object under the name the studio's tests read. Both are returned rather than one being
      // renamed, because the prompt path and the tests each use one of the two words.
      structure: matchedBuilding,
      extractedParams
    };
  }

  findParamInBuilding(building, name) {
    if (!building || !Array.isArray(building.parameters)) return null;
    const n = name.toLowerCase();
    for (const p of building.parameters) {
      if (p.id.toLowerCase() === n || p.name.toLowerCase() === n || (p.symbol && p.symbol.toLowerCase() === n)) {
        return p;
      }
      if (n.includes(p.id.toLowerCase()) || p.id.toLowerCase().includes(n)) {
        return p;
      }
    }
    return null;
  }

  // --- Loading Building ---
  loadBuilding(building, initialParams = {}) {
    if (!building) return;
    this.currentBuilding = building;
    this.currentParameters = {};
    this.isCustomVoxelBuild = false;
    this.customBuildBlocks = [];
    this.customBuildName = null;

    if (Array.isArray(building.parameters)) {
      for (const p of building.parameters) {
        this.currentParameters[p.id] = initialParams[p.id] !== undefined ? initialParams[p.id] : p.default;
      }
    }

    this.updateFileBadge();
    this.rebuildCurrentBuilding();
    this.maybePromptSaveFile();
  }

  // --- Live Rebuilding ---
  rebuildCurrentBuilding() {
    if (!this.currentBuilding || typeof this.currentBuilding.generate !== 'function') return;

    // 1. Clear previous voxels
    if (this.game.world) {
      for (const v of this.placedVoxels) {
        // The Studio has no terrain to restore: below its ground nothing can be placed, above it is air.
        const groundId = BLOCKS.AIR;
        this.game.world.setVoxel(v.x, v.y, v.z, groundId);
      }
    }
    this.placedVoxels = [];

    // 2. Generate new voxels with current parameters
    const origin = { x: this.buildOrigin.x, y: this.buildOrigin.y, z: this.buildOrigin.z };
    const newBlocks = this.currentBuilding.generate(origin, this.currentParameters, BLOCKS) || [];

    // 3. Place new voxels in the world
    this.placedStates = new Map();
    this.placedBlockEntities = new Map();
    if (this.game.world) {
      const world = this.game.world;
      for (const b of newBlocks) {
        world.setVoxel(b.x, b.y, b.z, b.id);
        this.placedVoxels.push({ x: b.x, y: b.y, z: b.z });
        if (!b.state && !b.blockEntity) continue;
        const key = `${b.x},${b.y},${b.z}`;
        if (b.state) this.placedStates.set(key, b.state);
        // Facing from the Minecraft state; chest contents and sign text from the block entity.
        const request = worldRequestFor(b);
        if (request) world.applyStructureOrientation?.(request);
        if (b.blockEntity) {
          // The chest's contents as placed, so export can tell whether the player changed them.
          const chest = isChest(b.id) ? this.chestAt(b.x, b.y, b.z) : null;
          this.placedBlockEntities.set(key, { blockId: b.id, blockEntity: b.blockEntity, ...(chest ? { chestSnapshot: chestSnapshot(chest) } : {}) });
        }
      }
    }

    // 4. Refresh dirty chunks so changes appear instantly
    if (typeof this.game.loadChunksAroundPlayer === 'function') {
      this.game.loadChunksAroundPlayer();
    }
    if (typeof this.game.refreshDirtyChunks === 'function') {
      this.game.refreshDirtyChunks(16);
    }
    this.renderFilePrompt();
  }

  /**
   * Remove the open building from the preview. The .schem file on disk is left alone: the studio's document is
   * the file, and the agent's "destroy" clears what is on screen.
   */
  clearCurrentBuilding() {
    if (Array.isArray(this.placedVoxels) && this.game?.world?.setVoxel) {
      for (const v of this.placedVoxels) {
        const groundId = BLOCKS.AIR;
        this.game.world.setVoxel(v.x, v.y, v.z, groundId);
      }
    }
    this.placedVoxels = [];
    this.placedStates = new Map();
    this.placedBlockEntities = new Map();
    this.currentBuilding = null;
    this.currentParameters = {};
    this.isCustomVoxelBuild = false;
    this.customBuildBlocks = [];
    this.customBuildName = null;
    this.updateFileBadge();

    if (typeof this.game?.refreshDirtyChunks === 'function') this.game.refreshDirtyChunks(24);
    else if (typeof this.game?.loadChunksAroundPlayer === 'function') this.game.loadChunksAroundPlayer();

    return true;
  }

  // --- Building Library modal (the Library tab of Open) -------------------------------------------------------

  updateRestoreButtonVisibility() {
    if (this.btnRestoreDefaults) {
      if (BuildingLibrary.hasDeletedOrRenamedDefaults?.()) {
        this.btnRestoreDefaults.classList.remove('hidden');
      } else {
        this.btnRestoreDefaults.classList.add('hidden');
      }
    }
  }

  renderOpenBuildingList(query = '') {
    if (!this.openList) return;
    this.openList.innerHTML = '';
    this.updateRestoreButtonVisibility();

    const q = query.trim().toLowerCase();
    const allBuildings = BuildingLibrary.getAllBuildings();
    const filtered = q
      ? allBuildings.filter(s => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
      : allBuildings;

    if (filtered.length === 0) {
      this.openList.innerHTML = '<div class="studio-open-empty">No buildings found matching search.</div>';
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
            if (typeof alert === 'function') alert('Please enter a building name.');
            nameEl.textContent = st.name;
            return;
          }
          if (newName === st.name) {
            nameEl.textContent = st.name;
            return;
          }
          const res = BuildingLibrary.renameBuilding(st.id, newName);
          if (res.success) {
            st.name = newName;
            nameEl.textContent = newName;
            if (this.currentBuilding?.id === st.id) {
              this.currentBuilding.name = newName;
              this.updateFileBadge();
            }
            this.game.ui?.addChatMessage?.(
              `<span style="color:#10b981;font-weight:bold;">✦ Renamed building to "${newName}"!</span>`
            );
            this.updateRestoreButtonVisibility();
          } else {
            if (typeof alert === 'function') alert(res.message || 'Failed to rename building.');
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
      metaEl.textContent = paramCount > 0
        ? `${st.isBuiltin ? 'Built-in template · ' : ''}${paramCount} parameter${paramCount === 1 ? '' : 's'}`
        : (st.isBuiltin ? 'Built-in template' : 'Saved build');

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
        this.pendingFileName = st.isBuiltin ? `${st.name}.schem` : null;
        this.loadBuilding(st);
        this.game.ui?.addChatMessage?.(`<span style="color:#38bdf8;font-weight:bold;">✦ Loaded building "${st.name}" into Building Studio!</span>`);
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
            const removed = BuildingLibrary.deleteBuilding(st.id);
            if (removed) {
              if (this.currentBuilding?.id === st.id) {
                this.clearCurrentBuilding();
              }
              this.game?.ui?.addChatMessage?.(
                `<span style="color:#38bdf8;font-weight:bold;">✦ Deleted "${st.name}" from the building library.</span>`
              );
            } else {
              this.game?.ui?.addChatMessage?.(
                `<span style="color:#ef4444;font-weight:bold;">✦ Could not delete "${st.name}".</span>`
              );
            }
            this.renderOpenBuildingList(query);
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
