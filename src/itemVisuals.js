import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { createBlockGeometry } from './blockGeometry.js';

export function getBlockDrop(id) {
  const def = BLOCK_DEFS[id];
  if (id === BLOCKS.AIR || !def || def.drop === null || def.liquid) return null;
  return { id: def.dropItem ?? def.drop ?? id, isBlock: !def.dropItem };
}

export class ItemVisuals {
  constructor(textures = null) {
    this.textures = textures;
    this.materials = new Map();
  }

  create(id, isBlock, size = 0.34) {
    const def = isBlock ? BLOCK_DEFS[id] : null;
    if (def && !def.plant && this.textures) {
      const geometry = createBlockGeometry(id, this.textures);
      geometry.translate(-0.5, -0.5, -0.5);
      geometry.scale(size, size, size);
      // Torch drops need enough size to read as a stick rather than a speck.
      if (def.shape === 'torch') { geometry.scale(1.8, 1.8, 1.8); geometry.translate(0, size * 0.34, 0); }
      let material = this.materials.get('blocks');
      if (!material) {
        material = this.textures.lightMaterial.clone();
        material.vertexColors = true;
        material.alphaTest = 0.2;
        // Drops remain readable in caves without being unlit flat sprites.
        material.emissive.setHex(0xffffff);
        material.emissiveMap = material.map;
        material.emissiveIntensity = 0.16;
        this.materials.set('blocks', material);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }
    const icon = def ? `/assets/blocks/${def.textures.all || def.textures.side || def.textures.top}` : ITEMS[id]?.icon;
    let material = this.materials.get(icon || id);
    if (!material) {
      const texture = new THREE.TextureLoader().load(icon || '/assets/items/stick.png');
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      material = new THREE.MeshLambertMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.2, alphaTest: 0.35, side: THREE.DoubleSide });
      this.materials.set(icon || id, material);
    }
    // Two crossed silhouettes remain visible throughout a full rotation.
    const group = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.25, size * 1.25), material);
      mesh.rotation.y = i * Math.PI / 2;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  release(object) {
    object.removeFromParent();
    // Materials/textures are shared across drops; picking one up must not
    // dispose the atlas or the icon still used by another item.
    object.traverse(child => child.geometry?.dispose());
  }

  dispose() {
    for (const [key, material] of this.materials) {
      if (key !== 'blocks') material.map?.dispose();
      material.dispose();
    }
    this.materials.clear();
  }
}
