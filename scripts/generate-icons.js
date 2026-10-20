#!/usr/bin/env node

/**
 * MarkForge Markdown Studio - Multi-Resolution Windows & Platform Icon Generator
 * Generates transparent 32-bit RGBA icons across all standard Windows resolutions:
 *  - 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256 px
 * Combines them into a compliant, transparent icon.ico and app-icon.ico bundle.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_PNG = path.join(ROOT_DIR, 'public', 'markforge-icon.png');
const ICONS_DIR = path.join(ROOT_DIR, 'src-tauri', 'icons');

console.log('🎨 Generating multi-resolution application icons for MarkForge Markdown Studio...');

if (!fs.existsSync(SOURCE_PNG)) {
  console.error(`❌ Source logo not found at: ${SOURCE_PNG}`);
  process.exit(1);
}

// 1. Run tauri icon generator to generate platform assets
try {
  execSync(`npx tauri icon "${SOURCE_PNG}" -o "${ICONS_DIR}"`, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
} catch (err) {
  console.error('❌ Failed running tauri icon command:', err.message);
  process.exit(1);
}

// 2. Read existing icon.ico and inject missing 128x128 standard resolution
const icoPath = path.join(ICONS_DIR, 'icon.ico');
const png128Path = path.join(ICONS_DIR, '128x128.png');

if (fs.existsSync(icoPath) && fs.existsSync(png128Path)) {
  const icoBuf = fs.readFileSync(icoPath);
  const count = icoBuf.readUInt16LE(4);
  const existingImages = [];

  for (let i = 0; i < count; i++) {
    const dirOffset = 6 + i * 16;
    const w = icoBuf[dirOffset] || 256;
    const h = icoBuf[dirOffset + 1] || 256;
    const size = icoBuf.readUInt32LE(dirOffset + 8);
    const offset = icoBuf.readUInt32LE(dirOffset + 12);
    const data = icoBuf.slice(offset, offset + size);
    existingImages.push({ width: w, height: h, data });
  }

  // Ensure 128x128 resolution is present
  if (!existingImages.some(img => img.width === 128)) {
    const png128 = fs.readFileSync(png128Path);
    existingImages.push({ width: 128, height: 128, data: png128 });
  }

  // Sort ascending by width
  existingImages.sort((a, b) => a.width - b.width);

  const numImages = existingImages.length;
  const headerSize = 6 + numImages * 16;
  let currentOffset = headerSize;

  const entries = [];
  for (const img of existingImages) {
    const entry = Buffer.alloc(16);
    entry[0] = img.width >= 256 ? 0 : img.width;
    entry[1] = img.height >= 256 ? 0 : img.height;
    entry[2] = 0; // color count (0 = >= 256 colors)
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel (32-bit RGBA)
    entry.writeUInt32LE(img.data.length, 8); // image size
    entry.writeUInt32LE(currentOffset, 12); // image offset
    entries.push(entry);
    currentOffset += img.data.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(numImages, 4);

  const finalIco = Buffer.concat([header, ...entries, ...existingImages.map(img => img.data)]);
  fs.writeFileSync(icoPath, finalIco);
  fs.writeFileSync(path.join(ICONS_DIR, 'app-icon.ico'), finalIco);

  console.log(`✓ Assembled 32-bit multi-resolution Windows ICO (${finalIco.length} bytes, ${numImages} resolutions: ${existingImages.map(i => i.width + 'x' + i.height).join(', ')})`);
}

console.log('✅ All application icons generated successfully.\n');
