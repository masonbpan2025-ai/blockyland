import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';

// Chest facing rotations:
// 0: South (+Z front), 1: West (-X front), 2: North (-Z front), 3: East (+X front)
export const CHEST_ROTATIONS = [
  0,              // 0: South (+Z)
  -Math.PI / 2,   // 1: West (-X)
  Math.PI,        // 2: North (-Z)
  Math.PI / 2     // 3: East (+X)
];

// Helper to create a textured box sub-part
function createChestBox(minX, minY, minZ, maxX, maxY, maxZ, tm, frontFace = 'front', colorHex = 0xffffff) {
  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;

  const geo = new THREE.BoxGeometry(width, height, depth);
  geo.translate(minX + width / 2, minY + height / 2, minZ + depth / 2);

  const uv = geo.attributes.uv;
  // Faces order in Three.js BoxGeometry: +X (east/0), -X (west/1), +Y (top/2), -Y (bottom/3), +Z (south/4), -Z (north/5)
  const faceTextures = {
    0: 'chest_side.png',
    1: 'chest_side.png',
    2: 'chest_top.png',
    3: 'chest_top.png',
    4: frontFace === 'front' ? 'chest_front.png' : frontFace,
    5: 'chest_side.png'
  };

  for (let face = 0; face < 6; face++) {
    const texName = faceTextures[face];
    const tile = tm ? tm.getFaceUVs(texName, 'all') : { u0: 0, v0: 0, u1: 1, v1: 1 };
    for (let v = 0; v < 4; v++) {
      const idx = face * 4 + v;
      uv.setXY(
        idx,
        THREE.MathUtils.lerp(tile.u0, tile.u1, uv.getX(idx)),
        THREE.MathUtils.lerp(tile.v0, tile.v1, uv.getY(idx))
      );
    }
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

// Procedural 3D Chest Geometry (Single Chest or Double Chest half)
export function createChestGeometry(isDouble = false, isLeft = false, facing = 0, tm = null) {
  const parts = [];

  // Single Chest bounds: 14/16 x 14/16 x 14/16 (inset 1/16 on sides)
  // Double Chest bounds: connected side extends all the way to 1.0 (or 0.0)
  let minX = 1 / 16;
  let maxX = 15 / 16;
  const minY = 0;
  const maxY = 14 / 16;
  const minZ = 1 / 16;
  const maxZ = 15 / 16;

  if (isDouble) {
    if (isLeft) {
      // Left half looking from front (+Z): partner is to the right (+X), so maxX extends to 1.0
      maxX = 1.0;
    } else {
      // Right half: partner is to the left (-X), so minX extends to 0.0
      minX = 0.0;
    }
  }

  // 1. Lower body (0 to 10/16)
  parts.push(createChestBox(minX, minY, minZ, maxX, 10 / 16, maxZ, tm, 'front', 0xffffff));

  // 2. Upper lid (10/16 to 14/16)
  parts.push(createChestBox(minX, 10 / 16, minZ, maxX, maxY, maxZ, tm, 'front', 0xffffff));

  // 3. Lock latch (2/16 wide, 4/16 high, 1/16 thick on the front +Z face)
  let latchMinX = 7 / 16;
  let latchMaxX = 9 / 16;
  if (isDouble) {
    if (isLeft) {
      // Latch on the seam (+X edge)
      latchMinX = 15 / 16;
      latchMaxX = 1.0;
    } else {
      // Latch on the seam (-X edge)
      latchMinX = 0.0;
      latchMaxX = 1 / 16;
    }
  }
  const latchMinY = 7 / 16;
  const latchMaxY = 11 / 16;
  const latchMinZ = 15 / 16;
  const latchMaxZ = 16 / 16; // protruding 1/16

  parts.push(createChestBox(latchMinX, latchMinY, latchMinZ, latchMaxX, latchMaxY, latchMaxZ, tm, 'chest_lock.png', 0xdddddd));

  let merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());

  // Center around voxel pivot (0.5, 0, 0.5) before rotating
  merged.translate(-0.5, 0, -0.5);

  // Rotate based on facing
  const rot = CHEST_ROTATIONS[facing] || 0;
  if (rot !== 0) {
    merged.rotateY(rot);
  }

  // Translate back to [0..1, 0..1, 0..1] voxel space
  merged.translate(0.5, 0, 0.5);

  return merged;
}

export class ChestManager {
  constructor(game) {
    this.game = game;
    // Maps "x,y,z" -> chest object
    this.chests = new Map();
    this.openChestPos = null;
  }

  getKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  getChest(x, y, z) {
    return this.chests.get(this.getKey(x, y, z)) || null;
  }

  // Calculate facing direction based on camera horizontal orientation (faces towards player)
  getFacingFromCamera(camera) {
    if (!camera) return 0;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    if (Math.abs(dir.x) > Math.abs(dir.z)) {
      return dir.x > 0 ? 1 : 3; // Looking East -> chest faces West (1); Looking West -> faces East (3)
    } else {
      return dir.z > 0 ? 2 : 0; // Looking South -> chest faces North (2); Looking North -> faces South (0)
    }
  }

  // Perpendicular directions for double chest connection:
  // If facing 0 (South) or 2 (North): perpendicular is East (+X) and West (-X)
  // If facing 1 (West) or 3 (East): perpendicular is South (+Z) and North (-Z)
  getPerpendicularOffsets(facing) {
    if (facing === 0 || facing === 2) {
      return [
        { dx: 1, dz: 0 },  // East
        { dx: -1, dz: 0 }  // West
      ];
    } else {
      return [
        { dx: 0, dz: 1 },  // South
        { dx: 0, dz: -1 }  // North
      ];
    }
  }

  // Determines whether a chest is "left" or "right" when looking at its front
  determineIsLeft(facing, dx, dz) {
    // Relative to facing front:
    // Facing 0 (South, front +Z): +X is left, -X is right
    // Facing 2 (North, front -Z): -X is left, +X is right
    // Facing 1 (West, front -X): +Z is left, -Z is right
    // Facing 3 (East, front +X): -Z is left, +Z is right
    if (facing === 0) return dx > 0;
    if (facing === 2) return dx < 0;
    if (facing === 1) return dz > 0;
    if (facing === 3) return dz < 0;
    return false;
  }

  placeChest(world, pos, facing = 0) {
    const [x, y, z] = pos.map(Math.floor);
    const key = this.getKey(x, y, z);

    const chest = {
      x, y, z,
      facing,
      items: new Array(27).fill(null),
      isDouble: false,
      partnerPos: null,
      isLeft: false
    };

    // Check adjacent blocks for single chest to link into Double Chest
    const offsets = this.getPerpendicularOffsets(facing);
    for (const { dx, dz } of offsets) {
      const nx = x + dx;
      const nz = z + dz;
      const neighborVoxel = world.getVoxel(nx, y, nz);
      if (neighborVoxel === BLOCKS.CHEST) {
        const neighborChest = this.getChest(nx, y, nz);
        if (neighborChest && !neighborChest.isDouble && neighborChest.facing === facing) {
          // Found an unlinked neighbor chest facing the same direction!
          chest.isDouble = true;
          chest.partnerPos = [nx, y, nz];
          chest.isLeft = this.determineIsLeft(facing, dx, dz);

          neighborChest.isDouble = true;
          neighborChest.partnerPos = [x, y, z];
          neighborChest.isLeft = !chest.isLeft;

          // Rebuild neighbor chunk mesh to render connected double chest half
          const nChunk = world.getChunk(Math.floor(nx / 16), Math.floor(nz / 16));
          if (nChunk) this.game.rebuildChunkMesh(nChunk);
          break;
        }
      }
    }

    this.chests.set(key, chest);
    world.setVoxel(x, y, z, BLOCKS.CHEST);

    const chunk = world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
    if (chunk) this.game.rebuildChunkMesh(chunk);

    return chest;
  }

  // Check if chest is obstructed from opening
  // In Minecraft, chest cannot open if an opaque solid block is directly above
  isObstructed(x, y, z, world = this.game.world) {
    const checkAbove = (bx, by, bz) => {
      const blockAbove = world.getVoxel(bx, by + 1, bz);
      if (blockAbove === BLOCKS.AIR || blockAbove === BLOCKS.WATER) return false;
      const def = BLOCK_DEFS[blockAbove];
      if (!def) return false;
      // Transparent blocks (glass, slabs, stairs, leaves, etc.) or plants do NOT obstruct
      return def.solid !== false && !def.transparent && !def.plant;
    };

    const chest = this.getChest(x, y, z);
    if (!chest) return false;

    if (checkAbove(x, y, z)) return true;
    if (chest.isDouble && chest.partnerPos) {
      const [px, py, pz] = chest.partnerPos;
      if (checkAbove(px, py, pz)) return true;
    }
    return false;
  }

  canOpen(x, y, z, world = this.game.world) {
    return !this.isObstructed(x, y, z, world);
  }

  interact(x, y, z, player) {
    const chest = this.getChest(x, y, z);
    if (!chest) {
      // Lazy init if chest block exists but chest data was not yet registered
      this.placeChest(this.game.world, [x, y, z], this.getFacingFromCamera(this.game.camera));
    }

    if (!this.canOpen(x, y, z)) {
      this.game.sounds?.playClick?.();
      this.game.ui?.addChatMessage?.('This chest is obstructed.', 'error');
      return;
    }

    // Open chest GUI
    this.openChestPos = [Math.floor(x), Math.floor(y), Math.floor(z)];
    this.game.sounds?.playChestOpen?.();
    this.game.ui?.openChest?.(x, y, z);
  }

  closeChest() {
    if (this.openChestPos) {
      this.game.sounds?.playChestClose?.();
      this.openChestPos = null;
    }
  }

  // Returns array of items for GUI: 27 items for single, 54 for double (left/primary half first)
  getCombinedItems(x, y, z) {
    const chest = this.getChest(x, y, z);
    if (!chest) return new Array(27).fill(null);

    if (!chest.isDouble || !chest.partnerPos) {
      return chest.items;
    }

    const partner = this.getChest(...chest.partnerPos);
    if (!partner) return chest.items;

    // By convention, Left chest is top 27 slots (0..26), Right chest is bottom 27 slots (27..53)
    const primary = chest.isLeft ? chest : partner;
    const secondary = chest.isLeft ? partner : chest;

    return [...primary.items, ...secondary.items];
  }

  // Set item at specific slot index (0..26 for single, 0..53 for double)
  setCombinedSlot(x, y, z, slotIdx, item) {
    const chest = this.getChest(x, y, z);
    if (!chest) return;

    if (!chest.isDouble || !chest.partnerPos) {
      if (slotIdx >= 0 && slotIdx < 27) {
        chest.items[slotIdx] = item;
      }
      return;
    }

    const partner = this.getChest(...chest.partnerPos);
    if (!partner) {
      if (slotIdx >= 0 && slotIdx < 27) chest.items[slotIdx] = item;
      return;
    }

    const primary = chest.isLeft ? chest : partner;
    const secondary = chest.isLeft ? partner : chest;

    if (slotIdx < 27) {
      primary.items[slotIdx] = item;
    } else if (slotIdx < 54) {
      secondary.items[slotIdx - 27] = item;
    }
  }

  getCombinedSlot(x, y, z, slotIdx) {
    const items = this.getCombinedItems(x, y, z);
    return items[slotIdx] || null;
  }

  onBlockBroken(x, y, z) {
    const [bx, by, bz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const key = this.getKey(bx, by, bz);
    const chest = this.chests.get(key);

    if (chest) {
      // 1. Drop all 27 stored items
      for (const item of chest.items) {
        if (item && item.count > 0) {
          this.game.entities?.spawnDroppedItem?.(
            new THREE.Vector3(bx + 0.5, by + 0.5, bz + 0.5),
            item.id,
            item.isBlock,
            item.count
          );
        }
      }

      // 2. If part of double chest, unlink partner and restore partner to single chest
      if (chest.isDouble && chest.partnerPos) {
        const partner = this.getChest(...chest.partnerPos);
        if (partner) {
          partner.isDouble = false;
          partner.partnerPos = null;
          partner.isLeft = false;

          const pChunk = this.game.world?.getChunk?.(Math.floor(partner.x / 16), Math.floor(partner.z / 16));
          if (pChunk) this.game.rebuildChunkMesh?.(pChunk);
        }
      }

      // 3. Close GUI if open at this chest
      if (this.openChestPos && this.openChestPos[0] === bx && this.openChestPos[1] === by && this.openChestPos[2] === bz) {
        this.closeChest();
        this.game.ui?.closeChestModal?.();
      }

      this.chests.delete(key);
    }
  }

  // Redstone comparator signal calculation
  // signal = floor(1 + (sum of items / (slots * 64)) * 14) (0 if completely empty)
  getRedstoneSignal(x, y, z) {
    const items = this.getCombinedItems(x, y, z);
    const totalSlots = items.length;
    let totalItems = 0;
    let hasAny = false;

    for (const it of items) {
      if (it && it.count > 0) {
        hasAny = true;
        totalItems += it.count;
      }
    }

    if (!hasAny) return 0;
    const maxCapacity = totalSlots * 64;
    return Math.floor(1 + (totalItems / maxCapacity) * 14);
  }
}
