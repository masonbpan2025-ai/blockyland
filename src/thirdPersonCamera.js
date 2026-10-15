import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

/**
 * Checks whether a given block voxel is solid and obstructs camera line of sight.
 * Solid blocks (stone, wood, dirt, leaves, cobblestone, etc.) obstruct the camera
 * so it never clips through terrain or foliage.
 * Air, water, and non-solid plants allow the camera to pass through.
 */
export function isCameraObstacle(world, x, y, z) {
  if (!world || typeof world.getVoxel !== 'function') return false;
  const blockId = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
  if (blockId === BLOCKS.AIR || blockId === BLOCKS.WATER) return false;
  const def = BLOCK_DEFS[blockId];
  return Boolean(def && def.solid !== false && !def.plant);
}

/**
 * Raymarches from origin to targetPos, testing for solid block collisions.
 * If a solid block is encountered, clamps the camera distance with safety padding
 * so the camera never clips inside blocks, leaves, or terrain.
 *
 * @param {Object} world Voxel world with getVoxel(x, y, z)
 * @param {THREE.Vector3} origin Eye position of the player
 * @param {THREE.Vector3} targetPos Desired camera position
 * @param {number} [padding=0.22] Clearance buffer from the obstacle surface
 * @param {number} [minDistance=0.35] Minimum allowed distance to prevent camera entering player head
 * @returns {THREE.Vector3} Safe camera position
 */
export function traceCameraCollision(world, origin, targetPos, padding = 0.22, minDistance = 0.35) {
  const delta = new THREE.Vector3().subVectors(targetPos, origin);
  const totalDist = delta.length();
  if (totalDist < 0.001) return targetPos.clone();

  const dir = delta.clone().normalize();
  const stepSize = 0.08;
  const steps = Math.floor(totalDist / stepSize);

  for (let i = 1; i <= steps; i++) {
    const d = i * stepSize;
    const testPoint = origin.clone().addScaledVector(dir, d);
    if (isCameraObstacle(world, testPoint.x, testPoint.y, testPoint.z)) {
      const safeDist = Math.max(minDistance, d - padding);
      return origin.clone().addScaledVector(dir, safeDist);
    }
  }

  // Also check the exact end point
  if (isCameraObstacle(world, targetPos.x, targetPos.y, targetPos.z)) {
    const safeDist = Math.max(minDistance, totalDist - padding);
    return origin.clone().addScaledVector(dir, safeDist);
  }

  return targetPos.clone();
}

/**
 * Returns player eye position and sightline vector.
 * In Minecraft Java:
 * - Yaw 0 faces -Z.
 * - Pitch positive is looking up, pitch negative is looking down.
 * - Reach is 5.0 blocks.
 */
export function getPlayerSightline(player) {
  const eyeY = player.position.y + (player.isSneaking ? 1.38 : (player.eyeHeight || 1.62));
  const eyePos = new THREE.Vector3(player.position.x, eyeY, player.position.z);

  const yaw = player.yaw || 0;
  const pitch = player.pitch || 0;

  const dx = -Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);

  const direction = new THREE.Vector3(
    Math.abs(dx) < 1e-10 ? 0 : dx,
    Math.abs(dy) < 1e-10 ? 0 : dy,
    Math.abs(dz) < 1e-10 ? 0 : dz
  ).normalize();

  return { origin: eyePos, direction, reach: 5.0 };
}

/**
 * Calculates third-person camera placement, look targets, and visual states.
 *
 * @param {Player} player
 * @param {Object} world
 * @returns {{
 *   position: THREE.Vector3,
 *   lookTarget: THREE.Vector3,
 *   showCrosshair: boolean,
 *   showModel: boolean,
 *   actualDistance: number
 * }}
 */
export function calculateThirdPersonCamera(player, world) {
  const { origin: eyePos, direction } = getPlayerSightline(player);
  const yaw = player.yaw || 0;
  const pitch = player.pitch || 0;

  // Perspective 0: First-person view
  if (player.perspective === 0 && !player.isDungeonMode) {
    return {
      position: eyePos,
      lookTarget: eyePos.clone().add(direction),
      showCrosshair: true,
      showModel: false,
      actualDistance: 0
    };
  }

  // Perspective 1: Third-person Back view (Over-the-shoulder clearance)
  if (player.perspective === 1) {
    const baseDist = 3.6;
    // Right vector orthogonal to yaw
    const rightVector = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    // Subtle shoulder offset (right 0.46 blocks, up 0.16 blocks)
    // Ensures player's head does not obstruct the crosshair or the target block
    const shoulderOffset = rightVector.clone().multiplyScalar(0.46).add(new THREE.Vector3(0, 0.16, 0));

    // Ideal camera position behind player
    const desiredPos = eyePos.clone()
      .addScaledVector(direction, -baseDist)
      .add(shoulderOffset);

    // Prevent camera clipping into walls/trees/ground
    const safePos = traceCameraCollision(world, eyePos, desiredPos);
    const actualDist = safePos.distanceTo(eyePos);

    // Aim forward at player sightline target (5 blocks away)
    const lookTarget = eyePos.clone().addScaledVector(direction, 5.0);

    return {
      position: safePos,
      lookTarget,
      showCrosshair: true,
      // If camera is squeezed very tight against a wall behind player, hide model to avoid blocking screen
      showModel: actualDist >= 0.55,
      actualDistance: actualDist
    };
  }

  // Perspective 2: Third-person Front view (Selfie view)
  if (player.perspective === 2) {
    const baseDist = 3.2;
    // Ideal camera position in front of player
    const desiredPos = eyePos.clone()
      .addScaledVector(direction, baseDist)
      .add(new THREE.Vector3(0, 0.1, 0));

    // Prevent camera clipping into walls in front of player
    const safePos = traceCameraCollision(world, eyePos, desiredPos);
    const actualDist = safePos.distanceTo(eyePos);

    // Look back at player's head / chest
    const lookTarget = eyePos.clone().sub(new THREE.Vector3(0, 0.08, 0));

    return {
      position: safePos,
      lookTarget,
      showCrosshair: false, // Vanilla Minecraft hides crosshair in 3rd person front
      showModel: actualDist >= 0.45,
      actualDistance: actualDist
    };
  }

  // Fallback for custom or dungeon modes
  return {
    position: eyePos,
    lookTarget: eyePos.clone().add(direction),
    showCrosshair: true,
    showModel: true,
    actualDistance: 0
  };
}
