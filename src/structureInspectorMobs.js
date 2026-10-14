// The Inspector's real mobs: the game's own `MobManager` spawning the mobs a structure asked for, so a swamp hut's
// witch and black cat are the game's witch and cat (models, textures, animation and wandering), not coloured boxes.
//
// It mirrors `mobDebugSession.js`, which does the same for the mob debug page: a stand-in "player" and "game" give
// the manager what it reads, and a spectator player keeps hostile mobs from attacking while you walk around.
// Browser-side (it loads entity textures through three), so the Node tests cover the stand-ins' shape and the page
// is the check for the pictures.
import * as THREE from 'three';

/** The stand-in the mob manager reads as "the player": spectator, so nothing targets or hurts it. */
export function createInspectorPlayer() {
  const inventory = {
    armor: {}, hotbar: [], storage: [], active: null,
    getActiveItem() { return this.active; }, getOffhandItem: () => null, consumeActiveItem() {},
    addItem() { return true; }, updateUI() {}, updateHotbar() {}
  };
  return {
    type: 'player', position: new THREE.Vector3(), velocity: new THREE.Vector3(), width: 0.6, height: 1.8,
    health: 20, gamemode: 'spectator', yaw: 0, inventory, damageEvents: 0, statusEffects: {}, isBlocking: false,
    takeDamage() {}, hasStatusEffect: () => false, applyStatusEffect() {}, checkCollision: () => false, updateCameraAndModel() {}
  };
}

export function createInspectorGame(player) {
  return {
    player, inventory: player.inventory, difficulty: 'normal', weather: { weatherType: 'clear' },
    mechanisms: { isFeatureEnabled: () => false }
  };
}

/**
 * Spawn a built structure's requested mobs with the game's mob manager.
 *
 * @param {{scene: object, built: object}} options  `built` is from `buildStructureWorld`
 * @returns {Promise<{tick:Function, dispose:Function, positions:Function, count:number, failed:string[]}>}
 */
export async function createInspectorMobs({ scene, built }) {
  const { MobManager } = await import('./mobs.js');
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = {
    items: [], drops: [], xp: 0, spawnDroppedItem() {}, spawnXpOrbs() {}, spawnDeathParticles() {},
    spawnEndermanParticles() {}, spawnBlockBreakParticles() {}
  };
  const player = createInspectorPlayer();
  const manager = new MobManager(scene, built.world, sounds, entities);
  manager.game = createInspectorGame(player);

  const failed = [];
  for (const request of built.recorder.mobs) {
    try {
      const mob = manager.spawnMob(request.type, request.x, request.y, request.z, request.options);
      if (!mob) failed.push(`${request.type}: not spawned`);
    } catch (error) {
      failed.push(`${request.type}: ${error.message}`);
    }
  }

  let broken = false;
  return {
    manager,
    count: manager.mobs.length,
    failed,
    /** Advance the mobs by `dt` seconds with the viewer standing at `position` (a THREE.Vector3-like). */
    tick(dt, position) {
      if (broken) return;
      player.position.set(position.x, position.y, position.z);
      try {
        manager.update(Math.min(0.1, Math.max(0, dt)), player);
      } catch (error) {
        broken = true;
        failed.push(`update stopped: ${error.message}`);
      }
    },
    positions() {
      return manager.mobs.map((mob) => ({ type: mob.type, x: mob.mesh.position.x, y: mob.mesh.position.y, z: mob.mesh.position.z }));
    },
    dispose() {
      const materials = new Set();
      for (const mob of manager.mobs) mob.mesh.traverse((o) => { for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) materials.add(m); });
      manager.clearMobs();
      materials.forEach((m) => m.dispose());
    }
  };
}
