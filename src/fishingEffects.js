import * as THREE from 'three';

// A small bounded pool: fishing effects do not depend on mob spawning, weather,
// shaders or the full world's particle manager being enabled.
export class FishingEffects {
  constructor(scene) { this.scene = scene; this.particles = []; }
  ripple(position, size = 0.12) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 20), new THREE.MeshBasicMaterial({ color: 0xd4f5ff, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position); mesh.position.y += 0.015;
    mesh.scale.setScalar(size);
    this.add({ mesh, age: 0, life: 0.65, size });
  }
  splash(position) {
    this.ripple(position, 0.25);
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI * 2 / 10;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), new THREE.MeshBasicMaterial({ color: 0x9ee8ff, transparent: true, depthWrite: false }));
      mesh.position.copy(position);
      this.add({ mesh, age: 0, life: 0.5, velocity: new THREE.Vector3(Math.cos(a)*1.1, 1.6+(i%3)*0.3, Math.sin(a)*1.1) });
    }
  }
  add(p) {
    if (this.particles.length >= 48) this.release(this.particles.shift());
    this.scene?.add(p.mesh); this.particles.push(p);
  }
  release(p) { this.scene?.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.age += dt;
      if (p.age >= p.life) { this.release(p); this.particles.splice(i, 1); continue; }
      p.mesh.material.opacity = 0.7 * (1-p.age/p.life);
      if (p.velocity) { p.velocity.y -= 6*dt; p.mesh.position.addScaledVector(p.velocity, dt); }
      else p.mesh.scale.setScalar(p.size + p.age*0.55);
    }
  }
  clear() { for (const p of this.particles) this.release(p); this.particles = []; }
}
