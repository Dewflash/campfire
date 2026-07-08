import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.join(process.cwd(), 'assets', 'tray');
fs.mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(rgba, width, x, y, alpha) {
  if (x < 0 || y < 0 || x >= width || y >= width) {
    return;
  }
  const index = (y * width + x) * 4;
  rgba[index] = 0;
  rgba[index + 1] = 0;
  rgba[index + 2] = 0;
  rgba[index + 3] = Math.max(rgba[index + 3], alpha);
}

function drawCircle(rgba, width, cx, cy, radius, alpha) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(rgba, width, x, y, alpha);
      }
    }
  }
}

function drawLine(rgba, width, x1, y1, x2, y2, thickness, alpha) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    drawCircle(rgba, width, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness / 2, alpha);
  }
}

function makeIcon(size, active) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 16;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const center = 0.5 + Math.sin((ny - 0.2) * Math.PI) * 0.045;
      const lower = Math.max(0, 1 - Math.abs(ny - 0.66) / 0.34);
      const upper = Math.max(0, 1 - Math.abs(ny - 0.32) / 0.28);
      const halfWidth = 0.055 + lower * 0.27 + upper * 0.08;
      const taper = ny > 0.82 ? (0.96 - ny) / 0.14 : 1;
      const insideOuter = ny > 0.1 && ny < 0.94 && Math.abs(nx - center) < halfWidth * Math.max(0, taper);
      const innerCenter = 0.48;
      const innerWidth = 0.04 + Math.max(0, 1 - Math.abs(ny - 0.68) / 0.18) * 0.12;
      const insideCutout = !active && ny > 0.48 && ny < 0.83 && Math.abs(nx - innerCenter) < innerWidth;
      if (insideOuter && !insideCutout) {
        setPixel(rgba, size, x, y, 255);
      }
    }
  }

  drawLine(rgba, size, 3.5 * s, 13.2 * s, 12.5 * s, 10.8 * s, 1.5 * s, 255);
  drawLine(rgba, size, 3.8 * s, 10.8 * s, 12.2 * s, 13.2 * s, 1.5 * s, 255);
  if (active) {
    drawCircle(rgba, size, 8 * s, 11.2 * s, 2.1 * s, 255);
  }

  return png(size, size, rgba);
}

const icons = [
  ['icon-Template.png', 16, false],
  ['icon-Template@2x.png', 32, false],
  ['icon-active-Template.png', 16, true],
  ['icon-active-Template@2x.png', 32, true],
];

for (const [fileName, size, active] of icons) {
  fs.writeFileSync(path.join(outDir, fileName), makeIcon(size, active));
  console.log(`wrote ${path.join('assets', 'tray', fileName)}`);
}
