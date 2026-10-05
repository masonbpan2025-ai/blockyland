// Items this branch added, kept out of `src/blocks.js`.
//
// They were in that file's item table, which two concurrent commits have rewritten and deleted them from:
// their branches were cut before these batches, and their edits landed on the same lines, so a merge that
// resolved cleanly still lost the items. A file nothing else edits cannot be rewritten by accident, and the
// single merge line in `blocks.js` is much harder to clobber than sixty-five definitions.
//
// `blocks.js` merges this into `ITEMS`, so every consumer sees one table and no caller had to change.
import { BLOCKS } from './blocks.js';

/**
 * The items, built on demand.
 *
 * A function rather than a plain object because `blocks.js` imports this file to merge it, and reading
 * `BLOCKS` at module-evaluation time would read it while `blocks.js` is still half-built.
 */
export function addedItems() {
  return {
    cod_bucket: { name: 'Bucket of Cod', icon: '/assets/items/cod_bucket.png', type: 'tool', stackSize: 1 },
    salmon_bucket: { name: 'Bucket of Salmon', icon: '/assets/items/salmon_bucket.png', type: 'tool', stackSize: 1 },
    pufferfish_bucket: { name: 'Bucket of Pufferfish', icon: '/assets/items/pufferfish_bucket.png', type: 'tool', stackSize: 1 },
    tropical_fish_bucket: { name: 'Bucket of Tropical Fish', icon: '/assets/items/tropical_fish_bucket.png', type: 'tool', stackSize: 1 },
    axolotl_bucket: { name: 'Bucket of Axolotl', icon: '/assets/items/axolotl_bucket.png', type: 'tool', stackSize: 1 },
    tadpole_bucket: { name: 'Bucket of Tadpole', icon: '/assets/items/tadpole_bucket.png', type: 'tool', stackSize: 1 },
    bundle: { name: 'Bundle', icon: '/assets/items/bundle.png', type: 'tool', stackSize: 1 },
    white_bundle: { name: 'White Bundle', icon: '/assets/items/white_bundle.png', type: 'tool', stackSize: 1 },
    orange_bundle: { name: 'Orange Bundle', icon: '/assets/items/orange_bundle.png', type: 'tool', stackSize: 1 },
    magenta_bundle: { name: 'Magenta Bundle', icon: '/assets/items/magenta_bundle.png', type: 'tool', stackSize: 1 },
    light_blue_bundle: { name: 'Light Blue Bundle', icon: '/assets/items/light_blue_bundle.png', type: 'tool', stackSize: 1 },
    yellow_bundle: { name: 'Yellow Bundle', icon: '/assets/items/yellow_bundle.png', type: 'tool', stackSize: 1 },
    lime_bundle: { name: 'Lime Bundle', icon: '/assets/items/lime_bundle.png', type: 'tool', stackSize: 1 },
    pink_bundle: { name: 'Pink Bundle', icon: '/assets/items/pink_bundle.png', type: 'tool', stackSize: 1 },
    gray_bundle: { name: 'Gray Bundle', icon: '/assets/items/gray_bundle.png', type: 'tool', stackSize: 1 },
    light_gray_bundle: { name: 'Light Gray Bundle', icon: '/assets/items/light_gray_bundle.png', type: 'tool', stackSize: 1 },
    cyan_bundle: { name: 'Cyan Bundle', icon: '/assets/items/cyan_bundle.png', type: 'tool', stackSize: 1 },
    purple_bundle: { name: 'Purple Bundle', icon: '/assets/items/purple_bundle.png', type: 'tool', stackSize: 1 },
    blue_bundle: { name: 'Blue Bundle', icon: '/assets/items/blue_bundle.png', type: 'tool', stackSize: 1 },
    brown_bundle: { name: 'Brown Bundle', icon: '/assets/items/brown_bundle.png', type: 'tool', stackSize: 1 },
    green_bundle: { name: 'Green Bundle', icon: '/assets/items/green_bundle.png', type: 'tool', stackSize: 1 },
    red_bundle: { name: 'Red Bundle', icon: '/assets/items/red_bundle.png', type: 'tool', stackSize: 1 },
    black_bundle: { name: 'Black Bundle', icon: '/assets/items/black_bundle.png', type: 'tool', stackSize: 1 },
    angler_pottery_sherd: { name: 'Angler Pottery Sherd', icon: '/assets/items/angler_pottery_sherd.png', type: 'material' },
    archer_pottery_sherd: { name: 'Archer Pottery Sherd', icon: '/assets/items/archer_pottery_sherd.png', type: 'material' },
    arms_up_pottery_sherd: { name: 'Arms Up Pottery Sherd', icon: '/assets/items/arms_up_pottery_sherd.png', type: 'material' },
    blade_pottery_sherd: { name: 'Blade Pottery Sherd', icon: '/assets/items/blade_pottery_sherd.png', type: 'material' },
    brewer_pottery_sherd: { name: 'Brewer Pottery Sherd', icon: '/assets/items/brewer_pottery_sherd.png', type: 'material' },
    burn_pottery_sherd: { name: 'Burn Pottery Sherd', icon: '/assets/items/burn_pottery_sherd.png', type: 'material' },
    danger_pottery_sherd: { name: 'Danger Pottery Sherd', icon: '/assets/items/danger_pottery_sherd.png', type: 'material' },
    explorer_pottery_sherd: { name: 'Explorer Pottery Sherd', icon: '/assets/items/explorer_pottery_sherd.png', type: 'material' },
    flow_pottery_sherd: { name: 'Flow Pottery Sherd', icon: '/assets/items/flow_pottery_sherd.png', type: 'material' },
    friend_pottery_sherd: { name: 'Friend Pottery Sherd', icon: '/assets/items/friend_pottery_sherd.png', type: 'material' },
    guster_pottery_sherd: { name: 'Guster Pottery Sherd', icon: '/assets/items/guster_pottery_sherd.png', type: 'material' },
    heart_pottery_sherd: { name: 'Heart Pottery Sherd', icon: '/assets/items/heart_pottery_sherd.png', type: 'material' },
    heartbreak_pottery_sherd: { name: 'Heartbreak Pottery Sherd', icon: '/assets/items/heartbreak_pottery_sherd.png', type: 'material' },
    howl_pottery_sherd: { name: 'Howl Pottery Sherd', icon: '/assets/items/howl_pottery_sherd.png', type: 'material' },
    miner_pottery_sherd: { name: 'Miner Pottery Sherd', icon: '/assets/items/miner_pottery_sherd.png', type: 'material' },
    mourner_pottery_sherd: { name: 'Mourner Pottery Sherd', icon: '/assets/items/mourner_pottery_sherd.png', type: 'material' },
    plenty_pottery_sherd: { name: 'Plenty Pottery Sherd', icon: '/assets/items/plenty_pottery_sherd.png', type: 'material' },
    prize_pottery_sherd: { name: 'Prize Pottery Sherd', icon: '/assets/items/prize_pottery_sherd.png', type: 'material' },
    scrape_pottery_sherd: { name: 'Scrape Pottery Sherd', icon: '/assets/items/scrape_pottery_sherd.png', type: 'material' },
    sheaf_pottery_sherd: { name: 'Sheaf Pottery Sherd', icon: '/assets/items/sheaf_pottery_sherd.png', type: 'material' },
    shelter_pottery_sherd: { name: 'Shelter Pottery Sherd', icon: '/assets/items/shelter_pottery_sherd.png', type: 'material' },
    skull_pottery_sherd: { name: 'Skull Pottery Sherd', icon: '/assets/items/skull_pottery_sherd.png', type: 'material' },
    snort_pottery_sherd: { name: 'Snort Pottery Sherd', icon: '/assets/items/snort_pottery_sherd.png', type: 'material' },
    scaffolding: { name: 'Scaffolding', icon: '/assets/items/scaffolding.png', isBlock: true, blockId: BLOCKS.SCAFFOLDING, type: 'block' },
    // The fifth banner pattern, and the only one obtainable: a master cartographer sells it, which is vanilla's
    // route. `piglin_banner_pattern` is the sixth and is deliberately absent -- vanilla's barter table is the
    // only source for it here, and that table is pinned to Java 1.21.6+'s nineteen entries, which do not
    // include it. See the trade row in `villagerEconomy.js` and the entry in `codeDropSources.js`.
    // `stackSize: 1` because a banner pattern does not stack, which the four generated patterns also declare and
    // which `stack-size` checks against the pinned data -- it caught this one missing the field.
    globe_banner_pattern: { name: 'Globe Banner Pattern', icon: '/assets/items/globe_banner_pattern.png', stackSize: 1, type: 'material' },
    cake: { name: 'Cake', icon: '/assets/items/cake.png', isBlock: true, blockId: BLOCKS.CAKE, stackSize: 1, type: 'block' },
    shulker_box: { name: 'Shulker Box', icon: '/assets/items/shulker_box.png', isBlock: true, blockId: BLOCKS.SHULKER_BOX, stackSize: 1, type: 'block' },
    white_shulker_box: { name: 'White Shulker Box', icon: '/assets/items/white_shulker_box.png', isBlock: true, blockId: BLOCKS.WHITE_SHULKER_BOX, stackSize: 1, type: 'block' },
    orange_shulker_box: { name: 'Orange Shulker Box', icon: '/assets/items/orange_shulker_box.png', isBlock: true, blockId: BLOCKS.ORANGE_SHULKER_BOX, stackSize: 1, type: 'block' },
    magenta_shulker_box: { name: 'Magenta Shulker Box', icon: '/assets/items/magenta_shulker_box.png', isBlock: true, blockId: BLOCKS.MAGENTA_SHULKER_BOX, stackSize: 1, type: 'block' },
    light_blue_shulker_box: { name: 'Light Blue Shulker Box', icon: '/assets/items/light_blue_shulker_box.png', isBlock: true, blockId: BLOCKS.LIGHT_BLUE_SHULKER_BOX, stackSize: 1, type: 'block' },
    yellow_shulker_box: { name: 'Yellow Shulker Box', icon: '/assets/items/yellow_shulker_box.png', isBlock: true, blockId: BLOCKS.YELLOW_SHULKER_BOX, stackSize: 1, type: 'block' },
    lime_shulker_box: { name: 'Lime Shulker Box', icon: '/assets/items/lime_shulker_box.png', isBlock: true, blockId: BLOCKS.LIME_SHULKER_BOX, stackSize: 1, type: 'block' },
    pink_shulker_box: { name: 'Pink Shulker Box', icon: '/assets/items/pink_shulker_box.png', isBlock: true, blockId: BLOCKS.PINK_SHULKER_BOX, stackSize: 1, type: 'block' },
    gray_shulker_box: { name: 'Gray Shulker Box', icon: '/assets/items/gray_shulker_box.png', isBlock: true, blockId: BLOCKS.GRAY_SHULKER_BOX, stackSize: 1, type: 'block' },
    light_gray_shulker_box: { name: 'Light Gray Shulker Box', icon: '/assets/items/light_gray_shulker_box.png', isBlock: true, blockId: BLOCKS.LIGHT_GRAY_SHULKER_BOX, stackSize: 1, type: 'block' },
    cyan_shulker_box: { name: 'Cyan Shulker Box', icon: '/assets/items/cyan_shulker_box.png', isBlock: true, blockId: BLOCKS.CYAN_SHULKER_BOX, stackSize: 1, type: 'block' },
    purple_shulker_box: { name: 'Purple Shulker Box', icon: '/assets/items/purple_shulker_box.png', isBlock: true, blockId: BLOCKS.PURPLE_SHULKER_BOX, stackSize: 1, type: 'block' },
    blue_shulker_box: { name: 'Blue Shulker Box', icon: '/assets/items/blue_shulker_box.png', isBlock: true, blockId: BLOCKS.BLUE_SHULKER_BOX, stackSize: 1, type: 'block' },
    brown_shulker_box: { name: 'Brown Shulker Box', icon: '/assets/items/brown_shulker_box.png', isBlock: true, blockId: BLOCKS.BROWN_SHULKER_BOX, stackSize: 1, type: 'block' },
    green_shulker_box: { name: 'Green Shulker Box', icon: '/assets/items/green_shulker_box.png', isBlock: true, blockId: BLOCKS.GREEN_SHULKER_BOX, stackSize: 1, type: 'block' },
    red_shulker_box: { name: 'Red Shulker Box', icon: '/assets/items/red_shulker_box.png', isBlock: true, blockId: BLOCKS.RED_SHULKER_BOX, stackSize: 1, type: 'block' },
    black_shulker_box: { name: 'Black Shulker Box', icon: '/assets/items/black_shulker_box.png', isBlock: true, blockId: BLOCKS.BLACK_SHULKER_BOX, stackSize: 1, type: 'block' },
  };
}
