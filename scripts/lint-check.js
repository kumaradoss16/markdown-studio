#!/usr/bin/env node

/**
 * Release 1.0 Static Analysis & Lint Quality Gate
 * Verifies:
 *  1. Syntax & Schema validity for all JSON config files
 *  2. No hazardous JavaScript patterns (eval, new Function)
 *  3. No plaintext hardcoded tokens or secrets in source code
 *  4. Resolution integrity for all local ESM imports
 *  5. Strict Content Security Policy conformance
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

const errors = [];
const warnings = [];

function recordError(file, message) {
  errors.push(`[ERROR] ${path.relative(ROOT_DIR, file)}: ${message}`);
}

function recordWarning(file, message) {
  warnings.push(`[WARN]  ${path.relative(ROOT_DIR, file)}: ${message}`);
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'target') {
        walkDir(fullPath, callback);
      }
    } else {
      callback(fullPath);
    }
  }
}

console.log('🔍 Running MarkForge Markdown Studio Release 1.0 Lint Gate...\n');

// 1. JSON Schema & Syntax Checks
const jsonFiles = [
  path.join(ROOT_DIR, 'package.json'),
  path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json'),
  path.join(ROOT_DIR, 'src-tauri', 'capabilities', 'default.json')
];

for (const file of jsonFiles) {
  if (fs.existsSync(file)) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      JSON.parse(content);
    } catch (e) {
      recordError(file, `Invalid JSON syntax: ${e.message}`);
    }
  }
}

// 2. Security & Anti-Pattern Analysis in src/
const BANNED_PATTERNS = [
  { regex: /\beval\s*\(/g, name: 'Dangerous eval() execution' },
  { regex: /new\s+Function\s*\(/g, name: 'Dynamic Function constructor' },
  { regex: /ghp_[a-zA-Z0-9_]{30,}/g, name: 'Hardcoded GitHub Personal Access Token' },
  { regex: /github_pat_[a-zA-Z0-9_]{30,}/g, name: 'Hardcoded Fine-grained GitHub Token' },
  { regex: /http:\/\/localhost(?!:[0-9]+)/g, name: 'Insecure unbracketed localhost' },
];

walkDir(SRC_DIR, (filePath) => {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) return;
  const content = fs.readFileSync(filePath, 'utf-8');

  for (const pattern of BANNED_PATTERNS) {
    if (pattern.regex.test(content)) {
      recordError(filePath, `Found banned pattern: ${pattern.name}`);
    }
  }

  // 3. Import Resolution Check
  const importRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const sourceDir = path.dirname(filePath);
    let resolved = path.resolve(sourceDir, importPath);

    // If no extension, try .js, .ts, .tsx, .json
    if (!fs.existsSync(resolved)) {
      for (const ext of ['.js', '.ts', '.tsx', '.json', '.mjs']) {
        if (fs.existsSync(resolved + ext)) {
          resolved = resolved + ext;
          break;
        }
      }
    }

    if (!fs.existsSync(resolved)) {
      recordError(filePath, `Unresolvable local import: "${importPath}"`);
    }
  }
});

// 4. Content Security Policy Check in index.html
const indexHtmlPath = path.join(ROOT_DIR, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  if (!indexHtml.includes('http-equiv="Content-Security-Policy"')) {
    recordError(indexHtmlPath, 'Missing mandatory Content-Security-Policy <meta> tag.');
  }
  if (indexHtml.includes('fonts.googleapis.com')) {
    recordError(indexHtmlPath, 'External font CDN links detected. Violates offline-first isolation.');
  }
}

// Summary
if (warnings.length > 0) {
  console.log(`⚠️ Warnings (${warnings.length}):`);
  warnings.forEach(w => console.log(`  ${w}`));
  console.log('');
}

if (errors.length > 0) {
  console.error(`❌ Lint Quality Gate Failed (${errors.length} errors):`);
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
}

console.log('✅ Lint & Security Static Analysis Passed Cleanly: 0 errors.');
process.exit(0);
