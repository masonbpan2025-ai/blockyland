// Making or changing an Agent Arena film? Follow src/cinema/ARENA_FILM_GUIDELINES.md (the user's standing requirements),
// and pass node scripts/check-arena-film.mjs before rendering.
// The Agent Arena duel film: a replay of one round of an AI-vs-AI bot match (agentArena/), cut as the team battle film
// is (arenaFilm.js, from which this is made): the game's own world, built from the round's recorded map, with every
// recorded block change; the two players as actors placed from the recording's frames (every 0.25 s); and the edit
// (arenaDuelEdit.js): scenes over stretches of game time, cameras, the agents' own words as captions, and two
// commentators. The recording is made by scripts/arena-duel-film-data.mjs from the run's film.json. Frames are a pure
// function of film time, so the renderer (scripts/render-film.mjs) can render any frame in any order.
import * as T from 'three';
import { World } from '../world.js';
import { TextureManager } from '../textures.js';
import { ChunkMesher } from '../mesher.js';
import { BLOCKS } from '../blocks.js';
import { clamp, ease, lerp, lerpAngle } from './claudeActors.js';
import { createPlayerModel } from '../playerModel.js';
import { ItemVisuals } from '../itemVisuals.js';
import { MobManager } from '../mobs.js';
import { DEATH_SECONDS, deathTilt } from '../multiplayer/remotePlayerManager.js';
import { deathHolds } from './deathHold.js';
import { DUEL_EDIT, arenaTimeline } from './arenaDuelEdit.js';
import { SERIES_EDITS } from './arenaSeriesEdits.js';

const EXPORTING = new URLSearchParams(globalThis.location?.search ?? '').has('export');
const OUT = EXPORTING ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
// A colour a side: Red and Blue for a duel; the rest for a free-for-all's other players (arena-series-film-data.mjs).
const TEAM = {
  Red: { shirt: '#c8373a', pants: '#4a2a2a', ink: '#ff8a8a' }, Blue: { shirt: '#2f5fd0', pants: '#26304a', ink: '#8fb4ff' },
  Green: { shirt: '#2f9e44', pants: '#24412b', ink: '#8fe0a0' }, Yellow: { shirt: '#d4a017', pants: '#4a3f1a', ink: '#ffe08a' },
  Purple: { shirt: '#7d3fc2', pants: '#35264a', ink: '#c9a2ff' }, Orange: { shirt: '#d9701e', pants: '#4a3020', ink: '#ffb27a' },
  Cyan: { shirt: '#1f9bb0', pants: '#1f3c44', ink: '#8ae6f5' }, Pink: { shirt: '#c94f93', pants: '#4a2638', ink: '#ff9fd0' },
};
const teamLabel = (team) => story.teamLabels?.[team] ?? team.toUpperCase();
const LOOKS = [
  { skin: '#e8b98f', hair: '#3b2416' }, { skin: '#c98e62', hair: '#151010' }, { skin: '#f0c8a0', hair: '#c9a35a' },
  { skin: '#8d5a3b', hair: '#0d0b0a' }, { skin: '#e0ae84', hair: '#7a3b1c' },
];

// The page names its edit (<html data-edit="...">): the sw3 duel by default, or a series film (arenaSeriesEdits.js).
const EDIT = SERIES_EDITS[globalThis.document?.documentElement?.dataset?.edit] ?? DUEL_EDIT;
const story = { ...EDIT, ...arenaTimeline(EDIT) };
const status = (s) => { const el = document.querySelector('#stage p'); if (el) el.textContent = s; };

async function main() {
  status('Loading the game recording…');
  const base = `${import.meta.env?.BASE_URL ?? '/'}${story.data.replace(/^\//, '')}`;
  const rec = await (await fetch(`${base}/recording.json`)).json();
  // A series recording (scripts/arena-series-film-data.mjs) holds several games one after another on one clock, each in
  // rec.games: a scene with `game: n` gives its game times (g) in that game's own clock, moved here onto the film's.
  const games = rec.games ?? null;
  if (games) for (const sc of story.scenes) if (sc.game) { const o = games[sc.game - 1].start; sc.g = [sc.g[0] + o, sc.g[1] + o]; }
  // A camera on a shot frames the shot nearest the middle of its scene.
  for (const sc of story.scenes) if (sc.cam?.type === 'shot') sc.cam = { ...sc.cam, near: (sc.g[0] + sc.g[1]) / 2 };
  const gameAt = (g) => games ? (games.findLast(x => g >= x.start - .5) ?? games[0]) : null;
  const narration = await fetch(`${base}/narration/manifest.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  // A narrator's caption stays up as long as the voiced line.
  for (const c of story.captions) if (c.kind === 'narrator' && narration?.clips?.[c.id]) c.end = c.start + narration.clips[c.id].duration + .4;

  // --- renderer and scene ---
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(OUT.width, OUT.height);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene(); scene.background = new T.Color(0x8ec5f2); scene.fog = new T.Fog(0xa9d3f5, 120, 320);
  const camera = new T.PerspectiveCamera(50, 16 / 9, .1, 500);
  const hemi = new T.HemisphereLight(0xdcecff, 0x6d7a52, 1.8), sun = new T.DirectionalLight(0xfff0d0, 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .04; sun.shadow.bias = -.0005;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(hemi, sun, sun.target);

  // --- the world, regenerated, and its block changes over time ---
  status('Building the islands from the recorded map…');
  const textures = new TextureManager(); await textures.init();
  const world = new World(1, 'plains'); world.generationMode = 'authored'; world.structures = null;
  const span = Math.ceil(Math.max(Math.abs(rec.map.bounds.minX), rec.map.bounds.maxX, Math.abs(rec.map.bounds.minZ), rec.map.bounds.maxZ) / 16);
  const X0 = -span, X1 = span - 1, Z0 = -span, Z1 = span - 1;
  // The map as the round began: every block the players' copies of the world held (arena-blocks.json).
  for (let cx = X0; cx <= X1; cx++) for (let cz = Z0; cz <= Z1; cz++) world.getOrCreateChunk(cx, cz);
  { const c = rec.map.cells; for (let i = 0; i < c.length; i += 4) world.getChunk(Math.floor(c[i] / 16), Math.floor(c[i + 2] / 16))?.setVoxel(((c[i] % 16) + 16) % 16, c[i + 1], ((c[i + 2] % 16) + 16) % 16, c[i + 3]); }
  const changes = rec.blockChanges; // [t, x, y, z, id]
  const undo = []; // [index, previous id]
  let applied = 0;
  const dirty = new Set();
  const markDirty = (x, z) => { for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) dirty.add(`${Math.floor((x + dx) / 16)},${Math.floor((z + dz) / 16)}`); };
  const setBlock = (x, y, z, id) => { world.setVoxel(x, y, z, id); markDirty(x, z); };
  // Map edits are recorded at time 0; apply them before the first mesh.
  function applyUntil(g) {
    while (applied < changes.length && changes[applied][0] <= g) {
      const [, x, y, z, id] = changes[applied];
      undo.push(world.getVoxel(x, y, z)); setBlock(x, y, z, id); applied++;
    }
    while (applied > 0 && changes[applied - 1][0] > g) {
      applied--; const [, x, y, z] = changes[applied]; setBlock(x, y, z, undo.pop());
    }
  }
  applyUntil(0);
  world.light.skyDarken = 0; world.light.update(400000);
  const mesher = new ChunkMesher(textures);
  const src = textures.atlasTexture.image, mipmaps = [src];
  for (let size = src.width / 2, tile = textures.tileSize / 2; tile >= 1; size /= 2, tile /= 2) {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(mipmaps.at(-1), 0, 0, size, size); mipmaps.push(c);
  }
  const atlas = new T.CanvasTexture(src); Object.assign(atlas, { mipmaps, generateMipmaps: false, magFilter: T.NearestFilter, minFilter: T.NearestMipmapLinearFilter, colorSpace: T.SRGBColorSpace });
  const materials = [textures.opaqueMaterial, textures.transparentMaterial].map(m => { const c = m.clone(); c.map = atlas; c.transparent = false; c.alphaTest = .4; return c; });
  const chunkMeshes = new Map();
  function meshChunk(key) {
    const [cx, cz] = key.split(',').map(Number);
    if (cx < X0 || cx > X1 || cz < Z0 || cz > Z1) return;
    for (const m of chunkMeshes.get(key) ?? []) { scene.remove(m); m.geometry.dispose(); }
    const chunk = world.getChunk(cx, cz); if (!chunk) return;
    const g = mesher.meshChunk(chunk, world), meshes = [];
    for (const [i, k] of [[0, 'opaqueGeo'], [1, 'transparentGeo'], [0, 'lightGeo']]) if (g[k]) { const m = new T.Mesh(g[k], materials[i]); m.castShadow = m.receiveShadow = true; scene.add(m); meshes.push(m); }
    chunkMeshes.set(key, meshes);
  }
  status('Building the map…');
  for (let cx = X0; cx <= X1; cx++) for (let cz = Z0; cz <= Z1; cz++) meshChunk(`${cx},${cz}`);
  dirty.clear();
  // A shot may trim the leaves between its lens and its players (setupFor), as a film crew cuts foliage: only for
  // that shot, only leaves, and never a block the players changed.
  const LEAVES = new Set(Object.entries(BLOCKS).filter(([k]) => k.endsWith('LEAVES')).map(([, v]) => v));
  let trimmed = []; // [x, y, z, leaf id]
  function setTrims(list) {
    for (const [x, y, z, id] of trimmed) if (world.getVoxel(x, y, z) === BLOCKS.AIR) setBlock(x, y, z, id);
    trimmed = [];
    for (const [x, y, z, any] of list) { const v = world.getVoxel(x, y, z); if (LEAVES.has(v) || (any && v !== BLOCKS.AIR && v !== BLOCKS.WATER)) { trimmed.push([x, y, z, v, any]); setBlock(x, y, z, BLOCKS.AIR); } }
  }
  function syncWorld(g, trims = null) {
    const moves = (applied < changes.length && changes[applied][0] <= g) || (applied > 0 && changes[applied - 1][0] > g);
    const keep = trimmed.map(([x, y, z, , any]) => [x, y, z, any]);
    if (moves || trims) setTrims([]);
    applyUntil(g);
    if (trims) setTrims(trims); else if (moves) setTrims(keep);
    if (!dirty.size) return;
    world.light.update(20000);
    for (const key of dirty) meshChunk(key);
    dirty.clear();
  }
  const groundY = (x, z) => { let y = 62; while (y > 1 && world.getVoxel(Math.floor(x), y, Math.floor(z)) === BLOCKS.AIR) y--; return y + 1; };

  // --- the border wall ---
  const border = new T.Mesh(new T.CylinderGeometry(1, 1, 40, 96, 1, true), new T.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false }));
  border.visible = false; // the border never moved in this game; seen edge-on it drew stray blue arcs across shots
  scene.add(border);
  // Bed Wars' closing zone: the void rising under the islands, a dark sheet (placeActors moves it).
  const voidSheet = new T.Mesh(new T.CircleGeometry(160, 64), new T.MeshBasicMaterial({ color: 0x2b0b3d, transparent: true, opacity: .42, side: T.DoubleSide, depthWrite: false }));
  voidSheet.rotation.x = -Math.PI / 2; voidSheet.visible = false; scene.add(voidSheet);

  // --- the players: the game's own player model (playerModel.js), as another player sees one ---
  // Each wears Steve's skin redyed: the shirt in the team's colour, and their own hair and skin tone, so the face, the
  // eyes and the shading are the game's.
  status('Dressing the players…');
  const names = rec.players.map(p => p.name);
  const teamOf = Object.fromEntries(rec.players.map(p => [p.name, p.team]));
  // Bed Wars (scripts/bedwars-series-film-data.mjs): twenty players in five squads, each squad on a base whose colour
  // turns from game to game (a game's `colours`), so a player wears the colour its squad plays in the game shown. A
  // death is final once the squad's bed is gone (the recording marks it); before that the player is back at its base
  // after five seconds.
  const BW = rec.game === 'bedwars', RESPAWN = 5;
  const squadOf = Object.fromEntries(rec.players.map(p => [p.name, p.squad ?? p.name]));
  const teamAt = (name, g) => (BW ? (gameAt(g) ?? games[0])?.colours?.[squadOf[name] ?? name] : null) ?? teamOf[name] ?? 'Red';
  const colourAt = (name, g) => TEAM[teamAt(name, g)] ?? TEAM.Red;
  const steve = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = '/assets/entity/player/wide/steve.png'; });
  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  function skinFor(team, look, shade) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(steve, 0, 0);
    const img = g.getImageData(0, 0, 64, 64), d = img.data, shirt = rgb(team.shirt).map(v => v * shade), pants = rgb(team.pants), hair = rgb(look.hair), skin = rgb(look.skin);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const [r, gr, b] = [d[i], d[i + 1], d[i + 2]], y = Math.floor(i / 4 / 64);
      let to = null;
      if (r < 40 && gr > 90 && Math.abs(gr - b) < 16) to = shirt.map(v => v * gr / 175); // the cyan shirt
      else if (y >= 16 && b > r + 50 && b > gr + 50) to = pants.map(v => v * b / 165 * 1.6); // the blue trousers
      else if (y < 16 && r < 80 && r >= gr && gr >= b) to = hair.map(v => v * r / 51); // hair and beard
      else if (r > 130 && r < 200 && gr > 80 && gr < 135 && b < 110) to = skin.map((v, k) => v * [r / 170, gr / 114, b / 89][k]);
      if (to) for (let k = 0; k < 3; k++) d[i + k] = clamp(Math.round(to[k]), 0, 255);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  const items = new ItemVisuals(textures);
  const makeActor = (name, i, colour) => {
    const team = TEAM[colour] ?? TEAM.Red, look = LOOKS[i % 5];
    const actor = createPlayerModel({ skinDataUrl: skinFor(team, look, [1, .82, 1.12, .9, 1.05][i % 5]), followEquippedSkin: false });
    actor.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(actor);
    // The held item in the right hand, as remotePlayerManager draws one.
    const hand = new T.Group(); hand.position.set(0, -.7, -.15); actor.rightArm.add(hand);
    actor.userData.hand = hand; actor.userData.heldKey = undefined; actor.userData.armorKey = '';
    // Name tag.
    const tag = document.createElement('canvas'); tag.width = 256; tag.height = 64; const p = tag.getContext('2d');
    p.fillStyle = 'rgba(0,0,0,.45)'; p.fillRect(40, 10, 176, 42); p.font = 'bold 30px Arial'; p.textAlign = 'center'; p.fillStyle = team.ink; p.fillText(name, 128, 42);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(tag), depthWrite: false, transparent: true }));
    sprite.scale.set(1.5, .375, 1); sprite.position.set(0, 2.3, 0); actor.add(sprite); actor.userData.tag = sprite;
    return actor;
  };
  // A player in each colour it wears in the series (one in a duel or a free-for-all; a Bed Wars squad's turn by game).
  const colours = (name) => BW ? [...new Set(games.map(gm => gm.colours[squadOf[name]]).filter(Boolean))] : [teamOf[name]];
  const variants = names.map((name, i) => Object.fromEntries(colours(name).map(c => [c, makeActor(name, i, c)])));
  const actors = variants.map(v => Object.values(v)[0]);
  // Every skin is loaded before the first frame.
  await Promise.all(variants.flatMap(v => Object.values(v)).map(a => new Promise(resolve => { const tick = () => a.baseMaterial.map?.image?.width ? resolve() : setTimeout(tick, 20); tick(); })));
  const heldMesh = (id) => {
    const isBlock = typeof id === 'number', mesh = items.create(id, isBlock, isBlock ? .3 : .62);
    if (isBlock) mesh.rotation.set(.3, Math.PI / 4, 0);
    else { if (mesh.children?.length > 1) mesh.remove(mesh.children[1]); mesh.rotation.set(-Math.PI / 4, Math.PI / 2, 0); mesh.position.set(0, .12, -.12); }
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return mesh;
  };
  const armorSlots = (ids) => {
    const out = {};
    for (const id of ids.filter(Boolean)) { const s = String(id); const slot = /helmet|_cap$/.test(s) ? 'head' : /chestplate|tunic/.test(s) ? 'chest' : /leggings|pants/.test(s) ? 'legs' : /boots/.test(s) ? 'feet' : null; if (slot) out[slot] = { id }; }
    return out;
  };

  // --- the animals: the game's own mob models (mobs.js), moved along their recorded paths ---
  const mobs = new MobManager(scene, world, new Proxy({}, { get: () => () => {} }), { spawnDroppedItem() {}, spawnXpOrbs() {}, spawnDeathParticles() {}, spawnBlockBreakParticles() {} });
  mobs.game = { player: { position: new T.Vector3(0, -50, 0) }, difficulty: 'normal', weather: { weatherType: 'clear' }, mechanisms: { isFeatureEnabled: () => false } };
  const animalMeshes = new Map();
  const animalMob = (id, type) => {
    if (animalMeshes.has(id)) return animalMeshes.get(id);
    const mob = mobs.spawnMob(type, 0, -50, 0, { isBaby: false, baby: false });
    if (mob.isBaby) mob.mesh.scale.setScalar(2);
    mob.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    if (!mob.mesh.parent) scene.add(mob.mesh);
    animalMeshes.set(id, mob); return mob;
  };

  // --- effects: arrows in flight, hit flashes, falls ---
  const arrowLine = new T.Group(); scene.add(arrowLine);
  const SHOT_PUFF = new T.BoxGeometry(.12, .12, .12), SHOT_COLOURS = { snowball: 0xf4f8ff, egg: 0xe8dcb5, ender_pearl: 0x1d6b5a };
  // A dead player's loot (drop events, from the host's SkyWars client): each item on the ground where it fell, spinning
  // and bobbing as Java's item entities do, until someone walks over it (taken) and it flies to them. Drop ids restart
  // each game, so a pickup is matched to its drop in the same game.
  const dropGroup = new T.Group(); scene.add(dropGroup);
  const dropEvents = rec.events.filter(e => e.kind === 'drop');
  const takenOf = new Map(rec.events.filter(e => e.kind === 'taken').map(e => [`${gameAt(e.t)?.round ?? 1}/${e.id}`, e]));
  const pickups = rec.events.filter(e => e.kind === 'taken');
  const loot = dropEvents.map((d, k) => {
    const pile = dropEvents.filter(o => o.from === d.from && Math.abs(o.t - d.t) < 1), n = pile.indexOf(d);
    const ang = n * 2.4, r = .35 * Math.sqrt(n);
    return { ...d, x: d.at[0] + Math.cos(ang) * r, z: d.at[2] + Math.sin(ang) * r, y0: d.at[1], taken: takenOf.get(`${gameAt(d.t)?.round ?? 1}/${d.id}`) ?? null, mesh: null, spin: k * 1.7 };
  });
  // Shots (arrows, snowballs, eggs, ender pearls): `shot` events leave at t and land a flight later; the older `arrow`
  // events land at t after half a second.
  const shots = rec.events.filter(e => e.kind === 'shot' || e.kind === 'arrow').map(e => e.kind === 'arrow' ? { ...e, t: e.t - .5, item: 'arrow', flight: .5 } : e);
  const hits = rec.events.filter(e => e.kind === 'hit');
  const deaths = rec.events.filter(e => e.kind === 'death');
  // A player's death in the game being shown at game time g (a series has one a game; a duel only the one).
  // In Bed Wars, the death that put them out of the game (a final one); a player's latest death so far, final or not.
  const deathOf = (name, g) => deaths.find(d => d.player === name && (!BW || d.final) && gameAt(d.t) === gameAt(g))?.t;
  const lastDeath = (name, g) => deaths.filter(d => d.player === name && d.t <= g && gameAt(d.t) === gameAt(g)).at(-1);

  // --- reading the recording at any game time ---
  const frames = rec.frames, FS = rec.frameSeconds || .25;
  // Frames are not evenly spaced (none are recorded while a round waits on its agents): find the one by its time.
  const frameIndex = (g) => {
    let lo = 0, hi = frames.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= g) lo = mid; else hi = mid - 1; }
    return lo;
  };
  // Distance walked so far, per player and frame, for the walk cycle.
  const walked = names.map((_, i) => { let acc = 0; return frames.map((f, k) => { if (k) { const a = frames[k - 1].p[i], b = f.p[i]; const d = Math.hypot(b[0] - a[0], b[2] - a[2]); if (d < 3) acc += d; } return acc; }); });
  // A dying player is held where they fell, not drawn following the game's move to the spectators' spot (deathHold.js).
  const holds = deathHolds(frames, names, deaths);
  // A Bed Wars player who will respawn is held only until then.
  const finalHold = (h) => deaths.some(d => d.t === h.t && d.player === names[h.i] && d.final);
  const holdAt = (i, g) => holds.findLast(h => h.i === i && g >= h.from && gameAt(h.t) === gameAt(g) && (!BW || g < h.t + RESPAWN || finalHold(h)));
  function playerAt(i, g) {
    const hold = holdAt(i, g);
    if (hold) {
      const q = frames[hold.frame].p[i];
      return { x: q[0], y: q[1], z: q[2], yaw: q[3], pitch: q[4], hp: 0, held: q[6], swing: false, armor: q[8] || [], walked: walked[i][hold.frame], speed: 0 };
    }
    const k = frameIndex(g), a = frames[k], b = frames[k + 1], u = clamp((g - a.t) / Math.max(.001, b.t - a.t));
    const pa = a.p[i], pb = b.p[i];
    const jump = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) > 4;
    const w = lerp(walked[i][k], walked[i][k + 1], u);
    return { x: jump ? pa[0] : lerp(pa[0], pb[0], u), y: jump ? pa[1] : lerp(pa[1], pb[1], u), z: jump ? pa[2] : lerp(pa[2], pb[2], u),
      yaw: lerpAngle(pa[3], pb[3], u), pitch: lerp(pa[4], pb[4], u), hp: lerp(pa[5], pb[5], u), held: pa[6], swing: pa[7] || pb[7], armor: pa[8] || [], walked: w,
      speed: (walked[i][k + 1] - walked[i][k]) / Math.max(.05, b.t - a.t) };
  }
  const centreOf = (name, g, span = .8) => {
    const i = names.indexOf(name), acc = new T.Vector3(); let n = 0;
    for (let s = -span; s <= span + 1e-6; s += span / 3) { const p = playerAt(i, clamp(g + s, 0, frames.at(-1).t)); acc.add(new T.Vector3(p.x, p.y, p.z)); n++; }
    return acc.divideScalar(n);
  };
  const borderRadius = (g) => {
    const round = Math.floor(g / rec.roundSeconds) + 1, b = rec.border ?? { radius: 110, shrinkFrom: 16, perRound: 6, min: 14 };
    return Math.max(b.min, b.radius - Math.max(0, round - b.shrinkFrom) * b.perRound);
  };

  // The game's animation (remotePlayerManager.js): legs swing sin(phase) x 0.65 with the arms opposite; an attack is
  // one swing of the right arm, sin(u x pi) x 1.2 forward, over 1/6 s; a hit player is pushed back and hops, and is
  // drawn red for half a second; a dead one tips onto its side and is gone after a second.
  const ARM_FORWARD = 1; // the model faces -Z: a positive turn about X brings the arm up in front
  const SWING = 1 / 6, HURT = .5, KNOCK = .35; // the recording has the push itself; this adds the quick jolt between its frames
  const hitsFrom = Object.fromEntries(names.map(n => [n, hits.filter(h => h.from === n).map(h => h.t)]));
  const hitsTo = Object.fromEntries(names.map(n => [n, hits.filter(h => h.to === n)]));
  const shotsFrom = Object.fromEntries(names.map(n => [n, shots.filter(a => a.from === n && a.item === 'arrow').map(a => a.t)]));
  const throwsFrom = Object.fromEntries(names.map(n => [n, shots.filter(a => a.from === n && a.item !== 'arrow').map(a => a.t)]));
  const white = new T.Color(1, 1, 1), red = new T.Color(1, .3, .3);
  function knockback(name, g) {
    const off = new T.Vector3();
    for (const h of hitsTo[name]) {
      const s = g - h.t; if (s < 0 || s > .9) continue;
      const a = h.from ? playerAt(names.indexOf(h.from), h.t) : null, v = playerAt(names.indexOf(name), h.t);
      const dir = a ? new T.Vector3(v.x - a.x, 0, v.z - a.z) : new T.Vector3(); if (dir.lengthSq() < 1e-4) continue;
      dir.normalize();
      const push = s < .3 ? ease(s / .3) : 1 - ease((s - .3) / .6);
      off.addScaledVector(dir, push * KNOCK); off.y += Math.max(0, Math.sin(Math.min(1, s / .4) * Math.PI)) * .2;
    }
    return off;
  }
  function tint(actor, color) {
    // Not the held item: its materials are shared with every other copy of that item.
    const inHand = (o) => { for (let q = o; q; q = q.parent) if (q === actor.userData.hand) return true; return false; };
    actor.traverse(o => {
      if (!o.isMesh || o === actor.userData.tag || inHand(o) || !o.material?.color) return;
      for (const m of [o.material].flat()) { m.userData.base ??= m.color.clone(); m.color.copy(m.userData.base).multiply(color); }
    });
  }
  // Bed Wars dyes a team's leather armour in its colour (Hypixel): each leather piece in the colour the squad plays,
  // keeping the piece's own shading.
  const LEATHER_PARTS = { helmet: 'armor_helmet', chestplate: 'armor_chestplate', leggings: 'armor_leggings', boots: 'armor_boots' };
  function dyeLeather(actor, armor, team) {
    const want = new T.Color(team.shirt).getHSL({});
    for (const id of armor.filter(Boolean).map(String).filter(a => a.startsWith('leather_'))) {
      const prefix = LEATHER_PARTS[id.slice(8)]; if (!prefix) continue;
      actor.traverse(o => {
        if (!o.name?.startsWith(prefix)) return;
        o.traverse(m => { if (!m.isMesh) return; for (const mat of [m.material].flat()) { const was = mat.color.getHSL({}); mat.color.setHSL(want.h, want.s, clamp(want.l * was.l / .26, .12, .8)); delete mat.userData.base; } });
      });
    }
  }
  function placeActors(g) {
    names.forEach((name, i) => {
      // The player in the colour it wears in this game; its other colours hidden.
      const actor = variants[i][teamAt(name, g)] ?? Object.values(variants[i])[0];
      for (const v of Object.values(variants[i])) if (v !== actor) v.visible = false;
      actors[i] = actor;
      const p = playerAt(i, g), last = BW ? lastDeath(name, g) : null, died = BW ? last?.t : deathOf(name, g);
      const fallen = died !== undefined && g >= died && (!BW || last.final || g < died + RESPAWN);
      actor.visible = !fallen || g - died < DEATH_SECONDS;
      if (!actor.visible) return;
      const at = new T.Vector3(p.x, p.y, p.z).add(knockback(name, g));
      actor.position.copy(at); actor.rotation.set(0, p.yaw, fallen ? deathTilt(g - died) : 0);
      actor.head.rotation.x = clamp(p.pitch, -1.2, 1.2);
      // walking
      const moving = clamp((p.speed - .3) / 1.5), legs = Math.sin(p.walked * 2.2) * .65 * moving;
      actor.leftLeg.rotation.x = legs; actor.rightLeg.rotation.x = -legs;
      actor.leftArm.rotation.set(-legs, 0, -.05); actor.rightArm.rotation.set(legs, 0, .05);
      // the attack swing, a hit's or a mining stroke's; drawing a bow holds both arms out
      const lastHit = hitsFrom[name].findLast(t => t - .05 <= g);
      const u = lastHit !== undefined ? (g - (lastHit - .05)) / SWING : Infinity;
      const shot = shotsFrom[name].find(t => g >= t - 1 && g <= t + .1);
      const thrown = throwsFrom[name].find(t => g >= t - .05 && g < t - .05 + SWING);
      if (shot !== undefined) {
        actor.rightArm.rotation.set(ARM_FORWARD * (Math.PI / 2 + p.pitch), .1, 0); actor.leftArm.rotation.set(ARM_FORWARD * (Math.PI / 2 + p.pitch), -.4, 0);
      } else if (thrown !== undefined) actor.rightArm.rotation.x = ARM_FORWARD * Math.sin((g - (thrown - .05)) / SWING * Math.PI) * 1.4;
      else if (u < 1) actor.rightArm.rotation.x = ARM_FORWARD * Math.sin(u * Math.PI) * 1.2;
      else if (p.swing) actor.rightArm.rotation.x = ARM_FORWARD * Math.sin(((g / .3) % 1) * Math.PI) * 1.2;
      // red while hurt or dying
      const hurt = fallen || hitsTo[name].some(h => g >= h.t && g - h.t < HURT);
      if (actor.userData.hurt !== hurt) { tint(actor, hurt ? red : white); actor.userData.hurt = hurt; }
      // what they hold and wear
      // The bow stays in hand through a shot and just after it (the recording, every 0.25 s, often catches the swap
      // back to the sword first).
      // So does a pearl, a snowball or an egg for a moment before its throw.
      const throwing = shots.find(s => s.from === name && s.item !== 'arrow' && g >= s.t - .4 && g <= s.t + .05);
      const key = shot !== undefined && g <= shot + .35 ? 'bow' : shotsFrom[name].some(t => g > t && g <= t + .35) ? 'bow' : throwing ? throwing.item : p.held ?? null;
      if (actor.userData.heldKey !== key) { actor.userData.hand.clear(); if (key !== null) actor.userData.hand.add(heldMesh(key)); actor.userData.heldKey = key; }
      const armorKey = p.armor.filter(Boolean).join(',');
      // two players nose to nose: the second one's tag rides higher so both names can be read
      const close = i > 0 && actors.slice(0, i).some(o => o.visible && o.position.distanceTo(at) < 1.6);
      actor.userData.tag.position.y = close ? 2.75 : 2.3;
      if (actor.userData.armorKey !== armorKey) { actor.updateArmor(armorSlots(p.armor)); actor.userData.armorKey = armorKey; actor.traverse(o => { if (o.isMesh) o.castShadow = true; }); if (BW) dyeLeather(actor, p.armor, colourAt(name, g)); if (hurt) tint(actor, red); }
    });
    // animals, between their recorded frames, legs walking in diagonal pairs as the game's quadrupeds do
    const k = frameIndex(g), f = frames[k], nf = frames[k + 1], u = clamp((g - f.t) / Math.max(.001, nf.t - f.t));
    const next = new Map((nf.a ?? []).map(a => [a[0], a]));
    const seen = new Set();
    for (const [id, type, x, y, z, heading] of f.a ?? []) {
      const mob = animalMob(id, type), b = next.get(id) ?? [id, type, x, y, z, heading];
      const dist = Math.hypot(b[2] - x, b[4] - z), jump = dist > 3;
      mob.mesh.visible = true;
      mob.mesh.position.set(jump ? x : lerp(x, b[2], u), jump ? y : lerp(y, b[3], u), jump ? z : lerp(z, b[4], u));
      mob.mesh.rotation.y = lerpAngle(heading, b[5], u);
      const swing = dist > .05 && !jump ? Math.sin(g * 9 + id) * .5 : 0, legs = mob.legs ?? [];
      if (legs.length === 2) { legs[0].rotation.x = swing; legs[1].rotation.x = -swing; }
      else legs.forEach((leg, n) => { leg.rotation.x = (n === 0 || n === 3) ? swing : -swing; });
      seen.add(id);
    }
    for (const [id, mob] of animalMeshes) if (!seen.has(id)) mob.mesh.visible = false;
    // shots in flight, each with a fading trail so it can be followed from a distance
    arrowLine.clear();
    for (const a of shots) if (g >= a.t && g < a.t + a.flight + .05) {
      const from = new T.Vector3(a.a[0], a.a[1] + 1.5, a.a[2]), to = new T.Vector3(a.b[0], a.b[1] + 1.2, a.b[2]);
      const arc = Math.min(2.5, from.distanceTo(to) * (a.item === 'arrow' ? .04 : .12));
      const point = (u) => from.clone().lerp(to, u).add(new T.Vector3(0, Math.sin(u * Math.PI) * arc, 0));
      const u = clamp((g - a.t) / a.flight), at = point(u), dir = point(Math.min(1, u + .02)).sub(point(Math.max(0, u - .02))).normalize();
      const pearl = a.item === 'ender_pearl';
      for (let k = 1; k <= (pearl ? 12 : 8); k++) { const v = u - k * .035; if (v < 0) break; const puff = new T.Mesh(SHOT_PUFF, new T.MeshBasicMaterial({ color: pearl ? 0xc58cff : 0xffffff, transparent: true, opacity: .55 * (1 - k / 9), depthWrite: false })); puff.position.copy(point(v)); puff.scale.setScalar(1 - k * .07); arrowLine.add(puff); }
      if (a.item === 'arrow') {
        const shaft = new T.Mesh(new T.BoxGeometry(.08, .08, 1), new T.MeshBasicMaterial({ color: 0xeee6d0 })); shaft.position.copy(at); shaft.lookAt(at.clone().add(dir)); arrowLine.add(shaft);
        const tip = new T.Mesh(new T.BoxGeometry(.14, .14, .16), new T.MeshBasicMaterial({ color: 0x6b6b6b })); tip.position.copy(at).addScaledVector(dir, .5); tip.lookAt(at.clone().addScaledVector(dir, 2)); arrowLine.add(tip);
      } else {
        const size = pearl ? .4 : .28, ball = new T.Mesh(new T.BoxGeometry(size, size, size), new T.MeshBasicMaterial({ color: SHOT_COLOURS[a.item] ?? 0xffffff })); ball.position.copy(at); ball.rotation.set(g * 9, g * 7, 0); arrowLine.add(ball);
      }
    }
    // An ender pearl's teleport: purple motes burst where the thrower vanishes and where the pearl lands, as the game's
    // portal particles do, for most of a second.
    for (const a of shots) if (a.item === 'ender_pearl' && a.landsAt !== undefined && g >= a.landsAt && g < a.landsAt + .9) {
      const s = (g - a.landsAt) / .9, i = names.indexOf(a.from), gone = i >= 0 ? playerAt(i, a.landsAt - .05) : null;
      const spots = [new T.Vector3(a.b[0], a.b[1] + 1.2, a.b[2]), gone ? new T.Vector3(gone.x, gone.y + .9, gone.z) : null].filter(Boolean);
      spots.forEach((c, n) => { for (let k = 0; k < 16; k++) {
        const ang = k * 2.4 + n, r = .3 + s * (1.1 + (k % 4) * .25), mote = new T.Mesh(SHOT_PUFF, new T.MeshBasicMaterial({ color: k % 3 ? 0xa64dff : 0xe2b8ff, transparent: true, opacity: .9 * (1 - s), depthWrite: false }));
        mote.position.set(c.x + Math.cos(ang) * r, c.y + ((k * 7) % 11) / 11 * 1.6 - .5 + s * .6, c.z + Math.sin(ang) * r); mote.scale.setScalar(1.6 - s); arrowLine.add(mote);
      } });
    }
    // the loot on the ground, and each pickup's flight to its taker
    for (const d of loot) {
      // Seen on the ground for at least 0.8 s, even when the game handed it over at once (a recording from before the
      // host kept Java's pickup delay): the loot spills, then flies to its taker.
      const takeAt = d.taken ? Math.max(d.taken.t, d.t + .8) : null;
      const end = d.taken ? takeAt + .35 : (gameAt(d.t)?.end ?? Infinity);
      const shown = g >= d.t + .15 && g < end && gameAt(g) === gameAt(d.t);
      if (!shown) { if (d.mesh) d.mesh.visible = false; continue; }
      // On the ground under where it fell (a fall into the void takes it with it).
      if (d.rest === undefined) {
        // The first solid block below where it fell, within 4 (searched from there down: a tree above is not the floor).
        d.rest = null;
        for (let y = Math.floor(d.y0 + .5); y >= Math.floor(d.y0) - 4; y--) { const v = world.getVoxel(Math.floor(d.x), y, Math.floor(d.z)); if (v !== BLOCKS.AIR && !LEAVES.has(v)) { d.rest = y + 1.25; break; } }
      }
      if (d.rest === null) continue;
      if (!d.mesh) { const holder = new T.Group(); holder.add(heldMesh(d.item.id)); holder.scale.setScalar(.8); dropGroup.add(holder); d.mesh = holder; }
      d.mesh.visible = true;
      let x = d.x, y = d.rest + Math.sin(g * 2.2 + d.spin) * .08, z = d.z;
      if (d.taken && g >= takeAt) {
        const who = names.indexOf(d.taken.by), q = who >= 0 ? playerAt(who, d.taken.t) : null, u = clamp((g - takeAt) / .35);
        if (q) { x = lerp(x, q.x, u); y = lerp(y, q.y + 1, u); z = lerp(z, q.z, u); }
      }
      d.mesh.position.set(x, y, z); d.mesh.rotation.y = g * 1.6 + d.spin;
    }
    const zone = gameAt(g)?.zone ?? null;
    if (zone && g >= zone.startsAt && g <= gameAt(g).end) {
      const k = clamp((g - zone.startsAt) / Math.max(1, zone.closedAt - zone.startsAt)), r = lerp(zone.startRadius, zone.endRadius, k);
      border.visible = true; border.scale.set(r, 1, r); border.position.set(zone.x, 40, zone.z);
      voidSheet.visible = true; voidSheet.position.set(zone.x, lerp(zone.startFloor, zone.endFloor, k), zone.z);
    } else if (BW || zone) { border.visible = false; voidSheet.visible = false; }
    else { border.scale.set(borderRadius(g), 1, borderRadius(g)); border.position.set(0, 30, 0); }
  }

  // --- cameras ---
  const floorY = (x, z) => { let y = 62; for (let v; y > 1 && ((v = world.getVoxel(Math.floor(x), y, Math.floor(z))) === BLOCKS.AIR || LEAVES.has(v)); y--); return y + 1; };
  const ground = (v) => Math.max(v.y, floorY(v.x, v.z) + 1.5);
  function heading(name, g) {
    const a = centreOf(name, g - 1.2), b = centreOf(name, g + 1.2), d = b.sub(a);
    if (Math.hypot(d.x, d.z) < .8) { const p = playerAt(names.indexOf(name), g); return new T.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); }
    return d.setY(0).normalize();
  }
  function cameraFor(cam, g, k) {
    const up = new T.Vector3(0, 1, 0);
    if (cam.type === 'aerial') {
      const c = new T.Vector3(cam.at?.[0] ?? 0, cam.at?.[1] ?? 24, cam.at?.[2] ?? 0), ang = (cam.angle ?? 0) + (cam.spin ?? .15) * k;
      const pos = c.clone().add(new T.Vector3(Math.sin(ang) * (cam.dist ?? 90), cam.height ?? 60, Math.cos(ang) * (cam.dist ?? 90)));
      return { pos, look: c, fov: cam.fov ?? 50 };
    }
    if (cam.type === 'follow') {
      const p = centreOf(cam.who, g), h = heading(cam.who, g), side = new T.Vector3(-h.z, 0, h.x).multiplyScalar(cam.side ?? 2.5);
      const pos = p.clone().addScaledVector(h, -(cam.dist ?? 6)).add(side).add(up.clone().multiplyScalar(cam.height ?? 3.2)); pos.y = ground(pos);
      return { pos, look: p.clone().add(new T.Vector3(0, 1.3, 0)).addScaledVector(h, 2), fov: cam.fov ?? 50 };
    }
    if (cam.type === 'face') {
      // In front of the face: the way the player looks, not the way they last walked.
      const me = playerAt(names.indexOf(cam.who), g), h = new T.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
      const p = centreOf(cam.who, g, .4), side = new T.Vector3(-h.z, 0, h.x).multiplyScalar(cam.side ?? 1.4);
      const pos = p.clone().addScaledVector(h, cam.dist ?? 3.6).add(side).add(new T.Vector3(0, cam.height ?? 1.9, 0)); pos.y = ground(pos);
      return { pos, look: p.clone().add(new T.Vector3(0, 1.45, 0)), fov: cam.fov ?? 40 };
    }
    if (cam.type === 'shot') {
      // A shot from the side: its whole path in frame, from where it left to where it landed, the lens on the open
      // (outer) side of the path. A pearl thrown from under an island's rim is seen as well as its landing on top.
      const s = shots.filter(x => x.from === cam.who && (!cam.item || x.item === cam.item)).sort((p, q) => Math.abs(p.t - cam.near) - Math.abs(q.t - cam.near))[0];
      if (s) {
        const a = new T.Vector3(s.a[0], s.a[1] + 1, s.a[2]), b = new T.Vector3(s.b[0], s.b[1] + 1.2, s.b[2]), mid = a.clone().add(b).multiplyScalar(.5);
        const d = b.clone().sub(a).setY(0); if (d.lengthSq() < 1e-4) d.set(1, 0, 0); d.normalize();
        const perp = new T.Vector3(-d.z, 0, d.x); if (perp.dot(new T.Vector3(mid.x, 0, mid.z)) < 0) perp.negate();
        const pos = mid.clone().addScaledVector(perp, (cam.dist ?? 6) / 6 * (a.distanceTo(b) * .9 + 7)).add(new T.Vector3(0, (cam.height ?? 3.2) * .5, 0));
        return { pos, look: mid, fov: cam.fov ?? 55 };
      }
    }
    if (cam.type === 'over') {
      // Over the shooter's shoulder, toward the target: the shooter close in front, the target down the line of fire.
      const p = centreOf(cam.who, g, .3), q = centreOf(cam.at, g, .3), d = q.clone().sub(p).setY(0);
      if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
      d.normalize();
      const side = new T.Vector3(-d.z, 0, d.x).multiplyScalar(cam.side ?? 1.3);
      const pos = p.clone().addScaledVector(d, -(cam.dist ?? 3.2)).add(side).add(new T.Vector3(0, cam.height ?? 2.1, 0)); pos.y = ground(pos);
      return { pos, look: p.clone().lerp(q, cam.lead ?? .55).add(new T.Vector3(0, 1.3, 0)), fov: cam.fov ?? 55 };
    }
    if (cam.type === 'pair' || cam.type === 'group') {
      const who = cam.who ?? [cam.a, cam.b];
      const ps = who.filter(n => deathOf(n, g) === undefined || g < deathOf(n, g) + 1.5).map(n => centreOf(n, g));
      if (!ps.length) ps.push(centreOf(who[0], g));
      const mid = ps.reduce((s, p) => s.add(p), new T.Vector3()).divideScalar(ps.length);
      const spread = Math.max(5, ...ps.map(p => p.distanceTo(mid) * 2)), far = (cam.dist ?? 6) / 6;
      const ang = (cam.angle ?? .6) + (cam.spin ?? .1) * k;
      const pos = mid.clone().add(new T.Vector3(Math.sin(ang) * spread * 1.1 * far, spread * (cam.rise ?? .35) + 1.2, Math.cos(ang) * spread * 1.1 * far)); pos.y = ground(pos);
      return { pos, look: mid.clone().add(new T.Vector3(0, 1.1, 0)), fov: cam.fov ?? 50 };
    }
    // a fixed lens: from -> at
    const at = new T.Vector3(...cam.at), from = new T.Vector3(...cam.from);
    if (cam.to) from.lerp(new T.Vector3(...cam.to), ease(k));
    return { pos: from, look: at, fov: cam.fov ?? 50 };
  }

  // --- the 2D layer: HUD, captions, cards ---
  const canvas = document.createElement('canvas'); canvas.width = OUT.width; canvas.height = OUT.height;
  const ink = canvas.getContext('2d', { alpha: false }); ink.setTransform(OUT.width / 1280, 0, 0, OUT.height / 720, 0, 0);
  document.querySelector('#stage').replaceChildren(canvas);
  await document.fonts.ready;
  const text = (s, x, y, font, color = '#f5f1e6', align = 'left', blur = 6) => { ink.font = font; ink.textAlign = align; ink.fillStyle = color; ink.shadowColor = 'rgba(0,0,0,.8)'; ink.shadowBlur = blur; ink.fillText(s, x, y); ink.shadowBlur = 0; };
  const wrapLines = (s, font, width) => { ink.font = font; const out = []; let line = ''; for (const w of String(s).split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (ink.measureText(t).width > width && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };
  const clock = (g) => `${Math.floor(g / 60)}:${String(Math.floor(g % 60)).padStart(2, '0')}`;
  const playTime = (g) => Math.max(0, g - (gameAt(g)?.playStartsAt ?? rec.playStartsAt ?? 0));
  const kills = deaths.map(d => ({ ...d }));

  // --- the broadcast graphics ---
  const alive = (team, g) => rec.teams.find(t => t.name === team).players.filter(n => deathOf(n, g) === undefined || g < deathOf(n, g)).length;
  const roundedBox = (x, y, w, h, r, fill) => { ink.beginPath(); ink.roundRect(x, y, w, h, r); ink.fillStyle = fill; ink.fill(); };
  // Who eliminated a player (the death message's killer when it names one) and with what: their last recorded blow --
  // a hit, or a snowball, egg or arrow that landed on the victim -- if it came within 4 s of the death (a fall into the
  // void takes about two); an older one is not what did it, so then the weapon is left out.
  const killerOf = (d) => {
    const inGame = (t) => t <= d.t + .01 && gameAt(t) === gameAt(d.t);
    const blows = [
      ...hits.filter(h => h.to === d.player && h.weapon !== 'ender_pearl' && inGame(h.t)).map(h => ({ from: h.from, t: h.t, weapon: h.weapon })),
      ...shots.filter(x => x.hit === d.player && x.item !== 'ender_pearl' && inGame(x.landsAt ?? x.t)).map(x => ({ from: x.from, t: x.landsAt ?? x.t, weapon: x.item })),
    ].filter(b => !d.by || b.from === d.by).sort((a, b) => a.t - b.t);
    const last = blows.at(-1), from = d.by ?? last?.from;
    if (!from || (BW && (d.how === 'zone' || (!d.by && d.t - last.t > 6)))) return null;
    return { from, weapon: last && d.t - last.t <= 4 ? last.weapon : null, how: /void/.test(d.text ?? '') ? 'knocked into the void by' : 'slain by' };
  };
  // Bed Wars: the beds, the squads out, the announcements; what each shows at game time g.
  const bedEvents = rec.events.filter(e => e.kind === 'bed'), outs = rec.events.filter(e => e.kind === 'teamout'), announces = rec.events.filter(e => e.kind === 'announce');
  const sameGame = (t, g) => gameAt(t) === gameAt(g);
  const bedsGone = (g) => announces.some(a => /All beds/.test(a.text) && a.t <= g && sameGame(a.t, g));
  const bedUp = (squad, g) => !bedsGone(g) && !bedEvents.some(b => b.squad === squad && b.t <= g && sameGame(b.t, g));
  const squadOut = (squad, g) => outs.some(o => o.squad === squad && o.t <= g && sameGame(o.t, g));
  const standingIn = (squad, g) => (rec.squads?.find(s => s.name === squad)?.players ?? []).filter(n => deathOf(n, g) === undefined || g < deathOf(n, g)).length;
  const BASE_COLOUR = { Red: 'Red', Blue: 'Blue', Green: 'Green', Yellow: 'Yellow', Aqua: 'Cyan' };
  const shortModel = (m) => String(m ?? '').split(' · ')[0];
  const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0] ?? 'th');
  function bwScore(g, sc) {
    const w = 760, x = 640 - w / 2, y = 42, cell = (w - 140) / rec.squads.length;
    roundedBox(x, y, w, 54, 6, 'rgba(8,10,16,.84)');
    text(String(sc.matchLabel ?? story.matchLabel ?? 'BED WARS').split('  ·  ')[0], x + 14, y + 20, 'bold 12px Arial', '#bcd8ff', 'left', 0);
    text(clock(playTime(g)), x + 14, y + 44, 'bold 21px Arial', '#ffffff', 'left', 0);
    rec.squads.forEach((s, k) => {
      const cx = x + 140 + k * cell, col = colourAt(s.name, g), out = squadOut(s.name, g), up = bedUp(s.name, g), left = standingIn(s.name, g);
      ink.globalAlpha = out ? .38 : 1;
      ink.fillStyle = col.shirt; ink.fillRect(cx, y + 7, 5, 40);
      text(s.name.toUpperCase(), cx + 12, y + 22, 'bold 13px Arial', col.ink, 'left', 0);
      if (out) text('OUT', cx + 12, y + 44, 'bold 15px Arial', '#9a9aa2', 'left', 0);
      else { text(up ? 'BED' : 'NO BED', cx + 12, y + 44, 'bold 12px Arial', up ? '#7fe39a' : '#ff8a8a', 'left', 0); ink.font = 'bold 12px Arial'; text(`${left}/4`, cx + 16 + ink.measureText(up ? 'BED' : 'NO BED').width, y + 44, 'bold 15px Arial', '#ffffff', 'left', 0); }
      ink.globalAlpha = 1;
    });
  }
  function bwRoster(g) {
    rec.squads.forEach((s, k) => {
      const col = colourAt(s.name, g), h = 22 + s.players.length * 17, x = 1280 - 24 - 200, y = 108 + k * (h + 6);
      roundedBox(x, y, 200, h, 6, 'rgba(8,10,16,.62)'); ink.fillStyle = col.shirt; ink.fillRect(x, y, 4, h);
      text(`${s.name.toUpperCase()}  ·  ${shortModel(s.model).toUpperCase()}`, x + 12, y + 15, 'bold 10px Arial', col.ink);
      s.players.forEach((name, pi) => {
        const p = playerAt(names.indexOf(name), g), out = deathOf(name, g) !== undefined && g >= deathOf(name, g), last = lastDeath(name, g), waiting = !out && last && g < last.t + RESPAWN, yy = y + 32 + pi * 17;
        text(out ? '✕ ' + name : name, x + 12, yy, (out ? '' : 'bold ') + '12px Arial', out ? '#7c7c84' : waiting ? '#a9a9b2' : '#f2f2f2');
        if (waiting) text('respawning', x + 96, yy, 'italic 11px Arial', '#a9a9b2');
        else if (!out) { ink.fillStyle = 'rgba(255,255,255,.12)'; ink.fillRect(x + 96, yy - 8, 90, 7); ink.fillStyle = p.hp > 12 ? '#52d273' : p.hp > 6 ? '#f2c94c' : '#ef5350'; ink.fillRect(x + 96, yy - 8, 90 * clamp(p.hp / 20), 7); }
      });
    });
  }
  // Every death as it happens, top left: who, how, by whom; FINAL when it put them out.
  const deathLine = (d) => {
    const by = killerOf(d);
    if (d.how === 'zone') return `${d.player} was swallowed by the closing void`;
    if (by) return `${d.player} ${d.how === 'void' ? 'knocked into the void by' : 'killed by'} ${by.from}`;
    return `${d.player} ${d.how === 'void' ? 'fell into the void' : 'died'}`;
  };
  function killFeed(g, sc) {
    const recent = deaths.filter(d => g >= d.t && g - d.t < 4.5 && sameGame(d.t, g) && d.t >= sc.g[0] - 3).slice(-6);
    recent.forEach((d, n) => {
      const yy = 112 + n * 27, line = deathLine(d), vc = colourAt(d.player, g);
      ink.globalAlpha = Math.min(1, (4.5 - (g - d.t)) / .4);
      ink.font = 'bold 13px Arial'; const w = ink.measureText(line).width + (d.final ? 78 : 26);
      roundedBox(28, yy - 18, w, 24, 5, 'rgba(8,10,16,.74)'); ink.fillStyle = vc.shirt; ink.fillRect(28, yy - 18, 4, 24);
      text(line, 40, yy, 'bold 13px Arial', '#f2efe8', 'left', 0);
      if (d.final) { roundedBox(28 + w - 64, yy - 15, 56, 18, 4, '#d23a3a'); text('FINAL', 28 + w - 36, yy - 1, 'bold 12px Arial', '#ffffff', 'center', 0); }
      ink.globalAlpha = 1;
    });
  }
  // The big call, top centre, on a live shot: a bed broken, a squad out, or a final kill (one at a time, the bed first).
  function bwBanner(g, sc) {
    const inScene = (t) => t >= sc.g[0] - .01 && t <= sc.g[1] && g >= t && (g - t) / Math.max(sc.speed, .05) < 3.4;
    const bed = bedEvents.filter(b => inScene(b.t)).at(-1), out = outs.filter(o => inScene(o.t)).at(-1);
    const fin = deaths.filter(d => d.final && inScene(d.t)).at(-1), ann = announces.filter(a => inScene(a.t) && !/won Bed Wars/.test(a.text)).at(-1);
    const pick = bed ? ['bed', bed] : out ? ['out', out] : fin ? ['final', fin] : ann ? ['ann', ann] : null;
    if (!pick) return;
    const [kind, e] = pick, since = (g - e.t) / Math.max(sc.speed, .05);
    const slide = ease(clamp(since / .25)), fade = clamp((3.4 - since) / .3), w = 560, x = 640 - w / 2 + (1 - slide) * -80, y = 128;
    ink.globalAlpha = Math.min(slide, fade);
    let head, title, sub, col;
    if (kind === 'bed') { col = TEAM[BASE_COLOUR[e.base]] ?? TEAM.Red; head = 'BED DESTROYED'; title = `${e.squad.toUpperCase()}'S BED`; sub = `broken by ${e.by} (${squadOf[e.by] ?? ''})  ·  their next deaths are final`; }
    else if (kind === 'out') { col = TEAM[BASE_COLOUR[e.base]] ?? TEAM.Red; const place = gameAt(e.t)?.places?.[e.squad]; head = 'TEAM ELIMINATED'; title = e.squad.toUpperCase(); sub = place ? `out in ${ordinal(place)} place` : 'all four are out'; }
    else if (kind === 'final') { col = colourAt(e.player, g); head = 'FINAL KILL'; title = e.player.toUpperCase(); sub = deathLine(e).replace(e.player + ' ', ''); }
    else { col = { shirt: '#5b3a8c', ink: '#d9c6ff' }; head = 'ANNOUNCEMENT'; title = /All beds/.test(e.text) ? 'ALL BEDS DESTROYED' : /SUDDEN/.test(e.text) ? 'SUDDEN DEATH' : 'THE ZONE CLOSES'; sub = /All beds/.test(e.text) ? 'from now on every death is final' : /SUDDEN/.test(e.text) ? 'two minutes left' : 'the border closes on the middle and the void rises'; }
    roundedBox(x, y, w, 92, 8, 'rgba(8,10,16,.88)');
    ink.fillStyle = col.shirt; ink.fillRect(x, y, w, 26);
    text(head, x + w / 2, y + 19, 'bold 16px Arial', '#ffffff', 'center', 0);
    text(title, x + w / 2, y + 62, 'bold 32px Arial', '#ffffff', 'center');
    text(sub, x + w / 2, y + 84, 'bold 14px Arial', col.ink, 'center', 0);
    ink.globalAlpha = 1;
  }
  const TAGS = { LIVE: '#e5322d', REPLAY: '#f2b705', HIGHLIGHTS: '#f2b705', 'PRE-GAME': '#3d8bfd', 'FULL TIME': '#e5322d' };

  function hud(g, sc, t) {
    if (sc.card) return;
    // the bug: what we are watching
    const tag = sc.tag ?? 'LIVE', color = TAGS[tag] ?? '#e5322d';
    ink.font = 'bold 16px Arial'; const tw = ink.measureText(tag).width + (tag === 'LIVE' ? 40 : 26);
    roundedBox(28, 50, tw, 30, 5, color);
    if (tag === 'LIVE') { ink.fillStyle = (t * 1.6) % 1 < .6 ? '#ffffff' : 'rgba(255,255,255,.35)'; ink.beginPath(); ink.arc(44, 65, 5, 0, Math.PI * 2); ink.fill(); }
    text(tag, tag === 'LIVE' ? 56 : 41, 71, 'bold 16px Arial', tag === 'REPLAY' || tag === 'HIGHLIGHTS' ? '#14110a' : '#ffffff', 'left', 0);
    if (sc.speed > 1.5) text('▶▶ ' + Math.round(sc.speed) + '× FAST-FORWARD', 28 + tw + 12, 71, 'bold 14px Arial', '#ffffff');
    if (tag === 'REPLAY' || tag === 'HIGHLIGHTS') text('SLOW MOTION', 28 + tw + 12, 71, 'bold 14px Arial', '#ffe7a3');
    // the scoreboard: players still standing on each side; in a free-for-all, how many are left and who
    if (tag !== 'HIGHLIGHTS' && BW) bwScore(g, sc);
    else if (tag !== 'HIGHLIGHTS' && rec.teams.length > 2) {
      const x = 640 - 230, y = 46, standing = names.filter(n => deathOf(n, g) === undefined || g < deathOf(n, g));
      roundedBox(x, y, 460, 44, 6, 'rgba(8,10,16,.82)');
      text('STANDING', x + 14, y + 19, 'bold 11px Arial', '#bcd8ff', 'left', 0);
      text(`${standing.length} / ${names.length}`, x + 14, y + 38, 'bold 18px Arial', '#ffffff', 'left', 0);
      text(sc.matchLabel ?? story.matchLabel ?? 'ROUND 1', 640, y + 19, 'bold 13px Arial', '#bcd8ff', 'center', 0);
      text(clock(playTime(g)), 640, y + 38, 'bold 18px Arial', '#ffffff', 'center', 0);
      names.forEach((n, i) => {
        const up = standing.includes(n), cx = x + 460 - 16 - (names.length - 1 - i) * 22;
        ink.globalAlpha = up ? 1 : .25; ink.fillStyle = TEAM[teamOf[n]].shirt; ink.beginPath(); ink.arc(cx, y + 22, 8, 0, Math.PI * 2); ink.fill(); ink.globalAlpha = 1;
      });
    } else if (tag !== 'HIGHLIGHTS') {
      const x = 640 - 230, y = 46;
      roundedBox(x, y, 460, 44, 6, 'rgba(8,10,16,.82)');
      ink.fillStyle = TEAM.Red.shirt; ink.fillRect(x, y, 150, 44); ink.fillStyle = TEAM.Blue.shirt; ink.fillRect(x + 310, y, 150, 44);
      text(teamLabel('Red'), x + 14, y + 28, 'bold 15px Arial', '#ffffff', 'left', 0); text(String(alive('Red', g)), x + 136, y + 32, 'bold 28px Arial', '#ffffff', 'right', 0);
      text(teamLabel('Blue'), x + 446, y + 28, 'bold 15px Arial', '#ffffff', 'right', 0); text(String(alive('Blue', g)), x + 324, y + 32, 'bold 28px Arial', '#ffffff', 'left', 0);
      text(sc.matchLabel ?? story.matchLabel ?? 'ROUND 1', 640, y + 19, 'bold 13px Arial', '#bcd8ff', 'center', 0);
      text(clock(playTime(g)), 640, y + 38, 'bold 18px Arial', '#ffffff', 'center', 0);
    }
    // rosters (not in the cold open: they would tell who falls)
    if (tag !== 'HIGHLIGHTS' && BW) bwRoster(g);
    if (BW && (tag === 'LIVE' || tag === 'REPLAY')) killFeed(g, sc);
    if (BW && tag === 'LIVE') bwBanner(g, sc);
    if (tag !== 'HIGHLIGHTS' && !BW) rec.teams.forEach((team, ti) => {
      // One player a side: a compact card each, name and health on one line, the held item under it.
      const h = 26 + team.players.length * 30, x = 1280 - 24 - 200, y = 100 + ti * (h + 8);
      roundedBox(x, y, 200, h, 6, 'rgba(8,10,16,.6)');
      ink.fillStyle = TEAM[team.name].shirt; ink.fillRect(x, y, 4, h);
      text(String(rec.players.find(p => p.team === team.name)?.model ?? teamLabel(team.name)).toUpperCase(), x + 14, y + 18, 'bold 11px Arial', TEAM[team.name].ink);
      team.players.forEach((name, pi) => {
        const i = names.indexOf(name), p = playerAt(i, g), dead = deathOf(name, g) !== undefined && g >= deathOf(name, g), yy = y + 36 + pi * 30;
        text(dead ? '✕ ' + name : name, x + 14, yy, (dead ? '' : 'bold ') + '13px Arial', dead ? '#7c7c84' : '#f2f2f2');
        ink.fillStyle = 'rgba(255,255,255,.12)'; ink.fillRect(x + 100, yy - 9, 86, 8);
        if (!dead) { ink.fillStyle = p.hp > 12 ? '#52d273' : p.hp > 6 ? '#f2c94c' : '#ef5350'; ink.fillRect(x + 100, yy - 9, 86 * clamp(p.hp / 20), 8); }
        const held = typeof p.held === 'number' ? 'blocks' : String(p.held ?? '').replace(/_/g, ' ');
        if (!dead && held) text(held, x + 14, yy + 15, '11px Arial', '#c9c4b5');
      });
    });
    // Pickups: who took what from a dead player's loot, for three seconds, in the taker's colour (a live shot)
    if (tag === 'LIVE' || tag === 'REPLAY') {
      const recent = pickups.filter(e => g >= e.t && g - e.t < 3 && gameAt(e.t) === gameAt(g)).slice(-5);
      recent.forEach((e, n) => {
        const yy = 600 - (recent.length - n) * 26, col = colourAt(e.by, g), what = String(typeof e.item.id === 'number' ? 'blocks' : e.item.id).replace(/_/g, ' ') + (e.item.count > 1 ? ` x${e.item.count}` : '');
        ink.globalAlpha = Math.min(1, (3 - (g - e.t)) / .4);
        roundedBox(28, yy - 18, 300, 24, 5, 'rgba(8,10,16,.7)'); ink.fillStyle = col.shirt; ink.fillRect(28, yy - 18, 4, 24);
        text(`${e.by} picked up ${what}`, 40, yy, 'bold 14px Arial', col.ink, 'left', 0);
        ink.globalAlpha = 1;
      });
    }
    // ELIMINATED: as it happens, on a live shot
    if (tag === 'LIVE' && !BW) for (const d of deaths) {
      if (d.t < sc.g[0] || d.t > sc.g[1] || g < d.t) continue;
      const since = (g - d.t) / Math.max(sc.speed, .05);
      if (since > 3.2) continue;
      const slide = ease(clamp(since / .25)), out = clamp((3.2 - since) / .3), w = 520, x = 640 - w / 2 + (1 - slide) * -80, y = 128;
      ink.globalAlpha = Math.min(slide, out);
      const by = killerOf(d), victim = colourAt(d.player, g), winner = by ? colourAt(by.from, g) : null;
      roundedBox(x, y, w, 92, 8, 'rgba(8,10,16,.88)');
      ink.fillStyle = victim.shirt; ink.fillRect(x, y, w, 26);
      text('ELIMINATED', x + w / 2, y + 19, 'bold 16px Arial', '#ffffff', 'center', 0);
      text(d.player.toUpperCase(), x + w / 2, y + 62, 'bold 34px Arial', '#ffffff', 'center');
      if (by) text(by.how + ' ' + by.from + (by.weapon ? '  ·  ' + String(by.weapon).replace(/_/g, ' ') : ''), x + w / 2, y + 84, 'bold 14px Arial', winner.ink, 'center', 0);
      ink.globalAlpha = 1;
    }
  }

  // Head to head: the players in a duel, their health and weapon, live.
  function versus(c, t, g) {
    const who = [c.a, c.b, c.c].filter(Boolean), x = 28, y = 98, h = 34 + who.length * 40;
    roundedBox(x, y, 300, h, 8, 'rgba(8,10,16,.78)');
    text('HEAD TO HEAD', x + 14, y + 22, 'bold 13px Arial', '#ffe7a3', 'left', 0);
    who.forEach((name, n) => {
      const p = playerAt(names.indexOf(name), g), dead = deathOf(name, g) !== undefined && g >= deathOf(name, g), team = colourAt(name, g), yy = y + 36 + n * 40;
      ink.fillStyle = team.shirt; ink.fillRect(x + 14, yy, 4, 32);
      text(name, x + 26, yy + 14, 'bold 16px Arial', dead ? '#7c7c84' : '#ffffff', 'left', 0);
      const held = dead ? 'OUT' : String(typeof p.held === 'number' ? 'blocks' : p.held ?? 'bare hands').replace(/_/g, ' '), pieces = (p.armor ?? []).filter(Boolean).length, armour = pieces ? `  ·  ${pieces} armour piece${pieces > 1 ? 's' : ''}` : '  ·  no armour';
      text(held + armour, x + 26, yy + 30, '12px Arial', '#c9c4b5', 'left', 0);
      ink.fillStyle = 'rgba(255,255,255,.12)'; ink.fillRect(x + 170, yy + 6, 90, 12);
      if (!dead) { ink.fillStyle = p.hp > 12 ? '#52d273' : p.hp > 6 ? '#f2c94c' : '#ef5350'; ink.fillRect(x + 170, yy + 6, 90 * clamp(p.hp / 20), 12); }
      text(dead ? '0' : String(Math.round(p.hp)), x + 286, yy + 17, 'bold 15px Arial', '#ffffff', 'right', 0);
    });
  }

  function caption(c, t, g) {
    const a = Math.min(1, (t - c.start) / .2, (c.end - t) / .3);
    if (a <= 0) return;
    ink.globalAlpha = a;
    if (c.kind === 'versus') versus(c, t, g);
    else if (c.kind === 'narrator') {
      // Commentary subtitles: the caller in white, the analyst in pale gold, a call ending in "!" a size up.
      const big = /!$/.test(c.text) && c.who === 'pbp', font = (big ? 'bold 27px' : 'bold 23px') + ' Arial', lines = wrapLines(c.text, font, 1000);
      const lh = big ? 34 : 30, y = 668 - lines.length * lh;
      const grad = ink.createLinearGradient(0, y - 30, 0, 690); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.75)'); ink.fillStyle = grad; ink.fillRect(0, y - 30, 1280, 690 - y + 30);
      lines.forEach((l, i) => text(l, 640, y + lh - 6 + i * lh, font, c.who === 'color' ? '#ffe7a3' : '#ffffff', 'center', 8));
    } else {
      const team = colourAt(c.who, g), label = c.who.toUpperCase() + '  ·  ' + (c.label ?? { chat: 'CHAT', interview: 'AFTER THE ROUND', strategy: 'PROGRAM LOG', thought: 'THINKING' }[c.kind] ?? 'THINKING');
      const shown = c.kind === 'thought' ? c.text.slice(0, Math.max(1, Math.floor((t - c.start) * 70))) : c.text;
      const lines = wrapLines(shown, '18px Arial', 600).slice(0, 5);
      const x = c.side === 'right' ? 1280 - 40 - 650 : 40, y = c.y ?? 440 - lines.length * 12;
      roundedBox(x, y, 650, 46 + lines.length * 24, 8, 'rgba(10,12,18,.8)');
      ink.fillStyle = team.shirt; ink.fillRect(x, y, 6, 46 + lines.length * 24);
      text(label, x + 20, y + 26, 'bold 14px Arial', team.ink, 'left', 0);
      lines.forEach((l, i) => text(l, x + 20, y + 52 + i * 24, (c.kind === 'thought' ? 'italic ' : '') + '18px Arial', '#f2efe8', 'left', 0));
    }
    ink.globalAlpha = 1;
  }

  // --- the diagrams: a cross-section of the map where a player hides, and a card of reasons ---
  const BLOCK_NAME = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [v, k]));
  const blockColour = (id) => {
    const n = BLOCK_NAME[id] ?? '';
    if (/GRASS_BLOCK|MOSS/.test(n)) return '#5f9e43';
    if (/LEAVES/.test(n)) return '#3c7a32';
    if (/DIRT|MUD|PODZOL|MYCEL/.test(n)) return '#7a5534';
    if (/LOG|WOOD|PLANK|STEM/.test(n)) return '#8a6239';
    if (/SAND/.test(n)) return '#d6c58c';
    if (/SNOW|ICE/.test(n)) return '#e4eef5';
    if (/END_STONE|PURPUR/.test(n)) return '#d9d6a0';
    if (/NETHER|MAGMA|BASALT|BLACKSTONE/.test(n)) return '#6e3a3a';
    return '#8b8b8f';
  };
  // A slice through the world at game time g (c.slice: axis 'x' or 'z' and the plane's coordinate `at`; `h` and `y` the
  // ranges shown): the map's blocks, the blocks the players placed this game (orange), the void below, each named
  // player where it stands (marked when it is off the plane), a trail of where one came from, and notes that appear one
  // by one, each with an arrow to a point of the slice.
  function slice(c, t, g, a) {
    const S = c.slice, [h0, h1] = S.h, [y0, y1] = S.y, W = 1000, H = 440, cell = Math.min(W / (h1 - h0 + 1), H / (y1 - y0 + 1));
    const ox = 640 - (h1 - h0 + 1) * cell / 2, oy = 150 + (H - (y1 - y0 + 1) * cell) / 2 + (y1 - y0 + 1) * cell;
    const X = (h) => ox + (h - h0) * cell, Y = (y) => oy - (y - y0 + 1) * cell;
    const gm = gameAt(g), placed = new Set();
    for (const [ct, x, y, z, id] of rec.blockChanges) { if (ct > g) break; if (gm && ct < gm.start) continue; const k = `${x},${y},${z}`; if (id) placed.add(k); else placed.delete(k); }
    ink.fillStyle = 'rgba(6,8,12,' + (.86 * a) + ')'; ink.fillRect(0, 0, 1280, 720);
    ink.globalAlpha = a;
    text(c.title, 640, 92, 'italic bold 38px Arial', '#ffffff', 'center', 12);
    if (c.sub) text(c.sub, 640, 124, 'bold 17px Arial', '#e7dcc4', 'center', 6);
    // sky and void
    const sky = ink.createLinearGradient(0, Y(y1), 0, Y(y0 - 1)); sky.addColorStop(0, '#1d3a5c'); sky.addColorStop(.75, '#22304a'); sky.addColorStop(1, '#2b0b3d');
    ink.fillStyle = sky; ink.fillRect(X(h0), Y(y1), (h1 - h0 + 1) * cell, (y1 - y0 + 1) * cell);
    text('THE VOID', X(h0) + 14, Y(y0) - 4, 'bold 14px Arial', '#c9a2ff', 'left', 0);
    for (let y = y0; y <= y1; y++) for (let h = h0; h <= h1; h++) {
      const [x, z] = S.axis === 'x' ? [S.at, h] : [h, S.at], id = world.getVoxel(x, y, z);
      if (!id || id === BLOCKS.WATER) continue;
      const mine = placed.has(`${x},${y},${z}`);
      ink.fillStyle = mine ? '#f2a83b' : blockColour(id); ink.fillRect(X(h), Y(y), cell - 1, cell - 1);
    }
    // the trail
    if (S.trail) {
      const i = names.indexOf(S.trail.who), col = colourAt(S.trail.who, g);
      ink.setLineDash([5, 5]); ink.lineWidth = 2.5; ink.strokeStyle = col.ink; ink.beginPath();
      let first = true;
      for (let tt = S.trail.from; tt <= Math.min(S.trail.to, g); tt += .25) { const p = playerAt(i, tt), hh = S.axis === 'x' ? p.z : p.x; if (hh < h0 - 3 || hh > h1 + 3) { first = true; continue; } const px = X(hh), py = Y(p.y) + cell * .1; if (first) ink.moveTo(px, py); else ink.lineTo(px, py); first = false; }
      ink.stroke(); ink.setLineDash([]);
    }
    // the players
    const pts = (S.players ?? []).map((n) => {
      const p = playerAt(names.indexOf(n), g), hh = S.axis === 'x' ? p.z : p.x, off = Math.abs((S.axis === 'x' ? p.x : p.z) - S.at - .5);
      return { n, x: X(hh), feet: Y(Math.floor(p.y)) + cell, off, col: colourAt(n, g) };
    });
    for (const q of pts) {
      ink.fillStyle = q.col.shirt; ink.fillRect(q.x - cell * .3, q.feet - cell * 1.8, cell * .6, cell * 1.8);
      ink.fillStyle = '#e8b98f'; ink.fillRect(q.x - cell * .3, q.feet - cell * 1.8, cell * .6, cell * .55);
      ink.lineWidth = 2; ink.strokeStyle = '#ffffff'; ink.strokeRect(q.x - cell * .3, q.feet - cell * 1.8, cell * .6, cell * 1.8);
      const label = q.n + (q.off > 2.5 ? `  (${Math.round(q.off)} behind)` : '');
      ink.font = 'bold 14px Arial'; const w = ink.measureText(label).width + 16;
      roundedBox(q.x - w / 2, q.feet - cell * 1.8 - 30, w, 24, 5, 'rgba(8,10,16,.88)'); ink.fillStyle = q.col.shirt; ink.fillRect(q.x - w / 2, q.feet - cell * 1.8 - 30, 4, 24);
      text(label, q.x + 2, q.feet - cell * 1.8 - 13, 'bold 14px Arial', q.col.ink, 'center', 0);
    }
    // the gap between the first two
    if (S.gap && pts.length >= 2) {
      const [p, q] = pts, dy = Math.round(Math.abs(playerAt(names.indexOf(p.n), g).y - playerAt(names.indexOf(q.n), g).y));
      const bx = Math.max(p.x, q.x) + cell * 1.6;
      ink.strokeStyle = '#ffe7a3'; ink.lineWidth = 3; ink.beginPath(); ink.moveTo(bx, p.feet); ink.lineTo(bx + 10, p.feet); ink.moveTo(bx + 5, p.feet); ink.lineTo(bx + 5, q.feet); ink.moveTo(bx, q.feet); ink.lineTo(bx + 10, q.feet); ink.stroke();
      const gl = S.gap.replace('{dy}', dy); ink.font = 'bold 15px Arial'; roundedBox(bx + 14, (p.feet + q.feet) / 2 - 14, ink.measureText(gl).width + 16, 26, 5, 'rgba(8,10,16,.88)');
      text(gl, bx + 22, (p.feet + q.feet) / 2 + 5, 'bold 15px Arial', '#ffe7a3', 'left', 0);
    }
    // the notes
    (S.notes ?? []).forEach((nt) => {
      const on = clamp((t - sc0(c) - nt.at) / .35); if (on <= 0) return;
      ink.globalAlpha = a * on;
      const lines = wrapLines(nt.text, 'bold 15px Arial', 300), bx = nt.box[0], by = nt.box[1], bw = Math.max(...lines.map((l) => { ink.font = 'bold 15px Arial'; return ink.measureText(l).width; })) + 26, bh = 14 + lines.length * 20;
      if (nt.point) { const px = X(nt.point[0]) + cell / 2, py = Y(nt.point[1]) + cell / 2; ink.strokeStyle = '#ffe7a3'; ink.lineWidth = 2.5; ink.beginPath(); ink.moveTo(bx + bw / 2, by + (py > by ? bh : 0)); ink.lineTo(px, py); ink.stroke(); ink.fillStyle = '#ffe7a3'; ink.beginPath(); ink.arc(px, py, 4, 0, Math.PI * 2); ink.fill(); }
      roundedBox(bx, by, bw, bh, 6, 'rgba(8,10,16,.9)'); ink.fillStyle = '#ffe7a3'; ink.fillRect(bx, by, 4, bh);
      lines.forEach((l, k) => text(l, bx + 14, by + 22 + k * 20, 'bold 15px Arial', '#f2efe8', 'left', 0));
      ink.globalAlpha = a;
    });
    // the key
    text('■', 60, 146, 'bold 14px Arial', '#f2a83b', 'left', 0); text('blocks the players placed', 76, 146, '13px Arial', '#c9c4b5', 'left', 0);
    text('■', 280, 146, 'bold 14px Arial', '#8b8b8f', 'left', 0); text('the map', 296, 146, '13px Arial', '#c9c4b5', 'left', 0);
    text(`a slice through the map, seen from the side  ·  game clock ${clock(playTime(g))}`, 1220, 146, '13px Arial', '#c9c4b5', 'right', 0);
    ink.globalAlpha = 1;
  }
  let sceneStartOf = new Map();
  const sc0 = (c) => sceneStartOf.get(c) ?? 0;
  // A card of reasons (c.explain): a title, and points that appear one by one, each a head and its explanation.
  function explain(c, t, a, sc) {
    const x = 150, w = 980, accent = c.accent ? (TEAM[c.accent]?.shirt ?? c.accent) : '#c9a227';
    ink.fillStyle = 'rgba(6,8,12,' + (.7 * a) + ')'; ink.fillRect(0, 0, 1280, 720);
    ink.globalAlpha = a;
    roundedBox(x - 24, 70, w + 48, 540, 14, 'rgba(8,10,16,.9)');
    roundedBox(x, 88, w, 66, 10, accent);
    text(c.title, x + 30, 133, 'italic bold 36px Arial', '#ffffff', 'left', 0);
    let y = 200;
    (c.points ?? []).forEach((pt, i) => {
      const on = clamp((t - sc.start - (c.pointsAt?.[i] ?? 1 + i * 3)) / .35); if (on <= 0) return;
      ink.globalAlpha = a * on;
      const [head, body, who] = pt, lines = body ? wrapLines(body, '19px Arial', w - 70) : [], col = who ? colourAt(who, sc.g[0]) : { shirt: accent, ink: '#ffe7a3' };
      ink.fillStyle = col.shirt; ink.fillRect(x + 4, y - 22, 6, 30 + lines.length * 25);
      text(head, x + 28, y, 'bold 23px Arial', who ? col.ink : '#ffffff', 'left', 6);
      lines.forEach((l, k) => text(l, x + 28, y + 28 + k * 25, '19px Arial', '#e7e1d2', 'left', 6));
      y += 52 + lines.length * 25;
      ink.globalAlpha = a;
    });
    ink.globalAlpha = 1;
  }

  function card(sc, t, g) {
    const k = (t - sc.start) / sc.dur, a = Math.min(1, k * 6, (1 - k) * 8), c = sc.card;
    sceneStartOf.set(c, sc.start);
    if (c.slice) { slice(c, t, g, a); return; }
    if (c.explain) { explain(c, t, a, sc); return; }
    ink.fillStyle = 'rgba(6,8,12,' + (.6 * a) + ')'; ink.fillRect(0, 0, 1280, 720);
    ink.globalAlpha = a;
    if (c.lineup && BW) {
      text(c.title, 640, 150, 'italic bold 64px Arial', '#ffffff', 'center', 16);
      text(c.sub, 640, 190, 'bold 18px Arial', '#e7dcc4', 'center', 8);
      const n = rec.squads.length, gap = 14, w = Math.min(220, (1280 - 120 - (n - 1) * gap) / n), x0 = 640 - (n * w + (n - 1) * gap) / 2;
      rec.squads.forEach((sq, i) => {
        const on = ease(clamp((t - sc.start - .5 - i * .45) / .4)), x = x0 + i * (w + gap), y = 250 + (1 - on) * 40, col = colourAt(sq.name, games[0].start + 1);
        ink.globalAlpha = a * on;
        roundedBox(x, y, w, 200, 10, 'rgba(8,10,16,.84)');
        ink.fillStyle = col.shirt; ink.fillRect(x, y, w, 50);
        text(sq.name, x + w / 2, y + 34, 'italic bold 26px Arial', '#ffffff', 'center', 0);
        wrapLines(String(sq.model ?? '').toUpperCase(), 'bold 12px Arial', w - 20).slice(0, 3).forEach((l, k) => text(l, x + w / 2, y + 82 + k * 18, 'bold 12px Arial', col.ink, 'center', 0));
        text(sq.players.join(' · '), x + w / 2, y + 176, '11px Arial', '#c9c4b5', 'center', 0);
        ink.globalAlpha = a;
      });
    } else if (c.lineup && rec.teams.length > 2) {
      // A free-for-all's line-up: a card a player, in a row, each in its colour, coming in one after another.
      text(c.title, 640, 150, 'italic bold 64px Arial', '#ffffff', 'center', 16);
      text(c.sub, 640, 190, 'bold 18px Arial', '#e7dcc4', 'center', 8);
      const n = rec.players.length, gap = 14, w = Math.min(220, (1280 - 120 - (n - 1) * gap) / n), x0 = 640 - (n * w + (n - 1) * gap) / 2;
      rec.players.forEach((p, i) => {
        const on = ease(clamp((t - sc.start - .5 - i * .45) / .4)), x = x0 + i * (w + gap), y = 250 + (1 - on) * 40, col = TEAM[p.team];
        ink.globalAlpha = a * on;
        roundedBox(x, y, w, 170, 10, 'rgba(8,10,16,.84)');
        ink.fillStyle = col.shirt; ink.fillRect(x, y, w, 50);
        text(p.name, x + w / 2, y + 34, 'italic bold 26px Arial', '#ffffff', 'center', 0);
        wrapLines(String(p.model ?? '').toUpperCase(), 'bold 12px Arial', w - 20).slice(0, 3).forEach((l, k) => text(l, x + w / 2, y + 82 + k * 18, 'bold 12px Arial', col.ink, 'center', 0));
        ink.globalAlpha = a;
      });
    } else if (c.lineup) {
      text(c.title, 640, 150, 'italic bold 64px Arial', '#ffffff', 'center', 16);
      text(c.sub, 640, 190, 'bold 18px Arial', '#e7dcc4', 'center', 8);
      rec.teams.forEach((team, ti) => {
        const right = ti === 1, x = right ? 700 : 120, slide = ease(clamp((t - sc.start - .4 - ti * .2) / .5)), dx = (1 - slide) * (right ? 120 : -120);
        const cardH = 96 + team.players.length * 48;
        roundedBox(x + dx, 230, 460, cardH, 10, 'rgba(8,10,16,.82)');
        ink.fillStyle = TEAM[team.name].shirt; ink.fillRect(x + dx, 230, 460, 56);
        text(teamLabel(team.name), x + dx + 230, 270, 'italic bold 34px Arial', '#ffffff', 'center', 0);
        team.players.forEach((name, n) => {
          const on = clamp((t - sc.start - 1.2 - n * .35 - ti * 1.9) / .25);
          ink.globalAlpha = a * on;
          text(name, x + dx + 40, 330 + n * 48, 'bold 28px Arial', '#ffffff', 'left', 0);
          text(String(rec.players.find(p => p.name === name)?.model ?? '').toUpperCase(), x + dx + 420, 330 + n * 48, 'bold 12px Arial', TEAM[team.name].ink, 'right', 0);
          ink.globalAlpha = a;
        });
      });
      text('VS', 640, 230 + (96 + Math.max(...rec.teams.map(tm => tm.players.length)) * 48) / 2 + 16, 'italic bold 44px Arial', '#ffe7a3', 'center', 10);
    } else if (c.result) {
      text(c.over ?? 'FULL TIME', 640, 170, 'bold 22px Arial', '#ffe7a3', 'center', 8);
      ink.fillStyle = TEAM[c.winnerTeam ?? story.winnerTeam ?? 'Red'].shirt; ink.fillRect(240, 196, 800, 110);
      text(c.title, 640, 280, 'italic bold 82px Arial', '#ffffff', 'center', 14);
      text(c.sub, 640, 345, 'bold 20px Arial', '#e7dcc4', 'center', 8);
      if (c.statsTitle !== '') text(c.statsTitle ?? 'PLAYER OF THE MATCH', 640, 410, 'bold 16px Arial', '#ffe7a3', 'center', 6);
      (c.stats ?? []).forEach((l, i) => { ink.globalAlpha = a * clamp((t - sc.start - 1.5 - i * .5) / .3); text(l, 640, 448 + i * 36, (i ? '' : 'bold ') + (i ? '22px' : '28px') + ' Arial', i ? '#f2efe8' : '#ffffff', 'center', 8); ink.globalAlpha = a; });
    } else if (c.profile) {
      // An agent's bot: its name in its team's colour, how it was made, and its key strategies, one by one.
      const team = BW ? colourAt(c.profile, games[0].start + 1) : TEAM[teamOf[c.profile]] ?? TEAM.Red, x = 150, w = 980;
      roundedBox(x - 24, 70, w + 48, 486, 14, 'rgba(8,10,16,.88)');
      roundedBox(x, 88, w, 70, 10, team.shirt);
      text(c.title, x + 30, 136, 'italic bold 40px Arial', '#ffffff', 'left', 0);
      text(String((rec.players.find(p => p.name === c.profile) ?? rec.squads?.find(q => q.name === c.profile))?.model ?? '').toUpperCase(), x + w - 30, 132, 'bold 16px Arial', '#ffffff', 'right', 0);
      if (c.sub) text(c.sub, x + 4, 192, 'bold 19px Arial', team.ink, 'left', 6);
      let y = 238;
      (c.points ?? []).forEach((pt, i) => {
        const on = clamp((t - sc.start - (c.pointsAt?.[i] ?? 1 + i * 2.2)) / .35); if (on <= 0) return;
        ink.globalAlpha = a * on;
        const [head, body] = Array.isArray(pt) ? pt : [pt, ''], lines = body ? wrapLines(body, '19px Arial', w - 70) : [];
        ink.fillStyle = team.shirt; ink.fillRect(x + 4, y - 20, 6, 28 + lines.length * 25);
        text(head, x + 28, y, 'bold 23px Arial', '#ffffff', 'left', 6);
        lines.forEach((l, k) => text(l, x + 28, y + 28 + k * 25, '19px Arial', '#e7e1d2', 'left', 6));
        y += 50 + lines.length * 25;
        ink.globalAlpha = a;
      });
    } else {
      text(c.title, 640, 330, 'bold 54px Arial', '#ffffff', 'center', 14);
      if (c.sub) wrapLines(c.sub, 'bold 22px Arial', 900).forEach((l, i) => text(l, 640, 380 + i * 30, 'bold 22px Arial', '#e7dcc4', 'center', 8));
    }
    ink.globalAlpha = 1;
  }

  // A standoff (a scene's `standoff`): two players alive who cannot reach each other, one perhaps hidden under an island.
  // Each named player gets a ring and a label where they are on screen, drawn over the world so a player behind rock is
  // still placed (the ring dashed then, and the label says so); with `gap`, a dashed line joins the first two and names
  // the height between them ({dy}, in blocks, from the recording).
  function standoff(sc, t, g) {
    const s = sc.standoff;
    const a = Math.min(1, (t - sc.start - (s.at ?? .4)) / .4, (sc.start + sc.dur - t) / .3); if (a <= 0) return;
    const pts = s.players.filter(n => deathOf(n, g) === undefined || g < deathOf(n, g)).map(n => {
      const p = playerAt(names.indexOf(n), g), feet = new T.Vector3(p.x, p.y, p.z).project(camera), top = new T.Vector3(p.x, p.y + 1.9, p.z).project(camera);
      const head = new T.Vector3(p.x, p.y + 1.6, p.z), body = new T.Vector3(p.x, p.y + .9, p.z), h = Math.abs(top.y - feet.y) * 360;
      return { n, p, x: (feet.x + top.x) / 2 * 640 + 640, y: (1 - (feet.y + top.y) / 2) * 360, r: clamp(h * .75, 16, 60), front: feet.z < 1,
        hidden: !sightClear(camera.position, head) && !sightClear(camera.position, body) };
    }).filter(q => q.front);
    ink.save(); ink.globalAlpha = a;
    const box = (lines, cx, cy, accent) => {
      const w = Math.max(...lines.map(([s, f]) => { ink.font = f; return ink.measureText(s).width; })) + 26, hh = 12 + lines.length * 20;
      const x = clamp(cx - w / 2, 24, 1040 - w), y = clamp(cy - hh / 2, 100, 560 - hh);
      roundedBox(x, y, w, hh, 6, 'rgba(8,10,16,.84)'); ink.fillStyle = accent; ink.fillRect(x, y, 4, hh);
      lines.forEach(([s, f, c], i) => text(s, x + 14, y + 22 + i * 20, f, c, 'left', 0));
    };
    if (s.gap && pts.length >= 2) {
      const [p, q] = pts, dy = Math.round(Math.abs(p.p.y - q.p.y));
      ink.setLineDash([12, 9]); ink.lineWidth = 3; ink.strokeStyle = '#ffe7a3'; ink.shadowColor = 'rgba(0,0,0,.8)'; ink.shadowBlur = 6;
      ink.beginPath(); ink.moveTo(p.x, p.y); ink.lineTo(q.x, q.y); ink.stroke(); ink.setLineDash([]); ink.shadowBlur = 0;
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, steep = Math.abs(q.y - p.y) > Math.abs(q.x - p.x);
      box([[s.gap.replace('{dy}', dy), 'bold 15px Arial', '#ffe7a3']], steep ? mx + 170 : mx, steep ? my : my + 40, '#ffe7a3');
    }
    // Labels above each ring; when two rings sit one over the other, the lower one's label goes beneath it.
    pts.forEach((q, i) => {
      const team = colourAt(q.n, g);
      ink.lineWidth = 3; ink.strokeStyle = team.ink; ink.setLineDash(q.hidden ? [7, 6] : []);
      ink.shadowColor = 'rgba(0,0,0,.8)'; ink.shadowBlur = 8; ink.beginPath(); ink.arc(q.x, q.y, q.r, 0, Math.PI * 2); ink.stroke(); ink.setLineDash([]); ink.shadowBlur = 0;
      if (q.hidden) { ink.fillStyle = team.shirt; ink.globalAlpha = a * .35; ink.beginPath(); ink.arc(q.x, q.y, q.r, 0, Math.PI * 2); ink.fill(); ink.globalAlpha = a; }
      const below = pts.some((o, k) => k !== i && o.y < q.y && Math.abs(o.x - q.x) < 220 && q.y - o.y < 170);
      const note = s.notes?.[q.n] ?? (q.hidden ? 'OUT OF SIGHT' : '');
      const lines = [[q.n, 'bold 17px Arial', team.ink], ...(note ? [[note, 'bold 12px Arial', '#f2efe8']] : []), ...(q.hidden ? [['behind the rock', 'italic 12px Arial', '#c9c4b5']] : [])];
      box(lines, q.x, below ? q.y + q.r + 14 + lines.length * 10 : q.y - q.r - 14 - lines.length * 10, team.shirt);
    });
    ink.restore();
  }

  // The replay wipe: a gold band with the word sweeps across as a replay starts and ends.
  function wipe(sc, t) {
    if (sc.tag !== 'REPLAY') return;
    for (const edge of [sc.start, sc.start + sc.dur]) {
      const u = (t - edge + .3) / .6; if (u < 0 || u > 1) continue;
      const x = -500 + u * 2300;
      ink.save(); ink.translate(x, 360); ink.rotate(-.18);
      ink.fillStyle = '#f2b705'; ink.fillRect(-260, -600, 520, 1200); ink.fillStyle = '#14110a'; ink.fillRect(-270, -600, 14, 1200); ink.fillRect(256, -600, 14, 1200);
      ink.rotate(.18); text('REPLAY', 0, 16, 'italic bold 52px Arial', '#14110a', 'center', 0);
      ink.restore();
    }
  }

  // A shot's lens placement is decided once for the whole shot (the film guidelines): try the scripted lens, then the
  // same lens from other sides, nearer, lower and higher, and keep the first from which every subject is in clear view
  // at each of seven moments, and the lens itself is in open air. Per-frame dodging made lenses hop; leaving it out put
  // a tree across the screen.
  const open = (v) => v === BLOCKS.AIR || v === BLOCKS.WATER || LEAVES.has(v);
  const sightClear = (from, to) => {
    const d = from.distanceTo(to), dir = to.clone().sub(from).normalize();
    for (let s = .2; s < d - .7; s += .25) {
      const p = from.clone().addScaledVector(dir, s);
      if (!open(world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))) return false;
    }
    return true;
  };
  const inOpenAir = (p) => { for (const [dx, dy, dz] of [[0, 0, 0], [.6, 0, 0], [-.6, 0, 0], [0, .6, 0], [0, -.6, 0], [0, 0, .6], [0, 0, -.6]]) if (!open(world.getVoxel(Math.floor(p.x + dx), Math.floor(p.y + dy), Math.floor(p.z + dz)))) return false; return true; };
  const subjectsOf = (cam, g) => cam.type === 'aerial' || cam.from ? [] : (cam.type === 'over' ? [cam.who, cam.at] : cam.who ? [cam.who].flat() : [cam.a, cam.b]).filter(n => deathOf(n, g) === undefined || g < deathOf(n, g) + 1);
  function lens(sc, opt, g, k) {
    const c = cameraFor(adjust(sc.cam, opt), g, k);
    if (opt.orbit) { const r = c.pos.clone().sub(c.look).applyAxisAngle(new T.Vector3(0, 1, 0), opt.orbit); c.pos = c.look.clone().add(r); c.pos.y = ground(c.pos); }
    return c;
  }
  const shotSetup = new Map();
  function setupFor(sc) {
    if (shotSetup.has(sc)) return shotSetup.get(sc);
    currentShot = null; syncWorld(sc.g[0], []);
    const options = [];
    for (const distK of [1, .75, .55, 1.4]) for (const rise of [1, .6, 1.6, 2.4, 4]) for (const orbit of [0, .5, -.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) options.push({ distK, rise, orbit, sideSign: 1 });
    let best = options[0], bestBlocked = Infinity;
    // A cutaway shot (a fight in a pocket under the quarry rim) takes its scripted lens and cuts the rock away instead.
    if (sc.cam.cutaway) options.unshift({ distK: 1, rise: 1, orbit: 0, sideSign: 1 });
    for (const opt of sc.cam.type === 'aerial' || sc.cam.from || sc.cam.cutaway ? [options[0]] : options) {
      let blocked = 0;
      for (let i = 0; i <= 6 && blocked < bestBlocked; i++) {
        const k = i / 6, g = sc.g[0] + (sc.g[1] - sc.g[0]) * k;
        syncWorld(g);
        const c = lens(sc, opt, g, k);
        if (!inOpenAir(c.pos)) { blocked += 2; continue; }
        for (const n of subjectsOf(sc.cam, g)) {
          const p = playerAt(names.indexOf(n), g);
          for (const h of [1, 1.7]) if (!sightClear(c.pos, new T.Vector3(p.x, p.y + h, p.z))) blocked++;
        }
        if (!subjectsOf(sc.cam, g).length && !sightClear(c.pos, c.look)) blocked++;
      }
      if (blocked < bestBlocked) { best = opt; bestBlocked = blocked; }
      if (!blocked) break;
    }
    best = { ...best, blocked: bestBlocked, trims: trimsFor(sc, best) }; shotSetup.set(sc, best);
    return best;
  }
  // The leaves on every line from the lens to its players (and a little either side), and around the lens itself.
  function trimsFor(sc, opt) {
    const cells = new Map(), add = (x, y, z, any = false) => { const k = `${x},${y},${z}`, v = world.getVoxel(x, y, z); if (!cells.has(k) && (LEAVES.has(v) || (any && v !== BLOCKS.AIR))) cells.set(k, [x, y, z, any]); };
    for (let i = 0; i <= 24; i++) {
      const k = i / 24, g = sc.g[0] + (sc.g[1] - sc.g[0]) * k;
      syncWorld(g, []);
      const c = lens(sc, opt, g, k);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) add(Math.floor(c.pos.x) + dx, Math.floor(c.pos.y) + dy, Math.floor(c.pos.z) + dz);
      const feet = Math.min(...subjectsOf(sc.cam, g).map(n => Math.floor(playerAt(names.indexOf(n), g).y)));
      const targets = subjectsOf(sc.cam, g).map(n => playerAt(names.indexOf(n), g)).flatMap(p => [new T.Vector3(p.x, p.y + .4, p.z), new T.Vector3(p.x, p.y + 1.2, p.z), new T.Vector3(p.x, p.y + 2.1, p.z)]);
      if (!targets.length && sc.cam.type !== 'aerial') targets.push(c.look);
      for (const to of targets) {
        const d = c.pos.distanceTo(to), dir = to.clone().sub(c.pos).normalize(), side = new T.Vector3(-dir.z, 0, dir.x).normalize();
        for (let s = 0; s < d - .3; s += .25) for (const o of [-.7, 0, .7]) { const p = c.pos.clone().addScaledVector(dir, s).addScaledVector(side, o); add(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), !!sc.cam.cutaway && Math.floor(p.y) >= feet); }
      }
    }
    return [...cells.values()];
  }
  const adjust = (cam, { distK, sideSign, rise }) => ({ ...cam, dist: (cam.dist ?? (cam.type === 'face' ? 3.6 : 6)) * distK, side: (cam.side ?? (cam.type === 'face' ? 1.4 : 2.5)) * sideSign, height: (cam.height ?? (cam.type === 'face' ? 1.9 : 3.2)) * rise, rise: (cam.rise ?? .35) * rise, angle: cam.angle ?? .6 });

  let currentShot = null;
  function renderFrame(t) {
    t = clamp(t, 0, story.duration);
    const sc = story.scenes.findLast(s => t >= s.start) ?? story.scenes[0];
    const k = clamp((t - sc.start) / sc.dur), g = sc.g[0] + (sc.g[1] - sc.g[0]) * (sc.ease ? ease(k) : k);
    const setup = setupFor(sc);
    if (currentShot !== sc) { syncWorld(g, setup.trims); currentShot = sc; } else syncWorld(g);
    placeActors(g);
    const c = lens(sc, setup, g, k);
    camera.position.copy(c.pos); camera.lookAt(c.look); camera.fov = c.fov; camera.updateProjectionMatrix();
    sun.position.copy(c.look).add(new T.Vector3(40, 70, 25)); sun.target.position.copy(c.look); sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
    // A replay is drawn a little washed out, as broadcasts do.
    ink.filter = sc.tag === 'REPLAY' || sc.tag === 'HIGHLIGHTS' ? 'saturate(.72) contrast(1.08) brightness(1.04)' : 'none';
    ink.drawImage(renderer.domElement, 0, 0, 1280, 720); ink.filter = 'none';
    const vg = ink.createRadialGradient(640, 380, 300, 640, 380, 820); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); ink.fillStyle = vg; ink.fillRect(0, 0, 1280, 720);
    hud(g, sc, t);
    if (sc.standoff && !sc.card) standoff(sc, t, g);
    if (sc.card) card(sc, t, g);
    for (const cap of story.captions) if (t >= cap.start && t < cap.end) caption(cap, t, g);
    for (const s of story.scenes) wipe(s, t);
    // letterbox and fades
    ink.fillStyle = '#07090c'; ink.fillRect(0, 0, 1280, 36); ink.fillRect(0, 684, 1280, 36);
    text('BLOCKYLAND  ·  AGENT ARENA', 30, 24, 'bold 11px Arial', '#c8c2b2'); text(story.header ?? '', 1250, 24, 'bold 11px Arial', '#c8c2b2', 'right');
    const fade = Math.max(1 - ease(t / .8), ease((t - story.duration + 1.5) / 1.5)); if (fade > 0) { ink.fillStyle = `rgba(0,0,0,${fade})`; ink.fillRect(0, 0, 1280, 720); }
    const seek = document.querySelector('#seek'); if (seek) seek.value = t;
    const time = document.querySelector('#time'); if (time) time.textContent = `${clock(t)} / ${clock(story.duration)}`;
    const label = document.querySelector('#shot'); if (label) label.textContent = sc.name;
    return { time: t, shot: sc.name, scene: sc.name, game: +g.toFixed(1), blocked: setup.blocked, trims: setup.trims?.length, cut: setup.trims?.filter(c => c[3]).length, lens: [setup.distK, setup.rise, +setup.orbit.toFixed(2)] };
  }

  // --- sound: a broadcast mix: a driving score, the crowd, every hit, a roar for each elimination, the commentary on top ---
  async function soundtrack() {
    const rate = 48000, ctx = new OfflineAudioContext(2, Math.ceil(story.duration * rate), rate);
    const master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
    const bed = ctx.createGain(); bed.connect(master); // music and crowd, ducked under the commentary
    const music = ctx.createGain(); music.gain.value = .8; music.connect(bed);
    const noise = ctx.createBuffer(1, rate * 3, rate), nd = noise.getChannelData(0);
    for (let i = 0, b0 = 0, b1 = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b0 = .99 * b0 + w * .1; b1 = .9 * b1 + w * .3; nd[i] = (b0 + b1 + w * .2) * .5; }
    const noiseAt = (at, dur, { type = 'bandpass', freq = 900, q = .7, gain = .3, attack = .01, out = bed } = {}) => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
      const env = ctx.createGain(); env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + attack); env.gain.exponentialRampToValueAtTime(.001, at + dur);
      src.connect(flt); flt.connect(env); env.connect(out); src.start(at, Math.random() * 2); src.stop(at + dur + .05);
      return { flt, env };
    };
    const tone = (at, freq, dur, { type = 'sine', gain = .2, to = null, out = bed } = {}) => {
      const o = ctx.createOscillator(), env = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, at); if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
      env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + .01); env.gain.exponentialRampToValueAtTime(.001, at + dur); o.connect(env); env.connect(out); o.start(at); o.stop(at + dur + .05);
    };
    // the score: a driving pulse, harder in the fights
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bar = 2, hz = m => 440 * 2 ** ((m - 69) / 12);
    for (let start = 0, n = 0; start < story.duration; start += bar, n++) {
      const sc = story.scenes.findLast(s => start >= s.start) ?? story.scenes[0], mood = sc.mood ?? 'calm';
      const level = { calm: .06, tense: .08, battle: .1, victory: .1 }[mood] ?? .06;
      for (const note of chords[n % 4]) tone(start, hz(note - (mood === 'victory' ? 0 : 12)), bar, { type: mood === 'battle' ? 'sawtooth' : 'triangle', gain: level / 3, out: music });
      tone(start, hz(chords[n % 4][0] - 24), bar * .9, { type: 'square', gain: level * .5, out: music });
      const beats = mood === 'calm' ? 4 : 8;
      for (let b = 0; b < beats; b++) {
        const at = start + b * bar / beats;
        tone(at, 130, .2, { gain: mood === 'battle' ? .4 : .26, to: 42, out: music });
        if (b % 2 && mood !== 'calm') noiseAt(at, .08, { type: 'highpass', freq: 6000, gain: .05, out: music });
      }
    }
    // the crowd: a murmur all through, louder in the fights
    for (const sc of story.scenes) {
      const level = sc.card ? .05 : ({ calm: .05, tense: .08, battle: .12, victory: .2 }[sc.mood] ?? .06);
      const { env } = noiseAt(sc.start, sc.dur + .3, { freq: 700, q: .5, gain: level, attack: .4 });
      env.gain.setValueAtTime(level, sc.start + sc.dur - .2);
    }
    // every hit on screen; a roar and an impact for each elimination called live
    for (const sc of story.scenes) {
      if (sc.speed > 1.2) continue;
      const at = (gt) => sc.start + (gt - sc.g[0]) / Math.max(sc.speed, .05);
      for (const h of hits) if (h.t >= sc.g[0] && h.t <= sc.g[1]) {
        const t = at(h.t); noiseAt(t, .12, { type: 'highpass', freq: 1800, gain: .22, out: master }); tone(t, 110, .18, { gain: .45, to: 50, out: master });
      }
      if (sc.tag === 'LIVE') for (const b of bedEvents) if (b.t >= sc.g[0] && b.t <= sc.g[1]) {
        const t = at(b.t); noiseAt(t, .5, { type: 'lowpass', freq: 900, gain: .5, out: master }); tone(t, 55, .9, { gain: .7, to: 25, out: master });
        const roar = noiseAt(t + .1, 3.6, { freq: 1100, q: .4, gain: .55, attack: .25 }); roar.flt.frequency.linearRampToValueAtTime(1800, t + .8);
      }
      if (sc.tag === 'LIVE') for (const d of deaths) if (d.t >= sc.g[0] && d.t <= sc.g[1] && (!BW || d.final)) {
        const t = at(d.t); tone(t, 70, .6, { gain: .6, to: 30, out: master });
        const roar = noiseAt(t, 3.2, { freq: 1100, q: .4, gain: .45, attack: .25 }); roar.flt.frequency.linearRampToValueAtTime(1600, t + .6);
      }
    }
    // the horn: kick-off and the final whistle
    const horn = (at) => { for (const [f, d] of [[311, 0], [466, .02]]) tone(at + d, f, 1.1, { type: 'sawtooth', gain: .09, out: master }); };
    for (const name of [story.kickoffScene].flat()) { const kickoff = story.scenes.find(s => s.name === name); if (kickoff) horn(kickoff.start + .05); }
    for (const name of [story.finalScene].flat()) {
      const last = story.scenes.find(s => s.name === name), end = last && deaths.filter(d => d.t >= last.g[0] && d.t <= last.g[1]).at(-1);
      if (last && end) horn(last.start + (end.t - last.g[0]) / last.speed + .1);
    }
    // replay swooshes
    for (const sc of story.scenes) if (sc.tag === 'REPLAY') for (const at of [sc.start - .3, sc.start + sc.dur - .3]) { const s = noiseAt(at, .6, { freq: 400, q: 1.5, gain: .25, attack: .25, out: master }); s.flt.frequency.exponentialRampToValueAtTime(4000, at + .55); }
    // the commentary, with the bed ducked under each line
    const report = [];
    for (const line of story.narration) {
      const clip = narration?.clips?.[line.id];
      if (!clip) { report.push({ id: line.id, missing: true }); continue; }
      const data = await (await fetch(base + '/narration/' + clip.file)).arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const s = ctx.createBufferSource(); s.buffer = buffer; const g = ctx.createGain(); g.gain.value = 1.15; s.connect(g); g.connect(master); s.start(line.start);
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

  // --- the page: play, seek, and the renderer's hooks ---
  let pendingAudio, playing = false, position = 0, source, startedAt, actx;
  const buildAudio = () => pendingAudio ??= soundtrack().then(r => { window.pilot.audioReport = r.report; return r.buffer; });
  const play = document.querySelector('#play'), restart = document.querySelector('#restart'), seekBar = document.querySelector('#seek');
  if (seekBar) seekBar.max = story.duration;
  const stop = () => { playing = false; source?.stop(); source = null; if (play) play.textContent = 'Play film'; };
  async function start() { if (position >= story.duration) position = 0; const data = await buildAudio(); actx ??= new AudioContext(); await actx.resume(); source = actx.createBufferSource(); source.buffer = data; source.connect(actx.destination); source.start(0, position); startedAt = performance.now() / 1000 - position; playing = true; play.textContent = 'Pause'; }
  function tick() { if (playing) { position = Math.min(story.duration, performance.now() / 1000 - startedAt); renderFrame(position); if (position >= story.duration) stop(); } requestAnimationFrame(tick); }
  if (play) { play.disabled = restart.disabled = false; play.onclick = () => playing ? stop() : start(); restart.onclick = () => { stop(); position = 0; renderFrame(0); }; seekBar.oninput = e => { stop(); position = Number(e.target.value); renderFrame(position); }; }
  window.pilot = {
    ready: true, story, renderFrame, buildAudio, async wavBase64() { return wavBase64(await buildAudio()); },
    capture(t) { renderFrame(t); return canvas.toDataURL('image/jpeg', .95).split(',')[1]; },
    poster(t) { renderFrame(t); return canvas.toDataURL('image/png').split(',')[1]; },
  };
  renderFrame(story.posterTime ?? 3); requestAnimationFrame(tick);
}

main().catch(error => { status(`The film could not load: ${error.message}`); console.error(error); });
