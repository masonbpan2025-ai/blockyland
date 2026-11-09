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
import { GuestPeerSession, createModelBrain } from './guestPeer.js';

export const SUPPORTED_MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
/** The package's own version, so the AI app and the game can tell which server they talk to. */
export const SERVER_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const LOG_LEVELS = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];
const LISTEN_NEXT = 'Call wait_for_player_message immediately and keep listening after timeouts. Do not end your turn while serving the terminal.';

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
  shareUrl = process.env.BLOCKYLAND_SHARE_URL || 'ws://localhost:3000/ws/share',
  WebSocketImpl = undefined, notify = () => {},
} = {}) {
  const state = {
    client: null, wss: null, port: null, listenError: null,
    pages: new Set(), paired: null, sessionToken: null,
    messages: [], waiters: [], pending: new Map(), nextId: 1,
    guests: new Map(), activeGuest: null,
    requests: new Map(), logLevel: 'info',
  };

  const send = (page, message) => {
    if (page?.ws.readyState === 1) page.ws.send(JSON.stringify(message));
  };
  const activity = (message, level = 'info') => {
    if (LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(state.logLevel)) {
      notify({ jsonrpc: '2.0', method: 'notifications/message', params: { level, logger: 'blockyland', data: message } });
    }
  };
  function failWaiters(page, reason) {
    for (const waiter of [...state.waiters]) {
      if (waiter.page === page) waiter({ failure: toolError('connection', reason) });
    }
  }

  function pair(page) {
    if (state.paired && state.paired !== page) {
      failWaiters(state.paired, 'Another game tab connected.');
      failPending('Another game tab connected.');
      send(state.paired, { type: 'unpaired', reason: 'Another game tab connected.' });
    }
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
            failWaiters(page, 'The player asked for a new pairing code.');
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
      } else if (message.type === 'tool_progress' && page === state.paired) {
        const entry = state.pending.get(message.id);
        if (!entry || typeof message.message !== 'string') return;
        const pct = Number.isFinite(message.progress) ? Math.max(0, Math.min(100, message.progress)) : null;
        const label = message.message.slice(0, 500);
        // A multi-part build can restart its percentage. MCP progress counts updates monotonically;
        // the message carries the actual percentage of the current part.
        const now = Date.now();
        if (!entry.lastProgressAt || now - entry.lastProgressAt >= 250 || pct === 100) {
          entry.lastProgressAt = now;
          entry.report?.(`${label}${pct === null ? '' : ` (${pct}%)`}`);
        }
      } else if (message.type === 'player_message' && page === state.paired) {
        const text = typeof message.text === 'string' ? message.text.slice(0, 8000) : '';
        const images = Array.isArray(message.images) ? message.images.filter(i => i && typeof i.data === 'string').slice(0, 2) : [];
        if (!text && !images.length) return;
        const entry = { id: message.id, text, images };
        activity('A player request is ready in Blockyland. Call wait_for_player_message now.');
        const waiter = state.waiters.shift();
        if (waiter) waiter(entry); else state.messages.push(entry);
      }
    });
    ws.on('close', () => {
      state.pages.delete(page);
      if (state.paired === page) {
        failWaiters(page, 'The game tab closed or reloaded.');
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

  function waitForMessage(timeoutSeconds, page, signal) {
    if (state.messages.length) return Promise.resolve(state.messages.shift());
    return new Promise(resolve => {
      const waiter = entry => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancelled);
        state.waiters = state.waiters.filter(w => w !== waiter);
        send(page, { type: 'listener_state', listening: state.waiters.some(w => w.page === page) });
        resolve(entry);
      };
      waiter.page = page;
      const cancelled = () => waiter({ failure: toolError('state', 'Listening was cancelled. Call wait_for_player_message to resume.') });
      const timer = setTimeout(() => waiter(null), timeoutSeconds * 1000);
      state.waiters.push(waiter);
      send(page, { type: 'listener_state', listening: true });
      signal?.addEventListener('abort', cancelled, { once: true });
      if (signal?.aborted) cancelled();
    });
  }

  async function receiveRequest(timeoutSeconds, context = {}) {
    const page = state.paired;
    if (!state.messages.length) send(page, { type: 'ai_waiting' });
    context.report?.('Listening for your next Blockyland request.');
    const heartbeat = setInterval(() => context.progress?.('Still listening for a Blockyland request.'), 10000);
    let entry;
    try { entry = await waitForMessage(timeoutSeconds, page, context.signal); }
    finally { clearInterval(heartbeat); }
    if (entry?.failure) return { error: entry.failure };
    if (!entry) return { result: { waiting: true, next_action: LISTEN_NEXT } };
    send(page, { type: 'message_received', id: entry.id });
    context.report?.('Picked up the player request. Inspecting the request and attached images.');
    return {
      result: { message: entry.text, request_id: entry.id, images: entry.images.length,
        next_action: 'Act on this request now. Show a short work summary in your chat and with report_progress; finish with say, then wait_for_player_message.' },
      images: entry.images,
    };
  }

  async function runServerTool(name, args, context = {}) {
    if (name === 'connect') {
      if (!state.wss) {
        await listen();
        if (!state.wss) return { error: notConnected() };
      }
      if (!args.code) {
        return { result: {
          connected: !!state.paired, game: state.paired?.game ?? null,
          gamesWaiting: [...state.pages].filter(p => p !== state.paired).length, port: state.port,
          listening: state.waiters.some(w => w.page === state.paired),
        } };
      }
      const page = [...state.pages].find(p => p.code === args.code);
      if (!page) {
        return { error: toolError('unknown', `No game is waiting with code ${args.code}. Check the code in the game's "Connect AI" panel; it shows "Looking for your AI app" until this server is running, then the code to give you.`) };
      }
      if (state.paired !== page) pair(page);
      context.report?.(`Connected to Blockyland as ${clientLabel(state.client)}.`);
      if (args.listen === false) return { result: { connected: true, game: page.game, next_action: LISTEN_NEXT } };
      const heard = await receiveRequest(args.timeout_seconds ?? 25, context);
      if (heard.error) return heard;
      return { ...heard, result: { connected: true, game: page.game, ...heard.result } };
    }
    if (name === 'wait_for_player_message') {
      if (!state.paired && !state.activeGuest) return { error: notConnected() };
      // If a guest peer is joined in multiplayer, check for player chat messages sent in the shared world (T key)
      if (state.activeGuest && !state.paired) {
        const entry = await state.activeGuest.waitForChat((args.timeout_seconds ?? 50) * 1000);
        if (!entry) return { result: { waiting: true, note: 'Nothing yet. Call wait_for_player_message again to keep listening.' } };
        return {
          result: {
            message: entry.message,
            sender: entry.sender,
            peerId: entry.peerId,
            source: 'guest_chat',
          },
        };
      }
      return receiveRequest(args.timeout_seconds ?? 50, context);
    }
    if (name === 'report_progress') {
      if (!state.paired) return { error: notConnected() };
      send(state.paired, { type: 'agent_activity', message: args.message, progress: args.progress });
      context.report?.(args.message);
      return { result: { shown: true } };
    }
    if (name === 'join_game') {
      let code = args.code ? String(args.code).trim() : null;
      let targetUrl = args.url || shareUrl;
      if (!code && state.paired) {
        const hosted = await runGameTool({ name: 'host_room', timeoutMs: 15_000 }, {});
        if (hosted.error) return hosted;
        code = hosted.result?.roomId || null;
        if (!args.url && hosted.result?.signalingUrl) targetUrl = hosted.result.signalingUrl;
      }
      if (!code || !/^[0-9]{4}$/.test(code)) {
        return { error: toolError('usage', 'Provide the 4-digit room code from Share World, SkyWars, or Bed Wars (for example {"code": "1234"}), or connect to a game tab first.') };
      }
      const rawName = (args.name || clientLabel(state.client) || 'Agent').replace(/^your AI app$/i, 'Agent');
      const guestName = rawName.slice(0, 24);
      const existing = state.guests.get(guestName);
      if (existing) existing.disconnect();
      const guest = new GuestPeerSession({
        code,
        name: guestName,
        url: targetUrl,
        WebSocketImpl,
        log,
        autopilot: args.autopilot ?? true,
        strategy: args.strategy || 'auto',
        difficulty: args.difficulty || 'normal',
        brain: createModelBrain(),
      });
      try {
        const status = await guest.connect({ team: args.team });
        state.guests.set(guest.name, guest);
        state.activeGuest = guest;
        return { result: status };
      } catch (err) {
        guest.disconnect();
        return { error: toolError('connection', err?.message || 'Could not join the game room.') };
      }
    }
    if (name === 'leave_game') {
      if (args.name) {
        const g = state.guests.get(args.name);
        if (!g) return { error: toolError('state', `No joined guest player named "${args.name}".`) };
        g.disconnect();
        state.guests.delete(args.name);
        if (state.activeGuest === g) state.activeGuest = [...state.guests.values()].at(-1) || null;
        return { result: { left: true, name: args.name } };
      }
      if (!state.activeGuest && state.guests.size === 0) {
        return { result: { left: false, note: 'No guest player was joined.' } };
      }
      for (const g of state.guests.values()) g.disconnect();
      state.guests.clear();
      state.activeGuest = null;
      return { result: { left: true } };
    }
    if (name === 'guest_status') {
      const guest = args.name ? state.guests.get(args.name) : state.activeGuest;
      if (!guest || !guest.connected) {
        return { error: toolError('state', 'Not joined to a game room. Call join_game with a 4-digit room code first.') };
      }
      return { result: guest.status({ radius: args.radius }) };
    }
    if (name === 'guest_act') {
      const guest = args.name ? state.guests.get(args.name) : state.activeGuest;
      if (!guest || !guest.connected) {
        return { error: toolError('state', 'Not joined to a game room. Call join_game with a 4-digit room code first.') };
      }
      try {
        const result = await guest.act(args, {
          onStartMatch: state.paired
            ? async () => {
              const res = await runGameTool({ name: 'mod_match', timeoutMs: 10_000 }, { op: 'start' });
              if (res.error) throw new Error(res.error.error || 'Host could not start the match.');
              return res.result;
            }
            : null,
        });
        return { result };
      } catch (err) {
        return { error: toolError('failed', err?.message || String(err)) };
      }
    }
    return { error: toolError('unknown', `No server tool ${name}.`) };
  }

  function runGameTool(tool, args, context = {}) {
    if (!state.paired) return Promise.resolve({ error: notConnected() });
    const id = state.nextId++;
    const page = state.paired;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        resolve({ ok: false, error: toolError('timeout', `The game did not answer ${tool.name} within ${Math.round(tool.timeoutMs / 1000)} s. Its tab may be asleep in the background; ask the player to bring it to the front.`) });
      }, tool.timeoutMs);
      state.pending.set(id, { resolve, timer, report: context.report });
      send(page, { type: 'call', id, tool: tool.name, args });
    }).then(reply => reply.ok
      ? { result: reply.result ?? {}, images: Array.isArray(reply.images) ? reply.images : [] }
      : { error: reply.error || toolError('failed', 'The game reported a failure.') });
  }

  async function callTool(name, args = {}, context = {}) {
    const tool = TOOL_BY_NAME.get(name);
    if (!tool) return { error: toolError('unknown', `No tool named ${name}. The tools are: ${TOOLS.map(t => t.name).join(', ')}.`) };
    const problem = checkArguments(tool, args);
    if (problem) return { error: toolError('usage', `${name}: ${problem}.`) };
    return tool.runs === 'server' ? runServerTool(name, args ?? {}, context) : runGameTool(tool, args ?? {}, context);
  }

  /** One JSON-RPC message in, its response out (null for notifications). */
  async function handle(message) {
    const { id, method, params } = message || {};
    const isRequest = id !== undefined && id !== null;
    const reply = result => ({ jsonrpc: '2.0', id, result });
    const fail = (code, text) => ({ jsonrpc: '2.0', id: isRequest ? id : null, error: { code, message: text } });
    if (message?.jsonrpc !== '2.0' || typeof method !== 'string') return isRequest ? fail(-32600, 'Invalid request') : null;
    if (!isRequest) {
      if (method === 'notifications/cancelled') state.requests.get(params?.requestId)?.abort();
      return null;
    }
    switch (method) {
      case 'initialize': {
        state.client = params?.clientInfo ?? null;
        const asked = params?.protocolVersion;
        return reply({
          protocolVersion: SUPPORTED_MCP_VERSIONS.includes(asked) ? asked : SUPPORTED_MCP_VERSIONS[1],
          capabilities: { tools: { listChanged: false }, logging: {} },
          serverInfo: { name: SERVER_NAME, title: 'Blockyland', version: SERVER_VERSION },
          instructions: SERVER_INSTRUCTIONS,
        });
      }
      case 'ping':
        return reply({});
      case 'logging/setLevel':
        if (!LOG_LEVELS.includes(params?.level)) return fail(-32602, 'Invalid logging level.');
        state.logLevel = params.level;
        return reply({});
      case 'tools/list':
        return reply({
          tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
            name, title, description, inputSchema, annotations: { title, ...annotations },
          })),
        });
      case 'tools/call': {
        const controller = new AbortController();
        state.requests.set(id, controller);
        const token = params?._meta?.progressToken;
        let count = 0;
        const progress = message => {
          if (typeof token === 'string' || Number.isInteger(token)) {
            notify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: count++, message } });
          }
        };
        const report = message => { activity(message); progress(message); };
        const tool = TOOL_BY_NAME.get(params?.name);
        report(`${tool?.title || params?.name}: started.`);
        let outcome;
        try { outcome = await callTool(params?.name, params?.arguments, { signal: controller.signal, report, progress }); }
        finally { state.requests.delete(id); }
        report(`${tool?.title || params?.name}: ${outcome.error ? outcome.error.error : 'finished'}.`);
        if (params?.name === 'say' && outcome.result) outcome.result.next_action = LISTEN_NEXT;
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
    for (const waiter of [...state.waiters]) waiter({ failure: toolError('connection', 'The MCP server is shutting down.') });
    for (const guest of state.guests.values()) guest.disconnect();
    state.guests.clear();
    state.activeGuest = null;
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
    notify: message => process.stdout.write(`${JSON.stringify(message)}\n`),
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

