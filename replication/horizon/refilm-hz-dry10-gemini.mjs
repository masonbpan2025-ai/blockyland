#!/usr/bin/env node
// Builds the ReplayMod 2.6.28 `timelines.json` from the multi-scene broadcast edit (`replicationEditHzDry10Gemini.js`)
// and the recorded Horizon 26.3 player trajectories (`replication/runs/hz-dry10-gemini/film/states.jsonl`),
// and injects `timelines.json` directly into `replication/runs/hz-dry10-gemini/film/recording.mcpr`.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { REPLICATION_EDIT_HZ_DRY10_GEMINI } from '../../src/cinema/replicationEditHzDry10Gemini.js';

const repo = path.resolve(import.meta.dirname, '..', '..');
const filmDir = path.join(repo, 'replication', 'runs', 'hz-dry10-gemini', 'film');
const meta = JSON.parse(readFileSync(path.join(filmDir, 'run-meta.json'), 'utf8'));
const t0 = meta.startWall;

// Camera connected 56.22s before startWall (recording.mcpr date = 1794005788014, startWall = 1794005844232)
const REPLAY_OFFSET_SEC = 56.22;

const rawStates = readFileSync(path.join(filmDir, 'states.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l));

const NAMES = ['Aria', 'Basil', 'Corin', 'Delphi'];
const byPlayer = Object.fromEntries(NAMES.map(n => [n, []]));
for (const s of rawStates) {
  if (byPlayer[s.player]) {
    byPlayer[s.player].push({ g: (s.wall - t0) / 1000, ...s });
  }
}

function playerHorizonAt(name, g) {
  const list = byPlayer[name];
  if (!list || !list.length) return { x: 21, y: 67, z: -51, yaw: 0, pitch: 0 };
  let i = 0;
  while (i + 1 < list.length && list[i + 1].g <= g) i++;
  const a = list[i], b = list[i + 1];
  let x = a.pos[0], y = a.pos[1], z = a.pos[2], yaw = a.yaw || 0, pitch = a.pitch || 0;
  if (b && b.g > a.g && g > a.g) {
    const u = Math.max(0, Math.min(1, (g - a.g) / (b.g - a.g)));
    if (Math.hypot(b.pos[0] - x, b.pos[1] - y, b.pos[2] - z) < 12) {
      x += (b.pos[0] - x) * u;
      y += (b.pos[1] - y) * u;
      z += (b.pos[2] - z) * u;
    }
    yaw += (b.yaw - yaw) * u;
    pitch += (b.pitch - pitch) * u;
  }
  return { x, y, z, yaw, pitch };
}

function lookAngles(pos, look) {
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
  const horiz = Math.hypot(dx, dz) || 1e-6;
  // Minecraft yaw: 0 = +Z (south), -90 = +X (east), 90 = -X (west), 180 = -Z (north)
  const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
  const pitch = (-Math.atan2(dy, horiz) * 180) / Math.PI;
  return [+(yaw.toFixed(2)), +(pitch.toFixed(2)), 0];
}

function cameraPoseForScene(sc, g, k) {
  const cam = sc.cam;
  if (cam.type === 'aerial') {
    const c = [21, 68, -48];
    const ang = (cam.angle ?? 0) + (cam.spin ?? 0.25) * k;
    const dist = (cam.dist ?? 44) * 0.55;
    const height = (cam.height ?? 28) * 0.55;
    const pos = [
      +(c[0] + Math.sin(ang) * dist).toFixed(2),
      +(c[1] + height).toFixed(2),
      +(c[2] + Math.cos(ang) * dist).toFixed(2)
    ];
    return { pos, rot: lookAngles(pos, c) };
  }
  if (cam.type === 'face' || cam.type === 'follow') {
    const p = playerHorizonAt(cam.who || 'Aria', g);
    const rad = ((p.yaw || 0) * Math.PI) / 180;
    const fx = -Math.sin(rad), fz = Math.cos(rad);
    const sign = cam.type === 'face' ? 1 : -1;
    const dist = cam.dist ?? (cam.type === 'face' ? 3.2 : 4.2);
    const height = cam.height ?? 1.8;
    const pos = [
      +(p.x + fx * dist * sign + (-fz) * 1.1).toFixed(2),
      +(p.y + height).toFixed(2),
      +(p.z + fz * dist * sign + fx * 1.1).toFixed(2)
    ];
    const look = [p.x, p.y + 1.4, p.z];
    return { pos, rot: lookAngles(pos, look) };
  }
  // group shot
  const who = cam.who ? [cam.who].flat() : NAMES;
  const ps = who.map(n => playerHorizonAt(n, g));
  const mid = [
    ps.reduce((s, p) => s + p.x, 0) / ps.length,
    ps.reduce((s, p) => s + p.y, 0) / ps.length,
    ps.reduce((s, p) => s + p.z, 0) / ps.length,
  ];
  const ang = (cam.angle ?? 1.0) + 0.15 * k;
  const dist = Math.max(5.5, cam.dist ?? 5.5);
  const pos = [
    +(mid[0] + Math.sin(ang) * dist).toFixed(2),
    +(mid[1] + 2.6).toFixed(2),
    +(mid[2] + Math.cos(ang) * dist).toFixed(2)
  ];
  const look = [mid[0], mid[1] + 1.2, mid[2]];
  return { pos, rot: lookAngles(pos, look) };
}

const posKeyframes = [];
const timeKeyframes = [];
let filmClockMs = 0;

for (const sc of REPLICATION_EDIT_HZ_DRY10_GEMINI.scenes) {
  const durMs = Math.round(sc.dur * 1000);
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const k = s / steps;
    // inset start/end by 10ms on scene cuts so ReplayMod switches cleanly between shots
    const tMs = filmClockMs + (s === 0 ? 10 : s === steps ? durMs - 10 : Math.round(durMs * k));
    const g = sc.g[0] + (sc.g[1] - sc.g[0]) * k;
    const replayMs = Math.round((g + REPLAY_OFFSET_SEC) * 1000);
    const { pos, rot } = cameraPoseForScene(sc, g, k);
    posKeyframes.push({
      time: tMs,
      properties: {
        'camera:position': pos,
        'camera:rotation': rot,
      }
    });
    timeKeyframes.push({
      time: tMs,
      properties: {
        timestamp: replayMs
      }
    });
  }
  filmClockMs += durMs;
}

const timelines = {
  '': [
    {
      keyframes: posKeyframes,
      segments: Array(posKeyframes.length - 1).fill(0),
      interpolators: [
        {
          type: 'linear',
          properties: ['camera:position', 'camera:rotation']
        }
      ]
    },
    {
      keyframes: timeKeyframes,
      segments: Array(timeKeyframes.length - 1).fill(0),
      interpolators: [
        {
          type: 'linear',
          properties: ['timestamp']
        }
      ]
    }
  ]
};

const timelinesPath = path.join(filmDir, 'timelines.json');
writeFileSync(timelinesPath, JSON.stringify(timelines, null, 2));

const mcprPath = path.join(filmDir, 'recording.mcpr');
execFileSync('powershell', [
  '-NoProfile',
  '-Command',
  `
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::Open('${mcprPath.replace(/'/g, "''")}', 'Update')
$old = $z.GetEntry('timelines.json')
if ($old) { $old.Delete() }
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, '${timelinesPath.replace(/'/g, "''")}', 'timelines.json') | Out-Null
$z.Dispose()
Write-Output 'Injected timelines.json into recording.mcpr'
`
], { stdio: 'inherit' });

console.log(`Generated ${posKeyframes.length} ReplayMod 3D camera keyframes across ${REPLICATION_EDIT_HZ_DRY10_GEMINI.scenes.length} scenes (${(filmClockMs / 1000).toFixed(1)}s film duration).`);
