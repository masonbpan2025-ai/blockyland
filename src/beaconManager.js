// Beacons and conduits, actually running.
//
// Round 10 fixed the two functions that apply their effects -- they were writing plain properties on a Map,
// which nothing reads -- but neither was called from anywhere. `calculateBeaconPyramid` ran only when the
// beacon panel was open, `calculateConduitFrame` never ran at all, and a chosen power was discarded when
// the panel closed. A beacon was a decorative block with a window.
//
// This is the third piece: somewhere that remembers where they are, what power a beacon was given, and
// re-checks the structure often enough to apply the effects. It follows `FarmingManager`, which registers
// on placement and unregisters on break rather than scanning the world.
//
// Not persisted: the save format has a slot per subsystem (`serializeHorse`, `serializeSquid`, ...) and
// adding one for beacons is a change to `mapManager` rather than to this file. A saved world reloads with
// its beacons needing their power chosen again, which is recorded in the batch notes rather than hidden.
import { calculateBeaconPyramid, calculateConduitFrame, applyBeaconBuffs, applyConduitPower } from './beaconConduit.js';
import { BLOCKS } from './blocks.js';
import { advancementEvent } from './advancements.js';

/** How often the structures are re-checked, in seconds. Their effects carry a 16 s buffer, so 1 s is ample. */
export const BEACON_TICK_SECONDS = 1;

export class BeaconManager {
  constructor(game) {
    this.game = game;
    /** @type {Map<string, {x:number,y:number,z:number,primary:string|null,secondary:string|null}>} */
    this.beacons = new Map();
    /** @type {Map<string, {x:number,y:number,z:number}>} */
    this.conduits = new Map();
    this.timer = 0;
  }

  static key(x, y, z) {
    return `${x},${y},${z}`;
  }

  /**
   * A beacon or conduit has been placed.
   *
   * A beacon is remembered without a power: it grants nothing until one is chosen, which is what vanilla
   * does and what makes the payment item meaningful.
   */
  onBlockPlaced(x, y, z, blockId) {
    if (blockId === BLOCKS.BEACON) {
      this.beacons.set(BeaconManager.key(x, y, z), { x, y, z, primary: null, secondary: null });
      return true;
    }
    if (blockId === BLOCKS.CONDUIT) {
      this.conduits.set(BeaconManager.key(x, y, z), { x, y, z });
      return true;
    }
    return false;
  }

  /** Anything broken stops being tracked, whichever half it was. */
  onBlockBroken(x, y, z) {
    const key = BeaconManager.key(x, y, z);
    const wasBeacon = this.beacons.delete(key);
    const wasConduit = this.conduits.delete(key);
    return wasBeacon || wasConduit;
  }

  /** Store the power chosen at a beacon. Called when the player pays for it in the panel. */
  setPower(x, y, z, { primary = null, secondary = null } = {}) {
    const key = BeaconManager.key(x, y, z);
    const beacon = this.beacons.get(key);
    if (!beacon) return null;
    beacon.primary = primary;
    beacon.secondary = secondary;
    return beacon;
  }

  /** What a beacon was given, so the panel can show it when it is reopened. */
  powerAt(x, y, z) {
    const beacon = this.beacons.get(BeaconManager.key(x, y, z));
    return beacon ? { primary: beacon.primary, secondary: beacon.secondary } : null;
  }

  /** True when this position is a beacon the player has activated. */
  isActiveBeacon(x, y, z) {
    const beacon = this.beacons.get(BeaconManager.key(x, y, z));
    return Boolean(beacon && beacon.primary);
  }

  /**
   * Re-check every structure and apply what it grants.
   *
   * The structure is re-derived each time rather than cached, because a pyramid can be dismantled and a
   * conduit frame broken without touching the beacon itself -- and a power that keeps working after its
   * pyramid is gone is worse than one that never worked.
   */
  update(dt, player = this.game?.player) {
    this.timer += dt;
    if (this.timer < BEACON_TICK_SECONDS) return;
    this.timer = 0;
    if (!player) return;
    const world = this.game?.world;

    for (const beacon of this.beacons.values()) {
      // "Bring Home the Beacon" / "Beaconator": a powered beacon near the player, and a full pyramid.
      if (player.position && Math.hypot(player.position.x - beacon.x, player.position.z - beacon.z) <= 20) {
        const built = calculateBeaconPyramid(world, beacon.x, beacon.y, beacon.z);
        if (built?.tier > 0) advancementEvent('beacon', { tier: built.tier });
      }
      if (!beacon.primary) continue;
      const pyramid = calculateBeaconPyramid(world, beacon.x, beacon.y, beacon.z);
      if (!pyramid?.active) continue;
      applyBeaconBuffs(
        { ...pyramid, primary: beacon.primary, secondary: beacon.secondary },
        player,
        { x: beacon.x, y: beacon.y, z: beacon.z },
      );
    }

    const mobs = this.game?.mobs?.mobs ?? [];
    for (const conduit of this.conduits.values()) {
      const frame = calculateConduitFrame(world, conduit.x, conduit.y, conduit.z);
      if (!frame?.active) continue;
      applyConduitPower(frame, player, { x: conduit.x, y: conduit.y, z: conduit.z }, mobs);
    }
  }
}
