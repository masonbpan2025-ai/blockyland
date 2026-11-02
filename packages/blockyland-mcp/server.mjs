// Blockyland's MCP server: lets an AI app (Claude Code, Gemini CLI, Codex, Cursor, any MCP client) play in the game
// tab the player has open. The AI app starts this over stdio; the game tab connects to it on 127.0.0.1 and pairs with
// a 6-digit code it shows in the Agent Terminal's "Connect AI" panel. The tools are defined once, in ./protocol.js,
// which the game imports too (src/agentControl/protocol.js re-exports it). User guide: docs/agent-control.md.
//
// Published to npm as blockyland-mcp (bin/blockyland-mcp.mjs runs main()); in a checkout, scripts/blockyland-mcp.mjs.
//
// Environment: BLOCKYLAND_MCP_PORT (default 47615), BLOCKYLAND_MCP_ORIGINS (extra page origins, comma-separated).
// stdout carries the protocol only; messages for people go to stderr.
import { WebSocketServer } from 'ws';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  TOOLS, TOOL_BY_NAME, DEFAULT_PORT, SERVER_NAME, SERVER_INSTRUCTIONS, PROTOCOL_VERSION,
  isAllowedOrigin, checkArguments, toolError,
} from './protocol.js';

export const SUPPORTED_MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
/** The package's own version, so the AI app and the game can tell which server they talk to. */
export const SERVER_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

/** A readable name for the AI app, from the clientInfo it sent. */
export function clientLabel(info) {
  const name = String(info?.title || info?.name || '').trim();
  if (/claude/i.test(name)) return /desktop/i.test(name) ? 'Claude Desktop' : 'Claude Code';
  if (/gemini/i.test(name)) return 'Gemini CLI';
  if (/codex/i.test(name)) return 'Codex';
  if (/cursor/i.test(name)) return 'Cursor';
  return name || 'your AI app';
}

/**
 * The server, without stdio, so tests can drive it.
 * @returns {{listen: () => Promise<number|null>, handle: (message: object) => Promise<object|null>, close: () => Promise<void>, state: object}}
 */
export function createAgentControlServer({
  port = DEFAULT_PORT, host = '127.0.0.1', origins = [], log = () => {},
} = {}) {
  const state = {
    client: null, wss: null, port: null, listenError: null,
    pages: new Set(), paired: null, sessionToken: null,
    messages: [], waiters: [], pending: new Map(), nextId: 1,
  };

  const send = (page, message) => {
    if (page?.ws.readyState === 1) page.ws.send(JSON.stringify(message));
  };

  function pair(page) {
    if (state.paired && state.paired !== page) send(state.paired, { type: 'unpaired', reason: 'Another game tab connected.' });
    state.paired = page;
    state.messages = [];
    state.sessionToken = randomBytes(16).toString('hex');
    send(page, { type: 'paired', client: clientLabel(state.client), sessionToken: state.sessionToken });
    log(`paired with a game tab (${page.game?.title || 'Blockyland'})`);
  }

  function failPending(reason) {
    for (const [id, entry] of state.pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: toolError('connection', reason) });
      state.pending.delete(id);
    }
  }

  function onPage(ws) {
    const page = { ws, code: null, game: null };
    state.pages.add(page);
    ws.on('message', data => {
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (message.type === 'hello') {
        page.code = typeof message.code === 'string' ? message.code : null;
        page.game = message.game && typeof message.game === 'object' ? message.game : null;
        const tokenOk = !!message.sessionToken && message.sessionToken === state.sessionToken;
        if (tokenOk && (!state.paired || state.paired === page)) {
          pair(page); // a reloaded tab, back with the token it was given
        } else {
          // The paired tab asking for a new code drops the pairing: the player wants to pair again.
          if (state.paired === page) {
            state.paired = null;
            state.sessionToken = null;
            failPending('The player asked for a new pairing code.');
          }
          send(page, { type: 'welcome', protocol: PROTOCOL_VERSION, server: SERVER_VERSION, aiApp: clientLabel(state.client) });
        }
      } else if (message.type === 'result' && page === state.paired) {
        const entry = state.pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        state.pending.delete(message.id);
        entry.resolve(message);
      } else if (message.type === 'player_message' && page === state.paired) {
        const text = typeof message.text === 'string' ? message.text.slice(0, 8000) : '';
        const images = Array.isArray(message.images) ? message.images.filter(i => i && typeof i.data === 'string').slice(0, 2) : [];
        if (!text && !images.length) return;
        const entry = { id: message.id, text, images };
        const waiter = state.waiters.shift();
        if (waiter) waiter(entry); else state.messages.push(entry);
      }
    });
    ws.on('close', () => {
      state.pages.delete(page);
      if (state.paired === page) {
        state.paired = null;
        failPending('The game tab closed or reloaded. It reconnects by itself when it comes back.');
      }
    });
    ws.on('error', () => {});
  }

  function listen() {
    return new Promise(resolve => {
      const wss = new WebSocketServer({
        host, port, maxPayload: 16 * 1024 * 1024,
        verifyClient: ({ origin }, done) => {
          const ok = isAllowedOrigin(origin, origins);
          if (!ok) log(`refused a connection from ${origin || 'a page with no origin'}`);
          done(ok, 403, 'Origin not allowed');
        },
      });
      wss.once('listening', () => {
        state.wss = wss;
        state.port = wss.address().port;
        log(`waiting for the game on ws://${host}:${state.port}`);
        resolve(state.port);
      });
      wss.once('error', err => {
        state.listenError = err;
        log(`could not listen on ${host}:${port}: ${err.message}`);
        resolve(null);
      });
      wss.on('connection', onPage);
    });
  }

  const notConnected = () => toolError('connection', state.wss
    ? 'No game is connected. Ask the player to press C in Blockyland, switch Offline Mode off, open "Connect AI" and tell you the 6-digit code; then call connect with it.'
    : `This server could not open port ${port} (${state.listenError?.message || 'unknown error'}). Another Blockyland MCP server, from another AI session, may be using it: close that session, or set BLOCKYLAND_MCP_PORT for both.`);

  function waitForMessage(timeoutSeconds) {
    if (state.messages.length) return Promise.resolve(state.messages.shift());
    return new Promise(resolve => {
      const waiter = entry => { clearTimeout(timer); resolve(entry); };
      const timer = setTimeout(() => {
        state.waiters = state.waiters.filter(w => w !== waiter);
        resolve(null);
      }, timeoutSeconds * 1000);
      state.waiters.push(waiter);
    });
  }

  async function runServerTool(name, args) {
    if (name === 'connect') {
      if (!state.wss) return { error: notConnected() };
      if (!args.code) {
        return { result: {
          connected: !!state.paired, game: state.paired?.game ?? null,
          gamesWaiting: [...state.pages].filter(p => p !== state.paired).length, port: state.port,
        } };
      }
      if (state.paired?.code === args.code) return { result: { connected: true, game: state.paired.game, note: 'Already connected.' } };
      const page = [...state.pages].find(p => p.code === args.code && p !== state.paired);
      if (!page) {
        return { error: toolError('unknown', `No game is waiting with code ${args.code}. Check the code in the game's "Connect AI" panel; it shows "Looking for your AI app" until this server is running, then the code to give you.`) };
      }
      pair(page);
      return { result: { connected: true, game: page.game } };
    }
    if (name === 'wait_for_player_message') {
      if (!state.paired) return { error: notConnected() };
      // The AI app is back to waiting: whatever it was doing for the player is finished. The game shows "Done".
      if (!state.messages.length) send(state.paired, { type: 'ai_waiting' });
      const entry = await waitForMessage(args.timeout_seconds ?? 50);
      if (!entry) return { result: { waiting: true, note: 'Nothing yet. Call wait_for_player_message again to keep listening.' } };
      send(state.paired, { type: 'message_received', id: entry.id });
      return { result: { message: entry.text, images: entry.images.length }, images: entry.images };
    }
    return { error: toolError('unknown', `No server tool ${name}.`) };
  }

  function runGameTool(tool, args) {
    if (!state.paired) return Promise.resolve({ error: notConnected() });
    const id = state.nextId++;
    const page = state.paired;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        resolve({ ok: false, error: toolError('timeout', `The game did not answer ${tool.name} within ${Math.round(tool.timeoutMs / 1000)} s. Its tab may be asleep in the background; ask the player to bring it to the front.`) });
      }, tool.timeoutMs);
      state.pending.set(id, { resolve, timer });
      send(page, { type: 'call', id, tool: tool.name, args });
    }).then(reply => reply.ok
      ? { result: reply.result ?? {}, images: Array.isArray(reply.images) ? reply.images : [] }
      : { error: reply.error || toolError('failed', 'The game reported a failure.') });
  }

  async function callTool(name, args = {}) {
    const tool = TOOL_BY_NAME.get(name);
    if (!tool) return { error: toolError('unknown', `No tool named ${name}. The tools are: ${TOOLS.map(t => t.name).join(', ')}.`) };
    const problem = checkArguments(tool, args);
    if (problem) return { error: toolError('usage', `${name}: ${problem}.`) };
    return tool.runs === 'server' ? runServerTool(name, args ?? {}) : runGameTool(tool, args ?? {});
  }

  /** One JSON-RPC message in, its response out (null for notifications). */
  async function handle(message) {
    const { id, method, params } = message || {};
    const isRequest = id !== undefined && id !== null;
    const reply = result => ({ jsonrpc: '2.0', id, result });
    const fail = (code, text) => ({ jsonrpc: '2.0', id: isRequest ? id : null, error: { code, message: text } });
    if (message?.jsonrpc !== '2.0' || typeof method !== 'string') return isRequest ? fail(-32600, 'Invalid request') : null;
    if (!isRequest) return null; // notifications: initialized, cancelled, roots changed
    switch (method) {
      case 'initialize': {
        state.client = params?.clientInfo ?? null;
        const asked = params?.protocolVersion;
        return reply({
          protocolVersion: SUPPORTED_MCP_VERSIONS.includes(asked) ? asked : SUPPORTED_MCP_VERSIONS[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, title: 'Blockyland', version: SERVER_VERSION },
          instructions: SERVER_INSTRUCTIONS,
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({
          tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
            name, title, description, inputSchema, annotations: { title, ...annotations },
          })),
        });
      case 'tools/call': {
        const outcome = await callTool(params?.name, params?.arguments);
        const content = [{ type: 'text', text: JSON.stringify(outcome.error ?? outcome.result) }];
        for (const image of outcome.images ?? []) content.push({ type: 'image', data: image.data, mimeType: image.mimeType || 'image/jpeg' });
        return reply({ content, isError: !!outcome.error });
      }
      default:
        return fail(-32601, `Method not found: ${method}`);
    }
  }

  async function close() {
    failPending('The MCP server is shutting down.');
    for (const waiter of state.waiters.splice(0)) waiter(null);
    for (const page of state.pages) page.ws.terminate();
    if (state.wss) await new Promise(resolve => state.wss.close(() => resolve()));
  }

  return { listen, handle, close, callTool, state };
}

export const HELP = `blockyland-mcp ${SERVER_VERSION}: lets your AI app play in the Blockyland game you have open.

Your AI app starts this program itself; you do not run it by hand. Add it once:

  Claude Code:  claude mcp add blockyland -- npx -y blockyland-mcp@latest
                (native Windows: claude mcp add blockyland -- cmd /c npx -y blockyland-mcp@latest)
  Gemini CLI:   gemini mcp add blockyland npx -y blockyland-mcp@latest
  Codex:        codex mcp add blockyland -- npx -y blockyland-mcp@latest

Then, in Blockyland: open a world in Creative (or with cheats on), press C, switch Offline Mode off, open
Connect AI, and tell your AI app "Connect to Blockyland with code <the 6-digit code>".

Environment: BLOCKYLAND_MCP_PORT (default ${DEFAULT_PORT}), BLOCKYLAND_MCP_ORIGINS (extra allowed page origins).
Guide: https://github.com/masonbpan2025-ai/blockyland/blob/master/docs/agent-control.md
`;

/**
 * The program: --help and --version answer and exit; a person who starts it in a terminal is told what it is for;
 * otherwise it serves MCP on stdio until the AI app closes it.
 */
export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--version') || argv.includes('-v')) { process.stdout.write(`${SERVER_VERSION}\n`); return; }
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); return; }
  if (process.stdin.isTTY) {
    process.stderr.write(`${HELP}\n(Waiting for an AI app on stdin. Press Ctrl+C to quit.)\n`);
  }
  const log = text => process.stderr.write(`[blockyland-mcp] ${text}\n`);
  const server = createAgentControlServer({
    port: Number(process.env.BLOCKYLAND_MCP_PORT) || DEFAULT_PORT,
    origins: (process.env.BLOCKYLAND_MCP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    log,
  });
  await server.listen();
  const lines = createInterface({ input: process.stdin });
  lines.on('line', async line => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    const response = await server.handle(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
  lines.on('close', async () => { await server.close(); process.exit(0); });
}

