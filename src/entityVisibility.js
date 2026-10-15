// Entities are drawn only where the world around them is drawn.
//
// Flying fast in creative outruns chunk meshing, and mobs stay loaded (and simulated) in chunks whose terrain has
// not been built yet -- so they were drawn floating in the sky past the edge of the terrain, beyond where the fog
// hides the world. Minecarts were worse: a mineshaft's carts stayed in the scene after their chunks were unloaded,
// hanging in the air where the tunnels had been. Vanilla draws an entity only in a chunk section that is being
// rendered; this does the same, and also leaves out anything past the fog's far edge, which the fog would have
// turned to sky colour anyway.
//
// The game code owns `visible` (invisibility, an illusioner's vanish, a fox in a bush), so this does not take it
// over: it hides what it must for the length of one render and puts every flag back straight after.

/** Should something standing at `p` be left out of the frame? */
export function hiddenAt(p, world, camera, fog) {
  if (!p || !world?.getChunk) return false;
  const chunk = world.getChunk(Math.floor(p.x / 16), Math.floor(p.z / 16));
  if (!chunk || !chunk.meshedOnce) return true;
  if (fog && Number.isFinite(fog.far) && camera?.position) {
    const dx = p.x - camera.position.x, dz = p.z - camera.position.z;
    if (dx * dx + dz * dz > fog.far * fog.far) return true;
  }
  return false;
}

/** Should this mob (or any entity with a `mesh`) be left out of the frame? */
export function hiddenFromView(mob, world, camera, fog) {
  return hiddenAt(mob?.mesh?.position, world, camera, fog);
}

/** Every entity list the game keeps, with the scene object each entry is drawn by. */
function* worldEntities(game) {
  const lists = [
    game.mobs?.mobs, game.mobs?.arrows, game.mobs?.customProjectiles, game.mobs?.endCrystals, game.mobs?.llamaSpits,
    game.railSystem?.carts, game.railSystem?.boats,
    game.entities?.droppedItems, game.entities?.xpOrbs, game.entities?.tntEntities, game.entities?.fireworkRockets,
  ];
  for (const list of lists) {
    if (!list?.length) continue;
    for (const entry of list) {
      const object = entry?.isObject3D ? entry : entry?.mesh ?? entry?.group ?? null;
      if (object?.isObject3D) yield object;
    }
  }
}

/**
 * Hide, for one render, every visible entity that should not be in it.
 * @returns {object[]} the objects hidden, for restoreHidden
 */
export function hideOutOfViewMobs(game, camera = game?.camera) {
  const hidden = [];
  if (!game?.world) return hidden;
  const fog = game.scene?.fog ?? null;
  for (const object of worldEntities(game)) {
    if (!object.visible) continue;
    if (hiddenAt(object.position, game.world, camera, fog)) { object.visible = false; hidden.push(object); }
  }
  return hidden;
}

export function restoreHidden(hidden) {
  for (const object of hidden) object.visible = true;
}
