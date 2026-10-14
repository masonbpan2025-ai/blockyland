// Runs a mob's whole Inspector showcase headlessly and returns each scenario's result.
//
// `Math.random` is replaced by a seeded generator for the duration of the run. The engine rolls dice in places
// (wander directions, potion cooldowns, anger timers), and a test that compares the whole showcase against a list of
// known results must not depend on which way a die fell.
import * as THREE from 'three';
import { MobShowcase } from '../../src/mobShowcase.js';
import { createMobDebugSession } from '../../src/mobDebugSession.js';

export function seededRandom(seed = 1) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

export function runShowcase(selection, { dt = 1 / 30, maxTicks = 400000, seed = 1 } = {}) {
  const realRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    const session = createMobDebugSession(new THREE.Scene(), () => {});
    let final = null;
    const showcase = new MobShowcase(session, (r) => { if (r.done) final = r; });
    showcase.start(selection);
    let ticks = 0;
    while (showcase.running && ticks++ < maxTicks) showcase.tick(dt);
    return final?.results ?? showcase.results;
  } finally {
    Math.random = realRandom;
  }
}
