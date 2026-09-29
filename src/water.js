import * as THREE from 'three';

// Biome variation inspired by Minecraft's water palette, softened for this world's lighting.
export const WATER_COLORS = Object.fromEntries(Object.entries({
  plains: '#3f76b8', desert: '#319b9b', forest: '#357fac', mountains: '#386ab0',
}).map(([biome, color]) => [biome, new THREE.Color(color)]));

export function createWaterMaterial() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
    uTime: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff5db') },
    uSunIntensity: { value: 0.85 },
    uSkyColor: { value: new THREE.Color('#86b7d7') },
    uHorizonColor: { value: new THREE.Color('#b4d4e8') },
    uIsUnderwater: { value: 0 },
  }]);
  return new THREE.ShaderMaterial({
    uniforms, lights: true, vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, fog: true,
    vertexShader: `
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
    `,
    fragmentShader: `
      varying vec2 vFlow;
      uniform float uTime, uSunIntensity, uIsUnderwater;
      uniform vec3 uSunDirection, uSunColor, uSkyColor, uHorizonColor;
      varying vec3 vWorldPos, vWorldNormal, vTint;
      varying float vDepth;
      #include <common>
      #include <fog_pars_fragment>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float ripple(vec2 p) {
        vec2 drift = vec2(uTime * 0.035, uTime * 0.018);
        return noise(p * 0.7 + drift) * 0.55
             + noise(p * 1.8 - drift * 1.3) * 0.3
             + noise(p * 4.2 + drift * 0.8) * 0.15;
      }
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 normal = normalize(vWorldNormal);
        bool surface = abs(normal.y) > 0.5;
        vec2 p = surface ? vWorldPos.xz : vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y - uTime * 0.16);
        if (surface) p -= vFlow * uTime * 0.65;
        float h = ripple(p);
        vec2 slope = vec2(ripple(p + vec2(0.08,0)) - h, ripple(p + vec2(0,0.08)) - h) / 0.08;
        // Reduce distant detail before it aliases into shimmering stripes.
        float detail = 1.0 / (1.0 + length(fwidth(p)) * 3.0);
        if (surface) normal = normalize(normal + vec3(-slope.x, 0, -slope.y) * 0.12 * detail);
        else normal = normalize(normal + vec3(0, slope.y * 0.055 * detail, 0));
        if (!gl_FrontFacing) normal = -normal;

        float ndv = max(dot(normal, viewDir), 0.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        float depth = max(vDepth, 0.15);
        float absorption = 1.0 - exp(-depth * 0.22);
        float daylight = clamp(dot(uSkyColor, vec3(0.2126,0.7152,0.0722)) * 1.8, 0.0, 1.0);
        float sunShadow = 1.0;
        #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
          DirectionalLightShadow ds = directionalLightShadows[0];
          sunShadow = getShadow(directionalShadowMap[0], ds.shadowMapSize, ds.shadowIntensity, ds.shadowBias, ds.shadowRadius, vDirectionalShadowCoord[0]);
        #endif
        float lighting = 0.12 + daylight * 0.6 + min(uSunIntensity, 1.0) * 0.28 * sunShadow;
        vec3 shallow = vTint * vec3(0.85, 1.12, 1.03);
        vec3 deep = vTint * vec3(0.28, 0.46, 0.65);
        vec3 water = mix(shallow, deep, absorption) * lighting;
        water *= 0.96 + h * 0.08; // restrained animated texture, no painted white crests

        vec3 reflected = reflect(-viewDir, normal);
        vec3 reflection = mix(uHorizonColor, uSkyColor * 0.7, clamp(reflected.y, 0.0, 1.0));
        vec3 result = mix(water, reflection, fresnel * 0.68);
        vec3 halfDirection = normalize(normalize(uSunDirection) + viewDir);
        float specular = pow(max(dot(normal, halfDirection),0.0), 180.0);
        result += uSunColor * specular * uSunIntensity * 0.5 * detail * sunShadow;
        // Colored lamps and their occlusion also affect the water surface.
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
          result += incident.color * visibility * (vTint * diffuse * 0.3 + glint * 0.2);
        }
        #pragma unroll_loop_end

        // Transparent shallows reveal the actual sand/stone below; deep water absorbs more light.
        float alpha = mix(0.27, 0.82, absorption);
        alpha = mix(alpha, 0.88, fresnel * 0.75);
        if (!surface) alpha *= 0.8;
        if (uIsUnderwater > 0.5) {
          result = mix(vTint * 0.18, reflection, fresnel * 0.65);
          alpha = 0.12 + fresnel * 0.24;
        }
        gl_FragColor = vec4(result, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
