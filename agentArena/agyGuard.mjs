#!/usr/bin/env node
// The Agent Arena's gate for agents running in the Antigravity CLI (agy): a PreToolUse hook (the workspace's
// .agents/hooks.json, written by run.mjs) that decides every tool call, the way Claude Code's permission rules do for
// the Claude-harness agents (agentArena/docs/agent-rules.md, "Fair play and privacy"):
//   - the shell: only the `arena` command, as a command of its own;
//   - files: only inside the agent's own workspace, and never its .agents/ folder or the `arena` shims;
//   - the web: searching and reading pages;
//   - everything else (the browser, MCP, subagents, scheduling, images, messages...) is refused.
// In headless mode a refusal ends the agent's whole turn, so a refused shell command or file is redirected instead:
// the command becomes `arena refused` and the file becomes the arena's note (.agents/REFUSED.md), both of which say
// why. Input: the hook payload on stdin. Output: { decision, reason, overwrite? } on stdout.
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

/** The arena subcommands; each is granted as an exact command line (`arena status`...) in the session's settings. */
export const EXACT = ['status', 'log', 'view', 'check', 'practice', 'ready', 'review', 'score', 'rules', 'refused', 'help'];
export const GRANTS = [...EXACT.map((s) => `command(arena ${s})`), 'command(arena practice result)'];

const ALLOW_ALWAYS = new Set(['search_web', 'read_url_content', 'finish', 'wait', 'wait_5_seconds', 'command_status', 'list_permissions', 'manage_task']);
// File tools, by name (the CLI's names vary: view_file, read_file, write_to_file, write_file, replace_file_content...).
const isFileTool = (name) => /(^|_)(file|files|dir|directory)($|_)|^find_by_name$|^grep_search$|^sed_file$/.test(name) && !/browser|notebook|delete/.test(name);
const isReadOnly = (name) => /^(view|read|list|find|grep)/.test(name);
const ARENA = /^\s*(?:\.[\\/])?arena(?:\.cmd)?(?:\s+[A-Za-z0-9_.\-\\/: ]*)?\s*$/;
const PATH_ARG = (k, v) => typeof v === 'string' && /path|file|dir|directory|search|target|uri/i.test(k) && !/query|pattern|content|instruction|description|summary/i.test(k);

export function decide(payload) {
  const call = payload.toolCall ?? {};
  const name = String(call.name ?? '');
  const args = call.args ?? {};
  const ws = path.resolve(payload.workspacePaths?.[0] ?? payload.cwd ?? process.cwd());
  if (ALLOW_ALWAYS.has(name)) return { decision: 'allow' };
  if (name === 'run_command') {
    const line = String(args.CommandLine ?? '');
    if (!ARENA.test(line)) return { decision: 'allow', overwrite: { CommandLine: 'arena refused' }, reason: 'Refused: only the arena command runs in the shell.' };
    // The CLI grants only exact command lines (`arena status`, `arena practice`...), so the line becomes the exact form
    // and its arguments travel in .agents/args.json, which the arena command reads (cli.mjs) and the agent cannot write.
    const tokens = line.trim().split(/\s+/).slice(1);
    const sub = tokens[0] ?? 'status';
    if (!EXACT.includes(sub)) return { decision: 'allow', overwrite: { CommandLine: 'arena refused' }, reason: `Refused: arena has no command ${sub}.` };
    const exact = sub === 'practice' && tokens[1] === 'result' && tokens.length === 2 ? 'arena practice result' : `arena ${sub}`;
    try { mkdirSync(path.join(ws, '.agents'), { recursive: true }); writeFileSync(path.join(ws, '.agents', 'args.json'), JSON.stringify({ argv: tokens.length ? tokens : [sub], at: Date.now() })); } catch { /* the command runs without them */ }
    return { decision: 'allow', overwrite: { CommandLine: exact } };
  }
  if (isFileTool(name)) {
    const inside = (p) => { const abs = path.resolve(ws, p); return abs === ws || abs.startsWith(ws + path.sep); };
    const ours = (p) => { const rel = path.relative(ws, path.resolve(ws, p)).toLowerCase(); return rel.startsWith('.agents') || rel.startsWith('.agent') || rel === 'arena' || rel === 'arena.cmd'; };
    const writes = !isReadOnly(name);
    const keys = Object.entries(args).filter(([k, v]) => PATH_ARG(k, v)).map(([k]) => k);
    for (const k of keys) {
      const p = String(args[k]).replace(/^file:\/\/\/?/, '');
      if (inside(p) && !(writes && ours(p))) continue;
      const note = path.join(ws, '.agents', writes ? 'refused-write.txt' : /dir|find|grep/.test(name) ? '' : 'REFUSED.md');
      const why = inside(p) ? 'the arena\'s own files in your folder (.agents/, arena, arena.cmd) cannot be changed' : `${p} is outside your workspace: you can only use files in your own folder`;
      return { decision: 'allow', overwrite: Object.fromEntries(keys.map((key) => [key, note])), reason: `Refused: ${why}.` };
    }
    return { decision: 'allow' };
  }
  return { decision: 'deny', reason: `Refused: the tool ${name} is not available in the arena (allowed: the arena command, your files, web search and reading pages).` };
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
