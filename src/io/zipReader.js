// Lightweight, zero-dependency ZIP archive reader for browser and Node.js.
// Supports both Stored (0) and Deflate (8) compression methods using native DecompressionStream.

/**
 * Reads a Uint8Array or ArrayBuffer as a ZIP archive and extracts its files.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<Record<string, Uint8Array>>} Map of relative file paths to their decompressed bytes
 */
export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // 1. Locate End of Central Directory Record (EOCD) by scanning backwards from end
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;
  const maxSearch = Math.min(bytes.length, 65557); // Max comment length 65535 + 22 bytes EOCD
  for (let i = bytes.length - 22; i >= bytes.length - maxSearch; i--) {
    if (view.getUint32(i, true) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Not a valid ZIP archive: End of Central Directory signature not found');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const files = {};
  let cursor = cdOffset;

  const textDecoder = new TextDecoder('utf-8');

  // 2. Parse Central Directory headers
  for (let i = 0; i < totalEntries && cursor < bytes.length; i++) {
    const sig = view.getUint32(cursor, true);
    if (sig !== 0x02014b50) break; // Central directory file header signature

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraFieldLength = view.getUint16(cursor + 30, true);
    const fileCommentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const fileNameBytes = bytes.subarray(cursor + 46, cursor + 46 + fileNameLength);
    const rawFileName = textDecoder.decode(fileNameBytes).replace(/\\/g, '/');

    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;

    // Skip directory entries
    if (rawFileName.endsWith('/')) continue;

    // 3. Locate data via Local File Header
    const localSig = view.getUint32(localHeaderOffset, true);
    if (localSig !== 0x04034b50) {
      throw new Error(`Corrupt ZIP archive: Local file header mismatch for ${rawFileName}`);
    }

    const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
    const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);

    // 4. Decompress file content
    if (compressionMethod === 0) {
      // Stored (no compression)
      files[rawFileName] = compressedData.slice();
    } else if (compressionMethod === 8) {
      // Deflate compression
      if (typeof globalThis.DecompressionStream === 'function') {
        const stream = new Blob([compressedData]).stream().pipeThrough(new globalThis.DecompressionStream('deflate-raw'));
        const decompressedBuffer = await new Response(stream).arrayBuffer();
        files[rawFileName] = new Uint8Array(decompressedBuffer);
      } else {
        throw new Error('DecompressionStream is not supported in this environment');
      }
    } else {
      console.warn(`[zipReader] Unsupported compression method ${compressionMethod} for ${rawFileName}`);
    }
  }

  return files;
}

/**
 * Creates a minimal ZIP archive in memory (Store method) from a map of filename -> Uint8Array/string.
 * Compatible with standard ZIP tools.
 */
export function createSimpleZip(fileMap) {
  const encoder = new TextEncoder();
  const fileEntries = [];
  let offset = 0;

  for (const [name, content] of Object.entries(fileMap)) {
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const nameBytes = encoder.encode(name);
    fileEntries.push({ name, nameBytes, data, offset });
    offset += 30 + nameBytes.length + data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;

  for (const entry of fileEntries) {
    cdSize += 46 + entry.nameBytes.length;
  }

  const totalLength = cdOffset + cdSize + 22;
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  let pos = 0;

  // Write Local File Headers + File Data
  for (const entry of fileEntries) {
    entry.offset = pos;
    view.setUint32(pos, 0x04034b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2; // version needed
    view.setUint16(pos, 0, true); pos += 2; // general purpose flags
    view.setUint16(pos, 0, true); pos += 2; // compression = 0 (stored)
    view.setUint16(pos, 0, true); pos += 2; // mod time
    view.setUint16(pos, 0, true); pos += 2; // mod date
    view.setUint32(pos, 0, true); pos += 4; // crc32
    view.setUint32(pos, entry.data.length, true); pos += 4; // compressed size
    view.setUint32(pos, entry.data.length, true); pos += 4; // uncompressed size
    view.setUint16(pos, entry.nameBytes.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2; // extra field length
    buffer.set(entry.nameBytes, pos); pos += entry.nameBytes.length;
    buffer.set(entry.data, pos); pos += entry.data.length;
  }

  // Write Central Directory Headers
  for (const entry of fileEntries) {
    view.setUint32(pos, 0x02014b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2; // version made by
    view.setUint16(pos, 20, true); pos += 2; // version needed
    view.setUint16(pos, 0, true); pos += 2; // flags
    view.setUint16(pos, 0, true); pos += 2; // compression = 0
    view.setUint16(pos, 0, true); pos += 2; // mod time
    view.setUint16(pos, 0, true); pos += 2; // mod date
    view.setUint32(pos, 0, true); pos += 4; // crc32
    view.setUint32(pos, entry.data.length, true); pos += 4;
    view.setUint32(pos, entry.data.length, true); pos += 4;
    view.setUint16(pos, entry.nameBytes.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2; // extra length
    view.setUint16(pos, 0, true); pos += 2; // comment length
    view.setUint16(pos, 0, true); pos += 2; // disk start
    view.setUint16(pos, 0, true); pos += 2; // internal file attributes
    view.setUint32(pos, 0, true); pos += 4; // external file attributes
    view.setUint32(pos, entry.offset, true); pos += 4; // relative offset
    buffer.set(entry.nameBytes, pos); pos += entry.nameBytes.length;
  }

  // Write End of Central Directory Record
  view.setUint32(pos, 0x06054b50, true); pos += 4;
  view.setUint16(pos, 0, true); pos += 2; // disk number
  view.setUint16(pos, 0, true); pos += 2; // cd start disk
  view.setUint16(pos, fileEntries.length, true); pos += 2; // entries on disk
  view.setUint16(pos, fileEntries.length, true); pos += 2; // total entries
  view.setUint32(pos, cdSize, true); pos += 4; // size of cd
  view.setUint32(pos, cdOffset, true); pos += 4; // cd offset
  view.setUint16(pos, 0, true); pos += 2; // comment length

  return buffer;
}
