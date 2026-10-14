// A BowController wired to a stub game, so the ammo search and the fired options can be exercised for real.
//
// `bow.js` reads `inventory.hotbar`, `inventory.storage`, `camera.getWorldDirection`, `player.position`,
// `mobs.spawnArrow`, `ui.updateHotbar` and `heldItemRenderer.recoil`. Stubbing exactly those keeps the test
// on the real code path rather than on a reimplementation of it.
import * as THREE from 'three';
import { afterEach } from 'node:test';
import { BowController } from '../../src/bow.js';

let documentDescriptor;
let installedDocument = false;
afterEach(() => {
  if (!installedDocument) return;
  if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
  else delete globalThis.document;
  installedDocument = false;
});

/** Build a controller whose ammo slots and fired options can be inspected. */
export function makeBowFixture() {
  const fired = [];
  const hotbar = [];
  const state = { activeSlot: 0 };
  // One stable object per slot: `release` checks `getActiveItem() === this.item` by IDENTITY, so a stub
  // that builds a fresh object per call makes every shot fail the equality check and the bow never fires.
  const bowItem = { id: 'bow', isBlock: false, count: 1 };
  const game = {
    player: {
      position: new THREE.Vector3(0, 1, 0), eyeHeight: 1.62,
      gamemode: 'survival', isDead: false, bowDraw: 0,
    },
    inventory: {
      hotbar, storage: [],
      getActiveItem: () => bowItem,
      get activeSlot() { return state.activeSlot; },
    },
    camera: { getWorldDirection: (v) => v.set(0, 0, -1) },
    mobs: { spawnArrow: (origin, direction, shooter, options) => fired.push({ origin, direction, shooter, options }) },
    // `isModalOpen` is a METHOD and `isChatOpen` is a BOOLEAN PROPERTY, which is not a detail: `canUse`
    // reads `!g.ui.isChatOpen` with no parentheses, so stubbing it as a function makes it permanently
    // truthy and `canUse()` permanently false. That is what the first version of this fixture did, and it
    // made the bow look broken when only the fixture was.
    ui: { isModalOpen: () => false, isChatOpen: false, updateHotbar() {} },
    heldItemRenderer: { recoil() {} },
    renderer: { domElement: {} },
    dungeonMode: { isActive: false },
  };
  // `canUse` also requires the pointer to be locked to the canvas, which cannot happen headless.
  if (!installedDocument) documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  installedDocument = true;
  Object.defineProperty(globalThis, 'document', {
    value: { pointerLockElement: game.renderer.domElement }, configurable: true, writable: true,
  });
  const bow = new BowController(game);
  return { bow, game, fired, hotbar };
}

/**
 * The id `ammo()` returns for a given hotbar item, or null.
 *
 * @param {string} id
 * @param {boolean} [isBlock]
 * @param {number} [count]
 */
export function ammoIdFor(id, isBlock = false, count = 1) {
  const { bow, hotbar } = makeBowFixture();
  hotbar.length = 0;
  hotbar.push({ id, isBlock, count });
  return bow.ammo()?.id ?? null;
}

/** Fire the bow with a single stack of `id` in the hotbar and return the options it passed. */
export function fireWith(id) {
  const { bow, hotbar, fired } = makeBowFixture();
  hotbar.length = 0;
  hotbar.push({ id, isBlock: false, count: 64 });
  // A full draw, so the power gate in `release` does not reject the shot.
  bow.start();
  bow.time = 1;
  bow.drawing = true;
  bow.release();
  if (fired.length === 0) throw new Error('the bow did not fire with ' + id + ' as ammo');
  return fired[fired.length - 1].options;
}

/** A convenience object so a test can name the three helpers without three imports. */
export function tipsFor() {
  return { ammoIdFor, fireWith, makeBowFixture };
}
