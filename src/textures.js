import * as THREE from 'three';
import { enableBlockEmission } from './blockGeometry.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { parseColouredName, shadedHex } from './colourPalette.js';
import { createWaterMaterial } from './water.js';
import { prepareWaterMaterial } from './waterPass.js';
import { resourcePackManager } from './resourcePackManager.js';
import { configureAtlasTexture, filterAtlasMaterial, updateAtlasFiltering } from './atlasFiltering.js';
import { configureCutoutMaterial } from './vegetationRendering.js';

export class TextureManager {
  constructor() {
    this.atlasCanvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : { width: 512, height: 512, getContext: () => null };
    this.atlasCanvas.width = 512;
    this.atlasCanvas.height = 512;
    this.ctx = this.atlasCanvas && typeof this.atlasCanvas.getContext === 'function'
      ? this.atlasCanvas.getContext('2d')
      : null;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;

    this.tileSize = 16;
    this.atlasGridSize = 32; // 32x32 tiles of 16x16 = 512x512 = 1024 tiles capacity
    this.tileCoords = {}; // imageName -> { col, row, u0, v0, u1, v1 }
    this.missingUV = null; // painted on first miss; see missingTextureUV()
    this.nextCol = 0;
    this.nextRow = 0;

    this.atlasTexture = null;
    this.opaqueMaterial = null;
    this.transparentMaterial = null;

    this.destroyTextures = [];
    this.destroyMaterials = [];
  }

  async init() {
    // 0. Set dynamic tile size based on active resource packs (e.g. 64 for Faithful 64x, 16 for vanilla)
    this.tileSize = resourcePackManager.getActiveTileSize();
    const canvasDim = this.atlasGridSize * this.tileSize;
    if (this.atlasCanvas.width !== canvasDim || this.atlasCanvas.height !== canvasDim) {
      this.atlasCanvas.width = canvasDim;
      this.atlasCanvas.height = canvasDim;
      this.ctx = this.atlasCanvas && typeof this.atlasCanvas.getContext === 'function'
        ? this.atlasCanvas.getContext('2d')
        : null;
      if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    }

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
    this.atlasTexture = configureAtlasTexture(new THREE.CanvasTexture(this.atlasCanvas));

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
      side: THREE.DoubleSide,
      // One pass, not two. Three.js draws a transparent double-sided material twice -- back faces, then front --
      // and flags it for a program rebuild before each half, which cost two program lookups per chunk mesh per
      // frame (about 400 a frame in a normal view). Leaves and plants are cut-outs and glass is a flat pane, so
      // the back-to-front split buys nothing here.
      forceSinglePass: true
    });

    enableBlockEmission(this.opaqueMaterial);
    enableBlockEmission(this.transparentMaterial);
    this.cutoutMaterial = configureCutoutMaterial(this.transparentMaterial.clone());
    enableBlockEmission(this.cutoutMaterial);
    this.transparentMaterials = [this.transparentMaterial, this.cutoutMaterial];
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

    for (const material of [this.opaqueMaterial, this.transparentMaterial, this.cutoutMaterial, this.lightMaterial, this.lightDistanceMaterial]) {
      filterAtlasMaterial(material, this);
    }

    this.waterMaterial = prepareWaterMaterial(createWaterMaterial());
    this.waterUniforms = this.waterMaterial.uniforms;

    // 5. Load block break destroy stages (0-9)
    await this.loadDestroyStages();

    // 6. Hook resource pack reload listener
    resourcePackManager.onChange(() => this.rebuildAtlas());
  }

  update(dt, sunLight, skyColor, fog) {
    for(const material of [this.opaqueMaterial,this.transparentMaterial,this.cutoutMaterial,this.lightMaterial])if(material?.userData.animationTime)material.userData.animationTime.value+=dt;
    this.lavaClock=(this.lavaClock||0)+dt;
    if(this.lavaImage && this.lavaClock>.12){
      this.lavaClock=0;const image=this.lavaImage,frames=Math.floor(image.height/image.width);
      this.lavaFrame=((this.lavaFrame||0)+1)%frames;
      const tile=this.tileCoords['lava_still.png'];
      this.ctx.drawImage(image,0,this.lavaFrame*image.width,image.width,image.width,tile.col*this.tileSize,tile.row*this.tileSize,this.tileSize,this.tileSize);
      // Upload only the lava tile. Marking the whole atlas dirty re-sent every block texture to the GPU about
      // eight times a second, for one 16 x 16 frame of animation.
      if(!this.uploadLavaTile(tile))this.atlasTexture.needsUpdate=true;
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

  setSnowDaylight(value) {
    for (const material of [this.opaqueMaterial, this.transparentMaterial, this.cutoutMaterial, this.lightMaterial]) {
      if (material?.userData.snowDaylight) material.userData.snowDaylight.value = value;
    }
  }

  /**
   * Copy the current lava frame into the atlas on the GPU, without re-uploading the rest of the atlas.
   * Returns false when there is no renderer to do it with, so the caller falls back to a full upload.
   */
  uploadLavaTile(tile){
    const renderer=this.renderer;
    if(!renderer?.copyTextureToTexture||!this.atlasTexture||!renderer.properties?.get(this.atlasTexture)?.__webglTexture)return false;
    try{
      if(!this.lavaTileCanvas || this.lavaTileCanvas.width !== this.tileSize){
        this.lavaTileCanvas=document.createElement('canvas');this.lavaTileCanvas.width=this.lavaTileCanvas.height=this.tileSize;
        this.lavaTileCtx=this.lavaTileCanvas.getContext('2d');
        this.lavaTileTexture=new THREE.CanvasTexture(this.lavaTileCanvas);this.lavaTileTexture.colorSpace=THREE.SRGBColorSpace;
        this.lavaTilePosition=new THREE.Vector2();
      }
      const size=this.tileSize,x=tile.col*size,y=tile.row*size;
      this.lavaTileCtx.clearRect(0,0,size,size);
      this.lavaTileCtx.drawImage(this.atlasCanvas,x,y,size,size,0,0,size,size);
      // The atlas is uploaded flipped, so a tile's top row in the canvas is its bottom row in the texture.
      this.lavaTilePosition.set(x,this.atlasCanvas.height-y-size);
      renderer.copyTextureToTexture(this.lavaTileTexture,this.atlasTexture,null,this.lavaTilePosition);
      return true;
    }catch{return false;}
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
    // Sample texel centres, not neighbouring tile boundaries. Exact atlas edges
    // leaked dark pixels into snowy terrain as dotted seams and diagonal streaks.
    const inset = 0.5 / (this.atlasGridSize * this.tileSize);
    const u0 = col / this.atlasGridSize + inset;
    const u1 = (col + 1) / this.atlasGridSize - inset;
    const v1 = 1.0 - (row / this.atlasGridSize) - inset;
    const v0 = 1.0 - ((row + 1) / this.atlasGridSize) + inset;

    this.tileCoords[fileName] = { col, row, u0, v0, u1, v1 };

    return new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve();
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if(fileName==='lava_still.png')this.lavaImage=img;
        // If image is a vertical animation strip (e.g. water_still 16x512, lava_still 16x320),
        // take only the first square frame (0, 0, img.width, img.width) to avoid squashing 32 frames!
        const srcHeight = Math.min(img.width, img.height);
        if (this.ctx) this.ctx.drawImage(img, 0, 0, img.width, srcHeight, x, y, this.tileSize, this.tileSize);
        resolve();
      };
      img.onerror = () => {
        // Fallback procedural pixel art if load fails
        this.drawFallbackTile(fileName, x, y);
        resolve();
      };
      const customUrl = resourcePackManager.resolveBlockTexture(fileName);
      img.src = customUrl || `/assets/blocks/${fileName}`;
    });
  }

  /**
   * Rebuilds and repaints the entire texture atlas from active resource packs,
   * preserving UV layout while updating visual graphics.
   * Dynamically resizes atlas canvas between 16x (512x512) and 64x (2048x2048) or custom HD.
   * When packs are deactivated/turned off, resizes back to 512x512 to ensure zero performance degradation.
   */
  async rebuildAtlas() {
    const newTileSize = resourcePackManager.getActiveTileSize();
    const sizeChanged = (newTileSize !== this.tileSize);

    if (sizeChanged) {
      this.tileSize = newTileSize;
      const canvasDim = this.atlasGridSize * this.tileSize;
      this.atlasCanvas.width = canvasDim;
      this.atlasCanvas.height = canvasDim;
      this.ctx = this.atlasCanvas && typeof this.atlasCanvas.getContext === 'function'
        ? this.atlasCanvas.getContext('2d')
        : null;
      if (this.ctx) this.ctx.imageSmoothingEnabled = false;

      // Recalculate texel-center inset for each tileCoord
      const inset = 0.5 / (this.atlasGridSize * this.tileSize);
      for (const fileName in this.tileCoords) {
        const t = this.tileCoords[fileName];
        t.u0 = t.col / this.atlasGridSize + inset;
        t.u1 = (t.col + 1) / this.atlasGridSize - inset;
        t.v1 = 1.0 - (t.row / this.atlasGridSize) - inset;
        t.v0 = 1.0 - ((t.row + 1) / this.atlasGridSize) + inset;
      }
      if (this.missingUV) {
        this.missingUV.u0 = this.missingUV.col / this.atlasGridSize + inset;
        this.missingUV.u1 = (this.missingUV.col + 1) / this.atlasGridSize - inset;
        this.missingUV.v1 = 1.0 - (this.missingUV.row / this.atlasGridSize) - inset;
        this.missingUV.v0 = 1.0 - ((this.missingUV.row + 1) / this.atlasGridSize) + inset;
      }
      if (this.lavaTileCanvas) {
        this.lavaTileCanvas.width = this.tileSize;
        this.lavaTileCanvas.height = this.tileSize;
        this.lavaTileTexture = new THREE.CanvasTexture(this.lavaTileCanvas);
        this.lavaTileTexture.colorSpace = THREE.SRGBColorSpace;
      }
    } else if (this.ctx) {
      this.ctx.clearRect(0, 0, this.atlasCanvas.width, this.atlasCanvas.height);
    }

    const promises = [];
    for (const fileName in this.tileCoords) {
      const tile = this.tileCoords[fileName];
      const x = tile.col * this.tileSize;
      const y = tile.row * this.tileSize;
      promises.push(new Promise((resolve) => {
        if (typeof Image === 'undefined') {
          resolve();
          return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (fileName === 'lava_still.png') this.lavaImage = img;
          const srcHeight = Math.min(img.width, img.height);
          if (this.ctx) this.ctx.drawImage(img, 0, 0, img.width, srcHeight, x, y, this.tileSize, this.tileSize);
          resolve();
        };
        img.onerror = () => {
          this.drawFallbackTile(fileName, x, y);
          resolve();
        };
        const customUrl = resourcePackManager.resolveBlockTexture(fileName);
        img.src = customUrl || `/assets/blocks/${fileName}`;
      }));
    }
    await Promise.all(promises);

    updateAtlasFiltering(this);
    if (this.atlasTexture) {
      if (sizeChanged) {
        this.atlasTexture.dispose();
        this.atlasTexture = configureAtlasTexture(new THREE.CanvasTexture(this.atlasCanvas));

        if (this.opaqueMaterial) {
          this.opaqueMaterial.map = this.atlasTexture;
          this.opaqueMaterial.needsUpdate = true;
        }
        if (this.transparentMaterial) {
          this.transparentMaterial.map = this.atlasTexture;
          this.transparentMaterial.needsUpdate = true;
        }
        if (this.cutoutMaterial) {
          this.cutoutMaterial.map = this.atlasTexture;
          this.cutoutMaterial.needsUpdate = true;
        }
        if (this.lightMaterial) {
          this.lightMaterial.map = this.atlasTexture;
          this.lightMaterial.needsUpdate = true;
        }
        if (this.lightDistanceMaterial) {
          this.lightDistanceMaterial.map = this.atlasTexture;
          this.lightDistanceMaterial.needsUpdate = true;
        }
      } else {
        this.atlasTexture.needsUpdate = true;
      }
    }
  }

  drawFallbackTile(name, x, y) {
    if (!this.ctx) return;
    const s = this.tileSize;
    const n = name.toLowerCase();

    // Coloured vanilla families first: wool, concrete, terracotta, stained glass and friends share
    // one shape and differ only by dye colour. Vanilla has 16 of each, so drawing them from the
    // palette keeps a colour variant looking like that colour instead of falling through to the
    // neutral grey default, which is what a name this generator does not recognise would get.
    const coloured = parseColouredName(n);
    if (coloured) {
      const base = shadedHex(coloured.hex, coloured.family);
      this.ctx.fillStyle = base;
      this.ctx.fillRect(x, y, s, s);
      // A little fibre for wool, a little grit for concrete: enough to read as a texture rather
      // than a flat swatch, and cheap because it is drawn once into the atlas.
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      if (coloured.family === 'wool' || coloured.family === 'carpet') {
        for (let i = 0; i < 5; i++) {
          const px = x + ((i * 5 + 2) % 14);
          const py = y + ((i * 7 + 3) % 14);
          this.ctx.fillRect(px, py, 2, 2);
        }
      } else if (coloured.family === 'terracotta') {
        for (let i = 0; i < 4; i++) {
          this.ctx.fillRect(x + ((i * 6) % 14), y + ((i * 4 + 1) % 14), 3, 1);
        }
      } else if (coloured.family === 'concrete_powder') {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        for (let i = 0; i < 6; i++) this.ctx.fillRect(x + ((i * 3 + 1) % 14), y + ((i * 5 + 2) % 14), 2, 2);
      } else if (coloured.family === 'stained_glass') {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        this.ctx.fillRect(x + 1, y + 1, s - 2, 1);
        this.ctx.fillRect(x + 1, y + s - 2, s - 2, 1);
      }
      return;
    }

    if (n.includes('fire')) {
      // Never draw opaque grey box for fire!
      this.ctx.clearRect(x, y, s, s);

      // Layer 1: Fiery red-orange contour
      this.ctx.fillStyle = '#eb5011';
      this.ctx.fillRect(x + 1, y + 8, 14, 8);
      this.ctx.fillRect(x + 3, y + 4, 2, 5);
      this.ctx.fillRect(x + 7, y + 2, 2, 7);
      this.ctx.fillRect(x + 9, y + 0, 2, 9);
      this.ctx.fillRect(x + 13, y + 4, 2, 5);

      // Layer 2: Golden orange middle
      this.ctx.fillStyle = '#ff8811';
      this.ctx.fillRect(x + 2, y + 9, 12, 7);
      this.ctx.fillRect(x + 3, y + 6, 2, 4);
      this.ctx.fillRect(x + 5, y + 7, 2, 3);
      this.ctx.fillRect(x + 7, y + 4, 2, 6);
      this.ctx.fillRect(x + 9, y + 5, 2, 5);
      this.ctx.fillRect(x + 11, y + 7, 2, 3);

      // Layer 3: Vibrant yellow core
      this.ctx.fillStyle = '#ffb827';
      this.ctx.fillRect(x + 4, y + 10, 8, 6);
      this.ctx.fillRect(x + 7, y + 6, 2, 5);

      // Layer 4: Glowing white-yellow heart
      this.ctx.fillStyle = '#fff29b';
      this.ctx.fillRect(x + 6, y + 11, 4, 5);
      this.ctx.fillRect(x + 7, y + 8, 2, 4);
      return;
    }

    // Default base color
    let baseColor = '#737373';

    if (n.includes('cherry_leaves')) baseColor = '#f472b6';
    else if (n.includes('cherry_log')) baseColor = '#3f2824';
    else if (n.includes('cherry_planks')) baseColor = '#fbcfe8';
    else if (n.includes('birch_log')) baseColor = '#f1f5f9';
    else if (n.includes('birch_leaves')) baseColor = '#84cc16';
    else if (n.includes('birch_planks')) baseColor = '#fef08a';
    else if (n.includes('spruce_log')) baseColor = '#3e2723';
    else if (n.includes('spruce_leaves')) baseColor = '#14532d';
    else if (n.includes('spruce_planks')) baseColor = '#78350f';
    else if (n.includes('jungle_log')) baseColor = '#5c4033';
    else if (n.includes('jungle_leaves')) baseColor = '#15803d';
    else if (n.includes('jungle_planks')) baseColor = '#b45309';
    else if (n.includes('acacia_log')) baseColor = '#52525b';
    else if (n.includes('acacia_leaves')) baseColor = '#4d7c0f';
    else if (n.includes('acacia_planks')) baseColor = '#ea580c';
    else if (n.includes('dark_oak_log')) baseColor = '#27180e';
    else if (n.includes('dark_oak_leaves')) baseColor = '#164e63';
    else if (n.includes('dark_oak_planks')) baseColor = '#451a03';
    else if (n.includes('mangrove_log') || n.includes('mangrove_roots')) baseColor = '#451a03';
    else if (n.includes('mangrove_leaves')) baseColor = '#15803d';
    else if (n.includes('mangrove_planks')) baseColor = '#7c2d12';
    else if (n.includes('mud')) baseColor = '#382e2b';
    else if (n.includes('pale_oak_log') || n.includes('pale_oak_planks')) baseColor = '#e2e8f0';
    else if (n.includes('pale_oak_leaves')) baseColor = '#94a3b8';
    else if (n.includes('mycelium')) baseColor = '#6b5770';
    else if (n.includes('podzol')) baseColor = '#573d26';
    else if (n.includes('red_sandstone') || n.includes('red_sand')) baseColor = '#c2410c';
    else if (n.includes('red_terracotta')) baseColor = '#8e3d2c';
    else if (n.includes('orange_terracotta')) baseColor = '#a05325';
    else if (n.includes('yellow_terracotta')) baseColor = '#ba8523';
    else if (n.includes('white_terracotta')) baseColor = '#d1b399';
    else if (n.includes('brown_terracotta')) baseColor = '#4d3324';
    else if (n.includes('terracotta')) baseColor = '#985f46';
    else if (n.includes('packed_ice')) baseColor = '#93c5fd';
    else if (n.includes('blue_ice')) baseColor = '#38bdf8';
    else if (n.includes('ice')) baseColor = '#bae6fd';
    else if (n.includes('red_mushroom_block')) baseColor = '#dc2626';
    else if (n.includes('brown_mushroom_block')) baseColor = '#78350f';
    else if (n.includes('nether_portal') || n.includes('portal')) baseColor = '#9333ea';
    else if (n.includes('mushroom_stem')) baseColor = '#f5f5f4';
    else if (n.includes('crimson_nylium')) baseColor = '#9f1239';
    else if (n.includes('crimson_stem')) baseColor = '#500724';
    else if (n.includes('nether_wart_block')) baseColor = '#be123c';
    else if (n.includes('warped_nylium')) baseColor = '#0f766e';
    else if (n.includes('warped_stem')) baseColor = '#115e59';
    else if (n.includes('warped_wart_block')) baseColor = '#14b8a6';
    else if (n.includes('soul_soil')) baseColor = '#3f2e24';
    else if (n.includes('basalt')) baseColor = '#3f3f46';
    else if (n.includes('blackstone')) baseColor = '#18181b';
    else if (n.includes('magma')) baseColor = '#b91c1c';
    else if (n.includes('sculk_catalyst')) baseColor = '#022c22';
    else if (n.includes('sculk')) baseColor = '#030712';
    else if (n.includes('deepslate')) baseColor = '#1e293b';
    else if (n.includes('moss_block') || n.includes('azalea')) baseColor = '#4d7c0f';
    else if (n.includes('dripstone')) baseColor = '#854d0e';
    else if (n.includes('sulfur')) baseColor = '#eab308';
    else if (n.includes('calcite')) baseColor = '#e2e8f0';
    else if (n.includes('tuff')) baseColor = '#52525b';
    else if (n.includes('dark_prismarine')) baseColor = '#064e3b';
    else if (n.includes('prismarine')) baseColor = '#0d9488';
    else if (n.includes('bamboo')) baseColor = '#22c55e';
    else if (n.includes('sunflower')) baseColor = '#facc15';
    else if (n.includes('lily_pad')) baseColor = '#15803d';
    else if (n.includes('chorus_flower')) baseColor = '#e879f9';
    else if (n.includes('chorus_plant')) baseColor = '#86198f';
    else if (n.includes('grass')) baseColor = '#5b8e3a';
    else if (n.includes('dirt')) baseColor = '#866043';
    else if (n.includes('sand')) baseColor = '#dbcf9a';
    else if (n.includes('wood') || n.includes('log')) baseColor = '#6b5335';
    else if (n.includes('leaves')) baseColor = '#2c591e';
    else if (n.includes('water')) baseColor = '#3f76e4';
    else if (n.includes('chest_lock')) baseColor = '#e5e7eb';
    else if (n.includes('chest')) baseColor = '#a16207';

    this.ctx.fillStyle = baseColor;
    this.ctx.fillRect(x, y, s, s);

    // Subtle pixel-art details
    if (n.includes('leaves')) {
      // Leaf foliage dapples and cutouts
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      this.ctx.fillRect(x + 2, y + 1, 2, 2);
      this.ctx.fillRect(x + 8, y + 3, 3, 2);
      this.ctx.fillRect(x + 13, y + 7, 2, 2);
      this.ctx.fillRect(x + 3, y + 9, 3, 2);
      this.ctx.fillRect(x + 10, y + 12, 2, 3);
      this.ctx.fillRect(x + 1, y + 14, 2, 2);

      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      this.ctx.fillRect(x + 5, y + 2, 2, 2);
      this.ctx.fillRect(x + 12, y + 2, 2, 2);
      this.ctx.fillRect(x + 1, y + 6, 2, 2);
      this.ctx.fillRect(x + 8, y + 8, 3, 2);
      this.ctx.fillRect(x + 6, y + 13, 2, 2);
      this.ctx.fillRect(x + 13, y + 13, 2, 2);

      if (n.includes('cherry_leaves')) {
        this.ctx.fillStyle = '#ec4899';
        this.ctx.fillRect(x + 3, y + 3, 3, 3);
        this.ctx.fillRect(x + 10, y + 8, 3, 3);
        this.ctx.fillRect(x + 6, y + 12, 2, 2);
      }
    } else if (n.includes('planks')) {
      // Plank horizontal border lines and nail details
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      this.ctx.fillRect(x, y + 3, s, 1);
      this.ctx.fillRect(x, y + 7, s, 1);
      this.ctx.fillRect(x, y + 11, s, 1);
      this.ctx.fillRect(x, y + 15, s, 1);
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      this.ctx.fillRect(x + 2, y + 1, 1, 1);
      this.ctx.fillRect(x + 14, y + 5, 1, 1);
      this.ctx.fillRect(x + 3, y + 9, 1, 1);
      this.ctx.fillRect(x + 13, y + 13, 1, 1);
    } else if (n.includes('birch_log')) {
      this.ctx.fillStyle = '#1e293b';
      this.ctx.fillRect(x + 2, y + 4, 4, 2);
      this.ctx.fillRect(x + 9, y + 10, 5, 2);
      this.ctx.fillRect(x + 4, y + 13, 3, 1);
    } else if (n.includes('log') || n.includes('stem')) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      this.ctx.fillRect(x + 3, y, 2, s);
      this.ctx.fillRect(x + 9, y, 2, s);
      this.ctx.fillRect(x + 13, y, 1, s);
    } else if (n.includes('sculk')) {
      this.ctx.fillStyle = '#06b6d4';
      this.ctx.fillRect(x + 4, y + 5, 2, 2);
      this.ctx.fillRect(x + 11, y + 11, 2, 2);
    } else if (n.includes('magma')) {
      this.ctx.fillStyle = '#f97316';
      this.ctx.fillRect(x + 2, y + 6, 6, 2);
      this.ctx.fillRect(x + 8, y + 12, 5, 2);
      this.ctx.fillStyle = '#facc15';
      this.ctx.fillRect(x + 4, y + 6, 2, 2);
    } else if (n.includes('red_mushroom_block')) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x + 3, y + 3, 3, 3);
      this.ctx.fillRect(x + 10, y + 9, 3, 3);
    } else if (n.includes('sunflower')) {
      this.ctx.fillStyle = '#78350f';
      this.ctx.fillRect(x + 6, y + 6, 4, 4);
    } else if (n.includes('mycelium')) {
      this.ctx.fillStyle = '#a855f7';
      this.ctx.fillRect(x + 4, y + 4, 2, 2);
      this.ctx.fillRect(x + 10, y + 7, 2, 2);
    } else if (n.includes('warped_nylium')) {
      this.ctx.fillStyle = '#2dd4bf';
      this.ctx.fillRect(x + 5, y + 5, 2, 2);
      this.ctx.fillRect(x + 11, y + 9, 2, 2);
    } else if (n.includes('crimson_nylium')) {
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.fillRect(x + 4, y + 6, 2, 2);
      this.ctx.fillRect(x + 9, y + 10, 2, 2);
    } else if (n.includes('chest_lock')) {
      this.ctx.fillStyle = '#1f2937';
      this.ctx.fillRect(x + 5, y + 5, 6, 6);
      this.ctx.fillStyle = '#9ca3af';
      this.ctx.fillRect(x + 6, y + 6, 4, 4);
    } else if (n.includes('chest')) {
      // Dark border on chest edges
      this.ctx.fillStyle = '#4a2810';
      this.ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      // Plank division
      this.ctx.fillRect(x + 1, y + 5, s - 2, 1);
      this.ctx.fillRect(x + 1, y + 10, s - 2, 1);
      if (n.includes('front')) {
        // Lock latch on front
        this.ctx.fillStyle = '#e5e7eb';
        this.ctx.fillRect(x + 6, y + 4, 4, 6);
        this.ctx.fillStyle = '#1f2937';
        this.ctx.fillRect(x + 7, y + 7, 2, 2);
      }
    }
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

  /**
   * Coordinates of a visible "missing texture" tile, painted on first use.
   *
   * Returning coordinates that pointed at atlas space nothing had been drawn into is what turned
   * an unmapped face into an invisible black quad: the canvas there is transparent, and the opaque
   * terrain material ignores alpha, so the surface painted nothing at all. Painting a magenta and
   * black checker into a free slot makes the same class of mistake obvious on screen instead of
   * silently black.
   */
  missingTextureUV(label) {
    if (label) this.warnMissingTexture(label);
    if (this.missingUV) return this.missingUV;
    const tile = this.tileSize;
    const col = this.nextCol;
    const row = this.nextRow;
    if (this.ctx && row < this.atlasGridSize) {
      this.nextCol++;
      if (this.nextCol >= this.atlasGridSize) {
        this.nextCol = 0;
        this.nextRow++;
      }
      const x = col * tile;
      const y = row * tile;
      const half = tile / 2;
      this.ctx.fillStyle = '#ff00ff';
      this.ctx.fillRect(x, y, tile, tile);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(x, y, half, half);
      this.ctx.fillRect(x + half, y + half, half, half);
      if (this.atlasTexture) this.atlasTexture.needsUpdate = true;
      this.missingUV = {
        col, row,
        u0: col / this.atlasGridSize,
        u1: (col + 1) / this.atlasGridSize,
        v1: 1 - row / this.atlasGridSize,
        v0: 1 - (row + 1) / this.atlasGridSize,
      };
    } else {
      // No canvas to paint into (headless callers and unit-test stubs): keep the coordinates
      // inside the first tile rather than outside the atlas.
      this.missingUV = { col: 0, row: 0, u0: 0, v0: 1 - 1 / this.atlasGridSize, u1: 1 / this.atlasGridSize, v1: 1 };
    }
    return this.missingUV;
  }

  warnMissingTexture(label) {
    this.missingTextures ??= new Set();
    if (this.missingTextures.has(label)) return;
    this.missingTextures.add(label);
    console.warn(`No atlas tile for texture "${label}" -- drawing the missing-texture tile instead.`);
  }

  getFaceUVs(blockId, face) {
    if (typeof blockId === 'string') {
      const tex = blockId.endsWith('.png') ? blockId : `${blockId}.png`;
      if (this.tileCoords[tex]) return this.tileCoords[tex];
      if (this.tileCoords[blockId]) return this.tileCoords[blockId];
      const upperName = blockId.toUpperCase();
      if (BLOCKS[upperName] !== undefined && BLOCK_DEFS[BLOCKS[upperName]]) {
        blockId = BLOCKS[upperName];
      }
    }

    const def = BLOCK_DEFS[blockId];
    if (!def || !def.textures) return this.missingTextureUV(`block ${blockId}`);

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

    if (texName && this.tileCoords[texName]) return this.tileCoords[texName];

    // The definition did not name a tile for this face, or the tile it named was never painted.
    // Borrow one of the block's own textures in preference to the checkerboard, since a face that
    // simply is not mentioned (a furnace's top, say) should still look like that block.
    for (const key of ['all', 'side', 'top', 'bottom', 'front']) {
      const name = def.textures[key];
      if (name && this.tileCoords[name]) return this.tileCoords[name];
    }
    for (const key in def.textures) {
      const name = def.textures[key];
      if (name && this.tileCoords[name]) return this.tileCoords[name];
    }

    return this.missingTextureUV(texName || `${def.name || blockId} face ${face}`);
  }
}
