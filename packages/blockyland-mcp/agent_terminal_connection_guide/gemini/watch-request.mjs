// Watcher script for Gemini / Antigravity to be notified when a new request arrives in messages.log.
// Exits with code 0 as soon as a new message is appended.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('./', import.meta.url));

function findRepo(start) {
  let at = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(at, 'packages', 'blockyland-mcp', 'server.mjs'))) return at;
    const up = path.resolve(at, '..');
    if (up === at) break;
    at = up;
  }
  throw new Error(`Could not find Blockyland checkout above ${start}`);
}

const repo = findRepo(here);
const msgFile = path.join(repo, 'node_modules', '.gemini-tmp', 'messages.log');

const args = process.argv.slice(2);
let initialCount = -1;
const idx = args.indexOf('--since-count');
if (idx >= 0 && args[idx + 1]) {
  initialCount = parseInt(args[idx + 1], 10);
}

function getLines() {
  if (!existsSync(msgFile)) return [];
  const text = readFileSync(msgFile, 'utf8');
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

const currentLines = getLines();
if (initialCount < 0) {
  initialCount = currentLines.length;
}

// If there are already messages beyond initialCount, emit immediately
if (currentLines.length > initialCount) {
  const newLines = currentLines.slice(initialCount);
  console.log(JSON.stringify({
    event: 'new_request',
    requests: newLines.map((l) => { try { return JSON.parse(l); } catch { return l; } }),
    totalCount: currentLines.length
  }));
  process.exit(0);
}

const timeoutMs = 600000; // 10 minutes
const startTime = Date.now();

const interval = setInterval(() => {
  const lines = getLines();
  if (lines.length > initialCount) {
    clearInterval(interval);
    const newLines = lines.slice(initialCount);
    console.log(JSON.stringify({
      event: 'new_request',
      requests: newLines.map((l) => { try { return JSON.parse(l); } catch { return l; } }),
      totalCount: lines.length
    }));
    process.exit(0);
  }
  if (Date.now() - startTime >= timeoutMs) {
    clearInterval(interval);
    console.log(JSON.stringify({
      event: 'timeout',
      message: 'Still actively listening for terminal requests.',
      totalCount: lines.length
    }));
    process.exit(0);
  }
}, 200);

