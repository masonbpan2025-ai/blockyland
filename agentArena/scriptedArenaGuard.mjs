#!/usr/bin/env node
// The scripted arena's gate for agents in the Antigravity CLI (agy, Gemini): a PreToolUse hook (the workspace's
// .agents/hooks.json, written by scriptedArena.mjs) that decides every tool call, as Claude Code's permission rules do
// for the Claude-harness agents and Codex's sandbox does for Codex:
//   - the shell: only the arena's three commands, each on its own -- `node check.mjs`, `node practice.mjs [...]`,
//     `node test.mjs [...]`;
//   - files: only inside the agent's own workspace, and never its .agents/ folder or the arena's scripts;
//   - the web: searching and reading pages;
//   - everything else is refused.
// The CLI grants only exact command lines, so a command with arguments becomes its exact form and the arguments travel
// in .agents/args.json, which the command reads and the agent cannot write. A refused command becomes
// `node refused.mjs`, a refused file the arena's note (.agents/REFUSED.md): in headless mode an outright refusal would
// end the agent's whole turn. Input: the hook payload on stdin. Output: { decision, reason, overwrite? } on stdout.
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

export const COMMANDS = ['node check.mjs', 'node practice.mjs', 'node test.mjs', 'node refused.mjs'];
export const GRANTS = COMMANDS.map((c) => `command(${c})`);
/** The arena's own files in a workspace: no agent writes these. */
export const ARENA_FILES = ['check.mjs', 'practice.mjs', 'test.mjs', 'refused.mjs'];

const ALLOW_ALWAYS = new Set(['search_web', 'read_url_content', 'finish', 'wait', 'wait_5_seconds', 'command_status', 'list_permissions', 'manage_task']);
const isFileTool = (name) => /(^|_)(file|files|dir|directory)($|_)|^find_by_name$|^grep_search$|^sed_file$/.test(name) && !/browser|notebook|delete/.test(name);
const isReadOnly = (name) => /^(view|read|list|find|grep)/.test(name);
const LINE = /^\s*node\s+(check|practice|test)\.mjs((?:\s+[A-Za-z0-9_.\-\\/]+)*)\s*$/;
const PATH_ARG = (k, v) => typeof v === 'string' && /path|file|dir|directory|search|target|uri/i.test(k) && !/query|pattern|content|instruction|description|summary/i.test(k);

export function decide(payload) {
  const call = payload.toolCall ?? {};
  const name = String(call.name ?? '');
  const args = call.args ?? {};
  const ws = path.resolve(payload.workspacePaths?.[0] ?? payload.cwd ?? process.cwd());
  if (ALLOW_ALWAYS.has(name)) return { decision: 'allow' };
  if (name === 'run_command') {
    const line = String(args.CommandLine ?? '');
    const m = line.match(LINE);
    if (!m) return { decision: 'allow', overwrite: { CommandLine: 'node refused.mjs' }, reason: 'Refused: the only commands are node check.mjs, node practice.mjs and node test.mjs, each on its own.' };
    const argv = m[2].trim() ? m[2].trim().split(/\s+/) : [];
    try { mkdirSync(path.join(ws, '.agents'), { recursive: true }); writeFileSync(path.join(ws, '.agents', 'args.json'), JSON.stringify({ command: m[1], argv, at: Date.now() })); } catch { /* the command runs without them */ }
    return { decision: 'allow', overwrite: { CommandLine: `node ${m[1]}.mjs` } };
  }
  if (isFileTool(name)) {
    const inside = (p) => { const abs = path.resolve(ws, p); return abs === ws || abs.startsWith(ws + path.sep); };
    const ours = (p) => { const rel = path.relative(ws, path.resolve(ws, p)).toLowerCase(); return rel.startsWith('.agents') || rel.startsWith('.agent') || ARENA_FILES.includes(rel); };
    const writes = !isReadOnly(name);
    const keys = Object.entries(args).filter(([k, v]) => PATH_ARG(k, v)).map(([k]) => k);
    for (const k of keys) {
      const p = String(args[k]).replace(/^file:\/\/\/?/, '');
      if (inside(p) && !(writes && ours(p))) continue;
      const note = path.join(ws, '.agents', writes ? 'refused-write.txt' : /dir|find|grep/.test(name) ? '' : 'REFUSED.md');
      const why = inside(p) ? "the arena's own files in your folder (.agents/, check.mjs, practice.mjs, test.mjs) cannot be changed" : `${p} is outside your workspace: you can only use files in your own folder`;
      return { decision: 'allow', overwrite: Object.fromEntries(keys.map((key) => [key, note])), reason: `Refused: ${why}.` };
    }
    return { decision: 'allow' };
  }
  return { decision: 'deny', reason: `Refused: the tool ${name} is not available in the arena (allowed: node check.mjs, node practice.mjs, node test.mjs, your files, web search and reading pages).` };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}`) {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    let out;
    try { out = decide(JSON.parse(input || '{}')); } catch (err) { out = { decision: 'deny', reason: `Refused (the arena's gate could not read the request: ${err.message})` }; }
    process.stdout.write(JSON.stringify(out));
  });
}
