// A minimal big-endian NBT reader, browser-safe by construction.
//
// Why not a library: `prismarine-nbt` is the obvious candidate and is not usable here. Its first line is
// `const zlib = require('zlib')`, `parseAs()` calls `zlib.gunzipSync` and demands a Node `Buffer`, so in a
// browser it needs a bundler shim for both. This file is ~120 lines, has no imports at all, and gzips via
// the platform's `DecompressionStream` when the caller asks for it.
//
// Scope: the tags a structure template actually uses, plus the long-array tags so a general reader does
// not throw on modern data. Tag values map to plain JS so consumers need no NBT knowledge:
//
//   TAG_Byte/Short/Int -> number      TAG_Long -> BigInt     (a long does not fit a double)
//   TAG_Float/Double   -> number      TAG_String -> string
//   TAG_Byte_Array     -> Uint8Array  TAG_Int_Array -> Int32Array  TAG_Long_Array -> BigInt64Array
//   TAG_List           -> array       TAG_Compound -> plain object
//
// Longs are BigInt on purpose: a loot seed or a UUID is a 64-bit value and would silently lose its low
// bits as a double, which is the class of bug the tile-entity path cannot afford.

export const TagType = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12
};

export const TAG_NAMES = Object.fromEntries(Object.entries(TagType).map(([name, id]) => [id, name]));

/** True when the bytes start with the gzip magic, i.e. the template is compressed. */
export function isGzipped(bytes) {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Inflate gzip bytes with the platform's own decompressor.
 *
 * Node 18+ and every current browser expose `DecompressionStream`, so this stays dependency-free; the
 * async signature is unavoidable because the API is stream-based.
 */
export async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('gzip compression needs DecompressionStream; pass decompressed bytes instead');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read a `.nbt` buffer, transparently inflating it when it is gzipped. */
export async function readNbtAuto(bytes) {
  return readNbt(isGzipped(bytes) ? await gunzip(bytes) : bytes);
}

/**
 * Parse uncompressed NBT.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {{ name: string, value: any, type: number }}
 */
export function readNbt(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const u8 = () => { const v = view.getUint8(offset); offset += 1; return v; };
  const i8 = () => { const v = view.getInt8(offset); offset += 1; return v; };
  const i16 = () => { const v = view.getInt16(offset); offset += 2; return v; };
  const u16 = () => { const v = view.getUint16(offset); offset += 2; return v; };
  const i32 = () => { const v = view.getInt32(offset); offset += 4; return v; };
  const i64 = () => { const v = view.getBigInt64(offset); offset += 8; return v; };
  const f32 = () => { const v = view.getFloat32(offset); offset += 4; return v; };
  const f64 = () => { const v = view.getFloat64(offset); offset += 8; return v; };
  const text = (length) => {
    const slice = bytes.subarray(offset, offset + length);
    offset += length;
    return new TextDecoder('utf-8').decode(slice);
  };

  function readPayload(type) {
    switch (type) {
      case TagType.BYTE: return i8();
      case TagType.SHORT: return i16();
      case TagType.INT: return i32();
      case TagType.LONG: return i64();
      case TagType.FLOAT: return f32();
      case TagType.DOUBLE: return f64();
      case TagType.BYTE_ARRAY: {
        const length = i32();
        const out = bytes.slice(offset, offset + length);
        offset += length;
        return out;
      }
      case TagType.STRING: return text(u16());
      case TagType.LIST: {
        const elementType = u8();
        const length = i32();
        // A list of TAG_End is how vanilla writes an empty list; the length is then 0 and no payload
        // follows, so ignoring the type is safe but reading it keeps the cursor honest.
        const out = [];
        for (let i = 0; i < length; i++) out.push(readPayload(elementType));
        return out;
      }
      case TagType.COMPOUND: {
        const out = {};
        for (;;) {
          const childType = u8();
          if (childType === TagType.END) break;
          const childName = text(u16());
          out[childName] = readPayload(childType);
        }
        return out;
      }
      case TagType.INT_ARRAY: {
        const length = i32();
        const out = new Int32Array(length);
        for (let i = 0; i < length; i++) out[i] = i32();
        return out;
      }
      case TagType.LONG_ARRAY: {
        const length = i32();
        const out = new BigInt64Array(length);
        for (let i = 0; i < length; i++) out[i] = i64();
        return out;
      }
      default:
        throw new Error(`unsupported NBT tag type ${type} (${TAG_NAMES[type] ?? 'unknown'}) at byte ${offset}`);
    }
  }

  const rootType = u8();
  if (rootType === TagType.END) return { name: '', value: null, type: TagType.END };
  const name = text(u16());
  const value = readPayload(rootType);
  if (offset !== bytes.length) {
    // Trailing bytes mean the parse and the file disagree, which is worth knowing about rather than
    // silently ignoring: a structure template is one root tag and nothing else.
    throw new Error(`NBT parse ended at byte ${offset} of ${bytes.length}`);
  }
  return { name, value, type: rootType };
}

/**
 * Write uncompressed NBT. Only used by tests and by the Inspector's fixture exporter, but a reader with
 * no writer cannot be round-trip tested, and a round-trip test is the cheapest proof the reader is right.
 */
export function writeNbt({ name = '', value, type = TagType.COMPOUND }) {
  const chunks = [];
  const encoder = new TextEncoder();
  const push = (bytes) => chunks.push(bytes);
  const num = (size, write) => {
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    write(view);
    push(new Uint8Array(buffer));
  };

  function writePayload(tagType, tagValue) {
    switch (tagType) {
      case TagType.BYTE: num(1, (v) => v.setInt8(0, tagValue)); break;
      case TagType.SHORT: num(2, (v) => v.setInt16(0, tagValue)); break;
      case TagType.INT: num(4, (v) => v.setInt32(0, tagValue)); break;
      case TagType.LONG: num(8, (v) => v.setBigInt64(0, BigInt(tagValue))); break;
      case TagType.FLOAT: num(4, (v) => v.setFloat32(0, tagValue)); break;
      case TagType.DOUBLE: num(8, (v) => v.setFloat64(0, tagValue)); break;
      case TagType.STRING: {
        const encoded = encoder.encode(tagValue);
        num(2, (v) => v.setUint16(0, encoded.length));
        push(encoded);
        break;
      }
      case TagType.BYTE_ARRAY: {
        num(4, (v) => v.setInt32(0, tagValue.length));
        push(new Uint8Array(tagValue));
        break;
      }
      case TagType.INT_ARRAY: {
        num(4, (v) => v.setInt32(0, tagValue.length));
        for (const entry of tagValue) writePayload(TagType.INT, entry);
        break;
      }
      case TagType.LONG_ARRAY: {
        num(4, (v) => v.setInt32(0, tagValue.length));
        for (const entry of tagValue) writePayload(TagType.LONG, entry);
        break;
      }
      case TagType.LIST: {
        const elementType = tagValue.length > 0 ? inferType(tagValue[0]) : TagType.END;
        push(new Uint8Array([elementType]));
        num(4, (v) => v.setInt32(0, tagValue.length));
        for (const entry of tagValue) writePayload(elementType, entry);
        break;
      }
      case TagType.COMPOUND: {
        for (const key of Object.keys(tagValue)) {
          // Insertion order is preserved, so a round-trip compares equal key order too.
          const childType = inferType(tagValue[key]);
          push(new Uint8Array([childType]));
          writePayload(TagType.STRING, key);
          writePayload(childType, tagValue[key]);
        }
        push(new Uint8Array([TagType.END]));
        break;
      }
      default:
        throw new Error(`cannot write NBT tag type ${tagType}`);
    }
  }

  push(new Uint8Array([type]));
  writePayload(TagType.STRING, name);
  writePayload(type, value);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) { out.set(chunk, cursor); cursor += chunk.length; }
  return out;
}

/** Best-effort tag type for a JS value, used by the writer above. */
export function inferType(value) {
  if (typeof value === 'bigint') return TagType.LONG;
  if (typeof value === 'string') return TagType.STRING;
  if (typeof value === 'boolean') return TagType.BYTE;
  if (typeof value === 'number') return Number.isInteger(value) && Math.abs(value) < 2 ** 31 ? TagType.INT : TagType.DOUBLE;
  if (value instanceof Uint8Array) return TagType.BYTE_ARRAY;
  if (value instanceof Int32Array) return TagType.INT_ARRAY;
  if (value instanceof BigInt64Array) return TagType.LONG_ARRAY;
  if (Array.isArray(value)) return TagType.LIST;
  if (value && typeof value === 'object') return TagType.COMPOUND;
  throw new Error(`cannot infer an NBT tag for ${value}`);
}
