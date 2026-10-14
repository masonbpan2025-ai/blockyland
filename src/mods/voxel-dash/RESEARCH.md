# Voxel Dash v2: original-layout research and fidelity

The generated v1 obstacle patterns were replaced by decoded object data for the five original levels. This is the archived layout snapshot bundled in gd.py 0.11.0, not a claim of matching a particular current Geometry Dash release. The native Geometry Dash engine is not included.

## Primary implementation and data references

- [gd.py 0.11.0 source release](https://pypi.org/project/gd.py/0.11.0/): `gd/official_levels.json` contains compressed original level strings. The importer records dataset and decoded-string SHA-256 hashes in `data/original-levels.js`. Back On Track has 1,545 objects, Polargeist 1,531, Dry Out 1,444, Base After Base 2,146, and Cant Let Go 1,704.
- [GD programming level decoding](https://github.com/gd-programming/gd.docs/blob/main/docs/topics/levelstring_encoding_decoding.md) and [object properties](https://github.com/gd-programming/gd.docs/blob/main/docs/resources/client/level-components/level-object.md): gzip/base64 decoding, original object IDs, center coordinates, flips, rotations and scales.
- [Object catalog](https://github.com/flowvix/gd-info-explorer/blob/main/src/lib/objects.csv): IDs 1–7 are square solids, 8 is a spike, 9 is a black pit hazard, 39 is a half spike, 40/62/68 are slabs, 35/67/140 are pads, 36 is a yellow orb, 10/11 are gravity portals, and 12/13 are cube/ship portals. The archived exported levels represent their three collectibles as ID 1329.
- [Reverse-engineered ship rotation](https://github.com/camila314/gdp/blob/2.2/PlayerObject/PlayerObject_updateShipRotation.cpp), [jump motion](https://github.com/camila314/gdp/blob/2.2/PlayerObject/PlayerObject_updateJump.cpp), and [solid collision](https://github.com/camila314/gdp/blob/2.2/PlayerObject/PlayerObject_collidedWithObjectInternal.cpp): ships face along their trajectory, control vertical acceleration, and resolve horizontal solid faces.
- [Measured ship parameters](https://github.com/CarlosDev-max/gdsolver-FORK/blob/main/dp/src/models/ship_params.hpp) and [cube/collision constants](https://github.com/CarlosDev-max/gdsolver-FORK/blob/main/dp/src/dp/constants.hpp): 240-Hz integration, 30-unit cube, full-size jump impulse 11.18, cube gravity step 0.216, yellow pad impulse 16, ship vertical caps 8/-6.4, four acceleration branches. These are converted using 54 world units per second per GD velocity unit.

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

## Explicit limits

The coordinates match the archived source data. Physics is a documented browser implementation of the normal cube and ship mechanics, not a binary-identical port of RobTop's engine. Rectangular solid bounds, slab thicknesses, orb impulse and portal corridor placement are adapter definitions; no native-game frame-by-frame parity is claimed. Decoration/color/enter-effect/trail triggers from the original visual theme are replaced by Minecraft scenery. A 600-unit empty finish runout follows the furthest imported object; this is an adapter choice, not decoded official finish timing. The music is original synthesis, not the official songs.

Geometry Dash level data belongs to RobTop Games. The gd.py code's license does not imply ownership of RobTop's level layouts. No original sprites, music or executable were copied. This is an unofficial fan adaptation. The import script accepts a supplied original-level dataset and is reproducible without downloading or executing third-party code.

## Verification

`node --test --test-isolation=none tests/voxelDash.test.js` checks one-to-one geometry, original portal positions, floor/ceiling sliding, lift-off, fatal walls/spikes/pits, forward ship orientation, localized portals, pads/orbs, pause, checkpoint restoration and deterministic journals. `node scripts/verify-voxel-dash-courses.mjs` searches paths using only the jump button and replays each successful path sequentially.
