import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { waterHeight } from './waterGeometry.js';
import { markOverWater } from './waterPass.js';

// Detect feet entering a free water surface, including a fast fall crossing a whole voxel.
export function waterEntry(world, previous, position) {
  if (!previous || previous.distanceToSquared(position) > 64) return null; // load/teleport
  const x = Math.floor(position.x), z = Math.floor(position.z);
  for (let y = Math.floor(Math.max(previous.y, position.y)); y >= Math.floor(position.y); y--) {
    if (world.getVoxel(x, y, z) !== BLOCKS.WATER || world.getVoxel(x, y + 1, z) === BLOCKS.WATER) continue;
    const surface = y + waterHeight(world, x, y, z);
    const px = Math.floor(previous.x), pz = Math.floor(previous.z), py = Math.floor(previous.y);
    const wasWet = world.getVoxel(px, py, pz) === BLOCKS.WATER && previous.y < py + waterHeight(world, px, py, pz);
    if (!wasWet && position.y < surface && previous.y >= y) return { x: position.x, y: surface, z: position.z };
  }
  return null;
}

// Fixed pools: a single instanced droplet draw plus at most four expanding ripple rings.
export class WaterSplashes {
  constructor(scene, world) {
    this.world = world;
    this.previous = null;
    this.cooldown = 0;
    this.cursor = 0;
    this.ringCursor = 0;
    this.dummy = new THREE.Object3D();
    this.drops = Array.from({ length: 128 }, () => ({ life: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3() }));
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xa9dfff, transparent: true, opacity: .8, depthWrite: false }), 128);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Droplets and rings sit on and above the surface, so they are drawn over it rather than under it.
    markOverWater(this.mesh);
    scene.add(this.mesh);
    this.ringGeometry = new THREE.RingGeometry(.91, 1, 48);
    this.rings = Array.from({ length: 4 }, () => {
      const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: 0xc4eaff, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      markOverWater(mesh);
      scene.add(mesh);
      return { mesh, life: 0, strength: 1 };
    });
  }
  splash(position, speed = 5) {
    const strength = THREE.MathUtils.clamp(speed / 7, .45, 1.6);
    const count = Math.round(18 + strength * 16);
    for (let i = 0; i < count; i++) {
      const drop = this.drops[this.cursor++ % this.drops.length];
      const angle = Math.random() * Math.PI * 2, spread = (.6 + Math.random() * 1.4) * strength;
      drop.position.set(position.x, position.y + .06, position.z);
      drop.velocity.set(Math.cos(angle) * spread, (1.8 + Math.random() * 2.4) * strength, Math.sin(angle) * spread);
      drop.life = drop.duration = .5 + Math.random() * .35;
      drop.size = .035 + Math.random() * .045;
    }
    const ring = this.rings[this.ringCursor++ % this.rings.length];
    ring.mesh.position.set(position.x, position.y + .025, position.z);
    ring.life = 1; ring.strength = strength;
  }
  update(dt, position) {
    dt = Math.min(dt, .1);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const entry = waterEntry(this.world, this.previous, position);
    if (entry && !this.cooldown) {
      this.splash(entry, Math.max(2, (this.previous.y - position.y) / Math.max(dt, .001)));
      this.cooldown = .25;
    }
    if (!this.previous) this.previous = new THREE.Vector3();
    this.previous.copy(position);
    let count = 0;
    for (const drop of this.drops) {
      drop.life -= dt;
      if (drop.life <= 0) continue;
      drop.velocity.y -= 10 * dt;
      drop.position.addScaledVector(drop.velocity, dt);
      this.dummy.position.copy(drop.position);
      this.dummy.scale.setScalar(drop.size * Math.min(1, drop.life * 5));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count++, this.dummy.matrix);
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count) this.mesh.instanceMatrix.needsUpdate = true;
    for (const ring of this.rings) {
      ring.life = Math.max(0, ring.life - dt);
      ring.mesh.visible = ring.life > 0;
      ring.mesh.scale.setScalar(.15 + (1 - ring.life) * 1.5 * ring.strength);
      ring.mesh.material.opacity = ring.life * .45;
    }
  }
  dispose() {
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.ringGeometry.dispose();
    for (const ring of this.rings) { ring.mesh.removeFromParent(); ring.mesh.material.dispose(); }
  }
}
