// Geometry primitives for structure generation: positions, inclusive block boxes, rotation, mirror.
//
// These exist because the repository's existing world code has no equivalent. `world.js` deals in
// loose x/y/z numbers and the game uses THREE.Vector3 for entities, but structure generation needs:
//
//  - INCLUSIVE block boxes with vanilla's intersection semantics (`BoundingBox`), because vanilla's
//    piece-collision and structure-reference logic is defined in terms of them;
//  - rotation and mirroring that act on block STATE, not just coordinates (the state part lives in
//    `src/worldgen/rotation.js`; this file only owns the orientation algebra);
//  - a `ChunkPos`/`BlockPos` distinction, because structure placement works in chunk space and
//    placement only later becomes block space.
//
// All boxes are INCLUSIVE on both ends, matching vanilla's `BoundingBox` and SteelMC's documented
// note that "for integer piece boxes, the deflated AABB collision is equivalent to inclusive
// BoundingBox intersection".

/** A block position. Plain object so it stays cheap and JSON-serialisable. */
export function blockPos(x = 0, y = 0, z = 0) {
  return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
}

/** A chunk position (chunk coordinates, not blocks). */
export function chunkPos(x = 0, z = 0) {
  return { x: Math.trunc(x), z: Math.trunc(z) };
}

/** Chunk size and world height, read from the world module so there is one source of truth. */
export const CHUNK_SIZE = 16;

/** Inclusive block bounding box. */
export class BlockBox {
  constructor(minX, minY, minZ, maxX, maxY, maxZ) {
    this.minX = Math.trunc(Math.min(minX, maxX));
    this.minY = Math.trunc(Math.min(minY, maxY));
    this.minZ = Math.trunc(Math.min(minZ, maxZ));
    this.maxX = Math.trunc(Math.max(minX, maxX));
    this.maxY = Math.trunc(Math.max(minY, maxY));
    this.maxZ = Math.trunc(Math.max(minZ, maxZ));
  }

  static fromCorners(a, b) {
    return new BlockBox(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  /** The 16x(height)x16 column box of a chunk, used by structure references. */
  static columnOfChunk(chunkX, chunkZ, minY, maxY) {
    return new BlockBox(chunkX * CHUNK_SIZE, minY, chunkZ * CHUNK_SIZE,
      chunkX * CHUNK_SIZE + CHUNK_SIZE - 1, maxY, chunkZ * CHUNK_SIZE + CHUNK_SIZE - 1);
  }

  static fromArray(values) {
    if (!Array.isArray(values) || values.length !== 6) throw new Error('a box array must hold 6 numbers');
    return new BlockBox(values[0], values[1], values[2], values[3], values[4], values[5]);
  }

  get sizeX() { return this.maxX - this.minX + 1; }
  get sizeY() { return this.maxY - this.minY + 1; }
  get sizeZ() { return this.maxZ - this.minZ + 1; }
  get volume() { return this.sizeX * this.sizeY * this.sizeZ; }

  /** Centre of the box in block coordinates, as a float, matching vanilla's `getCenter()`. */
  centre() {
    return {
      x: (this.minX + this.maxX + 1) / 2,
      y: (this.minY + this.maxY + 1) / 2,
      z: (this.minZ + this.maxZ + 1) / 2
    };
  }

  contains(x, y, z) {
    return x >= this.minX && x <= this.maxX
      && y >= this.minY && y <= this.maxY
      && z >= this.minZ && z <= this.maxZ;
  }

  containsBox(other) {
    return other.minX >= this.minX && other.maxX <= this.maxX
      && other.minY >= this.minY && other.maxY <= this.maxY
      && other.minZ >= this.minZ && other.maxZ <= this.maxZ;
  }

  intersects(other) {
    return this.maxX >= other.minX && this.minX <= other.maxX
      && this.maxY >= other.minY && this.minY <= other.maxY
      && this.maxZ >= other.minZ && this.minZ <= other.maxZ;
  }

  /** Intersection, or null when the boxes are disjoint. */
  intersection(other) {
    if (!this.intersects(other)) return null;
    return new BlockBox(
      Math.max(this.minX, other.minX), Math.max(this.minY, other.minY), Math.max(this.minZ, other.minZ),
      Math.min(this.maxX, other.maxX), Math.min(this.maxY, other.maxY), Math.min(this.maxZ, other.maxZ)
    );
  }

  /** Grow on every axis by `amount` (vanilla `BoundingBox.inflate`). */
  inflate(amount) {
    return this.inflateXYZ(amount, amount, amount);
  }

  inflateXYZ(dx, dy, dz) {
    return new BlockBox(this.minX - dx, this.minY - dy, this.minZ - dz,
      this.maxX + dx, this.maxY + dy, this.maxZ + dz);
  }

  /** Move by an offset (vanilla `BoundingBox.move`). */
  translate(dx, dy, dz) {
    return new BlockBox(this.minX + dx, this.minY + dy, this.minZ + dz,
      this.maxX + dx, this.maxY + dy, this.maxZ + dz);
  }

  /** Smallest box containing both (vanilla `BoundingBox.encapsulate`). */
  union(other) {
    return new BlockBox(
      Math.min(this.minX, other.minX), Math.min(this.minY, other.minY), Math.min(this.minZ, other.minZ),
      Math.max(this.maxX, other.maxX), Math.max(this.maxY, other.maxY), Math.max(this.maxZ, other.maxZ)
    );
  }

  /** Intersect a chunk's writable column, the clipping vanilla applies when writing a piece. */
  clipToChunk(chunkX, chunkZ, minY, maxY) {
    return this.intersection(BlockBox.columnOfChunk(chunkX, chunkZ, minY, maxY));
  }

  chunksCovered() {
    const out = [];
    for (let cx = Math.floor(this.minX / CHUNK_SIZE); cx <= Math.floor(this.maxX / CHUNK_SIZE); cx++) {
      for (let cz = Math.floor(this.minZ / CHUNK_SIZE); cz <= Math.floor(this.maxZ / CHUNK_SIZE); cz++) {
        out.push(chunkPos(cx, cz));
      }
    }
    return out;
  }

  equals(other) {
    return this.minX === other.minX && this.minY === other.minY && this.minZ === other.minZ
      && this.maxX === other.maxX && this.maxY === other.maxY && this.maxZ === other.maxZ;
  }

  toArray() {
    return [this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ];
  }

  toString() {
    return `[${this.toArray().join(', ')}]`;
  }
}

/**
 * Quarter-turn rotations, named as vanilla names them.
 *
 * The numeric value is the number of clockwise quarter turns, which is what makes the rotation
 * algebra cheap: `rotate` is a small table lookup rather than trigonometry, and composing rotations
 * is addition modulo 4.
 */
export const Rotation = {
  NONE: 0,
  CLOCKWISE_90: 1,
  CLOCKWISE_180: 2,
  COUNTERCLOCKWISE_90: 3,

  /** Rotate a local X/Z offset by a clockwise quarter-turn count. */
  rotate(rotation, x, z) {
    switch (((rotation % 4) + 4) % 4) {
      case 1: return { x: -z, z: x };
      case 2: return { x: -x, z: -z };
      case 3: return { x: z, z: -x };
      default: return { x, z };
    }
  },

  /** Vanilla `Rotation.rotate(Rotation, Direction)` for the horizontal directions only. */
  rotateDirection(rotation, direction) {
    const order = ['north', 'east', 'south', 'west'];
    const index = order.indexOf(direction);
    if (index < 0) return direction; // up/down are unaffected by a yaw rotation
    return order[(index + (((rotation % 4) + 4) % 4)) % 4];
  },

  /** Vanilla `Rotation.rotate(Rotation, int, int)` on a 2D array index, for template arrays. */
  rotateArrayIndex(rotation, x, z, width, depth) {
    switch (((rotation % 4) + 4) % 4) {
      case 1: return { x: depth - 1 - z, z: x };
      case 2: return { x: width - 1 - x, z: depth - 1 - z };
      case 3: return { x: z, z: width - 1 - x };
      default: return { x, z };
    }
  },

  /** Which corner of a rotated template maps back to the local origin (vanilla `getRotated` pivot). */
  name(rotation) {
    return ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'][((rotation % 4) + 4) % 4];
  },

  fromName(name) {
    const index = ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'].indexOf(String(name).toLowerCase());
    if (index < 0) throw new Error(`unknown rotation: ${name}`);
    return index;
  }
};

/** Mirrors, applied BEFORE rotation in vanilla's transform order. */
export const Mirror = {
  NONE: 'none',
  LEFT_RIGHT: 'left_right', // flips X
  FRONT_BACK: 'front_back', // flips Z

  mirror(mirror, x, z) {
    switch (mirror) {
      case Mirror.LEFT_RIGHT: return { x: -x, z };
      case Mirror.FRONT_BACK: return { x, z: -z };
      default: return { x, z };
    }
  },

  mirrorDirection(mirror, direction) {
    if (mirror === Mirror.LEFT_RIGHT) {
      if (direction === 'east') return 'west';
      if (direction === 'west') return 'east';
    } else if (mirror === Mirror.FRONT_BACK) {
      if (direction === 'north') return 'south';
      if (direction === 'south') return 'north';
    }
    return direction;
  },

  /** Vanilla `Mirror.mirror(Rotation, Mirror)`: mirroring then rotating changes the effective mirror. */
  combine(rotation, mirror) {
    if (mirror === Mirror.NONE) return mirror;
    const even = (((rotation % 4) + 4) % 4) % 2 === 0;
    if (mirror === Mirror.LEFT_RIGHT) return even ? Mirror.LEFT_RIGHT : Mirror.FRONT_BACK;
    return even ? Mirror.FRONT_BACK : Mirror.LEFT_RIGHT;
  }
};

/** The six axis directions plus the eight jigsaw orientations are added with the jigsaw engine. */
export const Direction = {
  DOWN: 'down',
  UP: 'up',
  NORTH: 'north',
  SOUTH: 'south',
  WEST: 'west',
  EAST: 'east',

  opposite(direction) {
    return { down: 'up', up: 'down', north: 'south', south: 'north', west: 'east', east: 'west' }[direction] || null;
  },

  /** Unit step for a direction, as a plain offset. */
  step(direction) {
    return {
      down: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 1, z: 0 },
      north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 },
      west: { x: -1, y: 0, z: 0 }, east: { x: 1, y: 0, z: 0 }
    }[direction] || { x: 0, y: 0, z: 0 };
  },

  isHorizontal(direction) {
    return direction === 'north' || direction === 'south' || direction === 'east' || direction === 'west';
  },

  /** Yaw in radians, for rendering a piece marker facing the direction vanilla computed. */
  toYaw(direction) {
    return { south: 0, west: Math.PI / 2, north: Math.PI, east: -Math.PI / 2 }[direction] ?? 0;
  }
};
