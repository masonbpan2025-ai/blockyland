// Minecraft Skin and Skin Pack Manager
// Supports single skin PNGs (64x64 and legacy 64x32), Bedrock/Java skin packs (skins.json, .mcpack),
// and official bundled default skins (Steve, Alex, Ari, Efe, Kai, Makena, Noor, Sunny, Zuri).

import * as THREE from 'three';
import { readZip } from './io/zipReader.js';

// Official vanilla default player skins
export const DEFAULT_SKINS = [
  {
    id: 'steve',
    name: 'Steve',
    model: 'default', // 4px arm
    description: 'The classic adventurer.',
    shirtColor: '#00a8a8',
    skinColor: '#d9a066',
    pantsColor: '#2b3984',
    hairColor: '#4a3219',
    eyeColor: '#2d3795',
  },
  {
    id: 'alex',
    name: 'Alex',
    model: 'slim', // 3px arm
    description: 'Resourceful wilderness explorer.',
    shirtColor: '#5a8442',
    skinColor: '#ebc09f',
    pantsColor: '#6d4c35',
    hairColor: '#c46227',
    eyeColor: '#2e7552',
  },
  {
    id: 'ari',
    name: 'Ari',
    model: 'slim',
    description: 'Braided hair and adventurous spirit.',
    shirtColor: '#9333ea',
    skinColor: '#8d5b4c',
    pantsColor: '#374151',
    hairColor: '#18181b',
    eyeColor: '#451a03',
  },
  {
    id: 'efe',
    name: 'Efe',
    model: 'default',
    description: 'Gold earring and distinctive style.',
    shirtColor: '#2563eb',
    skinColor: '#a16207',
    pantsColor: '#475569',
    hairColor: '#1c1917',
    eyeColor: '#1e3a8a',
  },
  {
    id: 'kai',
    name: 'Kai',
    model: 'slim',
    description: 'Long hair and leather jacket.',
    shirtColor: '#dc2626',
    skinColor: '#fcd34d',
    pantsColor: '#1e293b',
    hairColor: '#0f172a',
    eyeColor: '#78350f',
  },
  {
    id: 'makena',
    name: 'Makena',
    model: 'default',
    description: 'Warm sweater and explorer boots.',
    shirtColor: '#ca8a04',
    skinColor: '#78350f',
    pantsColor: '#1e1b4b',
    hairColor: '#09090b',
    eyeColor: '#451a03',
  },
  {
    id: 'noor',
    name: 'Noor',
    model: 'slim',
    description: 'High-contrast jacket and teal scarf.',
    shirtColor: '#059669',
    skinColor: '#d97706',
    pantsColor: '#18181b',
    hairColor: '#292524',
    eyeColor: '#064e3b',
  },
  {
    id: 'sunny',
    name: 'Sunny',
    model: 'default',
    description: 'Bright button-up shirt and khaki overalls.',
    shirtColor: '#0284c7',
    skinColor: '#fde047',
    pantsColor: '#713f12',
    hairColor: '#451a03',
    eyeColor: '#15803d',
  },
  {
    id: 'zuri',
    name: 'Zuri',
    model: 'default',
    description: 'Athletic wear and patterned belt.',
    shirtColor: '#e11d48',
    skinColor: '#582f0e',
    pantsColor: '#334155',
    hairColor: '#0c0a09',
    eyeColor: '#3b0764',
  },
];

export class SkinManager {
  constructor() {
    this.skins = new Map();
    this.skinPacks = new Map();
    this.equippedSkinId = 'steve';
    this.listeners = new Set();
    this.cachedArmMaterials = new Map();

    // Register built-in default skins
    for (const skin of DEFAULT_SKINS) {
      this.skins.set(skin.id, {
        ...skin,
        builtIn: true,
        dataUrl: this.generateProceduralSkinDataUrl(skin),
      });
    }

    this.loadSettings();
  }

  /**
   * Generates a 64x64 standard Minecraft skin PNG data URL for a default skin character.
   */
  generateProceduralSkinDataUrl(skinDef) {
    if (typeof document === 'undefined') return 'data:image/png;base64,mock';

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const { skinColor, shirtColor, pantsColor, hairColor, eyeColor } = skinDef;

    // 1. Head (8x8x8 at 0, 0)
    // Head Top/Bottom
    ctx.fillStyle = hairColor;
    ctx.fillRect(8, 0, 8, 8); // Top
    ctx.fillStyle = skinColor;
    ctx.fillRect(16, 0, 8, 8); // Bottom (neck)
    // Head Front (8, 8, 8, 8)
    ctx.fillRect(8, 8, 8, 8);
    // Hair on front
    ctx.fillStyle = hairColor;
    ctx.fillRect(8, 8, 8, 2);
    ctx.fillRect(8, 10, 1, 3);
    ctx.fillRect(15, 10, 1, 3);
    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 12, 1, 1);
    ctx.fillRect(14, 12, 1, 1);
    ctx.fillStyle = eyeColor;
    ctx.fillRect(10, 12, 1, 1);
    ctx.fillRect(13, 12, 1, 1);

    // Head Right, Back, Left
    ctx.fillStyle = hairColor;
    ctx.fillRect(0, 8, 8, 8); // Right
    ctx.fillRect(24, 8, 8, 8); // Back
    ctx.fillRect(16, 8, 8, 8); // Left

    // 2. Torso (8x12x4 at 16, 16)
    ctx.fillStyle = shirtColor;
    ctx.fillRect(20, 20, 8, 12); // Front
    ctx.fillRect(20, 16, 8, 4); // Top
    ctx.fillRect(28, 16, 8, 4); // Bottom
    ctx.fillRect(32, 20, 8, 12); // Back
    ctx.fillRect(16, 20, 4, 12); // Right
    ctx.fillRect(28, 20, 4, 12); // Left
    // Neck skin reveal
    ctx.fillStyle = skinColor;
    ctx.fillRect(23, 20, 2, 2);

    // 3. Right Arm (4x12x4 at 40, 16)
    ctx.fillStyle = shirtColor;
    ctx.fillRect(44, 20, 4, 4); // Sleeve
    ctx.fillRect(44, 16, 4, 4); // Shoulder top
    ctx.fillStyle = skinColor;
    ctx.fillRect(44, 24, 4, 8); // Arm / hand
    ctx.fillRect(40, 20, 4, 12); // Outer
    ctx.fillRect(48, 20, 4, 12); // Inner
    ctx.fillRect(52, 20, 4, 12); // Back

    // 4. Left Arm (4x12x4 at 32, 48)
    ctx.fillStyle = shirtColor;
    ctx.fillRect(36, 52, 4, 4);
    ctx.fillRect(36, 48, 4, 4);
    ctx.fillStyle = skinColor;
    ctx.fillRect(36, 56, 4, 8);
    ctx.fillRect(32, 52, 4, 12);
    ctx.fillRect(40, 52, 4, 12);
    ctx.fillRect(44, 52, 4, 12);

    // 5. Right Leg (4x12x4 at 0, 16)
    ctx.fillStyle = pantsColor;
    ctx.fillRect(4, 20, 4, 12);
    ctx.fillRect(4, 16, 4, 4);
    ctx.fillRect(0, 20, 4, 12);
    ctx.fillRect(8, 20, 4, 12);
    ctx.fillRect(12, 20, 4, 12);

    // 6. Left Leg (4x12x4 at 16, 48)
    ctx.fillRect(20, 52, 4, 12);
    ctx.fillRect(20, 48, 4, 4);
    ctx.fillRect(16, 52, 4, 12);
    ctx.fillRect(24, 52, 4, 12);
    ctx.fillRect(28, 52, 4, 12);

    return canvas.toDataURL('image/png');
  }

  /**
   * Registers a custom user skin from an image Data URL, Blob, or Image element.
   */
  registerSkin(name, dataUrl, model = 'default') {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const skin = {
      id,
      name: name || 'Custom Skin',
      model: model === 'slim' ? 'slim' : 'default',
      dataUrl,
      builtIn: false,
    };
    this.skins.set(id, skin);
    this.equipSkin(id);
    this.saveSettings();
    return skin;
  }

  /**
   * Imports a Minecraft Bedrock or Java skin pack archive (.mcpack or .zip).
   * Reads skins.json and extracts all included skin PNGs.
   */
  async loadSkinPackFromZip(buffer, defaultPackName = 'Imported Skin Pack') {
    const files = await readZip(buffer);
    let packName = defaultPackName;
    const importedSkins = [];

    // Check for skins.json
    const skinsJsonData = files['skins.json'] || files['skin_pack/skins.json'];
    if (skinsJsonData) {
      try {
        const text = typeof skinsJsonData === 'string' ? skinsJsonData : new TextDecoder().decode(skinsJsonData);
        const manifest = JSON.parse(text);
        if (manifest.serialize_name) packName = manifest.serialize_name;

        if (Array.isArray(manifest.skins)) {
          for (const s of manifest.skins) {
            const textureFile = s.texture;
            // Find texture in zip
            const fileEntry = files[textureFile] ||
              files[`skin_pack/${textureFile}`] ||
              Object.entries(files).find(([k]) => k.endsWith(textureFile))?.[1];

            if (fileEntry) {
              const mime = 'image/png';
              const blobUrl = this.bytesToDataUrl(fileEntry, mime);
              const model = s.geometry?.includes('Slim') ? 'slim' : 'default';
              const skinId = `pack_${importedSkins.length}_${Date.now()}`;
              const skin = {
                id: skinId,
                name: s.localization_name || textureFile.replace('.png', ''),
                model,
                dataUrl: blobUrl,
                builtIn: false,
                packName,
              };
              this.skins.set(skinId, skin);
              importedSkins.push(skin);
            }
          }
        }
      } catch (e) {
        console.warn('[SkinManager] Failed to parse skins.json:', e);
      }
    }

    // Fallback: If no skins.json or empty, collect any PNG files in the archive
    if (importedSkins.length === 0) {
      for (const [path, data] of Object.entries(files)) {
        if (path.toLowerCase().endsWith('.png') && !path.includes('pack.png')) {
          const skinName = path.slice(path.lastIndexOf('/') + 1).replace('.png', '');
          const blobUrl = this.bytesToDataUrl(data, 'image/png');
          const skinId = `pack_${importedSkins.length}_${Date.now()}`;
          const skin = {
            id: skinId,
            name: skinName,
            model: 'default',
            dataUrl: blobUrl,
            builtIn: false,
            packName,
          };
          this.skins.set(skinId, skin);
          importedSkins.push(skin);
        }
      }
    }

    if (importedSkins.length > 0) {
      this.equipSkin(importedSkins[0].id);
      this.saveSettings();
    }
    return importedSkins;
  }

  bytesToDataUrl(bytes, mime = 'image/png') {
    if (typeof btoa === 'function') {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return `data:${mime};base64,${btoa(binary)}`;
    }
    return `data:${mime};base64,mock`;
  }

  equipSkin(id) {
    if (this.skins.has(id)) {
      this.equippedSkinId = id;
      this.cachedArmMaterials.clear();
      this.notifyChange();
      this.saveSettings();
      return true;
    }
    return false;
  }

  getEquippedSkin() {
    return this.skins.get(this.equippedSkinId) || this.skins.get('steve');
  }

  getAllSkins() {
    return Array.from(this.skins.values());
  }

  /**
   * Generates a 2D face avatar canvas or data URL for display in UI lists.
   */
  getFaceDataUrl(skinId = this.equippedSkinId) {
    const skin = this.skins.get(skinId) || this.getEquippedSkin();
    if (typeof document === 'undefined') return skin?.dataUrl || '';

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const img = new Image();
    img.src = skin.dataUrl;
    if (img.complete && img.width > 0) {
      // Head base (8,8,8,8)
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 32, 32);
      // Hat layer (40,8,8,8)
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 32, 32);
    } else {
      ctx.fillStyle = skin.skinColor || '#d9a066';
      ctx.fillRect(0, 0, 32, 32);
    }
    return canvas.toDataURL('image/png');
  }

  /**
   * Generates a Three.js material for the first-person arm in HeldItemRenderer.
   */
  getArmMaterial() {
    const skin = this.getEquippedSkin();
    let mat = this.cachedArmMaterials.get(skin.id);
    if (mat) return mat;

    if (typeof document === 'undefined') {
      mat = new THREE.MeshLambertMaterial({ color: 0xdbb494 });
      this.cachedArmMaterials.set(skin.id, mat);
      return mat;
    }

    // Load skin texture onto material
    const texture = new THREE.TextureLoader().load(skin.dataUrl);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    // Use arm coordinates on skin texture (right arm front: 44, 20, 4, 12)
    mat = new THREE.MeshLambertMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });
    this.cachedArmMaterials.set(skin.id, mat);
    return mat;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notifyChange() {
    for (const fn of this.listeners) {
      try { fn(this); } catch (e) { console.error(e); }
    }
  }

  saveSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('blockyland_player_skin', this.equippedSkinId);
    } catch {}
  }

  loadSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem('blockyland_player_skin');
      if (saved && this.skins.has(saved)) {
        this.equippedSkinId = saved;
      }
    } catch {}
  }
}

// Global singleton instance
export const skinManager = new SkinManager();
