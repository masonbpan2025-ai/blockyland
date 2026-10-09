import { serializeWitherSkeleton, restoreWitherSkeleton } from './witherSkeleton.js';
import { serializeSquid, restoreSquid } from './squidBehavior.js';
import {serializeZombified,restoreZombified,restoreZombifiedLinks,isZombifiedPiglin} from './zombifiedPiglin.js';
import { serializeStrider, restoreStrider, attachStriderPassenger } from './striderBehavior.js';
import { serializeHorse, restoreHorse } from './horseBehavior.js';
import { serializeMobState, restoreMobState, mobAppearanceRestorers } from './mobState.js';
import { sheepApplyWool } from './sheepBehavior.js';
import { applyMooshroomVariant } from './mooshroomBehavior.js';
import { applyRabbitCoat, applyRabbitName } from './rabbitBehavior.js';
import * as THREE from 'three';
import { Chunk } from './world.js';

/**
 * Re-apply variant appearance after a load, so a restored mob looks like what was saved rather
 * than like a fresh default spawn.
 */
const restoreMobAppearance = mobAppearanceRestorers({
  sheepApplyWool,
  applyMooshroomVariant,
  applyRabbitCoat,
  applyRabbitName
});

/**
 * Run-length encode a Uint8Array of voxels.
 * A 16,384-element chunk voxel buffer compresses to ~30-80 [blockId, count] pairs.
 */
export function encodeVoxelsRLE(voxels) {
  if (!voxels || voxels.length === 0) return [];
  const rle = [];
  let currentVal = voxels[0];
  let currentCount = 1;
  for (let i = 1; i < voxels.length; i++) {
    const v = voxels[i];
    if (v === currentVal) {
      currentCount++;
    } else {
      rle.push(currentVal, currentCount);
      currentVal = v;
      currentCount = 1;
    }
  }
  rle.push(currentVal, currentCount);
  return rle;
}

/**
 * Decode RLE pairs into a destination Uint8Array.
 */
export function decodeVoxelsRLE(rle, targetArray) {
  if (!rle || !targetArray) return;
  let idx = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const val = rle[i];
    const count = rle[i + 1];
    targetArray.fill(val, idx, idx + count);
    idx += count;
  }
}

/**
 * Serializes the current game state into a complete, portable map JSON object.
 */
import {
  SAVE_VERSION, LEGACY_DEFAULTS, captureSessionState, capturePlayerState, captureInventoryState,
  applyPlayerState, applyInventoryState, applySessionState, migrateSave,
} from './saveSchema.js';

export function serializeWorld(game, mapName = 'World 1') {
  const chunksData = [];
  for (const chunk of game.world.chunks.values()) {
    chunksData.push({
      cx: chunk.cx,
      cz: chunk.cz,
      voxels: encodeVoxelsRLE(chunk.voxels),
      waterLevels: encodeVoxelsRLE(chunk.waterLevels)
    });
  }

  const mobsData = (game.mobs?.mobs || []).map(mob => ({
    type: mob.type,
    position: {
      x: Number(mob.mesh.position.x.toFixed(3)),
      y: Number(mob.mesh.position.y.toFixed(3)),
      z: Number(mob.mesh.position.z.toFixed(3))
    },
    yaw: Number((mob.yaw || 0).toFixed(3)),
    equine: serializeHorse(mob),
    zombified: serializeZombified(mob,game.mobs),
    strider: serializeStrider(mob),
    squid: serializeSquid(mob),
    witherSkeleton: serializeWitherSkeleton(mob),
    striderVehicle: mob.vehicle?.type==='strider' ? game.mobs.mobs.indexOf(mob.vehicle) : undefined,
    // Everything the per-mob blobs above do not cover: age, taming, variants, timers and roles.
    state: serializeMobState(mob, game),
    health: mob.health ?? 20
  }));

  const mapData = {
    redstone: game.world.redstone?.serialize() || [],
    format: 'minecraft-web-map',
    // Bumped to the schema these captures come from. `migrateSave` brings older files forward on load.
    version: SAVE_VERSION,
    name: mapName.trim() || 'World 1',
    worldType: game.worldType || (game.mechanisms?.currentMechanismId !== 'default' ? 'designed' : 'generated'),
    mechanism: game.mechanisms?.currentMechanismId || 'default',
    mechanismName: game.mechanisms?.currentMechanism?.name || 'Default',
    savedAt: new Date().toISOString(),
    seed: game.world.seed,
    worldTime: Math.round(game.worldTime),
    weather: {
      isRaining: Boolean(game.weather?.isRaining),
      rainIntensity: Number((game.weather?.rainIntensity || 0).toFixed(2))
    },
    // Everything Survival keeps that v1 did not write down.
    session: captureSessionState(game),
    player: {
      position: {
        x: Number(game.player.position.x.toFixed(3)),
        y: Number(game.player.position.y.toFixed(3)),
        z: Number(game.player.position.z.toFixed(3))
      },
      velocity: {
        x: Number(game.player.velocity.x.toFixed(3)),
        y: Number(game.player.velocity.y.toFixed(3)),
        z: Number(game.player.velocity.z.toFixed(3))
      },
      yaw: Number(game.player.yaw.toFixed(3)),
      pitch: Number(game.player.pitch.toFixed(3)),
      gamemode: game.player.gamemode || 'survival',
      health: game.player.health,
      hunger: game.player.hunger,
      exp: game.player.exp,
      level: game.player.level,
      // saturation, exhaustion, absorption, breath, effects, the bed binding and the dead/drop state.
      ...capturePlayerState(game.player),
    },
    inventory: captureInventoryState(game.inventory),
    chunks: chunksData,
    mobs: mobsData,
    gemini: {
      builtStructures: (game.geminiAgent?.builtStructures || []).map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        min: s.min,
        max: s.max,
        center: s.center,
        createdPrompt: s.createdPrompt,
        timestamp: s.timestamp
      })),
      lastBuiltStructure: game.geminiAgent?.lastBuiltStructure || null,
      conversationHistory: game.geminiAgent?.conversationHistory || []
    }
  };

  return mapData;
}

/**
 * Deserializes map data and completely reconstructs the world inside the running game.
 */
export function deserializeWorld(game, mapData, options = {}) {
  if (!mapData || !mapData.chunks) {
    throw new Error('Invalid map file format: missing chunks data');
  }
  // Bring an older file up to the current shape before anything reads it. v1 simply lacks the Survival and
  // inventory fields, so the migration is a version bump; the field defaults live in `saveSchema`.
  migrateSave(mapData);
  // Optional progress hook. Kept synchronous on purpose: callers and tests rely
  // on the world being fully restored when this returns.
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const report = (percent, stage) => { if (progress) progress(percent, stage); };

  const isTournament = (mapData.name && mapData.name.toLowerCase().includes('tournament')) ||
                       (mapData.mechanism === 'dragonball_tournament') ||
                       (mapData.gemini?.builtStructures?.some(s => s.type === 'tournament_arena' || s.id?.includes('tournament')));
  const targetWorldType = mapData.worldType || (isTournament ? 'designed' : 'generated');
  const targetMechanismId = mapData.mechanism || (isTournament ? 'dragonball_tournament' : 'default');
  game.worldType = targetWorldType;
  game.worldGenerated = true;
  // Marks the world as safe to enter, so the entry point does not hide the
  // progress overlay while blocks are still being restored.
  game.worldReady = true;

  // 1. Clean up old chunk meshes from the 3D scene
  for (const chunk of game.world.chunks.values()) {
    for (const key of ['opaqueMesh', 'transparentMesh', 'waterMesh', 'lightMesh']) {
      if (chunk[key]) {
        game.scene.remove(chunk[key]);
        chunk[key].geometry.dispose();
        chunk[key] = null;
      }
    }
  }
  game.world.chunks.clear();
  game.world.water?.reset();

  // 2. Clean up dynamic block lights
  if (game.blockLighting?.chunks) {
    game.blockLighting.chunks.clear();
    game.blockLighting.dirty = true;
  }

  // 3. Clear mobs
  if (game.mobs?.clearMobs) {
    game.mobs.clearMobs();
  }

  // 4. Reseed world noise
  const seed = mapData.seed || 4289;
  game.world.reseed(seed);

  const totalChunks = mapData.chunks.length;
  report(5, `Reading map data (${totalChunks} chunks)`);

  // 5. Reconstruct all chunks with RLE-decompressed voxels
  for (const chunkData of mapData.chunks) {
    const chunk = new Chunk(chunkData.cx, chunkData.cz);
    decodeVoxelsRLE(chunkData.voxels, chunk.voxels);
    if (chunkData.waterLevels) decodeVoxelsRLE(chunkData.waterLevels, chunk.waterLevels);
    for (let i=0; i<chunk.waterLevels.length; i++) if (chunk.waterLevels[i]>8) chunk.waterLevels[i]=0;
    chunk.dirty = true;
    game.world.chunks.set(game.world.chunkKey(chunk.cx, chunk.cz), chunk);
  }

  report(45, `Decoded ${totalChunks} chunks`);

  for (const chunk of game.world.chunks.values()) game.world.water?.initChunk(chunk);

  game.world.redstone?.restore(mapData.redstone);
  report(60, 'Initialising fluids');

  // 6. Restore player state
  if (mapData.player) {
    const p = mapData.player;
    game.player.position.set(p.position.x, p.position.y, p.position.z);
    game.player.velocity.set(p.velocity?.x || 0, p.velocity?.y || 0, p.velocity?.z || 0);
    game.player.yaw = p.yaw ?? Math.PI;
    game.player.pitch = p.pitch ?? -0.05;
    if (isTournament || targetMechanismId === 'dragonball_tournament') {
      game.player.setGameMode?.('survival');
      game.player.isFlying = false;
    } else {
      // Through `setGameMode`, so the abilities follow the restored mode instead of whatever flags the
      // running session happened to have.
      const restoredMode = p.gamemode || LEGACY_DEFAULTS.gamemode;
      if (game.player.setGameMode) game.player.setGameMode(restoredMode);
      else game.player.gamemode = restoredMode;
    }
    game.player.health = p.health ?? LEGACY_DEFAULTS.health;
    game.player.hunger = p.hunger ?? LEGACY_DEFAULTS.hunger;
    game.player.exp = p.exp ?? LEGACY_DEFAULTS.exp;
    game.player.level = p.level ?? LEGACY_DEFAULTS.level;
    // saturation, exhaustion, absorption, breath, effects, the bed binding and the dead/drop state. A
    // missing hunger or saturation takes the DOCUMENTED default, not a full bar -- v1 simply did not save
    // them, and defaulting them to 20 arrived well fed.
    applyPlayerState(game.player, p, {
      makeVector: (x, y, z) => new THREE.Vector3(x, y, z),
    });

    // Apply rotation to camera
    if (game.camera) {
      if (game.camera.up?.set) game.camera.up.set(0, 1, 0);
      if (game.camera.rotation?.set) {
        game.camera.rotation.order = 'YXZ';
        game.camera.rotation.set(game.player.pitch, game.player.yaw, 0);
      } else if (game.camera.quaternion?.setFromEuler) {
        const euler = new THREE.Euler(game.player.pitch, game.player.yaw, 0, 'YXZ');
        game.camera.quaternion.setFromEuler(euler);
      }
    }
    game.player.update(0);
  }

  // 7. Restore inventory
  //
  // Unconditional, and it REPLACES rather than merges. The old `if (mapData.inventory)` guard skipped the
  // block for a save with no inventory, which left whatever the running session already had in the hotbar --
  // so loading a legacy save kept the previous world's gear. A save with no inventory now means empty.
  applyInventoryState(game.inventory, mapData.inventory);
  if (game.ui?.updateHotbar) game.ui.updateHotbar();

  // 7b. Session settings: difficulty, dimension, day count, gamerules and the mode.
  applySessionState(game, mapData.session);

  // 8. Restore time and weather
  if (mapData.worldTime !== undefined) {
    game.worldTime = mapData.worldTime;
  }
  if (mapData.weather && game.weather?.setWeather) {
    game.weather.setWeather(mapData.weather.isRaining ? 'rain' : 'clear');
  }

  const restoredMobs=[];
  // 9. Restore mobs
  if (mapData.mobs && mapData.mobs.length > 0 && game.mobs?.spawnMob) {
    report(72, `Spawning ${mapData.mobs.length} mobs`);
    for (const [recordIndex,m] of mapData.mobs.entries()) {
      try {
        const spawned = isZombifiedPiglin(m.type)?game.mobs.spawnZombifiedPiglin(m.position.x,m.position.y,m.position.z,{natural:false}):m.type==='strider'?game.mobs.spawnStrider(m.position.x,m.position.y,m.position.z,{natural:false}):game.mobs.spawnMob(m.type, m.position.x, m.position.y, m.position.z);
        restoredMobs[recordIndex]=spawned;
        restoreStrider(spawned,m.strider);
        restoreSquid(spawned,m.squid);
        restoreWitherSkeleton(spawned,m.witherSkeleton);
        if (spawned && m.health) {
          spawned.health = m.health;
          spawned.maxHealth = Math.max(spawned.maxHealth || m.health, m.health);
          restoreHorse(spawned,m.equine,game.mobs);
          restoreZombified(spawned,m.zombified,game.mobs);
        }
        // Applied after the health clamp above, since a restored wolf's maximum health depends
        // on whether it is tamed and its current health must be clamped to that.
        restoreMobState(spawned, m.state, { player: game.player, applyAppearance: restoreMobAppearance });
      } catch (err) {
        restoredMobs[recordIndex]=null;
        console.warn(`Could not spawn mob ${m.type}:`, err);
      }
    }
  }

  for(let i=0;i<(mapData.mobs?.length||0);i++)restoreZombifiedLinks(restoredMobs[i],mapData.mobs[i].zombified,restoredMobs);

  for(let i=0;i<(mapData.mobs?.length||0);i++){
    const vehicle=mapData.mobs[i].striderVehicle;
    if(Number.isInteger(vehicle)&&restoredMobs?.[vehicle]?.type==='strider'&&restoredMobs[i])attachStriderPassenger(restoredMobs[vehicle],restoredMobs[i]);
  }
  // 10. Restore Gemini AI memory
  if (mapData.gemini && game.geminiAgent) {
    game.geminiAgent.builtStructures = mapData.gemini.builtStructures || [];
    game.geminiAgent.lastBuiltStructure = mapData.gemini.lastBuiltStructure || null;
    game.geminiAgent.conversationHistory = mapData.gemini.conversationHistory || [];
  }

  // 11. Re-mesh all loaded chunks around the player
  report(85, 'Building chunk meshes');
  game.loadChunksAroundPlayer();
  for (const chunk of game.world.chunks.values()) {
    game.rebuildChunkMesh(chunk);
  }
  report(98, 'Finalising');

  // 12. Update UI
  if (game.ui) {
    if (game.ui.updateStats) game.ui.updateStats();
    if (typeof document !== 'undefined') {
      const btnGamemode = document.getElementById('btn-gamemode');
      if (btnGamemode) {
        btnGamemode.textContent = `Game Mode: ${game.player.gamemode.charAt(0).toUpperCase() + game.player.gamemode.slice(1)}`;
      }
      const dbgMode = document.getElementById('dbg-mode');
      if (dbgMode) {
        dbgMode.textContent = `Mode: ${game.player.gamemode.charAt(0).toUpperCase() + game.player.gamemode.slice(1)}`;
      }
    }
    if (game.ui.addChatMessage) {
      const typeLabel = targetWorldType === 'designed' ? 'Designed World' : 'World';
      game.ui.addChatMessage(`Loaded ${typeLabel}: "${mapData.name}"`, 'system');
    }
  }

  // 13. World Mechanism activation & reset
  if (game.mechanisms) {
    game.mechanisms.setMechanism(targetMechanismId, game, mapData);
  } else {
    // Fallback if mechanism manager not attached
    if (game.tournament) {
      game.tournament.reset();
      if (isTournament) {
        game.tournament.isTournamentMap = true;
        game.tournament.ensureHost();
      } else {
        game.tournament.isTournamentMap = false;
        game.tournament.cleanup?.();
      }
    }
    if (game.dragonballSkills) {
      game.dragonballSkills.reset();
    }
    if (game.trainingSites) {
      game.trainingSites.reset();
      if (isTournament) {
        game.trainingSites.ensureSiteManagers();
      } else {
        game.trainingSites.cleanup?.();
      }
    }
    if (game.dungeonMode) {
      game.dungeonMode.reset();
    }
  }

  return true;
}

/**
 * Fetch default directory path info from server.
 */
export async function getDefaultPathInfo() {
  try {
    const res = await fetch('/api/saves-info');
    if (res.ok) {
      const data = await res.json();
      return data.defaultPath;
    }
  } catch (e) {
    // offline fallback
  }
  return 'saves/ (Local Computer Folder)';
}

export const CURATED_DESIGNED_WORLDS = [
  {
    name: 'World Martial Arts Tournament',
    filename: 'World_Martial_Arts_Tournament.json',
    description: 'Authentic Tenkaichi Budokai arena with 4 training sites, Goku Ki skills (Kamehameha/Genki Dama), Jackie Chun boss battle, and 2-Player mode.',
    worldType: 'designed',
    mechanism: 'dragonball_tournament',
    mechanismName: 'Dragon Ball World Tournament',
    gamemode: 'survival',
    path: 'designed_worlds/World_Martial_Arts_Tournament.json'
  }
];

/**
 * List all designed maps from the designed_worlds folder.
 */
export async function fetchDesignedWorlds() {
  try {
    const res = await fetch('/api/designed-worlds');
    if (res.ok) {
      const data = await res.json();
      if (data.worlds && data.worlds.length > 0) {
        return { worlds: data.worlds, defaultPath: data.defaultPath || 'designed_worlds/' };
      }
    }
  } catch (e) {
    console.warn('Backend /api/designed-worlds unreachable, using curated designed worlds fallback');
  }

  // Fallback to curated designed worlds so designed maps are always available!
  return { worlds: CURATED_DESIGNED_WORLDS, defaultPath: 'designed_worlds/' };
}

/**
 * Load a designed world by filename.
 */
export async function loadDesignedWorld(game, filename, options = {}) {
  let mapData = null;

  // 1. Try backend API first
  try {
    const res = await fetch(`/api/designed-worlds/${encodeURIComponent(filename)}`);
    if (res.ok) {
      mapData = await res.json();
    }
  } catch (e) {}

  // 2. Try static public path fallback
  if (!mapData) {
    try {
      const res = await fetch(`/designed_worlds/${encodeURIComponent(filename)}`);
      if (res.ok) {
        mapData = await res.json();
      }
    } catch (e) {}
  }

  // 3. Try raw path fallback
  if (!mapData) {
    try {
      const cleanPath = filename.startsWith('/') ? filename : `/${filename}`;
      const res = await fetch(cleanPath);
      if (res.ok) {
        mapData = await res.json();
      }
    } catch (e) {}
  }

  if (!mapData) {
    throw new Error(`Failed to load designed world "${filename}"`);
  }

  deserializeWorld(game, mapData, { progress: options.progress });
  return { success: true, name: mapData.name || filename, mechanism: mapData.mechanism };
}

/**
 * List all saved maps from the default location.
 */
export async function fetchSavedMaps() {
  try {
    const res = await fetch('/api/saves');
    if (res.ok) {
      const data = await res.json();
      return { saves: data.saves || [], defaultPath: data.defaultPath || 'saves/' };
    }
  } catch (e) {
    console.warn('Backend /api/saves unreachable, checking local storage fallback');
  }

  // Fallback to localStorage
  const localList = [];
  try {
    const savedKeys = Object.keys(localStorage).filter(k => k.startsWith('mc_map_save_'));
    for (const k of savedKeys) {
      const raw = localStorage.getItem(k);
      const parsed = JSON.parse(raw);
      localList.push({
        name: parsed.name,
        filename: `${k.replace('mc_map_save_', '')}.json`,
        isLocalStorage: true,
        savedAt: parsed.savedAt || new Date().toISOString(),
        seed: parsed.seed,
        gamemode: parsed.player?.gamemode || 'creative',
        chunkCount: parsed.chunks?.length || 0,
        size: raw.length
      });
    }
  } catch (err) {}
  return { saves: localList, defaultPath: 'Browser Local Storage' };
}

/**
 * Save map to the default path on local computer.
 */
export async function saveMapToDefault(game, name) {
  const mapData = serializeWorld(game, name);
  const safeName = (name || 'world').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'world';
  const filename = `${safeName}.json`;

  let serverSuccess = false;
  let saveResult = null;

  try {
    const res = await fetch('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, name: safeName, data: mapData })
    });
    if (res.ok) {
      saveResult = await res.json();
      serverSuccess = true;
    }
  } catch (err) {
    console.warn('Server save failed, using local storage backup:', err);
  }

  // Backup to localStorage
  try {
    localStorage.setItem(`mc_map_save_${safeName}`, JSON.stringify(mapData));
  } catch (e) {}

  return {
    success: true,
    serverSuccess,
    name: safeName,
    filename,
    path: saveResult?.path || `saves/${filename}`,
    size: saveResult?.size || JSON.stringify(mapData).length,
    savedAt: mapData.savedAt
  };
}

/**
 * Load map from default path.
 */
export async function loadMapFromDefault(game, filename, options = {}) {
  try {
    const res = await fetch(`/api/saves/${encodeURIComponent(filename)}`);
    if (res.ok) {
      const mapData = await res.json();
      deserializeWorld(game, mapData, { progress: options.progress });
      return { success: true, name: mapData.name || filename };
    }
  } catch (err) {
    console.warn('Server load failed, trying local storage fallback:', err);
  }

  // Try localStorage fallback
  const safeName = filename.replace(/\.json$/, '');
  const localRaw = localStorage.getItem(`mc_map_save_${safeName}`);
  if (localRaw) {
    const mapData = JSON.parse(localRaw);
    deserializeWorld(game, mapData, { progress: options.progress });
    return { success: true, name: mapData.name || safeName };
  }

  throw new Error(`Failed to load map "${filename}"`);
}

/**
 * Delete a saved map file from the default location.
 */
export async function deleteSavedMap(filename) {
  try {
    await fetch(`/api/saves/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  } catch (e) {}

  const safeName = filename.replace(/\.json$/, '');
  localStorage.removeItem(`mc_map_save_${safeName}`);
  return true;
}

/**
 * Save map to a custom file on the user's computer via File System Access API
 * or direct file download.
 */
export async function saveMapToCustomFile(game, name = 'MyWorld') {
  const mapData = serializeWorld(game, name);
  const jsonContent = JSON.stringify(mapData, null, 2);
  const safeName = (name || 'world').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'world';
  const defaultFilename = `${safeName}.json`;

  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [
          {
            description: 'Minecraft Map File (*.json)',
            accept: { 'application/json': ['.json', '.mcworld'] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonContent);
      await writable.close();
      return { success: true, name: handle.name || defaultFilename, customPath: true };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { cancelled: true };
      }
      console.warn('showSaveFilePicker failed, falling back to download:', err);
    }
  }

  // Fallback to browser file download
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { success: true, name: defaultFilename, downloaded: true };
}

/**
 * Load map from any custom file selected by the user.
 */
export async function loadMapFromCustomFile(game, file, options = {}) {
  if (!file) throw new Error('No file provided');
  const text = await file.text();
  const mapData = JSON.parse(text);
  deserializeWorld(game, mapData, { progress: options.progress });
  return { success: true, name: mapData.name || file.name };
}

export { generateMcWorld, exportMapToMcWorld } from './io/mcworldExporter.js';
