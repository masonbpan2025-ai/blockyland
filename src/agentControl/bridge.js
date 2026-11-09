// The game tab's end of Agent Control: connects out to the local MCP server (scripts/blockyland-mcp.mjs), pairs with a
// 6-digit code the player gives their AI app, runs the tools the server forwards, and sends what the player types in
// the Agent Terminal.
//
// It only runs while the player has switched the terminal to "your AI app" (Offline Mode off), so a player who never
// does so never has the page reaching for 127.0.0.1. After a reload the tab re-pairs by itself with the session token
// the server gave it (kept in sessionStorage, so it ends with the tab).
import { DEFAULT_PORT, PROTOCOL_VERSION, newPairingCode, toolError } from './protocol.js';

const TOKEN_KEY = 'blockyland_agent_control_session';

function sessionStore() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

/**
 * Status: 'off' | 'searching' (no server answers yet) | 'waiting' (server found, not paired) | 'connected'.
 */
export class AgentControlBridge {
  constructor({
    runTool, onStatus = () => {}, onMessageReceived = () => {}, onToolCall = () => {}, onAiWaiting = () => {},
    onActivity = () => {}, onToolResult = () => {},
    gameInfo = () => ({ title: 'Blockyland' }),
    WebSocketImpl = globalThis.WebSocket, port = DEFAULT_PORT, host = '127.0.0.1',
    store = sessionStore(), timers = globalThis, retryMs = 3000,
  } = {}) {
    Object.assign(this, { runTool, onStatus, onMessageReceived, onToolCall, onAiWaiting, onActivity, onToolResult, gameInfo, WebSocketImpl, port, host, store, timers, retryMs });
    this.status = 'off';
    this.outdated = null;
    this.serverVersion = null;
    this.code = null;
    this.aiApp = null;
    this.listening = false;
    this.ws = null;
    this.retryTimer = null;
    this.nextMessageId = 1;
  }

  get enabled() { return this.status !== 'off'; }
  get connected() { return this.status === 'connected'; }

  enable() {
    if (this.enabled) return;
    this.code = newPairingCode();
    this.#setStatus('searching');
    this.#connect();
  }

  disable() {
    this.timers.clearTimeout?.(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.aiApp = null;
    this.listening = false;
    this.#forgetToken();
    this.#setStatus('off');
    try { ws?.close(); } catch { /* already closed */ }
  }

  /** A fresh code, for a player who gave the old one to the wrong place. Also drops an existing pairing. */
  newCode() {
    this.code = newPairingCode();
    this.#forgetToken();
    if (this.status === 'connected') this.aiApp = null;
    if (this.ws?.readyState === 1) {
      this.#setStatus('waiting');
      this.#hello(false);
    } else {
      this.#setStatus(this.enabled ? this.status : 'off');
    }
  }

  /** Send what the player typed to the AI app. Returns its id, or null when no AI app is connected. */
  sendPlayerMessage(text, images = []) {
    if (!this.connected || this.ws?.readyState !== 1) return null;
    const id = this.nextMessageId++;
    this.ws.send(JSON.stringify({ type: 'player_message', id, text, images }));
    return id;
  }

  #setStatus(status) {
    const snapshot = `${status}|${this.code}|${this.aiApp}|${this.outdated}|${this.listening}`;
    this.status = status;
    if (snapshot === this.lastSnapshot) return;
    this.lastSnapshot = snapshot;
    this.onStatus({ status, code: this.code, aiApp: this.aiApp, outdated: this.outdated });
  }

  #token() {
    try { return this.store?.getItem(TOKEN_KEY) || null; } catch { return null; }
  }

  #forgetToken() {
    try { this.store?.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  }

  #hello(withToken = true) {
    this.ws?.send(JSON.stringify({
      type: 'hello', role: 'game', protocol: PROTOCOL_VERSION, code: this.code,
      sessionToken: withToken ? this.#token() : null, game: this.gameInfo(),
    }));
  }

  #connect() {
    if (!this.enabled || !this.WebSocketImpl) return;
    let ws;
    try {
      ws = new this.WebSocketImpl(`ws://${this.host}:${this.port}`);
    } catch {
      this.#retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.#setStatus('waiting');
      this.#hello();
    };
    ws.onmessage = event => {
      if (this.ws !== ws) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      this.#handle(message);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.aiApp = null;
      this.listening = false;
      if (!this.enabled) return;
      this.#setStatus('searching');
      this.#retry();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  #retry() {
    this.timers.clearTimeout?.(this.retryTimer);
    this.retryTimer = this.timers.setTimeout(() => { this.retryTimer = null; this.#connect(); }, this.retryMs);
  }

  async #handle(message) {
    switch (message.type) {
      case 'welcome':
        this.aiApp = message.aiApp || null;
        // A published server can be older or newer than this game: say which side to update.
        this.outdated = typeof message.protocol !== 'number' || message.protocol === PROTOCOL_VERSION ? null
          : message.protocol < PROTOCOL_VERSION ? 'server' : 'game';
        this.serverVersion = message.server || null;
        if (this.status !== 'connected') this.#setStatus('waiting');
        break;
      case 'paired':
        this.aiApp = message.client || 'your AI app';
        try { this.store?.setItem(TOKEN_KEY, message.sessionToken); } catch { /* storage unavailable */ }
        this.#setStatus('connected');
        break;
      case 'listener_state':
        this.listening = message.listening === true;
        this.#setStatus(this.status);
        break;
      case 'unpaired':
        this.aiApp = null;
        this.#forgetToken();
        this.code = newPairingCode();
        this.#setStatus('waiting');
        this.#hello(false);
        break;
      case 'message_received':
        this.onMessageReceived(message.id);
        break;
      case 'ai_waiting':
        this.onAiWaiting();
        break;
      case 'agent_activity':
        this.onActivity(message.message, message.progress);
        break;
      case 'call': {
        const ws = this.ws;
        let reply;
        let running = true;
        const onProgress = (progress, label) => {
          if (running && this.ws === ws && ws?.readyState === 1) {
            ws.send(JSON.stringify({ type: 'tool_progress', id: message.id, progress, message: String(label || 'Working').slice(0, 500) }));
          }
        };
        this.onToolCall(message.tool, message.args || {});
        try {
          const outcome = await this.runTool(message.tool, message.args || {}, { onProgress });
          reply = { type: 'result', id: message.id, ok: true, result: outcome?.result ?? {}, images: outcome?.images ?? [] };
        } catch (err) {
          reply = { type: 'result', id: message.id, ok: false, error: err?.kind ? toolError(err.kind, err.message) : toolError('failed', err?.message || String(err)) };
        }
        running = false;
        if (this.ws === ws) this.onToolResult(message.tool, reply.ok, reply.error);
        if (ws?.readyState === 1) ws.send(JSON.stringify(reply));
        break;
      }
      default:
        break;
    }
  }
}
