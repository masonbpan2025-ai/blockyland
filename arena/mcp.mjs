#!/usr/bin/env node
// One player's MCP server for the team battle arena: two tools, look and act, for the AI app playing that player.
// Started by the AI app (see arena/run.mjs) with ARENA_URL and ARENA_PLAYER in its environment.
import { createInterface } from 'node:readline';
import { COMMANDS } from './agentGuide.js';

const URL_BASE = process.env.ARENA_URL || 'http://127.0.0.1:47700';
const PLAYER = process.env.ARENA_PLAYER || '';

const TOOLS = [
  {
    name: 'look',
    description: 'See your situation now: health, hunger, inventory, teammates, enemies in sight, a map of the area around you, team chat and how your last plan went.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'act',
    description: `Hand in your plan for this round. Waits until the round has been played (everyone plans, then all plans play out for 30 seconds of game time), then returns your new situation.\n\n${COMMANDS}`,
    inputSchema: {
      type: 'object',
      properties: {
        thought: { type: 'string', description: 'What you are thinking: what you see, what your team needs, what you will do and why.' },
        plan: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6, description: '1 to 6 commands, done in order.' },
        chat: { type: 'string', description: 'Optional message to your team (they read it next round).' },
      },
      required: ['thought', 'plan'],
      additionalProperties: false,
    },
  },
];

async function call(name, args) {
  if (name === 'look') {
    const res = await fetch(`${URL_BASE}/look?player=${encodeURIComponent(PLAYER)}`);
    return res.json();
  }
  if (name === 'act') {
    const res = await fetch(`${URL_BASE}/act`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ player: PLAYER, ...args }) });
    return res.json();
  }
  throw new Error(`Unknown tool ${name}`);
}

async function handle(message) {
  const { id, method, params } = message || {};
  if (id === undefined || id === null) return null;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'arena', version: '1.0.0' } });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call':
      try {
        const result = await call(params?.name, params?.arguments || {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: !!result?.error });
      } catch (error) {
        return reply({ content: [{ type: 'text', text: JSON.stringify({ error: String(error?.message || error) }) }], isError: true });
      }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

const lines = createInterface({ input: process.stdin });
lines.on('line', async (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const response = await handle(message);
  if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
});
lines.on('close', () => process.exit(0));
