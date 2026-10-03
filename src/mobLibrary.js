// Central Mob Library Manager for Minecraft Web Edition
// Manages preset mobs and custom user-created mobs (Look, Stats, Behavior, Skills)

export const BUILTIN_MOBS = [
  {
    id: 'zombie',
    name: 'Zombie',
    description: 'Undead hostile mob that attacks players and villagers with melee strikes.',
    isBuiltin: true,
    look: {
      modelType: 'humanoid',
      mainColor: '#2e7d32',
      accentColor: '#1565c0',
      eyeColor: '#111111',
      scale: 1.0,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: false
    },
    behavior: {
      type: 'hostile',
      health: 20,
      speed: 2.2,
      attack: 3,
      followPlayer: false,
      range: 16
    },
    skills: [],
    eggColors: { primary: '#00afaf', secondary: '#799c65' }
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    description: 'Ranged undead archer equipped with a bow and arrows.',
    isBuiltin: true,
    look: {
      modelType: 'humanoid',
      mainColor: '#c4c4c4',
      accentColor: '#888888',
      eyeColor: '#111111',
      scale: 1.0,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: false
    },
    behavior: {
      type: 'hostile',
      health: 20,
      speed: 2.3,
      attack: 4,
      followPlayer: false,
      range: 18
    },
    skills: ['archery'],
    eggColors: { primary: '#c1c1c1', secondary: '#494949' }
  },
  {
    id: 'creeper',
    name: 'Creeper',
    description: 'Silent explosive mob that sneaks up and detonates.',
    isBuiltin: true,
    look: {
      modelType: 'quadruped',
      mainColor: '#22c55e',
      accentColor: '#15803d',
      eyeColor: '#000000',
      scale: 1.0,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: false
    },
    behavior: {
      type: 'hostile',
      health: 20,
      speed: 2.4,
      attack: 15,
      followPlayer: false,
      range: 14
    },
    skills: ['explode'],
    eggColors: { primary: '#0da70b', secondary: '#000000' }
  },
  {
    id: 'iron_golem',
    name: 'Iron Golem',
    description: 'Mighty colossal guardian crafted from iron that defends villagers.',
    isBuiltin: true,
    look: {
      modelType: 'golem',
      mainColor: '#d1d5db',
      accentColor: '#65a30d',
      eyeColor: '#dc2626',
      scale: 1.35,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: false
    },
    behavior: {
      type: 'neutral',
      health: 100,
      speed: 2.0,
      attack: 12,
      followPlayer: false,
      range: 20
    },
    skills: ['knockup'],
    eggColors: { primary: '#d4d4d8', secondary: '#991b1b' }
  },
  {
    id: 'enderman',
    name: 'Enderman',
    description: 'Tall mysterious shadow creature that can teleport and gets angry when looked at.',
    isBuiltin: true,
    look: {
      modelType: 'humanoid',
      mainColor: '#111827',
      accentColor: '#374151',
      eyeColor: '#cc00ff',
      scale: 1.25,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: true
    },
    behavior: {
      type: 'neutral',
      health: 40,
      speed: 3.5,
      attack: 7,
      followPlayer: false,
      range: 24
    },
    skills: ['teleport'],
    eggColors: { primary: '#161616', secondary: '#cc00ff' }
  },
  {
    id: 'fire_dragon',
    name: 'Fire Dragon',
    description: 'Colossal flying beast that swoops from the skies, breathing devastating fireballs and ravaging the land like the Ender Dragon.',
    isBuiltin: true,
    look: {
      modelType: 'flying',
      mainColor: '#dc2626',
      accentColor: '#f97316',
      eyeColor: '#facc15',
      scale: 2.8,
      hasWings: true,
      hasHorns: true,
      hasGlowingEyes: true
    },
    behavior: {
      type: 'boss',
      health: 280,
      speed: 4.6,
      attack: 15,
      followPlayer: false,
      range: 60
    },
    skills: ['fireball', 'leap'],
    eggColors: { primary: '#dc2626', secondary: '#facc15' }
  },
  {
    id: 'robo_pet',
    name: 'Robo Pet',
    description: 'Loyal futuristic companion with glowing green sensors that follows and protects you.',
    isBuiltin: true,
    look: {
      modelType: 'quadruped',
      mainColor: '#0284c7',
      accentColor: '#38bdf8',
      eyeColor: '#22c55e',
      scale: 0.8,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: true
    },
    behavior: {
      type: 'pet',
      health: 50,
      speed: 3.5,
      attack: 6,
      followPlayer: true,
      range: 20
    },
    skills: ['laser', 'heal'],
    eggColors: { primary: '#0284c7', secondary: '#22c55e' }
  },
  {
    id: 'shadow_ninja',
    name: 'Shadow Ninja',
    description: 'Swift stealthy assassin that teleports behind foes and delivers rapid strikes.',
    isBuiltin: true,
    look: {
      modelType: 'humanoid',
      mainColor: '#18181b',
      accentColor: '#a855f7',
      eyeColor: '#c084fc',
      scale: 0.95,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: true
    },
    behavior: {
      type: 'hostile',
      health: 45,
      speed: 3.8,
      attack: 8,
      followPlayer: false,
      range: 22
    },
    skills: ['teleport', 'rapid_slash'],
    eggColors: { primary: '#18181b', secondary: '#a855f7' }
  },
  {
    id: 'pikachu',
    name: 'Pikachu',
    description: 'Iconic electric mouse Pokémon with pointed black-tipped ears, red cheeks, and a lightning bolt tail.',
    isBuiltin: true,
    look: {
      modelType: 'biped_creature',
      mainColor: '#f7d02c',
      accentColor: '#8b4513',
      eyeColor: '#111111',
      scale: 0.85,
      ears: 'pointed',
      earTipColor: '#111111',
      tail: 'lightning',
      tailColor: '#f7d02c',
      hasCheekPatches: true,
      cheekColor: '#e3342f',
      hasMouth: true,
      hasNose: true,
      hasBackStripes: true,
      hasWings: false,
      hasHorns: false,
      hasGlowingEyes: false
    },
    behavior: {
      type: 'pet',
      health: 45,
      speed: 3.6,
      attack: 6,
      followPlayer: true,
      range: 20
    },
    skills: ['lightning'],
    eggColors: { primary: '#f7d02c', secondary: '#8b4513' }
  }
];

const STORAGE_KEY = 'minecraft_mob_library_v1';

export class MobLibraryManager {
  constructor() {
    this.customMobs = new Map();
    this.listeners = new Set();
    this.loadFromStorage();
  }

  loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const mob of parsed) {
          if (mob && mob.id && mob.name) {
            this.customMobs.set(mob.id, mob);
          }
        }
      }
    } catch (err) {
      console.warn('[MobLibrary] Failed to load custom mobs from storage:', err);
    }
  }

  saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const serializable = Array.from(this.customMobs.values()).map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        look: m.look,
        behavior: m.behavior,
        skills: m.skills,
        eggColors: m.eggColors,
        createdAt: m.createdAt || Date.now()
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (err) {
      console.warn('[MobLibrary] Failed to save custom mobs to storage:', err);
    }
  }

  getAllMobs() {
    return [
      ...BUILTIN_MOBS,
      ...Array.from(this.customMobs.values())
    ];
  }

  getMob(idOrName) {
    if (!idOrName) return null;
    const target = String(idOrName).trim().toLowerCase();
    for (const mob of this.getAllMobs()) {
      if (mob.id.toLowerCase() === target || mob.name.toLowerCase() === target) {
        return mob;
      }
    }
    return null;
  }

  hasMob(name) {
    if (!name) return false;
    const target = String(name).trim().toLowerCase();
    return this.getAllMobs().some(m => m.name.toLowerCase() === target);
  }

  saveMob({ name, description, look, behavior, skills, eggColors }, overwrite = false) {
    const cleanName = (name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'EMPTY_NAME', message: 'Please enter a mob name.' };
    }

    const existing = this.getMob(cleanName);
    if (existing) {
      if (existing.isBuiltin) {
        return {
          success: false,
          error: 'BUILTIN_CONFLICT',
          message: `A built-in mob named "${cleanName}" already exists and cannot be overwritten. Please choose a different name.`
        };
      }
      if (!overwrite) {
        return {
          success: false,
          error: 'NAME_CONFLICT',
          message: `A mob named "${cleanName}" already exists in the global library. Please choose a different name.`
        };
      }

      // Overwrite existing custom mob
      const target = this.customMobs.get(existing.id);
      if (target) {
        target.description = description || `Custom ${cleanName} custom mob`;
        if (look) {
          target.look = {
            ...target.look,
            modelType: look.modelType || target.look.modelType,
            mainColor: look.mainColor || target.look.mainColor,
            accentColor: look.accentColor || target.look.accentColor,
            eyeColor: look.eyeColor || target.look.eyeColor,
            scale: look.scale !== undefined ? Number(look.scale) : target.look.scale,
            ears: look.ears !== undefined ? look.ears : target.look.ears,
            earTipColor: look.earTipColor !== undefined ? look.earTipColor : target.look.earTipColor,
            tail: look.tail !== undefined ? look.tail : target.look.tail,
            tailColor: look.tailColor !== undefined ? look.tailColor : target.look.tailColor,
            hasCheekPatches: look.hasCheekPatches !== undefined ? Boolean(look.hasCheekPatches) : target.look.hasCheekPatches,
            cheekColor: look.cheekColor !== undefined ? look.cheekColor : target.look.cheekColor,
            hasMouth: look.hasMouth !== undefined ? Boolean(look.hasMouth) : target.look.hasMouth,
            hasNose: look.hasNose !== undefined ? Boolean(look.hasNose) : target.look.hasNose,
            hasBackStripes: look.hasBackStripes !== undefined ? Boolean(look.hasBackStripes) : target.look.hasBackStripes,
            hasWings: look.hasWings !== undefined ? Boolean(look.hasWings) : target.look.hasWings,
            hasHorns: look.hasHorns !== undefined ? Boolean(look.hasHorns) : target.look.hasHorns,
            hasGlowingEyes: look.hasGlowingEyes !== undefined ? Boolean(look.hasGlowingEyes) : target.look.hasGlowingEyes,
            hasSnout: look.hasSnout !== undefined ? Boolean(look.hasSnout) : target.look.hasSnout
          };
        }
        if (behavior) {
          target.behavior = {
            ...target.behavior,
            type: behavior.type || target.behavior.type,
            health: behavior.health !== undefined ? Math.max(1, Number(behavior.health)) : target.behavior.health,
            speed: behavior.speed !== undefined ? Math.max(0.5, Number(behavior.speed)) : target.behavior.speed,
            attack: behavior.attack !== undefined ? Math.max(0, Number(behavior.attack)) : target.behavior.attack,
            followPlayer: behavior.followPlayer !== undefined ? Boolean(behavior.followPlayer) : target.behavior.followPlayer,
            range: behavior.range !== undefined ? Number(behavior.range) : target.behavior.range
          };
        }
        if (skills !== undefined) {
          target.skills = Array.isArray(skills) ? [...skills] : [];
        }
        if (eggColors) {
          target.eggColors = eggColors;
        }
        target.updatedAt = Date.now();

        this.saveToStorage();
        this.notifyListeners();
        return { success: true, mob: target, overwritten: true };
      }
    }

    const id = `custom_mob_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
    const mob = {
      id,
      name: cleanName,
      description: description || `Custom ${cleanName} custom mob`,
      isBuiltin: false,
      look: {
        modelType: look?.modelType || 'humanoid',
        mainColor: look?.mainColor || '#8b5cf6',
        accentColor: look?.accentColor || '#ec4899',
        eyeColor: look?.eyeColor || '#facc15',
        scale: look?.scale !== undefined ? Number(look.scale) : 1.0,
        ears: look?.ears || 'none',
        earTipColor: look?.earTipColor || null,
        tail: look?.tail || 'none',
        tailColor: look?.tailColor || null,
        hasCheekPatches: Boolean(look?.hasCheekPatches),
        cheekColor: look?.cheekColor || '#e3342f',
        hasMouth: Boolean(look?.hasMouth),
        hasNose: Boolean(look?.hasNose),
        hasBackStripes: Boolean(look?.hasBackStripes),
        hasWings: Boolean(look?.hasWings),
        hasHorns: Boolean(look?.hasHorns),
        hasGlowingEyes: Boolean(look?.hasGlowingEyes),
        hasSnout: look?.hasSnout !== undefined ? Boolean(look.hasSnout) : undefined
      },
      behavior: {
        type: behavior?.type || 'hostile',
        health: behavior?.health !== undefined ? Math.max(1, Number(behavior.health)) : 30,
        speed: behavior?.speed !== undefined ? Math.max(0.5, Number(behavior.speed)) : 2.5,
        attack: behavior?.attack !== undefined ? Math.max(0, Number(behavior.attack)) : 4,
        followPlayer: Boolean(behavior?.followPlayer || behavior?.type === 'pet'),
        range: behavior?.range !== undefined ? Number(behavior.range) : 18
      },
      skills: Array.isArray(skills) ? [...skills] : [],
      eggColors: eggColors || {
        primary: look?.mainColor || '#8b5cf6',
        secondary: look?.accentColor || '#ec4899'
      },
      createdAt: Date.now()
    };

    this.customMobs.set(id, mob);
    this.saveToStorage();
    this.notifyListeners();

    return { success: true, mob };
  }

  renameMob(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) {
      return { success: false, error: 'EMPTY_NAME', message: 'Please enter a mob name.' };
    }

    const target = this.customMobs.get(id);
    if (!target) {
      const builtin = BUILTIN_MOBS.find(m => m.id === id);
      if (builtin) {
        return { success: false, error: 'BUILTIN_READONLY', message: 'Built-in mobs cannot be renamed.' };
      }
      return { success: false, error: 'NOT_FOUND', message: 'Mob not found.' };
    }

    if (target.name.toLowerCase() === cleanName.toLowerCase()) {
      target.name = cleanName;
      this.saveToStorage();
      this.notifyListeners();
      return { success: true, mob: target };
    }

    if (this.hasMob(cleanName)) {
      return {
        success: false,
        error: 'NAME_CONFLICT',
        message: `A mob named "${cleanName}" already exists in the global library.`
      };
    }

    target.name = cleanName;
    target.updatedAt = Date.now();
    this.saveToStorage();
    this.notifyListeners();
    return { success: true, mob: target };
  }

  saveCustomMob(mobData) {
    return this.saveMob(mobData);
  }

  deleteMob(id) {
    if (this.customMobs.has(id)) {
      this.customMobs.delete(id);
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    return () => {};
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('[MobLibrary] Error in listener:', err);
      }
    }
  }

  /**
   * Helper to generate a procedural SVG / data URL icon for the spawn egg.
   */
  generateEggIcon(primaryColor = '#8b5cf6', secondaryColor = '#ec4899') {
    // Generate clean Minecraft-style spawn egg SVG
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges">
        <!-- Egg Outline / Base -->
        <rect x="5" y="1" width="6" height="1" fill="${primaryColor}"/>
        <rect x="4" y="2" width="8" height="2" fill="${primaryColor}"/>
        <rect x="3" y="4" width="10" height="7" fill="${primaryColor}"/>
        <rect x="4" y="11" width="8" height="3" fill="${primaryColor}"/>
        <rect x="5" y="14" width="6" height="1" fill="${primaryColor}"/>
        <!-- Spots / Highlights -->
        <rect x="5" y="3" width="2" height="2" fill="${secondaryColor}"/>
        <rect x="9" y="4" width="2" height="2" fill="${secondaryColor}"/>
        <rect x="4" y="7" width="2" height="2" fill="${secondaryColor}"/>
        <rect x="8" y="8" width="3" height="2" fill="${secondaryColor}"/>
        <rect x="5" y="11" width="2" height="2" fill="${secondaryColor}"/>
        <rect x="9" y="12" width="2" height="2" fill="${secondaryColor}"/>
      </svg>
    `.trim();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

export const MobLibrary = new MobLibraryManager();
