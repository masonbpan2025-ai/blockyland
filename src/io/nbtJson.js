// NBT values <-> JSON, for storing block-entity data inside a Building Library entry.
//
// The NBT reader gives longs as BigInt and arrays as typed arrays, and JSON can hold neither: JSON.stringify throws
// on a BigInt and turns an Int32Array into an object with "0", "1"... keys. Each is written as a one-key marker
// object instead, and read back to exactly what the reader produced. Numeric tag types (byte vs int) are not
// here; they travel separately as an `nbtTypes` map (see readNbt's typeMap).

const MARKERS = { $long: (v) => BigInt(v), $ints: (v) => Int32Array.from(v), $bytes: (v) => Uint8Array.from(v), $longs: (v) => BigInt64Array.from(v.map(BigInt)) };

export function encodeNbtJson(value) {
  if (typeof value === 'bigint') return { $long: value.toString() };
  if (value instanceof Int32Array) return { $ints: Array.from(value) };
  if (value instanceof Uint8Array) return { $bytes: Array.from(value) };
  if (value instanceof BigInt64Array) return { $longs: Array.from(value, (v) => v.toString()) };
  if (Array.isArray(value)) return value.map(encodeNbtJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeNbtJson(v)]));
  return value;
}

export function decodeNbtJson(value) {
  if (Array.isArray(value)) return value.map(decodeNbtJson);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && MARKERS[keys[0]]) return MARKERS[keys[0]](value[keys[0]]);
    return Object.fromEntries(keys.map((k) => [k, decodeNbtJson(value[k])]));
  }
  return value;
}
