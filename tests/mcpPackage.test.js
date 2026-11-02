// The npm package blockyland-mcp (packages/blockyland-mcp): what players install with `npx -y blockyland-mcp@latest`.
// It must ship every file it imports, depend on nothing but `ws`, and its command must answer --help, --version and
// an MCP handshake by itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'blockyland-mcp');
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const bin = join(pkgDir, pkg.bin['blockyland-mcp']);

/** Every import of a file, followed through the package; bare imports collected. */
function importGraph(entry, seen = new Set(), bare = new Set()) {
  if (seen.has(entry)) return { seen, bare };
  seen.add(entry);
  const source = readFileSync(entry, 'utf8');
  for (const [, spec] of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
    if (!spec) continue;
    if (spec.startsWith('.')) importGraph(resolve(dirname(entry), spec), seen, bare);
    else bare.add(spec);
  }
  return { seen, bare };
}

test('the package is self-contained: its imports stay inside it, and only ws is needed', () => {
  const { seen, bare } = importGraph(bin);
  for (const file of seen) {
    assert.ok(file.startsWith(pkgDir), `${file} is outside the package`);
    assert.ok(existsSync(file), file);
    const shipped = pkg.files.some(f => file.slice(pkgDir.length + 1).replace(/\\/g, '/').startsWith(f.replace(/\/$/, '')));
    assert.ok(shipped, `${file} is imported but not in "files"`);
  }
  const external = [...bare].filter(b => !b.startsWith('node:'));
  assert.deepEqual(external, ['ws']);
  assert.deepEqual(Object.keys(pkg.dependencies), ['ws']);
  assert.equal(pkg.license, 'MIT');
  assert.match(readFileSync(bin, 'utf8'), /^#!\/usr\/bin\/env node/);
});

test('npm pack ships exactly the package files', () => {
  const out = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], {
    cwd: pkgDir, encoding: 'utf8', shell: process.platform === 'win32',
  });
  const files = JSON.parse(out)[0].files.map(f => f.path).sort();
  assert.deepEqual(files, ['LICENSE', 'README.md', 'bin/blockyland-mcp.mjs', 'package.json', 'protocol.js', 'server.mjs']);
});

const run = (args, input) => new Promise(resolveRun => {
  const child = spawn(process.execPath, [bin, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, BLOCKYLAND_MCP_PORT: '0' } });
  let stdout = '';
  child.stdout.on('data', d => { stdout += d; if (input && stdout.includes('\n')) child.stdin.end(); });
  child.on('exit', code => resolveRun({ code, stdout }));
  if (input) child.stdin.write(input); else child.stdin.end();
});

test('--version and --help answer without starting a server', async () => {
  const version = await run(['--version']);
  assert.equal(version.stdout.trim(), pkg.version);
  const help = await run(['--help']);
  assert.match(help.stdout, /claude mcp add blockyland -- npx -y blockyland-mcp@latest/);
  assert.match(help.stdout, /gemini mcp add blockyland npx -y blockyland-mcp@latest/);
});

test('the command speaks MCP on stdio and reports the package version', async () => {
  const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'test' }, capabilities: {} } });
  const { code, stdout } = await run([], `${init}\n`);
  assert.equal(code, 0, 'exits when the AI app closes stdin');
  const reply = JSON.parse(stdout.split('\n')[0]);
  assert.equal(reply.result.serverInfo.name, 'blockyland');
  assert.equal(reply.result.serverInfo.version, pkg.version);
});

test('the game and the package share one tool table', async () => {
  const fromGame = await import('../src/agentControl/protocol.js');
  const fromPackage = await import('../packages/blockyland-mcp/protocol.js');
  assert.equal(fromGame.TOOLS, fromPackage.TOOLS, 'the same module, not a copy');
});
