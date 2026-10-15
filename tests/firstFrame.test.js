// The first frame of a new world. The canvas used to show the world while it was still loading -- seen from the
// camera's starting point at the origin, beneath the terrain, in a canvas not yet sized to the window -- so the
// player saw the underside of the world in half the screen before the game began. Now nothing of the world is
// drawn until it is ready, the cover goes up before anything is awaited, and the camera and the canvas are put
// right (the spawn view, the window's size) before the world is shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLifecycle, beginLoading, markReady, rendersWorldForPhase, PHASES } from '../src/worldLifecycle.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const body = (name) => {
  const start = main.indexOf(`  ${name}`);
  assert.ok(start >= 0, `${name} exists`);
  return main.slice(start, main.indexOf('\n  }\n', start));
};

test('only a ready world is drawn', () => {
  assert.deepEqual(PHASES.filter(rendersWorldForPhase), ['ready']);
  const life = createLifecycle();
  assert.equal(rendersWorldForPhase(life.phase), false, 'the title screen');
  beginLoading(life);
  assert.equal(rendersWorldForPhase(life.phase), false, 'while the terrain loads');
  markReady(life);
  assert.equal(rendersWorldForPhase(life.phase), true, 'once it is ready');
});

test('the loading frames clear the canvas instead of drawing the scene from the origin', () => {
  const animate = body('animate() {');
  const gate = animate.slice(animate.indexOf('if (!allowsSimulationForPhase('), animate.indexOf('return;', animate.indexOf('if (!allowsSimulationForPhase(')));
  assert.match(gate, /this\.renderer\.clear\(\)/);
  assert.match(gate, /if \(rendersWorldForPhase\(this\.lifecycle\?\.phase\)\) this\.renderer\.render\(this\.scene, this\.camera\)/,
    'a loading world is not rendered');
});

test('the progress overlay is up before anything in a new world is awaited', () => {
  const gen = body('async generateNewWorld() {');
  const show = gen.indexOf("this.overlay.show('Generating World')");
  const firstAwait = gen.indexOf('await ');
  assert.ok(show >= 0 && show < firstAwait, 'the overlay first, then the data packs');
});

test('the world is shown from the spawn, at the window size', () => {
  const gen = body('async generateNewWorld() {');
  const camera = gen.indexOf('this.player.updateCameraAndModel?.(0)');
  const viewport = gen.indexOf('this.syncViewportSize()');
  const ready = gen.indexOf('markReady(this.lifecycle)');
  assert.ok(camera >= 0 && viewport > camera && ready > viewport, 'camera to the spawn, canvas sized, then ready');
  const load = body('async loadMapWithProgress(');
  assert.ok(load.indexOf('this.syncViewportSize()') < load.indexOf('this.overlay.hide()'), 'a loaded map likewise, before its overlay lifts');
  assert.ok(load.indexOf('updateCameraAndModel?.(0)') < load.indexOf('this.overlay.hide()'));
  // And the resize handler is the same method, so the two cannot disagree.
  assert.match(main, /window\.addEventListener\('resize', \(\) => this\.syncViewportSize\(\)\)/);
  const sync = body('syncViewportSize() {');
  assert.match(sync, /this\.renderer\.setSize\(w, h\)/);
  assert.match(sync, /this\.camera\.aspect = w \/ h/);
});
