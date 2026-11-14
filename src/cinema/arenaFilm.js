// The team battle film: a replay of an arena game (arena/sim.js) cut into a short documentary.
//
// The world is the game's own: the Overworld regenerated from the recorded seed, with every recorded block change
// applied up to the moment on screen (and undone when a cut goes back in time). The ten players are actors in team
// colours, placed from the recording's frames (one every 0.25 s of game time). The edit (arenaEdit.js) is a list of
// scenes: each maps film time onto a stretch of game time (a time-lapse for gathering, real time for a fight), says
// where the camera goes, and carries the captions: what an agent was thinking, what a team said in chat, and the
// narrator's lines. Frames are a pure function of film time, so the renderer (scripts/render-film.mjs) can render any
// frame in any order.
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
import { ARENA_EDIT, arenaTimeline } from './arenaEdit.js';
import { buildArenaMap } from '../../arena/map.js';

const EXPORTING = new URLSearchParams(globalThis.location?.search ?? '').has('export');
const OUT = EXPORTING ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
const TEAM = { Red: { shirt: '#c8373a', pants: '#4a2a2a', ink: '#ff8a8a' }, Blue: { shirt: '#2f5fd0', pants: '#26304a', ink: '#8fb4ff' } };
const LOOKS = [
  { skin: '#e8b98f', hair: '#3b2416' }, { skin: '#c98e62', hair: '#151010' }, { skin: '#f0c8a0', hair: '#c9a35a' },
  { skin: '#8d5a3b', hair: '#0d0b0a' }, { skin: '#e0ae84', hair: '#7a3b1c' },
];

const story = { ...ARENA_EDIT, ...arenaTimeline() };
const status = (s) => { const el = document.querySelector('#stage p'); if (el) el.textContent = s; };

async function main() {
  status('Loading the game recording…');
  const base = `${import.meta.env?.BASE_URL ?? '/'}${story.data.replace(/^\//, '')}`;
  const rec = await (await fetch(`${base}/recording.json`)).json();
  const narration = await fetch(`${base}/narration/manifest.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  // A narrator's caption stays up as long as the voiced line.
  for (const c of story.captions) if (c.kind === 'narrator' && narration?.clips?.[c.id]) c.end = c.start + narration.clips[c.id].duration + .4;

  // --- renderer and scene ---
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(OUT.width, OUT.height);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene(); scene.background = new T.Color(0x9cc8ec); scene.fog = new T.Fog(0xb9d7ee, 70, 230);
  const camera = new T.PerspectiveCamera(50, 16 / 9, .1, 500);
  const hemi = new T.HemisphereLight(0xdcecff, 0x6d7a52, 1.8), sun = new T.DirectionalLight(0xfff0d0, 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .04; sun.shadow.bias = -.0005;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(hemi, sun, sun.target);

  // --- the world, regenerated, and its block changes over time ---
  status('Growing the forest from the game’s seed…');
  const textures = new TextureManager(); await textures.init();
  const world = new World(rec.seed, rec.biome || 'forest');
  const X0 = -6, X1 = 5, Z0 = -5, Z1 = 4;
  // The arena's map is made from the seed, as the game made it (arena/map.js); the recording holds only what the
  // players changed after that.
  if ((rec.version ?? 1) >= 2) buildArenaMap(world, { seed: rec.seed, spread: rec.spread ?? 48 });
  else for (let cx = X0; cx <= X1; cx++) for (let cz = Z0; cz <= Z1; cz++) world.getOrCreateChunk(cx, cz);
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

  // --- the players: the game's own player model (playerModel.js), as another player sees one ---
  // Each wears Steve's skin redyed: the shirt in the team's colour, and their own hair and skin tone, so the face, the
  // eyes and the shading are the game's.
  status('Dressing the players…');
  const names = rec.players.map(p => p.name);
  const teamOf = Object.fromEntries(rec.players.map(p => [p.name, p.team]));
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
  const actors = names.map((name, i) => {
    const team = TEAM[teamOf[name]], look = LOOKS[i % 5];
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
  });
  // Every skin is loaded before the first frame.
  await Promise.all(actors.map(a => new Promise(resolve => { const tick = () => a.baseMaterial.map?.image?.width ? resolve() : setTimeout(tick, 20); tick(); })));
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
  const arrows = rec.events.filter(e => e.kind === 'arrow');
  const hits = rec.events.filter(e => e.kind === 'hit');
  const deaths = rec.events.filter(e => e.kind === 'death');
  const deathAt = Object.fromEntries(deaths.map(d => [d.player, d.t]));

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
  const holdAt = (i, g) => holds.findLast(h => h.i === i && g >= h.from);
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
  const shotsFrom = Object.fromEntries(names.map(n => [n, arrows.filter(a => a.from === n).map(a => a.t)]));
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
  function placeActors(g) {
    names.forEach((name, i) => {
      const actor = actors[i], p = playerAt(i, g), died = deathAt[name];
      const fallen = died !== undefined && g >= died;
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
      const shot = shotsFrom[name].find(t => g >= t - .6 && g <= t + .1);
      if (shot !== undefined) {
        actor.rightArm.rotation.set(ARM_FORWARD * (Math.PI / 2 + p.pitch), .1, 0); actor.leftArm.rotation.set(ARM_FORWARD * (Math.PI / 2 + p.pitch), -.4, 0);
      } else if (u < 1) actor.rightArm.rotation.x = ARM_FORWARD * Math.sin(u * Math.PI) * 1.2;
      else if (p.swing) actor.rightArm.rotation.x = ARM_FORWARD * Math.sin(((g / .3) % 1) * Math.PI) * 1.2;
      // red while hurt or dying
      const hurt = fallen || hitsTo[name].some(h => g >= h.t && g - h.t < HURT);
      if (actor.userData.hurt !== hurt) { tint(actor, hurt ? red : white); actor.userData.hurt = hurt; }
      // what they hold and wear
      const key = p.held ?? null;
      if (actor.userData.heldKey !== key) { actor.userData.hand.clear(); if (key !== null) actor.userData.hand.add(heldMesh(key)); actor.userData.heldKey = key; }
      const armorKey = p.armor.filter(Boolean).join(',');
      if (actor.userData.armorKey !== armorKey) { actor.updateArmor(armorSlots(p.armor)); actor.userData.armorKey = armorKey; actor.traverse(o => { if (o.isMesh) o.castShadow = true; }); if (hurt) tint(actor, red); }
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
    // arrows
    arrowLine.clear();
    for (const a of arrows) if (g >= a.t - .5 && g < a.t + .05) {
      const u = clamp((g - (a.t - .5)) / .5), from = new T.Vector3(a.a[0], a.a[1] + 1.5, a.a[2]), to = new T.Vector3(a.b[0], a.b[1] + 1.2, a.b[2]);
      const at = from.clone().lerp(to, u).add(new T.Vector3(0, Math.sin(u * Math.PI) * 1.2, 0)), dir = to.clone().sub(from).normalize();
      const shaft = new T.Mesh(new T.BoxGeometry(.05, .05, .8), new T.MeshBasicMaterial({ color: 0xeee6d0 })); shaft.position.copy(at); shaft.lookAt(at.clone().add(dir)); arrowLine.add(shaft);
    }
    border.scale.set(borderRadius(g), 1, borderRadius(g)); border.position.set(0, 30, 0);
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
    if (cam.type === 'pair' || cam.type === 'group') {
      const who = cam.who ?? [cam.a, cam.b];
      const ps = who.filter(n => deathAt[n] === undefined || g < deathAt[n] + 1.5).map(n => centreOf(n, g));
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
  const kills = deaths.map(d => ({ ...d }));

  // --- the broadcast graphics ---
  const alive = (team, g) => rec.teams.find(t => t.name === team).players.filter(n => deathAt[n] === undefined || g < deathAt[n]).length;
  const roundedBox = (x, y, w, h, r, fill) => { ink.beginPath(); ink.roundRect(x, y, w, h, r); ink.fillStyle = fill; ink.fill(); };
  const killer = Object.fromEntries(deaths.map(d => [d.player, hits.filter(h => h.to === d.player && h.t <= d.t + .01).at(-1)]));
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
    // the scoreboard: players still standing on each side
    if (tag !== 'HIGHLIGHTS') {
      const x = 640 - 230, y = 46;
      roundedBox(x, y, 460, 44, 6, 'rgba(8,10,16,.82)');
      ink.fillStyle = TEAM.Red.shirt; ink.fillRect(x, y, 150, 44); ink.fillStyle = TEAM.Blue.shirt; ink.fillRect(x + 310, y, 150, 44);
      text('RED', x + 16, y + 29, 'bold 20px Arial', '#ffffff', 'left', 0); text(String(alive('Red', g)), x + 132, y + 32, 'bold 30px Arial', '#ffffff', 'right', 0);
      text('BLUE', x + 444, y + 29, 'bold 20px Arial', '#ffffff', 'right', 0); text(String(alive('Blue', g)), x + 328, y + 32, 'bold 30px Arial', '#ffffff', 'left', 0);
      text('ROUND ' + (Math.floor(g / rec.roundSeconds) + 1), 640, y + 19, 'bold 13px Arial', '#bcd8ff', 'center', 0);
      text(clock(g), 640, y + 38, 'bold 18px Arial', '#ffffff', 'center', 0);
    }
    // rosters (not in the cold open: they would tell who falls)
    if (tag !== 'HIGHLIGHTS') rec.teams.forEach((team, ti) => {
      const x = 1280 - 24 - 190, y = 100 + ti * 116;
      roundedBox(x, y, 190, 110, 6, 'rgba(8,10,16,.6)');
      ink.fillStyle = TEAM[team.name].shirt; ink.fillRect(x, y, 4, 110);
      text(team.name.toUpperCase(), x + 14, y + 20, 'bold 13px Arial', TEAM[team.name].ink);
      team.players.forEach((name, pi) => {
        const i = names.indexOf(name), p = playerAt(i, g), dead = deathAt[name] !== undefined && g >= deathAt[name], yy = y + 38 + pi * 16;
        text(dead ? '✕ ' + name : name, x + 14, yy, (dead ? '' : 'bold ') + '12px Arial', dead ? '#7c7c84' : '#f2f2f2');
        ink.fillStyle = 'rgba(255,255,255,.12)'; ink.fillRect(x + 64, yy - 9, 72, 8);
        if (!dead) { ink.fillStyle = p.hp > 12 ? '#52d273' : p.hp > 6 ? '#f2c94c' : '#ef5350'; ink.fillRect(x + 64, yy - 9, 72 * clamp(p.hp / 20), 8); }
        const held = String(p.held ?? '').replace(/_/g, ' ');
        if (!dead && held && !/^\d+$/.test(held)) text(held.slice(0, 12), x + 142, yy, '10px Arial', '#c9c4b5');
      });
    });
    // ELIMINATED: as it happens, on a live shot
    if (tag === 'LIVE') for (const d of deaths) {
      if (d.t < sc.g[0] || d.t > sc.g[1] || g < d.t) continue;
      const since = (g - d.t) / Math.max(sc.speed, .05);
      if (since > 3.2) continue;
      const slide = ease(clamp(since / .25)), out = clamp((3.2 - since) / .3), w = 520, x = 640 - w / 2 + (1 - slide) * -80, y = 128;
      ink.globalAlpha = Math.min(slide, out);
      const by = killer[d.player], victim = TEAM[teamOf[d.player]], winner = by ? TEAM[teamOf[by.from]] : null;
      roundedBox(x, y, w, 92, 8, 'rgba(8,10,16,.88)');
      ink.fillStyle = victim.shirt; ink.fillRect(x, y, w, 26);
      text('ELIMINATED', x + w / 2, y + 19, 'bold 16px Arial', '#ffffff', 'center', 0);
      text(d.player.toUpperCase(), x + w / 2, y + 62, 'bold 34px Arial', '#ffffff', 'center');
      if (by) text('by ' + by.from + '  ·  ' + String(by.weapon).replace(/_/g, ' '), x + w / 2, y + 84, 'bold 14px Arial', winner.ink, 'center', 0);
      ink.globalAlpha = 1;
    }
  }

  // Head to head: the players in a duel, their health and weapon, live.
  function versus(c, t, g) {
    const who = [c.a, c.b, c.c].filter(Boolean), x = 28, y = 98, h = 34 + who.length * 40;
    roundedBox(x, y, 300, h, 8, 'rgba(8,10,16,.78)');
    text('HEAD TO HEAD', x + 14, y + 22, 'bold 13px Arial', '#ffe7a3', 'left', 0);
    who.forEach((name, n) => {
      const p = playerAt(names.indexOf(name), g), dead = deathAt[name] !== undefined && g >= deathAt[name], team = TEAM[teamOf[name]], yy = y + 36 + n * 40;
      ink.fillStyle = team.shirt; ink.fillRect(x + 14, yy, 4, 32);
      text(name, x + 26, yy + 14, 'bold 16px Arial', dead ? '#7c7c84' : '#ffffff', 'left', 0);
      const held = dead ? 'OUT' : String(p.held ?? 'bare hands').replace(/_/g, ' '), armour = (p.armor ?? []).filter(Boolean).length ? '  ·  iron chestplate' : '';
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
      const team = TEAM[teamOf[c.who]] ?? TEAM.Red, label = c.kind === 'chat' ? c.who.toUpperCase() + '  ·  TEAM RADIO' : c.who.toUpperCase() + '  ·  THINKING';
      const shown = c.kind === 'thought' ? c.text.slice(0, Math.max(1, Math.floor((t - c.start) * 70))) : c.text;
      const lines = wrapLines(shown, '18px Arial', 600).slice(0, 5);
      const x = c.side === 'right' ? 1280 - 40 - 650 : 40, y = 440 - lines.length * 12;
      roundedBox(x, y, 650, 46 + lines.length * 24, 8, 'rgba(10,12,18,.8)');
      ink.fillStyle = team.shirt; ink.fillRect(x, y, 6, 46 + lines.length * 24);
      text(label, x + 20, y + 26, 'bold 14px Arial', team.ink, 'left', 0);
      lines.forEach((l, i) => text(l, x + 20, y + 52 + i * 24, (c.kind === 'thought' ? 'italic ' : '') + '18px Arial', '#f2efe8', 'left', 0));
    }
    ink.globalAlpha = 1;
  }

  function card(sc, t) {
    const k = (t - sc.start) / sc.dur, a = Math.min(1, k * 6, (1 - k) * 8), c = sc.card;
    ink.fillStyle = 'rgba(6,8,12,' + (.6 * a) + ')'; ink.fillRect(0, 0, 1280, 720);
    ink.globalAlpha = a;
    if (c.lineup) {
      text(c.title, 640, 150, 'italic bold 64px Arial', '#ffffff', 'center', 16);
      text(c.sub, 640, 190, 'bold 18px Arial', '#e7dcc4', 'center', 8);
      rec.teams.forEach((team, ti) => {
        const right = ti === 1, x = right ? 700 : 120, slide = ease(clamp((t - sc.start - .4 - ti * .2) / .5)), dx = (1 - slide) * (right ? 120 : -120);
        roundedBox(x + dx, 230, 460, 330, 10, 'rgba(8,10,16,.82)');
        ink.fillStyle = TEAM[team.name].shirt; ink.fillRect(x + dx, 230, 460, 56);
        text(team.name.toUpperCase(), x + dx + 230, 270, 'italic bold 34px Arial', '#ffffff', 'center', 0);
        team.players.forEach((name, n) => {
          const on = clamp((t - sc.start - 1.2 - n * .35 - ti * 1.9) / .25);
          ink.globalAlpha = a * on;
          text(name, x + dx + 40, 330 + n * 48, 'bold 28px Arial', '#ffffff', 'left', 0);
          text(n === 0 ? 'CAPTAIN' : 'CLAUDE AGENT', x + dx + 420, 330 + n * 48, 'bold 12px Arial', TEAM[team.name].ink, 'right', 0);
          ink.globalAlpha = a;
        });
      });
      text('VS', 640, 410, 'italic bold 44px Arial', '#ffe7a3', 'center', 10);
    } else if (c.result) {
      text('FULL TIME', 640, 170, 'bold 22px Arial', '#ffe7a3', 'center', 8);
      ink.fillStyle = TEAM.Red.shirt; ink.fillRect(240, 196, 800, 110);
      text(c.title, 640, 280, 'italic bold 82px Arial', '#ffffff', 'center', 14);
      text(c.sub, 640, 345, 'bold 20px Arial', '#e7dcc4', 'center', 8);
      text('PLAYER OF THE MATCH', 640, 410, 'bold 16px Arial', '#ffe7a3', 'center', 6);
      (c.stats ?? []).forEach((l, i) => { ink.globalAlpha = a * clamp((t - sc.start - 1.5 - i * .5) / .3); text(l, 640, 448 + i * 36, (i ? '' : 'bold ') + (i ? '22px' : '28px') + ' Arial', i ? '#f2efe8' : '#ffffff', 'center', 8); ink.globalAlpha = a; });
    } else {
      text(c.title, 640, 330, 'bold 54px Arial', '#ffffff', 'center', 14);
      if (c.sub) wrapLines(c.sub, 'bold 22px Arial', 900).forEach((l, i) => text(l, 640, 380 + i * 30, 'bold 22px Arial', '#e7dcc4', 'center', 8));
    }
    ink.globalAlpha = 1;
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
  const subjectsOf = (cam, g) => cam.type === 'aerial' || cam.from ? [] : (cam.who ? [cam.who].flat() : [cam.a, cam.b]).filter(n => deathAt[n] === undefined || g < deathAt[n] + 1);
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
    if (sc.card) card(sc, t);
    for (const cap of story.captions) if (t >= cap.start && t < cap.end) caption(cap, t, g);
    for (const s of story.scenes) wipe(s, t);
    // letterbox and fades
    ink.fillStyle = '#07090c'; ink.fillRect(0, 0, 1280, 36); ink.fillRect(0, 684, 1280, 36);
    text('BLOCKYLAND  ·  AGENT ARENA', 30, 24, 'bold 11px Arial', '#c8c2b2'); text('RED vs BLUE  ·  5 v 5', 1250, 24, 'bold 11px Arial', '#c8c2b2', 'right');
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
      if (sc.tag === 'LIVE') for (const d of deaths) if (d.t >= sc.g[0] && d.t <= sc.g[1]) {
        const t = at(d.t); tone(t, 70, .6, { gain: .6, to: 30, out: master });
        const roar = noiseAt(t, 3.2, { freq: 1100, q: .4, gain: .45, attack: .25 }); roar.flt.frequency.linearRampToValueAtTime(1600, t + .6);
      }
    }
    // the horn: kick-off and the final whistle
    const horn = (at) => { for (const [f, d] of [[311, 0], [466, .02]]) tone(at + d, f, 1.1, { type: 'sawtooth', gain: .09, out: master }); };
    const kickoff = story.scenes.find(s => s.name === 'Wood and stone'); if (kickoff) horn(kickoff.start + .05);
    const last = story.scenes.find(s => s.name === 'The last duel'), end = deaths.at(-1);
    if (last && end) horn(last.start + (end.t - last.g[0]) / last.speed + .1);
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
