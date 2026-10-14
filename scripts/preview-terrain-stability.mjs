// GPU regression probe: isolated flat terrain, real chunk/material/shadow path.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-terrain-stability', optimizeDeps: { entries: ['src/textures.js', 'src/mesher.js'] }, server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /WebGLProgram|Shader Error|GL_INVALID|GLSL/.test(m.text())) errors.push(m.text()); });
  await page.route('**/block-debug.html', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"><div id="view"></div></body></html>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/block-debug.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { TextureManager } = await import('/src/textures.js');
    const { Chunk } = await import('/src/world.js');
    const { ChunkMesher } = await import('/src/mesher.js');
    const { BLOCKS } = await import('/src/blocks.js');
    const { configureSunShadows, followSun } = await import('/src/lighting.js');
    const { TERRAIN_SHADOW_CHUNK } = await import('/src/terrainShadowSampling.js');
    const textures = new TextureManager(); await textures.init();
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x233044);
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(900, 650); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.append(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(55, 900 / 650, 0.1, 200); camera.position.set(7, 9, 15); camera.lookAt(7, 1, 7);
    const sun = new THREE.DirectionalLight(0xffffff, 2); configureSunShadows(sun, scene); sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x708099, .35));
    const chunk = new Chunk(0, 0), world = { getVoxel: (x, y, z) => chunk.getVoxel(x, y, z) };
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setVoxel(x, 0, z, BLOCKS.SAND);
    const mesh = new THREE.Mesh(new ChunkMesher(textures).meshChunk(chunk, world).opaqueGeo, textures.opaqueMaterial);
    mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
    // Uniform texture makes shadow acne measurable separately from pixel art.
    const data = new Uint8Array([200, 200, 200, 255]);
    const uniformMap = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat); uniformMap.colorSpace = THREE.SRGBColorSpace; uniformMap.needsUpdate = true;
    const atlas = mesh.material.map; mesh.material.map = uniformMap;
    const compile = mesh.material.onBeforeCompile, key = mesh.material.customProgramCacheKey;
    let stable = true;
    mesh.material.onBeforeCompile = shader => {
      compile(shader);
      if (!stable) shader.fragmentShader = shader.fragmentShader.replace(TERRAIN_SHADOW_CHUNK, THREE.ShaderChunk.shadowmap_pars_fragment);
    };
    mesh.material.customProgramCacheKey = () => `${key()}-${stable ? 'fixed' : 'legacy'}`;
    const sampling = value => { stable = value; mesh.material.needsUpdate = true; };
    const pixels = () => { const gl = renderer.getContext(), out = new Uint8Array(900 * 650 * 4); gl.readPixels(0, 0, 900, 650, gl.RGBA, gl.UNSIGNED_BYTE, out); return out; };
    const draw = (direction, shadows = true) => { followSun(sun, new THREE.Vector3(...direction).normalize(), new THREE.Vector3(7, 2, 7)); mesh.receiveShadow = shadows; renderer.render(scene, camera); return pixels(); };
    window.probe = { THREE, textures, scene, renderer, camera, sun, mesh, draw, pixels, atlas, uniformMap, followSun, sampling, chunk, world, ChunkMesher, BLOCKS };
  });
  const report = await page.evaluate(() => {
    const p = window.probe, results = [];
    for (const mapSize of [1024, 2048]) for (const height of [.12, .3, .6, 1.2]) {
      p.sun.shadow.map?.dispose(); p.sun.shadow.map = null; p.sun.shadow.mapSize.set(mapSize, mapSize);
      p.sampling(false);
      const legacy = p.draw([1, height, .7]);
      p.sampling(true);
      const direction = [1, height, .7], reference = p.draw(direction, false), actual = p.draw(direction, true);
      let affected = 0, maxLoss = 0, sum = 0, legacyAffected = 0;
      for (let y = 200; y < 460; y++) for (let x = 220; x < 650; x++) {
        const i = (y * 900 + x) * 4;
        const loss = reference[i] - actual[i]; maxLoss = Math.max(maxLoss, loss); sum += Math.max(0, loss);
        if (loss > 5) affected++;
        if (reference[i] - legacy[i] > 5) legacyAffected++;
      }
      results.push({ mapSize, height, affected, legacyAffected, maxLoss, meanLoss: sum / (260 * 430), bias: p.sun.shadow.bias, normalBias: p.sun.shadow.normalBias });
    }
    p.mesh.material.map = p.atlas; p.mesh.material.needsUpdate = true; p.draw([1, .3, .7]);
    return results;
  });
  await page.screenshot({ path: 'docs/artifacts/terrain-stability-current.png' });
  const behavior = await page.evaluate(() => {
    const p = window.probe;
    const changed = (a, b) => { let count = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]) > 3) count++; return count; };
    const motion = [];
    for (const name of ['SAND', 'SNOW', 'GRASS', 'STONE']) {
      p.chunk.voxels.fill(0);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) p.chunk.setVoxel(x, 0, z, p.BLOCKS[name]);
      const geometry = new p.ChunkMesher(p.textures).meshChunk(p.chunk, p.world).opaqueGeo;
      p.mesh.geometry.dispose(); p.mesh.geometry = geometry;
      p.mesh.material.userData.windStrength.value = 1;
      p.mesh.material.userData.animationTime.value = 0;
      const first = p.draw([1, .6, .7]);
      p.mesh.material.userData.animationTime.value = 3.7;
      motion.push({ block: name, changedPixels: changed(first, p.draw([1, .6, .7])) });
    }
    const blocker = new p.THREE.Mesh(new p.THREE.BoxGeometry(1, 2, 1), new p.THREE.MeshLambertMaterial({ color: 0x725747 }));
    blocker.position.set(8, 2, 8); blocker.castShadow = true; p.scene.add(blocker);
    const reference = p.draw([1, .6, .7], false), shadowed = p.draw([1, .6, .7]);
    let shadowPixels = 0, maxShadowLoss = 0;
    for (let i = 0; i < reference.length; i += 4) { const loss = reference[i] - shadowed[i]; if (loss > 25) shadowPixels++; maxShadowLoss = Math.max(maxShadowLoss, loss); }
    p.scene.remove(blocker); blocker.geometry.dispose(); blocker.material.dispose();
    p.chunk.voxels.fill(0); p.chunk.setVoxel(8, 2, 8, p.BLOCKS.OAK_LEAVES);
    const leafGeo = new p.ChunkMesher(p.textures).meshChunk(p.chunk, p.world).transparentGeo;
    const leaf = new p.THREE.Mesh(leafGeo, p.textures.transparentMaterial); p.scene.add(leaf);
    leaf.material.userData.windStrength.value = 1; leaf.material.userData.animationTime.value = 0;
    const leafFirst = p.draw([1, .6, .7], false);
    leaf.material.userData.animationTime.value = 3.7;
    const foliageChangedPixels = changed(leafFirst, p.draw([1, .6, .7], false));
    return { motion, shadowPixels, maxShadowLoss, foliageChangedPixels };
  });
  assert.deepEqual(errors, [], 'no GPU shader errors');
  assert.ok(report.some(r => r.legacyAffected > 1000), 'negative control reproduces the original stripes');
  assert.ok(report.every(r => r.affected === 0 && r.maxLoss <= 1), 'flat terrain never self-shadows');
  assert.ok(behavior.motion.every(r => r.changedPixels === 0), 'wind and animation clocks cannot move static terrain');
  assert.ok(behavior.shadowPixels > 100 && behavior.maxShadowLoss > 25, 'real occluders still cast visible shadows');
  assert.ok(behavior.foliageChangedPixels > 20, 'foliage still moves');
  await writeFile('docs/artifacts/terrain-stability-results.json', JSON.stringify({ report, behavior, errors }, null, 2));
  console.log(JSON.stringify({ report, behavior, errors }, null, 2));
} finally { await browser?.close(); await server.close(); }
