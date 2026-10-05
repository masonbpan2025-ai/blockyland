// Bundles: vanilla's pouch, which holds one stack's worth of things.
//
// What is faithful here: the capacity (sixty-four items, whatever they are), that a bundle cannot hold another
// bundle, and that taking from one takes a single item at a time. What is simplified, and named rather than
// hidden: vanilla lets a bundle hold *mixed* contents and remembers the order they went in, which needs a
// per-item insert order this game's inventory has no concept of. Here a bundle holds a list of stacks and the
// list is its contents.
//
// The rules are pure functions over a plain contents array, so the tests can drive every case and the caller
// only has to decide *when* to consult them: picking an item up when the inventory is full, and using one.

/** How many items a bundle holds, whatever they are. Vanilla's sixty-four. */
export const BUNDLE_CAPACITY = 64;

/** Is this item a bundle? Seventeen of them, one plain and sixteen dyed. */
export function isBundle(item) {
  return Boolean(item && !item.isBlock && /(^|_)bundle$/.test(String(item.id)));
}

/** How many items a contents list currently holds. */
export function bundleLoad(contents) {
  return (contents ?? []).reduce((sum, entry) => sum + (entry?.count ?? 0), 0);
}

/** What a bundle holds, as a `{id, isBlock, count}` list, or an empty list. */
export function bundleContents(bundle) {
  const listed = bundle?.contents;
  return Array.isArray(listed) ? listed.filter((entry) => entry && entry.count > 0) : [];
}

/**
 * Put an item in: the new contents, or null when it will not fit.
 *
 * A bundle never holds a bundle -- vanilla's rule, and the one that stops a bundle being a bag of holding --
 * and the total is capped rather than the stack, so eight items can go in beside a stack of fifty-six.
 */
export function addToBundle(bundle, item) {
  if (!isBundle(bundle) || !item || !(item.count > 0)) return null;
  if (isBundle(item)) return null;
  const contents = bundleContents(bundle);
  const room = BUNDLE_CAPACITY - bundleLoad(contents);
  if (room <= 0) return null;
  const moved = Math.min(room, item.count);
  const next = contents.map((entry) => ({ ...entry }));
  const same = next.find((entry) => entry.id === item.id && Boolean(entry.isBlock) === Boolean(item.isBlock));
  if (same) same.count += moved;
  else next.push({ id: item.id, isBlock: Boolean(item.isBlock), count: moved });
  return { contents: next, moved };
}

/**
 * Take one item out: the item, and the contents it leaves behind.
 *
 * Vanilla takes the *first* item in, so this takes the first item in the list. Returns null for an empty
 * bundle, which is how the caller knows to do nothing rather than to place a block.
 */
export function takeFromBundle(bundle) {
  const contents = bundleContents(bundle);
  if (!contents.length) return null;
  const [first, ...rest] = contents;
  const item = { id: first.id, isBlock: Boolean(first.isBlock), count: 1 };
  const remaining = first.count > 1 ? [{ ...first, count: first.count - 1 }, ...rest] : rest;
  return { item, contents: remaining };
}
