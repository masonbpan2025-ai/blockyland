// Portal travel in the Structure Inspector's walk-through: walk into a Nether portal or an End portal and the game's
// own portal code takes you through, behind a progress bar, into the other dimension of the Inspector's world.
//
// The Nether portal is the game's NetherPortalManager: stepping in holds the player while the warp builds, then the
// trip goes 8:1 to the Nether, where it finds or builds the arrival portal (which leads back). The End portal goes to
// the End's obsidian platform, and the End's portal home leads back to the Overworld beside the origin. Only the
// terrain round the arrival is built (a few chunks), so a trip takes a second or two.
//
// DOM-free apart from `frameYield`, so the travel logic runs in Node tests against a real World.
import * as THREE from 'three';
import { NetherPortalManager } from './netherPortal.js';
import { isStandingInEndPortal, portalArrival } from './endPortal.js';
import { regenerateEndPlatform } from './worldgen/generators/endFeatures.js';
import { findSurfaceSpawn } from './worldSpawn.js';
import { BLOCKS } from './blocks.js';
import { buildSmallPortal } from './dimensionSpawns.js';

const browserYield = () => new Promise((resolve) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 0)));

/**
 * @param {object} options
 * @param {object} options.view          the Inspector's world view (`built`, `remeshChunk`, `clearChunks`)
 * @param {object} [options.renderer]    for the warp's wobble
 * @param {(state: {title:string, percent:number}|null) => void} [options.onProgress]
 * @param {(trip: object) => void} [options.onTrip]   called on arrival: `{ from, to, at, message }`
 */
export function createPortalTravel({ view, renderer = null, onProgress = () => {}, onTrip = () => {}, radiusChunks = 2, frameYield = browserYield } = {}) {
  const player = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), gamemode: 'survival', eyeHeight: 1.62 };
  let busy = false;
  let endCooldown = 0;
  let pendingMessage = null;
  const trips = [];
  const world = () => view.built?.world ?? null;
  const game = {
    get world() { return world(); },
    get currentDimension() { return world()?.dimension ?? 'overworld'; },
    renderer,
    sounds: {},
    ui: { addChatMessage: (message) => { pendingMessage = message; } },
    rebuildChunkMesh: (chunk) => view.remeshChunk(chunk.cx, chunk.cz),
    travelToDimension: (dimension, target, { title, arrive }) => travel(dimension, target, title, arrive)
  };
  const portals = new NetherPortalManager(game);

  /** Switch the world's dimension, build the terrain round `target` with the bar filling, then arrive. */
  async function travel(dimension, target, title, arrive) {
    const w = world();
    if (!w) return null;
    busy = true;
    const from = w.dimension;
    try {
      onProgress({ title, percent: 0 });
      await frameYield();
      w.switchDimension(dimension);
      player.yaw = undefined;
      view.clearChunks?.();
      player.position.set(target.x, target.y, target.z);
      const cx = Math.floor(target.x / 16), cz = Math.floor(target.z / 16), r = radiusChunks;
      const generate = [];
      for (let x = cx - r - 1; x <= cx + r + 1; x++) for (let z = cz - r - 1; z <= cz + r + 1; z++) generate.push([x, z]);
      for (let i = 0; i < generate.length; i++) {
        w.getOrCreateChunk(...generate[i]);
        if (i % 3 === 2) { onProgress({ title, percent: (60 * i) / generate.length }); await frameYield(); }
      }
      arrive?.();
      const mesh = generate.filter(([x, z]) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= r);
      for (let i = 0; i < mesh.length; i++) {
        view.remeshChunk(...mesh[i]);
        if (i % 3 === 2) { onProgress({ title, percent: 60 + (40 * i) / mesh.length }); await frameYield(); }
      }
      const trip = { from, to: dimension, at: { x: player.position.x, y: player.position.y, z: player.position.z }, message: pendingMessage };
      pendingMessage = null;
      trips.push(trip);
      onTrip(trip);
      return trip;
    } finally {
      busy = false;
      onProgress(null);
    }
  }

  /** The End portal: to the obsidian platform, and from the End back to the Overworld beside the origin. */
  function endTrip() {
    const w = world();
    const to = w.dimension === 'the_end' ? 'overworld' : 'the_end';
    const target = to === 'the_end' ? portalArrival('the_end') : { x: 4.5, y: 40, z: 4.5 };
    endCooldown = 3;
    return travel(to, target, to === 'the_end' ? 'Entering the End' : 'Returning to the Overworld', () => {
      if (to === 'the_end') {
        const a = regenerateEndPlatform(w, BLOCKS);
        player.position.set(a.x, a.y, a.z);
        player.yaw = a.yaw; // facing west, towards the main island
        // The way home, as an End world's platform has it: a small End portal off the platform's edge, and a step.
        buildSmallPortal(w, Math.floor(a.x) + 5, Math.floor(a.y) - 1, Math.floor(a.z), BLOCKS.END_PORTAL);
        w.setVoxel(Math.floor(a.x) + 3, Math.floor(a.y) - 1, Math.floor(a.z), BLOCKS.OBSIDIAN);
      } else {
        const spot = findSurfaceSpawn(w, { x: target.x, z: target.z, radius: 6 });
        if (spot?.found) player.position.set(spot.x, spot.y, spot.z);
      }
      pendingMessage = to === 'the_end' ? 'You step through the End portal.' : 'You return from the End.';
    });
  }

  /**
   * One walk-through frame: the walker is the player. Returns where the walker must now be (held in a portal, or
   * arrived somewhere), or null when it may go where it walked.
   */
  function tick(walker, dt) {
    const w = world();
    if (!w || !walker) return null;
    if (busy) return { x: player.position.x, y: player.position.y, z: player.position.z, yaw: player.yaw };
    endCooldown = Math.max(0, endCooldown - dt);
    player.position.set(walker.x, walker.y, walker.z);
    player.velocity.set(0, 0, 0);
    portals.update(dt, player, game);
    if (busy || portals.warp) return { x: player.position.x, y: player.position.y, z: player.position.z };
    if (endCooldown <= 0 && isStandingInEndPortal(w, player)) {
      endTrip();
      return { x: player.position.x, y: player.position.y, z: player.position.z };
    }
    return null;
  }

  return {
    tick, travel, endTrip, portals, game, player, trips,
    get busy() { return busy; },
    get warping() { return Boolean(portals.warp); },
    get dimension() { return world()?.dimension ?? null; }
  };
}
