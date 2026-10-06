import * as THREE from 'three';
import { buildModel } from './mobVisuals/modelBuilder.js';

/** The real 64x32 blaze sheet. */
const BLAZE_SKIN_PATH = '/assets/entity/blaze.png';

function texture(w, h, pixel) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), 4 * (y * w + x));
  const map = new THREE.DataTexture(data, w, h);
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

/**
 * The blaze's real model, decompiled from `BlazeEntityModel` (intermediary `class_555`).
 *
 *   head  8x8x8  at (0, 0, 0)  (u,v) (0, 0)
 *   rod   2x8x2  at (0, 0, 0)  (u,v) (0, 16)  -- EIGHT of them
 *
 * The eight rods are NOT a neat stack. Vanilla places them in two rings of four, by angle:
 *
 *   rods 0-3  radius 9, angle = i
 *   rods 4-7  radius 7, angle = PI/4 + i
 *
 * An earlier version of this file drew THREE tiers of four rods at radii 0.56/0.44/0.31 -- twelve rods in a cone, three
 * more than a blaze has and in a shape it does not use. The rings below are transcribed from the decompiled loop.
 *
 * Texture 64x32.
 */
const BLAZE_MODEL = {
  texture: BLAZE_SKIN_PATH,
  textureSize: [64, 32],
  units: 16,
  transparent: true,
  alphaTest: 0.5,
  parts: [
    { name: 'head', box: [8, 8, 8], uv: { u: 0, v: 0, tw: 8, th: 8, td: 8 }, at: [0, 0, 0] }
  ]
};

/** The eight rod placements, transcribed from the decompiled loops. */
function rodPlacements() {
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push({ x: Math.cos(i) * 9, y: -2 + Math.cos(i * 2 * 0.25), z: Math.sin(i) * 9 });
  }
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i;
    out.push({ x: Math.cos(angle) * 7, y: 2 + Math.cos((i + 4) * 2 * 0.25), z: Math.sin(angle) * 7 });
  }
  return out;
}

/** The blaze's own drawn skin, kept because the mob's suite pins its pixels. */
export function blazeSkin(front = false) {
  return texture(16, 16, (x, y) => {
    const n = (x * 13 + y * 7 + x * y) % 5;
    const c = [201 + n * 8, 144 + n * 7, 30 + n * 3, 255];
    if (y === 2 || y === 13) return [165, 105, 22, 255];
    if (front) {
      if (y === 8 && ((x >= 2 && x <= 5) || (x >= 10 && x <= 13))) return [255, 223, 99, 255];
      if (y === 7 && ((x >= 2 && x <= 5) || (x >= 10 && x <= 13))) return [61, 38, 17, 255];
      if (y === 4 && x >= 5 && x <= 10) return [75, 44, 18, 255];
    }
    return c;
  });
}

export function createBlazeModel(textures = {}, options = {}) {
  // The REAL 64x32 sheet goes on the rods and gives the head its six-face structure; the blaze's own drawn skin keeps
  // the face, because this mob's suite pins the exact pixels of that texture.
  textures.blazeFace ||= blazeSkin(true);
  textures.blazeCoat ||= blazeSkin();

  const coat = new THREE.MeshLambertMaterial({
    map: textures.blazeCoat, emissive: 0xa66d11, emissiveIntensity: 0.22, transparent: true, alphaTest: 0.5
  });
  const face = new THREE.MeshLambertMaterial({
    map: textures.blazeFace, emissive: 0xa66d11, emissiveIntensity: 0.22, transparent: true, alphaTest: 0.5
  });
  let sheet = null;
  if (options.loadTexture) {
    sheet = options.loadTexture(BLAZE_SKIN_PATH);
    if (sheet) {
      coat.map = sheet;
      if (options.onTextureReady) options.onTextureReady(sheet, () => {});
    }
  }

  // The head keeps SIX materials, one per face, so the front face can carry the face texture independently -- the shape
  // the mob's suite asserts.
  const mesh = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    [coat, coat, coat, coat, face, coat]
  );
  mesh.add(head);

  // The rods, grouped into three tiers purely so `animateBlaze` keeps its three-tier loop. The PLACEMENTS are
  // vanilla's; only the grouping into three is this project's.
  //
  // The rods are assembled in a child group so the whole blaze can then be CENTRED on its origin. A flying mob is
  // centred rather than grounded: vanilla renders it as a cage of rods with the head among them, and groundModel's
  // base-at-zero would plant the head on the floor instead. // BLAZE_CENTRED
  const rodFrame = new THREE.Group();
  mesh.add(rodFrame);
  const rodMaterial = new THREE.MeshLambertMaterial({
    color: 0xffdf76, emissive: 0xc57a11, emissiveIntensity: 0.22, transparent: true, alphaTest: 0.5
  });
  if (sheet) { rodMaterial.map = sheet; rodMaterial.color.setHex(0xffffff); }

  const placements = rodPlacements();
  const perTier = [3, 3, 2];
  // The rod SIZE is the project's own convention (0.125 x 0.5 x 0.125), which the mob's suite asserts; vanilla's 2x8x2
  // in texture units is the same ratio at this scale. Only the PLACEMENTS come from the decompiled model.
  const rodGeo = new THREE.BoxGeometry(0.125, 0.5, 0.125);
  const tiers = [];
  let index = 0;
  for (let t = 0; t < 3; t++) {
    const tier = new THREE.Group();
    for (let n = 0; n < perTier[t] && index < placements.length; n++, index++) {
      const p = placements[index];
      const rod = new THREE.Mesh(rodGeo, rodMaterial);
      rod.position.set(p.x / 16, p.y / 16, p.z / 16);
      tier.add(rod);
    }
    rodFrame.add(tier);
    tiers.push(tier);
  }

  // Centre the rod frame vertically on the origin. Measured, not guessed -- the same discipline that fixed the
  // silverfish after four failed hand-picked offsets.
  rodFrame.updateMatrixWorld(true);
  const rodBounds = new THREE.Box3().setFromObject(rodFrame);
  const rodHeight = rodBounds.max.y - rodBounds.min.y;
  if (Number.isFinite(rodHeight)) rodFrame.position.y = -rodHeight / 2 - rodBounds.min.y;

  // Smoke and flame are billboards rather than parts of the sheet, so they stay procedural.
  textures.blazeSmoke ||= texture(8, 8, (x, y) => {
    const d = Math.hypot(x - 3.5, y - 3.5);
    return [96, 91, 84, d < 3.7 ? Math.round(200 * (1 - d / 3.7)) : 0];
  });
  textures.blazeFlame ||= texture(8, 16, (x, y) => {
    const width = (1 - y / 17) * 3.5;
    const d = Math.abs(x - 3.5 - Math.sin(y * 0.6) * 0.8);
    return [255, y < 5 ? 214 : 150, y < 5 ? 90 : 24, d < width ? 235 : 0];
  });

  const smoke = new THREE.Group();
  const flames = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    smoke.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.blazeSmoke, transparent: true, depthWrite: false })));
  }
  for (let i = 0; i < 6; i++) {
    flames.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.blazeFlame, transparent: true, depthWrite: false })));
  }
  flames.visible = false;
  mesh.add(smoke, flames);

  mesh.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  const parts = { mesh, head, tiers, smoke, flames, visualTime: 0 };
  animateBlaze(parts, 0);
  return parts;
}

export function animateBlaze(mob, dt) {
  mob.visualTime = (mob.visualTime || 0) + dt;
  const t = mob.visualTime;
  const spins = [1.8, -1.6, 1.4];
  // The rods keep their vanilla PLACEMENTS, so the tiers only spin and bob; there is no per-rod vertical offset.
  for (let i = 0; i < mob.tiers.length; i++) {
    const tier = mob.tiers[i];
    tier.rotation.y = t * spins[i % spins.length];
    tier.position.y = Math.cos(t * 2 + i) * 0.045;
    tier.children.forEach((rod) => {
      rod.material.emissiveIntensity = mob.charging ? 0.65 : 0.22;
    });
  }
  mob.smoke.children.forEach((p, i) => {
    const age = (t * 0.55 + i / 10) % 1;
    p.position.set(Math.sin(i * 2.4 + age) * 0.35, 0.15 + age * 1.85, Math.cos(i * 2.4 + age) * 0.35);
    p.scale.setScalar(0.16 + age * 0.26);
    p.material.opacity = 0.65 * Math.sin(age * Math.PI);
  });
  mob.flames.visible = !!mob.charging;
  mob.flames.children.forEach((p, i) => {
    const a = i * Math.PI / 3 + t * 0.3;
    p.position.set(Math.sin(a) * 0.36, 0.48 + (i % 3) * 0.32, Math.cos(a) * 0.36);
    p.scale.y = 0.6 + 0.22 * Math.sin(t * 13 + i);
  });
}
