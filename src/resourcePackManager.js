// Minecraft Java Resource Pack Manager
// Supports loading standard Java resource packs (.zip, folders, pack.mcmeta)
// and includes curated presets: Stay True, Faithful 64x, and Ashen 16x.

import { readZip } from './io/zipReader.js';
import { FAITHFUL_64X_FILES } from './faithful64xManifest.js';

/**
 * Procedural texture generators for featured packs (Stay True, Faithful 64x, Ashen 16x).
 * Generates PNG data URLs using HTML5 Canvas or offline 16x16 / 64x64 pixel buffers.
 */
let textureCounter = 0;
function createPixelTextureUrl(width, height, painter, key = '') {
  if (typeof document === 'undefined') {
    // Headless / Node test environment mock
    return `data:image/png;base64,mock_${key || (++textureCounter)}_${width}x${height}`;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  painter(ctx, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * Helper to extract PNG width and height from raw bytes (Uint8Array / ArrayBuffer).
 */
export function detectPngDimensions(data) {
  if (!data) return null;
  let bytes = null;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  }
  if (!bytes || bytes.length < 24) return null;
  // PNG signature: 137, 80, 78, 71, 13, 10, 26, 10
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = ((bytes[16] << 24) >>> 0) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
    const height = ((bytes[20] << 24) >>> 0) + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
    return { width, height };
  }
  return null;
}

/**
 * Builds the Stay True (vanilla-plus 16x) curated texture set.
 */
function buildStayTrueTextures() {
  return {
    'grass_block_top.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#5c8e32'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#4f7c2b';
      for (let i = 0; i < 30; i++) ctx.fillRect((i * 7) % 16, (i * 11) % 16, 1, 1);
      ctx.fillStyle = '#6fa43c'; // Organic clover-like highlights
      ctx.fillRect(4, 5, 2, 2); ctx.fillRect(10, 11, 2, 2); ctx.fillRect(12, 3, 2, 2);
    }),
    'grass_block_side.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#866043'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#6f4f36';
      for (let i = 0; i < 20; i++) ctx.fillRect((i * 5) % 16, (i * 9) % 16, 1, 1);
      // Natural grass overhang
      ctx.fillStyle = '#5c8e32';
      ctx.fillRect(0, 0, 16, 2);
      ctx.fillRect(2, 2, 2, 2); ctx.fillRect(7, 2, 2, 3); ctx.fillRect(12, 2, 2, 2);
    }),
    'dirt.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#866043'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#735137';
      for (let i = 0; i < 35; i++) ctx.fillRect((i * 9) % 16, (i * 13) % 16, 1, 1);
      ctx.fillStyle = '#9c7353'; // Warm pebble highlights
      ctx.fillRect(3, 4, 1, 1); ctx.fillRect(9, 10, 1, 1); ctx.fillRect(13, 2, 1, 1);
    }),
    'stone.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#7e8185'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#6b6e72';
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 7) % 16, (i * 11) % 16, 1, 1);
      ctx.fillStyle = '#95989c'; // Refined stone striation
      ctx.fillRect(2, 3, 3, 1); ctx.fillRect(8, 7, 4, 1); ctx.fillRect(4, 12, 3, 1);
    }),
    'oak_planks.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#b8945f'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#947547'; // Seams
      ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 11, 16, 1); ctx.fillRect(0, 15, 16, 1);
      ctx.fillRect(8, 0, 1, 4); ctx.fillRect(12, 4, 1, 4); ctx.fillRect(4, 8, 1, 4); ctx.fillRect(10, 12, 1, 4);
    }),
    'dandelion.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = '#3f7a28'; ctx.fillRect(7, 7, 2, 8); ctx.fillRect(5, 12, 6, 2);
      ctx.fillStyle = '#fed83d'; ctx.fillRect(5, 2, 6, 6);
      ctx.fillStyle = '#f9b115'; ctx.fillRect(6, 3, 4, 4);
      ctx.fillStyle = '#fff48d'; ctx.fillRect(6, 2, 2, 1); // Petal highlights
    }),
    'poppy.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = '#3f7a28'; ctx.fillRect(7, 7, 2, 8); ctx.fillRect(6, 10, 4, 2);
      ctx.fillStyle = '#dd2626'; ctx.fillRect(5, 2, 6, 5);
      ctx.fillStyle = '#991b1b'; ctx.fillRect(6, 4, 4, 3);
      ctx.fillStyle = '#1c1917'; ctx.fillRect(7, 4, 2, 2); // Center
    }),
  };
}

/**
 * Builds the Faithful 64x (HD upscale) curated texture set.
 * Maps high-definition 64x64 textures across all block categories, reproducing the
 * authentic Faithful pack details (clear birch log grain, rich multi-tone grass blades,
 * crisp planks, stone micro-bevels, etc.).
 */
function buildFaithful64xTextures() {
  const textures = {};
  for (const file of FAITHFUL_64X_FILES) {
    textures[file] = `/assets/packs/faithful_64x/${file}`;
  }
  return textures;
}

/**
 * Builds the Ashen 16x (dark, weathered, rustic) curated texture set.
 */
function buildAshen16xTextures() {
  return {
    'stone.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#575b61'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#42454b';
      for (let i = 0; i < 35; i++) ctx.fillRect((i * 11) % 16, (i * 7) % 16, 1, 1);
      ctx.fillStyle = '#313338'; // Weathered fissure lines
      ctx.fillRect(3, 4, 3, 1); ctx.fillRect(5, 5, 2, 1); ctx.fillRect(10, 11, 4, 1);
    }),
    'cobblestone.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#494d54'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#2f3238'; // Dark rustic mortar
      ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 10, 16, 1);
      ctx.fillRect(5, 0, 1, 4); ctx.fillRect(11, 4, 1, 6); ctx.fillRect(6, 10, 1, 6);
    }),
    'oak_planks.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#8f7754'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#5c4b33';
      ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 11, 16, 1); ctx.fillRect(0, 15, 16, 1);
    }),
    'grass_block_top.png': createPixelTextureUrl(16, 16, (ctx) => {
      ctx.fillStyle = '#4d693a'; ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#3c522d';
      for (let i = 0; i < 25; i++) ctx.fillRect((i * 7) % 16, (i * 13) % 16, 1, 1);
    }),
  };
}

export class ResourcePackManager {
  constructor() {
    this.availablePacks = new Map();
    this.activePackIds = ['faithful_64x']; // Default to Faithful 64x
    this.listeners = new Set();

    // Register default built-in presets
    this.registerBuiltInPacks();
    this.loadSettings();
  }

  registerBuiltInPacks() {
    this.availablePacks.set('vanilla', {
      id: 'vanilla',
      name: 'Default (Vanilla)',
      description: 'The standard Minecraft textures.',
      packFormat: 46,
      tileSize: 16,
      builtIn: true,
      blockTextures: {},
      itemTextures: {},
      entityTextures: {},
    });

    this.availablePacks.set('stay_true', {
      id: 'stay_true',
      name: 'Stay True (16x)',
      description: 'A visual remaster that enhances variety while preserving the vanilla look.',
      packFormat: 46,
      tileSize: 16,
      builtIn: true,
      blockTextures: buildStayTrueTextures(),
      itemTextures: {},
      entityTextures: {},
    });

    this.availablePacks.set('faithful_64x', {
      id: 'faithful_64x',
      name: 'Faithful 64x',
      description: 'High-resolution 64x upscale reproducing authentic vanilla details.',
      packFormat: 46,
      tileSize: 64,
      builtIn: true,
      blockTextures: buildFaithful64xTextures(),
      itemTextures: {},
      entityTextures: {},
    });

    this.availablePacks.set('ashen_16x', {
      id: 'ashen_16x',
      name: 'Ashen (16x)',
      description: 'Dark, weathered rustic style with atmospheric textures.',
      packFormat: 46,
      tileSize: 16,
      builtIn: true,
      blockTextures: buildAshen16xTextures(),
      itemTextures: {},
      entityTextures: {},
    });
  }

  /**
   * Loads a custom Java Edition resource pack from a .zip ArrayBuffer or Uint8Array.
   */
  async loadPackFromZip(buffer, defaultName = 'Custom Pack') {
    const files = await readZip(buffer);
    return this.loadPackFromExtractedFiles(files, defaultName);
  }

  /**
   * Loads a resource pack from an extracted map of path -> Uint8Array/string.
   */
  loadPackFromExtractedFiles(files, defaultName = 'Custom Pack') {
    let description = 'Custom Minecraft Resource Pack';
    let packFormat = 46;
    let packName = defaultName;

    // 1. Read pack.mcmeta if present
    const metaBytes = files['pack.mcmeta'];
    if (metaBytes) {
      try {
        const text = typeof metaBytes === 'string' ? metaBytes : new TextDecoder().decode(metaBytes);
        const meta = JSON.parse(text);
        if (meta?.pack) {
          if (meta.pack.description) {
            description = typeof meta.pack.description === 'string'
              ? meta.pack.description
              : JSON.stringify(meta.pack.description);
          }
          if (meta.pack.pack_format !== undefined) {
            packFormat = meta.pack.pack_format;
          }
        }
      } catch (e) {
        console.warn('[ResourcePackManager] Error reading pack.mcmeta:', e);
      }
    }

    // 2. Read pack.png icon if present
    let iconUrl = null;
    const packPng = files['pack.png'];
    if (packPng) {
      iconUrl = this.createBlobUrl(packPng, 'image/png');
    }

    // 3. Scan and collect textures
    const blockTextures = {};
    const itemTextures = {};
    const entityTextures = {};
    let detectedTileSize = 16;

    for (const [path, data] of Object.entries(files)) {
      const lower = path.toLowerCase();
      if (!lower.endsWith('.png')) continue;

      // Java 1.13+ format: assets/minecraft/textures/block/
      // Pre-1.13 format: assets/minecraft/textures/blocks/
      if (lower.includes('textures/block/') || lower.includes('textures/blocks/')) {
        const filename = path.slice(path.lastIndexOf('/') + 1);
        blockTextures[filename] = this.createBlobUrl(data, 'image/png');
        if (detectedTileSize === 16) {
          const dims = detectPngDimensions(data);
          if (dims && dims.width >= 16 && dims.width <= 512 && (dims.width & (dims.width - 1)) === 0) {
            detectedTileSize = dims.width;
          }
        }
      } else if (lower.includes('textures/item/') || lower.includes('textures/items/')) {
        const filename = path.slice(path.lastIndexOf('/') + 1);
        itemTextures[filename] = this.createBlobUrl(data, 'image/png');
      } else if (lower.includes('textures/entity/')) {
        const entityRel = path.slice(lower.indexOf('textures/entity/') + 'textures/entity/'.length);
        entityTextures[entityRel] = this.createBlobUrl(data, 'image/png');
      }
    }

    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const pack = {
      id,
      name: packName,
      description,
      packFormat,
      tileSize: detectedTileSize,
      iconUrl,
      builtIn: false,
      blockTextures,
      itemTextures,
      entityTextures,
    };

    this.availablePacks.set(id, pack);
    this.activatePack(id);
    this.saveSettings();
    return pack;
  }

  createBlobUrl(bytes, mimeType = 'image/png') {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return `data:${mimeType};base64,mock`;
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  activatePack(id, priorityIndex = 0) {
    if (!this.availablePacks.has(id)) return Promise.resolve(false);
    this.activePackIds = this.activePackIds.filter(pid => pid !== id);
    this.activePackIds.splice(priorityIndex, 0, id);
    this.saveSettings();
    return this.notifyChange().then(() => true);
  }

  deactivatePack(id) {
    const idx = this.activePackIds.indexOf(id);
    if (idx !== -1) {
      this.activePackIds.splice(idx, 1);
      this.saveSettings();
      return this.notifyChange().then(() => true);
    }
    return Promise.resolve(false);
  }

  reorderPacks(orderedIds) {
    this.activePackIds = orderedIds.filter(id => this.availablePacks.has(id));
    this.saveSettings();
    return this.notifyChange();
  }

  /**
   * Resolves a block texture URL across all currently active resource packs.
   * Checks from highest priority (index 0) to lowest.
   */
  resolveBlockTexture(fileName) {
    for (const packId of this.activePackIds) {
      const pack = this.availablePacks.get(packId);
      if (pack?.blockTextures?.[fileName]) {
        return pack.blockTextures[fileName];
      }
    }
    return null;
  }

  /**
   * Resolves an item texture URL across active resource packs.
   */
  resolveItemTexture(itemIdOrFileName) {
    const fileName = itemIdOrFileName.endsWith('.png') ? itemIdOrFileName : `${itemIdOrFileName}.png`;
    for (const packId of this.activePackIds) {
      const pack = this.availablePacks.get(packId);
      if (pack?.itemTextures?.[fileName]) {
        return pack.itemTextures[fileName];
      }
    }
    return null;
  }

  /**
   * Resolves an entity texture URL across active resource packs.
   */
  resolveEntityTexture(entityPath) {
    for (const packId of this.activePackIds) {
      const pack = this.availablePacks.get(packId);
      if (pack?.entityTextures?.[entityPath]) {
        return pack.entityTextures[entityPath];
      }
    }
    return null;
  }

  /**
   * Returns the maximum tile resolution (16, 32, 64, 128...) required by any active pack.
   * If no HD pack is active, returns standard 16.
   */
  getActiveTileSize() {
    let maxSize = 16;
    for (const packId of this.activePackIds) {
      const pack = this.availablePacks.get(packId);
      if (pack && pack.tileSize) {
        maxSize = Math.max(maxSize, pack.tileSize);
      }
    }
    return maxSize;
  }

  getActivePacks() {
    return this.activePackIds.map(id => this.availablePacks.get(id)).filter(Boolean);
  }

  getAvailablePacks() {
    return Array.from(this.availablePacks.values());
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async notifyChange() {
    for (const fn of this.listeners) {
      try {
        await fn(this);
      } catch (e) {
        console.error(e);
      }
    }
  }

  resetToDefault() {
    this.activePackIds = ['faithful_64x'];
    this.saveSettings();
    return this.notifyChange();
  }

  saveSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('blockyland_active_resource_packs', JSON.stringify(this.activePackIds));
    } catch {}
  }

  loadSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      const defaultMigrated = localStorage.getItem('blockyland_default_faithful64x_applied');
      if (!defaultMigrated) {
        this.activePackIds = ['faithful_64x'];
        localStorage.setItem('blockyland_default_faithful64x_applied', 'true');
        this.saveSettings();
        return;
      }

      const saved = localStorage.getItem('blockyland_active_resource_packs');
      if (saved) {
        const ids = JSON.parse(saved);
        if (Array.isArray(ids)) {
          this.activePackIds = ids.filter(id => this.availablePacks.has(id));
        }
      }
    } catch {}
  }
}

// Global singleton instance
export const resourcePackManager = new ResourcePackManager();
