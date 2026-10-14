import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

export const isBoatItem = id => /^(?:(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak)_(?:chest_)?boat|bamboo_(?:chest_)?raft|chest_boat)$/.test(id ?? '');
export const boatHasChest = id => /chest/.test(id);
const WOOD_COLORS = { oak: 0xc69b60, spruce: 0x806044, birch: 0xe4d2a0, jungle: 0xb98964, acacia: 0xbe6c43, dark_oak: 0x503923, mangrove: 0x8d433e, cherry: 0xe7b6b1, pale_oak: 0xdcd8cb, bamboo: 0xbcb867 };

// Built without DOM dependencies so the exact in-game hull can be inspected/tested.
export function createBoatModel(subType = 'oak_boat', textures = null, hasChest = boatHasChest(subType)) {
  const wood = subType.replace(/_(?:chest_)?(?:boat|raft)$/, '');
  const woodId = BLOCKS[`${wood.toUpperCase()}_PLANKS`] ?? BLOCKS.OAK_PLANKS;
  const group = new THREE.Group(); group.name = subType;
  const material = new THREE.MeshLambertMaterial({ map: textures?.atlasTexture ?? null, color: textures?.atlasTexture ? 0xffffff : WOOD_COLORS[wood] ?? WOOD_COLORS.oak });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6b4928 });
  const metal = new THREE.MeshLambertMaterial({ color: 0xd6d4c2 });
  const part = (parent, name, size, pos, mat = material, blockId = woodId) => {
    const geometry = new THREE.BoxGeometry(...size);
    if (mat === material && textures?.getFaceUVs) {
      const uv = geometry.attributes.uv;
      for (let face = 0; face < 6; face++) {
        const tile = textures.getFaceUVs(blockId, ['east','west','top','bottom','north','south'][face]);
        for (let v = 0; v < 4; v++) {
          const i = face*4+v;
          uv.setXY(i, THREE.MathUtils.lerp(tile.u0,tile.u1,uv.getX(i)), THREE.MathUtils.lerp(tile.v0,tile.v1,uv.getY(i)));
        }
      }
    }
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name;
    mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  // Thin floor and four walls leave a genuinely hollow interior, rather than a slab.
  // The inner floor clears the water plane at the normal draft. Otherwise the
  // transparent water surface appears inside a supposedly watertight hull.
  part(group, 'floor', [1.2,0.18,1.65], [0,0.09,0]);
  for (const sign of [-1,1]) {
    const wall = part(group, sign < 0 ? 'port-wall' : 'starboard-wall', [0.125,0.42,1.75], [sign*0.625,0.32,0]);
    wall.rotation.z = -sign*0.12;
    part(group, `rim-${sign}`, [0.16,0.055,1.85], [sign*0.66,0.55,0]);
    part(group, sign < 0 ? 'bow' : 'stern', [1.25,0.38,0.125], [0,0.32,sign*0.85]);
    part(group, `seat-${sign}`, [1.06,0.065,0.2], [0,0.28,sign*0.38]);
  }
  const oar = sign => {
    const pivot = new THREE.Group(); pivot.name = sign < 0 ? 'left-oar' : 'right-oar';
    pivot.position.set(sign*0.67,0.47,0.03); pivot.rotation.z = -sign*0.25;
    part(pivot, 'oar-shaft', [0.8,0.055,0.055], [sign*0.36,0,0]);
    part(pivot, 'oar-blade', [0.34,0.055,0.18], [sign*0.83,0,0]);
    group.add(pivot); return pivot;
  };
  const leftOar = oar(-1), rightOar = oar(1);
  if (hasChest) {
    part(group, 'chest', [0.68,0.5,0.62], [0,0.52,0.35], material, BLOCKS.CHEST);
    part(group, 'chest-lid', [0.72,0.075,0.66], [0,0.79,0.35], material, BLOCKS.CHEST);
    part(group, 'chest-band', [0.735,0.04,0.675], [0,0.66,0.35], dark);
    part(group, 'chest-latch', [0.09,0.14,0.035], [0,0.65,0.005], metal);
  } else { dark.dispose(); metal.dispose(); }
  return { group, leftOar, rightOar };
}
