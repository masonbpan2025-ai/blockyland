import * as THREE from 'three';

// One background draw call: atmospheric gradient, celestial discs, and two
// procedural cloud layers. No remote textures or per-frame geometry allocations.
export class Sky {
  constructor(scene) {
    this.sunDirection = new THREE.Vector3();
    this.horizonColor = new THREE.Color();
    this.dayHorizon = new THREE.Color('#b4d4e8');
    this.nightHorizon = new THREE.Color('#18233e');
    this.sunsetHorizon = new THREE.Color('#f3b080');
    this.uniforms = {
      uSun: { value: this.sunDirection },
      uHorizon: { value: this.horizonColor },
      uDay: { value: 1 },
      uEnhanced: { value: 1 },
      uTwilight: { value: 0 },
      uRain: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uEye: { value: new THREE.Vector3() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vDirection;
        uniform vec3 uSun, uHorizon, uEye;
        uniform float uDay, uTwilight, uRain, uFlash, uTime, uEnhanced;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float sum = 0.0, amplitude = 0.5;
          for (int i = 0; i < 5; i++) {
            sum += noise(p) * amplitude;
            p = mat2(1.6, -1.2, 1.2, 1.6) * p + 17.3;
            amplitude *= 0.5;
          }
          return sum;
        }
        float cloudField(vec2 p) {
          float billows = fbm(p);
          return billows + 0.16 * noise(p * 5.0 + billows * 2.0);
        }

        void main() {
          vec3 ray = normalize(vDirection);
          float elevation = max(ray.y, 0.0);
          float facingSun = max(dot(ray, uSun), 0.0);
          vec3 zenith = mix(vec3(0.002, 0.005, 0.018), vec3(0.055, 0.24, 0.52), uDay);
          vec3 sky = mix(uHorizon, zenith, pow(elevation, 0.48));
          if(uEnhanced < 0.5){
            sky=mix(uHorizon,vec3(.19,.43,.70)*uDay,pow(elevation,.6));
            float sunDisc=1.0-smoothstep(.040,.044,length(ray-uSun));
            float moonDisc=1.0-smoothstep(.017,.021,length(ray+uSun));
            sky=mix(sky,vec3(1.0,.85,.35),sunDisc*(1.0-uRain));sky=mix(sky,vec3(.72,.78,.9),moonDisc*(1.0-uDay));
            gl_FragColor=vec4(sky,1.0);
            #include <colorspace_fragment>
            return;
          }
          float horizonGlow = exp(-elevation * 7.0) * pow(facingSun, 5.0) * uTwilight;
          sky += vec3(0.85, 0.30, 0.07) * horizonGlow;
          sky = mix(sky, vec3(0.055, 0.065, 0.085) * (0.2 + uDay * 0.8), uRain * 0.82);

          // Tiny, stable stars fade out into the dawn and horizon haze.
          vec2 starUV = vec2(atan(ray.z, ray.x), asin(clamp(ray.y, -1.0, 1.0))) * 360.0;
          vec2 starCell = floor(starUV);
          vec2 starOffset = vec2(hash(starCell + 1.7), hash(starCell + 5.8));
          float star = (1.0 - smoothstep(0.025, 0.15, length(fract(starUV) - starOffset)));
          star *= step(0.987, hash(starCell)) * (1.0 - uDay) * (1.0 - uRain);
          sky += vec3(0.58, 0.69, 0.88) * star * smoothstep(0.01, 0.25, elevation);

          // Sun: a bright, antialiased circular photosphere and soft atmospheric halo.
          float sunDistance = length(ray - uSun);
          float sunRadius = 0.042;
          float sunEdge = max(fwidth(sunDistance), 0.00015);
          float sunDisc = 1.0 - smoothstep(sunRadius - sunEdge, sunRadius + sunEdge, sunDistance);
          float sunAboveHorizon = smoothstep(-0.025, 0.015, uSun.y);
          vec3 sunColor = mix(vec3(1.0, 0.56, 0.16), vec3(1.0, 0.88, 0.48), smoothstep(0.0, 0.25, uSun.y));
          float halo = exp(-sunDistance * 18.0) * 0.85 + exp(-sunDistance * 4.5) * (0.07 + uTwilight * 0.16);
          sky += sunColor * halo * sunAboveHorizon * (1.0 - uRain * 0.94);
          sky = mix(sky, vec3(1.0, 0.96, 0.72), sunDisc * sunAboveHorizon * (1.0 - uRain * 0.94));

          // Moon: spherical shading, dark maria, and individually shaped crater rims.
          vec3 moonDirection = -uSun;
          vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDirection));
          vec3 moonUp = cross(moonDirection, moonRight);
          vec2 moonUV = vec2(dot(ray, moonRight), dot(ray, moonUp)) / 0.023;
          float moonR = length(moonUV);
          if (dot(ray, moonDirection) > 0.99 && moonR < 1.04) {
            float edge = max(fwidth(moonR), 0.005);
            float disc = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, moonR);
            vec3 normal = vec3(moonUV, sqrt(max(0.0, 1.0 - dot(moonUV, moonUV))));
            float maria = smoothstep(0.35, 0.65, fbm(moonUV * 3.2 + 8.5));
            float rock = 0.64 + maria * 0.28 + noise(moonUV * 65.0) * 0.07;
            for (int i = 0; i < 18; i++) {
              float fi = float(i);
              vec2 center = vec2(hash(vec2(fi, 21.0)), hash(vec2(fi, 63.0))) * 1.8 - 0.9;
              float radius = mix(0.025, 0.16, hash(vec2(fi, 15.0)));
              float d = length(moonUV - center) / radius;
              rock -= (1.0 - smoothstep(0.5, 0.95, d)) * 0.13;
              rock += exp(-pow((d - 1.0) * 9.0, 2.0)) * 0.14;
            }
            float illumination = max(dot(normal, normalize(vec3(-0.4, 0.25, 0.88))), 0.025);
            vec3 moon = vec3(0.76, 0.83, 0.92) * rock * (0.12 + illumination * 0.88);
            sky = mix(sky, moon, disc * smoothstep(-0.025, 0.025, moonDirection.y) * (1.0 - uRain * 0.94));
          }
          float moonGlow = exp(-length(ray - moonDirection) * 30.0) * 0.035;
          sky += vec3(0.43, 0.57, 0.85) * moonGlow * (1.0 - uDay) * (1.0 - uRain);

          // World-anchored layers drift in the wind. Density and directional
          // sampling give the cumulus bright edges and darker, heavier bases.
          if (ray.y > 0.005) {
            vec2 wind = vec2(uTime * 0.0028, uTime * 0.0011);
            vec2 p = (uEye.xz + ray.xz * max(35.0, 170.0 - uEye.y) / max(ray.y, 0.035)) * 0.006 + wind;
            float density = cloudField(p);
            float cover = smoothstep(0.53 - uRain * 0.19, 0.72 - uRain * 0.12, density);
            float towardLight = cloudField(p + uSun.xz * 0.22);
            float silver = clamp((density - towardLight) * 5.0 + 0.45, 0.0, 1.0);
            vec3 cloudShade = mix(vec3(0.025, 0.034, 0.062), vec3(0.40, 0.49, 0.60), uDay);
            vec3 cloudLight = mix(vec3(0.095, 0.12, 0.19), vec3(0.96, 0.96, 0.92), uDay);
            // Broad peach/gold cloud tops and violet undersides, strongest toward the sun.
            float sunsetTint = uTwilight * (0.35 + 0.65 * pow(facingSun, 1.5)) * (1.0 - uRain);
            cloudShade = mix(cloudShade, vec3(0.25, 0.14, 0.27), sunsetTint * 0.8);
            cloudLight = mix(cloudLight, vec3(1.0, 0.53, 0.19), sunsetTint * 0.95);
            vec3 cloud = mix(cloudShade, cloudLight, silver);
            cloud += sunColor * pow(facingSun, 16.0) * silver * (0.25 + uTwilight * 0.65) * uDay * (1.0 - uRain);
            cloud *= 1.0 - uRain * 0.57;
            float haze = smoothstep(0.015, 0.19, ray.y);
            sky = mix(sky, cloud, cover * haze * 0.96);

            // A higher, thinner layer adds wisps without repeating the lower shapes.
            vec2 highP = (uEye.xz + ray.xz * max(55.0, 260.0 - uEye.y) / max(ray.y, 0.035)) * 0.004;
            float cirrus = smoothstep(0.61, 0.82, fbm(highP * vec2(0.55, 1.8) + wind * 0.65 + 41.0));
            sky = mix(sky, cloudLight * (1.0 - uRain * 0.4), cirrus * haze * 0.28);
          }
          sky = mix(sky, vec3(0.85, 0.91, 1.0), uFlash * 0.85);
          gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  setTime(worldTime) {
    // 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight.
    const angle = worldTime / 24000 * Math.PI * 2;
    this.sunDirection.set(Math.cos(angle), Math.sin(angle), Math.sin(angle) * 0.35).normalize();
    const day = THREE.MathUtils.smoothstep(this.sunDirection.y, -0.14, 0.2);
    const twilight = (1 - THREE.MathUtils.smoothstep(Math.abs(this.sunDirection.y), 0.0, 0.32)) * day;
    this.uniforms.uDay.value = day;
    this.uniforms.uTwilight.value = twilight;
    this.horizonColor.copy(this.nightHorizon).lerp(this.dayHorizon, day).lerp(this.sunsetHorizon, twilight * 0.7);
  }

  update(dt, camera, weather, underwater) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uEye.value.copy(camera.position);
    this.uniforms.uRain.value = weather.rainIntensity;
    this.uniforms.uFlash.value = weather.isFlashing && weather.weatherType === 'thunder' ? 1 : 0;
    this.mesh.position.copy(camera.position);
    if (this.disabled) {
      this.mesh.visible = false;
    } else {
      this.mesh.visible = !underwater;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
