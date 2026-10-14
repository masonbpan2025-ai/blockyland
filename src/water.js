import * as THREE from 'three';
import { TERRAIN_SHADOW_CHUNK } from './terrainShadowSampling.js';

// Biome variation inspired by Minecraft's water palette, softened for this world's lighting.
export const WATER_COLORS = Object.fromEntries(Object.entries({
  plains: '#3f76b8', desert: '#319b9b', forest: '#357fac', mountains: '#386ab0',
}).map(([biome, color]) => [biome, new THREE.Color(color)]));

/**
 * How strongly a block of water absorbs each colour channel, per block travelled.
 *
 * Real water takes red first, then green, and lets blue through, which is why the shallows read turquoise and
 * the depths read navy. These are per-block coefficients: three blocks of water keep e^(-0.36*3) = 34% of red
 * but 80% of blue.
 */
export const WATER_ABSORPTION = new THREE.Vector3(0.36, 0.105, 0.072);

/** The index of refraction of water. Sets both the bend and the angle beyond which the surface mirrors. */
export const WATER_IOR = 1.333;

/** Beyond this angle from straight up, a ray from below cannot leave the water: asin(1 / 1.333) = 48.6 degrees. */
export const CRITICAL_ANGLE_DEGREES = (Math.asin(1 / WATER_IOR) * 180) / Math.PI;

export const waterVertexShader = `
      attribute float waterDepth;
      attribute vec2 waterFlow;
      varying vec2 vFlow;
      varying vec3 vWorldPos, vWorldNormal, vTint;
      varying float vDepth;
      #include <common>
      #include <fog_pars_vertex>
      #include <shadowmap_pars_vertex>
      void main() {
        vTint = color;
        vFlow = waterFlow;
        vDepth = waterDepth;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        // Keep boundary vertices fixed: moving only top faces leaves cracks at banks and glass.
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        vec3 transformedNormal = normalMatrix * normal;
        #include <shadowmap_vertex>
      }
    `;

export const waterFragmentShader = `
      varying vec2 vFlow;
      uniform float uTime, uSunIntensity, uIsUnderwater, uEnhanced, uRefraction, uRefractionSRGB;
      uniform vec3 uSunDirection, uSunColor, uSkyColor, uHorizonColor, uAbsorption;
      uniform sampler2D tRefraction;
      uniform vec2 uResolution;
      varying vec3 vWorldPos, vWorldNormal, vTint;
      varying float vDepth;
      #include <common>
      #include <fog_pars_fragment>
      #include <packing>
      #include <lights_pars_begin>
      ${TERRAIN_SHADOW_CHUNK}

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }

      // One directional wave and its slope, added into h = (height, dh/dx, dh/dz). Analytic slopes replace the
      // nine value-noise lookups the surface used to spend on finite differences.
      void wave(vec2 p, vec2 dir, float k, float amp, float speed, inout vec3 h) {
        float phase = dot(dir, p) * k + uTime * speed;
        h.x += amp * sin(phase);
        float slope = amp * k * cos(phase);
        h.y += slope * dir.x;
        h.z += slope * dir.y;
      }
      // Four crossing swells over a slowly warped plane. The warp is two value-noise lookups and is what keeps the
      // swells from lining up into regular stripes towards the horizon; the fine swells fade out with distance
      // before they alias into shimmer.
      vec3 waves(vec2 p, float detail, float count) {
        vec2 warp = vec2(noise(p * 0.21 + vec2(uTime * 0.03, 0.0)), noise(p * 0.21 + vec2(5.2, uTime * 0.025))) * 2.6 - 1.3;
        vec2 q = p + warp;
        vec3 h = vec3(0.0);
        wave(q, vec2(0.832, 0.555), 1.07, 0.055, 1.30, h);
        wave(q, vec2(-0.514, 0.858), 1.73, 0.040, 1.62, h);
        if (count > 2.5) {
          wave(q, vec2(0.966, -0.259), 3.13, 0.019 * detail, 2.35, h);
          wave(q, vec2(-0.682, -0.731), 4.91, 0.011 * detail, 2.95, h);
        }
        return h;
      }

      // Caustics: the bright net sunlight draws on the bottom after the waves focus it. Three warped sine sheets,
      // sharpened -- no texture and no loop longer than three steps.
      float caustics(vec2 p) {
        p *= 0.85;
        float t = uTime * 0.55;
        float c = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          vec2 q = p + vec2(sin(t + p.y * 1.4 + fi * 2.1), cos(t * 0.9 + p.x * 1.2 - fi * 1.7)) * 0.55;
          float sheet = abs(sin(q.x * 2.2 + fi) * sin(q.y * 2.2 - fi));
          c += 1.0 / (1.0 + 26.0 * sheet);
          p = p * 1.37 + vec2(1.7, -0.9);
        }
        // Thin bright lines, not patches: the cube keeps the net and drops the broad glow between its strands.
        float net = smoothstep(0.2, 0.8, c / 3.0);
        return net * net * net;
      }

      vec3 decodeRefraction(vec3 c) {
        // A copy of the canvas holds encoded sRGB; a copy of a render target holds linear light already.
        return uRefractionSRGB > 0.5 ? pow(max(c, vec3(0.0)), vec3(2.2)) : c;
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 baseNormal = normalize(vWorldNormal);
        bool surface = abs(baseNormal.y) > 0.5;
        bool underwater = uIsUnderwater > 0.5;
        float viewDist = length(cameraPosition - vWorldPos);

        // Surface coordinates: the top drifts with the current; a side face scrolls downward like a falling sheet.
        vec2 p = surface ? vWorldPos.xz : vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y - uTime * 0.16);
        if (surface) p -= vFlow * uTime * 0.65;
        float detail = 1.0 / (1.0 + length(fwidth(p)) * 2.5);
        // Far water is calmer to the eye: the slope falls off with distance, which is what keeps the horizon from
        // breaking into bands of alternating sky and deep colour.
        float calm = 1.0 / (1.0 + viewDist * 0.03);
        vec3 h = waves(p, detail, uEnhanced > 0.5 ? 4.0 : 2.0);
        h.yz *= calm;
        vec3 normal = baseNormal;
        if (surface) normal = normalize(vec3(-h.y * detail, sign(baseNormal.y), -h.z * detail));
        else normal = normalize(baseNormal + vec3(0.0, h.z * 0.4 * detail, 0.0));
        if (!gl_FrontFacing) normal = -normal;

        float ndv = clamp(abs(dot(normal, viewDir)), 0.0, 1.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        float daylight = clamp(dot(uSkyColor, vec3(0.2126,0.7152,0.0722)) * 1.8, 0.0, 1.0);
        float sunShadow = 1.0;
        #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
          DirectionalLightShadow ds = directionalLightShadows[0];
          sunShadow = getShadow(directionalShadowMap[0], ds.shadowMapSize, ds.shadowIntensity, ds.shadowBias, ds.shadowRadius, vDirectionalShadowCoord[0]);
        #endif
        float lighting = 0.12 + daylight * 0.6 + min(uSunIntensity, 1.0) * 0.28 * sunShadow;
        float sunHeight = uSunDirection.y;
        float solarVisibility = smoothstep(-0.025, 0.015, sunHeight)
          * clamp(uSunIntensity / max(smoothstep(-0.025, 0.5, sunHeight), 0.02), 0.0, 1.0);

        // How much water the eye looks through to reach what is behind it. On top, the column depth stretched by
        // the slant of the view; on a side, roughly one block.
        float slant = max(abs(viewDir.y), 0.22);
        float thickness = surface ? max(vDepth, 0.15) / slant : 1.0;
        vec3 transmit = exp(-uAbsorption * thickness);
        vec3 scatter = vTint * vec3(0.42, 0.78, 1.0) * lighting;

        // What is behind the surface, bent by its slope. The bend shrinks with distance so far water does not swim,
        // and with shallowness so a puddle barely moves what is under it.
        vec2 screenUv = gl_FragCoord.xy / uResolution;
        float bendStrength = (underwater ? 0.06 : 0.032) * clamp(thickness * 0.45, 0.2, 1.0) / (1.0 + viewDist * 0.035);
        vec2 bend = normal.xz * bendStrength;
        vec3 behind = decodeRefraction(texture2D(tRefraction, clamp(screenUv + bend, vec2(0.001), vec2(0.999))).rgb);

        // The sky the surface mirrors, with a hint of cloud.
        vec3 reflected = reflect(-viewDir, normal);
        vec3 reflection = mix(uHorizonColor, uSkyColor * 0.7, clamp(reflected.y, 0.0, 1.0));
        if (uEnhanced > 0.5) {
          float reflectedCloud = noise(reflected.xz / max(abs(reflected.y), 0.18) * 3.0 + vec2(uTime * 0.008));
          reflection = mix(reflection, uHorizonColor * 1.12, smoothstep(0.56, 0.8, reflectedCloud) * 0.25 * daylight);
        }

        vec3 result;
        float alpha = 1.0;
        if (uRefraction > 0.5) {
          vec3 seen = behind * transmit;
          // Caustics on the bottom: where the refracted ray lands, lit by the sun, fading with depth.
          if (uEnhanced > 0.5 && surface && gl_FrontFacing && !underwater) {
            vec3 refr = refract(-viewDir, normal, 1.0 / ${WATER_IOR.toFixed(3)});
            vec2 floorXZ = vWorldPos.xz + refr.xz * (max(vDepth, 0.15) / max(-refr.y, 0.3));
            float lit = solarVisibility * sunShadow * daylight * exp(-vDepth * 0.16);
            // Bounded brightening of what is already there, so bright sand under shallow water cannot clip to white.
            seen *= 1.0 + caustics(floorXZ) * 0.75 * lit / (1.0 + viewDist * 0.02);
          }
          vec3 body = seen + scatter * (1.0 - transmit);
          if (underwater) {
            // Looking up through the surface from below. Inside the critical angle the world above shows through;
            // beyond it the surface is a mirror of the water itself -- Snell's window.
            float cosI = ndv;
            float sinT2 = ${(WATER_IOR * WATER_IOR).toFixed(4)} * (1.0 - cosI * cosI);
            float mirror = smoothstep(0.86, 1.0, sinT2);
            // Beyond the critical angle the surface mirrors the lit water below it, which the eye reads as the
            // water's own haze -- so the fog colour, with the ripples drawn on it as faint bright lines.
            #ifdef USE_FOG
              vec3 haze = fogColor;
            #else
              vec3 haze = vTint * 0.25 * lighting;
            #endif
            float ripple = smoothstep(0.55, 1.0, abs(h.y + h.z) * 6.0);
            vec3 deep = haze * (1.05 + ripple * 0.35);
            vec3 window = behind * vec3(0.82, 0.95, 1.0) + uSunColor * pow(max(dot(-viewDir, uSunDirection), 0.0), 48.0) * solarVisibility * 0.6;
            result = surface ? mix(window, deep, mirror) : mix(body, deep, 0.35);
          } else {
            result = mix(body, reflection, fresnel * 0.9);
          }
        } else {
          // No refraction copy yet (the first frame, or a renderer that cannot copy): the old translucent surface.
          float absorption = 1.0 - exp(-max(vDepth, 0.15) * 0.22);
          vec3 shallow = vTint * vec3(0.85, 1.12, 1.03);
          vec3 deep = vTint * vec3(0.28, 0.46, 0.65);
          result = mix(mix(shallow, deep, absorption) * lighting, reflection, fresnel * 0.78);
          alpha = mix(mix(0.27, 0.82, absorption), 0.88, fresnel * 0.75);
          if (!surface) alpha *= 0.8;
          if (underwater) { result = mix(vTint * 0.18, reflection, fresnel * 0.65); alpha = 0.12 + fresnel * 0.24; }
        }

        // Sunlight on the surface. A sharp highlight and a glitter path broken up by the ripples; both are small,
        // so the sun reads as sparkle rather than as a white patch over whatever is beneath.
        if (uEnhanced > 0.5 && surface && gl_FrontFacing && !underwater) {
          vec3 sunDir = normalize(uSunDirection);
          vec3 halfDirection = normalize(sunDir + viewDir);
          float specular = pow(max(dot(normal, halfDirection), 0.0), 380.0);
          float twilight = 1.0 - smoothstep(0.0, 0.32, abs(sunHeight));
          // The glitter path: sparkle where the reflected ray passes close to the sun, measured as the angle between
          // the two -- well defined at any sun height, including overhead, where an azimuth is not.
          float offSun = 1.0 - max(dot(reflected, sunDir), 0.0);
          float glitterPath = exp(-offSun / (0.006 + twilight * 0.03));
          // Pin-point twinkles rather than soft patches: fine noise, sharply thresholded, faded out at a distance
          // where it would alias.
          float flecks = smoothstep(0.80, 0.93, noise(p * 11.0 + vec2(uTime * 1.7, -uTime * 1.3)) * 0.65 + noise(p * 23.0 - uTime * 2.1) * 0.35) * detail;
          vec3 goldenSun = mix(uSunColor, vec3(1.0, 0.52, 0.13), twilight * 0.85);
          // Capped: the composite's bloom spreads anything far above 1 into a soft white patch, which is exactly the
          // blob this replaces. Sparkle stays sparkle.
          float sparkle = min(specular * 0.8 + glitterPath * flecks * (0.6 + twilight * 0.9), 0.85);
          result += goldenSun * solarVisibility * sunShadow * sparkle * detail;

          // Coloured lamps glint on the water too.
          vec3 viewPosition = (viewMatrix * vec4(vWorldPos, 1.0)).xyz;
          vec3 viewNormal = normalize(mat3(viewMatrix) * normal);
          IncidentLight incident;
          float visibility, diffuse, glint;
          #if defined(USE_SHADOWMAP) && NUM_POINT_LIGHT_SHADOWS > 0
            PointLightShadow ps;
          #endif
          #pragma unroll_loop_start
          for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
            getPointLightInfo(pointLights[i], viewPosition, incident);
            visibility = 1.0;
            #if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS
              ps = pointLightShadows[i];
              visibility = getPointShadow(pointShadowMap[i], ps.shadowMapSize, ps.shadowIntensity, ps.shadowBias, ps.shadowRadius, vPointShadowCoord[i], ps.shadowCameraNear, ps.shadowCameraFar);
            #endif
            diffuse = max(dot(viewNormal, incident.direction), 0.0);
            glint = pow(max(dot(viewNormal, normalize(incident.direction + normalize(-viewPosition))), 0.0), 90.0);
            result += incident.color * visibility * (vTint * diffuse * 0.12 + glint * 0.2);
          }
          #pragma unroll_loop_end
        }

        gl_FragColor = vec4(result, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `;

export function createWaterMaterial() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
    uTime: { value: 0 },
    uEnhanced: { value: 1 },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff5db') },
    uSunIntensity: { value: 0.85 },
    uSkyColor: { value: new THREE.Color('#86b7d7') },
    uHorizonColor: { value: new THREE.Color('#b4d4e8') },
    uIsUnderwater: { value: 0 },
    uAbsorption: { value: WATER_ABSORPTION.clone() },
    // The refraction copy is filled by `WaterPass` every frame; until it is, the surface falls back to the old
    // translucent look, so a renderer that never fills it still shows water.
    tRefraction: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uRefraction: { value: 0 },
    uRefractionSRGB: { value: 0 },
  }]);
  return new THREE.ShaderMaterial({
    uniforms, lights: true, vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, fog: true,
    defines: { HAS_NORMAL: '' },
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
  });
}
