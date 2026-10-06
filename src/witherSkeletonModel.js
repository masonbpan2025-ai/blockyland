import * as THREE from 'three';

/** The real 64x32 wither skeleton sheet. */
const WITHER_SKELETON_SKIN_PATH = '/assets/entity/skeleton/wither_skeleton.png';

/**
 * Apply vanilla's box UV layout to a BoxGeometry's six faces, in ATLAS PIXELS from the top-left.
 *
 * A local copy of the helper in `src/mobs.js`, which is not exported; importing the mob manager from a model module
 * would create a cycle.
 */
function applyBoxUVs(geo, u, v, texW, texH, tw, th, td) {
  const faces = [
    { x: u + td + tw, y: v + td, w: td, h: th },
    { x: u, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw + td, y: v + td, w: tw, h: th }
  ];
  const uvs = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = faces[f];
    const u0 = r.x / texW, u1 = (r.x + r.w) / texW;
    const v1 = 1 - r.y / texH, v0 = 1 - (r.y + r.h) / texH;
    const b = f * 4;
    uvs.setXY(b + 0, u0, v1); uvs.setXY(b + 1, u1, v1);
    uvs.setXY(b + 2, u0, v0); uvs.setXY(b + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}


// Original pixel art, with the skull face confined to +Z. Limbs never repeat it.
function boneTexture(face = -1) {
  const data = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const shade = 47 + (x * 7 + y * 11) % 4 * 5;
    let rgb = [shade, shade, shade];
    if (face === 4 && (((x === 1 || x === 2 || x === 5 || x === 6) && y === 3) || (x >= 3 && x <= 4 && y === 4) || (x >= 1 && x <= 6 && y === 5) || (x >= 1 && x <= 6 && x % 2 === 0 && y === 6))) rgb = [12, 12, 12];
    data.set([...rgb, 255], ((7 - y) * 8 + x) * 4);
  }
  const map = new THREE.DataTexture(data, 8, 8);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = map.magFilter = THREE.NearestFilter;
  map.needsUpdate = true;
  return map;
}

export function createWitherSkeletonModel(options = {}) {
  // The REAL sheet on the bone parts. The SKULL keeps its drawn texture, because `witherSkeletonParity` reads
  // `head.material[4].map.image` for exact socket pixels -- that drawn face IS the contract, and replacing it is what
  // broke round fifty-two. // WITHER_SKELETON_SHEET
  const sheet = options.loadTexture ? options.loadTexture(WITHER_SKELETON_SKIN_PATH) : null;
  if (sheet) { sheet.magFilter = THREE.NearestFilter; sheet.minFilter = THREE.NearestFilter; sheet.needsUpdate = true; }
  const mesh = new THREE.Group();
  // The bone material takes the sheet when it exists, with the drawn texture as the stand-in. Both are kept so the
  // atlas still holds a readable image for anything inspecting it.
  const drawnBone = boneTexture();
  const mat = new THREE.MeshLambertMaterial({ map: sheet || drawnBone, transparent: true, alphaTest: 0.5 });
  const skullMaterials = Array.from({ length: 6 }, (_, face) => new THREE.MeshLambertMaterial({ map: boneTexture(face) }));
  const box = (parent, name, size, position, material = mat) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    part.name = name; part.position.set(...position); parent.add(part); return part;
  };
  /** A part carrying vanilla's rectangle for its size, so the sheet samples real patches rather than stretching. */
  const boneBox = (parent, name, size, uu, vv, tw, th, td, position) => {
    const geo = new THREE.BoxGeometry(...size);
    applyBoxUVs(geo, uu, vv, 64, 32, tw, th, td);
    const part = new THREE.Mesh(geo, mat);
    part.name = name;
    part.position.set(...position);
    parent.add(part);
    return part;
  };

  const head = box(mesh, 'skull', [.6, .6, .6], [0, 2.1, 0], skullMaterials);
  const nose = boneBox(head, 'nose', [.125, .25, .125], 24, 0, 2, 4, 2, [0, -.1, .33]);
  boneBox(mesh, 'spine', [.15, .9, .15], 16, 20, 8, 12, 6, [0, 1.35, 0]);
  boneBox(mesh, 'pelvis', [.6, .15, .3], 16, 20, 8, 12, 6, [0, .975, 0]);
  const ribs = [];
  for (let i = 0; i < 3; i++) {
    const y = 1.35 + i * .18;
    ribs.push(boneBox(mesh, `rib-${i}-front`, [.6, .075, .075], 16, 20, 8, 12, 6, [0, y, .15]));
    boneBox(mesh, `rib-${i}-back`, [.6, .075, .075], 16, 20, 8, 12, 6, [0, y, -.15]);
    for (const x of [-.2625, .2625]) boneBox(mesh, `rib-${i}-side`, [.075, .075, .3], 16, 20, 8, 12, 6, [x, y, 0]);
  }
  const limb = (name, x, y) => {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(x, y, 0); mesh.add(pivot);
    boneBox(pivot, `${name}-bone`, [.15, .9, .15], 44, 22, 4, 12, 4, [0, -.45, 0]); return pivot;
  };
  const leftArm = limb('left-arm', .375, 1.8), rightArm = limb('right-arm', -.375, 1.8);
  const leftLeg = limb('left-leg', .15, .9), rightLeg = limb('right-leg', -.15, .9);
  const weaponVisual = new THREE.Group(); weaponVisual.name = 'held-weapon'; weaponVisual.position.set(0, -.8, .08); rightArm.add(weaponVisual);
  weaponVisual.rotation.x = Math.PI * .75;
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x584331 });
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x969696 });
  box(weaponVisual, 'sword-handle', [.09, .24, .09], [0, .04, 0], handleMat);
  box(weaponVisual, 'sword-guard', [.32, .075, .075], [0, .18, 0], bladeMat);
  box(weaponVisual, 'sword-blade', [.135, .66, .06], [0, .54, 0], bladeMat);
  box(weaponVisual, 'sword-tip', [.075, .09, .06], [0, .915, 0], bladeMat);
  const bowVisual = new THREE.Group(); bowVisual.name = 'held-bow'; bowVisual.position.copy(weaponVisual.position); rightArm.add(bowVisual); bowVisual.visible = false;
  for (const [y, z] of [[-.3, 0], [-.15, .09], [0, .15], [.15, .09], [.3, 0]]) box(bowVisual, 'bow-wood', [.06, .18, .06], [0, y, z], handleMat);
  box(bowVisual, 'bow-string', [.015, .6, .015], [0, 0, 0], new THREE.MeshLambertMaterial({ color: 0xd8d1b2 }));
  mesh.traverse(part => { if (part.isMesh) part.castShadow = part.receiveShadow = true; });
  return { mesh, mat, head, leftArm, rightArm, leftLeg, rightLeg, ribs, weaponVisual, bowVisual, bladeMat, drawnBone, ownedTextures: [mat.map, drawnBone, ...skullMaterials.map(m => m.map)] };
}

export function poseWitherSkeleton(mob, dt = 0) {
  mob.walkCycle = (mob.walkCycle || 0) + Math.hypot(mob.velocity.x, mob.velocity.z) * dt * 5;
  const swing = Math.sin(mob.walkCycle) * Math.min(.65, Math.hypot(mob.velocity.x, mob.velocity.z) * .25);
  mob.leftLeg.rotation.x = swing; mob.rightLeg.rotation.x = -swing;
  const armed = mob.weapon != null, bow = mob.weapon === 'bow';
  mob.weaponVisual.visible = armed && !bow; mob.bowVisual.visible = bow;
  const hand = mob.leftHanded ? mob.leftArm : mob.rightArm;
  if (mob.weaponVisual.parent !== hand) hand.add(mob.weaponVisual, mob.bowVisual);
  mob.leftArm.rotation.x = -swing; mob.rightArm.rotation.x = swing;
  if (mob.target) hand.rotation.x = bow ? -Math.PI / 2 : -.85 - Math.sin((mob.swingTime || 0) / .3 * Math.PI) * .8;
  else hand.rotation.x = mob.leftHanded ? -swing : swing;
}
