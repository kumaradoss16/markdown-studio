#!/usr/bin/env node

/**
 * Release 1.0 SHA-256 Checksum Generator
 * Computes cryptographically secure SHA-256 checksums for all release binaries and distributables.
 * Usage: node scripts/generate-checksums.js [targetDir] [outputFile]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const targetDir = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.join(ROOT_DIR, 'dist');
const outputFile = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : path.join(targetDir, 'checksums.txt');

console.log(`🔐 Computing SHA-256 release checksums for: ${targetDir}`);

if (!fs.existsSync(targetDir)) {
  console.error(`Target directory does not exist: ${targetDir}`);
  process.exit(1);
}

function computeFileSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const entries = fs.readdirSync(targetDir, { withFileTypes: true });
const checksumLines = [];

for (const entry of entries) {
  if (entry.isFile() && entry.name !== 'checksums.txt' && !entry.name.endsWith('.map')) {
    const filePath = path.join(targetDir, entry.name);
    const hash = computeFileSha256(filePath);
    checksumLines.push(`${hash}  ${entry.name}`);
    console.log(`  ✓ ${entry.name} (${hash.slice(0, 16)}...)`);
  }
}

if (checksumLines.length === 0) {
  console.warn('⚠️ No release binaries found in target directory.');
} else {
  fs.writeFileSync(outputFile, checksumLines.join('\n') + '\n', 'utf-8');
  console.log(`\n📄 Generated checksums at: ${outputFile}`);
}

process.exit(0);
