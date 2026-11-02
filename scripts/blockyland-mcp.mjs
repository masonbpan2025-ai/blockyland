#!/usr/bin/env node
// Blockyland's MCP server, run from a checkout: `node scripts/blockyland-mcp.mjs` (or `npm run mcp`). The code is the
// npm package blockyland-mcp in packages/blockyland-mcp/, so a checkout and `npx blockyland-mcp` run the same server.
// Players without a checkout use the package: see docs/agent-control.md.
export * from '../packages/blockyland-mcp/server.mjs';
import { main } from '../packages/blockyland-mcp/server.mjs';

if (process.argv[1] && /blockyland-mcp\.mjs$/.test(process.argv[1])) {
  main().catch(err => {
    process.stderr.write(`[blockyland-mcp] ${err?.stack || err}\n`);
    process.exit(1);
  });
}
