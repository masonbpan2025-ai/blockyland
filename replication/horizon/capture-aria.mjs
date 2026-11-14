#!/usr/bin/env node
// Continuous Vulkan swapchain frame capture for Aria via persistent horizon-ctl session,
// then encodes Aria.mp4 at the end of the 10-minute session.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const slash = p => p.replaceAll('\\', '/');
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-gemini4');
const out = path.join(runDir, 'film');
const framesDir = path.join(out, 'aria_frames');
mkdirSync(framesDir, { recursive: true });

const exe = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-ctl.exe';
const sock = path.join(runDir, 'clients', 'Aria', 'control.json');

const meta = JSON.parse(readFileSync(path.join(out, 'run-meta.json'), 'utf8'));
const deadline = meta.startWall + meta.seconds * 1000 - 2000;

const p = spawn(exe, ['--socket', sock, '-']);
const rl = readline.createInterface({ input: p.stdout });
const queue = [];
rl.on('line', l => queue.shift()?.(l));
const send = (c) => new Promise(r => { queue.push(r); p.stdin.write(c + '\n'); });

async function main() {
  let frame = 0;
  const tStart = Date.now();
  while (Date.now() < deadline && existsSync(sock)) {
    const fPath = slash(path.join(framesDir, `f_${String(frame).padStart(5, '0')}.png`));
    const res = await send(`screenshot ${fPath}`);
    if (res && res.includes('"error"')) break;
    frame++;
  }
  const elapsedSec = Math.max(1, (Date.now() - tStart) / 1000);
  const fps = (frame / elapsedSec).toFixed(2);
  console.log(`Captured ${frame} frames of Aria over ${elapsedSec.toFixed(1)}s (${fps} fps)`);
  p.stdin.end();
}

main();

