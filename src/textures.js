import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export class TextureManager {
  constructor() {
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = 256;
    this.atlasCanvas.height = 256;
    this.ctx = this.atlasCanvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.tileSize = 16;
    this.atlasGridSize = 16; // 16x16 tiles of 16x16 = 256x256
    this.tileCoords = {}; // imageName -> { col, row, u0, v0, u1, v1 }
    this.nextCol = 0;
    this.nextRow = 0;

    this.atlasTexture = null;
    this.opaqueMaterial = null;
    this.transparentMaterial = null;

    this.destroyTextures = [];
    this.destroyMaterials = [];
  }

  async init() {
    // 1. Collect all unique texture filenames needed by blocks
    const textureNames = new Set();
    for (const id in BLOCK_DEFS) {
      const def = BLOCK_DEFS[id];
      if (!def.textures) continue;
      for (const face in def.textures) {
        textureNames.add(def.textures[face]);
      }
    }

    // 2. Load all textures and paint into atlas
    const loadPromises = Array.from(textureNames).map(name => this.loadAndPlaceTile(name));
    await Promise.all(loadPromises);

    // 3. Create Three.js canvas texture
    this.atlasTexture = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.generateMipmaps = false;

    // 4. Create Materials with vertexColors enabled for ambient occlusion and biome grass tint
    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      side: THREE.DoubleSide
    });

    this.transparentMaterial = new THREE.MeshLambertMaterial({
      map: this.atlasTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.2,
      side: THREE.DoubleSide
    });

    // Get water tile coordinates for the shader
    const wt = this.tileCoords['water_still.png'] || { u0: 0, v0: 0, u1: 1, v1: 1 };

    // 4b. Specialized Animated Minecraft Water Shader Material
    this.waterUniforms = {
      uTime: { value: 0.0 },
      uAtlas: { value: this.atlasTexture },
      uWaterTile: { value: new THREE.Vector4(wt.u0, wt.v0, wt.u1, wt.v1) },
      uSunDirection: { value: new THREE.Vector3(50, 80, 40).normalize() },
      uSunColor: { value: new THREE.Color(0xfffaed) },
      uSunIntensity: { value: 0.85 },
      uSkyColor: { value: new THREE.Color(0x78a7ff) },
      uHorizonColor: { value: new THREE.Color(0xc2d8ff) },
      uDeepWaterColor: { value: new THREE.Color(0x1d4ebd) },    // Minecraft deep blue
      uSurfaceWaterColor: { value: new THREE.Color(0x3f76e4) }, // Iconic Minecraft Java water tint (0x3f76e4)
      uCrestWaterColor: { value: new THREE.Color(0x9bd4ff) },   // Shimmering wave foam crests
      uIsUnderwater: { value: 0.0 }                             // 1.0 when camera is submerged
    };

    const waterVertexShader = `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec3 vColor;

      #include <common>
      #include <fog_pars_vertex>

      void main() {
        #ifdef USE_COLOR
          vColor = color;
        #else
          vColor = vec3(1.0);
        #endif
        vUv = uv;

        // True world space normal
        vWorldNormal = normalize(mat3(modelMatrix) * normal);

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);

        // Physical gentle wave undulation on open water surface (top face: normal.y > 0.6)
        if (normal.y > 0.6) {
          float wave1 = sin(worldPosition.x * 2.2 + uTime * 2.5) * cos(worldPosition.z * 2.2 + uTime * 2.0);
          float wave2 = sin((worldPosition.x + worldPosition.z) * 3.4 + uTime * 3.2);
          worldPosition.y += (wave1 * 0.035 + wave2 * 0.015);
        }

        vWorldPos = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
      }
    `;

    const waterFragmentShader = `
      uniform float uTime;
      uniform sampler2D uAtlas;
      uniform vec4 uWaterTile;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform float uSunIntensity;
      uniform vec3 uSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uDeepWaterColor;
      uniform vec3 uSurfaceWaterColor;
      uniform vec3 uCrestWaterColor;
      uniform float uIsUnderwater;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec3 vColor;

      #include <common>
      #include <fog_pars_fragment>

      void main() {
        // When underwater, the CSS overlay + scene fog handle the tint.
        // Make water surface faces very transparent so you see through clearly
        // and the fog provides the distance-based blueness.
        if (uIsUnderwater > 0.5) {
          // Subtle water tint when looking at surfaces from below
          vec3 underwaterTint = uSurfaceWaterColor * 0.5;
          gl_FragColor = vec4(underwaterTint, 0.10);
          #include <fog_fragment>
          return;
        }

        // === ABOVE WATER SURFACE RENDERING ===
        vec3 viewDir = normalize(cameraPosition - vWorldPos);

        // 1. Dual-layer scrolling wave coordinates for authentic Minecraft ripple motion
        vec2 wCoord = vWorldPos.xz;
        vec2 waveUv1 = wCoord * 0.65 + vec2(uTime * 0.08, uTime * 0.05);
        vec2 waveUv2 = wCoord * 1.25 + vec2(-uTime * 0.06, uTime * 0.09);
        vec2 waveUv3 = wCoord * 2.80 + vec2(uTime * 0.14, -uTime * 0.11);

        // Wave slopes for dynamic ripple normals in world XZ plane
        float dX = cos(waveUv1.x * 3.1415 + waveUv1.y) * 0.16
                 - sin(waveUv2.x * 2.5) * 0.10
                 + cos(waveUv3.x * 4.0) * 0.06;
        float dZ = sin(waveUv1.y * 3.1415 + waveUv1.x) * 0.16
                 + cos(waveUv2.y * 2.5) * 0.10
                 - sin(waveUv3.y * 4.0) * 0.06;

        vec3 normalPerturb = vWorldNormal;
        if (abs(vWorldNormal.y) > 0.5) {
          normalPerturb = normalize(vWorldNormal + vec3(dX, 0.0, dZ));
        } else {
          // Vertical flow ripples on sides (e.g. aquarium glass border, pond banks)
          float flow = sin(vWorldPos.y * 5.0 - uTime * 3.2) * 0.12;
          normalPerturb = normalize(vWorldNormal + vec3(0.0, flow, 0.0));
        }

        // 2. Animated water texture sampling
        vec2 tileSpan = uWaterTile.zw - uWaterTile.xy;
        vec2 localUv = fract((vUv - uWaterTile.xy) / tileSpan + vec2(uTime * 0.04, uTime * 0.03));
        vec2 finalAtlasUv = uWaterTile.xy + localUv * tileSpan;
        vec4 tex = texture2D(uAtlas, finalAtlasUv);

        // 3. Minecraft Blue Color Palette
        // Sample texture luminance to blend dark and light water streaks
        float texLum = (tex.r + tex.g + tex.b) / 3.0;
        vec3 waterBase = mix(uDeepWaterColor, uSurfaceWaterColor, clamp(texLum * 1.3, 0.20, 0.95));

        // Scale by vertex light intensity
        float lightIntensity = max(vColor.r, max(vColor.g, vColor.b));
        waterBase *= clamp(lightIntensity, 0.55, 1.0);

        // Wave crest highlight shimmer (foam/glisten on wave crests)
        float crest = clamp((sin(waveUv1.x * 3.1415 + waveUv2.y * 2.2) * 0.5 + 0.5 - 0.62) * 3.2, 0.0, 1.0);
        waterBase = mix(waterBase, uCrestWaterColor, crest * 0.65);

        // 4. Fresnel Reflection (grazing angles reflect sky and appear more reflective)
        float NdotV = max(dot(normalPerturb, viewDir), 0.0);
        float fresnel = clamp(pow(1.0 - NdotV, 2.5), 0.0, 1.0);

        // Sky reflection
        vec3 reflectDir = reflect(-viewDir, normalPerturb);
        float skyFactor = clamp(reflectDir.y * 0.7 + 0.3, 0.0, 1.0);
        vec3 skyReflection = mix(uHorizonColor, uSkyColor, skyFactor);

        // 5. Sun Specular Glint (sun glinting sharply on moving waves)
        vec3 lightDir = normalize(uSunDirection);
        vec3 halfVec = normalize(lightDir + viewDir);
        float specAngle = max(dot(normalPerturb, halfVec), 0.0);
        float specular = pow(specAngle, 48.0) * uSunIntensity;
        float broadSheen = pow(specAngle, 12.0) * 0.35 * uSunIntensity;

        // Blend base azure water + sky reflection + sun glints
        vec3 finalColor = mix(waterBase, skyReflection, fresnel * 0.45);
        finalColor += uSunColor * (specular * 1.8 + broadSheen);

        // Rich liquid azure opacity: clearly visible vibrant water fluid, transparent enough to see submerged fish & corals
        float alpha = clamp(mix(0.72, 0.90, fresnel), 0.0, 1.0);

        gl_FragColor = vec4(finalColor, alpha);

        #include <fog_fragment>
      }
    `;

    const mergedUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      this.waterUniforms
    ]);
    // Update waterUniforms reference to the merged object so runtime updates reach the shader
    this.waterUniforms = mergedUniforms;

    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: mergedUniforms,
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: true
    });

    // 5. Load block break destroy stages (0-9)
    await this.loadDestroyStages();
  }

  update(dt, sunLight, skyColor, fog) {
    if (this.waterUniforms) {
      this.waterUniforms.uTime.value += dt;

      if (sunLight) {
        this.waterUniforms.uSunDirection.value.copy(sunLight.position).normalize();
        this.waterUniforms.uSunColor.value.copy(sunLight.color);
        this.waterUniforms.uSunIntensity.value = sunLight.intensity;
      }
      if (skyColor) {
        this.waterUniforms.uSkyColor.value.copy(skyColor);
        // Slightly brighter horizon
        this.waterUniforms.uHorizonColor.value.setRGB(
          Math.min(1.0, skyColor.r * 1.25 + 0.1),
          Math.min(1.0, skyColor.g * 1.25 + 0.1),
          Math.min(1.0, skyColor.b * 1.25 + 0.1)
        );
      }
    }
  }

  async loadAndPlaceTile(fileName) {
    const col = this.nextCol;
    const row = this.nextRow;
    this.nextCol++;
    if (this.nextCol >= this.atlasGridSize) {
      this.nextCol = 0;
      this.nextRow++;
    }

    const x = col * this.tileSize;
    const y = row * this.tileSize;

    // UV coordinates in WebGL texture (v is flipped: 1.0 - y/height)
    const u0 = col / this.atlasGridSize;
    const u1 = (col + 1) / this.atlasGridSize;
    const v1 = 1.0 - (row / this.atlasGridSize);
    const v0 = 1.0 - ((row + 1) / this.atlasGridSize);

    this.tileCoords[fileName] = { col, row, u0, v0, u1, v1 };

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // If image is a vertical animation strip (e.g. water_still 16x512, lava_still 16x320),
        // take only the first square frame (0, 0, img.width, img.width) to avoid squashing 32 frames!
        const srcHeight = Math.min(img.width, img.height);
        this.ctx.drawImage(img, 0, 0, img.width, srcHeight, x, y, this.tileSize, this.tileSize);
        resolve();
      };
      img.onerror = () => {
        // Fallback procedural pixel art if load fails
        this.drawFallbackTile(fileName, x, y);
        resolve();
      };
      img.src = `/assets/blocks/${fileName}`;
    });
  }

  drawFallbackTile(name, x, y) {
    this.ctx.fillStyle = '#888';
    if (name.includes('grass')) this.ctx.fillStyle = '#5b8e3a';
    else if (name.includes('dirt')) this.ctx.fillStyle = '#866043';
    else if (name.includes('sand')) this.ctx.fillStyle = '#dbcf9a';
    else if (name.includes('wood') || name.includes('log')) this.ctx.fillStyle = '#6b5335';
    else if (name.includes('leaves')) this.ctx.fillStyle = '#2c591e';
    else if (name.includes('water')) this.ctx.fillStyle = '#3f76e4';
    this.ctx.fillRect(x, y, this.tileSize, this.tileSize);
  }

  async loadDestroyStages() {
    const loader = new THREE.TextureLoader();
    for (let i = 0; i <= 9; i++) {
      try {
        const tex = await new Promise(res => {
          loader.load(`/assets/blocks/destroy_stage_${i}.png`, res, undefined, () => res(null));
        });
        if (tex) {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          this.destroyTextures[i] = tex;
          this.destroyMaterials[i] = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
          });
        }
      } catch (e) {
        console.warn(`Destroy stage ${i} could not be loaded`);
      }
    }
  }

  getFaceUVs(blockId, face) {
    const def = BLOCK_DEFS[blockId];
    if (!def || !def.textures) {
      return { u0: 0, v0: 0, u1: 1 / 16, v1: 1 / 16 };
    }

    let texName = def.textures.all;
    if (def.textures[face]) {
      texName = def.textures[face];
    } else if (def.textures.side && (face === 'north' || face === 'south' || face === 'east' || face === 'west')) {
      texName = def.textures.side;
    } else if (def.textures.top && face === 'top') {
      texName = def.textures.top;
    } else if (def.textures.bottom && face === 'bottom') {
      texName = def.textures.bottom;
    }

    const coords = this.tileCoords[texName];
    if (!coords) {
      return { u0: 0, v0: 0, u1: 1 / 16, v1: 1 / 16 };
    }
    return coords;
  }
}
