// Deterministic random for the natural-spawning subsystem.
//
// Why a dedicated generator rather than `Math.random()`.
//
// `Math.random()` is process-global, unseedable and invisible: a spawn that looks wrong cannot be
// replayed, and a test that flips a coin to decide whether a pack appears is a test that fails
// once a week. Minecraft's `NaturalSpawner` draws from `Level.random`, which is a seeded
// `java.util.Random` held by the level, so the same level seed plus the same tick sequence
// produces the same spawn decisions for the parts of spawning that are not player-movement
// dependent.
//
// This module reproduces `java.util.Random` exactly -- the same 48-bit linear congruential
// generator, the same 32-bit truncation, the same nextInt rejection behaviour -- so that a
// candidate position drawn here lands where Minecraft's would for the same seed and call order.
// That is what makes a differential test against known Minecraft output possible at all.
//
// Reference: java.util.Random documentation (Oracle), and the OpenJDK implementation of
// `next(int)` / `nextInt(int bound)`. The algorithm itself is a published constant, not
// Minecraft code.

/** java.util.Random's multiplier. */
const MULTIPLIER = 0x5DEECE66Dn;
/** java.util.Random's addend. */
const ADDEND = 0xBn;
/** java.util.Random's modulus is 2^48, kept as a mask. */
const MASK_48 = 0xFFFFFFFFFFFFn;
/** 2^31, the threshold java.util.Random uses to avoid a sign overflow. */
const INT_MAX_PLUS_ONE = 0x80000000;

/**
 * A seeded, replayable `java.util.Random`.
 *
 * The generator holds its state as a BigInt because Java's 48-bit seed does not fit a JS number
 * without losing the low bits that the whole algorithm depends on. BigInt arithmetic on 48-bit
 * values is a few times slower than float arithmetic, which matters because spawning draws
 * hundreds of numbers per second -- not thousands, and never in the render loop -- so the
 * correctness is worth more than the nanoseconds here.
 */
export class JavaRandom {
  /** @param {number|bigint} seed the world seed, truncated to 48 bits as Java does */
  constructor(seed = 0) {
    this.setSeed(seed);
  }

  /**
   * Reseed exactly as `java.util.Random.setSeed` does.
   *
   * `(seed ^ 0x5DEECE66D) & ((1 << 48) - 1)` -- the XOR is why seed 0 and seed 0x5DEECE66D are
   * indistinguishable, and why a naive `state = seed` port produces a different sequence.
   */
  setSeed(seed) {
    const value = typeof seed === 'bigint' ? seed : BigInt(Math.trunc(Number(seed) || 0));
    this.state = (value ^ MULTIPLIER) & MASK_48;
    return this;
  }

  /** The current raw 48-bit state, for snapshot/restore in tests and saves. */
  getState() {
    return this.state;
  }

  setState(state) {
    this.state = BigInt(state) & MASK_48;
    return this;
  }

  /**
   * `java.util.Random.next(bits)`: advance the LCG and take the top `bits` bits.
   *
   * @param {number} bits 1..32
   * @returns {number} a signed 32-bit int, exactly as Java returns
   */
  next(bits) {
    this.state = (this.state * MULTIPLIER + ADDEND) & MASK_48;
    // >>> would coerce through a 32-bit float first, so shift the BigInt and then convert. The
    // subtraction converts Java's unsigned high bits into the signed int Java actually returns.
    const shifted = Number(this.state >> BigInt(48 - bits));
    return shifted | 0;
  }

  /** A uniformly distributed signed 32-bit int. */
  nextInt() {
    return this.next(32);
  }

  /**
   * A uniform int in `[0, bound)`, matching `java.util.Random.nextInt(int)`.
   *
   * The rejection loop is not optional: a plain `next(31) % bound` is biased toward small values,
   * and for a bound like 3 (the spawn-attempt count) that bias is several percent. Rejection
   * sampling is what makes the weighted biome selection land on the vanilla distribution.
   *
   * @param {number} [bound] omitted means "any int"
   */
  nextInt(bound) {
    if (bound === undefined) return this.next(32);
    const n = Math.trunc(bound);
    if (!(n > 0)) throw new RangeError(`nextInt bound must be positive, got ${bound}`);
    // Fast path for powers of two, as Java does: no rejection needed.
    if ((n & -n) === n) {
      return Number((BigInt(n) * BigInt(this.next(31))) >> 31n);
    }
    let bits;
    let val;
    do {
      bits = this.next(31);
      val = bits % n;
    } while (bits - val + (n - 1) > INT_MAX_PLUS_ONE - 1 || bits - val + (n - 1) < 0);
    return val;
  }

  /** A `long` in `[0, bound)`, as `java.util.Random.nextLong(bound)`. */
  nextLong(bound) {
    if (bound === undefined) {
      const hi = BigInt(this.next(32));
      const lo = BigInt(this.next(32));
      return (hi << 32n) + lo;
    }
    const n = BigInt(Math.trunc(bound));
    if (n <= 0n) throw new RangeError(`nextLong bound must be positive, got ${bound}`);
    let r = this.nextLong();
    if (r < 0n) r = -r;
    return r % n;
  }

  /** A double in `[0, 1)`, as `java.util.Random.nextDouble()`. */
  nextDouble() {
    const hi = BigInt(this.next(26));
    const lo = BigInt(this.next(27));
    return Number((hi << 27n) + lo) / 9007199254740992; // 2^53
  }

  /** A float in `[0, 1)`, as `java.util.Random.nextFloat()`. */
  nextFloat() {
    return this.next(24) / (1 << 24);
  }

  /** A boolean, as `java.util.Random.nextBoolean()`. */
  nextBoolean() {
    return this.next(1) !== 0;
  }

  /**
   * A Gaussian, as `java.util.Random.nextGaussian()` (the polar Box-Muller method Java uses).
   *
   * Kept because vanilla mob attribute rolls use it, and a linear approximation would shift the
   * distribution of things like pack-member health.
   */
  nextGaussian() {
    if (this.haveNextNextGaussian) {
      this.haveNextNextGaussian = false;
      return this.nextNextGaussian;
    }
    let v1;
    let v2;
    let s;
    do {
      v1 = 2 * this.nextDouble() - 1;
      v2 = 2 * this.nextDouble() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    const multiplier = Math.sqrt((-2 * Math.log(s)) / s);
    this.nextNextGaussian = v2 * multiplier;
    this.haveNextNextGaussian = true;
    return v1 * multiplier;
  }

  /**
   * `java.util.Random.nextInt(bound)` returning a double, as the 1.17+ `RandomSource` helper
   * `nextIntBetweenInclusive`/`triangle` family needs.
   */
  nextDoubleIn(lo, hi) {
    return lo + this.nextDouble() * (hi - lo);
  }

  /** Vanilla's `Mth.nextInt(random, min, max)`, inclusive on both ends. */
  nextIntBetweenInclusive(min, max) {
    return min + this.nextInt(max - min + 1);
  }

  /** Vanilla's `Mth.nextDouble(random, min, max)`. */
  nextDoubleBetween(min, max) {
    return min + this.nextDouble() * (max - min);
  }

  /** Vanilla's `Mth.nextFloat(random, min, max)`. */
  nextFloatBetween(min, max) {
    return min + this.nextFloat() * (max - min);
  }

  /**
   * Vanilla's `Mth.triangle(random, base, spread)`: the sum of two draws, which produces the
   * triangular distribution the game uses for pack-member offsets.
   */
  triangle(base, spread) {
    return base + (this.nextDouble() - this.nextDouble()) * spread;
  }
}

/**
 * A generator that returns a fixed value, for tests that need a known branch.
 *
 * Provided here rather than as ad-hoc closures in each test so that `spawnForChunk` and friends
 * accept one type.
 */
export class FixedRandom extends JavaRandom {
  constructor(value = 0.5) {
    super(0);
    this.value = value;
  }

  next() { return Math.trunc(this.value * INT_MAX_PLUS_ONE) | 0; }
  nextInt(bound) {
    if (bound === undefined) return this.next(32);
    return Math.min(bound - 1, Math.floor(this.value * bound));
  }
  nextDouble() { return this.value; }
  nextFloat() { return this.value; }
  nextBoolean() { return this.value >= 0.5; }
}

/**
 * Normalise anything a caller may hand in as "the random source" into an object with the
 * `java.util.Random` surface.
 *
 * The subsystem is called both from the game (which passes the world's seeded generator) and
 * from tests and the debug overlay (which may pass a bare `() => number`, or nothing at all).
 * Accepting all three at the boundary keeps every internal call site able to use `nextInt`,
 * `nextDouble` and the vanilla helpers without a per-site guard.
 *
 * @param {object|Function|null|undefined} source
 * @param {number} [seed] used only when `source` is nullish
 * @returns {JavaRandom}
 */
export function asSpawnRandom(source, seed = 0) {
  if (source instanceof JavaRandom) return source;
  if (typeof source === 'function') {
    // A bare function: wrap it, mapping [0,1) draws onto the JavaRandom surface.
    const wrapper = new JavaRandom(seed);
    wrapper.nextDouble = () => Number(source());
    wrapper.nextFloat = () => Number(source());
    wrapper.nextInt = (bound) => (bound === undefined
      ? Math.trunc(Number(source()) * INT_MAX_PLUS_ONE)
      : Math.min(bound - 1, Math.max(0, Math.floor(Number(source()) * bound))));
    wrapper.nextBoolean = () => Number(source()) >= 0.5;
    return wrapper;
  }
  if (source && typeof source.nextInt === 'function') return source;
  return new JavaRandom(seed);
}
