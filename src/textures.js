import * as THREE from 'three';
import { enableBlockEmission } from './blockGeometry.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { createWaterMaterial } from './water.js';

export class TextureManager {
  constructor() {
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = 512;
    this.atlasCanvas.height = 512;
    this.ctx = this.atlasCanvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.tileSize = 16;
    this.atlasGridSize = 32; // 32x32 tiles of 16x16 = 512x512 = 1024 tiles capacity
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

    enableBlockEmission(this.opaqueMaterial);
    enableBlockEmission(this.transparentMaterial);
    this.lightMaterial = this.opaqueMaterial.clone();
    this.lightMaterial.alphaTest = 0.2;
    enableBlockEmission(this.lightMaterial);
    // Luminous blocks cast sunlight and other lamps' shadows, but not their own.
    this.lightDistanceMaterial = new THREE.MeshDistanceMaterial({ map: this.atlasTexture, alphaTest: 0.2 });
    this.lightDistanceMaterial.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute vec3 lightOrigin; varying vec3 vLightOrigin;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('void main() {', 'void main() {\nvLightOrigin = lightOrigin;');
      shader.fragmentShader = 'varying vec3 vLightOrigin;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'void main() {\nif (distance(vLightOrigin, referencePosition) < 0.01) discard;');
    };

    this.waterMaterial = createWaterMaterial();
    this.waterUniforms = this.waterMaterial.uniforms;

    // 5. Load block break destroy stages (0-9)
    await this.loadDestroyStages();
  }

  update(dt, sunLight, skyColor, fog) {
    for(const material of [this.opaqueMaterial,this.transparentMaterial,this.lightMaterial])if(material?.userData.animationTime)material.userData.animationTime.value+=dt;
    this.lavaClock=(this.lavaClock||0)+dt;
    if(this.lavaImage && this.lavaClock>.12){
      this.lavaClock=0;const image=this.lavaImage,frames=Math.floor(image.height/image.width);
      this.lavaFrame=((this.lavaFrame||0)+1)%frames;
      const tile=this.tileCoords['lava_still.png'];
      this.ctx.drawImage(image,0,this.lavaFrame*image.width,image.width,image.width,tile.col*this.tileSize,tile.row*this.tileSize,this.tileSize,this.tileSize);this.atlasTexture.needsUpdate=true;
    }
    if (this.waterUniforms) {
      this.waterUniforms.uTime.value += dt;

      if (sunLight) {
        this.waterUniforms.uSunDirection.value.copy(sunLight.position).sub(sunLight.target.position).normalize();
        this.waterUniforms.uSunColor.value.copy(sunLight.color);
        this.waterUniforms.uSunIntensity.value = sunLight.intensity;
      }
      if (skyColor) {
        this.waterUniforms.uSkyColor.value.copy(skyColor);
        this.waterUniforms.uHorizonColor.value.copy(skyColor);
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
        if(fileName==='lava_still.png')this.lavaImage=img;
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
    if (face === 'north' && def.textures.front) face = 'front';
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
