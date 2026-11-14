#!/usr/bin/env node
// Renders:
// 1. `outputs/agent-expedition-horizon-gemini/horizon-26.3-direct-cut.mp4`: Full-screen 1080p multi-camera edit
//    of the 4 live Horizon 26.3 Vulkan client captures (`Aria.mp4`, `Basil.mp4`, `Corin.mp4`, `Delphi.mp4`) + 2x2 quad views,
//    synced to each scene's game time `g` in `replicationEditHzDry10Gemini.js` and mixed with `soundtrack.wav`.
// 2. `outputs/agent-expedition-horizon-gemini/agent-expedition-horizon-gemini-pip.mp4`: The 1080p 3D Replay Studio movie
//    with a live-synced Horizon 26.3 Vulkan Picture-in-Picture (PiP) viewport in the bottom-right corner.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { REPLICATION_EDIT_HZ_DRY10_GEMINI } from '../../src/cinema/replicationEditHzDry10Gemini.js';

const repo = path.resolve(import.meta.dirname, '..', '..');
const filmDir = path.join(repo, 'replication', 'runs', 'hz-dry10-gemini', 'film');
const outDir = path.join(repo, 'outputs', 'agent-expedition-horizon-gemini');
const tmpDir = path.join(outDir, 'tmp-segments');
mkdirSync(tmpDir, { recursive: true });

// Video capture started 27.6s before startWall (total video length ~629s for 600s match)
const VIDEO_OFFSET_SEC = 27.6;

function pickFocusPlayer(sc) {
  const w = sc.cam?.who;
  if (!w) return 'quad';
  if (Array.isArray(w)) return w.length >= 3 ? 'quad' : w[0];
  return w;
}

const segFiles = [];
let idx = 0;

for (const sc of REPLICATION_EDIT_HZ_DRY10_GEMINI.scenes) {
  const focus = pickFocusPlayer(sc);
  const startSec = Math.max(2, sc.g[0] + VIDEO_OFFSET_SEC);
  const dur = sc.dur;
  const segPath = path.join(tmpDir, `seg-${String(idx).padStart(2, '0')}.mp4`);
  console.log(`[Segment ${idx}] ${sc.name} (${dur}s) -> ${focus} @ ${startSec.toFixed(1)}s`);

  if (focus === 'quad') {
    execFileSync('ffmpeg', [
      '-y',
      '-ss', String(startSec), '-t', String(dur), '-i', path.join(filmDir, 'Aria.mp4'),
      '-ss', String(startSec), '-t', String(dur), '-i', path.join(filmDir, 'Basil.mp4'),
      '-ss', String(startSec), '-t', String(dur), '-i', path.join(filmDir, 'Corin.mp4'),
      '-ss', String(startSec), '-t', String(dur), '-i', path.join(filmDir, 'Delphi.mp4'),
      '-filter_complex',
      '[0:v]crop=iw-16:ih-44:8:36,scale=960:540,setsar=1[v0];' +
      '[1:v]crop=iw-16:ih-44:8:36,scale=960:540,setsar=1[v1];' +
      '[2:v]crop=iw-16:ih-44:8:36,scale=960:540,setsar=1[v2];' +
      '[3:v]crop=iw-16:ih-44:8:36,scale=960:540,setsar=1[v3];' +
      '[v0][v1]hstack=inputs=2[top];[v2][v3]hstack=inputs=2[bot];[top][bot]vstack=inputs=2,fps=30,format=yuv420p[v]',
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      segPath
    ], { stdio: 'ignore' });
  } else {
    execFileSync('ffmpeg', [
      '-y',
      '-ss', String(startSec), '-t', String(dur), '-i', path.join(filmDir, `${focus}.mp4`),
      '-vf', 'crop=iw-16:ih-44:8:36,scale=1920:1080,setsar=1,fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      segPath
    ], { stdio: 'ignore' });
  }
  segFiles.push(segPath);
  idx++;
}

const concatListPath = path.join(tmpDir, 'concat.txt');
writeFileSync(concatListPath, segFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n') + '\n');

const directCutPath = path.join(outDir, 'horizon-26.3-direct-cut.mp4');
const soundtrackPath = path.join(outDir, 'soundtrack.wav');

execFileSync('ffmpeg', [
  '-y',
  '-f', 'concat', '-safe', '0', '-i', concatListPath,
  '-i', soundtrackPath,
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '19',
  '-c:a', 'aac', '-b:a', '192k',
  '-shortest',
  directCutPath
], { stdio: 'ignore' });
console.log(`Created ${directCutPath}`);

// Also create Picture-in-Picture composite on top of agent-expedition-horizon-gemini.mp4
const baseMoviePath = path.join(outDir, 'agent-expedition-horizon-gemini.mp4');
const pipMoviePath = path.join(outDir, 'agent-expedition-horizon-gemini-pip.mp4');
if (existsSync(baseMoviePath)) {
  execFileSync('ffmpeg', [
    '-y',
    '-i', baseMoviePath,
    '-i', directCutPath,
    '-filter_complex',
    '[1:v]scale=420:236,pad=426:242:3:3:color=#d9a528[pip];[0:v][pip]overlay=W-w-28:H-h-62:shortest=1[v]',
    '-map', '[v]', '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'copy',
    pipMoviePath
  ], { stdio: 'ignore' });
  console.log(`Created ${pipMoviePath}`);
}

rmSync(tmpDir, { recursive: true, force: true });

