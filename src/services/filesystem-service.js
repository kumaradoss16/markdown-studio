import { ErrorCode, StudioError } from './error-service.js';

/**
 * FileSystemService handles filesystem interactions with native Tauri 2 bridge
 * and provides a robust in-memory/localStorage fallback for environments where
 * Tauri native runtime is not attached or during frontend unit/integration testing.
 */
export class FileSystemService {
  constructor() {
    this.isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
    this.virtualStorage = new Map();
    this.fileMetadata = new Map();
    this.initializeDefaultWorkspace();
  }

  /**
   * Initializes virtual workspace files matching the reference workspace if not already present.
   */
  initializeDefaultWorkspace() {
    const habitatContent = `---
tags: [design, habitat, engineering, noforn, orcon]
status: approved
author: jt
classification: TOP SECRET // SCI
---

TOP SECRET // SCI // PERIHELION // NOFORN // ORCON

[CLEARANCE GRANTED // EYES ONLY // PERIHELION]

# Habitat Design
## Neo-Kyoto v8.27b サイバーシティ

RefDocs: [[Orbital Mechanics]] | [[System Architecture]] | [[Mission Briefing]]

![[habitat-render.png]]
*^A concept render of Neo-Kyoto Space Habitat*

<!-- Telemetry Quick-Metric HTML Grid -->
<div style="display: flex; gap: 12px; margin: 16px 0;">
  <div class="metric-card">
    <span class="label">Module Mass</span>
    <span class="val">18.4t</span>
  </div>
  <div class="metric-card">
    <span class="label">Crew Capacity</span>
    <span class="val">12 pax</span>
  </div>
  <div class="metric-card">
    <span class="label">Pressurized Vol.</span>
    <span class="val">148m³</span>
  </div>
</div>

## Floor Plan

The module utilizes an asymmetric bi-level torus configuration. Centrifugal spin locks provide 0.38G simulation on the Lower Deck perimeter.

* \`Upper Deck\`: Private Quarters (SLP 1-4), Avionics Core, Transit Hub.
* \`Lower Deck\`: Mess Galley, Hydroponic Garden, Exercise Gym & MedBay.
`;

    const marcusContent = `# Marcus Chen Dossier

**Role:** Chief Orbital Architect  
**Affiliation:** Neo-Kyoto Development Initiative  
**Clearance:** Level 4-Alpha  

## Background
Marcus Chen leads structural integration for the Perihelion Deep Space ring.
`;

    const mermaidContent = `# Mermaid Style Rules

Standard diagramming guidelines for system architecture and network topologies.

\`\`\`mermaid
flowchart TD
    A[Habitat Spine] --> B[Avionics Core]
    A --> C[Life Support Loop]
    B --> D[Telemetry Radio]
\`\`\`
`;

    const systemArchContent = `# System Architecture

Comprehensive overview of Habitation & Avionics bus and life support redundancies.
`;

    const orbitalContent = `# Orbital Mechanics

Calculations for 2.4 RPM rotational gravity and centrifugal station keeping.
`;

    this.virtualStorage.set('ExampleVault/Habitat Design.md', habitatContent);
    this.virtualStorage.set('ExampleVault/Marcus Chen.md', marcusContent);
    this.virtualStorage.set('ExampleVault/Mermaid Style Rules.md', mermaidContent);
    this.virtualStorage.set('ExampleVault/System Architecture.md', systemArchContent);
    this.virtualStorage.set('ExampleVault/Orbital Mechanics.md', orbitalContent);
    this.virtualStorage.set('ExampleVault/cyberWriter Guide.md', '# cyberWriter Guide\nWelcome to your documentation workspace.');
    this.virtualStorage.set('ExampleVault/Dr. Elena Vasquez.md', '# Dr. Elena Vasquez\nChief Medical Officer.');
    this.virtualStorage.set('ExampleVault/Entangled Labs.md', '# Entangled Labs\nPrimary contractor for quantum sensors.');
    this.virtualStorage.set('ExampleVault/Flashcard Demo.md', '# Flashcard Demo\nSpaced repetition documentation.');
    this.virtualStorage.set('ExampleVault/Mission Briefing.md', '# Mission Briefing\nPrimary orbital deployment objectives.');
    this.virtualStorage.set('ExampleVault/Mission Log.md', '# Mission Log\nTimestamped expedition logs.');

    for (const [path, content] of this.virtualStorage.entries()) {
      this.fileMetadata.set(path, {
        mtime: Date.now(),
        hash: this.computeSimpleHash(content),
        version: 1,
      });
    }
  }

  computeSimpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return 'h' + Math.abs(hash).toString(16);
  }

  /**
   * Reads a file at the given path.
   * @param {string} filePath
   * @returns {Promise<{ path: string, name: string, content: string, mtime: number, hash: string }>}
   */
  async readFile(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Invalid file path specified.');
    }

    if (filePath.includes('..')) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'Path traversal is strictly prohibited.');
    }

    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke('read_file', { path: filePath });
        return {
          path: res.path,
          name: res.name || this.getFileName(filePath),
          content: res.content,
          mtime: res.mtime || Date.now(),
          hash: res.hash || this.computeSimpleHash(res.content),
        };
      } catch (err) {
        throw new StudioError(ErrorCode.NOT_FOUND, `Failed to read file from native filesystem: ${err.message || err}`, err);
      }
    }

    // Virtual / Web storage fallback
    const content = this.virtualStorage.get(filePath);
    if (content === undefined) {
      throw new StudioError(ErrorCode.NOT_FOUND, `File not found: ${filePath}`);
    }

    const meta = this.fileMetadata.get(filePath) || { mtime: Date.now(), hash: this.computeSimpleHash(content), version: 1 };
    return {
      path: filePath,
      name: this.getFileName(filePath),
      content,
      mtime: meta.mtime,
      hash: meta.hash,
    };
  }

  /**
   * Safely writes a file to disk or virtual storage.
   * @param {string} filePath
   * @param {string} content
   * @param {string} [expectedHash]
   * @returns {Promise<{ success: boolean, path: string, hash: string, mtime: number }>}
   */
  async saveFile(filePath, content, expectedHash = null) {
    if (!filePath || typeof filePath !== 'string') {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'Target file path must be specified.');
    }

    if (filePath.includes('..')) {
      throw new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'Path traversal is strictly prohibited.');
    }

    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke('save_file', {
          path: filePath,
          content,
          expectedHash,
        });
        return {
          success: true,
          path: res.path,
          hash: res.hash,
          mtime: res.mtime,
        };
      } catch (err) {
        throw new StudioError(ErrorCode.WRITE_FAILED, `Native save failed: ${err.message || err}`, err);
      }
    }

    // Virtual storage safe-save
    const currentMeta = this.fileMetadata.get(filePath);
    if (currentMeta && expectedHash && currentMeta.hash !== expectedHash) {
      throw new StudioError(
        ErrorCode.EXTERNAL_MODIFICATION,
        'File has been modified on disk by an external process. Safe-save blocked to prevent data loss.'
      );
    }

    const newHash = this.computeSimpleHash(content);
    const now = Date.now();

    this.virtualStorage.set(filePath, content);
    this.fileMetadata.set(filePath, {
      mtime: now,
      hash: newHash,
      version: (currentMeta?.version || 0) + 1,
    });

    return {
      success: true,
      path: filePath,
      hash: newHash,
      mtime: now,
    };
  }

  /**
   * Lists files in the active workspace.
   * @param {string} [rootPath='ExampleVault']
   * @returns {Promise<Array<{ path: string, name: string, isDir: boolean, ext: string }>>}
   */
  async listWorkspace(rootPath = 'ExampleVault') {
    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('list_workspace', { root: rootPath });
      } catch (err) {
        console.warn('Native list_workspace failed, using virtual workspace', err);
      }
    }

    const results = [];
    for (const [path] of this.virtualStorage.entries()) {
      if (path.startsWith(rootPath)) {
        results.push({
          path,
          name: this.getFileName(path),
          isDir: false,
          ext: path.slice(path.lastIndexOf('.')),
        });
      }
    }
    return results;
  }

  /**
   * Creates a new file.
   * @param {string} filePath
   * @param {string} [initialContent='']
   * @returns {Promise<{ path: string, name: string }>}
   */
  async createFile(filePath, initialContent = '') {
    if (this.virtualStorage.has(filePath)) {
      throw new StudioError(ErrorCode.INVALID_INPUT, 'A file with that name already exists.');
    }
    await this.saveFile(filePath, initialContent);
    return { path: filePath, name: this.getFileName(filePath) };
  }

  getFileName(filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }
}

export const fileSystemService = new FileSystemService();
