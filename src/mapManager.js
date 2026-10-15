import { discoverMods } from './mods/loader.js';
import { captureWeatherState, restoreWeatherState } from './weatherClock.js';
import { serializeWitherSkeleton, restoreWitherSkeleton } from './witherSkeleton.js';
// Which designed world owns a map is decided by the mod table, not by a name written in this file.
import { resolveWorldMechanism } from './mods/loader.js';
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
import { yieldToBrowser } from './progressOverlay.js';

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

/** The mobs saved in the dimensions the player was not in go back to waiting there (main.js switchDimension). */
function restoreDimensionMobs(game, mapData) {
  game.mobsByDimension = {};
  for (const [dimension, records] of Object.entries(mapData.dimensionMobs ?? {})) {
    if (dimension === game.world?.dimension || !Array.isArray(records)) continue;
    const kept = [];
    for (const m of records) {
      try {
        const mob = game.mobs?.spawnMob?.(m.type, m.position.x, m.position.y, m.position.z);
        if (!mob) continue;
        if (m.health) { mob.health = m.health; mob.maxHealth = Math.max(mob.maxHealth || m.health, m.health); }
        mob.yaw = m.yaw ?? mob.yaw;
        restoreMobState(mob, m.state, { player: game.player, applyAppearance: restoreMobAppearance });
        const i = game.mobs.mobs.indexOf(mob); if (i >= 0) game.mobs.mobs.splice(i, 1);
        mob.mesh?.removeFromParent?.();
        kept.push(mob);
      } catch (err) { console.warn(`Could not restore ${dimension} mob ${m?.type}:`, err); }
    }
    game.mobsByDimension[dimension] = kept;
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

  const mobRecord = (mob, list) => ({
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
    striderVehicle: mob.vehicle?.type==='strider' ? list.indexOf(mob.vehicle) : undefined,
    // Everything the per-mob blobs above do not cover: age, taming, variants, timers and roles.
    state: serializeMobState(mob, game),
    health: mob.health ?? 20
  });
  const mobsData = (game.mobs?.mobs || []).map((mob, _, list) => mobRecord(mob, list));
  // The mobs waiting in the dimensions the player is not in (main.js switchDimension).
  const dimensionMobs = Object.fromEntries(Object.entries(game.mobsByDimension ?? {}).filter(([d, list]) => d !== game.world.dimension && list?.length).map(([d, list]) => [d, list.map((mob) => mobRecord(mob, list))]));

  const mapData = {
    dimensions: Object.fromEntries(Object.entries(game.world.dimensionChunks??{}).filter(([dimension,chunks])=>dimension!==game.world.dimension&&chunks.size).map(([dimension,chunks])=>[dimension,{
      chunks:[...chunks.values()].map(c=>({cx:c.cx,cz:c.cz,voxels:encodeVoxelsRLE(c.voxels),waterLevels:encodeVoxelsRLE(c.waterLevels)})),
      structureOrientations:game.world.serializeOrientations?.(game.world.dimensionOrientations?.[dimension]??new Map())??[]
    }])),
    redstone: game.world.redstone?.serialize() || [],
    // Which way a structure's doors, beds, chests and stairs face; the voxels hold only the block ids.
    structureOrientations: game.world.serializeOrientations?.() ?? [],
    format: 'minecraft-web-map',
    // Bumped to the schema these captures come from. `migrateSave` brings older files forward on load.
    version: SAVE_VERSION,
    name: mapName.trim() || 'World 1',
    worldType: game.worldType || (game.mechanisms?.currentMechanismId !== 'default' ? 'designed' : 'generated'),
    mechanism: game.mechanisms?.currentMechanismId || 'default',
    mechanismName: game.mechanisms?.currentMechanism?.name || 'Default',
    savedAt: new Date().toISOString(),
    seed: game.world.seed,
    generationMode: game.world.generationMode || (game.world.isFlatWorld ? 'flat' : 'procedural'),
    worldTime: Math.round(game.worldTime),
    weather: captureWeatherState(game.weather),
    // Everything Survival keeps that v1 did not write down.
    session: captureSessionState(game),
    player: {
      position: {
        x: Number(game.player.position.x.toFixed(3)),
        y: Number(game.player.position.y.toFixed(3)),
        z: Number(game.player.position.z.toFixed(3))
      },
      velocity: {
        x: Number((game.player.velocity?.x || 0).toFixed(3)),
        y: Number((game.player.velocity?.y || 0).toFixed(3)),
        z: Number((game.player.velocity?.z || 0).toFixed(3))
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
    dimensionMobs,
    // Wall paintings: canvas, facing and the air cell they hang from. Older saves have none.
    paintings: game.paintings?.serialize?.() ?? [],
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
/**
 * Deserializes map data and completely reconstructs the world progressively with yields to browser.
 * This drives the progress overlay with granular percentages and stage descriptions.
 */
// Pause the old simulation before loading the mod or yielding. Only publish ready after
// terrain, entities, meshes and controls have all been restored.
function startMapLoad(game) {
  game.worldReady = false;
  if (game.lifecycle) Object.assign(game.lifecycle, {
    phase: 'loading', startedAt: Date.now(), finishedAt: 0, error: null,
  });
  game.streamer?.reset?.();
}

function finishMapLoad(game) {
  game.endItems?.clear?.();
  game.bossManager?.clearEndVisuals?.();
  if(game.world?.dimension==='the_end'){
    game.bossManager?.initEndArena?.();game.endArenaBuilt=true;
  }else game.endArenaBuilt=false;
  game.worldReady = true;
  if (game.lifecycle) Object.assign(game.lifecycle, {
    phase: 'ready', finishedAt: Date.now(), error: null,
  });
}

function configureMapTerrain(game, mapData, worldType) {
  const mode = worldType === 'designed' ? 'authored'
    : mapData.generationMode || (worldType === 'building_studio' ? 'authored' : 'procedural');
  game.world.generationMode = mode;
  game.world.isFlatWorld = mode === 'flat';
}

function restoreMapDimension(game,mapData,seed) {
  const world=game.world;
  world.reseed(seed,mapData.session?.biomes??world.selectedBiome);
  const dimension=mapData.session?.dimension;
  if(['overworld','nether','the_end'].includes(dimension))world.switchDimension(dimension);
  for(const [name,data]of Object.entries(mapData.dimensions??{})) {
    if(name===world.dimension||!['overworld','nether','the_end'].includes(name))continue;
    const chunks=new Map();
    for(const record of data.chunks??[]) {
      const chunk=new Chunk(record.cx,record.cz);decodeVoxelsRLE(record.voxels,chunk.voxels);
      if(record.waterLevels)decodeVoxelsRLE(record.waterLevels,chunk.waterLevels);
      chunk.dirty=true;chunks.set(world.chunkKey(chunk.cx,chunk.cz),chunk);
    }
    world.dimensionChunks[name]=chunks;
    world.dimensionOrientations[name]=new Map((data.structureOrientations??[]).map(o=>[`${o.x},${o.y},${o.z}`,o]));
  }
}

export async function deserializeWorldAsync(game, mapData, options = {}) {
  if (!mapData?.chunks) throw new Error('Invalid map file format: missing chunks data');
  startMapLoad(game);
  try {
    return await restoreWorldAsync(game, mapData, options);
  } catch (error) {
    if (game.lifecycle) Object.assign(game.lifecycle, {
      phase: 'failed', finishedAt: Date.now(), error: error.message,
    });
    throw error;
  }
}

async function restoreWorldAsync(game, mapData, options = {}) {
  if (!mapData || !mapData.chunks) {
    throw new Error('Invalid map file format: missing chunks data');
  }
  migrateSave(mapData);

  const progress = typeof options.progress === 'function' ? options.progress : null;
  const yieldFn = typeof options.yieldFn === 'function' ? options.yieldFn : yieldToBrowser;
  const report = async (percent, stage) => {
    if (progress) progress(percent, stage);
  };

  // Which MOD owns this world, decided from the mod table rather than from a name written here.
  //
  // This used to read `mapData.mechanism || (isModWorld ? 'dragonball_tournament' : 'default')`, so the core
  // knew one designed world by name. The mechanism now comes from whichever mod's manifest claims this map,
  // and `openDesignedWorld` loads that mod -- which is what registers the mechanism -- before it is set.
  const resolved = game.openDesignedWorld
    ? await game.openDesignedWorld(mapData)
    : { mechanismId: mapData.mechanism || 'default', modId: null };
  const isModWorld = Boolean(resolved.modId);
  const targetWorldType = mapData.worldType || (isModWorld ? 'designed' : 'generated');
  const targetMechanismId = resolved.mechanismId;
  game.worldType = targetWorldType;
  game.worldGenerated = true;
  configureMapTerrain(game, mapData, targetWorldType);

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
  restoreMapDimension(game,mapData,seed);

  const totalChunks = mapData.chunks.length;
  await report(15, `Preparing map (${totalChunks} chunks)`);
  await yieldFn();

  // 5. Reconstruct all chunks with RLE-decompressed voxels in batches
  const chunkBatchSize = Math.max(1, Math.floor(options.batchSize || 6));
  for (let i = 0; i < totalChunks; i++) {
    const chunkData = mapData.chunks[i];
    const chunk = new Chunk(chunkData.cx, chunkData.cz);
    decodeVoxelsRLE(chunkData.voxels, chunk.voxels);
    if (chunkData.waterLevels) decodeVoxelsRLE(chunkData.waterLevels, chunk.waterLevels);
    for (let j = 0; j < chunk.waterLevels.length; j++) if (chunk.waterLevels[j] > 8) chunk.waterLevels[j] = 0;
    chunk.dirty = true;
    game.world.chunks.set(game.world.chunkKey(chunk.cx, chunk.cz), chunk);

    if ((i + 1) % chunkBatchSize === 0 || i === totalChunks - 1) {
      const pct = Math.round(15 + ((i + 1) / totalChunks) * 40); // 15% -> 55%
      await report(pct, `Decoding chunks — ${i + 1}/${totalChunks}`);
      await yieldFn();
    }
  }

  for (const chunk of game.world.chunks.values()) game.world.water?.initChunk(chunk);
  game.world.redstone?.restore(mapData.redstone);
  game.world.restoreOrientations?.(mapData.structureOrientations);
  await report(58, 'Initialising fluids & redstone');
  await yieldFn();

  game.world.invalidateChunkCache?.();

  // 6. Restore player state
  if (mapData.player) {
    const p = mapData.player;
    game.player.position.set(p.position.x, p.position.y, p.position.z);
    game.player.velocity.set(p.velocity?.x || 0, p.velocity?.y || 0, p.velocity?.z || 0);
    game.player.yaw = p.yaw ?? Math.PI;
    game.player.pitch = p.pitch ?? -0.05;
    if (isModWorld) {
      game.player.setGameMode?.('survival');
      game.player.isFlying = false;
    } else {
      const restoredMode = p.gamemode || LEGACY_DEFAULTS.gamemode;
      if (game.player.setGameMode) game.player.setGameMode(restoredMode);
      else game.player.gamemode = restoredMode;
    }
    game.player.health = p.health ?? LEGACY_DEFAULTS.health;
    game.player.hunger = p.hunger ?? LEGACY_DEFAULTS.hunger;
    game.player.exp = p.exp ?? LEGACY_DEFAULTS.exp;
    game.player.level = p.level ?? LEGACY_DEFAULTS.level;
    applyPlayerState(game.player, p, {
      makeVector: (x, y, z) => new THREE.Vector3(x, y, z),
    });

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

  // 7. Restore inventory & session & time
  applyInventoryState(game.inventory, mapData.inventory);
  if (game.ui?.updateHotbar) game.ui.updateHotbar();
  applySessionState(game, mapData.session);
  if (mapData.worldTime !== undefined) {
    game.worldTime = mapData.worldTime;
  }
  if (mapData.weather && game.weather?.setWeather) {
    restoreWeatherState(game.weather, mapData.weather);
  }
  await report(66, 'Restoring player & inventory');
  await yieldFn();

  // 9. Restore mobs
  const restoredMobs = [];
  if (mapData.mobs && mapData.mobs.length > 0 && game.mobs?.spawnMob) {
    await report(72, `Restoring entities & mobs (${mapData.mobs.length})`);
    for (const [recordIndex, m] of mapData.mobs.entries()) {
      try {
        const spawned = isZombifiedPiglin(m.type) ? game.mobs.spawnZombifiedPiglin(m.position.x, m.position.y, m.position.z, { natural: false }) :
                        m.type === 'strider' ? game.mobs.spawnStrider(m.position.x, m.position.y, m.position.z, { natural: false }) :
                        game.mobs.spawnMob(m.type, m.position.x, m.position.y, m.position.z);
        restoredMobs[recordIndex] = spawned;
        restoreStrider(spawned, m.strider);
        restoreSquid(spawned, m.squid);
        restoreWitherSkeleton(spawned, m.witherSkeleton);
        if (spawned && m.health) {
          spawned.health = m.health;
          spawned.maxHealth = Math.max(spawned.maxHealth || m.health, m.health);
          restoreHorse(spawned, m.equine, game.mobs);
          restoreZombified(spawned, m.zombified, game.mobs);
        }
        restoreMobState(spawned, m.state, { player: game.player, applyAppearance: restoreMobAppearance });
      } catch (err) {
        restoredMobs[recordIndex] = null;
        console.warn(`Could not spawn mob ${m.type}:`, err);
      }
    }
    for (let i = 0; i < (mapData.mobs?.length || 0); i++) restoreZombifiedLinks(restoredMobs[i], mapData.mobs[i].zombified, restoredMobs);
    for (let i = 0; i < (mapData.mobs?.length || 0); i++) {
      const vehicle = mapData.mobs[i].striderVehicle;
      if (Number.isInteger(vehicle) && restoredMobs?.[vehicle]?.type === 'strider' && restoredMobs[i]) attachStriderPassenger(restoredMobs[vehicle], restoredMobs[i]);
    }
    await yieldFn();
  }

  restoreDimensionMobs(game, mapData);
  // 9b. Paintings hang on blocks, so they go back after the chunks and before the meshes.
  game.paintings?.restore?.(mapData.paintings);

  // 10. Gemini AI memory
  if (mapData.gemini && game.geminiAgent) {
    game.geminiAgent.builtStructures = mapData.gemini.builtStructures || [];
    game.geminiAgent.lastBuiltStructure = mapData.gemini.lastBuiltStructure || null;
    game.geminiAgent.conversationHistory = mapData.gemini.conversationHistory || [];
  }

  // 11. Re-mesh all loaded chunks around the player in batches
  if (typeof game.loadChunksAroundPlayer === 'function') game.loadChunksAroundPlayer();
  const chunksToMesh = Array.from(game.world.chunks.values());
  const totalMeshes = chunksToMesh.length;
  const meshBatchSize = Math.max(1, Math.floor(options.meshBatchSize || 4));

  for (let i = 0; i < totalMeshes; i++) {
    const chunk = chunksToMesh[i];
    if (typeof game.rebuildChunkMesh === 'function') {
      game.rebuildChunkMesh(chunk);
    }
    if ((i + 1) % meshBatchSize === 0 || i === totalMeshes - 1) {
      const pct = Math.round(75 + ((i + 1) / totalMeshes) * 20); // 75% -> 95%
      await report(pct, `Building chunk meshes — ${i + 1}/${totalMeshes}`);
      await yieldFn();
    }
  }

  await report(98, 'Finalising world');
  await yieldFn();

  // 12. Update UI
  if (game.ui) {
    if (game.ui.updateStats) game.ui.updateStats();
    if (typeof document !== 'undefined') {
      const btnGamemode = document.getElementById('btn-gamemode');
      if (btnGamemode) btnGamemode.textContent = `Game Mode: ${game.player.gamemode.charAt(0).toUpperCase() + game.player.gamemode.slice(1)}`;
      const dbgMode = document.getElementById('dbg-mode');
      if (dbgMode) dbgMode.textContent = `Mode: ${game.player.gamemode.charAt(0).toUpperCase() + game.player.gamemode.slice(1)}`;
    }
    if (game.ui.addChatMessage) {
      const typeLabel = targetWorldType === 'designed' ? 'Mod' : 'World';
      game.ui.addChatMessage(`Loaded ${typeLabel}: "${mapData.name}"`, 'system');
    }
  }

  // 13. Mechanisms
  if (game.mechanisms) {
    game.mechanisms.setMechanism(targetMechanismId, game, mapData);
  } else {
    game.modRuntime?.activate?.(mapData);
  }

  // 14. Reset controls and close modals
  if (game.player) {
    game.player.controlsDisabled = Boolean(game.modRuntime?.exclusiveSimulation);
    game.player.isSleeping = false;
    game.player.keys = {};
  }
  if (game.ui) {
    if (typeof game.ui.closeAllModals === 'function') game.ui.closeAllModals();
    if (game.ui.startOverlay) game.ui.startOverlay.style.display = 'none';
    if (typeof game.ui.requestGamePointerLock === 'function') game.ui.requestGamePointerLock();
  }
  if (typeof document !== 'undefined' && document.activeElement?.blur) {
    document.activeElement.blur();
  }

  finishMapLoad(game);
  return true;
}

export function deserializeWorld(game, mapData, options = {}) {
  if (options.async) {
    return deserializeWorldAsync(game, mapData, options);
  }
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

  // Which MOD owns this world, decided from the mod table rather than from a name written here.
  //
  // This used to read `mapData.mechanism || (isModWorld ? 'dragonball_tournament' : 'default')`, so the core
  // knew one designed world by name. The mechanism now comes from whichever mod's manifest claims this map,
  // and `openDesignedWorld` loads that mod -- which is what registers the mechanism -- before it is set.
  // This function is SYNCHRONOUS, so it cannot load the mod itself -- the async wrapper above does that
  // before calling in. Resolving only reads the manifests, which are already in memory, so the mechanism id
  // is right either way; a mod that was never loaded simply leaves `setMechanism` falling back to `default`.
  const resolved = game.modLoader
    ? resolveWorldMechanism(game.modLoader, mapData)
    : { mechanismId: mapData.mechanism || 'default', modId: null };
  const isModWorld = Boolean(resolved.modId);
  const targetWorldType = mapData.worldType || (isModWorld ? 'designed' : 'generated');
  const targetMechanismId = resolved.mechanismId;
  game.worldType = targetWorldType;
  game.worldGenerated = true;
  startMapLoad(game);
  configureMapTerrain(game, mapData, targetWorldType);

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
  restoreMapDimension(game,mapData,seed);

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

  game.world.invalidateChunkCache?.();

  // 6. Restore player state
  if (mapData.player) {
    const p = mapData.player;
    game.player.position.set(p.position.x, p.position.y, p.position.z);
    game.player.velocity.set(p.velocity?.x || 0, p.velocity?.y || 0, p.velocity?.z || 0);
    game.player.yaw = p.yaw ?? Math.PI;
    game.player.pitch = p.pitch ?? -0.05;
    if (isModWorld) {
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
    restoreWeatherState(game.weather, mapData.weather);
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
  restoreDimensionMobs(game, mapData);
  // 9b. Paintings hang on blocks, so they go back after the chunks.
  game.paintings?.restore?.(mapData.paintings);

  // 10. Restore Gemini AI memory
  if (mapData.gemini && game.geminiAgent) {
    game.geminiAgent.builtStructures = mapData.gemini.builtStructures || [];
    game.geminiAgent.lastBuiltStructure = mapData.gemini.lastBuiltStructure || null;
    game.geminiAgent.conversationHistory = mapData.gemini.conversationHistory || [];
  }

  // 11. Re-mesh all loaded chunks around the player
  report(85, 'Building chunk meshes');
  if (typeof game.loadChunksAroundPlayer === 'function') game.loadChunksAroundPlayer();
  for (const chunk of game.world.chunks.values()) {
    if (typeof game.rebuildChunkMesh === 'function') game.rebuildChunkMesh(chunk);
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
      const typeLabel = targetWorldType === 'designed' ? 'Mod' : 'World';
      game.ui.addChatMessage(`Loaded ${typeLabel}: "${mapData.name}"`, 'system');
    }
  }

  // 13. World Mechanism activation & reset
  if (game.mechanisms) {
    game.mechanisms.setMechanism(targetMechanismId, game, mapData);
  } else {
    game.modRuntime?.activate?.(mapData);
  }

  // 14. Ensure player controls and UI are completely clean and responsive after world load
  if (game.player) {
    game.player.controlsDisabled = Boolean(game.modRuntime?.exclusiveSimulation);
    game.player.isSleeping = false;
    game.player.keys = {};
  }
  if (game.ui) {
    if (typeof game.ui.closeAllModals === 'function') {
      game.ui.closeAllModals();
    }
    if (game.ui.startOverlay) {
      game.ui.startOverlay.style.display = 'none';
    }
    if (typeof game.ui.requestGamePointerLock === 'function') {
      game.ui.requestGamePointerLock();
    }
  }
  if (typeof document !== 'undefined' && document.activeElement?.blur) {
    document.activeElement.blur();
  }

  finishMapLoad(game);
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

export const CURATED_DESIGNED_WORLDS = discoverMods().mods.flatMap(mod => mod.maps.map(filename => ({
  name: mod.name, filename, description: mod.description, worldType: 'designed',
  mechanism: mod.mechanism, mechanismName: mod.name, gamemode: 'survival',
  path: mod.mapUrls?.[filename],
})));

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
      const res = await fetch(CURATED_DESIGNED_WORLDS.find(world => world.filename === filename)?.path ?? `/designed_worlds/${encodeURIComponent(filename)}`);
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
    throw new Error(`Failed to load mod "${filename}"`);
  }

  const report = typeof options.progress === 'function' ? options.progress : null;
  const yieldFn = typeof options.yieldFn === 'function' ? options.yieldFn : yieldToBrowser;
  if (report) { report(12, 'Reading world data'); await yieldFn(); }

  await deserializeWorldAsync(game, mapData, { progress: options.progress, yieldFn, batchSize: options.batchSize });
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
  const report = typeof options.progress === 'function' ? options.progress : null;
  const yieldFn = typeof options.yieldFn === 'function' ? options.yieldFn : yieldToBrowser;

  if (report) { report(5, `Fetching map: ${filename}`); await yieldFn(); }

  try {
    const res = await fetch(`/api/saves/${encodeURIComponent(filename)}`);
    if (res.ok) {
      if (report) { report(12, 'Reading map data'); await yieldFn(); }
      const mapData = await res.json();
      await deserializeWorldAsync(game, mapData, { progress: options.progress, yieldFn, batchSize: options.batchSize });
      return { success: true, name: mapData.name || filename };
    }
  } catch (err) {
    console.warn('Server load failed, trying local storage fallback:', err);
  }

  // Try localStorage fallback
  const safeName = filename.replace(/\.json$/, '');
  const localRaw = localStorage.getItem(`mc_map_save_${safeName}`);
  if (localRaw) {
    if (report) { report(12, 'Reading local map data'); await yieldFn(); }
    const mapData = JSON.parse(localRaw);
    await deserializeWorldAsync(game, mapData, { progress: options.progress, yieldFn, batchSize: options.batchSize });
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
  const report = typeof options.progress === 'function' ? options.progress : null;
  const yieldFn = typeof options.yieldFn === 'function' ? options.yieldFn : yieldToBrowser;

  if (report) { report(5, `Reading file: ${file.name}`); await yieldFn(); }
  const text = await file.text();
  if (report) { report(12, 'Parsing map data'); await yieldFn(); }
  const mapData = JSON.parse(text);
  await deserializeWorldAsync(game, mapData, { progress: options.progress, yieldFn, batchSize: options.batchSize });
  return { success: true, name: mapData.name || file.name };
}

export { generateMcWorld, exportMapToMcWorld } from './io/mcworldExporter.js';
