// Refuse files that must not be published, and assets nobody has accounted for.
//
// After Horizon's tools/check_public_tree.py, which keeps every Mojang file out of that repository. Blockyland does ship
// Mojang's textures today (public/assets/PROVENANCE.json lists them, verified by hash), so the rule here is narrower:
//   1. no game code: .jar, .class and .java files (decompiled or not) are never committed;
//   2. every file under public/assets/ has a provenance entry, so a new texture can't arrive without anyone saying
//      where it came from;
//   3. the provenance file names no file that is gone.
// Run by scripts/preflight.mjs (the pre-push hook) and by tests/publicTree.test.js.
//
//   node scripts/checkPublicTree.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS_PREFIX = 'public/assets/';
export const PROVENANCE_PATH = 'public/assets/PROVENANCE.json';
export const FORBIDDEN_EXTENSIONS = ['.jar', '.class', '.java'];

/**
 * @param {{files: string[], provenance: object}} input repo-relative posix paths of every file git would publish
 * @returns {{errors: string[], counts: Record<string, number>}}
 */
export function checkTree({ files, provenance }) {
  const errors = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    if (FORBIDDEN_EXTENSIONS.some(ext => lower.endsWith(ext))) errors.push(`${file}: game code (${lower.slice(lower.lastIndexOf('.'))}) must not be committed`);
  }

  const folders = Object.keys(provenance?.folders ?? {});
  const listed = new Map();
  const counts = {};
  for (const entry of provenance?.entries ?? []) {
    for (const f of entry.files ?? []) {
      if (listed.has(f)) errors.push(`${PROVENANCE_PATH}: ${f} is listed twice (${listed.get(f)} and ${entry.source})`);
      listed.set(f, entry.source);
    }
  }
  const assets = files.filter(f => f.startsWith(ASSETS_PREFIX) && f !== PROVENANCE_PATH).map(f => f.slice(ASSETS_PREFIX.length));
  const present = new Set(assets);
  for (const asset of assets) {
    const folder = folders.find(prefix => asset.startsWith(prefix));
    const source = folder ? provenance.folders[folder].source : listed.get(asset);
    if (!source) {
      errors.push(`${ASSETS_PREFIX}${asset}: no provenance. Add it to ${PROVENANCE_PATH} (or run node scripts/seed-asset-provenance.mjs) saying where it came from`);
      continue;
    }
    counts[source] = (counts[source] ?? 0) + 1;
  }
  for (const f of listed.keys()) {
    if (!present.has(f)) errors.push(`${PROVENANCE_PATH}: lists ${f}, which no longer exists`);
  }
  return { errors, counts };
}

/** Tracked files plus untracked ones git doesn't ignore: what a commit could publish. */
export function publishableFiles(git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) {
  const list = args => git(args).split('\0').filter(Boolean);
  const deleted = new Set(list(['ls-files', '-z', '--deleted']));
  return [...new Set([...list(['ls-files', '-z']), ...list(['ls-files', '-z', '--others', '--exclude-standard'])])]
    .filter(f => !deleted.has(f));
}

/** Every file on disk under public/assets: the build copies the folder whole, git-ignored files included. */
export function assetFilesOnDisk(dir = join(root, ASSETS_PREFIX), prefix = ASSETS_PREFIX, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) assetFilesOnDisk(join(dir, entry.name), `${prefix}${entry.name}/`, out);
    else out.push(`${prefix}${entry.name}`);
  }
  return out;
}

function main() {
  const provenance = JSON.parse(readFileSync(join(root, PROVENANCE_PATH), 'utf8'));
  const files = [...new Set([...publishableFiles().filter(f => !f.startsWith(ASSETS_PREFIX)), ...assetFilesOnDisk()])];
  const { errors, counts } = checkTree({ files, provenance });
  if (errors.length) {
    console.error(`Public tree check failed (${errors.length}):`);
    for (const e of errors.slice(0, 50)) console.error(`  ${e}`);
    if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
    process.exit(1);
  }
  console.log(`Public tree check passed. Assets by source: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

if (process.argv[1] && process.argv[1].endsWith('checkPublicTree.mjs')) main();
