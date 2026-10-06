// NBT: Named Binary Tag, read and write, both endiannesses, with security limits.
//
// WHY THIS IS SEPARATE FROM src/worldgen/nbt.js. That reader exists, is tested, and is deliberately
// big-endian-only, read-only, and minimal -- it loads structure templates and nothing else. Import/export needs
// the other three quadrants of that matrix (writing, little-endian for Bedrock, and limits suitable for
// untrusted input), and adding them behind flags to a module the world generator depends on would put the
// generator's data at risk of every change made here. This module is therefore self-contained, and the two
// agree on the tag ids and the JS value mapping so a value can move between them without translation:
//
//   TAG_Byte/Short/Int -> number      TAG_Long -> BigInt     (a long does not fit a double)
//   TAG_Float/Double   -> number      TAG_String -> string
//   TAG_Byte_Array     -> Uint8Array  TAG_Int_Array -> Int32Array  TAG_Long_Array -> BigInt64Array
//   TAG_List           -> array       TAG_Compound -> plain object
//
// THE ROOT IS ALWAYS A COMPOUND NAMED ''. That is what the format requires: a file is one tag, and Minecraft's
// writers always use a compound with an empty name.
//
// SECURITY IS A FIRST-CLASS CONCERN HERE, because every byte this module sees came from a file a user
// downloaded. A 20-byte NBT file can declare a list of four billion elements, and a nested compound can recurse
// until the stack dies; both are cheap to write and both are refused below by LIMITS rather than by luck.

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

/**
 * Defaults chosen to accept every real Minecraft file and refuse the hostile ones.
 *
 * `maxDepth` is generous for real data: an item's components nest a handful deep, and the deepest vanilla
 * structures are well under 20. `maxElements` caps a single list or array, which is where a decompression bomb
 * shows up after the fact -- 16 million entries is far above any legitimate structure palette while keeping the
 * worst case bounded at a few tens of megabytes.
 */
export const NBT_LIMITS = {
  maxDepth: 64,
  maxElements: 16 * 1024 * 1024,
  maxStringLength: 1024 * 1024,
  maxBytes: 512 * 1024 * 1024
};

export class NbtError extends Error {}

function checkLength(length, limits, what) {
  if (length < 0) throw new NbtError(`${what} has a negative length (${length}): the file is corrupt`);
  if (length > limits.maxElements) {
    throw new NbtError(`${what} declares ${length} elements, above the limit of ${limits.maxElements}`);
  }
}

// --- reading --------------------------------------------------------------------------------

/**
 * Read one NBT tag from a byte array.
 *
 * @param {Uint8Array} bytes
 * @param {object} [options]
 * @param {boolean} [options.littleEndian] Bedrock writes little-endian; Java writes big-endian
 * @param {boolean} [options.withName]      return `{ name, value }` instead of the bare value
 * @param {object}  [options.limits]
 */
export function readNbt(bytes, { littleEndian = false, withName = false, limits = NBT_LIMITS } = {}) {
  if (!bytes || typeof bytes.length !== 'number') throw new NbtError('readNbt needs a byte array');
  if (bytes.length > limits.maxBytes) throw new NbtError(`input is ${bytes.length} bytes, above the limit`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const need = (count, what) => {
    if (offset + count > bytes.length) {
      throw new NbtError(`unexpected end of NBT while reading ${what} at byte ${offset}`);
    }
  };
  const u8 = () => { need(1, 'a byte'); return view.getUint8(offset++); };
  const i16 = () => { need(2, 'a short'); const v = view.getInt16(offset, littleEndian); offset += 2; return v; };
  const u16 = () => { need(2, 'a short'); const v = view.getUint16(offset, littleEndian); offset += 2; return v; };
  const i32 = () => { need(4, 'an int'); const v = view.getInt32(offset, littleEndian); offset += 4; return v; };
  const i64 = () => { need(8, 'a long'); const v = view.getBigInt64(offset, littleEndian); offset += 8; return v; };
  const f32 = () => { need(4, 'a float'); const v = view.getFloat32(offset, littleEndian); offset += 4; return v; };
  const f64 = () => { need(8, 'a double'); const v = view.getFloat64(offset, littleEndian); offset += 8; return v; };
  const str = () => {
    const length = u16();
    if (length > limits.maxStringLength) throw new NbtError(`string of ${length} bytes is above the limit`);
    need(length, 'a string');
    // NBT strings are modified UTF-8; TextDecoder handles the bytes Minecraft actually writes.
    const text = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + length));
    offset += length;
    return text;
  };

  const readPayload = (type, depth) => {
    if (depth > limits.maxDepth) throw new NbtError(`NBT nested deeper than ${limits.maxDepth} levels`);
    switch (type) {
      case TagType.BYTE: return view.getInt8((offset++, offset - 1));
      case TagType.SHORT: return i16();
      case TagType.INT: return i32();
      case TagType.LONG: return i64();
      case TagType.FLOAT: return f32();
      case TagType.DOUBLE: return f64();
      case TagType.STRING: return str();
      case TagType.BYTE_ARRAY: {
        const length = i32();
        checkLength(length, limits, 'a byte array');
        need(length, 'a byte array');
        const out = bytes.slice(offset, offset + length);
        offset += length;
        return out;
      }
      case TagType.INT_ARRAY: {
        const length = i32();
        checkLength(length, limits, 'an int array');
        need(length * 4, 'an int array');
        const out = new Int32Array(length);
        for (let i = 0; i < length; i++) out[i] = i32();
        return out;
      }
      case TagType.LONG_ARRAY: {
        const length = i32();
        checkLength(length, limits, 'a long array');
        need(length * 8, 'a long array');
        const out = new BigInt64Array(length);
        for (let i = 0; i < length; i++) out[i] = i64();
        return out;
      }
      case TagType.LIST: {
        const elementType = u8();
        const length = i32();
        checkLength(length, limits, 'a list');
        // A list of END is how the format spells an empty list, and it has no payloads to read.
        if (elementType === TagType.END) return [];
        const out = new Array(length);
        for (let i = 0; i < length; i++) out[i] = readPayload(elementType, depth + 1);
        return out;
      }
      case TagType.COMPOUND: {
        const out = {};
        for (;;) {
          const childType = u8();
          if (childType === TagType.END) return out;
          const name = str();
          out[name] = readPayload(childType, depth + 1);
        }
      }
      default:
        throw new NbtError(`unknown tag type ${type} at byte ${offset}`);
    }
  };

  const rootType = u8();
  if (rootType === TagType.END) throw new NbtError('the file is empty NBT (a bare TAG_End)');
  const name = str();
  const value = readPayload(rootType, 0);
  return withName ? { name, value, type: rootType, bytesRead: offset } : value;
}

/** Bounds-checked read of a list, so a caller never indexes a hostile file's promises. */
export function listOf(value, name = 'list') {
  if (!Array.isArray(value)) throw new NbtError(`${name} is not an NBT list`);
  return value;
}

// --- writing --------------------------------------------------------------------------------

/** Growable byte sink. `Number` rather than a stream because every file this module writes is bounded. */
class ByteWriter {
  constructor() {
    this.buffer = new Uint8Array(1024);
    this.length = 0;
    this.view = new DataView(this.buffer.buffer);
  }
  ensure(extra) {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }
  u8(value) { this.ensure(1); this.view.setUint8(this.length, value); this.length += 1; }
  i8(value) { this.ensure(1); this.view.setInt8(this.length, value); this.length += 1; }
  i16(value) { this.ensure(2); this.view.setInt16(this.length, value, this.littleEndian); this.length += 2; }
  u16(value) { this.ensure(2); this.view.setUint16(this.length, value, this.littleEndian); this.length += 2; }
  i32(value) { this.ensure(4); this.view.setInt32(this.length, value, this.littleEndian); this.length += 4; }
  i64(value) { this.ensure(8); this.view.setBigInt64(this.length, BigInt(value), this.littleEndian); this.length += 8; }
  f32(value) { this.ensure(4); this.view.setFloat32(this.length, value, this.littleEndian); this.length += 4; }
  f64(value) { this.ensure(8); this.view.setFloat64(this.length, value, this.littleEndian); this.length += 8; }
  str(value) {
    const encoded = new TextEncoder().encode(String(value));
    if (encoded.length > 0xffff) throw new NbtError('NBT strings cannot exceed 65535 bytes');
    this.u16(encoded.length);
    this.ensure(encoded.length);
    this.buffer.set(encoded, this.length);
    this.length += encoded.length;
  }
  bytes(array) {
    this.ensure(array.length);
    this.buffer.set(array, this.length);
    this.length += array.length;
  }
  toUint8Array() { return this.buffer.slice(0, this.length); }
}

/** The tag id a JS value should be written as. Explicit types win; guessing is documented, not silent. */
function typeOf(value, explicit) {
  if (explicit !== undefined && explicit !== null) return explicit;
  if (value === null || value === undefined) return TagType.END;
  if (typeof value === 'boolean') return TagType.BYTE;
  if (typeof value === 'bigint') return TagType.LONG;
  if (typeof value === 'number') return Number.isInteger(value) ? TagType.INT : TagType.DOUBLE;
  if (typeof value === 'string') return TagType.STRING;
  if (value instanceof Uint8Array) return TagType.BYTE_ARRAY;
  if (value instanceof Int32Array) return TagType.INT_ARRAY;
  if (value instanceof BigInt64Array) return TagType.LONG_ARRAY;
  if (Array.isArray(value)) return TagType.LIST;
  if (typeof value === 'object') return TagType.COMPOUND;
  throw new NbtError(`cannot write a value of type ${typeof value} as NBT`);
}

/**
 * Write one NBT tag.
 *
 * @param {*} value                       the root value, normally a plain object (a compound)
 * @param {object} [options]
 * @param {boolean} [options.littleEndian] Bedrock
 * @param {string} [options.rootName]      the root compound's name; '' is what Minecraft writes
 * @param {number} [options.rootType]      override the root tag type
 * @param {object} [options.types]         per-key type overrides, for the cases guessing cannot know:
 *                                         `{ 'DataVersion': TagType.INT }`. A DOUBLE that holds a whole
 *                                         number would otherwise be written as an INT, which real files do
 *                                         distinguish, so callers that care pass the table.
 */
export function writeNbt(value, { littleEndian = false, rootName = '', rootType = null, types = {}, limits = NBT_LIMITS } = {}) {
  const writer = new ByteWriter();
  writer.littleEndian = littleEndian;

  const writePayload = (type, payload, path, depth) => {
    if (depth > limits.maxDepth) throw new NbtError(`refusing to write NBT deeper than ${limits.maxDepth} levels`);
    switch (type) {
      case TagType.BYTE: writer.i8(payload === true ? 1 : payload === false ? 0 : payload); return;
      case TagType.SHORT: writer.i16(payload); return;
      case TagType.INT: writer.i32(payload); return;
      case TagType.LONG: writer.i64(payload); return;
      case TagType.FLOAT: writer.f32(payload); return;
      case TagType.DOUBLE: writer.f64(payload); return;
      case TagType.STRING: writer.str(payload); return;
      case TagType.BYTE_ARRAY: {
        checkLength(payload.length, limits, `byte array at ${path}`);
        writer.i32(payload.length);
        writer.bytes(payload);
        return;
      }
      case TagType.INT_ARRAY: {
        checkLength(payload.length, limits, `int array at ${path}`);
        writer.i32(payload.length);
        for (const value of payload) writer.i32(value);
        return;
      }
      case TagType.LONG_ARRAY: {
        checkLength(payload.length, limits, `long array at ${path}`);
        writer.i32(payload.length);
        for (const value of payload) writer.i64(value);
        return;
      }
      case TagType.LIST: {
        checkLength(payload.length, limits, `list at ${path}`);
        // The element type is the first element's, which is the format's rule: lists are homogeneous.
        const elementType = payload.length === 0
          ? TagType.END
          : typeOf(payload[0], (types[`${path}[0]`]));
        writer.u8(elementType);
        writer.i32(payload.length);
        payload.forEach((item, index) => writePayload(elementType, item, `${path}[${index}]`, depth + 1));
        return;
      }
      case TagType.COMPOUND: {
        for (const [key, child] of Object.entries(payload)) {
          const childPath = path ? `${path}.${key}` : key;
          const childType = typeOf(child, types[childPath]);
          if (childType === TagType.END) continue; // null means "absent", which is how the format spells it
          writer.u8(childType);
          writer.str(key);
          writePayload(childType, child, childPath, depth + 1);
        }
        writer.u8(TagType.END);
        return;
      }
      default:
        throw new NbtError(`cannot write tag type ${type} (${path || 'root'})`);
    }
  };

  const resolvedRootType = rootType ?? typeOf(value);
  writer.u8(resolvedRootType);
  writer.str(rootName);
  writePayload(resolvedRootType, value, '', 0);
  return writer.toUint8Array();
}

// --- compression ----------------------------------------------------------------------------

/** True when the bytes are a gzip member (Java `.nbt` structures are usually gzipped). */
export function isGzipped(bytes) {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** True when the bytes are a zlib stream (Java region chunks use zlib, not gzip). */
export function isZlib(bytes) {
  return bytes.length > 2 && (bytes[0] & 0x0f) === 0x08 && ((bytes[0] << 8) + bytes[1]) % 31 === 0;
}

async function streamThrough(bytes, format, kind) {
  const Ctor = kind === 'decompress' ? globalThis.DecompressionStream : globalThis.CompressionStream;
  if (typeof Ctor !== 'function') {
    throw new NbtError(`${format} ${kind}ion needs ${kind === 'decompress' ? 'DecompressionStream' : 'CompressionStream'}`);
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const gunzip = (bytes) => streamThrough(bytes, 'gzip', 'decompress');
export const gzip = (bytes) => streamThrough(bytes, 'gzip', 'compress');
export const inflate = (bytes) => streamThrough(bytes, 'deflate', 'decompress');
export const deflate = (bytes) => streamThrough(bytes, 'deflate', 'compress');

/**
 * Read NBT from bytes that may be gzipped, zlib-deflated, or raw, choosing by content rather than by name.
 *
 * Content sniffing rather than file extension is a requirement of the import path: a `.dat` from a save, a
 * `.nbt` from a structure and a chunk payload from an `.mca` are all NBT, and users rename files constantly.
 */
export async function readNbtAuto(bytes, { littleEndian = false, limits = NBT_LIMITS } = {}) {
  let payload = bytes;
  if (isGzipped(payload)) payload = await gunzip(payload);
  else if (isZlib(payload)) payload = await inflate(payload);
  if (payload.length > limits.maxBytes) {
    throw new NbtError(`NBT is ${payload.length} bytes after decompression, above the ${limits.maxBytes}-byte limit`);
  }
  return readNbt(payload, { littleEndian, limits });
}
