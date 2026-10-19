# Minecraft import/export references

What each reference contributed, and — just as important — **which claims in this subsystem have not been
checked against one**. §1 of the mission lists the projects to study; this file records what was actually taken
from them and what is still resting on memory.

## A note on how these were used

This pass ran without network access to the specifications themselves, so the format details implemented here
come from two places: the NBT reader already in this repository (`src/worldgen/nbt.js`, itself written from the
format's structure), and knowledge of the formats. That is enough to write a codec that round-trips through its
own reader and writer, and **not** enough to claim it matches a real client.

Everything unverified is marked below and in [MINECRAFT_IO_PARITY.md](MINECRAFT_IO_PARITY.md) — no format is
marked `VERIFIED`, and the reason is in the same sentence.

## Java Edition

### `PrismarineJS/prismarine-nbt`
**The obvious choice, and not usable here.** Its first line is `const zlib = require('zlib')`, `parseAs()`
demands a Node `Buffer`, and it has no browser build; this project has **two** dependencies in total and no
bundler shim for Node builtins. The existing `src/worldgen/nbt.js` was written instead, and `src/io/nbt.js`
extends that approach: tags map to plain JS values, compression goes through the platform's
`DecompressionStream`/`CompressionStream`, and there are no imports at all.

*Contribution:* the value mapping and the tag list were confirmed against its documented behaviour. *Status:*
not a dependency; no code copied.

### `PrismarineJS/prismarine-chunk`, `prismarine-world`, `minecraft-data`
Should be the reference for Java chunk codecs and for the block/state tables of each version. `minecraft-data`
publishes per-version block tables and is the intended source for a future palette migration, but this project
has no dependency on it and no network access to fetch it, so **no DataVersion-to-DataVersion block migration
exists** and none is claimed.

*Status:* not used yet. This is the single largest gap for real version conversion.

### `PrismarineJS/prismarine-schematic`
Studied as the shape of a Sponge implementation. This project implements `.schem` directly in `codecs.js`
because the repository's NBT layer already existed and the format is small — importing a parser that needs a
bundler shim would have cost more than it saved.

*Status:* the Sponge codec is ours; round-trip tested against our own reader, **not** against
`prismarine-schematic`'s output. That cross-check is the cheapest next verification step available offline.

### `Querz/NBT` and `Querz/mcaselector`
The reference for region files: the 8 KiB location table, per-chunk timestamps, the compression byte, chunk
lengths, `DataVersion` handling, and POI/entity regions. **Nothing here is implemented yet** — no `.mca` reader
or writer exists — so these are the references to read before Phase 6, not sources used already.

### `SpongePowered/Schematic-Specification`
The specification for `.schem`. Implemented here, in each version's own layout: v2's flat `Palette`, `PaletteMax`,
`BlockData`, `BlockEntities`, `Entities`; v3's `Schematic` compound with `Blocks: { Palette, Data, BlockEntities }`,
`Entities` and `Data` sub-compounds; and `Version`, `DataVersion`, `Width`/`Height`/`Length` (read as unsigned),
`Offset`, `Metadata` in both.

**Verified against the specification text (versions/schematic-2.md and schematic-3.md) and WorldEdit's
`SpongeSchematicV3Writer.java`:** the field names, both layouts, and the block ordering (`x + z * Width + y * Width
* Length`, which is our y-z-x loop). A v3 file assembled field by field from the specification is a test fixture.
**Still not verified:** a file actually exported by WorldEdit; add one to `tests/fixtures/io/` when available.

### `maruohon/litematica`
The reference for `.litematic`: `Version`, `MinecraftDataVersion`, `Metadata`, and multiple `Regions` each with
`Position`, `Size`, a `BlockStatePalette` and packed `BlockStates` (bit-packed long arrays, not varints).
**Implemented: nothing.** The canonical model already carries several regions with their own origins, so the
shape is ready; the codec is not written, and the packed-long-bit layout is the part that must be read from the
reference rather than recalled.

## Bedrock Edition

Official Creator documentation is the reference for `.mcstructure`, `.mcworld`, `.mcpack`, `.mcaddon`,
`.mctemplate`, `.mcproject`, `manifest.json` and the internal world layout. **None of it is implemented.**

The two details that decide the whole Bedrock structure codec, and that must be read rather than recalled:

1. **The `block_indices` ordering.** Bedrock indexes its palette by axis order that differs from Sponge's, and a
   wrong guess produces a structure that round-trips through our own code and is scrambled in the game.
2. **`block_position_data`** is keyed by index into `block_indices`, with block entity data nested under it —
   a different shape from both Sponge's list and vanilla's per-block tag.

`PrismarineJS/bedrock-provider` is the reference for LevelDB access, which in a browser is a further problem
(the format is a log-structured store, not a file format, and needs either a JS implementation or a shim).

**Little-endian NBT is already implemented and tested**, which is the part of Bedrock that could be done without
a real file. That is deliberate: it is the one piece that does not depend on unverified layout claims.

## Ecosystem and cross-edition

### `Amulet-Team` (world-format/conversion architecture)
The architectural reference for this whole subsystem, and the one actually followed. Amulet separates an external
format, an internal universal representation, and target serialisation, and it treats the universal layer's
expressive range as the thing that decides what can be converted. That is why the canonical model here has
structured warnings, why it stores semantic block states rather than ids, and why anything it cannot represent is
reported at import rather than dropped at export.

*No Python was ported.* The value taken is the separation of concerns and the assumption that conversion loses
information, which has to be tracked rather than discovered.

## Licensing

| Project | Licence | Used how |
| --- | --- | --- |
| prismarine-* | MIT | behaviour and format shape only; no code copied |
| Querz/NBT, mcaselector | MIT (verify per repository) | reference only; nothing implemented yet |
| Amulet | GPL-3.0 (verify per component) | architecture only; no code copied, which matters given the licence |
| litematica | GPL-3.0 | reference only; nothing implemented yet |
| Sponge specification | CC-BY-SA / public specification | field names and semantics; no text copied |

No Mojang assets are stored, generated or redistributed by any of this code. The fixtures under
`tests/fixtures/io/` are produced by our own writers from a description in the test file, except
`worldedit_house.schem`, which was written by the official WorldEdit CLI 7.4.7 after loading and copying
`house.schem`; it is our own test build, not Mojang content.

## Verified against WorldEdit

The official standalone WorldEdit CLI 7.4.7 (`worldedit-cli-7.4.7-SNAPSHOT-dist.jar`, from the
[EngineHub build server](https://builds.enginehub.org/job/worldedit)) was run with no Minecraft server:

- The studio's 5x4x5 house loaded with no warnings, `//count`/`//distr` matched (81 non-air blocks: 30 oak
  planks, 25 stone bricks, 25 bricks, 1 glass), and `//copy` + `//schem save` produced a file that matches the
  studio's own block for block.
- Every built-in library building loaded with exactly the expected non-air block count.
- The 144,053-block `ivy_stone_castle_claudeOpus5p5.schem` loaded with exactly 144,053 non-air blocks.
- The stateful fixture exposed a real incompatibility: WorldEdit requires `Pos` and `Rotation` on every entity
  and aborts the whole load when `Rotation` is missing. The writer now supplies the identity rotation and forces
  the FLOAT type; WorldEdit loads the fixture and preserves the pig.

## What to verify next, in order of value

1. **A vanilla `.nbt` structure from a real world's `structures/` directory** — confirms the palette and
   `blocks`/`entities` shapes against Mojang's own writer.
2. **Loading our exported `.nbt` in a real client** (§37) — the only thing that can promote any row of the
   matrix above `FUNCTIONAL`.
3. **`minecraft-data` block tables** for the target versions, which is the prerequisite for any real DataVersion
   migration.
