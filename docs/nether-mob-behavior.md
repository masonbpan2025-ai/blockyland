# Nether mob behavior and contact physics

References: [Piglin](https://minecraft.wiki/w/Piglin), [Hoglin](https://minecraft.wiki/w/Hoglin), [Bartering](https://minecraft.wiki/w/Bartering), and [Java 1.21.6](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-6).

## Implemented

- The 19-entry Java barter table has total weight 469, including Dried Ghast. Books and boots receive Soul Speed I–III. Enchantments survive ground pickup and work with the anvil; Soul Speed cannot be applied to unrelated equipment or rolled at the enchanting table.
- Fire resistance can be drunk or thrown; spectral arrows are valid bow ammunition and mark hit mobs for ten seconds. Iron nuggets and nether bricks have crafting recipes. New blocks and item icons use bundled assets.
- Piglins seek gold, inspect it, equip golden armor visibly, remember collected items, and eat nearby pork without collecting leather. Damage temporarily disables admiration. Adult hunters recruit allies, retreat when outnumbered, and can celebrate a kill. Babies and bastion/protected mobs are excluded from hunts.
- Hoglins stop before contacting a target, steer around terrain, attack on a two-second cooldown, toss targets, resist knockback, and flee placed repellents. They retaliate in groups, while babies flee independently after a hit. Crimson fungus supports breeding and 20-minute growth; outside the Nether they convert to Zoglins after 15 seconds.
- Mob/player AABB separation respects terrain, vertical position, babies, spectators, and mounted players. Swept contact catches fast crossings. Small bodies stop against the player; larger bodies share a capped 0.8-block-per-second contact push budget. Attack knockback is separate.

## Scope and remaining differences

This is a Java-inspired implementation in the existing browser engine, not a claim of exhaustive vanilla simulation parity. Steering uses the existing voxel physics with calibrated world-unit speeds rather than Minecraft's attribute/pathfinder implementation. Dried Ghast is collectible, craftable, and placeable; hydration and the Happy Ghast lifecycle are not implemented. Respawn Anchor is registered here as a placeable Hoglin repellent; charging and respawning are not implemented. Spectral highlighting uses a visible bounding outline rather than Minecraft's silhouette postprocessing. Baby Piglin jockey stacking, all vanilla equipment-preference cases, and door-opening AI remain outside this change.

## Validation

`tests/netherParity.test.js` exercises barter weights, assets, enchantment pickup/application, potion effects, spectral arrows, hunts, retreat, breeding, conversion, wall navigation, frame-rate stability, contact separation, pushing, and melee knockback. `tests/piglin.test.js` covers the base Piglin interactions. Existing mob, riding, animal, armor, and Nether regressions are retained.
