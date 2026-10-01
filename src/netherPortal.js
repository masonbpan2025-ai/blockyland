import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

/**
 * Validates whether an obsidian frame exists around ignition coordinates (x, y, z)
 * Supports X-axis and Z-axis aligned rectangles from 4x5 to 23x23 (inner 2x3 to 21x21).
 * Corners are optional per Minecraft wiki.
 *
 * @param {object} world 
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @returns {object} { valid: boolean, axis?: 'x'|'z', minX, maxX, minY, maxY, minZ, maxZ, innerBlocks: Array<{x, y, z}> }
 */
export function detectPortalFrame(world, x, y, z) {
  // Candidate inner start block
  let sx = x;
  let sy = y;
  let sz = z;

  // If clicked directly on obsidian, test block adjacent or above
  const startBlock = world.getVoxel(x, y, z);
  if (startBlock === BLOCKS.OBSIDIAN) {
    sy = y + 1;
  }

  // Helper to check if a block can be inner portal space
  const isInnerCandidate = (bx, by, bz) => {
    const v = world.getVoxel(bx, by, bz);
    return v === BLOCKS.AIR || v === BLOCKS.FIRE || v === BLOCKS.NETHER_PORTAL;
  };

  const isObsidian = (bx, by, bz) => {
    return world.getVoxel(bx, by, bz) === BLOCKS.OBSIDIAN;
  };

  // Test both orientations: 'x' (constant Z) and 'z' (constant X)
  for (const axis of ['x', 'z']) {
    const result = checkAxisFrame(world, sx, sy, sz, axis, isInnerCandidate, isObsidian);
    if (result.valid) {
      return result;
    }
  }

  return { valid: false };
}

function checkAxisFrame(world, sx, sy, sz, axis, isInnerCandidate, isObsidian) {
  if (!isInnerCandidate(sx, sy, sz)) {
    return { valid: false };
  }

  const isX = axis === 'x';

  // 1. Scan downward to find the bottom inner opening
  let minY = sy;
  while (minY > 0 && isInnerCandidate(sx, minY - 1, sz)) {
    minY--;
    if (sy - minY > 22) return { valid: false }; // exceed max size
  }

  // Block below the inner bottom must be obsidian
  if (!isObsidian(sx, minY - 1, sz)) {
    return { valid: false };
  }

  // 2. Scan horizontally along the axis at minY to find left & right bounds
  let minH = isX ? sx : sz;
  let maxH = isX ? sx : sz;

  // Scan negative direction
  while (isInnerCandidate(isX ? minH - 1 : sx, minY, isX ? sz : minH - 1)) {
    minH--;
    if ((isX ? sx : sz) - minH > 22) return { valid: false };
  }

  // Scan positive direction
  while (isInnerCandidate(isX ? maxH + 1 : sx, minY, isX ? sz : maxH + 1)) {
    maxH++;
    if (maxH - (isX ? sx : sz) > 22) return { valid: false };
  }

  const innerWidth = maxH - minH + 1;
  // Minecraft inner width: 2 to 21
  if (innerWidth < 2 || innerWidth > 21) {
    return { valid: false };
  }

  // Check bottom obsidian frame (between minH and maxH at minY - 1)
  for (let h = minH; h <= maxH; h++) {
    const bx = isX ? h : sx;
    const bz = isX ? sz : h;
    if (!isObsidian(bx, minY - 1, bz)) {
      return { valid: false };
    }
  }

  // Left frame column check at minH - 1 and right frame column at maxH + 1
  // 3. Scan upward to find maxY
  let maxY = minY;
  let reachedTop = false;

  for (let y = minY; y <= minY + 22; y++) {
    // Check if side pillars are obsidian
    const leftX = isX ? minH - 1 : sx;
    const leftZ = isX ? sz : minH - 1;
    const rightX = isX ? maxH + 1 : sx;
    const rightZ = isX ? sz : maxH + 1;

    // Check if entire row between minH and maxH is open
    let rowOpen = true;
    for (let h = minH; h <= maxH; h++) {
      const bx = isX ? h : sx;
      const bz = isX ? sz : h;
      if (!isInnerCandidate(bx, y, bz)) {
        rowOpen = false;
        break;
      }
    }

    if (rowOpen) {
      if (!isObsidian(leftX, y, leftZ) || !isObsidian(rightX, y, rightZ)) {
        return { valid: false };
      }
      maxY = y;
    } else {
      // Reached top border?
      reachedTop = true;
      maxY = y - 1;
      break;
    }
  }

  const innerHeight = maxY - minY + 1;
  // Minecraft inner height: 3 to 21
  if (innerHeight < 3 || innerHeight > 21) {
    return { valid: false };
  }

  // Top obsidian frame check at maxY + 1
  for (let h = minH; h <= maxH; h++) {
    const bx = isX ? h : sx;
    const bz = isX ? sz : h;
    if (!isObsidian(bx, maxY + 1, bz)) {
      return { valid: false };
    }
  }

  // Also verify left pillar at (minH - 1, y) and right pillar at (maxH + 1, y) for all inner Y
  for (let y = minY; y <= maxY; y++) {
    const leftX = isX ? minH - 1 : sx;
    const leftZ = isX ? sz : minH - 1;
    const rightX = isX ? maxH + 1 : sx;
    const rightZ = isX ? sz : maxH + 1;
    if (!isObsidian(leftX, y, leftZ) || !isObsidian(rightX, y, rightZ)) {
      return { valid: false };
    }
  }

  // Collect all inner blocks
  const innerBlocks = [];
  const minX = isX ? minH : sx;
  const maxX = isX ? maxH : sx;
  const minZ = isX ? sz : minH;
  const maxZ = isX ? sz : maxH;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        innerBlocks.push({ x, y, z });
      }
    }
  }

  return {
    valid: true,
    axis,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    innerBlocks
  };
}

/**
 * Attempts to ignite a Nether Portal at the specified coordinate.
 * If a valid obsidian frame exists, converts all inner blocks to BLOCKS.NETHER_PORTAL.
 *
 * @param {object} world 
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @param {object} [sounds] 
 * @returns {object} { success: boolean, frame?: object, count?: number }
 */
export function lightPortal(world, x, y, z, sounds = null) {
  const frame = detectPortalFrame(world, x, y, z);
  if (!frame.valid) {
    return { success: false };
  }

  for (const b of frame.innerBlocks) {
    world.setVoxel(b.x, b.y, b.z, BLOCKS.NETHER_PORTAL);
  }

  if (sounds?.playPortalIgnite) {
    sounds.playPortalIgnite();
  }

  return {
    success: true,
    frame,
    count: frame.innerBlocks.length
  };
}

/**
 * Destroys all contiguous portal blocks connected to or adjacent to (startX, startY, startZ).
 * Called when an obsidian frame block or portal block is broken.
 *
 * @param {object} world 
 * @param {number} startX 
 * @param {number} startY 
 * @param {number} startZ 
 * @param {object} [sounds] 
 * @returns {object} { destroyed: boolean, count: number, affectedChunks: Array<{cx, cz}> }
 */
export function destroyContiguousPortal(world, startX, startY, startZ, sounds = null) {
  // Find seed portal block: either (startX, startY, startZ) itself or an adjacent portal block
  const queue = [];
  const visited = new Set();
  const key = (x, y, z) => `${x},${y},${z}`;

  if (world.getVoxel(startX, startY, startZ) === BLOCKS.NETHER_PORTAL) {
    queue.push({ x: startX, y: startY, z: startZ });
    visited.add(key(startX, startY, startZ));
  } else {
    // Check 6 adjacent neighbors
    const neighbors = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ];
    for (const [dx, dy, dz] of neighbors) {
      const nx = startX + dx;
      const ny = startY + dy;
      const nz = startZ + dz;
      if (world.getVoxel(nx, ny, nz) === BLOCKS.NETHER_PORTAL) {
        queue.push({ x: nx, y: ny, z: nz });
        visited.add(key(nx, ny, nz));
      }
    }
  }

  if (queue.length === 0) {
    return { destroyed: false, count: 0, affectedChunks: [] };
  }

  const removedBlocks = [];
  const affectedChunksSet = new Set();

  while (queue.length > 0) {
    const curr = queue.shift();
    removedBlocks.push(curr);

    const cx = Math.floor(curr.x / 16);
    const cz = Math.floor(curr.z / 16);
    affectedChunksSet.add(`${cx},${cz}`);

    // Check adjacent blocks
    const neighbors = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ];

    for (const [dx, dy, dz] of neighbors) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      const nz = curr.z + dz;
      const k = key(nx, ny, nz);
      if (!visited.has(k) && world.getVoxel(nx, ny, nz) === BLOCKS.NETHER_PORTAL) {
        visited.add(k);
        queue.push({ x: nx, y: ny, z: nz });
      }
    }
  }

  // Remove all connected portal blocks
  for (const b of removedBlocks) {
    world.setVoxel(b.x, b.y, b.z, BLOCKS.AIR);
  }

  if (sounds?.playPortalBreak) {
    sounds.playPortalBreak();
  }

  const affectedChunks = Array.from(affectedChunksSet).map(s => {
    const [cx, cz] = s.split(',').map(Number);
    return { cx, cz };
  });

  return {
    destroyed: true,
    count: removedBlocks.length,
    affectedChunks
  };
}

/**
 * Calculates coordinate translation between Overworld and Nether according to Minecraft 8:1 ratio.
 *
 * @param {string} sourceDim 'overworld' | 'nether'
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @returns {object} { x, y, z }
 */
export function getDestinationCoordinates(sourceDim, x, y, z) {
  if (sourceDim === 'nether') {
    // Nether to Overworld: multiply X and Z by 8
    return {
      x: Math.round(x * 8),
      y: Math.max(12, Math.min(60, Math.round(y))),
      z: Math.round(z * 8)
    };
  } else {
    // Overworld to Nether: divide X and Z by 8
    return {
      x: Math.round(x / 8),
      y: Math.max(16, Math.min(45, Math.round(y))),
      z: Math.round(z / 8)
    };
  }
}

/**
 * Finds an existing portal block near the destination coordinates within a given radius.
 *
 * @param {object} world 
 * @param {number} targetX 
 * @param {number} targetY 
 * @param {number} targetZ 
 * @param {number} [maxRadius=64] 
 * @returns {object|null} { x, y, z, spawnX, spawnY, spawnZ }
 */
export function findNearbyPortal(world, targetX, targetY, targetZ, maxRadius = 64) {
  let closestDist = Infinity;
  let bestPortal = null;

  const minX = targetX - maxRadius;
  const maxX = targetX + maxRadius;
  const minZ = targetZ - maxRadius;
  const maxZ = targetZ + maxRadius;

  // Search loaded chunks around target
  const startChunkX = Math.floor(minX / 16);
  const endChunkX = Math.floor(maxX / 16);
  const startChunkZ = Math.floor(minZ / 16);
  const endChunkZ = Math.floor(maxZ / 16);

  for (let cx = startChunkX; cx <= endChunkX; cx++) {
    for (let cz = startChunkZ; cz <= endChunkZ; cz++) {
      const chunk = world.getChunk ? world.getChunk(cx, cz) : null;
      if (!chunk) continue;

      for (let lx = 0; lx < 16; lx++) {
        for (let lz = 0; lz < 16; lz++) {
          const wx = cx * 16 + lx;
          const wz = cz * 16 + lz;
          const distSq = (wx - targetX) ** 2 + (wz - targetZ) ** 2;
          if (distSq > maxRadius ** 2) continue;

          for (let wy = 5; wy < 60; wy++) {
            if (chunk.getVoxel(lx, wy, lz) === BLOCKS.NETHER_PORTAL) {
              const totalDist = distSq + (wy - targetY) ** 2;
              if (totalDist < closestDist) {
                closestDist = totalDist;
                bestPortal = {
                  x: wx,
                  y: wy,
                  z: wz,
                  spawnX: wx + 0.5,
                  spawnY: wy,
                  spawnZ: wz + 0.5
                };
              }
            }
          }
        }
      }
    }
  }

  return bestPortal;
}

/**
 * Generates a full 4 wide x 5 high obsidian portal frame with a safe landing platform.
 * Fills interior with BLOCKS.NETHER_PORTAL blocks.
 *
 * @param {object} world 
 * @param {number} x Base anchor X
 * @param {number} y Base anchor Y (foot level of portal)
 * @param {number} z Base anchor Z
 * @param {'x'|'z'} [axis='x'] Orientation axis
 * @returns {object} { spawnX, spawnY, spawnZ, affectedChunks }
 */
export function generateDestinationPortal(world, x, y, z, axis = 'x') {
  const isX = axis === 'x';
  const baseY = Math.max(10, Math.min(52, Math.floor(y)));
  const anchorX = Math.floor(x);
  const anchorZ = Math.floor(z);

  const affectedChunksSet = new Set();
  const markDirty = (bx, bz) => {
    affectedChunksSet.add(`${Math.floor(bx / 16)},${Math.floor(bz / 16)}`);
  };

  // 1. Build a safe 4x4 stone/obsidian platform at baseY - 1
  for (let dx = -1; dx <= 2; dx++) {
    for (let dz = -1; dz <= 2; dz++) {
      const px = isX ? anchorX + dx : anchorX + dz;
      const pz = isX ? anchorZ + dz : anchorZ + dx;
      world.setVoxel(px, baseY - 1, pz, BLOCKS.OBSIDIAN);
      markDirty(px, pz);
    }
  }

  // 2. Clear interior air room (4 wide x 5 high x 3 deep) so portal is not obstructed by stone/dirt
  for (let h = -1; h <= 2; h++) {
    for (let dy = 0; dy <= 4; dy++) {
      for (let depth = -1; depth <= 1; depth++) {
        const cx = isX ? anchorX + h : anchorX + depth;
        const cz = isX ? anchorZ + depth : anchorZ + h;
        world.setVoxel(cx, baseY + dy, cz, BLOCKS.AIR);
        markDirty(cx, cz);
      }
    }
  }

  // 3. Place obsidian frame:
  // Width 4, Height 5.
  // Inner space is 2 wide x 3 high at baseY to baseY + 2.
  // Frame columns are at h = -1 and h = 2.
  // Inner width columns are at h = 0 and h = 1.
  for (let h = -1; h <= 2; h++) {
    for (let dy = 0; dy <= 4; dy++) {
      const fx = isX ? anchorX + h : anchorX;
      const fz = isX ? anchorZ : anchorZ + h;
      const isBorder = (h === -1 || h === 2 || dy === 0 || dy === 4);

      if (isBorder) {
        world.setVoxel(fx, baseY + dy, fz, BLOCKS.OBSIDIAN);
      } else {
        world.setVoxel(fx, baseY + dy, fz, BLOCKS.NETHER_PORTAL);
      }
      markDirty(fx, fz);
    }
  }

  const affectedChunks = Array.from(affectedChunksSet).map(s => {
    const [cx, cz] = s.split(',').map(Number);
    return { cx, cz };
  });

  return {
    spawnX: anchorX + 0.5,
    spawnY: baseY + 1,
    spawnZ: anchorZ + 0.5,
    affectedChunks
  };
}

/**
 * NetherPortalManager handles player portal entry detection, time-to-transition,
 * screen wobble shader/animation effects, and dimensional travel.
 */
export class NetherPortalManager {
  constructor(game) {
    this.game = game;
    this.portalTimer = 0;
    this.maxSurvivalDelay = 4.0; // 4.0s (80 ticks) in survival
    this.maxCreativeDelay = 0.5; // 0.5s in creative
    this.portalCooldown = 0;
    this.isInPortal = false;
    this.ambientSoundTimer = 0;
    this.overlayElement = null;
  }

  getOverlay() {
    if (!this.overlayElement && typeof document !== 'undefined') {
      this.overlayElement = document.getElementById('portal-overlay');
    }
    return this.overlayElement;
  }

  ignitePortal(world, x, y, z, normal = null, player = null) {
    let targetX = x;
    let targetY = y;
    let targetZ = z;

    if (normal) {
      targetX = x + (normal.x || 0);
      targetY = y + (normal.y || 0);
      targetZ = z + (normal.z || 0);
    }

    // Try target block first
    let result = lightPortal(world, targetX, targetY, targetZ, this.game?.sounds);
    if (!result.success) {
      // Try direct clicked block
      result = lightPortal(world, x, y, z, this.game?.sounds);
    }

    if (result.success) {
      if (this.game?.loadChunksAroundPlayer) {
        this.game.loadChunksAroundPlayer();
      }
      if (this.game?.refreshDirtyChunks) {
        this.game.refreshDirtyChunks();
      }
      return true;
    }

    return false;
  }

  onBlockBroken(x, y, z, blockId) {
    if (blockId === BLOCKS.OBSIDIAN || blockId === BLOCKS.NETHER_PORTAL) {
      const res = destroyContiguousPortal(this.game.world, x, y, z, this.game?.sounds);
      if (res.destroyed && this.game) {
        for (const { cx, cz } of res.affectedChunks) {
          const chunk = this.game.world.getChunk(cx, cz);
          if (chunk) this.game.rebuildChunkMesh(chunk);
        }
      }
      return res.destroyed;
    }
    return false;
  }

  isPlayerInPortal(player, world) {
    if (!player || !world || !player.position) return false;

    // Check player feet and eye coordinates
    const px = Math.floor(player.position.x);
    const pyFeet = Math.floor(player.position.y);
    const pyEye = Math.floor(player.position.y + 1.2);
    const pz = Math.floor(player.position.z);

    if (world.getVoxel(px, pyFeet, pz) === BLOCKS.NETHER_PORTAL) return true;
    if (world.getVoxel(px, pyEye, pz) === BLOCKS.NETHER_PORTAL) return true;

    // Slight bounding box check (0.3 radius)
    for (const dx of [-0.25, 0.25]) {
      for (const dz of [-0.25, 0.25]) {
        const bx = Math.floor(player.position.x + dx);
        const bz = Math.floor(player.position.z + dz);
        if (world.getVoxel(bx, pyFeet, bz) === BLOCKS.NETHER_PORTAL) return true;
        if (world.getVoxel(bx, pyEye, bz) === BLOCKS.NETHER_PORTAL) return true;
      }
    }

    return false;
  }

  update(dt, player, game) {
    if (!player || !game || !game.world) return;

    if (this.portalCooldown > 0) {
      this.portalCooldown -= dt;
    }

    const inPortal = this.isPlayerInPortal(player, game.world);
    this.isInPortal = inPortal;

    const overlay = this.getOverlay();
    const isCreative = player.gamemode === 'creative';
    const targetDelay = isCreative ? this.maxCreativeDelay : this.maxSurvivalDelay;

    if (inPortal) {
      // Ambient sound
      this.ambientSoundTimer -= dt;
      if (this.ambientSoundTimer <= 0) {
        game.sounds?.playPortalAmbience?.();
        this.ambientSoundTimer = 3.5;
      }

      if (this.portalCooldown <= 0) {
        this.portalTimer += dt;
        const progress = Math.min(1.0, this.portalTimer / targetDelay);

        // Update portal distortion overlay
        if (overlay) {
          overlay.style.opacity = (0.2 + progress * 0.75).toFixed(2);
          overlay.classList.add('active');
        }

        // Camera wobble / nausea effect
        if (game.renderer?.domElement) {
          const wobble = Math.sin(Date.now() * 0.006) * progress * 2.5;
          const scale = 1.0 + progress * 0.05;
          game.renderer.domElement.style.transform = `scale(${scale.toFixed(3)}) rotate(${wobble.toFixed(2)}deg)`;
        }

        if (this.portalTimer >= targetDelay) {
          this.teleportDimension(player, game);
        }
      }
    } else {
      // Not in portal: fade out portal timer & overlay
      if (this.portalTimer > 0) {
        this.portalTimer = Math.max(0, this.portalTimer - dt * 2.0);
        const progress = this.portalTimer / targetDelay;
        if (overlay) {
          overlay.style.opacity = (progress * 0.6).toFixed(2);
        }
        if (game.renderer?.domElement) {
          const scale = 1.0 + progress * 0.03;
          game.renderer.domElement.style.transform = progress > 0.01 ? `scale(${scale.toFixed(3)})` : 'none';
        }
      } else {
        if (overlay) {
          overlay.style.opacity = '0';
          overlay.classList.remove('active');
        }
        if (game.renderer?.domElement) {
          game.renderer.domElement.style.transform = 'none';
        }
      }
    }
  }

  teleportDimension(player, game) {
    const currentDim = game.currentDimension || (game.world?.dimension) || 'overworld';
    const targetDim = currentDim === 'nether' ? 'overworld' : 'nether';

    // 1. Calculate destination coordinates
    const sourcePos = player.position.clone();
    const destCoords = getDestinationCoordinates(currentDim, sourcePos.x, sourcePos.y, sourcePos.z);

    // 2. Clear timer & reset overlay
    this.portalTimer = 0;
    this.portalCooldown = 4.0; // 4 second grace period before next teleportation
    const overlay = this.getOverlay();
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.classList.remove('active');
    }
    if (game.renderer?.domElement) {
      game.renderer.domElement.style.transform = 'none';
    }

    // 3. Perform game dimension switch
    if (game.switchDimension) {
      game.switchDimension(targetDim, { x: destCoords.x + 0.5, y: destCoords.y, z: destCoords.z + 0.5 });
    }

    // 4. Look for existing portal or generate a new one
    let targetSpawn = findNearbyPortal(game.world, destCoords.x, destCoords.y, destCoords.z, 64);
    if (!targetSpawn) {
      const generated = generateDestinationPortal(game.world, destCoords.x, destCoords.y, destCoords.z, 'x');
      targetSpawn = generated;
      if (game.rebuildChunkMesh) {
        for (const { cx, cz } of generated.affectedChunks) {
          const chunk = game.world.getChunk(cx, cz);
          if (chunk) game.rebuildChunkMesh(chunk);
        }
      }
    }

    // 5. Position player inside the portal
    if (player.position) {
      player.position.set(targetSpawn.spawnX, targetSpawn.spawnY, targetSpawn.spawnZ);
      if (player.velocity) player.velocity.set(0, 0, 0);
    }

    // 6. Audio and UI feedback
    game.sounds?.playPortalTravel?.();
    const dimName = targetDim === 'nether' ? 'The Nether' : 'The Overworld';
    game.ui?.addChatMessage?.(`Teleported to ${dimName}`, 'system');
  }
}
