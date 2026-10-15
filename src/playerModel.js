// Authentic Minecraft Java / Bedrock Player 3D Character Model
// Replaces naive solid-color boxes with a fully-articulated Minecraft character model
// supporting 64x64 skin mapping (Steve / Alex / custom skins), 3D dual-layer overlays
// (hat, jacket, sleeves, pants), smooth limb walking swing, punch thrust, roll animation,
// and head pitch rotation.

import * as THREE from 'three';
import { skinManager } from './skinManager.js';
import { ARMOR_PALETTES, getArmorMaterial } from './armourPalettes.js';
import { TRIM_MATERIALS, trimOf } from './smithing.js';

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

  // Armor visual pieces tracking
  group.armorPieces = {
    head: null,
    chest: null,
    legs: null,
    feet: null,
  };
  group.equippedArmorState = {
    head: null,
    chest: null,
    legs: null,
    feet: null,
  };

  const removeSlotArmor = (slot) => {
    const existing = group.armorPieces[slot];
    if (!existing) return;

    if (slot === 'head') {
      if (existing.parent) existing.parent.remove(existing);
      else group.head.remove(existing);
      disposeObject3D(existing);
    } else if (slot === 'chest') {
      if (existing.torso) {
        if (existing.torso.parent) existing.torso.parent.remove(existing.torso);
        else group.torso.remove(existing.torso);
        disposeObject3D(existing.torso);
      }
      if (existing.leftArm) {
        if (existing.leftArm.parent) existing.leftArm.parent.remove(existing.leftArm);
        else group.leftArm.remove(existing.leftArm);
        disposeObject3D(existing.leftArm);
      }
      if (existing.rightArm) {
        if (existing.rightArm.parent) existing.rightArm.parent.remove(existing.rightArm);
        else group.rightArm.remove(existing.rightArm);
        disposeObject3D(existing.rightArm);
      }
    } else if (slot === 'legs') {
      if (existing.torso) {
        if (existing.torso.parent) existing.torso.parent.remove(existing.torso);
        else group.torso.remove(existing.torso);
        disposeObject3D(existing.torso);
      }
      if (existing.leftLeg) {
        if (existing.leftLeg.parent) existing.leftLeg.parent.remove(existing.leftLeg);
        else group.leftLeg.remove(existing.leftLeg);
        disposeObject3D(existing.leftLeg);
      }
      if (existing.rightLeg) {
        if (existing.rightLeg.parent) existing.rightLeg.parent.remove(existing.rightLeg);
        else group.rightLeg.remove(existing.rightLeg);
        disposeObject3D(existing.rightLeg);
      }
    } else if (slot === 'feet') {
      if (existing.leftLeg) {
        if (existing.leftLeg.parent) existing.leftLeg.parent.remove(existing.leftLeg);
        else group.leftLeg.remove(existing.leftLeg);
        disposeObject3D(existing.leftLeg);
      }
      if (existing.rightLeg) {
        if (existing.rightLeg.parent) existing.rightLeg.parent.remove(existing.rightLeg);
        else group.rightLeg.remove(existing.rightLeg);
        disposeObject3D(existing.rightLeg);
      }
    }
    group.armorPieces[slot] = null;
  };

  const equipSlotArmor = (slot, item) => {
    if (slot === 'head') {
      const helmet = buildHelmet(item);
      group.head.add(helmet);
      group.armorPieces.head = helmet;
    } else if (slot === 'chest') {
      const pieces = buildChestplate(item, armW);
      group.torso.add(pieces.torso);
      group.leftArm.add(pieces.leftArm);
      group.rightArm.add(pieces.rightArm);
      group.armorPieces.chest = pieces;
    } else if (slot === 'legs') {
      const pieces = buildLeggings(item);
      group.torso.add(pieces.torso);
      group.leftLeg.add(pieces.leftLeg);
      group.rightLeg.add(pieces.rightLeg);
      group.armorPieces.legs = pieces;
    } else if (slot === 'feet') {
      const pieces = buildBoots(item);
      group.leftLeg.add(pieces.leftLeg);
      group.rightLeg.add(pieces.rightLeg);
      group.armorPieces.feet = pieces;
    }
  };

  group.updateArmor = (armor) => {
    const currentArmor = armor || {};
    const slots = ['head', 'chest', 'legs', 'feet'];

    for (const slot of slots) {
      const item = currentArmor[slot] || null;
      const prev = group.equippedArmorState[slot];

      const prevId = prev ? prev.id : null;
      const currId = item ? item.id : null;
      const prevTrim = prev ? prev.trimKey : null;
      const currTrim = item?.trim ? `${item.trim.pattern}_${item.trim.material}` : null;

      if (prevId === currId && prevTrim === currTrim) {
        continue;
      }

      removeSlotArmor(slot);

      if (item && item.id) {
        equipSlotArmor(slot, item);
        group.equippedArmorState[slot] = { id: item.id, trimKey: currTrim };
      } else {
        group.equippedArmorState[slot] = null;
      }
    }
  };

  group.hasArmor = (slot) => !!group.armorPieces[slot];
  group.getArmorPiece = (slot) => group.armorPieces[slot] || null;

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

  /**
   * Updates character arm geometry when toggling or switching between Classic (4px) and Slim (3px) models.
   */
  group.updateModelType = (newModelType) => {
    if (isHeadless) return;
    const isSlim = newModelType === 'slim';
    const newArmW = isSlim ? 0.1875 : 0.25;
    const newArmTexW = isSlim ? 3 : 4;
    const newArmOffsetX = isSlim ? 0.34 : 0.38;

    leftArmGroup.position.set(-newArmOffsetX, 1.375, 0);
    rightArmGroup.position.set(newArmOffsetX, 1.375, 0);

    leftArmMesh.geometry.dispose();
    leftArmMesh.geometry = new THREE.BoxGeometry(newArmW, 0.75, 0.25);
    applyBoxUVs(leftArmMesh.geometry, 32, 48, newArmTexW, 12, 4);

    leftSleeveMesh.geometry.dispose();
    leftSleeveMesh.geometry = new THREE.BoxGeometry(newArmW, 0.75, 0.25);
    applyBoxUVs(leftSleeveMesh.geometry, 48, 48, newArmTexW, 12, 4);

    rightArmMesh.geometry.dispose();
    rightArmMesh.geometry = new THREE.BoxGeometry(newArmW, 0.75, 0.25);
    applyBoxUVs(rightArmMesh.geometry, 40, 16, newArmTexW, 12, 4);

    rightSleeveMesh.geometry.dispose();
    rightSleeveMesh.geometry = new THREE.BoxGeometry(newArmW, 0.75, 0.25);
    applyBoxUVs(rightSleeveMesh.geometry, 40, 32, newArmTexW, 12, 4);
  };

  // Wire skin manager listener to automatically update character skin
  if (!isHeadless) {
    skinManager.onChange((mgr) => {
      const skin = mgr.getEquippedSkin();
      if (skin?.dataUrl) {
        group.updateSkin(skin.dataUrl);
      }
      if (skin?.model && group.updateModelType) {
        group.updateModelType(skin.model);
      }
    });
  }

  return group;
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    }
  });
}

function parseHexColor(colorStr, fallback = 0xd8d8d8) {
  if (!colorStr) return fallback;
  if (typeof colorStr === 'number') return colorStr;
  const hex = String(colorStr).replace('#', '0x');
  const val = parseInt(hex, 16);
  return Number.isNaN(val) ? fallback : val;
}

function markShadows(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createArmorMaterials(item) {
  const matKey = getArmorMaterial(item);
  const palette = ARMOR_PALETTES[matKey] || ARMOR_PALETTES.iron;
  const trim = trimOf(item);

  const mainColor = parseHexColor(palette.main, 0xd8d8d8);
  const darkColor = parseHexColor(palette.dark, 0x8e8e8e);
  const lightColor = parseHexColor(palette.light, 0xffffff);
  const accentColor = parseHexColor(palette.accent, 0x6b6b6b);

  let trimMat = null;
  if (trim && trim.material) {
    const trimDef = TRIM_MATERIALS[trim.material];
    const trimHex = trimDef?.color || palette.accent;
    trimMat = new THREE.MeshLambertMaterial({
      color: parseHexColor(trimHex, 0xffffff),
    });
  }

  return {
    matKey,
    main: new THREE.MeshLambertMaterial({ color: mainColor }),
    dark: new THREE.MeshLambertMaterial({ color: darkColor }),
    light: new THREE.MeshLambertMaterial({ color: lightColor }),
    accent: new THREE.MeshLambertMaterial({ color: accentColor }),
    trim: trimMat,
  };
}

function buildHelmet(item) {
  const materials = createArmorMaterials(item);
  const helmetGroup = new THREE.Group();
  helmetGroup.name = 'armor_helmet';

  // 1. Top Cap (covers top of head)
  const topMesh = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.58), materials.main));
  topMesh.position.set(0, 0.49, 0);
  helmetGroup.add(topMesh);

  // 2. Back Plate (covers back of head)
  const backMesh = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.38, 0.09), materials.main));
  backMesh.position.set(0, 0.25, 0.245);
  helmetGroup.add(backMesh);

  // 3. Left Cheek Guard
  const leftCheek = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.58), materials.main));
  leftCheek.position.set(-0.245, 0.25, 0);
  helmetGroup.add(leftCheek);

  // 4. Right Cheek Guard
  const rightCheek = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.58), materials.main));
  rightCheek.position.set(0.245, 0.25, 0);
  helmetGroup.add(rightCheek);

  // 5. Forehead Brow Band (above eyes)
  const browMesh = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.13, 0.09), materials.light));
  browMesh.position.set(0, 0.375, -0.245);
  helmetGroup.add(browMesh);

  // 6. Nose Guard or Turtle Shell Crest
  if (materials.matKey === 'turtle') {
    const crestMesh = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.46), materials.light));
    crestMesh.position.set(0, 0.55, 0);
    helmetGroup.add(crestMesh);
  } else if (materials.matKey !== 'leather') {
    const noseMesh = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.09), materials.accent));
    noseMesh.position.set(0, 0.23, -0.245);
    helmetGroup.add(noseMesh);
  }

  // 7. Trim Overlay
  if (materials.trim) {
    const trimBrow = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.04, 0.10), materials.trim));
    trimBrow.position.set(0, 0.375, -0.25);
    helmetGroup.add(trimBrow);
  }

  return helmetGroup;
}

function buildChestplate(item, armW) {
  const materials = createArmorMaterials(item);

  // Torso Body
  const torsoPiece = new THREE.Group();
  torsoPiece.name = 'armor_chestplate_torso';

  const bodyBox = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 0.33), materials.main));
  bodyBox.position.set(0, 0, 0);
  torsoPiece.add(bodyBox);

  const crest = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.46, 0.04), materials.light));
  crest.position.set(0, 0.08, -0.165);
  torsoPiece.add(crest);

  if (materials.trim) {
    const trimPlate = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.04), materials.trim));
    trimPlate.position.set(0, 0.08, -0.17);
    torsoPiece.add(trimPlate);
  }

  // Left Shoulder Pauldron
  const leftPauldron = new THREE.Group();
  leftPauldron.name = 'armor_chestplate_leftArm';
  const pauldronW = armW + 0.06;

  const leftBox = markShadows(new THREE.Mesh(new THREE.BoxGeometry(pauldronW, 0.44, 0.32), materials.main));
  leftBox.position.set(0, -0.22, 0);
  leftPauldron.add(leftBox);

  const leftCap = markShadows(new THREE.Mesh(new THREE.BoxGeometry(pauldronW + 0.03, 0.08, 0.34), materials.light));
  leftCap.position.set(0, -0.04, 0);
  leftPauldron.add(leftCap);

  // Right Shoulder Pauldron
  const rightPauldron = new THREE.Group();
  rightPauldron.name = 'armor_chestplate_rightArm';

  const rightBox = markShadows(new THREE.Mesh(new THREE.BoxGeometry(pauldronW, 0.44, 0.32), materials.main));
  rightBox.position.set(0, -0.22, 0);
  rightPauldron.add(rightBox);

  const rightCap = markShadows(new THREE.Mesh(new THREE.BoxGeometry(pauldronW + 0.03, 0.08, 0.34), materials.light));
  rightCap.position.set(0, -0.04, 0);
  rightPauldron.add(rightCap);

  return { torso: torsoPiece, leftArm: leftPauldron, rightArm: rightPauldron };
}

function buildLeggings(item) {
  const materials = createArmorMaterials(item);

  // Waistband/Belt on torso
  const beltPiece = new THREE.Group();
  beltPiece.name = 'armor_leggings_belt';

  const beltBox = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.22, 0.32), materials.main));
  beltBox.position.set(0, -0.28, 0);
  beltPiece.add(beltBox);

  const buckle = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.04), materials.accent));
  buckle.position.set(0, -0.28, -0.165);
  beltPiece.add(buckle);

  if (materials.trim) {
    const trimBelt = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.33), materials.trim));
    trimBelt.position.set(0, -0.24, 0);
    beltPiece.add(trimBelt);
  }

  // Left Leg guard
  const leftLegging = new THREE.Group();
  leftLegging.name = 'armor_leggings_leftLeg';

  const leftThigh = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.50, 0.29), materials.main));
  leftThigh.position.set(0, -0.25, 0);
  leftLegging.add(leftThigh);

  const leftKnee = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), materials.light));
  leftKnee.position.set(0, -0.38, -0.15);
  leftLegging.add(leftKnee);

  // Right Leg guard
  const rightLegging = new THREE.Group();
  rightLegging.name = 'armor_leggings_rightLeg';

  const rightThigh = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.50, 0.29), materials.main));
  rightThigh.position.set(0, -0.25, 0);
  rightLegging.add(rightThigh);

  const rightKnee = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), materials.light));
  rightKnee.position.set(0, -0.38, -0.15);
  rightLegging.add(rightKnee);

  return { torso: beltPiece, leftLeg: leftLegging, rightLeg: rightLegging };
}

function buildBoots(item) {
  const materials = createArmorMaterials(item);

  // Left Boot
  const leftBoot = new THREE.Group();
  leftBoot.name = 'armor_boots_leftLeg';

  const bMeshLeft = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.30, 0.32), materials.main));
  bMeshLeft.position.set(0, -0.61, -0.01);
  leftBoot.add(bMeshLeft);

  const cuffLeft = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.33), materials.dark));
  cuffLeft.position.set(0, -0.48, -0.01);
  leftBoot.add(cuffLeft);

  const soleLeft = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.34), materials.accent));
  soleLeft.position.set(0, -0.74, -0.015);
  leftBoot.add(soleLeft);

  if (materials.trim) {
    const trimToe = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.04), materials.trim));
    trimToe.position.set(0, -0.68, -0.175);
    leftBoot.add(trimToe);
  }

  // Right Boot
  const rightBoot = new THREE.Group();
  rightBoot.name = 'armor_boots_rightLeg';

  const bMeshRight = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.30, 0.32), materials.main));
  bMeshRight.position.set(0, -0.61, -0.01);
  rightBoot.add(bMeshRight);

  const cuffRight = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.33), materials.dark));
  cuffRight.position.set(0, -0.48, -0.01);
  rightBoot.add(cuffRight);

  const soleRight = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.34), materials.accent));
  soleRight.position.set(0, -0.74, -0.015);
  rightBoot.add(soleRight);

  if (materials.trim) {
    const trimToe = markShadows(new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.04), materials.trim));
    trimToe.position.set(0, -0.68, -0.175);
    rightBoot.add(trimToe);
  }

  return { leftLeg: leftBoot, rightLeg: rightBoot };
}
