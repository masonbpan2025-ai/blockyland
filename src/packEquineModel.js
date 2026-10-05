import * as THREE from 'three';
import { createHorseModel } from './horseModel.js';

export const isPackEquine = mob => ['donkey', 'mule'].includes(typeof mob === 'string' ? mob : mob?.type);

function coatTexture(color) {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const noise = ((x * 13 + y * 17 + x * y * 3) % 11 - 5) * 2;
    const i = (y * 16 + x) * 4;
    for (let c = 0; c < 3; c++) pixels[i + c] = ((color >> (16 - c * 8)) & 255) + noise;
    pixels[i + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, 16, 16);
  map.minFilter = map.magFilter = THREE.NearestFilter;
  map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true;
  return map;
}

// Reuse the horse's articulated rig, with species-specific coat, ears, muzzle,
// ankles, flat mane, tufted tail and chest geometry. Textures are original pixels.
export function createPackEquineModel(type, cache = {}) {
  const model = createHorseModel(3, 0, cache), rig = model.mesh;
  const skin = new THREE.MeshLambertMaterial({map: cache[`pack-${type}`] ||= coatTexture(type === 'mule' ? 0x67452f : 0x817565)});
  const dark = new THREE.MeshLambertMaterial({color: 0x302921});
  const pale = new THREE.MeshLambertMaterial({color: type === 'mule' ? 0xb6a288 : 0xc1b8a1});
  const oldSkin = new Set();
  rig.traverse(o => {if (o.material?.map) {oldSkin.add(o.material); o.material = skin;}});
  oldSkin.forEach(m => m.dispose());
  const box = (parent, name, size, pos, material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    m.name = name; m.position.set(...pos); parent.add(m); return m;
  };
  const resize = (name, size) => {const m = rig.getObjectByName(name); m.geometry.dispose(); m.geometry = new THREE.BoxGeometry(...size); return m;};
  const ears = []; rig.traverse(o => {if (o.name === 'ear') ears.push(o);});
  for (const ear of ears) {
    ear.geometry.dispose(); ear.geometry = new THREE.BoxGeometry(.1, .42, .1);
    ear.position.y = .31; ear.material = dark;
    box(ear, 'ear-inner', [.063, .32, .012], [0, .015, .055], pale);
  }
  resize('mane', [.09, .7, .012]).position.z = -.175;
  rig.getObjectByName('mane').material = dark;
  rig.getObjectByName('muzzle').material = pale;
  rig.getObjectByName('nose').material = pale;
  const skull = rig.getObjectByName('muzzle').parent;
  for (const side of [-1, 1]) box(skull, 'nostril', [.04, .035, .014], [side * .085, -.055, .611], dark);
  for (const leg of model.legs) box(leg, 'dark-ankle', [.195, .2, .195], [0, -.63, 0], dark);
  const tail = resize('tail', [.055, .35, .055]); tail.position.set(0, -.15, -.025); tail.material = skin;
  box(model.tail, 'tail-tuft', [.13, .16, .12], [0, -.38, -.025], dark);
  model.armorMesh.removeFromParent(); model.headArmorMesh.removeFromParent();
  model.armorMesh.geometry.dispose(); model.headArmorMesh.geometry.dispose(); model.armorMesh.material.dispose();
  delete model.armorMesh; delete model.headArmorMesh;
  const chestMesh = new THREE.Group(); chestMesh.name = 'pack-chests'; chestMesh.visible = false; rig.add(chestMesh);
  const wood = new THREE.MeshLambertMaterial({color: 0x9d6d35}), trim = new THREE.MeshLambertMaterial({color: 0x56371d});
  const lock = new THREE.MeshLambertMaterial({color: 0xbbb8ad});
  for (const side of [-1, 1]) {
    box(chestMesh, 'chest-body', [.3, .4, .5], [side * .46, 1.07, -.36], wood);
    box(chestMesh, 'chest-lid', [.32, .1, .52], [side * .46, 1.32, -.36], wood);
    for (const z of [-.62, -.1]) box(chestMesh, 'chest-trim', [.32, .5, .025], [side * .46, 1.1, z], trim);
    box(chestMesh, 'chest-latch', [.025, .12, .07], [side * .63, 1.25, -.36], lock);
  }
  rig.scale.setScalar(type === 'donkey' ? .8 : .87);
  const mesh = new THREE.Group(); mesh.add(rig);
  rig.traverse(o => {if(o.isMesh) o.castShadow = o.receiveShadow = true;});
  return {...model, mesh, rig, chestMesh};
}

export function syncPackEquineAppearance(mob) {
  if (!isPackEquine(mob)) return;
  const baby = !!mob.isBaby;
  if (!mob.hurtScaleBase) mob.mesh.scale.setScalar(baby ? .5 : 1);
  mob.head.scale.setScalar(baby ? 1.25 : 1);
  mob.saddleMesh.visible = !baby && !!mob.isSaddled;
  mob.bridleMesh.visible = !baby && !!mob.isSaddled;
  mob.chestMesh.visible = !baby && !!mob.hasChest;
}
