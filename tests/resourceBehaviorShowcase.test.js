import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { ResourceInspectionWorld, ResourceBehaviorShowcase } from '../src/resourceBehaviorShowcase.js';

function finish(run) { for (let ticks = 0; run.running && ticks < 10000; ticks++) run.update(0.05); assert.equal(run.running, false); }

test('the same Inspector scenarios verify fuel, smelting, collection, blocking, buckets, extinguishing and drops', () => {
  for (const blockId of [BLOCKS.FURNACE, BLOCKS.LIT_FURNACE]) {
    const scene = new THREE.Scene();
    const session = new ResourceInspectionWorld(blockId, { scene });
    const visits = [];
    const run = new ResourceBehaviorShowcase({ entry: { blockId }, session, onStep: step => visits.push(step.id) });
    finish(run);
    assert.equal(run.results.length, 14);
    assert.deepEqual(run.results.filter(r => r.status !== 'observed'), []);
    for (const id of ['load-fuel', 'ignite', 'smelt', 'collect-output', 'blocked-output', 'lava-bucket', 'extinguish', 'break-contents']) assert.ok(visits.includes(id), id);
    assert.equal(session.furnaceManager.furnaces.size, 0);
    assert.equal(session.world.getVoxel(8, 2, 8), BLOCKS.AIR);
    assert.equal(scene.children.filter(child => child.isPointLight).length, 0);
    session.dispose();
  }
});

test('non-furnace items show their check results and do not invent behavior coverage', () => {
  const checks = [
    { id: 'source', label: 'Obtainability', status: 'not observed', detail: 'missing source' },
    { id: 'icon', label: 'Icon', status: 'observed' },
    { id: 'parity', label: 'Comparison', status: 'unsupported' },
  ];
  const run = new ResourceBehaviorShowcase({ entry: { blockId: null }, checks });
  finish(run);
  assert.deepEqual(run.results.slice(0, 3), checks);
  assert.equal(run.results.slice(3).filter(r => r.status === 'unsupported').length, 6);
});

test('Stop freezes progression, and restarting uses fresh state without leaking lights', () => {
  const scene = new THREE.Scene(), session = new ResourceInspectionWorld(BLOCKS.FURNACE, { scene });
  const run = new ResourceBehaviorShowcase({ entry: { blockId: BLOCKS.FURNACE }, session });
  while (run.current.id !== 'smelt') run.update(0.1);
  assert.equal(scene.children.filter(c => c.isPointLight).length, 1);
  run.stop();
  const index = run.index;
  run.update(1);
  assert.equal(run.index, index);
  session.dispose();
  assert.equal(scene.children.filter(c => c.isPointLight).length, 0);
  session.reset();
  const restart = new ResourceBehaviorShowcase({ entry: { blockId: BLOCKS.FURNACE }, session });
  finish(restart);
  assert.equal(restart.results.filter(r => r.status !== 'observed').length, 0);
});

test('scenario errors are reported and do not stop later checks', () => {
  const session = new ResourceInspectionWorld(BLOCKS.FURNACE);
  session.inspectFace = () => { throw new Error('mesh failed'); };
  const run = new ResourceBehaviorShowcase({ entry: { blockId: BLOCKS.FURNACE }, session });
  finish(run);
  assert.equal(run.results.filter(r => r.status === 'error').length, 6);
  assert.equal(run.results.at(-1).status, 'observed');
  session.dispose();
});

test('both Item and Block Inspector offer runnable Showcase and Stop controls', () => {
  for (const page of ['item-debug.html', 'block-debug.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    for (const id of ['showcase', 'showcase-stop', 'showcase-status', 'showcase-results', 'showcase-telemetry']) assert.ok(html.includes(`id="${id}"`), `${page}: ${id}`);
  }
});
