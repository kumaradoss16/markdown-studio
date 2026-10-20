/**
 * Sample Workspace Fixtures
 * Preserves mock document datasets strictly inside tests/fixtures/
 * for unit and integration testing without polluting runtime clean-install state.
 */

export const SAMPLE_FILES = {
  'ExampleVault/Habitat Design.md': `---
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
`,

  'ExampleVault/Marcus Chen.md': `# Marcus Chen Dossier

**Role:** Chief Orbital Architect  
**Affiliation:** Neo-Kyoto Development Initiative  
**Clearance:** Level 4-Alpha  

## Background
Marcus Chen leads structural integration for the Perihelion Deep Space ring.
`,

  'ExampleVault/Mermaid Style Rules.md': `# Mermaid Style Rules

Standard diagramming guidelines for system architecture and network topologies.

\`\`\`mermaid
flowchart TD
    A[Habitat Spine] --> B[Avionics Core]
    A --> C[Life Support Loop]
    B --> D[Telemetry Radio]
\`\`\`
`,

  'ExampleVault/System Architecture.md': `# System Architecture

Comprehensive overview of Habitation & Avionics bus and life support redundancies.
`,

  'ExampleVault/Orbital Mechanics.md': `# Orbital Mechanics

Calculations for 2.4 RPM rotational gravity and centrifugal station keeping.
`,

  'ExampleVault/cyberWriter Guide.md': '# cyberWriter Guide\nWelcome to your documentation workspace.',
  'ExampleVault/Dr. Elena Vasquez.md': '# Dr. Elena Vasquez\nChief Medical Officer.',
  'ExampleVault/Entangled Labs.md': '# Entangled Labs\nPrimary contractor for quantum sensors.',
  'ExampleVault/Flashcard Demo.md': '# Flashcard Demo\nSpaced repetition documentation.',
  'ExampleVault/Mission Briefing.md': '# Mission Briefing\nPrimary orbital deployment objectives.',
  'ExampleVault/Mission Log.md': '# Mission Log\nTimestamped expedition logs.',
  'ExampleVault/embeds/telemetry-card.html': '<div class="metric-card"><span>Active Telemetry</span></div>',
  'ExampleVault/embeds/Embed Showcase.md': '# Embed Showcase\nDemonstrating embedded HTML cards and telemetry widgets.',
  'ExampleVault/images/habitat-render.png': 'PNG_BINARY_MOCK',
  'ExampleVault/audio/mission-log.mp3': 'MP3_AUDIO_MOCK'
};

export const SAMPLE_FOLDERS = [
  { name: 'audio', path: 'ExampleVault/audio', items: [] },
  {
    name: 'embeds',
    path: 'ExampleVault/embeds',
    items: [
      { name: 'telemetry-card.html', path: 'ExampleVault/embeds/telemetry-card.html', type: 'code' },
      { name: 'Embed Showcase.md', path: 'ExampleVault/embeds/Embed Showcase.md', type: 'doc' }
    ]
  },
  { name: 'images', path: 'ExampleVault/images', items: [] }
];

export const SAMPLE_KNOWLEDGE_BASE = [
  { name: 'cyberWriter Guide', path: 'ExampleVault/cyberWriter Guide.md', icon: 'book' },
  { name: 'Dr. Elena Vasquez', path: 'ExampleVault/Dr. Elena Vasquez.md', icon: 'user' },
  { name: 'Entangled Labs', path: 'ExampleVault/Entangled Labs.md', icon: 'atom' },
  { name: 'Flashcard Demo', path: 'ExampleVault/Flashcard Demo.md', icon: 'cards' },
  { name: 'Habitat Design', path: 'ExampleVault/Habitat Design.md', icon: 'doc', active: true },
  { name: 'Marcus Kim', path: 'ExampleVault/Marcus Kim.md', icon: 'user' },
  { name: 'Mermaid Style Rules', path: 'ExampleVault/Mermaid Style Rules.md', icon: 'flow' },
  { name: 'Mission Briefing', path: 'ExampleVault/Mission Briefing.md', icon: 'flag' },
  { name: 'Mission Log', path: 'ExampleVault/Mission Log.md', icon: 'list' },
  { name: 'Nexus Labs - Project...', path: 'ExampleVault/Nexus Labs.md', icon: 'box' },
  { name: 'Orbital Mechanics', path: 'ExampleVault/Orbital Mechanics.md', icon: 'orbit' },
  { name: 'System Architecture', path: 'ExampleVault/System Architecture.md', icon: 'layers' }
];

export const SAMPLE_TAGS = [
  '#action', '#approved', '#architecture', '#daily', '#design',
  '#engineering', '#flashcards', '#habitat', '#history',
  '#logs', '#march-2026', '#math', '#media'
];

/**
 * Seeds sample test files into a FileSystemService and WorkspaceManager instance.
 * @param {import('../../src/services/filesystem-service.js').FileSystemService} fsService
 * @param {import('../../src/core/workspace-manager.js').WorkspaceManager} [workspaceMgr]
 */
export function populateTestFixtures(fsService, workspaceMgr) {
  if (fsService && fsService.virtualStorage) {
    for (const [filePath, content] of Object.entries(SAMPLE_FILES)) {
      fsService.virtualStorage.set(filePath, content);
      fsService.fileMetadata.set(filePath, {
        mtime: Date.now(),
        hash: typeof fsService.computeSimpleHash === 'function' ? fsService.computeSimpleHash(content) : 'hash-' + filePath,
        version: 1,
        path: filePath,
        name: filePath.split('/').pop()
      });
    }
  }

  if (workspaceMgr) {
    workspaceMgr.folders = JSON.parse(JSON.stringify(SAMPLE_FOLDERS));
    workspaceMgr.knowledgeBase = JSON.parse(JSON.stringify(SAMPLE_KNOWLEDGE_BASE));
    workspaceMgr.tags = [...SAMPLE_TAGS];
  }
}
