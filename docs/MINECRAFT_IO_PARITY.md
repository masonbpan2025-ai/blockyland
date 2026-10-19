# Minecraft import/export parity

Target: **Java Edition 1.21.4** (DataVersion **4189**) and **Bedrock 1.21.40** (format version `1.21.40`), the
same Java target the structure work pins. Nothing here claims universal version support: §39 is explicit that
version compatibility needs tests, and only the versions listed under "version coverage" have any.

The format table below is kept in step with `IO_FORMATS` in [codecs.js](../src/io/codecs.js), and
`tests/ioStructures.test.js` asserts that the table declares every format named in the mission. A status here
that the code does not support is a bug in this document.

## Status vocabulary

`NOT STARTED` · `PARTIAL` · `READ ONLY` · `WRITE ONLY` · `FUNCTIONAL` · `NEAR PARITY` · `VERIFIED`

Only `FUNCTIONAL` is claimed anywhere, and it means: implemented in both directions, exercised by a round-trip
test through the canonical form, and validated by our own readers. **Nothing is `VERIFIED`**, because `VERIFIED`
means a file produced here was loaded by a real Minecraft client, and no Minecraft client exists in this
environment. The gap between `FUNCTIONAL` and `VERIFIED` is exactly the gap a user should know about before
trusting an export.

## The matrix

| Format | Edition | Importer | Exporter | Blocks | Block States | Biomes | Entities | Block Entities | Inventories | Lighting | Structures | Metadata | Dimensions | Version Conversion | Round-trip Tested | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sponge `.schem` v3 | Java | yes | yes | yes | yes | no | yes | yes | via block entity NBT | no | yes (one region) | yes | n/a | DataVersion carried, compared and warned | yes | **FUNCTIONAL** |
| Sponge `.schem` v2 | Java | yes | yes | yes | yes | no | yes | yes | via block entity NBT | no | yes | yes | n/a | as above | yes | **FUNCTIONAL** |
| Vanilla Java `.nbt` structure | Java | yes | yes | yes | yes | no | yes | yes | via block entity NBT | no | yes | author | n/a | DataVersion carried, compared and warned | yes | **FUNCTIONAL** |
| Bedrock `.mcstructure` | Bedrock | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Legacy MCEdit `.schematic` | Java | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Litematica `.litematic` | Java | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Java Anvil `.mca` | Java | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Java world (directory/ZIP) | Java | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Bedrock LevelDB world | Bedrock | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Bedrock `.mcworld` | Bedrock | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Bedrock `.mcpack` | Bedrock | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Bedrock `.mcaddon` | Bedrock | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Bedrock `.mctemplate` | Bedrock | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Bedrock `.mcproject` | Bedrock | no | no | — | — | — | — | — | — | — | — | — | — | — | no | NOT STARTED |
| Java resource pack | Java | read | no | — | — | — | — | — | — | — | — | — | — | — | yes | SUPPORTED (texture packs & presets) |
| Java data pack | Java | read | no | — | — | — | — | — | — | — | — | — | — | — | yes | SUPPORTED |

A format that is `NOT STARTED` is still **recognised**: `detectFormat` names it and `importStructure` refuses it
with "recognised but not implemented" rather than "unknown file", which is what lets an import dialog say
something useful about a `.mcworld` today.

## What the three implemented formats actually do

**Blocks and block states.** Semantic and namespaced everywhere: `minecraft:oak_stairs` with
`facing=north, half=bottom, waterlogged=false`. Numeric ids are never stored in the canonical model. Property
order is normalised, so two equal states compare equal and palettes are keyed by a stable string.

**Air is absence.** The canonical model does not store air blocks; each writer reintroduces the format's own way
of spelling a gap (Sponge needs an air palette entry and one varint per position; vanilla simply omits the block).
The Sponge writer's positional stream is the sharpest edge here and has its own test with a gap in the middle.

**Block entities.** Sponge keeps them in a separate list, vanilla keeps them on the block. The Sponge reader
reattaches them to their blocks, because without that the information survives a Sponge round trip and is lost
the moment anyone converts Sponge to Java.

**Entities.** Carried in canonical form for all three formats, including Sponge v2, whose specification has an
`Entities` list (an earlier version of this codec wrongly dropped them from v2 with a warning). An entity's type is
kept as `nbt.id`, as vanilla entity NBT spells it, whichever layout it came from.

**Sponge layouts.** v2 is flat (`Palette`, `BlockData`, extra data flattened into each block entity); v3 is an
unnamed root holding a `Schematic` compound, with `Blocks: { Palette, Data, BlockEntities }` and extra data in a
`Data` sub-compound. Each version is written in its own layout, matching WorldEdit 7.3's `SpongeSchematicV3Writer`.
The reader picks the layout by shape, not by `Version`, so files this codec once wrote as flat `Version: 3` still
open.

**Checked against real WorldEdit (2026-10-17).** Paper 1.21.4 build 232 with WorldEdit 7.3.19 on Java 21 (WorldEdit
7.4.x needs Java 25 and does not load on Paper 1.21.4). Building Studio's own export of every library building, as v3
and v2, loaded with no warning, and both WorldEdit's straight load-and-save and a paste-copy-save came back identical
block for block. A file with every game block in every facing loaded every 1.21.4 block exactly; WorldEdit replaced
with air only the 191 block types 1.21.4 does not have (shelves, copper chests, poplar wood and the other later
additions). The export now names those in chat. `sulfur_block`, the one name that is not vanilla in any version, now
exports as `minecraft:sulfur`. `tests/worldEditCompatibility.test.js` holds the result without a server, against
Mojang's 1.21.4 block registry (`tests/fixtures/minecraft/blocks-1.21.4.json`, names, properties and values).

**Biomes.** Not carried by any implemented format. Sponge v2 and v3 can express biomes; a file that carries them
reads with an `UNSUPPORTED_COMPONENT` warning that the biomes were not imported.

**Inventories.** Carried only as block-entity NBT, which is how all three formats represent a chest's contents.

**NBT tag types.** A JS number cannot say whether it was a byte, short, int, float or double, and Minecraft rejects the
wrong one (an item's `Slot` is a byte). The Sponge reader records every number's type by path (`readNbt`'s
`typeMap`) and keeps each block entity's and entity's as `nbtTypes`; the Sponge writer writes them back. Building
Studio stores block entities with their types, so a chest, sign or banner exports exactly as it was imported. The
vanilla `.nbt` codec carries them the same way (`blocks[].nbt`, `entities[].nbt`) and writes entity positions as
doubles, as the format requires.
There is no separate canonical inventory type yet, so an inventory can be preserved but not inspected or edited.

**Lighting.** Not carried by any structure format; it is a world concern and no world format is implemented.

**Version conversion.** `MinecraftVersion` records edition, game version, DataVersion and format version, and
`compareVersions` reports a mismatch instead of proceeding quietly. There is **no** palette migration between
DataVersions: a 1.16.5 structure read today is converted to a 1.21.4 file with a warning and no block id
translation, because a correct migration table is a large body of work that has not been done.

## Version coverage (§39)

| Version | DataVersion | Covered |
| --- | --- | --- |
| Java 1.21.4 (target) | 4189 | written and read by the fixtures |
| Java 1.21.3 / 1.21.1 / 1.21 | 4082 / 3955 / 3953 | recognised, warned about, not migrated |
| Java 1.20.x, 1.19.x, 1.18.x, 1.17.x, 1.16.5 | 3839 … 2586 | recognised, warned about, not migrated |
| Java 1.13.2, 1.12.2 | 1631, 1343 | recognised as legacy; legacy numeric ids are not mapped |
| Bedrock 1.21.40 | n/a | **not covered at all** — no Bedrock codec exists |

## Known losses and limitations, stated rather than discovered

1. **No real-Minecraft validation.** §37 is unmet. Every claim above rests on our own round-trip tests.
2. **No DataVersion migration.** Older structures are read with modern block names and warned about.
3. **Sponge biomes are not imported.** A file with biomes reads with a warning saying so.
4. **Multi-region structures** are modelled (`CanonicalStructure.regions`) but only the first region is written by
   any implemented exporter, so a Litematica file with several regions could not round-trip even once that codec
   exists.
5. **Inventories are opaque.** Preserved as NBT, not represented as a canonical type.
6. **No archive handling.** `.zip`, `.mcworld`, `.mcpack`, `.mcaddon` and `.mctemplate` need a ZIP reader with
   traversal and bomb protection (§20, §31); none is written, and the codecs do not accept archives.
7. **No Web Workers** (§33). Everything is synchronous on the caller's thread; the sizes involved so far are
   small, but a world import would freeze the page.
8. **No import/export UI** (§34, §35). The layer is callable and tested; nothing surfaces it in the game yet.
9. **Legacy numeric ids are unmapped.** `UNSUPPORTED_BLOCK` and `LEGACY_NUMERIC_ID` are declared warning codes and
   neither is produced by code that does not exist.

## How to re-derive this document

```
node --test tests/ioNbt.test.js tests/ioStructures.test.js   # 27 tests
node -e "import('./src/io/codecs.js').then(m => console.log(Object.values(m.IO_FORMATS).map(f => f.id + ': ' + f.status).join('\n')))"
```

The second command is the source of truth for the Status column; if it and the table disagree, the table is
wrong.
