// Fish buckets: vanilla's six bucketable mobs, and the two interactions that make them.
//
// Vanilla's rule is asymmetric, and that is the whole of it:
//
//   * a **water bucket** used on a fish catches it -- the fish is removed and the bucket becomes a fish bucket;
//   * the **fish bucket** used on a water block releases it -- the mob is placed and the bucket is empty again.
//
// So a fish bucket is obtained with a water bucket and spent into a bucket, which is why the two halves are
// separate functions rather than one toggle. What a catch costs and what a release yields are decisions this
// module makes; where the mob goes and whether the water is water are the caller's, because only the caller
// has a world and a mob manager.
//
// `powder_snow_bucket`, vanilla's seventh bucket, is not here: this game has no powder snow to fill it with,
// so an item for it would be an item with no way to exist.

/** The bucket a mob is caught into. Vanilla has exactly these six. */
export const FISH_BUCKETS = {
  cod_bucket: 'cod',
  salmon_bucket: 'salmon',
  pufferfish_bucket: 'pufferfish',
  tropical_fish_bucket: 'tropical_fish',
  axolotl_bucket: 'axolotl',
  tadpole_bucket: 'tadpole',
};

/** The reverse: which bucket catches a given mob. */
export const WATER_BUCKET_CATCHES = Object.fromEntries(
  Object.entries(FISH_BUCKETS).map(([bucket, mob]) => [mob, bucket]),
);

/** The item a fish is caught into, or null when a water bucket cannot hold this mob. */
export function fishBucketFor(mobType) {
  return WATER_BUCKET_CATCHES[mobType] ?? null;
}

/** Is this item a bucket with a fish in it? */
export function isFishBucket(item) {
  return Boolean(item && !item.isBlock && FISH_BUCKETS[item.id]);
}

/**
 * Catching a fish: what a water bucket becomes when it is used on a mob.
 *
 * @param {{id: string, isBlock?: boolean}|null} item the active item
 * @param {string} mobType
 * @returns {string|null} the bucket to give back, or null when nothing happens
 */
export function catchFish(item, mobType) {
  if (!item || item.isBlock || item.id !== 'water_bucket') return null;
  return fishBucketFor(mobType);
}

/**
 * Releasing a fish: what the mob and the replacement bucket are.
 *
 * @param {{id: string, isBlock?: boolean}|null} item the active item
 * @returns {{mob: string, replacement: string}|null} null when the item holds no fish
 */
export function releaseFish(item) {
  const mob = item && !item.isBlock ? FISH_BUCKETS[item.id] : undefined;
  return mob ? { mob, replacement: 'bucket' } : null;
}

/**
 * Vanilla's stack size for every mob bucket, empty or full.
 *
 * A bucket holds one thing, so this is one; it is named here because `stackLimitFor` reads it and because the
 * six fish buckets are added to the item table in a batch where every other new item stacks to 64.
 */
export const BUCKET_STACK_SIZE = 1;
