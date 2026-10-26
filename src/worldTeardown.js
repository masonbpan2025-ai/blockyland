// Put the game back to the start screen: everything the running world owns is released, so the next
// "Generate New World" builds a world from nothing rather than from what the last one left behind.
//
// Back to Main used to clear the chunk map and the mobs and then stop. It left the lifecycle in `ready`, so the next
// `generateNewWorld` was refused and the start screen was hidden straight away: the player walked into the old world,
// emptied, with the simulation still running. It also left the chunk streamer believing the old chunk coordinates were
// loaded, so the new world's chunks were never built -- the overlaid, error-filled world. This releases all of it.
import { reset as resetLifecycle } from './worldLifecycle.js';
import { resetSurvivalState } from './deathAndRespawn.js';

/**
 * Tear the running world down.
 *
 * Takes the game as a plain object so the steps can be tested with stubs; in the game it is `window.game`.
 * Every step is guarded, because a world may be partly built when Back to Main is pressed (the start screen can be
 * reached during loading, and a mod may have replaced parts of the game).
 *
 * @param {object} game
 * @returns {{released: string[]}} what was released, in order, for the tests and for a debug log
 */
export function teardownWorld(game) {
  const released = [];
  if (!game) return { released };
  const step = (name, fn) => {
    try {
      fn();
      released.push(name);
    } catch (error) {
      // A failed step must not leave the rest of the teardown undone: the start screen has to come back.
      console.warn(`[World] teardown step "${name}" failed:`, error);
    }
  };

  // Stop the simulation first: nothing ticks, streams or spawns while the world is being taken apart.
  step('lifecycle', () => resetLifecycle(game.lifecycle));
  // A shared world ends with the player's visit to it: stop hosting, or leave the host's world, and forget the others.
  step('sharing', () => game.worldSync?.leave?.());
  // The "Generating World" cover. A load finishes a little after its world is ready, and only hides the cover if the
  // world is still up then; leaving in between left it over the title screen, where no button could be clicked.
  step('loading cover', () => game.overlay?.hide?.());
  step('flags', () => {
    game.worldReady = false;
    game.worldGenerated = false;
    game._worldStartInFlight = false;
  });

  // The streamer holds the coordinates it has loaded, a half-finished mesh and an iterator over the old world.
  step('streamer', () => game.streamer?.reset?.());

  // Chunk meshes belong to the scene, and their GPU buffers must be disposed.
  step('chunk meshes', () => {
    const scene = game.scene;
    for (const chunk of game.world?.chunks?.values?.() ?? []) {
      for (const key of ['opaqueMesh', 'transparentMesh', 'waterMesh', 'lightMesh']) {
        const mesh = chunk[key];
        if (!mesh) continue;
        scene?.remove?.(mesh);
        mesh.geometry?.dispose?.();
        chunk[key] = null;
      }
    }
  });
  step('chunks', () => game.world?.chunks?.clear?.());
  step('water', () => game.world?.water?.reset?.());
  step('weather', () => {game.weather?.clearEffects?.();game.weather?.setWeather?.('clear');game.world?.cauldronLevels?.clear?.();});
  step('lava', () => game.world?.lava?.reset?.());
  step('light', () => game.world?.light?.clear?.());
  step('block lights', () => {
    const lighting = game.blockLighting;
    if (!lighting) return;
    lighting.chunks?.clear?.();
    lighting.dirty = true;
    for (const light of lighting.lights ?? []) light.visible = false;
  });

  // Entities that belong to the world, not to the player: dropped items hold their own visuals.
  step('mobs', () => game.mobs?.clearMobs?.());
  step('End encounter',()=>{game.bossManager?.clearEndVisuals?.();game.endItems?.clear?.();game.endArenaBuilt=false;});
  step('dropped items', () => {
    const entities = game.entities;
    if (!entities) return;
    for (const item of entities.droppedItems ?? []) entities.itemVisuals?.release?.(item.group);
    entities.droppedItems = [];
    for (const rocket of entities.fireworkRockets ?? []) {
      rocket.mesh?.removeFromParent?.();
      rocket.mesh?.geometry?.dispose?.();
    }
    entities.fireworkRockets = [];
    // Hit particles of the last fight; their shared textures stay for the next world.
    for (let i = (entities.combatParticles?.live.length ?? 0) - 1; i >= 0; i--) entities.combatParticles.remove(i);
  });

  step('paintings', () => game.paintings?.clear?.());

  // Mods and modes that were attached to the world.
  step('mod world', () => game.modLoader?.closeWorld?.());
  step('studio', () => game.buildingStudio?.exitStudio?.());
  step('mechanisms', () => game.mechanisms?.setMechanism?.('default', game));
  step('world mode', () => {
    if (game.world) {
      game.world.isFlatWorld = false;
      game.world.generationMode = 'procedural';
    }
  });

  // The player and the targeting state the old world left behind.
  step('targeting', () => {
    if (game.targetBoxMesh) game.targetBoxMesh.visible = false;
    if (game.breakOverlayMesh) game.breakOverlayMesh.visible = false;
    game.targetBlock = null;
    game.targetMob = null;
    game.isMouseDown = false;
    game.miningTime = 0;
  });
  step('player', () => {
    const player = game.player;
    if (!player) return;
    player.position?.set?.(0, 26, 0);
    player.velocity?.set?.(0, 0, 0);
    player.keys = {};
    player.botControls = null;
    player.isSleeping = false;
    player.isSwimming = false;
  });
  // What the player carried and was belongs to the world they were in, as in Java, where each world keeps its own
  // player data: a new world starts with nothing, at full health, no experience and no spawn point of its own. A
  // saved world puts its own back when it loads.
  step('player data', () => {
    const player = game.player;
    if (!player) return;
    resetSurvivalState(player);
    player.invulnerableTimer = 0;
    player.health = player.maxHealth = 20;
    player.exp = 0;
    player.level = 0;
    player.deathDropsDone = false;
    player.bedSpawnPosition = null;
    player.bedBlockPosition = null;
    player.anchorSpawn = null;
    player.commandSpawnPosition = null;
  });
  step('inventory', () => {
    game.inventory?.clearAll?.();
    game.ui?.updateHotbar?.();
    game.ui?.updateStats?.();
  });

  return { released };
}
