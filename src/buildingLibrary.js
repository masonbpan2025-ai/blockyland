import { BLOCKS } from './blocks.js';
import { BUILTIN_BUILDINGS } from './buildings/index.js';

const STORAGE_KEY = 'minecraft_building_library_v1';
const OVERRIDES_KEY = 'minecraft_building_library_overrides_v1';

// The Studio was called Structure Studio when these keys were written. Read them once so a player's
// saved buildings survive the rename; nothing writes the old names any more, and the next save
// migrates the data into the new keys.
const LEGACY_STORAGE_KEY = 'minecraft_structure_library_v1';
const LEGACY_OVERRIDES_KEY = 'minecraft_structure_library_overrides_v1';

export class BuildingLibraryManager {
  constructor() {
    this.customBuildings = new Map();
    this.deletedBuiltins = new Set();
    this.renamedBuiltins = new Map();
    this.listeners = new Set();
    this.loadFromStorage();
  }

  loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id && item.name) {
              // Compile generator function from code string
              const genFn = this.compileGenerator(item.code);
              this.customBuildings.set(item.id, {
                ...item,
                generate: genFn
              });
            }
          }
        }
      }
      const rawOverrides = localStorage.getItem(OVERRIDES_KEY) ?? localStorage.getItem(LEGACY_OVERRIDES_KEY);
      if (rawOverrides) {
        const parsed = JSON.parse(rawOverrides);
        if (Array.isArray(parsed.deleted)) {
          this.deletedBuiltins = new Set(parsed.deleted);
        }
        if (parsed.renamed && typeof parsed.renamed === 'object') {
          this.renamedBuiltins = new Map(Object.entries(parsed.renamed));
        }
      }
    } catch (err) {
      console.warn('[BuildingLibrary] Failed to load from storage:', err);
    }
  }

  saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const serializable = Array.from(this.customBuildings.values()).map(st => ({
        id: st.id,
        name: st.name,
        icon: st.icon || '/assets/blocks/crafting_table_top.png',
        description: st.description || 'Custom user building',
        parameters: st.parameters || [],
        code: st.code || '',
        createdAt: st.createdAt || Date.now()
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));

      const overrides = {
        deleted: Array.from(this.deletedBuiltins),
        renamed: Object.fromEntries(this.renamedBuiltins.entries())
      };
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    } catch (err) {
      console.warn('[BuildingLibrary] Failed to save to storage:', err);
    }
  }

  compileGenerator(codeString) {
    if (!codeString || typeof codeString !== 'string') {
      return (origin, params, B = BLOCKS) => [];
    }
    try {
      // Evaluate function definition
      const wrapped = new Function('BLOCKS', `
        ${codeString}
        if (typeof generate === 'function') return generate;
        return (origin, params, B) => [];
      `);
      return wrapped(BLOCKS);
    } catch (err) {
      console.error('[BuildingLibrary] Failed to compile generator code:', err);
      return (origin, params, B = BLOCKS) => [];
    }
  }

  getAllBuildings() {
    const builtins = BUILTIN_BUILDINGS
      .filter(s => !this.deletedBuiltins.has(s.id))
      .map(s => {
        const renamed = this.renamedBuiltins.get(s.id);
        return {
          ...s,
          name: renamed || s.name,
          isBuiltin: true
        };
      });
    const customs = Array.from(this.customBuildings.values()).map(st => ({ ...st, isBuiltin: false }));
    return [...builtins, ...customs];
  }

  getBuilding(idOrName) {
    if (!idOrName) return null;
    const target = String(idOrName).trim().toLowerCase();
    for (const st of this.getAllBuildings()) {
      if (st.id.toLowerCase() === target || st.name.toLowerCase() === target) {
        return st;
      }
    }
    return null;
  }

  hasBuilding(name) {
    if (!name) return false;
    const target = String(name).trim().toLowerCase();
    return this.getAllBuildings().some(st => st.name.toLowerCase() === target);
  }

  saveBuilding({ name, parameters, code, generatorCode, icon, description }, overwrite = false) {
    const cleanName = (name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'EMPTY_NAME', message: 'Please enter a building name.' };
    }

    const existing = this.getBuilding(cleanName);
    if (existing) {
      if (existing.isBuiltin) {
        return {
          success: false,
          error: 'BUILTIN_CONFLICT',
          message: `A built-in building named "${cleanName}" already exists and cannot be overwritten. Please choose a different name.`
        };
      }
      if (!overwrite) {
        return {
          success: false,
          error: 'NAME_CONFLICT',
          message: `A building named "${cleanName}" already exists. Please choose a different name.`
        };
      }

      // Overwrite existing custom building
      const target = this.customBuildings.get(existing.id);
      if (target) {
        const buildingCode = code || generatorCode || '';
        const genFn = this.compileGenerator(buildingCode);
        target.parameters = parameters || [];
        target.code = buildingCode;
        target.generate = genFn;
        if (icon) target.icon = icon;
        if (description) target.description = description;
        target.updatedAt = Date.now();

        this.saveToStorage();
        this.notifyListeners();
        return { success: true, building: target, structure: target, overwritten: true };
      }
    }

    const buildingCode = code || generatorCode || '';
    const id = `custom_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
    const genFn = this.compileGenerator(buildingCode);

    const building = {
      id,
      name: cleanName,
      icon: icon || '/assets/blocks/crafting_table_top.png',
      description: description || `Custom ${cleanName} building`,
      parameters: parameters || [],
      code: buildingCode,
      generate: genFn,
      isBuiltin: false,
      createdAt: Date.now()
    };

    this.customBuildings.set(id, building);
    this.saveToStorage();
    this.notifyListeners();

    return { success: true, building, structure: building };
  }

  renameBuilding(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) {
      return { success: false, error: 'EMPTY_NAME', message: 'Please enter a building name.' };
    }

    const existing = this.getBuilding(cleanName);
    if (existing && existing.id !== id) {
      return {
        success: false,
        error: 'NAME_CONFLICT',
        message: `A building named "${cleanName}" already exists.`
      };
    }

    const target = this.customBuildings.get(id);
    if (target) {
      target.name = cleanName;
      target.updatedAt = Date.now();
      this.saveToStorage();
      this.notifyListeners();
      return { success: true, building: target, structure: target };
    }

    const builtin = BUILTIN_BUILDINGS.find(s => s.id === id);
    if (builtin) {
      this.renamedBuiltins.set(id, cleanName);
      this.saveToStorage();
      this.notifyListeners();
      return { success: true, building: { ...builtin, name: cleanName }, structure: { ...builtin, name: cleanName } };
    }

    return { success: false, error: 'NOT_FOUND', message: 'Building not found.' };
  }

  saveCustomBuilding(data) {
    const res = this.saveBuilding(data);
    if (!res.success) {
      throw new Error(res.message || 'Building with that name already exists.');
    }
    return res.building;
  }

  deleteBuilding(id) {
    if (this.customBuildings.has(id)) {
      this.customBuildings.delete(id);
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    const builtin = BUILTIN_BUILDINGS.find(s => s.id === id);
    if (builtin) {
      this.deletedBuiltins.add(id);
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  restoreDefaults() {
    this.deletedBuiltins.clear();
    this.renamedBuiltins.clear();
    this.saveToStorage();
    this.notifyListeners();
    return true;
  }

  hasDeletedOrRenamedDefaults() {
    return this.deletedBuiltins.size > 0 || this.renamedBuiltins.size > 0;
  }

  executeBuildingBuild(building, origin, params, world) {
    if (!building || typeof building.generate !== 'function') return [];
    const resolvedParams = {};
    if (Array.isArray(building.parameters)) {
      for (const p of building.parameters) {
        resolvedParams[p.id] = params && params[p.id] !== undefined ? params[p.id] : p.default;
      }
    }
    const blocks = building.generate(origin, resolvedParams, BLOCKS) || [];
    if (world && typeof world.setVoxel === 'function') {
      for (const b of blocks) {
        world.setVoxel(b.x, b.y, b.z, b.id);
      }
    }
    return blocks;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[BuildingLibrary] Listener error:', err);
      }
    }
  }
}

export const BuildingLibrary = new BuildingLibraryManager();
export default BuildingLibrary;
