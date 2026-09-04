// Generates src/assets/tray.png: a 32x32 acid-green pebble on a transparent
// background, matching the brand mark in the window. Run with `node scripts/make-tray-icon.js`.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 32;
const ACID = [0xc9, 0xf5, 0x5a];
const INK = [0x11, 0x12, 0x0f];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pixel(x, y) {
  const cx = SIZE / 2 - 0.5;
  const cy = SIZE / 2 - 0.5;
  const dx = (x - cx) / (SIZE / 2 - 1);
  const dy = (y - cy) / (SIZE / 2 - 1.5);
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > 1) return [0, 0, 0, 0];
  const edge = Math.min(1, (1 - distance) * (SIZE / 2));
  // A darker dot near the centre suggests the speaker cone.
  const dotDistance = Math.sqrt((dx + 0.15) ** 2 + (dy + 0.1) ** 2);
  const colour = dotDistance < 0.28 ? INK : ACID;
  return [...colour, Math.round(255 * edge)];
}

const rows = [];
for (let y = 0; y < SIZE; y += 1) {
  const row = [0];
  for (let x = 0; x < SIZE; x += 1) row.push(...pixel(x, y));
  rows.push(Buffer.from(row));
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // colour type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0))
]);

const target = path.join(__dirname, '..', 'src', 'assets', 'tray.png');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, png);
console.log(`Wrote ${target} (${png.length} bytes)`);
