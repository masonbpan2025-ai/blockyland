# Minecraft import/export architecture

## The one rule

**No external format's names appear outside `src/io/`.** An importer reads a file into the canonical model, the
engine consumes the canonical model, and an exporter writes the canonical model out. A format detail that leaks
into the engine turns every new format into a change to the engine, and turns N formats into N² conversions.

That is Amulet's architecture, and it is adopted here deliberately: an **external format** is read into an
**internal universal representation**, and the universal representation is serialised to a **target format**.
Amulet's second lesson matters more than its first: the universal layer must be able to *represent* what the
source had before it can promise to write it back, so anything the canonical model cannot hold is a **warning at
import time**, not a surprise at export time.

## Module map

```
src/io/
  canonical.js   the canonical model, the version registry, conversion warnings, the provider interfaces
  nbt.js         NBT: read + write, big- and little-endian, gzip/zlib, with hard limits
  codecs.js      Sponge .schem, vanilla Java .nbt, detection, conversion, the runtime adapters
```

`nbt.js` is deliberately separate from `src/worldgen/nbt.js`, which is the world generator's reader. That one is
big-endian-only and read-only, and the generator depends on it; adding a writer and a Bedrock endianness behind
flags there would put generation at risk of every change made for import. The two agree on tag ids and on the
JS value mapping, so a value moves between them without translation.

## Layers

```
  file bytes
      |
      v
  [ container ]      zip / raw / (future) LevelDB      -- NOT WRITTEN
      |
      v
  [ codec ]          nbt.js + codecs.js                -- Sponge, Java structure: WRITTEN
      |
      v
  CanonicalStructure / CanonicalWorld
      |
      v
  [ codec ]          the target's writer
      |
      v
  file bytes
```

`detectFormat` sits beside the codecs and identifies a file by **content first**: the NBT root's own fields tell
Sponge (`Palette` + `Width` + `BlockData`) from vanilla (`size` + `palette` + `blocks`) from Bedrock
(`structure` + `format_version`) from Litematica (`Regions` + `Metadata`). The extension is used only when the
content cannot be read, which is the case for a gzipped file that has not been inflated yet — and users rename
downloads constantly, so content has to win whenever it can.

## The canonical model

| Type | Holds | Notes |
| --- | --- | --- |
| `CanonicalBlockState` | namespaced name + sorted properties | frozen; string identity is the palette key |
| `CanonicalRegion` | size, origin, blocks, block entities, entities, metadata | origin is kept because formats carry it |
| `CanonicalStructure` | name, regions, source version, metadata | one region today, several by design |
| `CanonicalWorld` | `getMetadata` / `getChunk` / `iterateChunks` / `close` | **interface only** |
| `CanonicalChunk` | x, z, dataVersion, status, sections, block entities, entities, biomes | **interface only** |
| `CanonicalSection` | y, palette, `stateAt`, `setState` | **interface only** |
| `CanonicalSection`/`Chunk`/`World` | — | no provider is written yet |

**Air is absence.** No canonical structure stores air blocks; each writer reintroduces its format's own spelling
of a gap. That choice removes an entire class of "is this air or is this missing" ambiguity from the model, at
the cost of every writer having to know the rule — which is stated in each one.

**Blocks are semantic.** `CanonicalBlockState('oak_stairs', { facing: 'north' })`, never an id. Numeric ids are
version- and edition-specific; a model holding them cannot convert between two Java versions, let alone editions.

**Interfaces before providers.** `CanonicalWorld` and friends are declared as the shape a provider must
implement, and nothing more is claimed. Declaring the interface first is what stops the Anvil provider from
inventing its own shape and forcing every consumer to learn it.

**Streaming is structural, not an optimisation.** §32 requires `open()`/`getChunk()`/`iterateChunks()`/`close()`
because a real save is gigabytes. A design that materialises a world cannot be fixed later without rewriting
every caller, so the interface has no `toArray()` and no `getAllChunks()`.

## Version identity

`MinecraftVersion` carries edition, game version, DataVersion and format version. `compareVersions` produces
`DATA_VERSION_MISMATCH` for anything that is not an exact match, including **cross-edition** conversion, which
gets its own message because block palettes are not interchangeable between Java and Bedrock at all.

There is no palette migration table. A 1.16.5 file imported today is read with modern block names and reported;
inventing a translation would be worse than reporting the gap, because a wrong block is silent corruption while a
warning is not. `JAVA_DATA_VERSIONS` holds the versions this project has actually looked at, and an unknown
DataVersion resolves to `gameVersion: null` rather than to a guess.

## Warnings as data

`WarningCollector` returns the reasons a conversion was lossy with the result, using the codes of §30
(`UNSUPPORTED_BLOCK`, `UNSUPPORTED_BLOCK_PROPERTY`, `UNKNOWN_ENTITY`, `UNKNOWN_BIOME`,
`UNSUPPORTED_BLOCK_ENTITY`, `UNSUPPORTED_DIMENSION_SETTING`, `UNSUPPORTED_COMPONENT`,
`DATA_VERSION_MISMATCH`, plus `LEGACY_NUMERIC_ID`, `TRUNCATED_VALUE` and `LIMIT_EXCEEDED`). The caller is a UI
that has to show the user what it is about to lose, and a test that has to assert it, so warnings travel *with*
the value instead of going to a log nobody reads.

## Security model (§31)

Every byte this layer sees is untrusted. The defences are in `nbt.js` and are enforced by limits rather than by
luck:

| Attack | Defence |
| --- | --- |
| Huge declared arrays/lists | the length is checked against `maxElements` **before** anything is allocated |
| Deep recursion (stack exhaustion) | `maxDepth` while reading and while writing |
| Decompression bomb | the inflated size is checked against `maxBytes` after inflating |
| Malformed varints | a 5-byte cap and an end-of-buffer check, both tested |
| Truncated files | every read is bounds-checked and names what it was reading |
| Unknown tag types | refused by number, never guessed |
| Enormous strings | `maxStringLength` before allocating |

Not yet defended, because the code does not exist: zip path traversal and zip bombs (no archive reader),
corrupt region headers and inconsistent chunk lengths (no Anvil reader), huge textures (no pack reader). No
imported content is ever executed as code; `.mcfunction` execution (§18) is not implemented at all.

## What a codec must do

1. Take `bytes` and a `WarningCollector`; return `{ structure, warnings }`.
2. Throw a *specific* error for a file it cannot read at all, and **warn** for content it can read but not
   represent.
3. Never guess a version, never invent a block, never silently drop a field the caller would care about.
4. Handle its own format's spelling of air.
5. Have a round-trip test with a gap, a property-carrying state, a block entity and an entity.

## Roadmap, in the order it should be done

| Phase | Work | Why this order |
| --- | --- | --- |
| done | NBT (read/write, both endiannesses), canonical structure, Sponge v2/v3, Java `.nbt`, detection, conversion | everything else stands on NBT and the canonical model |
| next | Bedrock `.mcstructure` | cheap once little-endian NBT exists; needs a real file to verify block-index order |
| next | Anvil reader (region header, zlib chunks, palettes, `DataVersion` dispatch) | first world format; unlocks real Java imports |
| then | Java world import/export (directory and ZIP, `level.dat`, dimensions) | needs Anvil plus an archive reader |
| then | Litematica, legacy `.schematic` reader | both are structure formats over the same canonical type |
| then | Resource packs, then data packs | asset delivery, not world data |
| last | Bedrock LevelDB, `.mcworld`, `.mcpack`, `.mcaddon`, `.mctemplate`, `.mcproject` | LevelDB in a browser is its own problem |

Not attempted at once, on purpose: each phase's codec extends the same three-module structure, and a phase that
cannot be verified against a real file is left `NOT STARTED` rather than half-written.
