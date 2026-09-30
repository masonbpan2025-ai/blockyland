import * as THREE from 'three';

export class WeatherManager {
  constructor(scene, sounds) {
    this.scene = scene;
    this.sounds = sounds;
    this.weatherType = 'clear'; // 'clear' | 'rain' | 'thunder'

    this.rainCount = 1800;
    this.rainRadius = 28;
    this.rainHeight = 32;

    this.rainGeometry = null;
    this.rainMaterial = null;
    this.rainMesh = null;
    this.rainPositions = null;
    this.rainVelocities = null;

    // Thunder & Lightning
    this.lightningTimer = 0;
    this.isFlashing = false;
    this.flashDuration = 0;

    // Transition smoothing
    this.rainIntensity = 0.0;
    this.windTime = 0;
    this.enhanced = false; // 0.0 to 1.0

    this.initParticles();
  }

  initParticles() {
    this.rainGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 6); // 2 vertices per line (start and end)
    this.rainVelocities = new Float32Array(this.rainCount);

    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * this.rainRadius * 2;
      const y = Math.random() * this.rainHeight;
      const z = (Math.random() - 0.5) * this.rainRadius * 2;
      const len = 0.7 + Math.random() * 0.5;

      const idx = i * 6;
      positions[idx + 0] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;

      positions[idx + 3] = x - 0.08; // slight wind slant
      positions[idx + 4] = y - len;
      positions[idx + 5] = z - 0.04;

      this.rainVelocities[i] = 32 + Math.random() * 12; // falling speed
    }

    this.rainPositions = positions;
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0x9dc6ff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });

    this.rainMesh = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
  }

  setWeather(type) {
    const valid = ['clear', 'rain', 'thunder'];
    if (!valid.includes(type)) return false;

    this.weatherType = type;
    if (type === 'rain' || type === 'thunder') {
      this.rainMesh.visible = true;
      this.sounds.startRainSound();
      if (type === 'thunder') {
        this.lightningTimer = 4.0 + Math.random() * 8.0;
      }
    } else {
      this.sounds.stopRainSound();
    }
    return true;
  }

  isRaining() {
    return this.weatherType === 'rain' || this.weatherType === 'thunder';
  }

  update(dt, playerPos, ambientLight, sunLight, fog, background) {
    this.windTime += dt;
    const targetIntensity = this.isRaining() ? 1.0 : 0.0;
    this.rainIntensity += (targetIntensity - this.rainIntensity) * Math.min(1.0, dt * 2.0);

    if (this.rainIntensity < 0.01 && !this.isRaining()) {
      this.rainMesh.visible = false;
      return;
    }

    this.rainMesh.visible = true;
    this.rainMaterial.opacity = (this.enhanced ? .38 : .55) * this.rainIntensity;
    this.rainMaterial.color.setHex(this.enhanced ? 0xc5dfff : 0x9dc6ff);

    // Follow player position
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;

    this.rainMesh.position.set(px, py, pz);

    // Animate falling rain lines
    const pos = this.rainPositions;
    const halfH = this.rainHeight / 2;
    const halfR = this.rainRadius;

    for (let i = 0; i < this.rainCount; i++) {
      const idx = i * 6;
      const speed = this.rainVelocities[i];
      const dy = speed * dt;

      if(this.enhanced){const gust=2.0+Math.sin(this.windTime*.6)*1.2;pos[idx]+=gust*dt;pos[idx+3]=pos[idx]-.16-gust*.045;pos[idx+2]+=.5*dt;pos[idx+5]=pos[idx+2]-.09;}
      pos[idx + 1] -= dy;
      pos[idx + 4] -= dy;

      // Wrap back to top when reaching bottom of box
      if (pos[idx + 1] < -halfH) {
        const newX = (Math.random() - 0.5) * halfR * 2;
        const newY = halfH + Math.random() * 4.0;
        const newZ = (Math.random() - 0.5) * halfR * 2;
        const len = 0.7 + Math.random() * 0.5;

        pos[idx + 0] = newX;
        pos[idx + 1] = newY;
        pos[idx + 2] = newZ;

        pos[idx + 3] = newX - 0.08;
        pos[idx + 4] = newY - len;
        pos[idx + 5] = newZ - 0.04;
      }
    }

    this.rainGeometry.attributes.position.needsUpdate = true;

    // Overcast fog and light tint
    if (this.rainIntensity > 0.01) {
      const rainSkyColor = new THREE.Color(0x353d4c);
      const normalSkyColor = background.clone();
      const currentSky = normalSkyColor.lerp(rainSkyColor, this.rainIntensity * 0.75);

      background.copy(currentSky);
      if (fog) {
        fog.color.copy(currentSky);
        fog.near = 45 - 20 * this.rainIntensity;
        fog.far = 95 - 35 * this.rainIntensity;
      }

      if (ambientLight) {
        ambientLight.intensity = Math.max(0.18, ambientLight.intensity * (1.0 - 0.45 * this.rainIntensity));
      }
      if (sunLight) {
        sunLight.intensity = Math.max(0.1, sunLight.intensity * (1.0 - 0.65 * this.rainIntensity));
      }
    }

    // Thunder & Lightning simulation
    if (this.weatherType === 'thunder') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.triggerLightning(ambientLight, sunLight);
        this.lightningTimer = 8.0 + Math.random() * 15.0;
      }

      if (this.isFlashing) {
        this.flashDuration -= dt;
        if (this.flashDuration > 0) {
          if (ambientLight) ambientLight.intensity = 2.2;
          if (sunLight) sunLight.intensity = 2.5;
          if (background) background.setRGB(0.9, 0.95, 1.0);
        } else {
          this.isFlashing = false;
        }
      }
    }
  }

  triggerLightning(ambientLight, sunLight) {
    this.isFlashing = true;
    this.flashDuration = 0.12 + Math.random() * 0.08;
    this.sounds.playThunder();
  }
}
