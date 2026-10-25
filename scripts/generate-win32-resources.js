import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const WIN32_DIR = path.join(ROOT_DIR, 'src-win32');

if (!fs.existsSync(DIST_DIR)) {
  console.error('Error: dist/ directory does not exist. Run npm run build first.');
  process.exit(1);
}

// Recursively find all files in dist/
function getAllFiles(dir, base = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item.endsWith('.exe') || item.endsWith('.zip') || item.endsWith('.txt')) {
      continue;
    }
    const fullPath = path.join(dir, item);
    const relPath = path.join(base, item).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

const files = getAllFiles(DIST_DIR);
console.log(`Found ${files.length} built web assets in dist/`);

// Generate resource IDs starting at 200
let resourceH = `#pragma once

#define IDI_APP_ICON 101
#define IDR_MANIFEST 1

// Embedded Web Assets
`;

let resourceRc = `#include "resource.h"
#include "version.h"
#include <windows.h>

IDI_APP_ICON ICON "app.ico"

// Version Information
VS_VERSION_INFO VERSIONINFO
FILEVERSION APP_VERSION_MAJOR,APP_VERSION_MINOR,APP_VERSION_PATCH,APP_VERSION_BUILD
PRODUCTVERSION APP_VERSION_MAJOR,APP_VERSION_MINOR,APP_VERSION_PATCH,APP_VERSION_BUILD
FILEFLAGSMASK 0x3fL
#ifdef _DEBUG
FILEFLAGS 0x1L
#else
FILEFLAGS 0x0L
#endif
FILEOS 0x40004L
FILETYPE 0x1L
FILESUBTYPE 0x0L
BEGIN
    BLOCK "StringFileInfo"
    BEGIN
        BLOCK "040904b0"
        BEGIN
            VALUE "CompanyName", APP_COMPANY
            VALUE "FileDescription", APP_NAME
            VALUE "FileVersion", APP_VERSION_STRING
            VALUE "InternalName", "markdown-studio"
            VALUE "LegalCopyright", APP_COPYRIGHT
            VALUE "OriginalFilename", "markdown-studio.exe"
            VALUE "ProductName", APP_NAME
            VALUE "ProductVersion", APP_VERSION_STRING
        END
    END
    BLOCK "VarFileInfo"
    BEGIN
        VALUE "Translation", 0x409, 1200
    END
END

// Embedded Web Assets
`;

let embeddedH = `#pragma once
#include "resource.h"

struct EmbeddedAsset {
    int resourceId;
    const wchar_t* relativePath;
};

static const EmbeddedAsset g_embeddedAssets[] = {
`;

files.forEach((file, index) => {
  const idNum = 200 + index;
  const macroName = `IDR_ASSET_${index}`;
  resourceH += `#define ${macroName} ${idNum}\n`;

  // Escape backslashes for RC
  const normalizedPath = file.fullPath.replace(/\\/g, '/');
  resourceRc += `${macroName} RCDATA "${normalizedPath}"\n`;

  const winRelPath = file.relPath.replace(/\//g, '\\\\');
  embeddedH += `    { ${macroName}, L"${winRelPath}" },\n`;
});

embeddedH += `};\n\nstatic const size_t g_embeddedAssetCount = sizeof(g_embeddedAssets) / sizeof(g_embeddedAssets[0]);\n`;

fs.writeFileSync(path.join(WIN32_DIR, 'resource.h'), resourceH, 'utf8');
fs.writeFileSync(path.join(WIN32_DIR, 'resource.rc'), resourceRc, 'utf8');
fs.writeFileSync(path.join(WIN32_DIR, 'embedded_assets.h'), embeddedH, 'utf8');

console.log('Successfully generated resource.h, resource.rc, and embedded_assets.h');
