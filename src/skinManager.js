// Minecraft Skin and Skin Pack Manager
// Supports single skin PNGs (64x64 and legacy 64x32), Bedrock/Java skin packs (skins.json, .mcpack),
// and official bundled default skins (Steve, Alex, Ari, Efe, Kai, Makena, Noor, Sunny, Zuri).

import * as THREE from 'three';
import { readZip } from './io/zipReader.js';

// Official vanilla default player skins
// Official vanilla default player skins
export const DEFAULT_SKINS = [
  {
    id: 'steve',
    name: 'Steve',
    model: 'default', // 4px arm
    textureUrl: '/assets/entity/player/wide/steve.png',
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

// Curated NameMC & Minecraft community inspired skin packs
export const BUILTIN_SKIN_PACKS = [
  {
    id: 'pack_fantasy',
    name: 'Medieval & Fantasy Legends',
    description: 'Brave knights, mystical sorcerers, and elven rangers ready for adventure.',
    author: 'Minecraft Community / NameMC Style',
    iconEmoji: '⚔️',
    skins: [
      {
        id: 'skin_crusader_knight',
        name: 'Crusader Knight',
        model: 'default',
        description: 'Polished steel plate armor with scarlet surcoat and chainmail.',
        skinColor: '#d4a373',
        shirtColor: '#991b1b',
        pantsColor: '#475569',
        hairColor: '#1e293b',
        eyeColor: '#38bdf8',
        accentColor: '#cbd5e1',
        overlayType: 'knight_helm',
      },
      {
        id: 'skin_elven_ranger',
        name: 'Elven Ranger',
        model: 'slim',
        description: 'Forest scout clad in leaf-green tunic and leather braces.',
        skinColor: '#fed7aa',
        shirtColor: '#15803d',
        pantsColor: '#78350f',
        hairColor: '#eab308',
        eyeColor: '#22c55e',
        accentColor: '#166534',
        overlayType: 'ranger_hood',
      },
      {
        id: 'skin_grand_wizard',
        name: 'Grand Sorcerer',
        model: 'default',
        description: 'Arcane robes embroidered with mystic golden constellation runes.',
        skinColor: '#fcd34d',
        shirtColor: '#4c1d95',
        pantsColor: '#2e1065',
        hairColor: '#94a3b8',
        eyeColor: '#a855f7',
        accentColor: '#fbbf24',
        overlayType: 'wizard_hat',
      },
      {
        id: 'skin_royal_paladin',
        name: 'Royal Paladin',
        model: 'default',
        description: 'Gilded battle plate with sapphire inlays and white cape.',
        skinColor: '#e2e8f0',
        shirtColor: '#eab308',
        pantsColor: '#1e293b',
        hairColor: '#451a03',
        eyeColor: '#0284c7',
        accentColor: '#f8fafc',
        overlayType: 'paladin_crest',
      },
    ],
  },
  {
    id: 'pack_cyberpunk',
    name: 'Cyberpunk & Modern Streetwear',
    description: 'High-tech hackers, synthwave racers, and trendy modern street fashion.',
    author: 'Minecraft Community / NameMC Style',
    iconEmoji: '⚡',
    skins: [
      {
        id: 'skin_cyber_hacker',
        name: 'Cyber Hacker',
        model: 'slim',
        description: 'Tactical techwear hoodie with glowing cyan cyber visor and circuits.',
        skinColor: '#e0a96d',
        shirtColor: '#0f172a',
        pantsColor: '#1e293b',
        hairColor: '#06b6d4',
        eyeColor: '#22d3ee',
        accentColor: '#06b6d4',
        overlayType: 'cyber_visor',
      },
      {
        id: 'skin_neon_hoodie',
        name: 'Neon Streetwear',
        model: 'default',
        description: 'Vibrant oversized magenta hoodie with sleek streetwear sneakers.',
        skinColor: '#f3c699',
        shirtColor: '#c026d3',
        pantsColor: '#09090b',
        hairColor: '#18181b',
        eyeColor: '#ec4899',
        accentColor: '#f43f5e',
        overlayType: 'headphones',
      },
      {
        id: 'skin_shadow_ninja',
        name: 'Shadow Ninja',
        model: 'default',
        description: 'Tactical stealth shinobi with crimson headband and hidden throwing stars.',
        skinColor: '#d97706',
        shirtColor: '#18181b',
        pantsColor: '#0f172a',
        hairColor: '#09090b',
        eyeColor: '#ef4444',
        accentColor: '#dc2626',
        overlayType: 'ninja_mask',
      },
      {
        id: 'skin_synthwave_pilot',
        name: 'Synthwave Pilot',
        model: 'slim',
        description: 'Retro 80s neon gradient bomber jacket and chrome sunglasses.',
        skinColor: '#fed7aa',
        shirtColor: '#f97316',
        pantsColor: '#312e81',
        hairColor: '#f43f5e',
        eyeColor: '#38bdf8',
        accentColor: '#ec4899',
        overlayType: 'sunglasses',
      },
    ],
  },
  {
    id: 'pack_nether_void',
    name: 'Nether & Void Expedition',
    description: 'Lava-forged netherite champions, ender dragon cultists, and void explorers.',
    author: 'Minecraft Community / NameMC Style',
    iconEmoji: '🌋',
    skins: [
      {
        id: 'skin_netherite_warden',
        name: 'Netherite Juggernaut',
        model: 'default',
        description: 'Heavy ancient debris armor glowing with molten magma fissures.',
        skinColor: '#44403c',
        shirtColor: '#1c1917',
        pantsColor: '#292524',
        hairColor: '#78350f',
        eyeColor: '#f97316',
        accentColor: '#ea580c',
        overlayType: 'magma_horns',
      },
      {
        id: 'skin_ender_sorceress',
        name: 'Ender Sorceress',
        model: 'slim',
        description: 'Obsidian dragon robes shimmering with ethereal ender eye particles.',
        skinColor: '#d4b996',
        shirtColor: '#3b0764',
        pantsColor: '#18181b',
        hairColor: '#581c87',
        eyeColor: '#10b981',
        accentColor: '#a855f7',
        overlayType: 'ender_crown',
      },
      {
        id: 'skin_piglin_scout',
        name: 'Piglin Gold Hunter',
        model: 'default',
        description: 'Gilded Nether warrior with gold bracers and fierce tusks.',
        skinColor: '#f472b6',
        shirtColor: '#78350f',
        pantsColor: '#451a03',
        hairColor: '#fbbf24',
        eyeColor: '#ffffff',
        accentColor: '#f59e0b',
        overlayType: 'piglin_ears',
      },
      {
        id: 'skin_void_walker',
        name: 'Void Walker',
        model: 'slim',
        description: 'Mysterious traveler imbued with deep dark sculk and echo shards.',
        skinColor: '#0f172a',
        shirtColor: '#0369a1',
        pantsColor: '#082f49',
        hairColor: '#0e7490',
        eyeColor: '#38bdf8',
        accentColor: '#06b6d4',
        overlayType: 'sculk_horns',
      },
    ],
  },
  {
    id: 'pack_cosplay',
    name: 'Cozy Onesies & Cosplay',
    description: 'Adorable hooded animal onesies inspired by top trending NameMC skins.',
    author: 'Minecraft Community / NameMC Style',
    iconEmoji: '🐾',
    skins: [
      {
        id: 'skin_red_panda',
        name: 'Red Panda Onesie',
        model: 'slim',
        description: 'Cozy oversized red panda hood with striped tail and fleece paws.',
        skinColor: '#fcd34d',
        shirtColor: '#b45309',
        pantsColor: '#1c1917',
        hairColor: '#78350f',
        eyeColor: '#064e3b',
        accentColor: '#fef3c7',
        overlayType: 'animal_hood',
      },
      {
        id: 'skin_arctic_fox',
        name: 'Arctic Fox Onesie',
        model: 'slim',
        description: 'Fluffy snow-white fox hoodie with soft pink inner ears and cozy scarf.',
        skinColor: '#fed7aa',
        shirtColor: '#f8fafc',
        pantsColor: '#e2e8f0',
        hairColor: '#f1f5f9',
        eyeColor: '#0284c7',
        accentColor: '#f472b6',
        overlayType: 'animal_hood',
      },
      {
        id: 'skin_frog_explorer',
        name: 'Froggy Overalls',
        model: 'default',
        description: 'Cute green frog eyes beanie hat and blue denim puddle overalls.',
        skinColor: '#f59e0b',
        shirtColor: '#4ade80',
        pantsColor: '#1d4ed8',
        hairColor: '#451a03',
        eyeColor: '#15803d',
        accentColor: '#86efac',
        overlayType: 'frog_hat',
      },
      {
        id: 'skin_axolotl_onesie',
        name: 'Axolotl Onesie',
        model: 'default',
        description: 'Bubblegum pink axolotl onesie with adorable frilled gill headpiece.',
        skinColor: '#fce7f3',
        shirtColor: '#f472b6',
        pantsColor: '#ec4899',
        hairColor: '#db2777',
        eyeColor: '#4a044e',
        accentColor: '#fda4af',
        overlayType: 'animal_hood',
      },
    ],
  },
];

/**
 * Detects whether a standard 64x64 Minecraft skin PNG has a 'slim' (Alex 3px) or 'default' (Steve 4px) arm geometry
 * by inspecting the unused column transparency defined in the official Minecraft skin specification.
 */
export function detectSkinModelFromAlpha(width, height, getAlpha) {
  if (width !== 64 || height !== 64) {
    return 'default'; // 64x32 legacy skins are always default 4px arms
  }
  // Check unused pixels in slim skins:
  // Right arm unused column: x=54..55, y=20..31
  // Left arm unused column: x=46..47, y=52..63
  for (let y = 20; y < 32; y++) {
    if (getAlpha(54, y) > 0 || getAlpha(55, y) > 0) {
      return 'default';
    }
  }
  for (let y = 52; y < 64; y++) {
    if (getAlpha(46, y) > 0 || getAlpha(47, y) > 0) {
      return 'default';
    }
  }
  return 'slim';
}

/**
 * Converts a legacy 64x32 classic Minecraft skin into modern 64x64 format
 * by copying and mirroring right limbs into left limbs.
 */
export function convert64x32to64x64Canvas(img) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Draw original 64x32
  ctx.drawImage(img, 0, 0);

  function copyFlipped(sx, sy, sw, sh, dx, dy) {
    ctx.save();
    ctx.translate(dx + sw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  }

  // Right Leg (0, 16, 16, 16) -> Left Leg (16, 48, 16, 16)
  copyFlipped(4, 16, 4, 4, 20, 48); // Top
  copyFlipped(8, 16, 4, 4, 24, 48); // Bottom
  copyFlipped(0, 20, 4, 12, 24, 52); // Outer -> Inner
  copyFlipped(4, 20, 4, 12, 20, 52); // Front -> Front
  copyFlipped(8, 20, 4, 12, 16, 52); // Inner -> Outer
  copyFlipped(12, 20, 4, 12, 28, 52); // Back -> Back

  // Right Arm (40, 16, 16, 16) -> Left Arm (32, 48, 16, 16)
  copyFlipped(44, 16, 4, 4, 36, 48); // Top
  copyFlipped(48, 16, 4, 4, 40, 48); // Bottom
  copyFlipped(40, 20, 4, 12, 40, 52); // Outer -> Inner
  copyFlipped(44, 20, 4, 12, 36, 52); // Front -> Front
  copyFlipped(48, 20, 4, 12, 32, 52); // Inner -> Outer
  copyFlipped(52, 20, 4, 12, 44, 52); // Back -> Back

  return canvas;
}

export class SkinManager {
  constructor() {
    this.skins = new Map();
    this.skinPacks = new Map();
    this.equippedSkinId = 'steve';
    this.listeners = new Set();
    this.cachedArmMaterials = new Map();

    // 1. Register official vanilla default skins
    const vanillaSkins = [];
    for (const skin of DEFAULT_SKINS) {
      const s = {
        ...skin,
        packId: 'vanilla_default',
        packName: 'Vanilla Default Characters',
        builtIn: true,
        dataUrl: this.generateProceduralSkinDataUrl(skin),
      };
      this.skins.set(skin.id, s);
      vanillaSkins.push(s);
    }
    this.skinPacks.set('vanilla_default', {
      id: 'vanilla_default',
      name: 'Vanilla Default Characters',
      description: 'Official vanilla Minecraft character skins.',
      author: 'Mojang Studios',
      iconEmoji: '⛏️',
      skins: vanillaSkins,
      builtIn: true,
    });

    // 2. Register curated built-in skin packs
    for (const pack of BUILTIN_SKIN_PACKS) {
      const packSkins = [];
      for (const skinDef of pack.skins) {
        const s = {
          ...skinDef,
          packId: pack.id,
          packName: pack.name,
          builtIn: true,
          dataUrl: this.generateProceduralSkinDataUrl(skinDef),
        };
        this.skins.set(s.id, s);
        packSkins.push(s);
      }
      this.skinPacks.set(pack.id, {
        ...pack,
        skins: packSkins,
        builtIn: true,
      });
    }

    this.loadSettings();
  }

  /**
   * Generates a 64x64 standard Minecraft skin PNG data URL with both base and 3D overlay layers.
   */
  generateProceduralSkinDataUrl(skinDef) {
    if (typeof document === 'undefined') return 'data:image/png;base64,mock';

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const {
      skinColor = '#d9a066',
      shirtColor = '#00a8a8',
      pantsColor = '#2b3984',
      hairColor = '#4a3219',
      eyeColor = '#2d3795',
      accentColor = '#ffffff',
      model = 'default',
      overlayType = null,
    } = skinDef;

    const isSlim = model === 'slim';
    const armTexW = isSlim ? 3 : 4;

    // 1. Head Base (8x8x8 at 0, 0)
    // Top
    ctx.fillStyle = hairColor;
    ctx.fillRect(8, 0, 8, 8);
    // Bottom (neck)
    ctx.fillStyle = skinColor;
    ctx.fillRect(16, 0, 8, 8);
    // Face (Front: 8, 8, 8, 8)
    ctx.fillRect(8, 8, 8, 8);
    // Hair on forehead / top of face
    ctx.fillStyle = hairColor;
    ctx.fillRect(8, 8, 8, 2);
    ctx.fillRect(8, 10, 1, 3);
    ctx.fillRect(15, 10, 1, 3);
    // Eyes (whites + iris)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 12, 1, 1);
    ctx.fillRect(14, 12, 1, 1);
    ctx.fillStyle = eyeColor;
    ctx.fillRect(10, 12, 1, 1);
    ctx.fillRect(13, 12, 1, 1);

    // Sides & Back of head
    ctx.fillStyle = hairColor;
    ctx.fillRect(0, 8, 8, 8); // Right
    ctx.fillRect(24, 8, 8, 8); // Back
    ctx.fillRect(16, 8, 8, 8); // Left

    // 2. Torso Base (8x12x4 at 16, 16)
    ctx.fillStyle = shirtColor;
    ctx.fillRect(20, 20, 8, 12); // Front
    ctx.fillRect(20, 16, 8, 4); // Top
    ctx.fillRect(28, 16, 8, 4); // Bottom
    ctx.fillRect(32, 20, 8, 12); // Back
    ctx.fillRect(16, 20, 4, 12); // Right
    ctx.fillRect(28, 20, 4, 12); // Left
    // Neck collar reveal
    ctx.fillStyle = skinColor;
    ctx.fillRect(23, 20, 2, 2);

    // 3. Right Arm Base (texOrigin 40, 16)
    ctx.fillStyle = shirtColor;
    ctx.fillRect(44, 16, armTexW, 4); // Shoulder Top
    ctx.fillRect(44, 20, armTexW, 4); // Front upper sleeve
    ctx.fillRect(40, 20, 4, 4); // Outer upper sleeve
    ctx.fillRect(44 + armTexW, 20, 4, 4); // Inner upper sleeve
    ctx.fillRect(48 + armTexW, 20, armTexW, 4); // Back upper sleeve
    ctx.fillStyle = skinColor;
    ctx.fillRect(44 + armTexW, 16, armTexW, 4); // Hand bottom
    ctx.fillRect(44, 24, armTexW, 8); // Front hand
    ctx.fillRect(40, 24, 4, 8); // Outer hand
    ctx.fillRect(44 + armTexW, 24, 4, 8); // Inner hand
    ctx.fillRect(48 + armTexW, 24, armTexW, 8); // Back hand

    // 4. Left Arm Base (texOrigin 32, 48)
    ctx.fillStyle = shirtColor;
    ctx.fillRect(36, 48, armTexW, 4); // Shoulder Top
    ctx.fillRect(36, 52, armTexW, 4); // Front upper sleeve
    ctx.fillRect(32, 52, 4, 4); // Outer upper sleeve
    ctx.fillRect(36 + armTexW, 52, 4, 4); // Inner upper sleeve
    ctx.fillRect(40 + armTexW, 52, armTexW, 4); // Back upper sleeve
    ctx.fillStyle = skinColor;
    ctx.fillRect(36 + armTexW, 48, armTexW, 4); // Hand bottom
    ctx.fillRect(36, 56, armTexW, 8); // Front hand
    ctx.fillRect(32, 56, 4, 8); // Outer hand
    ctx.fillRect(36 + armTexW, 56, 4, 8); // Inner hand
    ctx.fillRect(40 + armTexW, 56, armTexW, 8); // Back hand

    // 5. Right Leg Base (texOrigin 0, 16)
    ctx.fillStyle = pantsColor;
    ctx.fillRect(4, 20, 4, 12); // Front
    ctx.fillRect(4, 16, 4, 4); // Top
    ctx.fillRect(8, 16, 4, 4); // Bottom
    ctx.fillRect(0, 20, 4, 12); // Outer
    ctx.fillRect(8, 20, 4, 12); // Inner
    ctx.fillRect(12, 20, 4, 12); // Back

    // 6. Left Leg Base (texOrigin 16, 48)
    ctx.fillRect(20, 52, 4, 12); // Front
    ctx.fillRect(20, 48, 4, 4); // Top
    ctx.fillRect(24, 48, 4, 4); // Bottom
    ctx.fillRect(16, 52, 4, 12); // Outer
    ctx.fillRect(24, 52, 4, 12); // Inner
    ctx.fillRect(28, 52, 4, 12); // Back

    // 7. Overlays (3D Depth Layer)
    if (overlayType) {
      if (overlayType === 'knight_helm') {
        // Helmet Visor Overlay
        ctx.fillStyle = accentColor || '#cbd5e1';
        ctx.fillRect(40, 8, 8, 3); // Helm Brow
        ctx.fillRect(40, 8, 1, 8); // Left Cheek
        ctx.fillRect(47, 8, 1, 8); // Right Cheek
        ctx.fillRect(40, 14, 8, 2); // Chin Guard
        // Dark Visor Slit
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(41, 11, 6, 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(42, 11, 1, 1);
        ctx.fillRect(45, 11, 1, 1);
        // Helm Top Plume
        ctx.fillStyle = shirtColor;
        ctx.fillRect(43, 0, 2, 8);
        // Heraldic Cross on Torso Jacket Overlay
        ctx.fillStyle = shirtColor;
        ctx.fillRect(23, 36, 2, 8);
        ctx.fillRect(21, 38, 6, 2);
      } else if (overlayType === 'ranger_hood') {
        // Hood framing face
        ctx.fillStyle = shirtColor;
        ctx.fillRect(40, 8, 8, 3);
        ctx.fillRect(40, 8, 2, 8);
        ctx.fillRect(46, 8, 2, 8);
        ctx.fillRect(40, 0, 8, 8); // Hood top
        ctx.fillRect(56, 8, 8, 8); // Hood back
        // Feather
        ctx.fillStyle = '#fde047';
        ctx.fillRect(35, 9, 2, 4);
        // Quiver Strap
        ctx.fillStyle = '#78350f';
        ctx.fillRect(21, 36, 2, 10);
      } else if (overlayType === 'wizard_hat') {
        // Wizard cowl & mystic gems
        ctx.fillStyle = shirtColor;
        ctx.fillRect(40, 8, 8, 3);
        ctx.fillRect(40, 0, 8, 8);
        ctx.fillStyle = accentColor || '#fbbf24';
        ctx.fillRect(43, 9, 2, 2); // Golden forehead gem
        // Robe Amulet
        ctx.fillRect(23, 37, 2, 2);
      } else if (overlayType === 'paladin_crest') {
        // Golden Winged Tiara / Crown
        ctx.fillStyle = '#facc15';
        ctx.fillRect(40, 8, 8, 2);
        ctx.fillRect(43, 7, 2, 3);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(43, 9, 2, 1); // Blue sapphire
        // Cape / Mantle on Torso Back Overlay
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(32, 36, 8, 12);
      } else if (overlayType === 'cyber_visor') {
        // Glowing Neon Visor
        ctx.fillStyle = accentColor || '#06b6d4';
        ctx.fillRect(41, 11, 6, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(42, 11, 1, 1);
        ctx.fillRect(45, 11, 1, 1);
        // Cyber headset
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(33, 10, 2, 3);
        ctx.fillRect(49, 10, 2, 3);
      } else if (overlayType === 'headphones') {
        // Gaming Headphones
        ctx.fillStyle = accentColor || '#ec4899';
        ctx.fillRect(42, 0, 4, 1); // Headband
        ctx.fillRect(34, 10, 3, 4); // Left Ear
        ctx.fillRect(50, 10, 3, 4); // Right Ear
        // Hoodie Drawstrings
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(22, 37, 1, 5);
        ctx.fillRect(25, 37, 1, 5);
      } else if (overlayType === 'ninja_mask') {
        // Ninja Mask (covers mouth and nose)
        ctx.fillStyle = shirtColor;
        ctx.fillRect(40, 11, 8, 5);
        // Crimson Headband
        ctx.fillStyle = accentColor || '#ef4444';
        ctx.fillRect(40, 8, 8, 2);
        ctx.fillRect(58, 8, 3, 5); // Knot tails
      } else if (overlayType === 'sunglasses') {
        // Sunglasses
        ctx.fillStyle = '#09090b';
        ctx.fillRect(41, 11, 6, 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(42, 11, 1, 1);
        ctx.fillRect(45, 11, 1, 1);
      } else if (overlayType === 'magma_horns') {
        // Obsidian Horns
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(41, 0, 2, 3);
        ctx.fillRect(45, 0, 2, 3);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(41, 0, 2, 1);
        ctx.fillRect(45, 0, 2, 1);
      } else if (overlayType === 'ender_crown') {
        // Ender Tiara
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(40, 8, 8, 2);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(43, 8, 2, 2); // Ender eye jewel
      } else if (overlayType === 'piglin_ears') {
        // Piglin Ears
        ctx.fillStyle = skinColor;
        ctx.fillRect(32, 10, 2, 4);
        ctx.fillRect(54, 10, 2, 4);
      } else if (overlayType === 'sculk_horns') {
        // Sculk Antennae
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(41, 0, 2, 3);
        ctx.fillRect(45, 0, 2, 3);
      } else if (overlayType === 'animal_hood') {
        // Animal Ears
        ctx.fillStyle = shirtColor;
        ctx.fillRect(41, 0, 2, 3);
        ctx.fillRect(45, 0, 2, 3);
        ctx.fillStyle = accentColor || '#fef3c7';
        ctx.fillRect(41, 1, 2, 1);
        ctx.fillRect(45, 1, 2, 1);
      } else if (overlayType === 'frog_hat') {
        // Big round frog eyes
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(41, 0, 2, 3);
        ctx.fillRect(45, 0, 2, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(41, 0, 1, 2);
        ctx.fillRect(45, 0, 1, 2);
        ctx.fillStyle = '#000000';
        ctx.fillRect(42, 1, 1, 1);
        ctx.fillRect(46, 1, 1, 1);
      }
    }

    return canvas.toDataURL('image/png');
  }

  /**
   * Registers a custom user skin from an image Data URL, Blob, or Image element.
   */
  registerSkin(name, dataUrl, model = 'default', packId = 'custom_skins', packName = 'Custom & NameMC Skins') {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const skin = {
      id,
      name: name || 'Custom Skin',
      model: model === 'slim' ? 'slim' : 'default',
      dataUrl,
      packId,
      packName,
      builtIn: false,
    };
    this.skins.set(id, skin);

    // Register or add to skin pack
    let pack = this.skinPacks.get(packId);
    if (!pack) {
      pack = {
        id: packId,
        name: packName,
        description: 'Custom skins uploaded or imported by the player.',
        author: 'Player / NameMC',
        iconEmoji: '👤',
        skins: [],
        builtIn: false,
      };
      this.skinPacks.set(packId, pack);
    }
    pack.skins.push(skin);

    this.equipSkin(id);
    this.saveSettings();
    return skin;
  }

  /**
   * Imports a Minecraft Bedrock or Java skin pack archive (.mcpack or .zip).
   * Reads skins.json or extracts all included skin PNGs.
   */
  async loadSkinPackFromZip(buffer, defaultPackName = 'Imported Skin Pack') {
    const files = await readZip(buffer);
    let packName = defaultPackName;
    const importedSkins = [];
    const packId = `pack_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 1. Check for skins.json
    const skinsJsonData = files['skins.json'] || files['skin_pack/skins.json'];
    if (skinsJsonData) {
      try {
        const text = typeof skinsJsonData === 'string' ? skinsJsonData : new TextDecoder().decode(skinsJsonData);
        const manifest = JSON.parse(text);
        if (manifest.serialize_name) packName = manifest.serialize_name;

        if (Array.isArray(manifest.skins)) {
          for (const s of manifest.skins) {
            const textureFile = s.texture;
            const fileEntry = files[textureFile] ||
              files[`skin_pack/${textureFile}`] ||
              Object.entries(files).find(([k]) => k.endsWith(textureFile))?.[1];

            if (fileEntry) {
              const blobUrl = this.bytesToDataUrl(fileEntry, 'image/png');
              const model = s.geometry?.includes('Slim') ? 'slim' : 'default';
              const skinId = `${packId}_${importedSkins.length}`;
              const skin = {
                id: skinId,
                name: s.localization_name || textureFile.replace('.png', ''),
                model,
                dataUrl: blobUrl,
                packId,
                packName,
                builtIn: false,
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

    // 2. Fallback: If no skins.json or empty, collect any PNG files in the archive (e.g. NameMC download zip)
    if (importedSkins.length === 0) {
      for (const [path, data] of Object.entries(files)) {
        if (path.toLowerCase().endsWith('.png') && !path.toLowerCase().includes('pack.png') && !path.toLowerCase().includes('icon.png')) {
          const skinFileName = path.slice(path.lastIndexOf('/') + 1).replace('.png', '');
          const skinName = skinFileName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const blobUrl = this.bytesToDataUrl(data, 'image/png');
          const skinId = `${packId}_${importedSkins.length}`;
          const skin = {
            id: skinId,
            name: skinName,
            model: 'default',
            dataUrl: blobUrl,
            packId,
            packName,
            builtIn: false,
          };
          this.skins.set(skinId, skin);
          importedSkins.push(skin);
        }
      }
    }

    if (importedSkins.length > 0) {
      const pack = {
        id: packId,
        name: packName,
        description: `Imported skin pack containing ${importedSkins.length} skin(s).`,
        author: 'Community / NameMC',
        iconEmoji: '📁',
        skins: importedSkins,
        builtIn: false,
      };
      this.skinPacks.set(packId, pack);
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

  /**
   * Activates a skin pack by equipping its primary featured skin.
   */
  activateSkinPack(packId) {
    const pack = this.skinPacks.get(packId);
    if (!pack || !pack.skins || pack.skins.length === 0) return null;
    const firstSkin = pack.skins[0];
    this.equipSkin(firstSkin.id);
    return firstSkin;
  }

  /**
   * Sets model type ('default' 4px vs 'slim' 3px) for a given skin.
   */
  setSkinModel(skinId, model) {
    const skin = this.skins.get(skinId);
    if (!skin) return false;
    skin.model = model === 'slim' ? 'slim' : 'default';
    this.cachedArmMaterials.clear();
    this.notifyChange();
    this.saveSettings();
    return true;
  }

  /**
   * Toggles the arm width model between Classic (4px) and Slim (3px) for the currently equipped skin.
   */
  toggleEquippedModel() {
    const current = this.getEquippedSkin();
    const newModel = current.model === 'slim' ? 'default' : 'slim';
    return this.setSkinModel(current.id, newModel);
  }

  getEquippedSkin() {
    return this.skins.get(this.equippedSkinId) || this.skins.get('steve');
  }

  getAllSkins() {
    return Array.from(this.skins.values());
  }

  getSkinPacks() {
    return Array.from(this.skinPacks.values());
  }

  getSkinPack(id) {
    return this.skinPacks.get(id) || null;
  }

  /**
   * Generates a 2D face avatar canvas or data URL for display in UI lists.
   */
  getFaceDataUrl(skinId = this.equippedSkinId) {
    const skin = this.skins.get(skinId) || this.getEquippedSkin();
    if (!skin) return '';
    if (skin.faceDataUrl) return skin.faceDataUrl;
    if (typeof document === 'undefined') return skin.dataUrl || '';

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
      skin.faceDataUrl = canvas.toDataURL('image/png');
    } else {
      img.onload = () => {
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 32, 32);
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 32, 32);
        skin.faceDataUrl = canvas.toDataURL('image/png');
      };
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

    const sourceUrl = skin.textureUrl || skin.dataUrl;
    const texture = new THREE.TextureLoader().load(sourceUrl);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;

    mat = new THREE.MeshLambertMaterial({
      map: texture,
      side: THREE.FrontSide,
    });
    this.cachedArmMaterials.set(skin.id, mat);
    return mat;
  }

  /**
   * Generates a Three.js material for the first-person arm sleeve overlay in HeldItemRenderer.
   */
  getArmOverlayMaterial() {
    const skin = this.getEquippedSkin();
    const cacheKey = `${skin.id}_overlay`;
    let mat = this.cachedArmMaterials.get(cacheKey);
    if (mat) return mat;

    if (typeof document === 'undefined') {
      mat = new THREE.MeshLambertMaterial({ color: 0x4a2a18, transparent: true, opacity: 0.85 });
      this.cachedArmMaterials.set(cacheKey, mat);
      return mat;
    }

    const sourceUrl = skin.textureUrl || skin.dataUrl;
    const texture = new THREE.TextureLoader().load(sourceUrl);
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;

    mat = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    });
    this.cachedArmMaterials.set(cacheKey, mat);
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
