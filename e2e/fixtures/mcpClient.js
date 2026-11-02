// A minimal MCP client over stdio, standing in for an AI app: it starts scripts/blockyland-mcp.mjs the way Claude Code
// does, and calls its tools. Used by e2e/agentControl.pw.js.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export async function startMcpServer({ port, clientName = 'claude-code' }) {
  const child = spawn(process.execPath, ['scripts/blockyland-mcp.mjs'], {
    env: { ...process.env, BLOCKYLAND_MCP_PORT: String(port) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stderr = [];
  child.stderr.on('data', d => stderr.push(String(d)));
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  const request = (method, params) => new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: clientName, version: '1.0' } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  /** Call a tool: { isError, body (the parsed text), images }. */
  const call = async (name, args = {}) => {
    const { result } = await request('tools/call', { name, arguments: args });
    const [text, ...images] = result.content;
    return { isError: result.isError, body: JSON.parse(text.text), images };
  };
  const stop = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.stdin.end();
    setTimeout(() => child.kill(), 2000);
  });
  return { init: init.result, request, call, stop, stderr };
}
