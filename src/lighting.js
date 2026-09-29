import * as THREE from 'three';

export const MAX_BLOCK_LIGHTS = 8;

export function configureSunShadows(light, scene) {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 200 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = -0.00015;
  light.shadow.normalBias = 0.035;
  scene.add(light.target);
}

export function followSun(light, direction, position) {
  // Quantize in the light's own axes to avoid shimmering shadow texels.
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  if (right.lengthSq() < 0.1) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const texel = 64 / 2048;
  const center = position.clone();
  center.addScaledVector(right, Math.round(position.dot(right) / texel) * texel - position.dot(right));
  center.addScaledVector(up, Math.round(position.dot(up) / texel) * texel - position.dot(up));
  light.target.position.copy(center);
  light.position.copy(center).addScaledVector(direction, 90);
}

export class BlockLighting {
  constructor(scene, count = MAX_BLOCK_LIGHTS) {
    this.chunks = new Map();
    this.lights = Array.from({ length: count }, () => {
      const light = new THREE.PointLight(0xffbb66, 0, 15, 1);
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = 0.08;
      light.shadow.bias = -0.001;
      light.shadow.normalBias = 0.025;
      scene.add(light);
      return light;
    });
    this.elapsed = 0;
    this.dirty = true;
  }

  setChunk(cx, cz, sources) {
    const key = `${cx},${cz}`;
    if (sources.length) this.chunks.set(key, sources);
    else this.chunks.delete(key);
    this.dirty = true;
  }

  update(dt, eye) {
    this.elapsed += dt;
    if (!this.dirty && this.elapsed < 0.2) return;
    this.elapsed = 0;
    this.dirty = false;
    const candidates = [];
    for (const sources of this.chunks.values()) for (const source of sources) {
      const distance = eye.distanceToSquared(source.position);
      if (distance < 40 * 40) candidates.push({ source, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i], source = candidates[i]?.source;
      light.intensity = source ? 3.8 * source.level / 15 : 0;
      if (!source) continue;
      light.position.copy(source.position);
      light.color.set(source.color);
      light.distance = source.level;
      light.shadow.camera.far = source.level;
      light.shadow.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    for (const light of this.lights) { light.removeFromParent(); light.dispose(); }
    this.chunks.clear();
  }
}
