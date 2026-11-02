#!/usr/bin/env node
// The blockyland-mcp command: your AI app starts it to play in your Blockyland game. `blockyland-mcp --help` says how.
import { main } from '../server.mjs';

main().catch(err => {
  process.stderr.write(`[blockyland-mcp] ${err?.stack || err}\n`);
  process.exit(1);
});
