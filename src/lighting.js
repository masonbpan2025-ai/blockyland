import * as THREE from 'three';

export const MAX_BLOCK_LIGHTS = 8;

// Skylight gives upward snow faces a cool fill and sides softer reflected light.
// The old low, uniform ambient made unlit white faces grey.
export function createEnvironmentLight() {
  return new THREE.HemisphereLight(0xddeeff, 0x9eafc5, 1.75);
}

export function updateOutdoorLighting(ambient, sun, moon, sky, enhanced = false, rain = 0) {
  const day = sky.uniforms.uDay.value;
  const sunHeight = sky.sunDirection.y;
  ambient.color.setHex(0xddeeff);
  ambient.groundColor?.setHex(0x9eafc5);
  ambient.intensity = 0.10 + day * (enhanced ? 1.55 : 1.65);
  sun.intensity = (enhanced ? 2.35 : 2.15) * THREE.MathUtils.smoothstep(sunHeight, -0.025, 0.5);
  sun.color.setRGB(1, 0.65 + 0.32 * day, 0.28 + 0.64 * day);
  moon.intensity = 0.17 * Math.max(0, -sunHeight) * (1 - rain * 0.8);
}

export function configureSunShadows(light, scene) {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 200 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = 0.00005;
  light.shadow.normalBias = 0.035;
  scene.add(light.target);
}

export function followSun(light, direction, position) {
  // Quantize in the light's own axes to avoid shimmering shadow texels.
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  if (right.lengthSq() < 0.1) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const texel = 64 / light.shadow.mapSize.x;
  const center = position.clone();
  center.addScaledVector(right, Math.round(position.dot(right) / texel) * texel - position.dot(right));
  center.addScaledVector(up, Math.round(position.dot(up) / texel) * texel - position.dot(up));
  light.target.position.copy(center);
  light.position.copy(center).addScaledVector(direction, 90);
}

/**
 * How many light slots to keep in the scene for `sources` lamps: rounded up to a multiple of four, at most `max`.
 * @param {number} sources
 * @param {number} max
 */
export function activeLightSlots(sources, max = MAX_BLOCK_LIGHTS) {
  if (sources <= 0) return 0;
  return Math.min(max, Math.ceil(sources / 4) * 4);
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
    // Only as many lights are in the scene as there are lamps to show, in steps of four. Three.js loops over
    // every point light in the scene for every lit pixel, whether its intensity is zero or not, so eight idle
    // lights in a lamp-less valley were eight wasted light evaluations per pixel. The steps keep the number of
    // shader variants to three (no lights, four, eight), so moving between lamps does not recompile shaders.
    const active = activeLightSlots(Math.min(candidates.length, this.lights.length), this.lights.length);
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i], source = candidates[i]?.source;
      light.visible = i < active;
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
