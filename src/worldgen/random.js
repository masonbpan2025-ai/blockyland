// Deterministic random sources for structure generation.
//
// Why this file exists, and why it is not `Math.random`.
//
// Structure generation in Minecraft is a pure function of (world seed + generation settings +
// coordinates). The mission brief requires that property to hold here too: the same seed must produce
// the same structures, in any chunk load order, in any session. `Math.random` cannot do that, and the
// engine already had to remove eight uncontrolled `Math.random` calls from tree generation
// (docs/voxel-engine-plan.md) -- this module is the structure-side equivalent.
//
// Two generators are implemented because vanilla uses two, and they are NOT interchangeable:
//
//   LegacyRandom      java.util.Random: a 48-bit linear congruential generator. Vanilla uses it for
//                     `setLargeFeatureSeed` / `setLargeFeatureWithSalt`, which is how a structure
//                     placement derives per-chunk randomness from the world seed, and for most
//                     piece-layout decisions.
//   XoroshiroRandom   Xoroshiro128++, the modern `RandomSource` implementation. Used by vanilla for
//                     `RandomSource.create()` and the positional factories that replaced the old
//                     global random.
//
// Exactness note. Both are implemented with BigInt because the arithmetic is 48-bit and 128-bit and
// does not fit a double: `seed * 0x5DEECE66D` alone reaches 2^83. Seeded mixing constants
// (341873128712, 132897987541, the salts) are Java longs, so a seed that is "only" a JS number is
// widened to BigInt before any mixing -- a `number` seed would silently lose the low bits of
// `chunkX * 341873128712` past 2^53 (only ~9e15), which is reached at |chunkX| > 26000 and would
// break determinism far from the origin.
//
// PARITY STATUS (see docs/STRUCTURE_PARITY.md):
//   LegacyRandom            VERIFIED against the published java.util.Random sequence.
//   setLargeFeatureWithSalt ASSUMED - the classic vanilla mixing; to be checked against reference data.
//   XoroshiroRandom         SEEDING UNVERIFIED - the generator is the published Xoroshiro128++
//                           transition, but vanilla's seed-upgrade path is not reproduced from a
//                           primary source yet, so no parity claim is made for it.

const MASK_48 = (1n << 48n) - 1n;
const MULTIPLIER = 0x5DEECE66Dn;
const ADDEND = 0xBn;

/** Java's `Math.floorDiv` for longs, which JS does not have for negative numerators. */
export function floorDiv(a, b) {
  return Math.floor(a / b);
}

/** Java's `Math.floorMod`, so negative chunks land in the correct region. */
export function floorMod(a, b) {
  return a - Math.floor(a / b) * b;
}

/**
 * `java.util.Random`, bit-for-bit.
 *
 * Every method mirrors the JDK specification rather than a convenient approximation, because
 * placement parity depends on the *sequence*, not just on the values looking random.
 */
export class LegacyRandom {
  /** @param {number|bigint|string} seed */
  constructor(seed = 0) {
    this.setSeed(seed);
    this._haveNextNextGaussian = false;
    this._nextNextGaussian = 0;
  }

  /** Java widens an int/long seed to 64 bits, then XORs the multiplier and truncates to 48. */
  setSeed(seed) {
    const wide = toSeedBigInt(seed);
    this.seed = (wide ^ MULTIPLIER) & MASK_48;
    return this;
  }

  /** `next(bits)` -- the one primitive every other draw is built from. */
  next(bits) {
    this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK_48;
    return Number(this.seed >> BigInt(48 - bits));
  }

  nextInt() {
    const high = this.next(32);
    // Java's nextInt() is signed: the high bit must become negative, not a large positive number.
    return high | 0;
  }

  /** `nextInt(bound)` with Java's rejection loop, so the distribution stays uniform. */
  nextIntBound(bound) {
    if (!Number.isInteger(bound) || bound <= 0) throw new Error(`bound must be a positive integer, got ${bound}`);
    if ((bound & -bound) === bound) {
      // Power of two: Java multiplies instead of rejecting.
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits;
    let val;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }

  nextLong() {
    const high = BigInt(this.next(32));
    const low = BigInt(this.next(32));
    return BigInt.asIntN(64, (high << 32n) + low);
  }

  nextBoolean() {
    return this.next(1) !== 0;
  }

  /** `nextDouble` consumes exactly two draws (26 and 27 bits); replacing it with one breaks the sequence. */
  nextDouble() {
    const high = BigInt(this.next(26));
    const low = BigInt(this.next(27));
    return Number((high << 27n) + low) * (1 / 9007199254740992); // 2^-53
  }

  nextFloat() {
    return this.next(24) * (1 / 16777216); // 2^-24
  }

  nextGaussian() {
    if (this._haveNextNextGaussian) {
      this._haveNextNextGaussian = false;
      return this._nextNextGaussian;
    }
    let v1;
    let v2;
    let s;
    do {
      v1 = 2 * this.nextDouble() - 1;
      v2 = 2 * this.nextDouble() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    const multiplier = Math.sqrt(-2 * Math.log(s) / s);
    this._nextNextGaussian = v2 * multiplier;
    this._haveNextNextGaussian = true;
    return v1 * multiplier;
  }

  /**
   * `LegacyRandomSource.setLargeFeatureSeed(levelSeed, chunkX, chunkZ)`.
   *
   * This is the mixing that turns "world seed + chunk position" into a placement draw. It is the
   * documented vanilla behaviour rather than a free choice: swapping the constants changes every
   * structure position in the world.
   */
  setLargeFeatureSeed(levelSeed, chunkX, chunkZ) {
    const seed = toSeedBigInt(levelSeed)
      + BigInt(chunkX) * 341873128712n
      + BigInt(chunkZ) * 132897987541n;
    return this.setSeed(BigInt.asIntN(64, seed));
  }

  /**
   * `LegacyRandomSource.setLargeFeatureWithSalt(levelSeed, x, z, salt)`.
   *
   * Structure placement uses the *region* coordinates here (floor(chunk / spacing)), not the chunk
   * coordinates, which is why a structure set's spacing changes not just how far apart candidates are
   * but which chunk inside each region is chosen.
   */
  setLargeFeatureWithSalt(levelSeed, x, z, salt) {
    const seed = toSeedBigInt(levelSeed)
      + BigInt(x) * 341873128712n
      + BigInt(z) * 132897987541n
      + toSeedBigInt(salt);
    return this.setSeed(BigInt.asIntN(64, seed));
  }

  /** Exposed for tests and for save/restore of a partially consumed source. */
  getSeed() {
    return this.seed;
  }
}

/**
 * Xoroshiro128++, the modern `RandomSource`.
 *
 * Implemented because the target version uses it, but its *seeding* is not yet reproduced from a
 * primary source, so nothing in this engine draws parity-critical values from it yet. See the
 * PARITY STATUS note at the top of this file.
 */
export class XoroshiroRandom {
  constructor(lo = 0n, hi = 0n) {
    this.lo = BigInt(lo);
    this.hi = BigInt(hi);
  }

  static fromSeed(seed) {
    // mixStafford13 is the splitmix64 finaliser vanilla uses to expand a 64-bit seed into 128 bits.
    const s = BigInt.asUintN(64, toSeedBigInt(seed));
    return new XoroshiroRandom(mixStafford13(s), mixStafford13(s ^ 0x6A09E667F3BCC909n));
  }

  nextLong() {
    const s0 = this.lo;
    let s1 = this.hi;
    const result = BigInt.asIntN(64, rotl(BigInt.asUintN(64, s0 + s1), 17) + s0);
    s1 = BigInt.asUintN(64, s1 ^ s0);
    this.lo = BigInt.asUintN(64, rotl(s0, 49) ^ s1 ^ (s1 << 21n));
    this.hi = rotl(s1, 28);
    return result;
  }

  next(bits) {
    return Number(BigInt.asUintN(64, this.nextLong()) >> BigInt(64 - bits));
  }

  nextInt() {
    return this.next(32) | 0;
  }

  nextIntBound(bound) {
    if (!Number.isInteger(bound) || bound <= 0) throw new Error(`bound must be a positive integer, got ${bound}`);
    // Vanilla's XoroshiroRandomSource uses a modulo on an unsigned long with a rejection loop; for the
    // bounds used by worldgen (< 2^31) the modulo path is equivalent and is what is implemented here.
    return Number(BigInt.asUintN(64, this.nextLong()) % BigInt(bound));
  }

  nextDouble() {
    return Number(BigInt.asUintN(64, this.nextLong()) >> 11n) * (1 / 9007199254740992);
  }

  nextFloat() {
    return this.next(24) * (1 / 16777216);
  }

  nextBoolean() {
    return (this.nextLong() & 1n) !== 0n;
  }
}

function mixStafford13(z) {
  let x = BigInt.asUintN(64, z);
  x = BigInt.asUintN(64, (x ^ (x >> 30n)) * 0xBF58476D1CE4E5B9n);
  x = BigInt.asUintN(64, (x ^ (x >> 27n)) * 0x94D049BB133111EBn);
  return BigInt.asUintN(64, x ^ (x >> 31n));
}

function rotl(x, k) {
  const v = BigInt.asUintN(64, x);
  const n = BigInt(k);
  return BigInt.asUintN(64, (v << n) | (v >> (64n - n)));
}

/** Widen any accepted seed form to a Java-long BigInt, so mixing never loses low bits. */
export function toSeedBigInt(seed) {
  if (typeof seed === 'bigint') return BigInt.asIntN(64, seed);
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) throw new Error(`seed must be finite, got ${seed}`);
    if (!Number.isInteger(seed)) throw new Error(`seed must be an integer, got ${seed}`);
    return BigInt.asIntN(64, BigInt(seed));
  }
  if (typeof seed === 'string') {
    const text = seed.trim();
    if (!/^-?\d+$/.test(text)) throw new Error(`seed string must be an integer, got "${seed}"`);
    return BigInt.asIntN(64, BigInt(text));
  }
  throw new Error(`unsupported seed type: ${typeof seed}`);
}

/**
 * `PositionalRandomFactory`: a random source derived from a position rather than from a shared stream.
 *
 * Vanilla replaced the old shared `java.util.Random` with per-position factories so that two features
 * at the same coordinates are reproducible regardless of generation order. Structures use this for
 * per-piece decoration (and for placement in newer versions).
 */
export class PositionalRandomFactory {
  constructor(seed) {
    this.seed = toSeedBigInt(seed);
  }

  /** `at(x, y, z)`: mix the coordinates into the seed and hand back an independent source. */
  at(x, y, z) {
    const mixed = this.seed
      ^ (BigInt(Math.trunc(x)) * 674155232199239n)
      ^ (BigInt(Math.trunc(y)) * 2246822519n)
      ^ (BigInt(Math.trunc(z)) * 3266489917n);
    return new XoroshiroRandom.fromSeed(BigInt.asIntN(64, mixed));
  }

  atChunk(chunkX, chunkZ) {
    return this.at(chunkX, 0, chunkZ);
  }
}

/** A deterministic 32-bit content hash, used to prove "same seed, same structures" in tests and in the Inspector. */
export function contentHash(values) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    let h = Math.imul(hash ^ (Number(value) & 0xff), 0x01000193);
    for (let shift = 8; shift < 32; shift += 8) h = Math.imul(h ^ ((Number(value) >>> shift) & 0xff), 0x01000193);
    hash = h >>> 0;
  }
  return hash >>> 0;
}
