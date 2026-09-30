# Lava and fire

Lava follows the Overworld rules: one flow step every 30 game ticks (1.5 seconds), downward flow first, and up to three horizontal blocks from a source or the foot of a fall. Removing a source drains its dependent flow. Lava never regenerates sources from neighboring sources.

Water touching source lava makes obsidian; touching flowing lava makes cobblestone. Lava falling onto water makes stone. Buckets collect sources only. Flow resumes when neighboring chunks load and does not generate distant chunks.

Exposed lava can ignite air beside nearby logs, planks, leaves, bookshelves, wool and TNT. Fire spreads, consumes fuel, primes TNT, emits light and dies out; fire over netherrack can persist. Water extinguishes fire. Players and ground mobs take heat damage and continue burning briefly after leaving; water extinguishes them. Lava slows movement and destroys dropped items.

Lava uses animated atlas frames and tapered flow surfaces. Water and lava have dedicated square inventory icons; held water is translucent blue.

The existing waterLevels save field now stores either fluid's level, depending on the voxel ID. Existing maps remain compatible: zero metadata means a source. World water updates/reset/chunk initialization also run the lava system, preserving existing map and game lifecycle callers.

Scope: this game has one Overworld-style dimension. Nether flow rates, dripstone, rain extinguishing, exact vanilla per-material fire probabilities, and specialized aquatic-mob fire behavior are not simulated. Fire uses a bounded randomized simulation to keep browser frame times manageable.

Validation: npm test, npm run build, and /tests/lava-effects.html on the development server for visual inspection.

References: https://minecraft.wiki/w/Lava and https://www.minecraft.net/en-us/article/block-week-lava
