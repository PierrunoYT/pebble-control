// Renders the Pebble Control icon at every size Windows uses and writes:
//   build/icon.ico        installer and executable icon (16 to 256 px)
//   build/icon.png        256 px reference and window icon
//   src/assets/tray.png   32 px tray icon
// Run with `npm run icon`. No image libraries: pixels are computed directly
// with 4x4 supersampling for smooth edges.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const ACID = [0xc9, 0xf5, 0x5a];
const INK = [0x11, 0x12, 0x0f];
const PANEL = [0x1c, 0x1d, 0x18];
const HIGHLIGHT = [0xe4, 0xff, 0x9a];

// Signed distance helpers in unit coordinates (0 to 1 across the icon).
function roundedRect(x, y, half, radius) {
  const dx = Math.abs(x - 0.5) - (half - radius);
  const dy = Math.abs(y - 0.5) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function circle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

// Colour of one sample point, with alpha, for the full icon (tray variant
// drops the background so it reads on any taskbar colour).
function shade(x, y, { background }) {
  let colour = [0, 0, 0, 0];
  const blend = (rgb, coverage) => {
    const a = Math.min(Math.max(coverage, 0), 1);
    colour = [
      rgb[0] * a + colour[0] * (1 - a),
      rgb[1] * a + colour[1] * (1 - a),
      rgb[2] * a + colour[2] * (1 - a),
      a + colour[3] * (1 - a)
    ];
  };
  if (background) blend(PANEL, 1 - roundedRect(x, y, 0.5, 0.22) * 64);
  // The pebble: a slightly squashed disc with a soft top-left highlight.
  const pebble = circle(x, (y - 0.5) * 1.12 + 0.5, 0.5, 0.52, background ? 0.31 : 0.46);
  blend(ACID, 1 - pebble * 64);
  const glow = circle(x, y, background ? 0.41 : 0.36, background ? 0.42 : 0.38, background ? 0.1 : 0.15);
  if (pebble < 0) blend(HIGHLIGHT, (1 - glow * 12) * 0.55);
  // Dark cone dot, offset like the brand mark in the window.
  const dot = circle(x, y, background ? 0.44 : 0.42, background ? 0.5 : 0.48, background ? 0.085 : 0.13);
  blend(INK, 1 - dot * 64);
  return colour;
}

function render(size, options) {
  const samples = 4;
  const rows = [];
  for (let py = 0; py < size; py += 1) {
    const row = [0];
    for (let px = 0; px < size; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const [cr, cg, cb, ca] = shade((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size, options);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = samples * samples;
      row.push(a ? Math.round(r / a) : 0, a ? Math.round(g / a) : 0, a ? Math.round(b / a) : 0, Math.round((a / n) * 255));
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat(rows);
}

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

function png(size, options) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(render(size, options), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ICO container with PNG-compressed entries, which Windows Vista and later read.
function ico(sizes, options) {
  const images = sizes.map((size) => ({ size, data: png(size, options) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  images.forEach(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

function write(relative, data) {
  const target = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  console.log(`Wrote ${relative} (${data.length} bytes)`);
}

write('build/icon.ico', ico([16, 24, 32, 48, 64, 128, 256], { background: true }));
write('build/icon.png', png(256, { background: true }));
write('src/assets/icon.png', png(256, { background: true }));
write('src/assets/tray.png', png(32, { background: false }));
