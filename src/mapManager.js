import * as THREE from 'three';
import { Chunk } from './world.js';

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
export function serializeWorld(game, mapName = 'World 1') {
  const chunksData = [];
  for (const chunk of game.world.chunks.values()) {
    chunksData.push({
      cx: chunk.cx,
      cz: chunk.cz,
      voxels: encodeVoxelsRLE(chunk.voxels)
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
    health: mob.health ?? 20
  }));

  const mapData = {
    format: 'minecraft-web-map',
    version: 1,
    name: mapName.trim() || 'World 1',
    savedAt: new Date().toISOString(),
    seed: game.world.seed,
    worldTime: Math.round(game.worldTime),
    weather: {
      isRaining: Boolean(game.weather?.isRaining),
      rainIntensity: Number((game.weather?.rainIntensity || 0).toFixed(2))
    },
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
      gamemode: game.player.gamemode || 'creative',
      health: game.player.health,
      hunger: game.player.hunger,
      exp: game.player.exp,
      level: game.player.level
    },
    inventory: {
      hotbar: game.inventory.hotbar.map(it => (it ? { ...it } : null)),
      storage: game.inventory.storage.map(it => (it ? { ...it } : null)),
      activeSlot: game.inventory.activeSlot || 0
    },
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
export function deserializeWorld(game, mapData) {
  if (!mapData || !mapData.chunks) {
    throw new Error('Invalid map file format: missing chunks data');
  }

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

  // 5. Reconstruct all chunks with RLE-decompressed voxels
  for (const chunkData of mapData.chunks) {
    const chunk = new Chunk(chunkData.cx, chunkData.cz);
    decodeVoxelsRLE(chunkData.voxels, chunk.voxels);
    chunk.dirty = true;
    game.world.chunks.set(game.world.chunkKey(chunk.cx, chunk.cz), chunk);
  }

  // 6. Restore player state
  if (mapData.player) {
    const p = mapData.player;
    game.player.position.set(p.position.x, p.position.y, p.position.z);
    game.player.velocity.set(p.velocity?.x || 0, p.velocity?.y || 0, p.velocity?.z || 0);
    game.player.yaw = p.yaw ?? Math.PI;
    game.player.pitch = p.pitch ?? -0.05;
    game.player.gamemode = p.gamemode || 'creative';
    game.player.health = p.health ?? 20;
    game.player.hunger = p.hunger ?? 20;
    game.player.exp = p.exp ?? 0;
    game.player.level = p.level ?? 0;

    // Apply rotation to camera
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = game.player.pitch;
    euler.y = game.player.yaw;
    game.camera.quaternion.setFromEuler(euler);
    game.player.update(0);
  }

  // 7. Restore inventory
  if (mapData.inventory) {
    game.inventory.hotbar = mapData.inventory.hotbar.map(it => (it ? { ...it } : null));
    game.inventory.storage = mapData.inventory.storage.map(it => (it ? { ...it } : null));
    game.inventory.activeSlot = mapData.inventory.activeSlot || 0;
    game.ui.updateHotbar();
  }

  // 8. Restore time and weather
  if (mapData.worldTime !== undefined) {
    game.worldTime = mapData.worldTime;
  }
  if (mapData.weather && game.weather) {
    game.weather.setWeather(mapData.weather.isRaining ? 'rain' : 'clear');
  }

  // 9. Restore mobs
  if (mapData.mobs && mapData.mobs.length > 0 && game.mobs?.spawnMob) {
    for (const m of mapData.mobs) {
      try {
        game.mobs.spawnMob(m.type, m.position.x, m.position.y, m.position.z);
      } catch (err) {
        console.warn(`Could not spawn mob ${m.type}:`, err);
      }
    }
  }

  // 10. Restore Gemini AI memory
  if (mapData.gemini && game.geminiAgent) {
    game.geminiAgent.builtStructures = mapData.gemini.builtStructures || [];
    game.geminiAgent.lastBuiltStructure = mapData.gemini.lastBuiltStructure || null;
    game.geminiAgent.conversationHistory = mapData.gemini.conversationHistory || [];
  }

  // 11. Re-mesh all loaded chunks around the player
  game.loadChunksAroundPlayer();
  for (const chunk of game.world.chunks.values()) {
    game.rebuildChunkMesh(chunk);
  }

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
      game.ui.addChatMessage(`Loaded map: "${mapData.name}"`, 'system');
    }
  }

  // 13. Tournament Manager reset & host check
  if (game.tournament) {
    game.tournament.reset();
    game.tournament.ensureHost();
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
export async function loadMapFromDefault(game, filename) {
  try {
    const res = await fetch(`/api/saves/${encodeURIComponent(filename)}`);
    if (res.ok) {
      const mapData = await res.json();
      deserializeWorld(game, mapData);
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
    deserializeWorld(game, mapData);
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
export async function loadMapFromCustomFile(game, file) {
  if (!file) throw new Error('No file provided');
  const text = await file.text();
  const mapData = JSON.parse(text);
  deserializeWorld(game, mapData);
  return { success: true, name: mapData.name || file.name };
}
