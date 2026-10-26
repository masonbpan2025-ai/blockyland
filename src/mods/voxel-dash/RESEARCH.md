# Voxel Dash v2: original-layout research and fidelity

The generated v1 obstacle patterns were replaced by decoded object data for the five original levels. This is the archived layout snapshot bundled in gd.py 0.11.0, not a claim of matching a particular current Geometry Dash release. The native Geometry Dash engine is not included.

## Primary implementation and data references

- [gd.py 0.11.0 source release](https://pypi.org/project/gd.py/0.11.0/): `gd/official_levels.json` contains compressed original level strings. The importer records dataset and decoded-string SHA-256 hashes in `data/original-levels.js`. Back On Track has 1,545 objects, Polargeist 1,531, Dry Out 1,444, Base After Base 2,146, and Cant Let Go 1,704.
- [GD programming level decoding](https://github.com/gd-programming/gd.docs/blob/main/docs/topics/levelstring_encoding_decoding.md) and [object properties](https://github.com/gd-programming/gd.docs/blob/main/docs/resources/client/level-components/level-object.md): gzip/base64 decoding, original object IDs, center coordinates, flips, rotations and scales.
- [Object catalog](https://github.com/flowvix/gd-info-explorer/blob/main/src/lib/objects.csv): IDs 1–7 are square solids, 8 is a spike, 9 is a black pit hazard, 39 is a half spike, 40/62/68 are slabs, 35/67/140 are pads, 36 is a yellow orb, 10/11 are gravity portals, and 12/13 are cube/ship portals. The archived exported levels represent their three collectibles as ID 1329.
- [Reverse-engineered ship rotation](https://github.com/camila314/gdp/blob/2.2/PlayerObject/PlayerObject_updateShipRotation.cpp), [jump motion](https://github.com/camila314/gdp/blob/2.2/PlayerObject/PlayerObject_updateJump.cpp), and [solid collision](https://github.com/camila314/gdp/blob/2.2/PlayerObject/PlayerObject_collidedWithObjectInternal.cpp): ships face along their trajectory, control vertical acceleration, and resolve horizontal solid faces.
- [Measured ship parameters](https://github.com/CarlosDev-max/gdsolver-FORK/blob/main/dp/src/models/ship_params.hpp) and [cube/collision constants](https://github.com/CarlosDev-max/gdsolver-FORK/blob/main/dp/src/dp/constants.hpp): 240-Hz integration, 30-unit cube, full-size jump impulse 11.18, cube gravity step 0.216, yellow pad impulse 16, ship vertical caps 8/-6.4, four acceleration branches. These are converted using 54 world units per second per GD velocity unit.

## Levels 7–12 (v2.1)

Jumper, Time Machine, Cycles, xStep, Clutterfunk and Theory of Everything come from the same dataset file (same SHA-256), imported after the first five, whose data and courses are unchanged byte for byte. They are levels 7–12 of the game in its own order; Stereo Madness (level 1) is not imported. Every level starts as a normal-size cube at normal speed (header `kA2`, `kA3`, `kA4` all 0), and none uses speed or dual portals.

New object mappings, names from the object catalog above:

- Solids in every tile style the levels use: cross (69), bevelled (70–75), mechanical (76–83), black (90–96) and brick (116–122), with the slab end pieces 65/66 as slabs.
- **Inner squares are fill, not solids**: 5, 73, 80, 94 and 120, each set's "Inner Square", are drawn but have no collision. Evidence: treated as solid, Clutterfunk's third pillar gap at x 1605 holds a 32.3-radius saw in a 90-unit opening and cannot be passed, and Theory of Everything's brick climb cannot either; with them passable both levels complete, and every other level completes either way.
- Hazards: pits 61 (wavy) and 135 (thorn) as 9; the small spike 103 as the half spike; sawblades 88/89/98 as circles of radius 32.3/21.6/12 (the solver's measured values: [object.hpp](https://github.com/CarlosDev-max/gdsolver-FORK/blob/main/dp/src/dp/object.hpp)).
- Orbs: pink 141, blue 84. Portals: ball 47, UFO 111, size 99 (normal) / 101 (mini), mirror 45 (on) / 46 (off). IDs 104/105 carry colour fields and are the line/object colour triggers (gd.py's `Line = 104`, `Obj = 105`); they, the enter effects and decorations are presentation.

Physics added, with its standing:

- Mini: half size 9 (0.6), jump and launch impulses 0.8, gravity unchanged. **Measured** (constants.hpp, `kMiniHalf`, `kCubeJumpMini`, `kMiniImpulse`).
- Ball: gravity 0.6 of the cube's, pads 0.6, orbs 0.7. **Measured** (constants.hpp: the updateJump mode table, "ball is 0.600/0.700"). The push off a surface when the ball flips is 0.3 of a jump: **adapter**.
- UFO: one flap per press, 7.0 GD units (378 per second here), gravity 0.6, falling capped as the ship's. The flap matches the solver's trace of a first update reading 6.871 = 7.0 − 0.129; **adapter** otherwise. An orb in reach takes the press instead of the flap.
- Pink orb 0.7 of the yellow: **adapter**. Blue orb: flips gravity and launches 0.5 of a jump towards the new down: **adapter**.
- Ball and UFO corridors are ten blocks, the ship's. Evidence: Cycles' first ball section has a column at x 9720 from 90 to 240 that a ball can only pass over, which an eight-block corridor would close.
- Corrections that apply to every level: a gravity pad launches **away** from itself, towards the new down (it pushed towards the old one, which threw xStep's ceiling pads into the spikes above them), and fires only for a player falling onto it (a floor pad with normal gravity, a ceiling pad upside down; the solver's `objFacingDown` gate). For 0.1 s after any gravity flip a block's side re-seats the player on the nearer face instead of killing (constants.hpp `kFlipGraceTicks`, measured in the game). Back On Track and Polargeist, which have one gravity pad each, still verify.

All eleven levels pass `scripts/verify-voxel-dash-courses.mjs`: a jump-button-only route is found and replayed for each. The solver's own recorded solutions (its `data/solution_lvN_dp.txt`) do not replay here past their first sections: its model and this one differ in small ways that compound, so they are not used as a check.

Cube/ship portal centers of the new levels, in original world units: Jumper 6741 / 10103, Time Machine 10635 / 12975, Cycles 13485 / 17613, xStep 4605 / 6889, Clutterfunk 8669 / 20165, Theory of Everything 2295 / 4305 (first ship section).

## Preserved layout

The importer retains every original object record. `createCourse` translates all gameplay IDs with a one-to-one source index; it never generates, relocates, resizes by difficulty, or randomly substitutes hazards. Original positions, flips, rotations, scale and object identity are preserved. Biome scenery and sound remain mod-owned presentation.

Cube/ship portal centers, in original world units:

| Level | Ship entry X | Cube return X |
| --- | ---: | ---: |
| Back On Track | 12645 | 16785 |
| Polargeist | 9645 | 13305 |
| Dry Out | 16991 | 21225 |
| Base After Base | 13793 | 17985 |
| Can't Let Go | 14409 | 17721 |

Elevated coin-route portals activate only on contact, so passing below one does not incorrectly reverse gravity. Pads launch automatically. Ground jumping consumes buffered orb input; airborne orb activation needs a fresh press, which can be held until touching the orb. Practice checkpoints can be placed in flight and retain position, mode, gravity and momentum.

**Coyote time.** Geometry Dash added it in the 2.2 series (Update 2.2 page: "Coyote time has been added for jumping off platforms in Platformer mode"; the 2.201 release thread); speedrun guides use it to "fall off of the ledge slightly, then jump mid-air". No frame count is published, so the window here is measured in the cube's own turn: a cube that walks off an edge may still jump until it has turned 30 degrees from where it left (`PHYSICS.coyoteTilt`), 1/15 s at its 450 degrees a second, 16 ticks of 240. A jump, a pad, an orb, a portal or a gravity flip gives no coyote time; landing or passing 30 degrees ends it; one coyote jump per edge. Cube only.

## Explicit limits

The coordinates match the archived source data. Physics is a documented browser implementation of the normal cube and ship mechanics, not a binary-identical port of RobTop's engine. Rectangular solid bounds, slab thicknesses, orb impulse and portal corridor placement are adapter definitions; no native-game frame-by-frame parity is claimed. Decoration/color/enter-effect/trail triggers from the original visual theme are replaced by Minecraft scenery. A 600-unit empty finish runout follows the furthest imported object; this is an adapter choice, not decoded official finish timing. The music is original synthesis, not the official songs.

Geometry Dash level data belongs to RobTop Games. The gd.py code's license does not imply ownership of RobTop's level layouts. No original sprites, music or executable were copied. This is an unofficial fan adaptation. The import script accepts a supplied original-level dataset and is reproducible without downloading or executing third-party code.

## Verification

`node --test --test-isolation=none tests/voxelDash.test.js` checks one-to-one geometry, original portal positions, floor/ceiling sliding, lift-off, fatal walls/spikes/pits, forward ship orientation, localized portals, pads/orbs, pause, checkpoint restoration and deterministic journals. `node scripts/verify-voxel-dash-courses.mjs` searches paths using only the jump button and replays each successful path sequentially.
