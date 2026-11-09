import { createAgentControlServer } from '../packages/blockyland-mcp/server.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CODE = process.argv[2] || '597095';
const cmdFile = resolve('scripts/mcp-cmd.json');
const statusFile = resolve('scripts/mcp-status.json');
const logFile = resolve('scripts/mcp-messages.log');
const reqFile = resolve('scripts/current-request.json');
const imgDir = resolve('scripts/player-images');
mkdirSync(imgDir, { recursive: true });

console.log(`[MCP Server] Initializing Antigravity Agent Control server for code ${CODE}...`);

const server = createAgentControlServer({
  port: 47615,
  origins: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://blockyland.online'],
  log: (msg) => console.log(`[blockyland-mcp] ${msg}`),
});

server.state.client = { name: 'Antigravity', title: 'Antigravity', version: '2.0.0' };
await server.listen();
console.log(`[MCP Server] Listening on ws://127.0.0.1:47615`);

// Attempt to pair with the code
let paired = false;
for (let attempt = 1; attempt <= 45; attempt++) {
  const res = await server.callTool('connect', { code: CODE, listen: false });
  if (!res.error && res.result?.connected) {
    paired = true;
    console.log(`[MCP Server] Successfully paired with Blockyland tab!`);
    console.log(`[MCP Server] Game info:`, JSON.stringify(res.result.game));
    break;
  }
  if (attempt % 5 === 0) {
    const waiting = [...server.state.pages].map((p) => p.code).filter(Boolean);
    console.log(`[MCP Server] Attempt ${attempt}: waiting for game tab with code ${CODE}. Pages waiting: [${waiting.join(', ')}]`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

if (!paired) {
  console.error(`[MCP Server] Pairing with code ${CODE} timed out after 45s.`);
} else {
  // Get initial state
  const stateRes = await server.callTool('get_state', {});
  if (!stateRes.error) {
    console.log(`[MCP Server] Initial state:`, JSON.stringify(stateRes.result, null, 2));
    writeFileSync(statusFile, JSON.stringify(stateRes.result, null, 2));
  }

  // Greet player in Agent Terminal
  await server.callTool('say', { text: `Antigravity connected via MCP with code ${CODE}! Listening for your requests.` });
  console.log(`[MCP Server] Sent greeting to Agent Terminal.`);
}

let imageIndex = 0;

// Background loop for player messages from the terminal
(async function messageLoop() {
  while (true) {
    try {
      if (server.state.paired) {
        const msgRes = await server.callTool('wait_for_player_message', { timeout_seconds: 50 });
        if (msgRes.result?.message || (msgRes.images && msgRes.images.length)) {
          const text = msgRes.result?.message || '';
          console.log(`[MCP Server] Player message: "${text}"`);

          const savedImages = [];
          for (const img of msgRes.images || []) {
            const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
            const imgPath = resolve(imgDir, `upload-${Date.now()}-${++imageIndex}.${ext}`);
            writeFileSync(imgPath, Buffer.from(img.data, 'base64'));
            savedImages.push(imgPath);
          }

          const requestData = {
            id: msgRes.result?.request_id || Date.now(),
            text,
            images: savedImages,
            timestamp: new Date().toISOString(),
          };
          writeFileSync(reqFile, JSON.stringify(requestData, null, 2));

          const logLine = `[${requestData.timestamp}] ${text} (images: ${savedImages.length})\n`;
          writeFileSync(logFile, logLine, { flag: 'a' });

          await server.callTool('say', { text: `Picked up: "${text}" — working on it now...` });
        }
      } else {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`[MCP Server] messageLoop error:`, err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
})();

// Command dispatch loop from scripts/mcp-cmd.json
(async function cmdLoop() {
  while (true) {
    try {
      if (existsSync(cmdFile)) {
        let content = '';
        try { content = readFileSync(cmdFile, 'utf8').trim(); } catch {}
        if (content) {
          writeFileSync(cmdFile, '');
          let cmd;
          try { cmd = JSON.parse(content); } catch (e) {
            console.error('[MCP Server] Invalid cmd json:', e.message);
          }
          if (cmd?.tool) {
            console.log(`[MCP Server] Executing cmd tool "${cmd.tool}" with args:`, cmd.args);
            const res = await server.callTool(cmd.tool, cmd.args || {});
            console.log(`[MCP Server] Tool result:`, JSON.stringify(res));
            writeFileSync(resolve('scripts/mcp-result.json'), JSON.stringify(res, null, 2));
          }
        }
      }
    } catch (err) {
      console.error(`[MCP Server] cmdLoop error:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
})();

// Keep process alive indefinitely
setInterval(() => {}, 60000);
