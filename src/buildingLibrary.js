import { BLOCKS } from './blocks.js';
import { BUILTIN_STRUCTURES } from './buildings/index.js';

const STORAGE_KEY = 'minecraft_structure_library_v1';
const OVERRIDES_KEY = 'minecraft_structure_library_overrides_v1';

export class StructureLibraryManager {
  constructor() {
    this.customStructures = new Map();
    this.deletedBuiltins = new Set();
    this.renamedBuiltins = new Map();
    this.listeners = new Set();
    this.loadFromStorage();
  }

  loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id && item.name) {
              // Compile generator function from code string
              const genFn = this.compileGenerator(item.code);
              this.customStructures.set(item.id, {
                ...item,
                generate: genFn
              });
            }
          }
        }
      }
      const rawOverrides = localStorage.getItem(OVERRIDES_KEY);
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
      console.warn('[StructureLibrary] Failed to load from storage:', err);
    }
  }

  saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const serializable = Array.from(this.customStructures.values()).map(st => ({
        id: st.id,
        name: st.name,
        icon: st.icon || '/assets/blocks/crafting_table_top.png',
        description: st.description || 'Custom user structure',
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
      console.warn('[StructureLibrary] Failed to save to storage:', err);
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
      console.error('[StructureLibrary] Failed to compile generator code:', err);
      return (origin, params, B = BLOCKS) => [];
    }
  }

  getAllStructures() {
    const builtins = BUILTIN_STRUCTURES
      .filter(s => !this.deletedBuiltins.has(s.id))
      .map(s => {
        const renamed = this.renamedBuiltins.get(s.id);
        return {
          ...s,
          name: renamed || s.name,
          isBuiltin: true
        };
      });
    const customs = Array.from(this.customStructures.values()).map(st => ({ ...st, isBuiltin: false }));
    return [...builtins, ...customs];
  }

  getStructure(idOrName) {
    if (!idOrName) return null;
    const target = String(idOrName).trim().toLowerCase();
    for (const st of this.getAllStructures()) {
      if (st.id.toLowerCase() === target || st.name.toLowerCase() === target) {
        return st;
      }
    }
    return null;
  }

  hasStructure(name) {
    if (!name) return false;
    const target = String(name).trim().toLowerCase();
    return this.getAllStructures().some(st => st.name.toLowerCase() === target);
  }

  saveStructure({ name, parameters, code, generatorCode, icon, description }, overwrite = false) {
    const cleanName = (name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'EMPTY_NAME', message: 'Please enter a structure name.' };
    }

    const existing = this.getStructure(cleanName);
    if (existing) {
      if (existing.isBuiltin) {
        return {
          success: false,
          error: 'BUILTIN_CONFLICT',
          message: `A built-in structure named "${cleanName}" already exists and cannot be overwritten. Please choose a different name.`
        };
      }
      if (!overwrite) {
        return {
          success: false,
          error: 'NAME_CONFLICT',
          message: `A structure named "${cleanName}" already exists. Please choose a different name.`
        };
      }

      // Overwrite existing custom structure
      const target = this.customStructures.get(existing.id);
      if (target) {
        const structureCode = code || generatorCode || '';
        const genFn = this.compileGenerator(structureCode);
        target.parameters = parameters || [];
        target.code = structureCode;
        target.generate = genFn;
        if (icon) target.icon = icon;
        if (description) target.description = description;
        target.updatedAt = Date.now();

        this.saveToStorage();
        this.notifyListeners();
        return { success: true, structure: target, overwritten: true };
      }
    }

    const structureCode = code || generatorCode || '';
    const id = `custom_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
    const genFn = this.compileGenerator(structureCode);

    const structure = {
      id,
      name: cleanName,
      icon: icon || '/assets/blocks/crafting_table_top.png',
      description: description || `Custom ${cleanName} structure`,
      parameters: parameters || [],
      code: structureCode,
      generate: genFn,
      isBuiltin: false,
      createdAt: Date.now()
    };

    this.customStructures.set(id, structure);
    this.saveToStorage();
    this.notifyListeners();

    return { success: true, structure };
  }

  renameStructure(id, newName) {
    const cleanName = (newName || '').trim();
    if (!cleanName) {
      return { success: false, error: 'EMPTY_NAME', message: 'Please enter a structure name.' };
    }

    const existing = this.getStructure(cleanName);
    if (existing && existing.id !== id) {
      return {
        success: false,
        error: 'NAME_CONFLICT',
        message: `A structure named "${cleanName}" already exists.`
      };
    }

    const target = this.customStructures.get(id);
    if (target) {
      target.name = cleanName;
      target.updatedAt = Date.now();
      this.saveToStorage();
      this.notifyListeners();
      return { success: true, structure: target };
    }

    const builtin = BUILTIN_STRUCTURES.find(s => s.id === id);
    if (builtin) {
      this.renamedBuiltins.set(id, cleanName);
      this.saveToStorage();
      this.notifyListeners();
      return { success: true, structure: { ...builtin, name: cleanName } };
    }

    return { success: false, error: 'NOT_FOUND', message: 'Structure not found.' };
  }

  saveCustomStructure(data) {
    const res = this.saveStructure(data);
    if (!res.success) {
      throw new Error(res.message || 'Structure with that name already exists.');
    }
    return res.structure;
  }

  deleteStructure(id) {
    if (this.customStructures.has(id)) {
      this.customStructures.delete(id);
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    const builtin = BUILTIN_STRUCTURES.find(s => s.id === id);
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

  executeStructureBuild(structure, origin, params, world) {
    if (!structure || typeof structure.generate !== 'function') return [];
    const resolvedParams = {};
    if (Array.isArray(structure.parameters)) {
      for (const p of structure.parameters) {
        resolvedParams[p.id] = params && params[p.id] !== undefined ? params[p.id] : p.default;
      }
    }
    const blocks = structure.generate(origin, resolvedParams, BLOCKS) || [];
    if (world && typeof world.setVoxel === 'function') {
      for (const b of blocks) {
        world.setVoxel(b.x, b.y, b.z, b.id);
      }
    }
    return blocks;
  }

  /**
   * The building-vocabulary names for the same operations.
   *
   * The building/structure rename reached `main.js` before it reached this file. `main.js` imports
   * `BuildingLibrary` and calls `getBuilding` and `executeBuildingBuild`; `buildingStudio.js`, the
   * creative catalogue and `inventory.js` still call `getStructure` and `executeStructureBuild`. Only the
   * new spelling is missing, so it is spelled out here rather than by renaming twenty-eight call sites in
   * another branch's in-flight work -- and because `main.js` imports a name this module did not export,
   * the whole game failed to load: `SyntaxError: The requested module './buildingLibrary.js' does not
   * provide an export named 'BuildingLibrary'`.
   *
   * Both spellings reach the same instance and the same state. When the rename is finished, these three
   * methods are what gets deleted.
   */
  getBuilding(idOrName) { return this.getStructure(idOrName); }

  getAllBuildings() { return this.getAllStructures(); }

  executeBuildingBuild(building, origin, params, world) {
    return this.executeStructureBuild(building, origin, params, world);
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
        console.error('[StructureLibrary] Listener error:', err);
      }
    }
  }
}

export const StructureLibrary = new StructureLibraryManager();
/** The same instance under the name `main.js` imports. See `getBuilding` for why both exist. */
export const BuildingLibrary = StructureLibrary;
export default StructureLibrary;
