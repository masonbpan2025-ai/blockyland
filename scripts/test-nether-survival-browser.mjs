// Real UI binding, terrain, atlas and mesher without starting the full game.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('test-results/nether-survival');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
// Test a stable snapshot of this shared checkout without Vite's live reload.
await page.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: `
  export const injectQuery=(url,q)=>url+(url.includes('?')?'&':'?')+q;
  export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});
  export const updateStyle=()=>{}; export const removeStyle=()=>{};
` }));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/nether-audit-fixture.html', route => route.fulfill({
  contentType: 'text/html', body: '<!doctype html><body style="margin:0;background:#211217"><select id="biome"><option value="nether">The Nether</option></select><input id="seed" value="4289"><button id="create">Create World</button><div id="view"></div></body>',
}));
try {
  await page.goto(`${process.env.NETHER_AUDIT_URL ?? 'http://127.0.0.1:3000'}/nether-audit-fixture.html`);
  await page.evaluate(async () => {
    const [{ World }, { UIManager }] = await Promise.all([import('/src/world.js'), import('/src/ui.js')]);
    const game = { world: new World(1, 'plains'), player: { setGameMode() {} },
      applyWorldSettings(settings) { this.settings = settings; },
      async generateNewWorld() {
        this.world.rebuildStructures();
        for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) this.world.getOrCreateChunk(x, z);
        this.worldReady = true;
      },
    };
    const ui = Object.assign(Object.create(UIManager.prototype), {
      game, worldBiomeSelect: document.querySelector('#biome'), worldSeedInput: document.querySelector('#seed'),
      btnCreateWorldConfirm: document.querySelector('#create'), playPopSound() {}, closeBiomeModal() {},
    });
    ui.bindBiomeModalEvents();
    window.netherAudit = { game };
  });
  await page.locator('#create').click();
  await page.waitForFunction(() => window.netherAudit.game.worldReady);
  const ui = await page.evaluate(() => {
    const { game } = window.netherAudit;
    return { settings: game.settings, seed: game.world.seed, dimension: game.world.dimension,
      structures: game.world.structures.enabledIds, chunks: game.world.chunks.size };
  });
  assert.equal(ui.settings.biome, 'nether');
  assert.equal(ui.settings.gameMode, 'survival');
  assert.equal(ui.dimension, 'nether');
  assert.equal(ui.seed, 4289);
  assert.equal(ui.chunks, 9);
  assert.ok(ui.structures.includes('fortress') && ui.structures.includes('bastion_remnant'));

  await page.evaluate(async () => {
    const [THREE, { TextureManager }, { ChunkMesher }, { World }, { BLOCKS: B }, { getBiomeDef }, { createBlockGeometry }] =
      await Promise.all([import('/node_modules/three/build/three.module.js'), import('/src/textures.js'), import('/src/mesher.js'),
        import('/src/world.js'), import('/src/blocks.js'), import('/src/biomes.js'), import('/src/blockGeometry.js')]);
    const textures = new TextureManager(); await textures.init();
    const alpha = {};
    for (const name of ['brown_mushroom.png','red_mushroom.png','crimson_roots.png','warped_roots.png','nether_sprouts.png']) {
      const tile = textures.tileCoords[name];
      const pixels = textures.ctx.getImageData(tile.col * textures.tileSize, tile.row * textures.tileSize, textures.tileSize, textures.tileSize).data;
      let clear=0,painted=0;
      for(let i=3;i<pixels.length;i+=4) { if(pixels[i]===0) clear++; else painted++; }
      alpha[name]={clear,painted};
    }
    window.netherAudit.alpha=alpha;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1280, 740); document.querySelector('#view').append(renderer.domElement);
    const mesher = new ChunkMesher(textures);
    const camera = new THREE.PerspectiveCamera(65, 1280 / 740, 0.1, 110);
    function draw(scene) { renderer.render(scene, camera); }
    window.netherAudit.renderBiome = biome => {
      const world = new World(4289, biome), def = getBiomeDef(biome), scene = new THREE.Scene();
      scene.background = new THREE.Color(def.fogColor ?? 0x471010);
      scene.fog = new THREE.Fog(scene.background, 20, 65);
      scene.add(new THREE.HemisphereLight(0xffd3ab, 0x451c30, 1.4));
      const counts = {}; let focus = null, faces = 0;
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) world.getOrCreateChunk(x, z);
      for (const chunk of world.chunks.values()) {
        for (let i = 0; i < chunk.voxels.length; i++) {
          const id = chunk.voxels[i]; counts[id] = (counts[id] ?? 0) + 1;
          if (!focus && id === B.RED_MUSHROOM) focus = [chunk.cx * 16 + i % 16, Math.floor(i / 256), chunk.cz * 16 + Math.floor(i / 16) % 16];
        }
        const geometry = mesher.meshChunk(chunk, world);
        for (const [key, material] of [['opaqueGeo', textures.opaqueMaterial], ['transparentGeo', textures.transparentMaterial], ['lightGeo', textures.lightMaterial]]) {
          if (!geometry[key]) continue;
          faces += geometry[key].attributes.position.count;
          scene.add(new THREE.Mesh(geometry[key], material));
        }
      }
      const [x, y, z] = focus;
      camera.position.set(x + 4, y + 3.5, z + 6); camera.lookAt(x, y + 1.5, z);
      draw(scene);
      return { biome, mushrooms: (counts[B.RED_MUSHROOM] ?? 0) + (counts[B.BROWN_MUSHROOM] ?? 0),
        stems: (counts[B.CRIMSON_STEM] ?? 0) + (counts[B.WARPED_STEM] ?? 0), faces, focus };
    };
    window.netherAudit.renderPlants = () => {
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x221b28);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x7f6868, 2.2));
      const sunlight = new THREE.DirectionalLight(0xffffff, 1); sunlight.position.set(5, 8, 8); scene.add(sunlight);
      const ids = [B.BROWN_MUSHROOM, B.RED_MUSHROOM, B.CRIMSON_FUNGUS, B.WARPED_FUNGUS, B.NETHER_WART, B.NETHER_WART];
      const heights = [];
      ids.forEach((id, index) => {
        const geometry = createBlockGeometry(id, textures, { plantAge: index === 4 ? 0 : 3 });
        geometry.computeBoundingBox(); heights.push(geometry.boundingBox.max.y - geometry.boundingBox.min.y);
        const model = new THREE.Mesh(geometry, textures.transparentMaterial); model.position.set(index * 1.6, 0, 0); scene.add(model);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.4), new THREE.MeshLambertMaterial({ color: 0x5a3030 }));
        base.position.set(index * 1.6 + 0.5, -0.1, 0.5); scene.add(base);
      });
      camera.position.set(4.4, 3.8, 8.2); camera.lookAt(4.4, 0.25, 0.4); draw(scene);
      const pixels = new Uint8Array(4); renderer.getContext().readPixels(640, 370, 1, 1, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels);
      return { heights, programs: renderer.info.programs.length, pixel: [...pixels] };
    };
  });
  const terrain = [];
  for (const biome of ['nether', 'crimson_forest', 'warped_forest', 'basalt_deltas', 'soul_sand_valley']) {
    const result = await page.evaluate(biome => window.netherAudit.renderBiome(biome), biome);
    assert.ok(result.mushrooms > 0); assert.ok(result.faces > 0);
    if (['crimson_forest', 'warped_forest'].includes(biome)) assert.ok(result.stems > 0);
    terrain.push(result); await page.screenshot({ path: path.join(output, `${biome}.png`) });
  }
  const models = await page.evaluate(() => window.netherAudit.renderPlants());
  const alpha = await page.evaluate(() => window.netherAudit.alpha);
  for(const [name,coverage] of Object.entries(alpha)) { assert.ok(coverage.clear > 0, `${name}: cutout background`); assert.ok(coverage.painted > 0, `${name}: visible artwork`); }
  assert.ok(models.heights[5] > models.heights[4]); assert.ok(models.programs > 0);
  await page.screenshot({ path: path.join(output, 'survival-plants.png') });
  assert.deepEqual(errors, []);
  const report = { ui, terrain, models, alpha, errors };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
