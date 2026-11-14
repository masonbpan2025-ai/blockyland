// Saves for the replication server: the whole multiplayer world as one JSON document, taken every five minutes (as
// the paper's server saved) and loaded to restart from the last save after a failure.
//
// What is kept, per dimension: every chunk changed since it was generated (voxels and water levels, run-length
// encoded), structure orientations, furnaces, chests, beds, the End encounter, mobs (the game's own mob state), and
// dropped items with their age. Per player: position, dimension, health, hunger, experience, effects, inventory,
// spawn point. Chunks never changed are not saved: the seed regenerates them identically.
import * as THREE from 'three';
import { Chunk } from '../../src/world.js';
import { encodeVoxelsRLE, decodeVoxelsRLE, lightLoadedChunks } from '../../src/mapManager.js';
import { capturePlayerState, applyPlayerState, captureInventoryState, applyInventoryState } from '../../src/saveSchema.js';
import { serializeMobState, restoreMobState } from '../../src/mobState.js';
import { endStateFor } from '../../src/endProgression.js';

export const SAVE_FORMAT = 'blockyland-replication-save-1';

// Chunks changed after generation: the bridge's chunk hook marks them (bridge.js sets __dim when a chunk is first
// handed out; every later write marks __edited).
const rawSet = Chunk.prototype.setVoxel;
Chunk.prototype.setVoxel = function (lx, ly, lz, id) { if (this.__dim) this.__edited = true; return rawSet.call(this, lx, ly, lz, id); };

const plain = (v) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (x && typeof x === 'object' && (x.isObject3D || x.isMaterial || x.isBufferGeometry || x.isTexture) ? undefined : x)));
const mapEntries = (m) => (m instanceof Map ? [...m.entries()].map(([k, v]) => [k, plain(v)]) : []);
const v3 = (v) => (v ? [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] : null);

export function snapshot(server) {
  const dims = {};
  for (const [name, D] of Object.entries(server.dims)) {
    const world = D.world;
    const chunks = [];
    for (const c of world.chunks.values()) if (c.__edited) chunks.push({ cx: c.cx, cz: c.cz, voxels: encodeVoxelsRLE(c.voxels), water: encodeVoxelsRLE(c.waterLevels) });
    const mobs = [];
    for (const m of D.mobs.mobs) {
      if (!m.mesh || m.health <= 0 || m.type === 'ender_dragon') continue; // the dragon is rebuilt from the End state
      try { mobs.push({ type: m.type, pos: v3(m.mesh.position), yaw: m.yaw ?? 0, state: plain(serializeMobState(m, D)) }); } catch { /* a mob that cannot be saved is lost, as a despawn */ }
    }
    dims[name] = {
      chunks,
      orientations: world.serializeOrientations?.() ?? null,
      furnaces: mapEntries(D.furnaceManager.furnaces),
      chests: mapEntries(D.chestManager.chests),
      beds: mapEntries(D.bedManager.beds),
      endState: name === 'the_end' ? plain(endStateFor(world)) : null,
      mobs,
      items: (D.entities.droppedItems ?? []).map(d => ({ id: d.itemType, isBlock: !!d.isBlock, count: d.count ?? 1, pos: v3(d.group.position), age: d.age ?? 0, durability: d.durability ?? null, enchantments: d.enchantments ?? null })),
    };
  }
  const players = [...server.players.values()].map(P => ({
    name: P.name, dim: server.dimensionOf(P).dimensionName, pos: v3(P.player.position), yaw: P.player.yaw ?? 0, pitch: P.player.pitch ?? 0,
    player: plain(capturePlayerState(P.player)), inventory: plain(captureInventoryState(P.inventory)),
    spawn: v3(P.player.spawnPosition), bedSpawn: v3(P.player.bedSpawnPosition), bedBlock: v3(P.player.bedBlockPosition),
    effects: plain(P.player.statusEffects instanceof Map ? [...P.player.statusEffects.entries()] : null),
  }));
  return { format: SAVE_FORMAT, weather: server.overworldWeather?.captureState?.() ?? null, savedAt: new Date().toISOString(), seed: server.seed, difficulty: server.difficulty, ticks: server.ticks, worldTime: server.worldTime, dayCount: server.dayCount, worldSpawn: server.worldSpawn, dims, players };
}

/** Load a snapshot into a freshly constructed (not yet initialised) server. */
export function restore(server, save) {
  if (save.format !== SAVE_FORMAT) throw new Error(`not a replication save: ${save.format}`);
  if (save.weather) { server.dimension('overworld'); server.overworldWeather?.restoreState(save.weather); }
  server.ticks = save.ticks; server.worldTime = save.worldTime; server.dayCount = save.dayCount; server.worldSpawn = save.worldSpawn;
  for (const [name, d] of Object.entries(save.dims)) {
    const D = server.dimension(name), world = D.world;
    for (const c of d.chunks) {
      const chunk = new Chunk(c.cx, c.cz);
      decodeVoxelsRLE(c.voxels, chunk.voxels);
      decodeVoxelsRLE(c.water, chunk.waterLevels);
      chunk.__dim = name; chunk.__edited = true;
      world.chunks.set(world.chunkKey(c.cx, c.cz), chunk);
    }
    world.invalidateChunkCache?.();
    if (d.orientations) world.restoreOrientations?.(d.orientations);
    for (const [k, v] of d.furnaces) D.furnaceManager.furnaces.set(k, { ...v, pointLight: null });
    for (const [k, v] of d.chests) D.chestManager.chests.set(k, v);
    for (const [k, v] of d.beds) D.bedManager.beds.set(k, v);
    if (d.endState) { world.endState = d.endState; D.bossManager.initEndArena?.(); }
    for (const m of d.mobs) {
      try {
        const mob = D.mobs.spawnMob(m.type, m.pos[0], m.pos[1], m.pos[2]);
        if (mob && m.state) restoreMobState(mob, m.state, {});
        if (mob) mob.yaw = m.yaw;
      } catch { /* a mob type that cannot be rebuilt is skipped */ }
    }
    for (const it of d.items) {
      D.entities.spawnDroppedItem(new THREE.Vector3(...it.pos), it.id, it.isBlock, it.count, { enchantments: it.enchantments });
      const drop = D.entities.droppedItems.at(-1); if (drop) { drop.age = it.age; drop.durability = it.durability; }
    }
    try { lightLoadedChunks(world); } catch { /* light is rebuilt as chunks update */ }
  }
  for (const s of save.players) {
    const P = server.addPlayer(s.name);
    if (s.dim !== 'overworld') { const D = server.dimension(s.dim); Object.setPrototypeOf(P, D); P.player.world = D.world; }
    applyPlayerState(P.player, s.player, { makeVector: (x, y, z) => new THREE.Vector3(x, y, z) });
    applyInventoryState(P.inventory, s.inventory);
    P.player.position.set(...s.pos); P.player.yaw = s.yaw; P.player.pitch = s.pitch; P.player.velocity?.set?.(0, 0, 0);
    if (s.spawn) P.player.spawnPosition = new THREE.Vector3(...s.spawn);
    if (s.bedSpawn) P.player.bedSpawnPosition = new THREE.Vector3(...s.bedSpawn);
    if (s.bedBlock) P.player.bedBlockPosition = new THREE.Vector3(...s.bedBlock);
    if (Array.isArray(s.effects)) { P.player.statusEffects?.clear?.(); for (const [k, v] of s.effects) P.player.statusEffects?.set?.(k, v); }
    server.loadAround(server.dimensionOf(P), P.player.position.x, P.player.position.z, 5);
  }
  server.log('restored', { savedAt: save.savedAt, ticks: save.ticks, players: save.players.map(p => p.name) });
}
