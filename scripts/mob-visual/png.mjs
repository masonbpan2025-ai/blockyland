/**
 * Minimal PNG decode/encode, for reading texture atlases and writing inspection images.
 *
 * Why hand-rolled: the texture layouts have to be MEASURED, not guessed. The project has no image library in its
 * dependency set, and the browser round-trip used earlier needed the dev server up and a page that Vite kept
 * serving stale. A pure-Node decoder removes both problems and makes the layout readable from the bytes directly.
 *
 * Supports the forms Minecraft's own assets use: 8-bit truecolour with or without alpha, greyscale, palette and
 * greyscale+alpha, non-interlaced. Adam7 interlacing is rejected rather than silently mis-decoded.
 */
import { inflateSync, deflateSync } from 'node:zlib';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Per-scanline filter distance in bytes per pixel channel count. */
const bpp = (channels) => channels;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG into { width, height, rgba } where `rgba` is a Buffer of width*height*4.
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('not a PNG');

  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null;
  let transparency = null;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }

  if (interlace !== 0) throw new Error('interlaced PNG is not supported');
  if (![1, 2, 4, 8].includes(bitDepth)) throw new Error(`unsupported bit depth ${bitDepth}`);

  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));

  // Unfilter first, on the RAW byte layout: the filter distance is the byte distance to the pixel on the left,
  // which for sub-byte depths is a whole byte rather than a pixel. Minecraft's block textures are commonly 4-bit
  // palette, so getting this right matters.
  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const step = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= step ? cur[x - step] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= step ? prev[x - step] : 0;
      const v = line[x];
      cur[x] = (filter === 0 ? v
        : filter === 1 ? v + a
          : filter === 2 ? v + b
            : filter === 3 ? v + ((a + b) >> 1)
              : filter === 4 ? v + paeth(a, b, c)
                : (() => { throw new Error(`bad filter ${filter}`); })()) & 0xff;
    }
  }

  // Read one sample of `bitDepth` bits at sample index `i`, scaled to 0..255 as PNG requires.
  const sampleAt = (rowStart, index) => {
    if (bitDepth === 8) return out[rowStart + index];
    const perByte = 8 / bitDepth;
    const byte = out[rowStart + Math.floor(index / perByte)];
    const shift = 8 - bitDepth * ((index % perByte) + 1);
    const mask = (1 << bitDepth) - 1;
    const value = (byte >> shift) & mask;
    // 1/2/4-bit greyscale and palette indices are scaled up; palette indices are NOT (they are lookups).
    return bitDepth === 1 ? value * 255
      : bitDepth === 2 ? value * 85
        : colorType === 3 ? value : value * 17;
  };

  // Expand to RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x++) {
      let r, g, b, a = 255;
      if (colorType === 3) {
        const idx = sampleAt(rowStart, x);
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
        a = transparency && idx < transparency.length ? transparency[idx] : 255;
      } else if (colorType === 0) {
        r = g = b = sampleAt(rowStart, x);
      } else if (colorType === 4) {
        r = g = b = sampleAt(rowStart, x * 2);
        a = sampleAt(rowStart, x * 2 + 1);
      } else if (colorType === 2) {
        r = sampleAt(rowStart, x * 3); g = sampleAt(rowStart, x * 3 + 1); b = sampleAt(rowStart, x * 3 + 2);
      } else {
        r = sampleAt(rowStart, x * 4); g = sampleAt(rowStart, x * 4 + 1);
        b = sampleAt(rowStart, x * 4 + 2); a = sampleAt(rowStart, x * 4 + 3);
      }
      const i = (y * width + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
    }
  }

  return { width, height, rgba };
}

/** One filter byte (0 = None) per scanline, then the raw RGBA bytes. */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode { width, height, rgba } as an 8-bit RGBA PNG. */
export function encodePng({ width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_MAGIC,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Scale an image by an integer factor with nearest-neighbour sampling, and optionally draw a labelled grid every
 * `cell` source pixels plus a margin. Nearest-neighbour keeps individual texels crisp, which is the whole point.
 */
export function magnify(image, { scale = 8, cell = 0, margin = 30 } = {}) {
  const { width, height, rgba } = image;
  const outW = width * scale + margin;
  const outH = height * scale + margin;
  const out = Buffer.alloc(outW * outH * 4);
  // Background so the margin and any transparent texels are distinguishable.
  for (let i = 0; i < outW * outH; i++) {
    out[i * 4] = 0x20; out[i * 4 + 1] = 0x24; out[i * 4 + 2] = 0x2c; out[i * 4 + 3] = 255;
  }
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= outW || y >= outH) return;
    const i = (y * outW + x) * 4;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          put(margin + x * scale + dx, margin + y * scale + dy,
            rgba[si], rgba[si + 1], rgba[si + 2], rgba[si + 3]);
        }
      }
    }
  }
  if (cell > 0) {
    // Major lines every 4 cells (16px on a 64px atlas), minor every cell, plus tick marks in the margin.
    for (let x = 0; x <= width; x += cell) {
      const major = x % (cell * 4) === 0;
      for (let y = 0; y < outH; y++) {
        if (!major && y % 4 !== 0) continue;
        const px = margin + x * scale;
        const i = (y * outW + Math.min(px, outW - 1)) * 4;
        out[i] = major ? 0xff : 0x60; out[i + 1] = major ? 0x40 : 0x80; out[i + 2] = major ? 0x40 : 0xc0;
      }
      if (major) {
        // A 1px tick at the top of the margin, and a solid block whose length encodes the coordinate / 4.
        for (let t = 0; t < 3; t++) put(Math.min(margin + x * scale + t, outW - 1), Math.max(0, margin - 4 - t), 0xff, 0x60, 0x60, 255);
      }
    }
    for (let y = 0; y <= height; y += cell) {
      const major = y % (cell * 4) === 0;
      for (let x = 0; x < outW; x++) {
        if (!major && x % 4 !== 0) continue;
        const py = margin + y * scale;
        const i = (Math.min(py, outH - 1) * outW + x) * 4;
        out[i] = major ? 0xff : 0x60; out[i + 1] = major ? 0x40 : 0x80; out[i + 2] = major ? 0x40 : 0xc0;
      }
      if (major) for (let t = 0; t < 3; t++) put(Math.max(0, margin - 4 - t), Math.min(margin + y * scale + t, outH - 1), 0xff, 0x60, 0x60, 255);
    }
  }
  return { width: outW, height: outH, rgba: out };
}

/** Every `cell`x`cell` block that is fully opaque, plus the average colour, so face rectangles can be checked. */
export function opaqueCells(image, cell = 8, threshold = 200) {
  const { width, height, rgba } = image;
  const cells = [];
  for (let cy = 0; cy + cell <= height; cy += cell) {
    for (let cx = 0; cx + cell <= width; cx += cell) {
      let solid = true, r = 0, g = 0, b = 0;
      for (let y = cy; y < cy + cell && solid; y++) {
        for (let x = cx; x < cx + cell; x++) {
          const i = (y * width + x) * 4;
          if (rgba[i + 3] < threshold) { solid = false; break; }
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2];
        }
      }
      const n = cell * cell;
      if (solid) cells.push({ x: cx, y: cy, r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) });
    }
  }
  return cells;
}
