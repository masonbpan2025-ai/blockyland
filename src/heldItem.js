import * as THREE from 'three';
import { createBlockGeometry } from './blockGeometry.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';

export class HeldItemRenderer {
  constructor(camera, textureManager) {
    this.camera = camera;
    this.tm = textureManager;

    this.scene = new THREE.Scene();
    this.overlayCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 10);

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

    this.textureLoader = new THREE.TextureLoader();
    this.cachedMaterials = new Map();
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
      this.currentMesh = null;
    }

    if (!item) {
      // Empty Hand (Steve Arm)
      const geo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
      const mat = new THREE.MeshLambertMaterial({ color: 0xdbb494 });
      this.currentMesh = new THREE.Mesh(geo, mat);
      this.currentMesh.rotation.set(-0.35, 0.2, -0.15);
      this.container.add(this.currentMesh);
      return;
    }

    if (item.isBlock) {
      // Miniature 3D Block
      const geo = createBlockGeometry(item.id, this.tm);
      geo.translate(-0.5, -0.5, -0.5);
      geo.scale(0.5, 0.5, 0.5);
      const mesh = new THREE.Mesh(geo, BLOCK_DEFS[item.id]?.light ? this.tm.lightMaterial : this.tm.opaqueMaterial);
      mesh.rotation.set(0.3, 0.7, 0);
      this.currentMesh = mesh;
      this.container.add(mesh);
    } else {
      // 2D/3D Item Sprite / Tool
      const it = ITEMS[item.id];
      const iconUrl = it ? it.icon : '/assets/items/stick.png';

      let mat = this.cachedMaterials.get(iconUrl);
      if (!mat) {
        const tex = this.textureLoader.load(iconUrl);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
        this.cachedMaterials.set(iconUrl, mat);
      }

      const geo = new THREE.PlaneGeometry(0.5, 0.5);
      const mesh = new THREE.Mesh(geo, mat);
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
