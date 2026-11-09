import { createAgentControlServer } from '../packages/blockyland-mcp/server.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CODE = process.argv[2] || '215537';
const statusFile = resolve('scripts/mcp-status.json');
const logFile = resolve('scripts/mcp-messages.log');
const reqFile = resolve('scripts/current-request.json');

console.log(`[Agent Terminal Listener] Initializing server for code ${CODE}...`);

const server = createAgentControlServer({
  port: 47615,
  origins: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://blockyland.online'],
  log: (msg) => console.log(`[blockyland-mcp] ${msg}`),
});

server.state.client = { name: 'Antigravity', title: 'Antigravity', version: '2.0.0' };
await server.listen();
console.log(`[Agent Terminal Listener] Listening on ws://127.0.0.1:47615`);

// Attempt pairing with the specified code
let paired = false;
for (let attempt = 1; attempt <= 60; attempt++) {
  try {
    const res = await server.callTool('connect', { code: CODE, listen: false });
    if (!res.error && res.result?.connected) {
      paired = true;
      console.log(`[Agent Terminal Listener] Successfully paired with code ${CODE}!`);
      break;
    }
  } catch (err) {
    // waiting
  }
  if (attempt % 5 === 0) {
    const waiting = [...server.state.pages].map((p) => p.code).filter(Boolean);
    console.log(`[Agent Terminal Listener] Attempt ${attempt}: waiting for game tab with code ${CODE}. Pages seen: [${waiting.join(', ')}]`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

if (!paired) {
  console.log(`[Agent Terminal Listener] Still waiting for code ${CODE}...`);
} else {
  try {
    const stateRes = await server.callTool('get_state', {});
    if (!stateRes.error) {
      writeFileSync(statusFile, JSON.stringify(stateRes.result, null, 2));
    }
    await server.callTool('say', { text: `Antigravity connected with code ${CODE}! Listening for your terminal requests.` });
    console.log(`[Agent Terminal Listener] Greeting sent.`);
  } catch (err) {
    console.warn(`[Agent Terminal Listener] Post-connect warning:`, err.message);
  }
}

// Main message loop
while (true) {
  try {
    if (server.state.paired) {
      const msgRes = await server.callTool('wait_for_player_message', { timeout_seconds: 50 });
      if (msgRes?.result?.message) {
        const text = msgRes.result.message.trim();
        console.log(`[TERMINAL_REQUEST] "${text}"`);
        const logLine = `[${new Date().toISOString()}] ${text}\n`;
        writeFileSync(logFile, logLine, { flag: 'a' });
        writeFileSync(reqFile, JSON.stringify({ text, timestamp: new Date().toISOString() }, null, 2));

        await server.callTool('report_progress', { message: `Processing: ${text}` });

        // Dispatch common commands directly
        let handled = false;
        if (/^(make it day|set time day|\/time set day)/i.test(text)) {
          await server.callTool('run_command', { command: '/time set day' });
          await server.callTool('say', { text: 'Turned the world to day!' });
          handled = true;
        } else if (/^(make it night|set time night|\/time set night)/i.test(text)) {
          await server.callTool('run_command', { command: '/time set night' });
          await server.callTool('say', { text: 'Turned the world to night!' });
          handled = true;
        } else if (/^(clear weather|\/weather clear)/i.test(text)) {
          await server.callTool('run_command', { command: '/weather clear' });
          await server.callTool('say', { text: 'Cleared the weather!' });
          handled = true;
        } else if (/^(rain|\/weather rain)/i.test(text)) {
          await server.callTool('run_command', { command: '/weather rain' });
          await server.callTool('say', { text: 'Set weather to rain!' });
          handled = true;
        } else if (/^(creative|\/gamemode creative)/i.test(text)) {
          await server.callTool('run_command', { command: '/gamemode creative' });
          await server.callTool('say', { text: 'Set gamemode to creative!' });
          handled = true;
        } else if (/^(survival|\/gamemode survival)/i.test(text)) {
          await server.callTool('run_command', { command: '/gamemode survival' });
          await server.callTool('say', { text: 'Set gamemode to survival!' });
          handled = true;
        } else if (text.startsWith('/')) {
          const res = await server.callTool('run_command', { command: text });
          await server.callTool('say', { text: res?.result?.message || `Executed ${text}` });
          handled = true;
        }

        if (!handled) {
          await server.callTool('say', { text: `Received: "${text}". Working on it now...` });
        }

        await server.callTool('report_progress', { message: '' });
        console.log(`[TERMINAL_DONE] "${text}"`);
      }
    } else {
      // Re-check pairing
      const res = await server.callTool('connect', { code: CODE, listen: false });
      if (!res.error && res.result?.connected) {
        console.log(`[Agent Terminal Listener] Paired with code ${CODE}!`);
        await server.callTool('say', { text: `Antigravity connected with code ${CODE}!` });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error(`[Agent Terminal Listener] Loop error:`, err?.message || err);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

