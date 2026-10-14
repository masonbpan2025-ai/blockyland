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
| Sponge `.schem` v2 | Java | yes | yes | yes | yes | no | **no** (warns) | yes | via block entity NBT | no | yes | yes | n/a | as above | yes | **FUNCTIONAL** |
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

**Entities.** Carried in canonical form for all three formats, but Sponge v2 cannot represent them, so exporting
a structure with entities as v2 **warns** with `UNSUPPORTED_COMPONENT`.

**Biomes.** Not carried by any implemented format. Sponge v3 can express a biome palette; it is unimplemented and
the reader does not pretend otherwise.

**Inventories.** Carried only as block-entity NBT, which is how all three formats represent a chest's contents.
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
3. **Sponge biomes are read as nothing.** A v3 file with a `Biomes` array loses it, and the reader does not warn
   yet — it should.
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
