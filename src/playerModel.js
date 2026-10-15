// Authentic Minecraft Java / Bedrock Player 3D Character Model
// Replaces naive solid-color boxes with a fully-articulated Minecraft character model
// supporting 64x64 skin mapping (Steve / Alex / custom skins), 3D dual-layer overlays
// (hat, jacket, sleeves, pants), smooth limb walking swing, punch thrust, roll animation,
// and head pitch rotation.

import * as THREE from 'three';
import { skinManager } from './skinManager.js';

/**
 * Maps Minecraft skin box coordinates on a 64x64 skin texture onto a Three.js BoxGeometry.
 *
 * In Minecraft skin coordinates:
 * - Texture is 64x64 pixels.
 * - For a box at texture origin (texX, texY) of size (texW, texH, texD):
 *   +X (Right side): [texX, texY + texD, texD, texH]
 *   -X (Left side):  [texX + texD + texW, texY + texD, texD, texH]
 *   +Y (Top):        [texX + texD, texY, texW, texD]
 *   -Y (Bottom):     [texX + texD + texW, texY, texW, texD]
 *   +Z (Back):       [texX + texD + texW + texD, texY + texD, texW, texH]
 *   -Z (Front/Face): [texX + texD, texY + texD, texW, texH]
 */
export function applyBoxUVs(geom, texX, texY, texW, texH, texD) {
  const uvs = geom.attributes.uv.array;
  const W = 64;
  const H = 64;

  function setFaceUV(faceIdx, u0, v0, u1, v1) {
    const offset = faceIdx * 8;
    uvs[offset + 0] = u0 / W; uvs[offset + 1] = 1 - v0 / H;
    uvs[offset + 2] = u1 / W; uvs[offset + 3] = 1 - v0 / H;
    uvs[offset + 4] = u0 / W; uvs[offset + 5] = 1 - v1 / H;
    uvs[offset + 6] = u1 / W; uvs[offset + 7] = 1 - v1 / H;
  }

  // 0: +X (Right)
  setFaceUV(0, texX, texY + texD, texX + texD, texY + texD + texH);
  // 1: -X (Left)
  setFaceUV(1, texX + texD + texW, texY + texD, texX + texD + texW + texD, texY + texD + texH);
  // 2: +Y (Top)
  setFaceUV(2, texX + texD + texW, texY + texD, texX + texD, texY);
  // 3: -Y (Bottom)
  setFaceUV(3, texX + texD + texW + texW, texY, texX + texD + texW, texY + texD);
  // 4: +Z (Back)
  setFaceUV(4, texX + texD + texW + texD, texY + texD, texX + texD + texW + texD + texW, texY + texD + texH);
  // 5: -Z (Front - Face)
  setFaceUV(5, texX + texD, texY + texD, texX + texD + texW, texY + texD + texH);

  geom.attributes.uv.needsUpdate = true;
}

/**
 * Creates a Textured Mesh for a Minecraft body part or overlay.
 */
function createSkinBox(w, h, d, texX, texY, texW, texH, texD, material, expand = 0) {
  const geom = new THREE.BoxGeometry(w + expand * 2, h + expand * 2, d + expand * 2);
  applyBoxUVs(geom, texX, texY, texW, texH, texD);
  return new THREE.Mesh(geom, material);
}

/**
 * Constructs a fully textured 3D Minecraft player model.
 *
 * @param {Object} [options]
 * @param {string} [options.skinDataUrl] Optional skin data URL or texture override.
 * @param {'default'|'slim'} [options.modelType] 'default' (4px arms, Steve) or 'slim' (3px arms, Alex).
 * @returns {THREE.Group}
 */
export function createPlayerModel({ skinDataUrl = null, modelType = 'default' } = {}) {
  const group = new THREE.Group();

  // 1. Prepare Skin Texture & Materials
  let texture = null;
  const isHeadless = typeof document === 'undefined'
    || typeof document.createElementNS !== 'function'
    || typeof Image === 'undefined';

  if (!isHeadless) {
    const skin = skinManager.getEquippedSkin();
    const sourceUrl = skinDataUrl || skin?.dataUrl || '/assets/entity/player/wide/steve.png';

    const loader = new THREE.TextureLoader();
    texture = loader.load(sourceUrl);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
  }

  // Base material (opaque body parts)
  const baseMaterial = isHeadless
    ? new THREE.MeshLambertMaterial({ color: 0xdbb494 })
    : new THREE.MeshLambertMaterial({
        map: texture,
        side: THREE.FrontSide,
      });

  // Overlay material (hair, jacket, sleeves, pants outer layer with transparency)
  const overlayMaterial = isHeadless
    ? new THREE.MeshLambertMaterial({ color: 0x4a2a18, transparent: true, opacity: 0.85 })
    : new THREE.MeshLambertMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
      });

  const armW = modelType === 'slim' ? 0.1875 : 0.25;
  const armTexW = modelType === 'slim' ? 3 : 4;
  const armOffsetX = modelType === 'slim' ? 0.34 : 0.38;

  // 2. Head (8x8x8 px = 0.5 x 0.5 x 0.5 world units)
  // Pivot at neck/chin base: (0, 1.5, 0)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.5, 0);

  const headMesh = createSkinBox(0.5, 0.5, 0.5, 0, 0, 8, 8, 8, baseMaterial);
  headMesh.position.set(0, 0.25, 0);
  headGroup.add(headMesh);

  // Outer Hat/Hair Layer (slightly expanded by 0.035 for 3D depth)
  const hatMesh = createSkinBox(0.5, 0.5, 0.5, 32, 0, 8, 8, 8, overlayMaterial, 0.03);
  hatMesh.position.set(0, 0.25, 0);
  headGroup.add(hatMesh);

  group.add(headGroup);

  // 3. Torso (8x12x4 px = 0.5 x 0.75 x 0.25 world units)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.125, 0);

  const torsoMesh = createSkinBox(0.5, 0.75, 0.25, 16, 16, 8, 12, 4, baseMaterial);
  torsoGroup.add(torsoMesh);

  // Outer Jacket Layer
  const jacketMesh = createSkinBox(0.5, 0.75, 0.25, 16, 32, 8, 12, 4, overlayMaterial, 0.025);
  torsoGroup.add(jacketMesh);

  group.add(torsoGroup);

  // 4. Left Arm (Shoulder Pivot at (-armOffsetX, 1.375, 0))
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-armOffsetX, 1.375, 0);

  const leftArmMesh = createSkinBox(armW, 0.75, 0.25, 32, 48, armTexW, 12, 4, baseMaterial);
  leftArmMesh.position.set(0, -0.375, 0);
  leftArmGroup.add(leftArmMesh);

  // Left Sleeve Overlay
  const leftSleeveMesh = createSkinBox(armW, 0.75, 0.25, 48, 48, armTexW, 12, 4, overlayMaterial, 0.02);
  leftSleeveMesh.position.set(0, -0.375, 0);
  leftArmGroup.add(leftSleeveMesh);

  group.add(leftArmGroup);

  // 5. Right Arm (Shoulder Pivot at (+armOffsetX, 1.375, 0))
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(armOffsetX, 1.375, 0);

  const rightArmMesh = createSkinBox(armW, 0.75, 0.25, 40, 16, armTexW, 12, 4, baseMaterial);
  rightArmMesh.position.set(0, -0.375, 0);
  rightArmGroup.add(rightArmMesh);

  // Right Sleeve Overlay
  const rightSleeveMesh = createSkinBox(armW, 0.75, 0.25, 40, 32, armTexW, 12, 4, overlayMaterial, 0.02);
  rightSleeveMesh.position.set(0, -0.375, 0);
  rightArmGroup.add(rightSleeveMesh);

  group.add(rightArmGroup);

  // 6. Left Leg (Hip Pivot at (-0.125, 0.75, 0))
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.125, 0.75, 0);

  const leftLegMesh = createSkinBox(0.24, 0.75, 0.24, 16, 48, 4, 12, 4, baseMaterial);
  leftLegMesh.position.set(0, -0.375, 0);
  leftLegGroup.add(leftLegMesh);

  // Left Pants Overlay
  const leftPantsMesh = createSkinBox(0.24, 0.75, 0.24, 0, 48, 4, 12, 4, overlayMaterial, 0.02);
  leftPantsMesh.position.set(0, -0.375, 0);
  leftLegGroup.add(leftPantsMesh);

  group.add(leftLegGroup);

  // 7. Right Leg (Hip Pivot at (+0.125, 0.75, 0))
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.125, 0.75, 0);

  const rightLegMesh = createSkinBox(0.24, 0.75, 0.24, 0, 16, 4, 12, 4, baseMaterial);
  rightLegMesh.position.set(0, -0.375, 0);
  rightLegGroup.add(rightLegMesh);

  // Right Pants Overlay
  const rightPantsMesh = createSkinBox(0.24, 0.75, 0.24, 0, 32, 4, 12, 4, overlayMaterial, 0.02);
  rightPantsMesh.position.set(0, -0.375, 0);
  rightLegGroup.add(rightPantsMesh);

  group.add(rightLegGroup);

  // Expose core limbs with backward-compatible API
  group.head = headGroup;
  group.torso = torsoGroup;
  group.leftArm = leftArmGroup;
  group.rightArm = rightArmGroup;
  group.leftLeg = leftLegGroup;
  group.rightLeg = rightLegGroup;

  group.baseMaterial = baseMaterial;
  group.overlayMaterial = overlayMaterial;

  /**
   * Updates the skin texture dynamically when the player selects a new skin in the Skin Pack modal.
   */
  group.updateSkin = (newSkinDataUrl) => {
    if (isHeadless || !newSkinDataUrl) return;
    const loader = new THREE.TextureLoader();
    loader.load(newSkinDataUrl, (newTexture) => {
      newTexture.magFilter = THREE.NearestFilter;
      newTexture.minFilter = THREE.NearestFilter;
      newTexture.colorSpace = THREE.SRGBColorSpace;
      newTexture.generateMipmaps = false;

      baseMaterial.map = newTexture;
      baseMaterial.needsUpdate = true;

      overlayMaterial.map = newTexture;
      overlayMaterial.needsUpdate = true;
    });
  };

  // Wire skin manager listener to automatically update character skin
  if (!isHeadless) {
    skinManager.onChange((mgr) => {
      const skin = mgr.getEquippedSkin();
      if (skin?.dataUrl) {
        group.updateSkin(skin.dataUrl);
      }
    });
  }

  return group;
}
