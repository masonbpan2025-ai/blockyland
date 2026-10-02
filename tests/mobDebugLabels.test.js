import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';

function fixture() {
  const scene = new THREE.Scene();
  const textures = new Proxy({}, {
    get: (target, key) => {
      if (typeof key === 'symbol') return undefined;
      return target[key] ||= new THREE.Texture();
    }
  });
  return Object.assign(Object.create(MobManager.prototype), {
    scene,
    world: { getVoxel: () => 0 },
    textures,
    mobs: [],
    arrows: [],
    sounds: {},
    entities: null,
    debugLabelsEnabled: false
  });
}

test('debug labels show mob name and current health and follow movement', () => {
  const manager = fixture();
  const pig = manager.spawnPig(2, 1, 3);
  assert.equal(pig.debugLabel, undefined, 'labels stay off by default');

  manager.setDebugLabelsEnabled(true);
  manager.updateDebugLabels();
  assert.ok(pig.debugLabel?.isSprite, 'an inspection sprite is attached to the scene');
  assert.equal(pig.debugLabel.visible, true);
  const start = pig.debugLabel.position.clone();

  pig.mesh.position.x += 4;
  manager.updateDebugLabels();
  assert.equal(pig.debugLabel.position.x, start.x + 4, 'label tracks the mob root');

  manager.damageMob(pig, 2);
  manager.updateDebugLabels();
  assert.match(pig.debugLabelKey, /HP 8\/10/, 'health changes refresh the label text key');
});

test('turning mob debug off removes labels and clears scene resources', () => {
  const manager = fixture();
  const pig = manager.spawnPig(0, 1, 0);
  manager.setDebugLabelsEnabled(true);
  manager.updateDebugLabels();
  const label = pig.debugLabel;
  assert.ok(manager.scene.children.includes(label));

  manager.setDebugLabelsEnabled(false);
  assert.equal(pig.debugLabel, null);
  assert.ok(!manager.scene.children.includes(label));
});

test('death removes the mob label with the render mesh', () => {
  const manager = fixture();
  const pig = manager.spawnPig(0, 1, 0);
  manager.setDebugLabelsEnabled(true);
  manager.updateDebugLabels();
  const label = pig.debugLabel;
  manager.damageMob(pig, 999);
  for (let i = 0; i < 12; i++) manager.updateDeath(pig, 0.1);
  assert.ok(!manager.scene.children.includes(label), 'dead mobs must not leave floating labels behind');
});

test('pause menu exposes the mob debug toggle and UI forwards its state', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');
  assert.match(html, /id="btn-mob-debug"/);
  assert.match(html, /Mob Debug Labels: OFF/);
  assert.match(ui, /setDebugLabelsEnabled/);
  assert.match(ui, /aria-pressed/);
});
