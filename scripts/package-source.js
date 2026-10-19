#!/usr/bin/env node

/**
 * DevspireHub Markdown Studio - Source Code Packaging Script
 * Generates a clean, reproducible source-code.zip archive containing
 * only necessary application sources, omitting node_modules, build outputs,
 * native target binaries, git metadata, and local secrets.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-release',
  'build',
  'out',
  '.git',
  '.github',
  '.cache',
  'target',
  'coverage',
  '.system_generated',
  '.gemini',
  'test-expanded'
]);

const EXCLUDED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  'source-code.zip',
  'qa-report.json'
]);

function shouldInclude(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/');

  for (const seg of segments) {
    if (EXCLUDED_DIRS.has(seg)) {
      return false;
    }
  }

  const filename = segments[segments.length - 1];
  if (EXCLUDED_FILES.has(filename)) {
    return false;
  }

  if (filename.endsWith('.log') || filename.endsWith('.tmp') || filename.endsWith('.swp')) {
    return false;
  }

  return true;
}

function collectFiles(dir, baseDir = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      if (shouldInclude(relPath)) {
        results.push(...collectFiles(fullPath, baseDir));
      }
    } else if (entry.isFile()) {
      if (shouldInclude(relPath)) {
        results.push({
          fullPath,
          relPath: relPath.replace(/\\/g, '/')
        });
      }
    }
  }

  return results;
}

function createZipBuffer(fileList) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of fileList) {
    const nameBuf = Buffer.from(file.relPath, 'utf8');
    const content = fs.readFileSync(file.fullPath);
    const compressed = zlib.deflateRawSync(content);
    const crc = zlib.crc32(content);

    // Local Header (30 bytes + name length)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);          // Version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);      // General purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(8, 8);           // Compression: Deflate
    localHeader.writeUInt16LE(0, 10);          // File mod time
    localHeader.writeUInt16LE(0, 12);          // File mod date
    localHeader.writeUInt32LE(crc, 14);        // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(content.length, 22);    // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);    // Filename length
    localHeader.writeUInt16LE(0, 28);                 // Extra field length
    nameBuf.copy(localHeader, 30);

    // Central Directory Header (46 bytes + name length)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);          // Version made by
    centralHeader.writeUInt16LE(20, 6);          // Version needed
    centralHeader.writeUInt16LE(0x0800, 8);      // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(8, 10);          // Compression: Deflate
    centralHeader.writeUInt16LE(0, 12);          // File mod time
    centralHeader.writeUInt16LE(0, 14);          // File mod date
    centralHeader.writeUInt32LE(crc, 16);        // CRC-32
    centralHeader.writeUInt32LE(compressed.length, 20); // Compressed size
    centralHeader.writeUInt32LE(content.length, 24);    // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28);    // Filename length
    centralHeader.writeUInt16LE(0, 30);                 // Extra field length
    centralHeader.writeUInt16LE(0, 32);                 // Comment length
    centralHeader.writeUInt16LE(0, 34);                 // Disk number start
    centralHeader.writeUInt16LE(0, 36);                 // Internal file attributes
    centralHeader.writeUInt32LE(0x81a40000, 38);        // External file attributes (0644)
    centralHeader.writeUInt32LE(offset, 42);            // Relative offset of local header
    nameBuf.copy(centralHeader, 46);

    localHeaders.push(localHeader, compressed);
    centralHeaders.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const cdOffset = offset;
  const cdBuffer = Buffer.concat(centralHeaders);
  const cdSize = cdBuffer.length;

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // Signature
  eocd.writeUInt16LE(0, 4);                // Disk number
  eocd.writeUInt16LE(0, 6);                // Start disk number
  eocd.writeUInt16LE(fileList.length, 8);  // Entries on this disk
  eocd.writeUInt16LE(fileList.length, 10); // Total entries
  eocd.writeUInt32LE(cdSize, 12);          // Central directory size
  eocd.writeUInt32LE(cdOffset, 16);        // Central directory offset
  eocd.writeUInt16LE(0, 20);               // Comment length

  return Buffer.concat([...localHeaders, cdBuffer, eocd]);
}

export function packageSource(outPath = path.join(ROOT_DIR, 'dist-release', 'source-code.zip')) {
  console.log('📦 Scanning repository files for clean source code archive...');
  const files = collectFiles(ROOT_DIR);
  console.log(`✓ Collected ${files.length} source and configuration files.`);

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`🔒 Compressing clean source package into: ${outPath}...`);
  const zipBuffer = createZipBuffer(files);
  fs.writeFileSync(outPath, zipBuffer);

  const stats = fs.statSync(outPath);
  console.log(`✅ Successfully generated source-code.zip (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${files.length} files).`);
  return { outPath, size: stats.size, fileCount: files.length };
}

// Direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('package-source.js')) {
  const target = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : undefined;
  packageSource(target);
}
