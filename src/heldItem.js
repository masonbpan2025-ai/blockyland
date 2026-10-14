import * as THREE from 'three';
import { createBlockGeometry } from './blockGeometry.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { resourcePackManager } from './resourcePackManager.js';
import { skinManager } from './skinManager.js';

export class HeldItemRenderer {
  constructor(camera, textureManager) {
    this.camera = camera;
    this.tm = textureManager;

    this.scene = new THREE.Scene();
    const aspect = typeof window !== 'undefined' && window.innerHeight ? window.innerWidth / window.innerHeight : 1;
    this.overlayCamera = new THREE.PerspectiveCamera(55, aspect, 0.05, 10);

    // Subtle lighting for held item
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    // Held item container
    this.container = new THREE.Group();
    this.scene.add(this.container);

    // Initial base transform (lower right hand)
    this.basePos = new THREE.Vector3(0.55, -0.45, -0.85);
    this.baseRot = new THREE.Euler(0.2, -0.4, 0.1);

    this.currentItem = null;
    this.currentMesh = null;

    // Swing animation state
    this.swingProgress = 0;
    this.isSwinging = false;
    this.swingSpeed = 5.5;

    this.bobTime = 0;

    this.textureLoader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
    this.cachedMaterials = new Map();
    this.unsubscribePack = resourcePackManager.onChange(() => {
      this.cachedMaterials.clear();
      if (this.currentItem) this.setItem(this.currentItem, true);
    });
  }

  loadTexture(url) {
    if (typeof document === 'undefined') {
      const tex = new THREE.Texture();
      tex.name = url;
      return tex;
    }
    const tex = this.textureLoader.load(url);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  swing() {
    this.isSwinging = true;
    this.swingProgress = 0;
  }

  recoil() {
    this.container.position.z += 0.08;
    setTimeout(() => {
      this.container.position.z -= 0.08;
    }, 100);
  }

  setItem(item) {
    if (this.isItemEqual(this.currentItem, item)) return;

    this.currentItem = item;
    if (this.currentMesh) {
      this.container.remove(this.currentMesh);
      if (this.currentMesh.userData?.disposeGeo) {
        this.currentMesh.geometry?.dispose();
      }
      this.currentMesh = null;
    }

    if (!item) {
      // Empty Hand (Rendered using equipped player skin)
      const isSlim = skinManager.getEquippedSkin()?.model === 'slim';
      const armWidth = isSlim ? 0.18 : 0.22;
      const geo = new THREE.BoxGeometry(armWidth, 0.65, 0.22);
      const mat = skinManager.getArmMaterial();
      this.currentMesh = new THREE.Mesh(geo, mat);
      this.currentMesh.userData = { disposeGeo: true };
      this.currentMesh.rotation.set(-0.35, 0.2, -0.15);
      this.container.add(this.currentMesh);
      return;
    }

    const numericId = typeof item.id === 'string' ? (BLOCKS[item.id.toUpperCase()] ?? (item.id === 'chest' ? BLOCKS.CHEST : item.id)) : item.id;
    const blockDef = BLOCK_DEFS[numericId] || (typeof item.id === 'number' ? BLOCK_DEFS[item.id] : null);
    const itemDef = ITEMS[item.id];
    // `blockDef` is null, not undefined, for an item that is not a block -- comparing it with undefined made every
    // held item (food, tools, potions) a missing-texture cube. Found by the visual parity audit's V-HELD case.
    const isBlock = Boolean(item.isBlock || blockDef || itemDef?.isBlock || item.id === 'chest');

    if (isBlock && (numericId === BLOCKS.WATER || item.id === BLOCKS.WATER)) {
      let material = this.cachedMaterials.get('held-water');
      if (!material) {
        material = new THREE.MeshPhongMaterial({ color: 0x359ddc, transparent: true, opacity: .72, shininess: 100, specular: 0xc5eeff, emissive: 0x10335a, emissiveIntensity: .3 });
        this.cachedMaterials.set('held-water', material);
      }
      this.currentMesh = new THREE.Mesh(new THREE.BoxGeometry(.43, .38, .43), material);
      this.currentMesh.userData = { disposeGeo: true };
      this.currentMesh.rotation.set(.3, .7, 0);
      this.container.add(this.currentMesh);
      return;
    }

    const isPlant = Boolean(
      blockDef?.plant ||
      blockDef?.crop ||
      blockDef?.waterPlant ||
      (typeof item.id === 'string' && /flower|tulip|orchid|daisy|dandelion|poppy|allium|bluet|lily|rose|peony|lilac|sunflower|sapling|mushroom|fungus/.test(item.id))
    );

    if (isPlant) {
      // Java Edition: held flowers/plants are 2D item sprites with transparent alpha (no solid cube)
      const texName = blockDef?.textures?.all || blockDef?.textures?.side || blockDef?.textures?.top || (typeof item.id === 'string' ? `${item.id}.png` : 'dandelion.png');
      const customUrl = resourcePackManager.resolveBlockTexture(texName);
      const iconUrl = customUrl || (itemDef?.icon || `/assets/blocks/${texName}`);

      let mat = this.cachedMaterials.get(iconUrl);
      if (!mat) {
        const tex = this.loadTexture(iconUrl);
        mat = new THREE.MeshLambertMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.DoubleSide
        });
        this.cachedMaterials.set(iconUrl, mat);
      }

      const geo = new THREE.PlaneGeometry(0.5, 0.5);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { isPlant: true, isSprite: true, iconUrl, disposeGeo: true };
      mesh.rotation.set(0.1, -0.2, 0.3);
      this.currentMesh = mesh;
      this.container.add(mesh);
      return;
    }

    if (isBlock) {
      // Miniature 3D Block
      const blockId = numericId !== undefined && BLOCK_DEFS[numericId] ? numericId : item.id;
      const geo = createBlockGeometry(blockId, this.tm);
      geo.translate(-0.5, -0.5, -0.5);
      geo.scale(0.5, 0.5, 0.5);
      const def = BLOCK_DEFS[blockId];
      const mat = def?.light ? this.tm.lightMaterial : (def?.transparent ? this.tm.transparentMaterial : this.tm.opaqueMaterial);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { isBlock: true, blockId, disposeGeo: true };
      mesh.rotation.set(0.3, 0.7, 0);
      this.currentMesh = mesh;
      this.container.add(mesh);
    } else {
      // 2D/3D Item Sprite / Tool
      const it = ITEMS[item.id];
      const customUrl = resourcePackManager.resolveItemTexture(item.id);
      const iconUrl = customUrl || (it ? it.icon : '/assets/items/stick.png');

      let mat = this.cachedMaterials.get(iconUrl);
      if (!mat) {
        const tex = this.loadTexture(iconUrl);
        mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
        this.cachedMaterials.set(iconUrl, mat);
      }

      const geo = new THREE.PlaneGeometry(0.5, 0.5);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { isItem: true, itemId: item.id, disposeGeo: true };
      mesh.rotation.set(0.1, -0.2, 0.3);
      this.currentMesh = mesh;
      this.container.add(mesh);
    }
  }

  isItemEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id && a.isBlock === b.isBlock;
  }

  update(dt, playerSpeed) {
    // 1. Walking bobbing
    if (playerSpeed > 0.1) {
      this.bobTime += dt * playerSpeed * 1.5;
    }
    const bobX = Math.cos(this.bobTime) * 0.025;
    const bobY = Math.abs(Math.sin(this.bobTime)) * 0.035;

    // 2. Swing animation curve
    let swingRotX = 0;
    let swingRotY = 0;
    let swingRotZ = 0;

    if (this.isSwinging) {
      this.swingProgress += dt * this.swingSpeed;
      if (this.swingProgress >= 1.0) {
        this.swingProgress = 0;
        this.isSwinging = false;
      }
      const s = Math.sin(this.swingProgress * Math.PI);
      swingRotX = -s * 0.85;
      swingRotY = -s * 0.45;
      swingRotZ = s * 0.35;
    }

    // Apply combined transforms
    this.container.position.set(
      this.basePos.x + bobX,
      this.basePos.y + bobY,
      this.basePos.z
    );

    this.container.rotation.set(
      this.baseRot.x + swingRotX,
      this.baseRot.y + swingRotY,
      this.baseRot.z + swingRotZ
    );
  }

  render(renderer) {
    // Only render held item in 1st person
    renderer.clearDepth();
    renderer.render(this.scene, this.overlayCamera);
  }

  resize(width, height) {
    this.overlayCamera.aspect = width / height;
    this.overlayCamera.updateProjectionMatrix();
  }
}
