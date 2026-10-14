// The music discs, and the one way most of them are obtained.
//
// Vanilla has nineteen discs. Eighteen of them were absent from this game and only `music_disc_5` -- the one
// that is crafted from disc fragments -- was registered, so a creeper killed by a skeleton, which is where
// twelve of them come from, had nothing to give.
//
// The pool is the twelve that a creeper can drop. The other six are deliberately not in it, because vanilla
// puts each of them somewhere specific and a creeper must not hand them out:
//
//   * `music_disc_5`        crafted from nine disc fragments (four here, as the recipe has it)
//   * `music_disc_pigstep`  bastion remnant loot
//   * `music_disc_otherside` bastion remnant loot
//   * `music_disc_relic`    ocean ruin and trail ruin loot
//   * `music_disc_creator`  trial chamber loot (and the music box variant)
//   * `music_disc_precipice` loot only
//
// A named list rather than a filter over every `music_disc_*` id: a filter would silently start handing out
// a new disc the day one is added for a structure that does not exist here yet.

/** The discs a creeper drops when a skeleton or stray kills it. */
export const CREEPER_DISC_POOL = [
  'music_disc_13',
  'music_disc_cat',
  'music_disc_blocks',
  'music_disc_chirp',
  'music_disc_far',
  'music_disc_mall',
  'music_disc_mellohi',
  'music_disc_stal',
  'music_disc_strad',
  'music_disc_ward',
  'music_disc_11',
  'music_disc_wait',
];

/** Discs that exist but are not a creeper's to give, with where they come from instead. */
export const DISC_SOURCES_ELSEWHERE = {
  music_disc_5: 'crafted from disc fragments',
  music_disc_pigstep: 'bastion remnant loot',
  music_disc_otherside: 'bastion remnant loot',
  music_disc_relic: 'ocean ruin and trail ruin loot',
  music_disc_creator: 'trial chamber loot',
  music_disc_creator_music_box: 'trial chamber loot',
  music_disc_precipice: 'loot only',
  // Their own pages' "Obtaining" sections (chickenJockey.js drops the first two):
  music_disc_tears: 'dropped by a ghast killed by a player-deflected fireball',
  music_disc_lava_chicken: 'dropped by a baby zombie riding a chicken, killed by a player or a tamed wolf',
  music_disc_bounce: 'minecart chests in mineshafts in sulfur caves',
};

/**
 * One randomly chosen disc, as a drop row: `[id, isBlock, min, max]`.
 *
 * Returns an empty array when the pool is somehow empty, so a mis-edit cannot produce a row with an
 * undefined id that spawns nothing and logs nothing.
 */
export function creeperDiscDrop(random = Math.random) {
  if (!CREEPER_DISC_POOL.length) return [];
  const index = Math.min(CREEPER_DISC_POOL.length - 1, Math.floor(random() * CREEPER_DISC_POOL.length));
  return [[CREEPER_DISC_POOL[index], false, 1, 1]];
}
