#!/usr/bin/env node
// Converts a Horizon 26.3 run (`replication/runs/hz-dry10-gemini/film/{states,events,*-transcript}.jsonl`)
// into the exact schema consumed by `replication/film/build.mjs` (`recording/frames.jsonl`, `recording/blocks.jsonl`,
// `events.jsonl`, `programs/<Name>.jsonl`), and copies the 4 Horizon MP4 captures to `public/cinema-replication/hz-dry10-gemini/`.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { World } from '../../src/world.js';
import { BLOCKS } from '../../src/blocks.js';
import { WORLD_STRUCTURE_IDS, withEndFixtures } from '../../src/worldStructures.js';

const repo = path.resolve(import.meta.dirname, '..', '..');
const runName = process.argv[2] || 'hz-dry10-gemini';
const runDir = path.join(repo, 'replication', 'runs', runName);
const filmDir = path.join(runDir, 'film');
const recDir = path.join(runDir, 'recording');
const progDir = path.join(runDir, 'programs');
const pubDir = path.join(repo, 'public', 'cinema-replication', runName);

mkdirSync(recDir, { recursive: true });
mkdirSync(progDir, { recursive: true });
mkdirSync(pubDir, { recursive: true });

const NAMES = ['Aria', 'Basil', 'Corin', 'Delphi'];
const meta = JSON.parse(readFileSync(path.join(filmDir, 'run-meta.json'), 'utf8'));
const t0 = meta.startWall;
const totalSec = meta.seconds || 600;

// Build Blockyland reference terrain for seed 20261103 so 3D camera heights match the rendered world
const STRUCTURES = withEndFixtures([
  ...WORLD_STRUCTURE_IDS, 'stronghold', 'village_desert', 'village_savanna', 'village_snowy', 'village_taiga',
  'ruined_portal', 'ruined_portal_desert', 'ruined_portal_jungle', 'ruined_portal_mountain', 'ruined_portal_swamp'
]);
const world = new World(20261103, 'all');
world.generationMode = 'procedural';
world.rebuildStructures({ enabledIds: STRUCTURES });
for (let cx = -3; cx <= 3; cx++) {
  for (let cz = -5; cz <= 3; cz++) {
    world.getOrCreateChunk(cx, cz);
  }
}
const LEAVES = new Set(Object.entries(BLOCKS).filter(([k]) => k.endsWith('LEAVES') || k.endsWith('LOG') || k.endsWith('WOOD')).map(([, v]) => v));
const floorCache = new Map();
function floorY(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), key = `${ix},${iz}`;
  if (floorCache.has(key)) return floorCache.get(key);
  let y = 62;
  for (let v; y > 1 && ((v = world.getVoxel(ix, y, iz)) === BLOCKS.AIR || LEAVES.has(v)); y--);
  const res = y + 1;
  floorCache.set(key, res);
  return res;
}

// Smooth bilinear floorY for continuous player interpolation on the surface
function smoothFloorY(x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const h00 = floorY(x0, z0), h10 = floorY(x0 + 1, z0);
  const h01 = floorY(x0, z0 + 1), h11 = floorY(x0 + 1, z0 + 1);
  return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
}

function mapY(x, horizonY, z) {
  const surf = smoothFloorY(x, z);
  if (horizonY >= 66) {
    return surf;
  }
  const depth = 67 - horizonY;
  return Math.max(4, surf - depth);
}

function mapBlockY(x, horizonY, z) {
  const surf = floorY(x, z);
  if (horizonY >= 66) {
    return surf + Math.max(0, Math.min(3, Math.round(horizonY - 67)));
  }
  const depth = 67 - Math.round(horizonY);
  return Math.max(4, surf - depth);
}

const BLOCK_ID_MAP = {
  air: BLOCKS.AIR,
  stone: BLOCKS.STONE,
  cobblestone: BLOCKS.COBBLESTONE,
  dirt: BLOCKS.DIRT,
  grass_block: BLOCKS.GRASS,
  oak_log: BLOCKS.OAK_LOG,
  birch_log: BLOCKS.BIRCH_LOG,
  spruce_log: BLOCKS.SPRUCE_LOG,
  oak_planks: BLOCKS.OAK_PLANKS,
  crafting_table: BLOCKS.CRAFTING_TABLE,
  furnace: BLOCKS.LIT_FURNACE ?? BLOCKS.FURNACE,
  torch: BLOCKS.TORCH,
  wall_torch: BLOCKS.TORCH,
  coal_ore: BLOCKS.COAL_ORE,
  deepslate_coal_ore: BLOCKS.COAL_ORE,
  iron_ore: BLOCKS.IRON_ORE,
  deepslate_iron_ore: BLOCKS.IRON_ORE,
  water: BLOCKS.WATER,
};

const rawStates = readFileSync(path.join(filmDir, 'states.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const rawEvents = readFileSync(path.join(filmDir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

const transcripts = {};
for (const n of NAMES) {
  const p = path.join(filmDir, `${n}-transcript.jsonl`);
  transcripts[n] = existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}

const stripMc = (s) => s ? String(s).replace(/^minecraft:/, '').replace(/\[.*$/, '') : null;

// 1. Extract all real block breaks and placements from transcripts as [tick, dim, x, y, z, numericBlockId]
const blockChanges = [];
const initialBlocks = new Map();
for (const n of NAMES) {
  for (const entry of transcripts[n]) {
    const tick = Math.max(1, Math.round(((entry.wall - t0) / 1000) * 20));
    if (entry.cmd === 'break' && entry.exitCode === 0 && entry.result?.pos) {
      const [hx, hy, hz] = entry.result.pos;
      const x = Math.floor(hx), z = Math.floor(hz), y = mapBlockY(x, hy, z);
      const before = stripMc(entry.result.block_before);
      const beforeId = BLOCK_ID_MAP[before];
      const key = `${x},${y},${z}`;
      if (beforeId !== undefined && beforeId !== BLOCKS.AIR && !initialBlocks.has(key)) {
        initialBlocks.set(key, [0, 'overworld', x, y, z, beforeId]);
      }
      blockChanges.push([tick, 'overworld', x, y, z, BLOCKS.AIR]);
    } else if (entry.cmd === 'place' && entry.exitCode === 0 && entry.result?.block?.pos) {
      const [hx, hy, hz] = entry.result.block.pos;
      const x = Math.floor(hx), z = Math.floor(hz), y = mapBlockY(x, hy, z);
      let b = stripMc(entry.result.block.block || entry.result.block.state);
      const bId = BLOCK_ID_MAP[b];
      if (bId !== undefined) {
        blockChanges.push([tick, 'overworld', x, y, z, bId]);
        // If placed underground in the quarry, also mirror the station on the surface camp so surface group shots show it clearly
        if (hy < 66 && (b === 'furnace' || b === 'torch' || b === 'wall_torch' || b === 'crafting_table')) {
          blockChanges.push([tick, 'overworld', x, floorY(x, z), z, bId]);
        }
      }
    }
  }
}

// Add water pocket at [15, 53..55, -46] where Delphi drowned so cutaway shows water
for (let wy = 53; wy <= 55; wy++) {
  for (let wx = 14; wx <= 16; wx++) {
    for (let wz = -47; wz <= -45; wz++) {
      const y = mapBlockY(wx, wy, wz);
      const key = `${wx},${y},${wz}`;
      if (!initialBlocks.has(key)) {
        initialBlocks.set(key, [0, 'overworld', wx, y, wz, BLOCKS.WATER]);
      }
    }
  }
}

// 2. Build 2 Hz frames.jsonl: { t: tick, time: dayTime, p: [[name, dim, x, y, z, yaw, pitch, hp, food, held, armor, sleeping]], e: [[id, dim, type, x, y, z, yaw, hp]] }
const statesByPlayer = Object.fromEntries(NAMES.map(n => [n, []]));
for (const s of rawStates) {
  if (statesByPlayer[s.player]) {
    statesByPlayer[s.player].push({ sec: (s.wall - t0) / 1000, ...s });
  }
}

const carvedTunnels = new Set();
function interpPlayerTuple(name, tSec, tick) {
  const list = statesByPlayer[name];
  if (!list || list.length === 0) {
    return [name, 'overworld', 21, floorY(21, -51), -51, 0, 0, 20, 20, null, [null, null, null, null], false];
  }
  let idx = 0;
  while (idx + 1 < list.length && list[idx + 1].sec <= tSec) idx++;
  const cur = list[idx];
  const next = list[idx + 1];
  let x = cur.pos[0], hy = cur.pos[1], z = cur.pos[2];
  let yawDeg = cur.yaw || 0, pitchDeg = cur.pitch || 0;
  if (next && next.sec > cur.sec && tSec > cur.sec) {
    const a = Math.min(1, Math.max(0, (tSec - cur.sec) / (next.sec - cur.sec)));
    if (Math.hypot(next.pos[0] - x, next.pos[1] - hy, next.pos[2] - z) < 12) {
      x += (next.pos[0] - x) * a;
      hy += (next.pos[1] - hy) * a;
      z += (next.pos[2] - z) * a;
    }
    yawDeg += (next.yaw - yawDeg) * a;
    pitchDeg += (next.pitch - pitchDeg) * a;
  }
  const y = mapY(x, hy, z);
  // Carve air in the 3D quarry when a player digs underground (except inside the water pit at 15, -46)
  if (hy < 66 && !(Math.abs(x - 15) <= 1.5 && Math.abs(z - -46) <= 1.5 && hy <= 56)) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    for (const dy of [0, 1, 2]) {
      const cKey = `${ix},${iy + dy},${iz}`;
      if (!carvedTunnels.has(cKey)) {
        carvedTunnels.add(cKey);
        blockChanges.push([Math.max(1, tick - 10), 'overworld', ix, iy + dy, iz, BLOCKS.AIR]);
      }
    }
  }
  let heldItem = stripMc(cur.held?.item || cur.held);
  if (heldItem === 'wall_torch') heldItem = 'torch';
  const yawRad = -(yawDeg * Math.PI) / 180;
  const pitchRad = -(pitchDeg * Math.PI) / 180;
  return [
    name,
    'overworld',
    +x.toFixed(2),
    +y.toFixed(2),
    +z.toFixed(2),
    +yawRad.toFixed(3),
    +pitchRad.toFixed(3),
    cur.health ?? 20,
    cur.food ?? 20,
    heldItem,
    [null, null, null, null],
    false
  ];
}

const frames = [];
for (let tSec = 0; tSec <= totalSec; tSec += 0.5) {
  const tick = Math.round(tSec * 20);
  const p = NAMES.map(n => interpPlayerTuple(n, tSec, tick));
  const entMap = new Map();
  for (const n of NAMES) {
    const list = statesByPlayer[n];
    const snap = list.find(s => Math.abs(s.sec - tSec) < 2.5 && s.entities);
    if (snap?.entities) {
      for (const e of snap.entities) {
        const type = stripMc(e.type);
        if (type && type !== 'player' && e.pos) {
          const ex = +e.pos[0].toFixed(2);
          const ez = +e.pos[2].toFixed(2);
          const ey = +mapY(ex, e.pos[1], ez).toFixed(2);
          entMap.set(e.id, [
            e.id,
            'overworld',
            type,
            ex,
            ey,
            ez,
            0,
            e.health ?? 10
          ]);
        }
      }
    }
  }
  frames.push({
    t: tick,
    time: 1000 + tick,
    p,
    e: [...entMap.values()]
  });
}
writeFileSync(path.join(recDir, 'frames.jsonl'), frames.map(f => JSON.stringify(f)).join('\n') + '\n');

const allBlocks = [...initialBlocks.values(), ...blockChanges.sort((a, b) => a[0] - b[0])];
writeFileSync(path.join(recDir, 'blocks.jsonl'), allBlocks.map(b => JSON.stringify(b)).join('\n') + '\n');

// 3. Build events.jsonl and programs/<Name>.jsonl for replication/film/build.mjs
const outEvents = [];
outEvents.push({ t: 0, kind: 'server_start', seed: 20261103, spawn: { x: 21, y: floorY(21, -48), z: -48, found: true }, players: NAMES });

const seenChatKeys = new Set();
const seenAdvKeys = new Set();
for (const e of rawEvents) {
  const relSec = Math.max(0, (e.wall - t0) / 1000);
  const tick = Math.round(relSec * 20);
  if (e.event === 'chat' && e.text) {
    const key = `${Math.floor(relSec / 4)}:${e.text}`;
    if (seenChatKeys.has(key)) continue;
    seenChatKeys.add(key);
    const chatMatch = e.text.match(/^<(\w+)>\s*(.+)$/);
    if (chatMatch) {
      outEvents.push({ t: tick, kind: 'chat', from: chatMatch[1], text: chatMatch[2] });
    } else {
      const advMatch = e.text.match(/^(\w+) has made the advancement \[(.+)\]$/);
      if (advMatch) {
        const aKey = `${advMatch[1]}:${advMatch[2]}`;
        if (!seenAdvKeys.has(aKey)) {
          seenAdvKeys.add(aKey);
          outEvents.push({ t: tick, kind: 'advancement', player: advMatch[1], title: advMatch[2] });
        }
      }
    }
  } else if (e.event === 'death') {
    outEvents.push({ t: tick, kind: 'death', player: e.player, message: `${e.player} drowned` });
    outEvents.push({ t: tick + 50, kind: 'respawn', player: e.player, pos: [21.5, floorY(21, -44), -44.5] });
  }
}

for (const n of NAMES) {
  const pLines = [];
  let idx = 1;
  for (const entry of transcripts[n]) {
    const relSec = Math.max(0, (entry.wall - t0) / 1000);
    const tick = Math.round(relSec * 20);
    const code = `${entry.cmd} ${(entry.args || []).join(' ')}`.trim();
    const outStr = typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result).slice(0, 300);
    pLines.push({
      tick,
      n: idx++,
      status: entry.exitCode === 0 ? 'ok' : 'error',
      seconds: +((entry.durationMs || 50) / 1000).toFixed(2),
      code,
      result: entry.exitCode === 0 ? outStr : null,
      error: entry.exitCode === 0 ? null : outStr,
      log: [],
      late: []
    });
    outEvents.push({ t: tick, kind: 'program', player: n, n: idx - 1, status: entry.exitCode === 0 ? 'ok' : 'error', seconds: +((entry.durationMs || 50) / 1000).toFixed(2) });
  }
  writeFileSync(path.join(progDir, `${n}.jsonl`), pLines.map(p => JSON.stringify(p)).join('\n') + '\n');
}

outEvents.sort((a, b) => a.t - b.t);
writeFileSync(path.join(runDir, 'events.jsonl'), outEvents.map(e => JSON.stringify(e)).join('\n') + '\n');

for (const n of NAMES) {
  const srcMp4 = path.join(filmDir, `${n}.mp4`);
  if (existsSync(srcMp4)) {
    copyFileSync(srcMp4, path.join(pubDir, `${n}.mp4`));
  }
}

console.log(`Built ${frames.length} frames, ${allBlocks.length} blocks, ${outEvents.length} events for ${runName}.`);
