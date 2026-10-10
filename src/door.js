import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

// Horizontal facing rotations around [0.5, 0, 0.5]
// 0: East (+X), 1: West (-X), 2: South (+Z), 3: North (-Z)
export const DOOR_ROTATIONS = [
  -Math.PI / 2, // 0: East
  Math.PI / 2,  // 1: West
  Math.PI,      // 2: South
  0             // 3: North
];

function createBoxPart(size, pos, textureName, tm, colorHex = 0xffffff) {
  const geo = new THREE.BoxGeometry(...size);
  geo.translate(...pos);

  const uv = geo.attributes.uv;
  let tile = null;
  if (tm) {
    tile = tm.getFaceUVs(textureName, 'all');
  }
  if (!tile) {
    tile = { u0: 0, v0: 0, u1: 1, v1: 1 };
  }

  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      THREE.MathUtils.lerp(tile.u0, tile.u1, uv.getX(i)),
      THREE.MathUtils.lerp(tile.v0, tile.v1, uv.getY(i))
    );
  }

  const c = new THREE.Color(colorHex);
  const colors = [];
  for (let i = 0; i < geo.attributes.position.count; i++) {
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(0), 1));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(0), 1));
  return geo;
}

/**
 * Creates 3D geometry for a door half (bottom or top).
 * Size: 1.0 wide, 1.0 tall, 3/16 thick panel.
 */
export function createDoorGeometry(isTop = false, facing = 3, open = false, isIron = false, hinge = 'left', tm = null) {
  const parts = [];
  const thickness = 3 / 16;
  const tex = isIron
    ? (isTop ? 'iron_door_top.png' : 'iron_door_bottom.png')
    : (isTop ? 'oak_door_top.png' : 'oak_door_bottom.png');
  const defaultColor = isIron ? 0xd0d5d6 : 0xb98a4e;

  if (!open) {
    // Closed: panel lies flat on Z edge (z = thickness/2)
    const panel = createBoxPart([1.0, 1.0, thickness], [0.5, 0.5, thickness / 2], tex, tm, defaultColor);
    parts.push(panel);

    // Door knob/handle on bottom half
    if (!isTop) {
      const handleX = hinge === 'left' ? 0.85 : 0.15;
      const handleColor = isIron ? 0x333333 : 0x22180e;
      const knobFront = createBoxPart([0.08, 0.16, 0.05], [handleX, 0.5, thickness + 0.025], tex, tm, handleColor);
      const knobBack = createBoxPart([0.08, 0.16, 0.05], [handleX, 0.5, -0.025], tex, tm, handleColor);
      parts.push(knobFront, knobBack);
    }
  } else {
    // Open: panel swings 90 degrees around hinge
    // If hinge is left, panel sits at x = thickness/2 extending along Z (z: 0..1)
    // If hinge is right, panel sits at x = 1 - thickness/2 extending along Z
    const panelX = hinge === 'left' ? thickness / 2 : 1 - thickness / 2;
    const panel = createBoxPart([thickness, 1.0, 1.0], [panelX, 0.5, 0.5], tex, tm, defaultColor);
    parts.push(panel);

    if (!isTop) {
      const handleZ = 0.85;
      const handleColor = isIron ? 0x333333 : 0x22180e;
      const knobLeft = createBoxPart([0.05, 0.16, 0.08], [panelX - thickness / 2 - 0.025, 0.5, handleZ], tex, tm, handleColor);
      const knobRight = createBoxPart([0.05, 0.16, 0.08], [panelX + thickness / 2 + 0.025, 0.5, handleZ], tex, tm, handleColor);
      parts.push(knobLeft, knobRight);
    }
  }

  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();

  // Rotate around block center [0.5, 0, 0.5] by facing
  const rotAngle = DOOR_ROTATIONS[facing] || 0;
  if (rotAngle !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rotAngle);
    merged.translate(0.5, 0, 0.5);
  }

  return merged;
}

/**
 * Creates 3D geometry for a trapdoor (1 block high).
 */
export function createTrapdoorGeometry(facing = 3, open = false, isIron = false, tm = null) {
  const parts = [];
  const thickness = 3 / 16;
  const tex = isIron ? 'iron_trapdoor.png' : 'oak_trapdoor.png';
  const defaultColor = isIron ? 0xd0d5d6 : 0xb98a4e;

  if (!open) {
    // Closed: flat horizontal slab at the bottom of the block
    const slab = createBoxPart([1.0, thickness, 1.0], [0.5, thickness / 2, 0.5], tex, tm, defaultColor);
    parts.push(slab);
  } else {
    // Open: swings up vertically against the edge
    const slab = createBoxPart([1.0, 1.0, thickness], [0.5, 0.5, thickness / 2], tex, tm, defaultColor);
    parts.push(slab);
  }

  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();

  const rotAngle = DOOR_ROTATIONS[facing] || 0;
  if (rotAngle !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rotAngle);
    merged.translate(0.5, 0, 0.5);
  }

  return merged;
}

export class DoorManager {
  constructor(game) {
    this.game = game;
    // Map from "x,y,z" -> door object
    this.doors = new Map();
  }

  getKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  getDoor(x, y, z) {
    return this.doors.get(this.getKey(x, y, z)) || null;
  }

  canPlaceDoor(world, bottomPos) {
    const [x, y, z] = bottomPos;
    if (y <= 0 || y >= 63) return false;

    // Bottom block must be AIR or replaceable
    const bottomVoxel = world.getVoxel(x, y, z);
    const bottomDef = BLOCK_DEFS[bottomVoxel];
    if (bottomVoxel !== BLOCKS.AIR && (!bottomDef || (!bottomDef.plant && bottomVoxel !== BLOCKS.WATER))) {
      return false;
    }

    // Top block must be AIR or replaceable
    const topVoxel = world.getVoxel(x, y + 1, z);
    const topDef = BLOCK_DEFS[topVoxel];
    if (topVoxel !== BLOCKS.AIR && (!topDef || (!topDef.plant && topVoxel !== BLOCKS.WATER))) {
      return false;
    }

    // Ground below must be solid
    const belowVoxel = world.getVoxel(x, y - 1, z);
    const belowDef = BLOCK_DEFS[belowVoxel];
    return belowVoxel !== BLOCKS.AIR && belowDef && belowDef.solid !== false && !belowDef.plant;
  }

  placeDoor(world, bottomPos, facing = 3, isIron = false, doorBlockId = null) {
    const [x, y, z] = bottomPos;
    if (!this.canPlaceDoor(world, bottomPos)) {
      return { success: false, reason: 'Door cannot be placed here' };
    }

    // The wood type comes from the item being placed, where one is given, so a spruce door places
    // spruce. Falling back to oak keeps every existing caller working unchanged.
    //
    // This used to be a hard-coded pair of oaks, which was invisible while oak was the only wooden
    // door in the game.
    const placedIds = doorBlockId !== null ? doorIdSet(BLOCK_DEFS[doorBlockId]) : null;
    const bottomVoxel = isIron ? BLOCKS.IRON_DOOR
      : (placedIds ? placedIds.closed : BLOCKS.OAK_DOOR);
    const topVoxel = isIron ? BLOCKS.IRON_DOOR_TOP
      : (placedIds ? placedIds.topClosed : BLOCKS.OAK_DOOR_TOP);

    world.setVoxel(x, y, z, bottomVoxel);
    world.setVoxel(x, y + 1, z, topVoxel);

    const door = {
      bottomPos: [Math.floor(x), Math.floor(y), Math.floor(z)],
      topPos: [Math.floor(x), Math.floor(y + 1), Math.floor(z)],
      facing,
      open: false,
      manualOpen: false,
      isIron: Boolean(isIron),
      // The four ids this door cycles through, so toggling cannot fall back to oak.
      ids: placedIds || doorIdSet(BLOCK_DEFS[isIron ? BLOCKS.IRON_DOOR : BLOCKS.OAK_DOOR]),
      hinge: 'left'
    };

    const bKey = this.getKey(x, y, z);
    const tKey = this.getKey(x, y + 1, z);
    this.doors.set(bKey, door);
    this.doors.set(tKey, door);

    this.rebuildBlockChunk(x, z);

    return { success: true, door };
  }

  toggleDoor(x, y, z, forceRedstone = false) {
    const key = this.getKey(x, y, z);
    let door = this.doors.get(key);

    const currentVoxel = this.game?.world?.getVoxel(x, y, z);
    const def = BLOCK_DEFS[currentVoxel];

    // If unmanaged door exists in world voxels, register it on the fly
    if (!door && def?.door) {
      const isTop = Boolean(def.isTop);
      const isIron = Boolean(def.isIron);
      const bottomPos = isTop ? [x, y - 1, z] : [x, y, z];
      const topPos = isTop ? [x, y, z] : [x, y + 1, z];
      const open = Boolean(def.name?.includes('Open'));
      door = {
        bottomPos,
        topPos,
        facing: 3,
        open,
        manualOpen: open,
        isIron,
        // Resolved from the block being toggled, so a door loaded from a save keeps its wood type.
        ids: doorIdSet(def),
        hinge: 'left'
      };
      this.doors.set(this.getKey(...bottomPos), door);
      this.doors.set(this.getKey(...topPos), door);
    }

    if (!door) return { success: false, reason: 'No door at location' };

    if (door.isIron && !forceRedstone) {
      if (this.game?.sounds?.playClick) this.game.sounds.playClick();
      return { success: false, reason: 'Iron doors can only be opened with Redstone power' };
    }

    door.open = !door.open;
    door.manualOpen = door.open;

    // Sync manualOpen to redstone states immediately
    const redstone = this.game?.world?.redstone;
    if (redstone) {
      const sB = redstone.state(door.bottomPos);
      if (sB) sB.manualOpen = door.manualOpen;
      const sT = redstone.state(door.topPos);
      if (sT) sT.manualOpen = door.manualOpen;
    }

    // Update world voxels
    if (this.game?.world) {
      const [bx, by, bz] = door.bottomPos;
      const [tx, ty, tz] = door.topPos;

      // Use the door's own id set.
      //
      // This hard-coded OAK_DOOR with a fallback only for iron, so toggling any other wood would have
      // turned the door into oak -- a regression that adding fifteen wood types would have introduced,
      // and one that no recipe count could show.
      const ids = door.ids || doorIdSet(BLOCK_DEFS[door.isIron ? BLOCKS.IRON_DOOR : BLOCKS.OAK_DOOR]);
      const newBottomVoxel = door.open ? ids.open : ids.closed;
      const newTopVoxel = door.open ? ids.topOpen : ids.topClosed;

      this.game.world.setVoxel(bx, by, bz, newBottomVoxel);
      this.game.world.setVoxel(tx, ty, tz, newTopVoxel);

      // Re-affirm manualOpen in case setVoxel wiped it
      if (redstone) {
        const sB2 = redstone.state(door.bottomPos);
        if (sB2) sB2.manualOpen = door.manualOpen;
        const sT2 = redstone.state(door.topPos);
        if (sT2) sT2.manualOpen = door.manualOpen;
      }

      this.rebuildBlockChunk(bx, bz);
    }

    // Play sound effect
    if (this.game?.sounds?.playDoor) {
      this.game.sounds.playDoor(door.open, door.isIron);
    } else if (this.game?.sounds?.playPlace) {
      this.game.sounds.playPlace(door.isIron ? 'metal' : 'wood');
    }

    return { success: true, open: door.open };
  }

  setDoorOpen(x, y, z, wantOpen, fromRedstone = false) {
    const key = this.getKey(x, y, z);
    const door = this.doors.get(key);
    if (!door) {
      return this.toggleDoor(x, y, z, fromRedstone);
    }
    if (door.open !== wantOpen) {
      door.open = wantOpen;
      if (!fromRedstone) {
        door.manualOpen = wantOpen;
      }

      if (this.game?.world) {
        const [bx, by, bz] = door.bottomPos;
        const [tx, ty, tz] = door.topPos;

        const newBottomVoxel = door.open
          ? (door.isIron ? BLOCKS.IRON_DOOR_OPEN : BLOCKS.OAK_DOOR_OPEN)
          : (door.isIron ? BLOCKS.IRON_DOOR : BLOCKS.OAK_DOOR);
        const newTopVoxel = door.open
          ? (door.isIron ? BLOCKS.IRON_DOOR_TOP_OPEN : BLOCKS.OAK_DOOR_TOP_OPEN)
          : (door.isIron ? BLOCKS.IRON_DOOR_TOP : BLOCKS.OAK_DOOR_TOP);

        this.game.world.setVoxel(bx, by, bz, newBottomVoxel);
        this.game.world.setVoxel(tx, ty, tz, newTopVoxel);

        const redstone = this.game?.world?.redstone;
        if (redstone) {
          const sB = redstone.state(door.bottomPos);
          if (sB) sB.manualOpen = door.manualOpen;
          const sT = redstone.state(door.topPos);
          if (sT) sT.manualOpen = door.manualOpen;
        }

        this.rebuildBlockChunk(bx, bz);
      }

      if (this.game?.sounds?.playDoor) {
        this.game.sounds.playDoor(door.open, door.isIron);
      } else if (this.game?.sounds?.playPlace) {
        this.game.sounds.playPlace(door.isIron ? 'metal' : 'wood');
      }
    }
    return { success: true, open: door.open };
  }

  toggleTrapdoor(x, y, z, forceRedstone = false) {
    if (!this.game?.world) return { success: false };
    const current = this.game.world.getVoxel(x, y, z);
    let next = null;
    let isIron = false;

    if (current === BLOCKS.OAK_TRAPDOOR) next = BLOCKS.OAK_TRAPDOOR_OPEN;
    else if (current === BLOCKS.OAK_TRAPDOOR_OPEN) next = BLOCKS.OAK_TRAPDOOR;
    else if (current === BLOCKS.IRON_TRAPDOOR) {
      isIron = true;
      if (!forceRedstone) {
        if (this.game?.sounds?.playClick) this.game.sounds.playClick();
        return { success: false, reason: 'Iron trapdoors require Redstone power' };
      }
      next = BLOCKS.IRON_TRAPDOOR_OPEN;
    } else if (current === BLOCKS.IRON_TRAPDOOR_OPEN) {
      isIron = true;
      if (!forceRedstone) {
        if (this.game?.sounds?.playClick) this.game.sounds.playClick();
        return { success: false, reason: 'Iron trapdoors require Redstone power' };
      }
      next = BLOCKS.IRON_TRAPDOOR;
    }

    if (next !== null) {
      const isOpen = (next === BLOCKS.OAK_TRAPDOOR_OPEN || next === BLOCKS.IRON_TRAPDOOR_OPEN);
      this.game.world.setVoxel(x, y, z, next);
      const redstone = this.game.world.redstone;
      if (redstone) {
        const s = redstone.state([x, y, z]);
        if (s) s.manualOpen = isOpen;
      }
      this.rebuildBlockChunk(x, z);
      if (this.game?.sounds?.playDoor) {
        this.game.sounds.playDoor(isOpen, isIron);
      } else if (this.game?.sounds?.playPlace) {
        this.game.sounds.playPlace(isIron ? 'metal' : 'wood');
      }
      return { success: true, open: isOpen };
    }
    return { success: false };
  }

  onBlockBroken(x, y, z) {
    const key = this.getKey(x, y, z);
    const door = this.doors.get(key);

    const voxel = this.game?.world?.getVoxel(x, y, z);
    const def = BLOCK_DEFS[voxel];

    if (!door && !def?.door) {
      // Check trapdoors
      if (def?.trapdoor) {
        const dropItem = def.dropItem || (def.isIron ? 'iron_trapdoor' : 'oak_trapdoor');
        if (this.game?.entities?.spawnDroppedItem) {
          const dropPos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
          this.game.entities.spawnDroppedItem(dropPos, dropItem, false, 1);
        }
        return true;
      }
      return false;
    }

    let companion = null;
    let isIron = false;

    if (door) {
      const isBottom = (door.bottomPos[0] === Math.floor(x) && door.bottomPos[1] === Math.floor(y) && door.bottomPos[2] === Math.floor(z));
      companion = isBottom ? door.topPos : door.bottomPos;
      isIron = door.isIron;

      this.doors.delete(this.getKey(...door.bottomPos));
      this.doors.delete(this.getKey(...door.topPos));
    } else if (def?.door) {
      const isTop = Boolean(def.isTop);
      isIron = Boolean(def.isIron);
      companion = isTop ? [x, y - 1, z] : [x, y + 1, z];
    }

    if (this.game?.world) {
      this.game.world.setVoxel(x, y, z, BLOCKS.AIR);
      if (companion) {
        const compVoxel = this.game.world.getVoxel(...companion);
        const compDef = BLOCK_DEFS[compVoxel];
        if (compDef?.door) {
          this.game.world.setVoxel(...companion, BLOCKS.AIR);
          this.rebuildBlockChunk(companion[0], companion[2]);
        }
      }
      this.rebuildBlockChunk(x, z);
    }

    // Spawn 1 dropped door item
    if (this.game?.entities && typeof this.game.entities.spawnDroppedItem === 'function') {
      const dropPos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
      const dropItem = isIron ? 'iron_door' : 'oak_door';
      this.game.entities.spawnDroppedItem(dropPos, dropItem, false, 1);
    }

    return true;
  }

  rebuildBlockChunk(x, z) {
    if (!this.game) return;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const chunk = this.game.world?.getChunk?.(cx, cz);
    if (chunk && typeof this.game.rebuildChunkMesh === 'function') {
      this.game.rebuildChunkMesh(chunk);
    }
  }
}

/**
 * The four block ids making up the door a definition belongs to, or null if it is not a door.
 *
 * Resolved from the definition NAME rather than stored on the definition, so one helper covers every
 * door: 'Spruce Door Open' maps back to spruce_door_open and then to the BLOCKS constant, and the
 * hand-written oak and iron doors resolve exactly the same way with no special case.
 *
 * This exists because `toggleDoor` hard-coded the oak ids. That was invisible while oak was the only
 * wooden door in the game, and would have made every other wood morph into oak on its first toggle.
 */
export function doorIdSet(def) {
  if (!def?.door) return null;
  const name = String(def.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const m = /^(.+)_door(?:_top)?(?:_open)?$/.exec(name);
  if (!m) return null;
  const base = m[1] + '_door';
  const C = (s) => s.toUpperCase();
  const ids = {
    closed: BLOCKS[C(base)],
    open: BLOCKS[C(base + '_open')],
    topClosed: BLOCKS[C(base + '_top')],
    topOpen: BLOCKS[C(base + '_top_open')],
  };
  // A door missing any of its four ids would silently place the wrong block, so report rather than
  // half-work. The caller falls back to oak, which is at least a real door.
  for (const id of Object.values(ids)) if (id === undefined) return null;
  return ids;
}
