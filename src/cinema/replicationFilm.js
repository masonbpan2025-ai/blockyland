// The replication film: four Claude agents playing survival Blockyland together (replication/, after arXiv:2610.22319),
// called as a sports broadcast by two commentators.
//
// The world is the server's own: the Overworld regenerated from the run's seed with the same structures
// (replication/server/engine.js REPLICATION_STRUCTURES), with every recorded block change applied up to the moment on
// screen and undone when a cut goes back. Chunks are generated and meshed around the shot as it moves. The players
// are the game's player model in their own colours, placed from the recording (a frame every 0.5 s); the mobs and
// dropped items the players could see are drawn where they were. The edit (replicationEdit.js) is a list of scenes,
// each a stretch of game time, a camera and its captions: an agent's own words, a chat message, a milestone, and the
// commentators' lines. Frames are a pure function of film time, so scripts/render-film.mjs can render any frame.
import * as T from 'three';
import { World } from '../world.js';
import { TextureManager } from '../textures.js';
import { ChunkMesher } from '../mesher.js';
import { BLOCKS } from '../blocks.js';
import { clamp, ease, lerp, lerpAngle } from './claudeActors.js';
import { createPlayerModel } from '../playerModel.js';
import { ItemVisuals } from '../itemVisuals.js';
import { MobManager } from '../mobs.js';
import { createArrowModel } from '../arrows.js';
import { WORLD_STRUCTURE_IDS, withEndFixtures } from '../worldStructures.js';
import { arenaTimeline } from './arenaEdit.js';
// Each run's film has its own edit; the page names the run (`<body data-run="dry8">`, default the first film's).
const EDITS = {
  sonnet30: () => import('./replicationEdit.js').then(m => m.REPLICATION_EDIT),
  dry8: () => import('./replicationEditDry8.js').then(m => m.REPLICATION_EDIT_DRY8),
  'dry10-haiku': () => import('./replicationEditDry10Haiku.js').then(m => m.REPLICATION_EDIT_DRY10_HAIKU),
  'dry10-sonnet2': () => import('./replicationEditDry10Sonnet.js').then(m => m.REPLICATION_EDIT_DRY10_SONNET),
  'dry10-gemini': () => import('./replicationEditDry10Gemini.js').then(m => m.REPLICATION_EDIT_DRY10_GEMINI),
  'dry10-gemini2': () => import('./replicationEditDry10Gemini.js').then(m => m.REPLICATION_EDIT_DRY10_GEMINI),
  'hz-gemini10': () => import('./replicationEditHzGemini.js').then(m => m.REPLICATION_EDIT_HZ_GEMINI),
  'hz-dry10-gemini': () => import('./replicationEditHzDry10Gemini.js').then(m => m.REPLICATION_EDIT_HZ_DRY10_GEMINI),
};
const RUN = globalThis.document?.body?.dataset?.run ?? 'sonnet30';
if (!EDITS[RUN]) throw new Error(`No edit for run ${RUN}`);
const REPLICATION_EDIT = await EDITS[RUN]();

// The server's world (replication/server/engine.js): the default structures, strongholds, every village type and the
// Overworld's ruined portals.
const STRUCTURES = withEndFixtures([...WORLD_STRUCTURE_IDS, 'stronghold', 'village_desert', 'village_savanna', 'village_snowy', 'village_taiga',
  'ruined_portal', 'ruined_portal_desert', 'ruined_portal_jungle', 'ruined_portal_mountain', 'ruined_portal_swamp']);

const EXPORTING = new URLSearchParams(globalThis.location?.search ?? '').has('export');
const OUT = EXPORTING ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
// One colour per player, as a broadcast gives each driver a livery.
const KIT = [
  { shirt: '#d9483b', pants: '#4a2a2a', ink: '#ff9a8a', skin: '#e8b98f', hair: '#3b2416' },
  { shirt: '#2f6fd0', pants: '#26304a', ink: '#9cc0ff', skin: '#c98e62', hair: '#151010' },
  { shirt: '#2fa860', pants: '#24402e', ink: '#8fe3ae', skin: '#f0c8a0', hair: '#c9a35a' },
  { shirt: '#c99a1f', pants: '#4a3a1a', ink: '#ffe08a', skin: '#8d5a3b', hair: '#0d0b0a' },
];
const R = 5; // chunks meshed around the shot

const story = { ...REPLICATION_EDIT, ...arenaTimeline(REPLICATION_EDIT) };
const status = (s) => { const el = document.querySelector('#stage p'); if (el) el.textContent = s; };

async function main() {
  status('Loading the game recording…');
  const base = `${import.meta.env?.BASE_URL ?? '/'}${story.data.replace(/^\//, '')}`;
  const rec = await (await fetch(`${base}/recording.json`)).json();
  const narration = await fetch(`${base}/narration/manifest.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  for (const c of story.captions) if (c.kind === 'narrator' && narration?.clips?.[c.id]) c.end = c.start + narration.clips[c.id].duration + .4;

  // --- renderer and scene ---
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(OUT.width, OUT.height);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene(); const sky = new T.Color(0x9cc8ec); scene.background = sky; scene.fog = new T.Fog(0xb9d7ee, 60, 150);
  const camera = new T.PerspectiveCamera(50, 16 / 9, .1, 400);
  const hemi = new T.HemisphereLight(0xdcecff, 0x6d7a52, 1.8), sun = new T.DirectionalLight(0xfff0d0, 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .04; sun.shadow.bias = -.0005;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(hemi, sun, sun.target);

  // --- the world, regenerated as the server made it, and its block changes over time ---
  status('Regenerating the world from the run’s seed…');
  const textures = new TextureManager(); await textures.init();
  const world = new World(rec.seed, 'all');
  world.generationMode = 'procedural';
  world.rebuildStructures({ enabledIds: STRUCTURES });
  const changes = rec.blockChanges.filter(c => c[1] === 'overworld').map(([t, , x, y, z, id]) => [t, x, y, z, id]);
  const undo = [];
  let applied = 0;
  const dirty = new Set();
  const meshed = new Map(); // "cx,cz" -> meshes
  const markDirty = (x, z) => { for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const k = `${Math.floor((x + dx) / 16)},${Math.floor((z + dz) / 16)}`; if (meshed.has(k)) dirty.add(k); } };
  const setBlock = (x, y, z, id) => { world.setVoxel(x, y, z, id); markDirty(x, z); };
  function applyUntil(g) {
    while (applied < changes.length && changes[applied][0] <= g) { const [, x, y, z, id] = changes[applied]; undo.push(world.getVoxel(x, y, z)); setBlock(x, y, z, id); applied++; }
    while (applied > 0 && changes[applied - 1][0] > g) { applied--; const [, x, y, z] = changes[applied]; setBlock(x, y, z, undo.pop()); }
  }
  world.light.skyDarken = 0;
  const mesher = new ChunkMesher(textures);
  const src = textures.atlasTexture.image, mipmaps = [src];
  for (let size = src.width / 2, tile = textures.tileSize / 2; tile >= 1; size /= 2, tile /= 2) {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(mipmaps.at(-1), 0, 0, size, size); mipmaps.push(c);
  }
  const atlas = new T.CanvasTexture(src); Object.assign(atlas, { mipmaps, generateMipmaps: false, magFilter: T.NearestFilter, minFilter: T.NearestMipmapLinearFilter, colorSpace: T.SRGBColorSpace });
  const materials = [textures.opaqueMaterial, textures.transparentMaterial].map(m => { const c = m.clone(); c.map = atlas; c.transparent = false; c.alphaTest = .4; return c; });
  const water = new T.MeshLambertMaterial({ color: 0x3a6fd0, transparent: true, opacity: .6, depthWrite: false });
  function meshChunk(key) {
    const [cx, cz] = key.split(',').map(Number);
    for (const m of meshed.get(key) ?? []) { scene.remove(m); m.geometry.dispose(); }
    const g = mesher.meshChunk(world.getOrCreateChunk(cx, cz), world), meshes = [];
    for (const [mat, k] of [[materials[0], 'opaqueGeo'], [materials[1], 'transparentGeo'], [materials[0], 'lightGeo'], [water, 'waterGeo']]) if (g[k]) { const m = new T.Mesh(g[k], mat); m.castShadow = mat !== water; m.receiveShadow = true; if (mat === water) m.renderOrder = 1; scene.add(m); meshes.push(m); }
    meshed.set(key, meshes);
  }
  /** The chunks around a point: generated (and lit) once, meshed while near, let go when far. */
  function ensureArea(x, z) {
    const ccx = Math.floor(x / 16), ccz = Math.floor(z / 16);
    let made = false;
    for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) if (!world.getChunk(ccx + dx, ccz + dz)) { world.getOrCreateChunk(ccx + dx, ccz + dz); made = true; }
    if (made) world.light.update(400000);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) { const k = `${ccx + dx},${ccz + dz}`; if (!meshed.has(k)) meshChunk(k); }
    for (const [k, meshes] of meshed) { const [cx, cz] = k.split(',').map(Number); if (Math.abs(cx - ccx) > R + 2 || Math.abs(cz - ccz) > R + 2) { for (const m of meshes) { scene.remove(m); m.geometry.dispose(); } meshed.delete(k); dirty.delete(k); } }
  }
  const LEAVES = new Set(Object.entries(BLOCKS).filter(([k]) => k.endsWith('LEAVES')).map(([, v]) => v));
  // A shot may trim the leaves between its lens and its players, as a film crew cuts foliage: only for that shot and
  // only leaves. Trims are put back while block changes move, then redone.
  let trimmed = []; // [x, y, z, the block cut, whether any block may be cut there (a cutaway) or only leaves]
  function setTrims(list) {
    for (const [x, y, z, id] of trimmed) if (world.getVoxel(x, y, z) === BLOCKS.AIR) setBlock(x, y, z, id);
    trimmed = [];
    for (const [x, y, z, any] of list) { const v = world.getVoxel(x, y, z); if (LEAVES.has(v) || (any && CUTTABLE(v))) { trimmed.push([x, y, z, v, any]); setBlock(x, y, z, BLOCKS.AIR); } }
  }
  // A cutaway shot (a player deep underground) cuts the rock between the lens and them, never lava, water or bedrock.
  const CUTTABLE = (v) => v !== BLOCKS.AIR && v !== BLOCKS.WATER && v !== BLOCKS.LAVA && v !== BLOCKS.BEDROCK;
  function syncWorld(g, trims = null) {
    const moves = (applied < changes.length && changes[applied][0] <= g) || (applied > 0 && changes[applied - 1][0] > g);
    // (with each cut's kind: dropping it put a cutaway's rock back after the first block change in the shot)
    const keep = trimmed.map(([x, y, z, , any]) => [x, y, z, any]);
    if (moves || trims) setTrims([]);
    applyUntil(g);
    if (trims) setTrims(trims); else if (moves) setTrims(keep);
    if (!dirty.size) return;
    world.light.update(20000);
    for (const key of dirty) meshChunk(key);
    dirty.clear();
  }

  // --- the players ---
  status('Dressing the players…');
  const names = rec.players.map(p => p.name);
  const kitOf = Object.fromEntries(names.map((n, i) => [n, KIT[i % KIT.length]]));
  const steve = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = '/assets/entity/player/wide/steve.png'; });
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  function skinFor(kit) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(steve, 0, 0);
    const img = g.getImageData(0, 0, 64, 64), d = img.data, shirt = rgb(kit.shirt), pants = rgb(kit.pants), hair = rgb(kit.hair), skin = rgb(kit.skin);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const [r, gr, b] = [d[i], d[i + 1], d[i + 2]], y = Math.floor(i / 4 / 64);
      let to = null;
      if (r < 40 && gr > 90 && Math.abs(gr - b) < 16) to = shirt.map(v => v * gr / 175);
      else if (y >= 16 && b > r + 50 && b > gr + 50) to = pants.map(v => v * b / 165 * 1.6);
      else if (y < 16 && r < 80 && r >= gr && gr >= b) to = hair.map(v => v * r / 51);
      else if (r > 130 && r < 200 && gr > 80 && gr < 135 && b < 110) to = skin.map((v, k) => v * [r / 170, gr / 114, b / 89][k]);
      if (to) for (let k = 0; k < 3; k++) d[i + k] = clamp(Math.round(to[k]), 0, 255);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  const items = new ItemVisuals(textures);
  const actors = names.map((name) => {
    const kit = kitOf[name], actor = createPlayerModel({ skinDataUrl: skinFor(kit), followEquippedSkin: false });
    actor.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(actor);
    const hand = new T.Group(); hand.position.set(0, -.7, -.15); actor.rightArm.add(hand);
    actor.userData.hand = hand; actor.userData.heldKey = undefined; actor.userData.armorKey = '';
    const tag = document.createElement('canvas'); tag.width = 256; tag.height = 64; const p = tag.getContext('2d');
    p.fillStyle = 'rgba(0,0,0,.45)'; p.fillRect(40, 10, 176, 42); p.font = 'bold 30px Arial'; p.textAlign = 'center'; p.fillStyle = kit.ink; p.fillText(name, 128, 42);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(tag), depthWrite: false, transparent: true }));
    sprite.scale.set(1.5, .375, 1); sprite.position.set(0, 2.3, 0); actor.add(sprite); actor.userData.tag = sprite;
    return actor;
  });
  await Promise.all(actors.map(a => new Promise(resolve => { const tick = () => a.baseMaterial.map?.image?.width ? resolve() : setTimeout(tick, 20); tick(); })));
  // An item by its name: a block's item is drawn as the block.
  const itemKey = (name) => { if (name == null) return null; const id = BLOCKS[String(name).toUpperCase()]; return id !== undefined ? id : String(name); };
  const heldMesh = (name) => {
    const id = itemKey(name), isBlock = typeof id === 'number', mesh = items.create(id, isBlock, isBlock ? .3 : .62);
    if (isBlock) mesh.rotation.set(.3, Math.PI / 4, 0);
    else { if (mesh.children?.length > 1) mesh.remove(mesh.children[1]); mesh.rotation.set(-Math.PI / 4, Math.PI / 2, 0); mesh.position.set(0, .12, -.12); }
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return mesh;
  };
  const armorSlots = (ids) => {
    const out = {};
    for (const id of (ids ?? []).filter(Boolean)) { const s = String(id); const slot = /helmet|_cap$/.test(s) ? 'head' : /chestplate|tunic/.test(s) ? 'chest' : /leggings|pants/.test(s) ? 'legs' : /boots/.test(s) ? 'feet' : null; if (slot) out[slot] = { id }; }
    return out;
  };

  // --- mobs and dropped items, the game's own models ---
  const mobs = new MobManager(scene, world, new Proxy({}, { get: () => () => {} }), { spawnDroppedItem() {}, spawnXpOrbs() {}, spawnDeathParticles() {}, spawnBlockBreakParticles() {} });
  mobs.game = { player: { position: new T.Vector3(0, -50, 0) }, difficulty: 'normal', weather: { weatherType: 'clear' }, mechanisms: { isFeatureEnabled: () => false } };
  const mobMeshes = new Map();
  const ARROW_SCALE = .6; // the game's arrow model is 0.9 blocks long; a vanilla arrow is about half a block
  const mobFor = (id, type) => {
    if (mobMeshes.has(id)) return mobMeshes.get(id);
    let made = null;
    try {
      if (type === 'arrow') { const m = createArrowModel(); m.scale.setScalar(ARROW_SCALE); scene.add(m); made = { mesh: m, arrow: true }; }
      else if (type.startsWith('item:')) { const m = heldMesh(type.slice(5)); m.scale.multiplyScalar(.7); const g = new T.Group(); g.add(m); scene.add(g); made = { mesh: g, item: true }; }
      else { const mob = mobs.spawnMob(type, 0, -50, 0, { isBaby: false, baby: false }); if (mob) { mob.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }); if (!mob.mesh.parent) scene.add(mob.mesh); made = mob; } }
    } catch { made = null; }
    mobMeshes.set(id, made); return made;
  };

  // --- reading the recording at any game time ---
  const frames = rec.frames;
  const frameIndex = (g) => { let lo = 0, hi = frames.length - 2; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= g) lo = mid; else hi = mid - 1; } return Math.max(0, lo); };
  const walked = names.map((_, i) => { let acc = 0; return frames.map((f, k) => { if (k && f.p[i] && frames[k - 1].p[i]) { const a = frames[k - 1].p[i], b = f.p[i]; const d = Math.hypot(b[0] - a[0], b[2] - a[2]); if (d < 6) acc += d; } return acc; }); });
  const empty = [0, -100, 0, 0, 0, 20, null, 'overworld', [], 0, 20];
  // A death is held on screen: the server logs the respawn in the same tick as the death, so without this the player
  // (and any camera on them) would jump to the spawn the instant they die. For DEATH_HOLD seconds the player stays
  // where they fell, red, and the HUD shows them down.
  const DEATH_HOLD = 3;
  const heldDeath = (i, g) => deaths.find(e => e.player === names[i] && g >= e.t && g < e.t + DEATH_HOLD);
  function playerAt(i, g) {
    const d = heldDeath(i, g);
    return d ? { ...livePlayerAt(i, d.t - .25), hp: 0, speed: 0 } : livePlayerAt(i, g);
  }
  function livePlayerAt(i, g) {
    const k = frameIndex(g), a = frames[k], b = frames[Math.min(k + 1, frames.length - 1)], u = clamp((g - a.t) / Math.max(.001, b.t - a.t));
    const pa = a.p[i] ?? empty, pb = b.p[i] ?? pa;
    const jump = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) > 6 || pa[7] !== pb[7];
    return { x: jump ? pa[0] : lerp(pa[0], pb[0], u), y: jump ? pa[1] : lerp(pa[1], pb[1], u), z: jump ? pa[2] : lerp(pa[2], pb[2], u),
      yaw: lerpAngle(pa[3], pb[3], u), pitch: lerp(pa[4], pb[4], u), hp: lerp(pa[5], pb[5], u), held: pa[6], dim: pa[7], armor: pa[8] ?? [], sleeping: pa[9], food: pa[10],
      walked: lerp(walked[i][k], walked[i][Math.min(k + 1, frames.length - 1)], u), speed: (walked[i][Math.min(k + 1, frames.length - 1)] - walked[i][k]) / Math.max(.05, b.t - a.t) };
  }
  const centreOf = (name, g, span = .8) => {
    const i = names.indexOf(name), acc = new T.Vector3(); let n = 0;
    for (let s = -span; s <= span + 1e-6; s += span / 3) { const p = playerAt(i, clamp(g + s, 0, frames.at(-1).t)); acc.add(new T.Vector3(p.x, p.y, p.z)); n++; }
    return acc.divideScalar(n);
  };
  // Mining: a block turned to air within reach of a player, a stroke of the arm around that moment.
  const digs = names.map(() => []);
  { let k = 0; for (const [t, x, y, z, id] of changes) { if (id !== BLOCKS.AIR) continue; while (k < frames.length - 1 && frames[k + 1].t <= t) k++; frames[k].p.forEach((p, i) => { if (p && p[7] === 'overworld' && Math.hypot(p[0] - x - .5, p[1] + 1.5 - y, p[2] - z - .5) < 6) digs[i].push(t); }); } }
  const deaths = rec.events.filter(e => e.kind === 'death'), respawns = rec.events.filter(e => e.kind === 'respawn');
  const deadAt = (name, g) => { const d = deaths.filter(e => e.player === name && e.t <= g).at(-1); if (!d) return null; if (g < d.t + DEATH_HOLD) return d; const r = respawns.find(e => e.player === name && e.t >= d.t); return !r || g < r.t ? d : null; };
  const red = new T.Color(1, .3, .3), white = new T.Color(1, 1, 1);
  function tint(actor, color) {
    const inHand = (o) => { for (let q = o; q; q = q.parent) if (q === actor.userData.hand) return true; return false; };
    actor.traverse(o => { if (!o.isMesh || o === actor.userData.tag || inHand(o) || !o.material?.color) return; for (const m of [o.material].flat()) { m.userData.base ??= m.color.clone(); m.color.copy(m.userData.base).multiply(color); } });
  }
  // --- the fights (replication/film/combat.mjs, inferred from health and arrows in the frames) ---
  // Arrows fly from the archer's bow to where they hit; a player who is hit flashes red and is knocked back; a player's
  // blow is a swing of the arm at the mob, which flashes red and is knocked back too; a mob killed falls over.
  const combat = rec.combat ?? { shots: [], hurts: [], hits: [] };
  const shotsByT0 = [...combat.shots].sort((a, b) => a.t0 - b.t0);
  const maxFlight = Math.max(1, ...combat.shots.map(s => s.t1 - s.t0));
  const shotOfArrow = new Map(combat.shots.filter(s => s.arrow != null).map(s => [s.arrow, s]));
  const shotsOfMob = new Map();
  for (const s of shotsByT0) { if (!shotsOfMob.has(s.mob)) shotsOfMob.set(s.mob, []); shotsOfMob.get(s.mob).push(s); }
  const hurtsOf = names.map(n => combat.hurts.filter(h => h.player === n));
  const blowsOf = names.map(n => combat.hits.filter(h => h.player === n));
  const hitsOnMob = new Map();
  for (const h of combat.hits) { if (!hitsOnMob.has(h.mob)) hitsOnMob.set(h.mob, []); hitsOnMob.get(h.mob).push(h); }
  const kills = combat.hits.filter(h => h.killed);
  const meleeOnPlayer = new Map(); // a melee mob's lunge at the player it hit
  for (const h of combat.hurts) if (h.how === 'melee') { if (!meleeOnPlayer.has(h.mob)) meleeOnPlayer.set(h.mob, []); meleeOnPlayer.get(h.mob).push(h); }
  const latest = (list, g, span) => { let best = null; for (const e of list) { if (e.t > g) break; if (g - e.t < span) best = e; } return best; };
  const HURT_TIME = .5; // the red flash of a hit (Minecraft: 10 ticks)
  const bump = (u) => Math.sin(Math.PI * clamp(u)); // a hop out and back: the recorded positions carry where it ends
  const FORWARD = new T.Vector3(0, 0, 1);
  // A flight: a straight line from bow to target with a slight upward arc (aimed a little high, it falls back).
  function flight(s, g) {
    const u = clamp((g - s.t0) / Math.max(.01, s.t1 - s.t0)), a = new T.Vector3(...s.from), b = new T.Vector3(...s.to), h = a.distanceTo(b) * .03;
    const pos = a.clone().lerp(b, u); pos.y += 4 * h * u * (1 - u);
    const dir = b.clone().sub(a); dir.y += 4 * h * (1 - 2 * u);
    return { pos, dir: dir.normalize() };
  }
  const arrowPool = [];
  function placeArrows(g) {
    let n = 0, lo = 0, hi = shotsByT0.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (shotsByT0[m].t0 < g - maxFlight) lo = m + 1; else hi = m; }
    for (let i = lo; i < shotsByT0.length && shotsByT0[i].t0 <= g; i++) {
      const s = shotsByT0[i]; if (g > s.t1) continue;
      const m = arrowPool[n] ??= (() => { const a = createArrowModel(); a.scale.setScalar(ARROW_SCALE); scene.add(a); return a; })(); n++;
      const { pos, dir } = flight(s, g); m.position.copy(pos); m.quaternion.setFromUnitVectors(FORWARD, dir); m.visible = true;
    }
    for (let i = n; i < arrowPool.length; i++) arrowPool[i].visible = false;
  }
  // A mob's own materials, so one skeleton can flash red without every skeleton doing so.
  function tintMob(mob, on) {
    if (mob.mesh.userData.red === on) return;
    mob.mesh.traverse(o => {
      if (!o.isMesh || !o.material) return;
      if (!o.userData.ownMaterial) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); o.userData.ownMaterial = true; }
      for (const m of [o.material].flat()) { if (!m.color) continue; m.userData.base ??= m.color.clone(); m.color.copy(m.userData.base); if (on) m.color.multiply(red); }
    });
    mob.mesh.userData.red = on;
  }
  // Where a mob was at g (smoothed), or where it was last seen before (or first seen after) g.
  function mobAt(id, g, span = .5) {
    const acc = new T.Vector3(); let n = 0;
    for (let k = frameIndex(g - span); k < frames.length && frames[k].t <= g + span; k++) { const a = frames[k].a?.find(e => e[0] === id); if (a) { acc.add(new T.Vector3(a[2], a[3], a[4])); n++; } }
    if (n) return acc.divideScalar(n);
    const k0 = frameIndex(g);
    for (let d = 1; d < 60; d++) for (const k of [k0 - d, k0 + d]) { const a = frames[k]?.a?.find(e => e[0] === id); if (a) return new T.Vector3(a[2], a[3], a[4]); }
    return null;
  }
  // Damage numbers, drawn on the 2D layer over the frame: [world point, text, colour, age 0-1].
  let popups = [];
  function placeActors(g) {
    popups = [];
    names.forEach((name, i) => {
      const actor = actors[i], p = playerAt(i, g), dead = deadAt(name, g);
      actor.visible = p.dim === 'overworld' && p.y > -50 && (!dead || g - dead.t < DEATH_HOLD);
      if (!actor.visible) return;
      actor.position.set(p.x, p.y, p.z); actor.rotation.set(0, p.yaw, dead ? -Math.min(1, (g - dead.t) * 3) * Math.PI / 2 : 0);
      if (p.sleeping) actor.rotation.set(-Math.PI / 2, p.yaw, 0);
      actor.head.rotation.x = clamp(p.pitch, -1.2, 1.2);
      const moving = clamp((p.speed - .3) / 1.5), legs = Math.sin(p.walked * 2.2) * .65 * moving;
      actor.leftLeg.rotation.x = legs; actor.rightLeg.rotation.x = -legs;
      actor.leftArm.rotation.set(-legs, 0, -.05); actor.rightArm.rotation.set(legs, 0, .05);
      if (digs[i].some(t => g >= t - .9 && g <= t + .1)) actor.rightArm.rotation.x = Math.sin(((g / .3) % 1) * Math.PI) * 1.2;
      // a blow: turn to the mob, swing the arm through it
      const blow = !dead && blowsOf[i].find(h => g >= h.t - .6 && g <= h.t + .3);
      if (blow) {
        actor.rotation.y = Math.atan2(-(blow.at[0] - p.x), -(blow.at[2] - p.z));
        const u = (g - (blow.t - .3)) / .4; if (u >= 0 && u <= 1) actor.rightArm.rotation.x = 2.1 * Math.sin(Math.PI * u) - .3 * u;
      }
      // hit: a red flash, knocked back away from what hit it, and the damage over its head
      const hit = !dead && latest(hurtsOf[i], g, HURT_TIME);
      if (hit) {
        const u = (g - hit.t) / HURT_TIME, away = hit.from ? new T.Vector3(p.x - hit.from[0], 0, p.z - hit.from[2]) : new T.Vector3();
        if (away.lengthSq() > 1e-4) away.normalize().multiplyScalar(.55 * bump(u * 1.4));
        actor.position.add(away); actor.position.y += .38 * bump(u * 1.6);
        popups.push([actor.position.clone().add(new T.Vector3(0, 2.6 + u * .5, 0)), `−${+(hit.amount / 2).toFixed(1)} ♥`, '#ff5a52', u]);
      }
      const hurt = !!dead || !!hit;
      if (actor.userData.hurt !== hurt) { tint(actor, hurt ? red : white); actor.userData.hurt = hurt; }
      const key = p.held ?? null;
      if (actor.userData.heldKey !== key) { actor.userData.hand.clear(); if (key !== null) try { actor.userData.hand.add(heldMesh(key)); } catch {} actor.userData.heldKey = key; }
      const armorKey = (p.armor ?? []).filter(Boolean).join(',');
      if (actor.userData.armorKey !== armorKey) { actor.updateArmor(armorSlots(p.armor)); actor.userData.armorKey = armorKey; actor.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
    });
    const k = frameIndex(g), f = frames[k], nf = frames[Math.min(k + 1, frames.length - 1)], u = clamp((g - f.t) / Math.max(.001, nf.t - f.t));
    const next = new Map((nf.a ?? []).map(a => [a[0], a])), seen = new Set();
    for (const [id, type, x, y, z, heading, dim] of f.a ?? []) {
      if (dim !== 'overworld') continue;
      const mob = mobFor(id, type); if (!mob) continue;
      seen.add(id);
      // an arrow: drawn in flight by placeArrows until it lands, then stuck where it came to rest, pointing the way it flew
      if (mob.arrow) {
        const s = shotOfArrow.get(id);
        if (s && g < s.t1) { mob.mesh.visible = false; continue; }
        mob.mesh.visible = true;
        if (s) { mob.mesh.position.set(...s.to); mob.mesh.quaternion.setFromUnitVectors(FORWARD, flight(s, s.t1).dir); }
        else { mob.mesh.position.set(x, y, z); mob.mesh.rotation.set(.5, heading, 0); }
        continue;
      }
      const b = next.get(id) ?? [id, type, x, y, z, heading], d = Math.hypot(b[2] - x, b[4] - z), jump = d > 4;
      mob.mesh.visible = true;
      mob.mesh.position.set(jump ? x : lerp(x, b[2], u), jump ? y : lerp(y, b[3], u), jump ? z : lerp(z, b[4], u));
      mob.mesh.rotation.z = 0;
      if (mob.item) { mob.mesh.rotation.y = g * 2; mob.mesh.position.y += .25 + Math.sin(g * 3) * .08; }
      else {
        mob.mesh.rotation.y = lerpAngle(heading, b[5], u);
        const swing = d > .05 && !jump ? Math.sin(g * 9 + id) * .5 : 0, legs = mob.legs ?? [];
        // Some models keep their legs as something other than meshes (or none): only rotate what can turn.
        const parts = (Array.isArray(legs) ? legs : []).filter(l => l?.rotation);
        if (parts.length === 2) { parts[0].rotation.x = swing; parts[1].rotation.x = -swing; } else parts.forEach((leg, n) => { leg.rotation.x = (n === 0 || n === 3) ? swing : -swing; });
        // an archer drawing: turned to its target, arms up, from 0.7 s before the arrow leaves until just after
        const shot = shotsOfMob.get(id)?.find(s => g >= s.t0 - .7 && g <= s.t0 + .15);
        if (shot) mob.mesh.rotation.y = Math.atan2(shot.to[0] - mob.mesh.position.x, shot.to[2] - mob.mesh.position.z);
        for (const arm of [mob.leftArm, mob.rightArm]) if (arm?.rotation) { arm.userData.rest ??= arm.rotation.x; arm.rotation.x = shot ? -Math.PI / 2 : arm.userData.rest; }
        // a melee mob lunges at the player it hits
        const lunge = meleeOnPlayer.get(id)?.find(h => g >= h.t - .3 && g <= h.t + .15);
        if (lunge) { const to = new T.Vector3(lunge.at[0] - mob.mesh.position.x, 0, lunge.at[2] - mob.mesh.position.z); if (to.lengthSq() > 1e-4) { mob.mesh.rotation.y = Math.atan2(to.x, to.z); mob.mesh.position.addScaledVector(to.normalize(), .45 * bump((g - lunge.t + .3) / .45)); } }
        // hit by a player: red, knocked back away from them, the damage over its head
        const hit = latest(hitsOnMob.get(id) ?? [], g, HURT_TIME);
        tintMob(mob, !!hit);
        if (hit) {
          const v = (g - hit.t) / HURT_TIME, away = new T.Vector3(mob.mesh.position.x - hit.from[0], 0, mob.mesh.position.z - hit.from[2]);
          if (away.lengthSq() > 1e-4) mob.mesh.position.addScaledVector(away.normalize(), .6 * bump(v * 1.4));
          mob.mesh.position.y += .35 * bump(v * 1.6);
          popups.push([mob.mesh.position.clone().add(new T.Vector3(0, 2.4 + v * .5, 0)), `−${+hit.amount.toFixed(1)}`, '#ffe08a', v]);
        }
      }
    }
    // a mob killed: it falls over, red, where it died, then is gone (Minecraft: 20 ticks)
    for (const h of kills) {
      if (g < h.t || g > h.t + 1.1) continue;
      const mob = mobFor(h.mob, h.type); if (!mob) continue;
      if (!seen.has(h.mob)) { mob.mesh.position.set(...h.at); seen.add(h.mob); }
      // turned side-on to its killer and tipped away from them (a model faces +z; a turn about z tips its head to -x)
      const ax = h.at[0] - h.from[0], az = h.at[2] - h.from[2];
      mob.mesh.visible = true; mob.mesh.rotation.y = Math.atan2(az, -ax); mob.mesh.rotation.z = Math.min(1, (g - h.t) * 3) * Math.PI / 2; tintMob(mob, true);
    }
    for (const [id, mob] of mobMeshes) if (mob && !seen.has(id)) mob.mesh.visible = false;
    placeArrows(g);
  }

  // --- day and night: the recording's clock ---
  function lightFor(g) {
    const day = frames[frameIndex(g)].day ?? 6000, t = ((day % 24000) + 24000) % 24000;
    // full day 0-11000, dusk to 13500, night to 22500, dawn to 24000
    const k = t < 11000 ? 1 : t < 13500 ? 1 - (t - 11000) / 2500 : t < 22500 ? 0 : (t - 22500) / 1500;
    const night = 1 - ease(k);
    hemi.intensity = lerp(1.8, .6, night); sun.intensity = lerp(3, .45, night);
    sky.setRGB(lerp(.61, .05, night), lerp(.78, .07, night), lerp(.93, .16, night)); scene.fog.color.copy(sky);
    return { night, day: Math.floor(day / 24000) + 1 };
  }

  // --- cameras ---
  const floorY = (x, z) => { let y = 62; for (let v; y > 1 && ((v = world.getVoxel(Math.floor(x), y, Math.floor(z))) === BLOCKS.AIR || LEAVES.has(v)); y--); return y + 1; };
  const groundAbove = (v) => Math.max(v.y, floorY(v.x, v.z) + 1.5);
  const ground = groundAbove;
  function heading(name, g) {
    const a = centreOf(name, g - 1.2), b = centreOf(name, g + 1.2), d = b.sub(a);
    if (Math.hypot(d.x, d.z) < .8) { const p = playerAt(names.indexOf(name), g); return new T.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); }
    return d.setY(0).normalize();
  }
  const everyone = (g) => names.filter(n => playerAt(names.indexOf(n), g).dim === 'overworld');
  function cameraFor(cam, g, k) {
    // Underground (a cutaway) the lens stays at the player's depth; elsewhere it is kept above the ground.
    const ground = cam.cutaway ? (v) => v.y : groundAbove;
    if (cam.type === 'aerial') {
      const who = cam.who ? [cam.who].flat() : everyone(g);
      const c = cam.at ? new T.Vector3(...cam.at) : who.map(n => centreOf(n, g, 2)).reduce((s, p) => s.add(p), new T.Vector3()).divideScalar(Math.max(1, who.length));
      const ang = (cam.angle ?? 0) + (cam.spin ?? .15) * k;
      return { pos: c.clone().add(new T.Vector3(Math.sin(ang) * (cam.dist ?? 60), cam.height ?? 40, Math.cos(ang) * (cam.dist ?? 60))), look: c, fov: cam.fov ?? 50 };
    }
    if (cam.type === 'follow') {
      const p = centreOf(cam.who, g), h = heading(cam.who, g), side = new T.Vector3(-h.z, 0, h.x).multiplyScalar(cam.side ?? 2.5);
      const pos = p.clone().addScaledVector(h, -(cam.dist ?? 6)).add(side).add(new T.Vector3(0, cam.height ?? 3.2, 0)); pos.y = ground(pos);
      return { pos, look: p.clone().add(new T.Vector3(0, 1.3, 0)).addScaledVector(h, 2), fov: cam.fov ?? 50 };
    }
    if (cam.type === 'duel') {
      // a fight from the side: the player and the mob (cam.mob, its id in the recording) both in frame, the lens off the
      // line between them, so an arrow crosses the screen and the blows land in profile
      const p = centreOf(cam.who, g, .4), m = mobAt(cam.mob, g, .6) ?? p.clone().add(new T.Vector3(2, 0, 0));
      const axis = m.clone().sub(p).setY(0), sep = Math.max(1.5, axis.length()); axis.normalize();
      const side = new T.Vector3(-axis.z, 0, axis.x).multiplyScalar(cam.side ?? 1), mid = p.clone().lerp(m, cam.bias ?? .5);
      // far enough off the line that both fit across the frame (16:9 at 50 degrees: about 80 degrees across)
      const pos = mid.clone().addScaledVector(side, sep * .7 + (cam.dist ?? 3)).addScaledVector(axis, -(cam.back ?? 0)).add(new T.Vector3(0, cam.height ?? 1.6, 0)); pos.y = ground(pos);
      return { pos, look: mid.clone().add(new T.Vector3(0, 1.1, 0)), fov: cam.fov ?? 50 };
    }
    if (cam.type === 'face') {
      // the facing smoothed over two seconds: a bot turns in jerks, and a lens that followed every turn would swing
      // around the player (and into the rock)
      const h = new T.Vector3();
      for (const s of [-1, -.5, 0, .5, 1]) { const q = playerAt(names.indexOf(cam.who), clamp(g + s, 0, frames.at(-1).t)); h.add(new T.Vector3(-Math.sin(q.yaw), 0, -Math.cos(q.yaw))); }
      if (h.lengthSq() < 1e-4) { const q = playerAt(names.indexOf(cam.who), g); h.set(-Math.sin(q.yaw), 0, -Math.cos(q.yaw)); }
      h.normalize();
      const p = centreOf(cam.who, g, .4), side = new T.Vector3(-h.z, 0, h.x).multiplyScalar(cam.side ?? 1.4);
      const pos = p.clone().addScaledVector(h, cam.dist ?? 3.6).add(side).add(new T.Vector3(0, cam.height ?? 1.9, 0)); pos.y = ground(pos);
      return { pos, look: p.clone().add(new T.Vector3(0, 1.45, 0)), fov: cam.fov ?? 40 };
    }
    // a fixed lens, from -> at (a place, like the lava pocket where Corin fell)
    if (cam.from) return { pos: new T.Vector3(...cam.from), look: new T.Vector3(...cam.at), fov: cam.fov ?? 50 };
    // a group: whoever is named (or everyone in the Overworld), framed together
    const who = (cam.who ? [cam.who].flat() : everyone(g)).filter(n => playerAt(names.indexOf(n), g).dim === 'overworld');
    const ps = (who.length ? who : names.slice(0, 1)).map(n => centreOf(n, g));
    const mid = ps.reduce((s, p) => s.add(p), new T.Vector3()).divideScalar(ps.length);
    const spread = Math.min(40, Math.max(5, ...ps.map(p => p.distanceTo(mid) * 2))), far = (cam.dist ?? 6) / 6, ang = (cam.angle ?? .6) + (cam.spin ?? .1) * k;
    const pos = mid.clone().add(new T.Vector3(Math.sin(ang) * spread * 1.1 * far, spread * (cam.rise ?? .35) + 1.2, Math.cos(ang) * spread * 1.1 * far)); pos.y = ground(pos);
    return { pos, look: mid.clone().add(new T.Vector3(0, 1.1, 0)), fov: cam.fov ?? 50 };
  }
  // A shot's lens is chosen once (from other sides, nearer, higher) so its subjects stay in view: the arena film's rule.
  const open = (v) => v === BLOCKS.AIR || v === BLOCKS.WATER || LEAVES.has(v);
  const sightClear = (from, to) => { const d = from.distanceTo(to), dir = to.clone().sub(from).normalize(); for (let s = .2; s < d - .7; s += .3) { const p = from.clone().addScaledVector(dir, s); if (!open(world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))) return false; } return true; };
  const subjectsOf = (cam, g) => cam.type === 'aerial' ? [] : (cam.who ? [cam.who].flat() : everyone(g));
  const adjust = (cam, { distK, rise }) => ({ ...cam, dist: (cam.dist ?? (cam.type === 'face' ? 3.6 : 6)) * distK, height: (cam.height ?? (cam.type === 'face' ? 1.9 : 3.2)) * rise, rise: (cam.rise ?? .35) * rise });
  function lens(sc, opt, g, k) {
    const c = cameraFor(adjust(sc.cam, opt), g, k);
    if (opt.orbit) { const r = c.pos.clone().sub(c.look).applyAxisAngle(new T.Vector3(0, 1, 0), opt.orbit); c.pos = c.look.clone().add(r); c.pos.y = ground(c.pos); }
    return c;
  }
  const shotSetup = new Map();
  // A player under a rock roof (a tunnel, a cave, a pit dug into the hill) cannot be seen from the open air: the
  // shot becomes a cutaway, which keeps the lens at the player's depth and cuts the rock in between.
  const roofed = (p) => { for (let dy = 2; dy <= 10; dy++) { const v = world.getVoxel(Math.floor(p.x), Math.floor(p.y) + dy, Math.floor(p.z)); if (v !== BLOCKS.AIR && v !== BLOCKS.WATER && !LEAVES.has(v)) return true; } return false; };
  function undergroundShot(sc) {
    for (let i = 0; i <= 4; i++) {
      const g = sc.g[0] + (sc.g[1] - sc.g[0]) * i / 4;
      const who = subjectsOf(sc.cam, g);
      if (!who.length) continue;
      const p0 = playerAt(names.indexOf(who[0]), g);
      ensureArea(p0.x, p0.z); syncWorld(g, []);
      if (who.some(n => roofed(playerAt(names.indexOf(n), g)))) return true;
    }
    return false;
  }
  function setupFor(sc) {
    if (shotSetup.has(sc)) return shotSetup.get(sc);
    if (!sc.cam.cutaway && sc.cam.type !== 'aerial' && !sc.cam.from && undergroundShot(sc)) sc.cam = { ...sc.cam, cutaway: true };
    const options = [];
    for (const distK of [1, .7, 1.4]) for (const rise of [1, 1.8, 3]) for (const orbit of [0, .6, -.6, 1.2, -1.2, 2, -2, Math.PI]) options.push({ distK, rise, orbit });
    let best = options[0], bestBlocked = Infinity;
    // An aerial or a cutaway keeps its scripted lens (a cutaway cuts its own view clear).
    for (const opt of sc.cam.type === 'aerial' || sc.cam.cutaway ? [options[0]] : options) {
      let blocked = 0;
      for (let i = 0; i <= 4 && blocked < bestBlocked; i++) {
        const k = i / 4, g = sc.g[0] + (sc.g[1] - sc.g[0]) * k, c = lens(sc, opt, g, k);
        ensureArea(c.look.x, c.look.z); syncWorld(g, []);
        // the lens itself in open air (leaves count as open only for sight lines, which the trims clear)
        const here = world.getVoxel(Math.floor(c.pos.x), Math.floor(c.pos.y), Math.floor(c.pos.z));
        if (here !== BLOCKS.AIR && here !== BLOCKS.WATER) { blocked += 2; continue; }
        for (const n of subjectsOf(sc.cam, g)) { const p = playerAt(names.indexOf(n), g); if (!sightClear(c.pos, new T.Vector3(p.x, p.y + 1.4, p.z))) blocked++; }
      }
      if (blocked < bestBlocked) { best = opt; bestBlocked = blocked; }
      if (!blocked) break;
    }
    // No lens sees its players clearly: cut the view open (a cutaway) rather than show a wall of stone.
    if (bestBlocked > 0 && sc.cam.type !== 'aerial' && !sc.cam.cutaway) sc.cam = { ...sc.cam, cutaway: true };
    best = { ...best, blocked: bestBlocked, trims: trimsFor(sc, best) }; shotSetup.set(sc, best);
    return best;
  }
  // The leaves on every line from the lens to its players (and a little either side), and around the lens itself.
  function trimsFor(sc, opt) {
    const cut = !!sc.cam.cutaway;
    const cells = new Map(), add = (x, y, z, any = false) => { const key = x + ',' + y + ',' + z, v = world.getVoxel(x, y, z); if (!cells.has(key) && (LEAVES.has(v) || (any && CUTTABLE(v)))) cells.set(key, [x, y, z, any]); };
    // at least twice per game second: a fast shot (a player running through a cave) otherwise outruns its cuts
    const steps = Math.max(16, Math.ceil((sc.g[1] - sc.g[0]) * 2));
    for (let i = 0; i <= steps; i++) {
      const k = i / steps, g = sc.g[0] + (sc.g[1] - sc.g[0]) * k, c = lens(sc, opt, g, k);
      const feet = Math.min(...subjectsOf(sc.cam, g).map(n => Math.floor(playerAt(names.indexOf(n), g).y)), Infinity);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) add(Math.floor(c.pos.x) + dx, Math.floor(c.pos.y) + dy, Math.floor(c.pos.z) + dz, cut);
      // a cutaway clears what stands on the lines to the player (and an open pocket around them), not the floor
      if (cut) for (const n of subjectsOf(sc.cam, g)) { const p = playerAt(names.indexOf(n), g); for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) if (dx || dz || dy) add(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz, true); }
      const targets = subjectsOf(sc.cam, g).map(n => playerAt(names.indexOf(n), g)).flatMap(p => [new T.Vector3(p.x, p.y + .4, p.z), new T.Vector3(p.x, p.y + 1.2, p.z), new T.Vector3(p.x, p.y + 2.1, p.z)]);
      if (!targets.length && sc.cam.type !== 'aerial') targets.push(c.look);
      for (const to of targets) {
        const d = c.pos.distanceTo(to), dir = to.clone().sub(c.pos).normalize(), side = new T.Vector3(-dir.z, 0, dir.x).normalize();
        for (let s = 0; s < d - .3; s += .3) for (const o of [-.7, 0, .7]) { const p = c.pos.clone().addScaledVector(dir, s).addScaledVector(side, o); add(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), cut && Math.floor(p.y) >= feet); }
      }
    }
    return [...cells.values()];
  }

  // --- the 2D layer ---
  const canvas = document.createElement('canvas'); canvas.width = OUT.width; canvas.height = OUT.height;
  const ink = canvas.getContext('2d', { alpha: false }); ink.setTransform(OUT.width / 1280, 0, 0, OUT.height / 720, 0, 0);
  document.querySelector('#stage').replaceChildren(canvas);
  await document.fonts.ready;
  const text = (s, x, y, font, color = '#f5f1e6', align = 'left', blur = 6) => { ink.font = font; ink.textAlign = align; ink.fillStyle = color; ink.shadowColor = 'rgba(0,0,0,.8)'; ink.shadowBlur = blur; ink.fillText(s, x, y); ink.shadowBlur = 0; };
  const wrapLines = (s, font, width) => { ink.font = font; const out = []; let line = ''; for (const w of String(s).split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (ink.measureText(t).width > width && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };
  const clock = (g) => `${Math.floor(g / 60)}:${String(Math.floor(g % 60)).padStart(2, '0')}`;
  const roundedBox = (x, y, w, h, r, fill) => { ink.beginPath(); ink.roundRect(x, y, w, h, r); ink.fillStyle = fill; ink.fill(); };
  const TAGS = { LIVE: '#e5322d', REPLAY: '#f2b705', HIGHLIGHTS: '#f2b705', 'PRE-GAME': '#3d8bfd', 'FULL TIME': '#e5322d', 'TIME-LAPSE': '#3d8bfd' };
  const milestones = rec.events.filter(e => e.kind === 'advancement');

  function hud(g, sc, t, light) {
    if (sc.card) return;
    const tag = sc.tag ?? 'LIVE', color = TAGS[tag] ?? '#e5322d';
    ink.font = 'bold 16px Arial'; const tw = ink.measureText(tag).width + (tag === 'LIVE' ? 40 : 26);
    roundedBox(28, 50, tw, 30, 5, color);
    if (tag === 'LIVE') { ink.fillStyle = (t * 1.6) % 1 < .6 ? '#ffffff' : 'rgba(255,255,255,.35)'; ink.beginPath(); ink.arc(44, 65, 5, 0, Math.PI * 2); ink.fill(); }
    text(tag, tag === 'LIVE' ? 56 : 41, 71, 'bold 16px Arial', tag === 'REPLAY' || tag === 'HIGHLIGHTS' ? '#14110a' : '#ffffff', 'left', 0);
    if (sc.speed > 1.5) text('▶▶ ' + Math.round(sc.speed) + '×', 28 + tw + 12, 71, 'bold 14px Arial', '#ffffff');
    if (tag === 'REPLAY' || tag === 'HIGHLIGHTS') text('SLOW MOTION', 28 + tw + 12, 71, 'bold 14px Arial', '#ffe7a3');
    if (tag === 'HIGHLIGHTS') return;
    // the clock: game time, the in-game day, and the goal
    const x = 640 - 200, y = 46;
    roundedBox(x, y, 400, 44, 6, 'rgba(8,10,16,.82)');
    text('MISSION: DEFEAT THE ENDER DRAGON', 640, y + 17, 'bold 12px Arial', '#bcd8ff', 'center', 0);
    text(`${clock(g)}   ·   DAY ${light.day} ${light.night > .5 ? '☾' : '☀'}`, 640, y + 37, 'bold 18px Arial', '#ffffff', 'center', 0);
    // the roster: health, food and what each holds
    const rx = 1280 - 24 - 230, ry = 100;
    roundedBox(rx, ry, 230, 30 + names.length * 34, 6, 'rgba(8,10,16,.62)');
    text('THE TEAM', rx + 14, ry + 20, 'bold 13px Arial', '#ffe7a3');
    names.forEach((name, i) => {
      const p = playerAt(i, g), kit = kitOf[name], yy = ry + 44 + i * 34, dead = deadAt(name, g);
      ink.fillStyle = kit.shirt; ink.fillRect(rx + 10, yy - 12, 4, 26);
      text(dead ? '✕ ' + name : name, rx + 22, yy, 'bold 13px Arial', dead ? '#8a8a90' : '#f2f2f2', 'left', 0);
      ink.fillStyle = 'rgba(255,255,255,.12)'; ink.fillRect(rx + 92, yy - 9, 70, 7); ink.fillRect(rx + 92, yy + 1, 70, 4);
      if (!dead) { ink.fillStyle = p.hp > 12 ? '#52d273' : p.hp > 6 ? '#f2c94c' : '#ef5350'; ink.fillRect(rx + 92, yy - 9, 70 * clamp(p.hp / 20), 7); ink.fillStyle = '#c98a3c'; ink.fillRect(rx + 92, yy + 1, 70 * clamp((p.food ?? 20) / 20), 4); }
      const held = String(p.held ?? '').replace(/_/g, ' ');
      text(p.dim !== 'overworld' ? (p.dim === 'the_nether' || p.dim === 'nether' ? 'NETHER' : 'THE END') : held.slice(0, 13), rx + 168, yy, '10px Arial', '#c9c4b5', 'left', 0);
    });
    // milestones reached so far
    const got = milestones.filter(m => m.t <= g);
    if (got.length) {
      const my = ry + 40 + names.length * 34;
      roundedBox(rx, my, 230, 26 + Math.min(6, got.length) * 18, 6, 'rgba(8,10,16,.55)');
      text('MILESTONES', rx + 14, my + 18, 'bold 12px Arial', '#ffe7a3');
      got.slice(-6).forEach((m, i) => text(`★ ${m.title}  ·  ${m.player}`, rx + 14, my + 38 + i * 18, '11px Arial', '#f2efe8', 'left', 0));
    }
    // a new milestone or a death, as it happens on a live shot
    // Banners queue: each starts (in film time) when it happens or when the one before it is done, whichever is later.
    let free = -Infinity;
    if (tag === 'LIVE') for (const e of [...milestones, ...deaths].filter(e => e.t >= sc.g[0] && e.t <= sc.g[1]).sort((a, b) => a.t - b.t)) {
      const at = Math.max(sc.start + (e.t - sc.g[0]) / Math.max(sc.speed, .05), free); free = at + 2.4;
      const since = t - at; if (since < 0 || since > 2.4) continue;
      const slide = ease(clamp(since / .25)), out = clamp((2.4 - since) / .3), w = 560, bx = 640 - w / 2 + (1 - slide) * -80, by = 128;
      ink.globalAlpha = Math.min(slide, out);
      const death = e.kind === 'death', kit = kitOf[e.player] ?? KIT[0];
      roundedBox(bx, by, w, 88, 8, 'rgba(8,10,16,.88)'); ink.fillStyle = death ? '#8c1f1f' : kit.shirt; ink.fillRect(bx, by, w, 26);
      text(death ? 'DOWN!' : 'MILESTONE', bx + w / 2, by + 19, 'bold 16px Arial', '#ffffff', 'center', 0);
      text(death ? (e.message ?? `${e.player} died`) : `${e.player}: ${e.title}`, bx + w / 2, by + 62, 'bold 26px Arial', '#ffffff', 'center');
      ink.globalAlpha = 1;
    }
  }

  function caption(c, t) {
    const a = Math.min(1, (t - c.start) / .2, (c.end - t) / .3);
    if (a <= 0) return;
    ink.globalAlpha = a;
    if (c.kind === 'narrator') {
      const big = /!$/.test(c.text) && c.who === 'pbp', font = (big ? 'bold 27px' : 'bold 23px') + ' Arial', lines = wrapLines(c.text, font, 1000);
      const lh = big ? 34 : 30, y = 668 - lines.length * lh;
      const grad = ink.createLinearGradient(0, y - 30, 0, 690); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.75)'); ink.fillStyle = grad; ink.fillRect(0, y - 30, 1280, 690 - y + 30);
      lines.forEach((l, i) => text(l, 640, y + lh - 6 + i * lh, font, c.who === 'color' ? '#ffe7a3' : '#ffffff', 'center', 8));
    } else {
      // an agent's own words: what it told itself (its working notes between actions), its team (chat), or the
      // team's shared memory (a file every player reads)
      const kit = kitOf[c.who] ?? KIT[0];
      const label = c.who.toUpperCase() + '  ·  ' + ({ chat: 'TEAM CHAT', thought: 'THINKING OUT LOUD', note: 'SHARED NOTES', code: 'WRITING CODE' }[c.kind] ?? c.kind.toUpperCase());
      const shown = c.kind === 'thought' || c.kind === 'code' ? c.text.slice(0, Math.max(1, Math.floor((t - c.start) * 80))) : c.text;
      const font = c.kind === 'code' ? '15px monospace' : (c.kind === 'thought' ? 'italic ' : '') + '18px Arial', lh = c.kind === 'code' ? 20 : 24;
      const lines = (c.kind === 'code' ? shown.split('\n').flatMap(l => wrapLines(l || ' ', font, 600)) : wrapLines(shown, font, 600)).slice(0, c.kind === 'code' ? 9 : 6);
      const x = c.side === 'right' ? 1280 - 40 - 650 : 40, y = 430 - lines.length * 12;
      roundedBox(x, y, 650, 46 + lines.length * lh, 8, 'rgba(10,12,18,.84)');
      ink.fillStyle = kit.shirt; ink.fillRect(x, y, 6, 46 + lines.length * lh);
      text(label, x + 20, y + 26, 'bold 14px Arial', kit.ink, 'left', 0);
      lines.forEach((l, i) => text(l, x + 20, y + 52 + i * lh, font, c.kind === 'code' ? '#b8f5c8' : '#f2efe8', 'left', 0));
    }
    ink.globalAlpha = 1;
  }

  function card(sc, t) {
    const k = (t - sc.start) / sc.dur, a = Math.min(1, k * 6, (1 - k) * 8), c = sc.card;
    ink.fillStyle = 'rgba(6,8,12,' + (.62 * a) + ')'; ink.fillRect(0, 0, 1280, 720);
    ink.globalAlpha = a;
    text(c.title, 640, c.lineup ? 140 : 190, 'italic bold 60px Arial', '#ffffff', 'center', 16);
    if (c.sub) wrapLines(c.sub, 'bold 20px Arial', 980).forEach((l, i) => text(l, 640, (c.lineup ? 180 : 232) + i * 28, 'bold 20px Arial', '#e7dcc4', 'center', 8));
    if (c.lineup) names.forEach((name, n) => {
      const kit = kitOf[name], on = clamp((t - sc.start - .8 - n * .45) / .3), x = 150 + n * 255, y = 270;
      ink.globalAlpha = a * on;
      roundedBox(x, y, 220, 250, 10, 'rgba(8,10,16,.82)'); ink.fillStyle = kit.shirt; ink.fillRect(x, y, 220, 50);
      text(name.toUpperCase(), x + 110, y + 34, 'italic bold 28px Arial', '#ffffff', 'center', 0);
      text('CLAUDE AGENT', x + 110, y + 80, 'bold 13px Arial', kit.ink, 'center', 0);
      (c.roles?.[name] ?? []).forEach((l, i) => wrapLines(l, '15px Arial', 190).forEach((w, j) => text(w, x + 110, y + 112 + i * 44 + j * 18, '15px Arial', '#f2efe8', 'center', 0)));
      ink.globalAlpha = a;
    });
    if (c.stats) c.stats.forEach((l, i) => { ink.globalAlpha = a * clamp((t - sc.start - 1 - i * .45) / .3); text(l, 640, 300 + i * 38, (i ? '' : 'bold ') + (i ? '22px' : '26px') + ' Arial', i ? '#f2efe8' : '#ffe7a3', 'center', 8); ink.globalAlpha = a; });
    ink.globalAlpha = 1;
  }
  function wipe(sc, t) {
    if (sc.tag !== 'REPLAY') return;
    for (const edge of [sc.start, sc.start + sc.dur]) {
      const u = (t - edge + .3) / .6; if (u < 0 || u > 1) continue;
      ink.save(); ink.translate(-500 + u * 2300, 360); ink.rotate(-.18);
      ink.fillStyle = '#f2b705'; ink.fillRect(-260, -600, 520, 1200); ink.fillStyle = '#14110a'; ink.fillRect(-270, -600, 14, 1200); ink.fillRect(256, -600, 14, 1200);
      ink.rotate(.18); text('REPLAY', 0, 16, 'italic bold 52px Arial', '#14110a', 'center', 0); ink.restore();
    }
  }

  let currentShot = null;
  // Every frame, the rock still standing between the lens and the shot's players is cut (the shot's planned cuts are
  // made at sample times, and players move between them). Underground (a cutaway): any rock at or above their feet,
  // and the cells they occupy; in the open: only a line that is actually blocked. Never the floor under them, lava,
  // water or bedrock. Cuts join the shot's trims, so they are put back with them.
  function clearView(sc, c, g) {
    if (sc.card || sc.cam.type === 'aerial') return;
    let added = 0;
    const cut = (x, y, z) => { const v = world.getVoxel(x, y, z); if (!CUTTABLE(v)) return; trimmed.push([x, y, z, v, true]); setBlock(x, y, z, BLOCKS.AIR); added++; };
    // a lens that ended up inside a block (a trunk, a hillside) sees only that block
    if (!open(world.getVoxel(Math.floor(c.pos.x), Math.floor(c.pos.y), Math.floor(c.pos.z)))) for (const dy of [0, 1]) cut(Math.floor(c.pos.x), Math.floor(c.pos.y) + dy, Math.floor(c.pos.z));
    for (const n of subjectsOf(sc.cam, g)) {
      const i = names.indexOf(n), p = playerAt(i, g);
      if (p.dim !== 'overworld' || !actors[i].visible) continue;
      const feet = Math.floor(p.y), head = new T.Vector3(p.x, p.y + 1.5, p.z);
      if (!sc.cam.cutaway && sightClear(c.pos, head)) continue;
      if (sc.cam.cutaway) for (const dy of [0, 1]) cut(Math.floor(p.x), feet + dy, Math.floor(p.z));
      for (const hy of [.5, 1.2, 1.6]) {
        const to = new T.Vector3(p.x, p.y + hy, p.z), d = c.pos.distanceTo(to), dir = to.clone().sub(c.pos).normalize();
        for (let s = 0; s < d - .3; s += .25) { const q = c.pos.clone().addScaledVector(dir, s), y = Math.floor(q.y); if (y >= feet) cut(Math.floor(q.x), y, Math.floor(q.z)); }
      }
    }
    // a duel's mob is a subject too: the rock between the lens and it is cut the same way (only when it is hidden)
    const m = sc.cam.type === 'duel' && mobMeshes.get(sc.cam.mob);
    if (m?.mesh?.visible) {
      const mp = m.mesh.position, feet = Math.floor(mp.y);
      if (sc.cam.cutaway || !sightClear(c.pos, new T.Vector3(mp.x, mp.y + 1.4, mp.z))) for (const hy of [.6, 1.4]) {
        const to = new T.Vector3(mp.x, mp.y + hy, mp.z), d = c.pos.distanceTo(to), dir = to.clone().sub(c.pos).normalize();
        for (let s = 0; s < d - .4; s += .25) { const q = c.pos.clone().addScaledVector(dir, s), y = Math.floor(q.y); if (y >= feet) cut(Math.floor(q.x), y, Math.floor(q.z)); }
      }
    }
    if (added) { world.light.update(20000); for (const key of dirty) meshChunk(key); dirty.clear(); }
  }
  let lastView = null;
  /** Continuity check for scripts/render-film.mjs: the lens or a shot's player inside a block, or a player the lens
      cannot see (a wall of stone between them), as the frame is actually drawn (trims and cutaways applied). */
  function check(t) {
    renderFrame(t);
    const { sc, g, c } = lastView, issues = [];
    if (sc.card) return { issues };
    if (!open(world.getVoxel(Math.floor(c.pos.x), Math.floor(c.pos.y), Math.floor(c.pos.z)))) issues.push(`${sc.name}: lens inside a block`);
    for (const n of subjectsOf(sc.cam, g)) {
      const i = names.indexOf(n), p = playerAt(i, g);
      if (p.dim !== 'overworld' || !actors[i].visible) continue;
      const head = new T.Vector3(p.x, p.y + 1.5, p.z);
      if (!open(world.getVoxel(Math.floor(head.x), Math.floor(head.y), Math.floor(head.z)))) issues.push(`${sc.name}: ${n} inside a block`);
      else if (!sightClear(c.pos, head)) issues.push(`${sc.name}: ${n} hidden behind blocks`);
    }
    const m = sc.cam.type === 'duel' && mobMeshes.get(sc.cam.mob);
    if (m?.mesh?.visible && !sightClear(c.pos, m.mesh.position.clone().add(new T.Vector3(0, 1.2, 0)))) issues.push(`${sc.name}: the ${sc.cam.mob} mob hidden behind blocks`);
    return { issues };
  }
  function renderFrame(t) {
    t = clamp(t, 0, story.duration);
    const sc = story.scenes.findLast(s => t >= s.start) ?? story.scenes[0];
    const k = clamp((t - sc.start) / sc.dur), g = clamp(sc.g[0] + (sc.g[1] - sc.g[0]) * (sc.ease ? ease(k) : k), 0, frames.at(-1).t);
    const setup = setupFor(sc);
    const c = lens(sc, setup, g, k);
    ensureArea(c.look.x, c.look.z);
    if (currentShot !== sc) { syncWorld(g, setup.trims); currentShot = sc; } else syncWorld(g);
    placeActors(g);
    clearView(sc, c, g);
    lastView = { sc, g, c };
    const light = lightFor(g);
    camera.position.copy(c.pos); camera.lookAt(c.look); camera.fov = c.fov; camera.updateProjectionMatrix();
    // a close shot shakes when its player is hit (the lens is not moved for the cuts: only the drawn view)
    if (['face', 'duel'].includes(sc.cam.type) && sc.cam.who) {
      const i = names.indexOf(sc.cam.who), h = i >= 0 && latest(hurtsOf[i], g, .3);
      if (h) { const a = .07 * (1 - (g - h.t) / .3); camera.position.add(new T.Vector3(Math.sin(g * 97) * a, Math.sin(g * 71 + 1) * a, Math.sin(g * 83 + 2) * a)); }
    }
    sun.position.copy(c.look).add(new T.Vector3(40, 70, 25)); sun.target.position.copy(c.look); sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
    ink.filter = sc.tag === 'REPLAY' || sc.tag === 'HIGHLIGHTS' ? 'saturate(.72) contrast(1.08) brightness(1.04)' : 'none';
    ink.drawImage(renderer.domElement, 0, 0, 1280, 720); ink.filter = 'none';
    const vg = ink.createRadialGradient(640, 380, 300, 640, 380, 820); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); ink.fillStyle = vg; ink.fillRect(0, 0, 1280, 720);
    // damage numbers over the players and mobs hit, near the lens only
    if (!sc.card && sc.cam.type !== 'aerial') for (const [at, label, color, age] of popups) {
      if (at.distanceTo(camera.position) > 24) continue;
      const v = at.clone().project(camera); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      ink.globalAlpha = clamp((1 - age) * 3); text(label, (v.x + 1) / 2 * 1280, (1 - v.y) / 2 * 720, 'bold 24px Arial', color, 'center', 8); ink.globalAlpha = 1;
    }
    hud(g, sc, t, light);
    if (sc.card) card(sc, t);
    // (a commentator's subtitle stays a moment after the line; the next line's replaces it rather than overlap it)
    const latestCall = story.captions.filter(c => c.kind === 'narrator' && t >= c.start && t < c.end).sort((a, b) => b.start - a.start)[0];
    for (const cap of story.captions) if (t >= cap.start && t < cap.end && (cap.kind !== 'narrator' || cap === latestCall)) caption(cap, t);
    for (const s of story.scenes) wipe(s, t);
    ink.fillStyle = '#07090c'; ink.fillRect(0, 0, 1280, 36); ink.fillRect(0, 684, 1280, 36);
    const leftBanner = RUN.startsWith('hz-') ? 'HORIZON 26.3  ·  THE AGENT EXPEDITION' : 'BLOCKYLAND  ·  THE AGENT EXPEDITION';
    const rightBanner = RUN.includes('gemini') ? '4 GEMINI 3.8 FLASH AGENTS  ·  REPLAY STUDIO' : '4 CLAUDE AGENTS  ·  ONE WORLD  ·  ONE DRAGON';
    text(leftBanner, 30, 24, 'bold 11px Arial', '#c8c2b2'); text(rightBanner, 1250, 24, 'bold 11px Arial', '#c8c2b2', 'right');
    const fade = Math.max(1 - ease(t / .8), ease((t - story.duration + 1.5) / 1.5)); if (fade > 0) { ink.fillStyle = `rgba(0,0,0,${fade})`; ink.fillRect(0, 0, 1280, 720); }
    const seek = document.querySelector('#seek'); if (seek) seek.value = t;
    const time = document.querySelector('#time'); if (time) time.textContent = `${clock(t)} / ${clock(story.duration)}`;
    const label = document.querySelector('#shot'); if (label) label.textContent = sc.name;
    return { time: t, shot: sc.name, game: +g.toFixed(1), blocked: setup.blocked, chunks: meshed.size };
  }

  // --- sound: a broadcast bed (score and crowd), a stinger on each milestone, the commentary on top ---
  async function soundtrack() {
    const rate = 48000, ctx = new OfflineAudioContext(2, Math.ceil(story.duration * rate), rate);
    const master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
    const bed = ctx.createGain(); bed.connect(master);
    const music = ctx.createGain(); music.gain.value = .8; music.connect(bed);
    const noise = ctx.createBuffer(1, rate * 3, rate), nd = noise.getChannelData(0);
    for (let i = 0, b0 = 0, b1 = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b0 = .99 * b0 + w * .1; b1 = .9 * b1 + w * .3; nd[i] = (b0 + b1 + w * .2) * .5; }
    const noiseAt = (at, dur, { type = 'bandpass', freq = 900, q = .7, gain = .3, attack = .01, out = bed } = {}) => {
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
      const env = ctx.createGain(); env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + attack); env.gain.exponentialRampToValueAtTime(.001, at + dur);
      s.connect(flt); flt.connect(env); env.connect(out); s.start(at, Math.random() * 2); s.stop(at + dur + .05); return { flt, env };
    };
    const tone = (at, freq, dur, { type = 'sine', gain = .2, to = null, out = bed } = {}) => {
      const o = ctx.createOscillator(), env = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, at); if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + .01); env.gain.exponentialRampToValueAtTime(.001, at + dur); o.connect(env); env.connect(out); o.start(at); o.stop(at + dur + .05);
    };
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bar = 2, hz = m => 440 * 2 ** ((m - 69) / 12);
    for (let start = 0, n = 0; start < story.duration; start += bar, n++) {
      const sc = story.scenes.findLast(s => start >= s.start) ?? story.scenes[0], mood = sc.mood ?? 'calm';
      const level = { calm: .06, tense: .08, battle: .1, victory: .1 }[mood] ?? .06;
      for (const note of chords[n % 4]) tone(start, hz(note - (mood === 'victory' ? 0 : 12)), bar, { type: mood === 'battle' ? 'sawtooth' : 'triangle', gain: level / 3, out: music });
      tone(start, hz(chords[n % 4][0] - 24), bar * .9, { type: 'square', gain: level * .5, out: music });
      const beats = mood === 'calm' ? 4 : 8;
      for (let b = 0; b < beats; b++) { const at = start + b * bar / beats; tone(at, 130, .2, { gain: mood === 'battle' ? .4 : .26, to: 42, out: music }); if (b % 2 && mood !== 'calm') noiseAt(at, .08, { type: 'highpass', freq: 6000, gain: .05, out: music }); }
    }
    for (const sc of story.scenes) { const level = sc.card ? .05 : ({ calm: .05, tense: .07, battle: .1, victory: .18 }[sc.mood] ?? .05); const { env } = noiseAt(sc.start, sc.dur + .3, { freq: 700, q: .5, gain: level, attack: .4 }); env.gain.setValueAtTime(level, sc.start + sc.dur - .2); }
    for (const sc of story.scenes) {
      if (sc.tag !== 'LIVE') continue;
      const at = (gt) => sc.start + (gt - sc.g[0]) / Math.max(sc.speed, .05);
      for (const m of milestones) if (m.t >= sc.g[0] && m.t <= sc.g[1]) { const t = at(m.t); for (const [f, d] of [[523, 0], [659, .09], [784, .18]]) tone(t + d, f, .5, { type: 'triangle', gain: .14, out: master }); noiseAt(t, 2.4, { freq: 1100, q: .4, gain: .3, attack: .2 }); }
      for (const d of deaths) if (d.t >= sc.g[0] && d.t <= sc.g[1]) { const t = at(d.t); tone(t, 70, .6, { gain: .6, to: 30, out: master }); noiseAt(t, 2.4, { freq: 500, q: .4, gain: .3, attack: .2 }); }
    }
    // the fight, for the shot's own players (and a duel's mob): the bow, the arrow landing, the blow, the hit taken
    const sfx = ctx.createGain(); sfx.gain.value = .9; sfx.connect(master);
    for (const sc of story.scenes) {
      if (sc.card || !['LIVE', 'REPLAY', 'HIGHLIGHTS'].includes(sc.tag) || sc.cam.type === 'aerial') continue;
      const speed = (sc.g[1] - sc.g[0]) / sc.dur; if (speed > 1.6) continue;
      const at = (gt) => sc.start + (gt - sc.g[0]) / Math.max(speed, .05), inShot = (gt) => gt >= sc.g[0] && gt <= sc.g[1];
      const who = new Set(sc.cam.who ? [sc.cam.who].flat() : names), foe = sc.cam.type === 'duel' ? sc.cam.mob : null;
      for (const s of shotsByT0) {
        if (s.t1 < sc.g[0] || s.t0 > sc.g[1] || !(who.has(s.hit) || s.mob === foe)) continue;
        if (inShot(s.t0)) { tone(at(s.t0), 340, .2, { type: 'triangle', gain: .13, to: 170, out: sfx }); noiseAt(at(s.t0), .09, { freq: 2600, q: 1.2, gain: .1, out: sfx }); }
        if (inShot(s.t1) && !s.hit) { noiseAt(at(s.t1), .06, { freq: 1500, q: 2, gain: .14, out: sfx }); tone(at(s.t1), 170, .09, { gain: .14, to: 90, out: sfx }); }
      }
      for (const h of combat.hurts) if (inShot(h.t) && who.has(h.player)) { tone(at(h.t), 240, .18, { type: 'square', gain: .1, to: 140, out: sfx }); noiseAt(at(h.t), .12, { freq: 700, q: .8, gain: .2, out: sfx }); }
      for (const h of combat.hits) if (inShot(h.t) && (who.has(h.player) || h.mob === foe)) {
        tone(at(h.t), 130, .12, { gain: .32, to: 55, out: sfx }); noiseAt(at(h.t), .09, { freq: 1300, q: 1, gain: .2, out: sfx });
        if (h.killed) { noiseAt(at(h.t) + .9, .3, { freq: 900, q: .5, gain: .18, attack: .05, out: sfx }); for (const [f, d] of [[392, 0], [523, .1]]) tone(at(h.t) + .1 + d, f, .35, { type: 'triangle', gain: .12, out: sfx }); }
      }
    }
    for (const sc of story.scenes) if (sc.tag === 'REPLAY') for (const at of [sc.start - .3, sc.start + sc.dur - .3]) { const s = noiseAt(at, .6, { freq: 400, q: 1.5, gain: .25, attack: .25, out: master }); s.flt.frequency.exponentialRampToValueAtTime(4000, at + .55); }
    const report = [];
    for (const line of story.narration) {
      const clip = narration?.clips?.[line.id];
      if (!clip) { report.push({ id: line.id, missing: true }); continue; }
      const buffer = await ctx.decodeAudioData(await (await fetch(base + '/narration/' + clip.file)).arrayBuffer());
      const s = ctx.createBufferSource(); s.buffer = buffer; const gn = ctx.createGain(); gn.gain.value = 1.15; s.connect(gn); gn.connect(master); s.start(line.start);
      bed.gain.setValueAtTime(1, Math.max(0, line.start - .2)); bed.gain.linearRampToValueAtTime(.5, line.start); bed.gain.setValueAtTime(.5, line.start + buffer.duration); bed.gain.linearRampToValueAtTime(1, line.start + buffer.duration + .4);
      report.push({ id: line.id, who: line.who, start: line.start, duration: +buffer.duration.toFixed(2) });
    }
    return { buffer: await ctx.startRendering(), report };
  }
  function wavBase64(buffer) {
    const ch = buffer.numberOfChannels, len = buffer.length, out = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, buffer.sampleRate, true); out.setUint32(28, buffer.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
    const data = [...Array(ch)].map((_, c) => buffer.getChannelData(c));
    for (let i = 0, o = 44; i < len; i++) for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, clamp(data[c][i], -1, 1) * 32767, true);
    const bytes = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(bin);
  }

  // --- the page ---
  let pendingAudio, playing = false, position = 0, source, startedAt, actx;
  const buildAudio = () => pendingAudio ??= soundtrack().then(r => { window.pilot.audioReport = r.report; return r.buffer; });
  const play = document.querySelector('#play'), restart = document.querySelector('#restart'), seekBar = document.querySelector('#seek');
  if (seekBar) seekBar.max = story.duration;
  const stop = () => { playing = false; source?.stop(); source = null; if (play) play.textContent = 'Play film'; };
  async function start() { if (position >= story.duration) position = 0; const data = await buildAudio(); actx ??= new AudioContext(); await actx.resume(); source = actx.createBufferSource(); source.buffer = data; source.connect(actx.destination); source.start(0, position); startedAt = performance.now() / 1000 - position; playing = true; play.textContent = 'Pause'; }
  function tick() { if (playing) { position = Math.min(story.duration, performance.now() / 1000 - startedAt); renderFrame(position); if (position >= story.duration) stop(); } requestAnimationFrame(tick); }
  if (play) { play.disabled = restart.disabled = false; play.onclick = () => playing ? stop() : start(); restart.onclick = () => { stop(); position = 0; renderFrame(0); }; seekBar.oninput = e => { stop(); position = Number(e.target.value); renderFrame(position); }; }
  window.pilot = {
    ready: true, story, renderFrame, check, buildAudio, async wavBase64() { return wavBase64(await buildAudio()); },
    /** Where things stand in the frame at film time t: the lens, the players and the visible mobs (for checking shots). */
    where(t) {
      renderFrame(t); const r = (v) => [v.x, v.y, v.z].map(n => +n.toFixed(1));
      return { lens: r(camera.position), look: r(lastView.c.look), players: Object.fromEntries(names.map((n, i) => [n, actors[i].visible ? [...r(actors[i].position), +actors[i].rotation.y.toFixed(2)] : null])),
        mobs: [...mobMeshes].filter(([, m]) => m?.mesh?.visible && !m.arrow && !m.item && m.mesh.position.distanceTo(camera.position) < 20).map(([id, m]) => [id, m.type, ...r(m.mesh.position), +m.mesh.rotation.y.toFixed(2)]) };
    },
    capture(t) { renderFrame(t); return canvas.toDataURL('image/jpeg', .95).split(',')[1]; },
    poster(t) { renderFrame(t); return canvas.toDataURL('image/png').split(',')[1]; },
  };
  renderFrame(story.posterTime ?? 3); requestAnimationFrame(tick);
}

main().catch(error => { status(`The film could not load: ${error.message}`); console.error(error); });
