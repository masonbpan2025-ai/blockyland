// Helper to queue an MCP tool call to the running Gemini client.
// Reads a JSON string argument, friendly CLI flags, or a JSON file path and appends it to node_modules/.gemini-tmp/mcp-cmd.txt.
//
// Usage:
//   node queue-call.mjs --say "Hello from Gemini!"
//   node queue-call.mjs --progress "Framing the roof..." 40
//   node queue-call.mjs --cmd "/weather clear"
//   node queue-call.mjs --state
//   node queue-call.mjs --plan my-plan.json
//   node queue-call.mjs --done
//   node queue-call.mjs '{"tool":"say","args":{"text":"Hello!"}}'
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
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
const cmdFile = path.join(repo, 'node_modules', '.gemini-tmp', 'mcp-cmd.txt');

const args = process.argv.slice(2);
const first = args[0];
if (!first) {
  console.log('Usage: node queue-call.mjs [--say <text> | --progress <msg> [pct] | --cmd <cmd> | --plan <file> | --state | --done | <json-or-file>]');
  process.exit(1);
}

let payload;
if (first === '--done' || first === 'done') {
  payload = { control: 'done' };
} else if (first === '--say') {
  payload = { tool: 'say', args: { text: args.slice(1).join(' ') } };
} else if (first === '--progress') {
  const lastArg = args[args.length - 1];
  let progress = undefined;
  let msgArgs = args.slice(1);
  if (args.length > 2 && /^\d+$/.test(lastArg)) {
    progress = parseInt(lastArg, 10);
    msgArgs = args.slice(1, -1);
  }
  payload = { tool: 'report_progress', args: { message: msgArgs.join(' '), ...(progress !== undefined ? { progress } : {}) } };
} else if (first === '--cmd') {
  payload = { tool: 'run_command', args: { command: args.slice(1).join(' ') } };
} else if (first === '--state') {
  payload = { tool: 'get_state', args: {} };
} else if (first === '--screenshot') {
  payload = { tool: 'screenshot', args: {} };
} else if (first === '--look') {
  payload = { tool: 'look_around', args: {} };
} else if (first === '--plan') {
  const planData = JSON.parse(readFileSync(path.resolve(args[1]), 'utf8'));
  payload = { tool: 'run_plan', args: { plan: planData } };
} else if (first.trim().startsWith('{')) {
  payload = JSON.parse(args.join(' '));
} else {
  payload = JSON.parse(readFileSync(path.resolve(first), 'utf8'));
}

const line = JSON.stringify(payload);
appendFileSync(cmdFile, `${line}\n`, 'utf8');
console.log('Queued:', payload.tool || payload.control, `(${line.length} bytes) to ${cmdFile}`);
