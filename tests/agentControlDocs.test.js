// docs/agent-control.md is the user guide for Agent Control. Its tool table must name every tool the server offers,
// and only those, so the guide cannot drift from src/agentControl/protocol.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS, ERROR_KINDS, DEFAULT_PORT } from '../src/agentControl/protocol.js';

const doc = readFileSync(new URL('../docs/agent-control.md', import.meta.url), 'utf8');
const section = doc.slice(doc.indexOf('## Tools'), doc.indexOf('## Rules'));

test('the guide lists every tool, and no tool that does not exist', () => {
  const listed = [...section.matchAll(/^\| `([a-z_]+)` \| (server|game) \|/gm)].map(m => [m[1], m[2]]);
  assert.deepEqual(listed, TOOLS.map(t => [t.name, t.runs]));
});

test('the guide names every error kind and the default port', () => {
  for (const kind of ERROR_KINDS) assert.match(section, new RegExp(`\`${kind}\``), kind);
  assert.match(doc, new RegExp(String(DEFAULT_PORT)));
});
