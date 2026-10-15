import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { createPlayerModel, applyBoxUVs } from '../src/playerModel.js';
import {
  isCameraObstacle,
  traceCameraCollision,
  getPlayerSightline,
  calculateThirdPersonCamera,
} from '../src/thirdPersonCamera.js';
import { Player } from '../src/player.js';

// --- 1. Player Model Tests ----------------------------------------------------

test('createPlayerModel generates fully articulated character with all limbs and overlays', () => {
  const model = createPlayerModel();

  assert.ok(model instanceof THREE.Group, 'player model is a Three.js Group');
  assert.ok(model.head instanceof THREE.Group, 'head group exists');
  assert.ok(model.torso instanceof THREE.Group, 'torso group exists');
  assert.ok(model.leftArm instanceof THREE.Group, 'left arm group exists');
  assert.ok(model.rightArm instanceof THREE.Group, 'right arm group exists');
  assert.ok(model.leftLeg instanceof THREE.Group, 'left leg group exists');
  assert.ok(model.rightLeg instanceof THREE.Group, 'right leg group exists');

  // Pivot heights parity with Minecraft character anatomy
  assert.equal(model.head.position.y, 1.5, 'head pivots at neck base (y = 1.5)');
  assert.equal(model.leftArm.position.y, 1.375, 'left shoulder pivot at y = 1.375');
  assert.equal(model.rightArm.position.y, 1.375, 'right shoulder pivot at y = 1.375');
  assert.equal(model.leftLeg.position.y, 0.75, 'left leg hip pivot at y = 0.75');
  assert.equal(model.rightLeg.position.y, 0.75, 'right leg hip pivot at y = 0.75');

  // Both base mesh and 3D overlay meshes exist on each limb
  assert.equal(model.head.children.length, 2, 'head has base head mesh and outer hat/hair overlay mesh');
  assert.equal(model.torso.children.length, 2, 'torso has base body mesh and outer jacket overlay mesh');
  assert.equal(model.leftArm.children.length, 2, 'left arm has base mesh and sleeve overlay mesh');
  assert.equal(model.rightArm.children.length, 2, 'right arm has base mesh and sleeve overlay mesh');
  assert.equal(model.leftLeg.children.length, 2, 'left leg has base mesh and pants overlay mesh');
  assert.equal(model.rightLeg.children.length, 2, 'right leg has base mesh and pants overlay mesh');

  // Update skin method is exposed
  assert.equal(typeof model.updateSkin, 'function', 'updateSkin method is provided');
});

test('createPlayerModel supports slim (Alex 3px) arm geometry', () => {
  const classic = createPlayerModel({ modelType: 'default' });
  const slim = createPlayerModel({ modelType: 'slim' });

  // Classic arm width is 0.25 (4px), slim arm width is 0.1875 (3px)
  const classicArmGeom = classic.rightArm.children[0].geometry;
  const slimArmGeom = slim.rightArm.children[0].geometry;

  assert.equal(classicArmGeom.parameters.width, 0.25, 'classic arm width is 0.25 (4px)');
  assert.equal(slimArmGeom.parameters.width, 0.1875, 'slim arm width is 0.1875 (3px)');
  assert.ok(slim.rightArm.position.x < classic.rightArm.position.x, 'slim arms are pulled closer to torso');
});

test('applyBoxUVs maps all 6 faces of BoxGeometry within [0, 1] range without NaN', () => {
  const geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  applyBoxUVs(geom, 0, 0, 8, 8, 8);

  const uvs = geom.attributes.uv.array;
  assert.equal(uvs.length, 48, '6 faces * 4 vertices * 2 coordinates = 48 values');

  for (let i = 0; i < uvs.length; i++) {
    assert.ok(!Number.isNaN(uvs[i]), `uv[${i}] must not be NaN`);
    assert.ok(uvs[i] >= 0 && uvs[i] <= 1, `uv[${i}] (${uvs[i]}) must be normalized between 0 and 1`);
  }

  // Front face (-Z, index 5) UVs for head (8, 8, 8)
  const frontUvs = Array.from(uvs.slice(40, 48));
  assert.deepEqual(frontUvs, [
    8 / 64, 1 - 8 / 64,   // top-left (v0, Steve's right)
    16 / 64, 1 - 8 / 64,  // top-right (v1, Steve's left)
    8 / 64, 1 - 16 / 64,  // bottom-left (v2)
    16 / 64, 1 - 16 / 64, // bottom-right (v3)
  ]);
});

// --- 2. Camera Obstacle & Collision Tests -------------------------------------

test('isCameraObstacle detects solid blocks and ignores air, water, and plants', () => {
  const world = {
    getVoxel(x, y, z) {
      if (y === 0) return BLOCKS.STONE;
      if (y === 1) return BLOCKS.OAK_LEAVES;
      if (y === 2) return BLOCKS.WATER;
      if (y === 3) return BLOCKS.DANDELION; // plant
      return BLOCKS.AIR;
    }
  };

  assert.equal(isCameraObstacle(world, 0, 0, 0), true, 'stone is solid obstacle');
  assert.equal(isCameraObstacle(world, 0, 1, 0), true, 'oak leaves obstruct camera from clipping inside trees');
  assert.equal(isCameraObstacle(world, 0, 2, 0), false, 'water allows camera through');
  assert.equal(isCameraObstacle(world, 0, 3, 0), false, 'flowers/plants do not obstruct camera');
  assert.equal(isCameraObstacle(world, 0, 4, 0), false, 'air does not obstruct camera');
});

test('traceCameraCollision clamps camera distance when obstacle blocks the view', () => {
  // Solid wall at z = 2
  const world = {
    getVoxel(x, y, z) {
      if (z >= 2) return BLOCKS.COBBLESTONE;
      return BLOCKS.AIR;
    }
  };

  const origin = new THREE.Vector3(0, 1.62, 0);
  const unobstructedTarget = new THREE.Vector3(0, 1.62, -3.5);
  const safeUnobstructed = traceCameraCollision(world, origin, unobstructedTarget);
  assert.equal(safeUnobstructed.z, -3.5, 'camera reaches full distance in open space');

  const obstructedTarget = new THREE.Vector3(0, 1.62, 3.5);
  const safeObstructed = traceCameraCollision(world, origin, obstructedTarget, 0.22, 0.35);

  assert.ok(safeObstructed.z < 2.0, `camera must stay in front of the wall at z=2, got z=${safeObstructed.z}`);
  assert.ok(safeObstructed.z >= 0.35, `camera must respect minimum distance, got z=${safeObstructed.z}`);
});

// --- 3. Third-Person Camera Positioning & Sightline Tests --------------------

test('calculateThirdPersonCamera returns correct states for all perspectives', () => {
  const emptyWorld = { getVoxel: () => BLOCKS.AIR };
  const mockPlayer = {
    position: new THREE.Vector3(10, 20, 30),
    yaw: 0, // facing -Z
    pitch: 0, // level horizon
    isSneaking: false,
    eyeHeight: 1.62,
    perspective: 0,
    isDungeonMode: false,
  };

  // 1st Person (perspective 0)
  const firstPerson = calculateThirdPersonCamera(mockPlayer, emptyWorld);
  assert.equal(firstPerson.position.x, 10);
  assert.equal(firstPerson.position.y, 21.62);
  assert.equal(firstPerson.position.z, 30);
  assert.equal(firstPerson.showCrosshair, true);
  assert.equal(firstPerson.showModel, false);

  // 3rd Person Back (perspective 1)
  mockPlayer.perspective = 1;
  const thirdPersonBack = calculateThirdPersonCamera(mockPlayer, emptyWorld);
  // Behind player (facing -Z, so camera is placed at +Z)
  assert.ok(thirdPersonBack.position.z > 30, 'camera is positioned behind the player (+Z)');
  assert.ok(thirdPersonBack.position.x > 10, 'camera has slight right-shoulder offset (+X)');
  assert.equal(thirdPersonBack.showCrosshair, true, 'crosshair is visible in 3rd person back');
  assert.equal(thirdPersonBack.showModel, true, 'player model is visible');
  assert.ok(thirdPersonBack.lookTarget.z < 30, 'camera looks forward along player sightline (-Z)');

  // 3rd Person Front (perspective 2)
  mockPlayer.perspective = 2;
  const thirdPersonFront = calculateThirdPersonCamera(mockPlayer, emptyWorld);
  // In front of player (-Z)
  assert.ok(thirdPersonFront.position.z < 30, 'camera is positioned in front of player (-Z)');
  assert.equal(thirdPersonFront.showCrosshair, false, 'crosshair is hidden in selfie mode (vanilla parity)');
  assert.equal(thirdPersonFront.showModel, true, 'player model is visible in selfie mode');
  assert.equal(thirdPersonFront.lookTarget.z, 30, 'camera looks back towards player head');
});

test('third-person back camera rises when looking down so ground remains in view', () => {
  const emptyWorld = { getVoxel: () => BLOCKS.AIR };
  const player = {
    position: new THREE.Vector3(0, 10, 0),
    yaw: 0,
    pitch: 0,
    isSneaking: false,
    eyeHeight: 1.62,
    perspective: 1,
    isDungeonMode: false,
  };

  const levelCam = calculateThirdPersonCamera(player, emptyWorld);

  // Pitch downward (-0.6 radians)
  player.pitch = -0.6;
  const pitchDownCam = calculateThirdPersonCamera(player, emptyWorld);

  assert.ok(
    pitchDownCam.position.y > levelCam.position.y,
    `when looking down, third person back camera must rise higher (level y=${levelCam.position.y}, pitch down y=${pitchDownCam.position.y})`
  );
  assert.ok(
    pitchDownCam.lookTarget.y < levelCam.lookTarget.y,
    'camera target point must be down on the ground'
  );
});

test('third-person back hides player model when tightly squeezed against a wall', () => {
  // Solid wall immediately behind player at voxel z >= 1 (player at z = 0.7)
  const tightWorld = {
    getVoxel(x, y, z) {
      if (z >= 1) return BLOCKS.STONE;
      return BLOCKS.AIR;
    }
  };

  const player = {
    position: new THREE.Vector3(0, 10, 0.7),
    yaw: 0,
    pitch: 0,
    isSneaking: false,
    eyeHeight: 1.62,
    perspective: 1,
    isDungeonMode: false,
  };

  const camData = calculateThirdPersonCamera(player, tightWorld);
  assert.ok(camData.actualDistance < 0.55, 'camera distance is clamped very tight');
  assert.equal(camData.showModel, false, 'player model is hidden when camera is pressed against wall to prevent screen blockage');
});

// --- 4. Player Sightline and Interaction Ray Tests ----------------------------

test('getPlayerSightline and Player methods provide full reach sightline across all perspectives', () => {
  const camera = new THREE.PerspectiveCamera();
  const world = { getVoxel: () => BLOCKS.AIR };
  const player = new Player(camera, null, world, {});

  player.position.set(5, 10, 15);
  player.yaw = 0; // facing -Z
  player.pitch = 0;

  const sightline = getPlayerSightline(player);
  assert.equal(sightline.origin.x, 5);
  assert.equal(sightline.origin.y, 10 + player.eyeHeight);
  assert.equal(sightline.origin.z, 15);
  assert.equal(Math.round(sightline.direction.x), 0);
  assert.equal(Math.round(sightline.direction.y), 0);
  assert.equal(Math.round(sightline.direction.z), -1, 'facing -Z');
  assert.equal(sightline.reach, 5.0, 'reach is 5.0 blocks');

  // Verify Player instance helper methods
  const viewVec = player.getViewVector();
  assert.equal(Math.round(viewVec.z), -1);

  const eyePos = player.getEyePosition();
  assert.equal(eyePos.x, 5);
  assert.equal(eyePos.y, 10 + player.eyeHeight);
  assert.equal(eyePos.z, 15);

  // When turning 90 degrees left (yaw = PI / 2), view vector points along -X
  player.yaw = Math.PI / 2;
  const leftVec = player.getViewVector();
  assert.equal(Math.round(leftVec.x), -1);
  assert.equal(Math.round(leftVec.z), 0);

  // When looking up (pitch = 0.5), y component is positive
  player.pitch = 0.5;
  const upVec = player.getViewVector();
  assert.ok(upVec.y > 0, 'looking up has positive y direction');
});

test('updateCameraAndModel smoothly handles perspective switching and limb animation', () => {
  const camera = new THREE.PerspectiveCamera();
  const world = { getVoxel: () => BLOCKS.AIR };
  const player = new Player(camera, null, world, {});

  assert.equal(player.perspective, 0, 'starts in 1st person');
  player.updateCameraAndModel(0.016);
  assert.equal(player.model.visible, false, 'model is hidden in 1st person');

  // Switch to 3rd person back
  player.perspective = 1;
  player.updateCameraAndModel(0.016);
  assert.equal(player.model.visible, true, 'model is visible in 3rd person back');

  // Walking leg swings
  player.velocity.set(2, 0, 0);
  player.updateCameraAndModel(0.016);
  assert.ok(player.model.leftLeg.rotation.x !== undefined);

  // Switch to 3rd person front
  player.perspective = 2;
  player.updateCameraAndModel(0.016);
  assert.equal(player.model.visible, true, 'model is visible in 3rd person front');
});
