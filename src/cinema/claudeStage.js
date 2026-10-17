// Shared stage for Blockyland films: renderer and lights, real block textures for prop meshes,
// an authored voxel world meshed with the game's own mesher, sky dome, horizon ground,
// distant mountain ranges (unlit silhouettes with aerial perspective), clouds and flush path decals.
// A film's set file builds its terrain and buildings with put()/fill(), then calls meshWorld().
import * as T from 'three';
import { World } from '../world.js';
import { TextureManager } from '../textures.js';
import { ChunkMesher } from '../mesher.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
export const rand = (x, z, s = 0) => { let h = Math.imul((x | 0) + s * 131 + 71, 374761393) ^ Math.imul((z | 0) + 613, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };

const loader = new T.TextureLoader();
const texCache = {};
export async function blockTex(name) {
  if (!texCache[name]) texCache[name] = loader.loadAsync(`${BASE}assets/blocks/${name}`).then(t => { t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; return t; });
  return texCache[name];
}
/** A material showing a block texture at one texel per 1/16 block, whatever the box size. */
export function blockMaterial(tex, tint = 0xffffff) { return new T.MeshLambertMaterial({ map: tex, color: tint }); }
/** Box whose UVs tile the texture at world scale (1 block = 1 repeat). */
export function texBox(parent, size, at, mat, rot) {
  const g = new T.BoxGeometry(...size), uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [w, h] = ax > .5 ? [size[2], size[1]] : ay > .5 ? [size[0], size[2]] : [size[0], size[1]];
    uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  }
  const m = new T.Mesh(g, mat); m.position.set(...at); if (rot) m.rotation.set(...rot); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
/** A flat texture decal on the ground (paths, roads): sits flush instead of sinking a block. */
export function decal(parent, x0, z0, x1, z1, mat, y = 3.012) {
  const w = x1 - x0, d = z1 - z0, g = new T.PlaneGeometry(w, d), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w + x0, uv.getY(i) * d + z0);
  const m = new T.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; parent.add(m); return m;
}

const TEXTURES = ['oak_planks.png', 'spruce_planks.png', 'dark_oak_planks.png', 'oak_log.png', 'spruce_log.png', 'hay_block_side.png', 'hay_block_top.png', 'dirt_path_top.png', 'cobblestone.png', 'stone_bricks.png', 'iron_block.png', 'smooth_stone.png', 'white_wool.png', 'red_wool.png', 'stripped_oak_log.png', 'gravel.png', 'coarse_dirt.png', 'podzol_top.png'];

/** Output frame: the live preview draws 1280×720; an export (?export) draws 1920×1080 from a 2× supersampled picture,
 *  which averages away the shimmer of thin texture lines on distant blocks. */
const EXPORTING = new URLSearchParams(globalThis.location?.search ?? '').has('export');
export const FRAME = EXPORTING ? { width: 1920, height: 1080, supersample: 2 } : { width: 1280, height: 720, supersample: 1 };

/** Renderer, lights, textures, prop materials and an empty authored world of (2·chunks+1)² chunks. */
export async function createStage({ seed = 1907, chunks = 4, extraTextures = [] } = {}) {
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(FRAME.supersample); renderer.setSize(FRAME.width, FRAME.height);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene(); scene.fog = new T.Fog(0xcfe0e6, 60, 230);
  const camera = new T.PerspectiveCamera(40, 16 / 9, .1, 600);
  const hemi = new T.HemisphereLight(0xdcecff, 0x7d7a52, 1.9), sun = new T.DirectionalLight(0xfff0d0, 3.2);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.normalBias = .03; sun.shadow.bias = -.0004;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 140 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(hemi, sun, sun.target);

  const tex = Object.fromEntries(await Promise.all([...TEXTURES, ...extraTextures].map(async n => [n.replace('.png', ''), await blockTex(n)])));
  const M = {
    oak: blockMaterial(tex.oak_planks), spruce: blockMaterial(tex.spruce_planks), dark: blockMaterial(tex.dark_oak_planks), log: blockMaterial(tex.oak_log), spruceLog: blockMaterial(tex.spruce_log),
    hay: blockMaterial(tex.hay_block_side), hayTop: blockMaterial(tex.hay_block_top), cobble: blockMaterial(tex.cobblestone), brick: blockMaterial(tex.stone_bricks), iron: blockMaterial(tex.iron_block, 0x9aa0a6),
    stone: blockMaterial(tex.smooth_stone), wool: blockMaterial(tex.white_wool, 0xe8dcc0), red: blockMaterial(tex.red_wool), stripped: blockMaterial(tex.stripped_oak_log), wheelWood: blockMaterial(tex.spruce_planks, 0xb59a7a),
  };

  const textures = new TextureManager(); await textures.init();
  const world = new World(seed, 'plains'); world.generationMode = 'authored'; world.structures = null;
  for (let cx = -chunks; cx <= chunks; cx++) for (let cz = -chunks; cz <= chunks; cz++) world.getOrCreateChunk(cx, cz);
  const put = (x, y, z, id) => world.getChunk(Math.floor(x / 16), Math.floor(z / 16))?.setVoxel((x % 16 + 16) % 16, y, (z % 16 + 16) % 16, id);
  const fill = (x0, y0, z0, x1, y1, z1, id) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, id); };
  return { renderer, scene, camera, hemi, sun, tex, M, textures, world, put, fill };
}

/** Light and mesh the authored world with the game's mesher (cutout leaves, no sorting). */
export function meshWorld({ world, textures, scene }) {
  world.light.skyDarken = 0; world.light.update(40000);
  const mesher = new ChunkMesher(textures);
  // The game's atlas has no mipmaps, so distant floors flicker as the camera drifts; films get a mipmapped copy.
  // The chain stops at one pixel per tile, so a level never blends neighbouring tiles,
  // and nearest-texel sampling within a level keeps near blocks crisp.
  const src = textures.atlasTexture.image, mipmaps = [src];
  for (let size = src.width / 2, tile = textures.tileSize / 2; tile >= 1; size /= 2, tile /= 2) {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.drawImage(mipmaps.at(-1), 0, 0, size, size); mipmaps.push(c);
  }
  const atlas = new T.CanvasTexture(src); Object.assign(atlas, { mipmaps, generateMipmaps: false, magFilter: T.NearestFilter, minFilter: T.NearestMipmapLinearFilter, colorSpace: T.SRGBColorSpace });
  for (const c of world.chunks.values()) {
    const g = mesher.meshChunk(c, world);
    for (const [key, source] of [['opaqueGeo', textures.opaqueMaterial], ['transparentGeo', textures.transparentMaterial]]) if (g[key]) {
      const mat = source.clone(); mat.map = atlas; mat.transparent = false; mat.alphaTest = .4; const mesh = new T.Mesh(g[key], mat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
    }
  }
}

/** Sky dome (gradient + sun glow), horizon ground plane, mountain ranges and clouds. */
export function addSkyAndHorizon({ scene }, ranges) {
  const sky = new T.Mesh(new T.SphereGeometry(500, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new T.Color(0x7fb2dc) }, horizon: { value: new T.Color(0xdcebee) }, glow: { value: new T.Color(0xfff2d0) }, sunDir: { value: new T.Vector3(0, .5, -1).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position + cameraPosition, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; varying vec3 vDir; void main(){ float h = clamp(vDir.y * 1.6 + .08, 0., 1.); vec3 c = mix(horizon, top, pow(h, .7)); float s = max(dot(vDir, sunDir), 0.); c += glow * (pow(s, 12.) * .55 + pow(s, 400.) * 1.2); gl_FragColor = vec4(c, 1.); }',
  }));
  sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
  const groundPlane = new T.Mesh(new T.PlaneGeometry(1600, 1600), new T.MeshLambertMaterial({ color: 0x6f8f4b })); groundPlane.rotation.x = -Math.PI / 2; groundPlane.position.y = 2.96; groundPlane.receiveShadow = true; scene.add(groundPlane);
  const mountains = new T.Group(); scene.add(mountains);
  const hillMats = [];
  // [cx, cz, dirX, dirZ, count, color, seed]: a range of stepped peaks along x (dirZ ≠ 0) or z (dirX ≠ 0)
  for (const [cx, cz, dirX, dirZ, count, color, seed] of ranges) {
    const mat = new T.MeshBasicMaterial({ color, fog: false }); mat.userData.far = hillMats.length % 2; hillMats.push(mat);
    for (let i = 0; i < count; i++) {
      const along = (i - count / 2) * 22, w = 26 + rand(i, seed) * 18, hgt = 22 + rand(seed, i) * 36;
      for (let tier = 0; tier < 6; tier++) {
        const k = 1 - tier / 6, px = cx + dirZ * along + dirX * rand(i, tier, seed) * 10, pz = cz + dirX * along + dirZ * rand(tier, i, seed) * 10;
        const m = new T.Mesh(new T.BoxGeometry(dirZ ? w * k : 14 * k + 6, hgt / 6, dirZ ? 14 * k + 6 : w * k), mat); m.position.set(px, 3 + hgt / 12 + tier * hgt / 6, pz); mountains.add(m);
      }
    }
  }
  const clouds = new T.Group(); scene.add(clouds);
  const cloudMat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa4b0, transparent: true, opacity: .92 });
  for (let i = 0; i < 46; i++) {
    const cx = (rand(i, 1) - .5) * 520, cz = (rand(i, 2) - .5) * 520, g = new T.Group(); g.position.set(cx, 62 + rand(i, 3) * 18, cz);
    for (let k = 0; k < 4; k++) { const m = new T.Mesh(new T.BoxGeometry(10 + rand(i, k) * 18, 3, 8 + rand(k, i) * 12), cloudMat); m.position.set((rand(k, i, 4) - .5) * 16, 0, (rand(i, k, 5) - .5) * 10); g.add(m); }
    clouds.add(g);
  }
  // distant ranges are unlit silhouettes; the far ridge is paler (aerial perspective)
  const setHills = (color, dusk = 0) => { const near = new T.Color(color), far = near.clone().lerp(new T.Color(0xffffff), .28); if (dusk) { near.lerp(new T.Color(0x2b2d45), dusk * .6); far.lerp(new T.Color(0x3a3a58), dusk * .6); } for (const m of hillMats) m.color.copy(m.userData.far ? far : near); };
  return { sky, groundPlane, mountains, clouds, setHills };
}

/** Apply a named look: sun direction/colour, sky gradient, fog, exposure and hill colour. */
export function applyLook(stage, L, { focus = L.focus, sunDir, top, horizon, sunI = L.sunI, dusk = 0, fogNear = 60, fogFar = 240 } = {}) {
  const { sun, hemi, sky, scene, renderer } = stage, f = new T.Vector3(...focus);
  sunDir ??= new T.Vector3(...L.sun).normalize(); top ??= new T.Color(L.top); horizon ??= new T.Color(L.horizon);
  sun.position.copy(f).addScaledVector(sunDir, 70); sun.target.position.copy(f); sun.target.updateMatrixWorld();
  sun.color.setHex(L.sunColor); sun.intensity = sunI; hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiI;
  sky.material.uniforms.top.value.copy(top); sky.material.uniforms.horizon.value.copy(horizon); sky.material.uniforms.glow.value.setHex(L.glow); sky.material.uniforms.sunDir.value.copy(sunDir);
  scene.fog.color.copy(horizon).lerp(new T.Color(L.fog), .5); scene.fog.near = fogNear; scene.fog.far = fogFar;
  renderer.toneMappingExposure = L.exposure;
  stage.setHills(L.hills, dusk);
}
