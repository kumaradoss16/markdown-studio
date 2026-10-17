import { AppEvents, eventBus } from '../app/events.js';
import { fileSystemService } from '../services/filesystem-service.js';

/**
 * WorkspaceManager handles the active vault structure, folders, files, tags, and local graph.
 */
export class WorkspaceManager {
  constructor() {
    this.vaultName = 'ExampleVault';
    this.vaultRoot = 'ExampleVault';
    this.recents = [
      { name: 'Sprint Review 2026-03-25.md', path: 'ExampleVault/Sprint Review 2026-03-25.md' }
    ];
    this.folders = [
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
    this.knowledgeBase = [
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
    this.tags = [
      '#action', '#approved', '#architecture', '#daily', '#design',
      '#engineering', '#flashcards', '#habitat', '#history',
      '#logs', '#march-2026', '#math', '#media'
    ];
    this.activeTagFilter = null;
    this.graphNodes = [
      { id: 'Habitat Design', label: 'Habitat Design', isCenter: true, x: 140, y: 80 },
      { id: 'System Arch.', label: 'System Arch.', x: 210, y: 35 },
      { id: 'Orbital Mechanics', label: 'Orbital Mechanics', x: 60, y: 40 },
      { id: 'Elena Vasquez', label: 'Elena Vasquez', x: 50, y: 130 },
      { id: 'Entangled Labs', label: 'Entangled Labs', x: 135, y: 145 },
      { id: 'Mission Briefing', label: 'Mission Briefing', x: 220, y: 125 }
    ];
    this.graphEdges = [
      { from: 'Habitat Design', to: 'System Arch.' },
      { from: 'Habitat Design', to: 'Orbital Mechanics' },
      { from: 'Habitat Design', to: 'Elena Vasquez' },
      { from: 'Habitat Design', to: 'Entangled Labs' },
      { from: 'Habitat Design', to: 'Mission Briefing' },
      { from: 'System Arch.', to: 'Mission Briefing' },
      { from: 'Elena Vasquez', to: 'Entangled Labs' }
    ];
  }

  getVaultName() {
    return this.vaultName;
  }

  setFilterTag(tag) {
    this.activeTagFilter = this.activeTagFilter === tag ? null : tag;
    eventBus.emit(AppEvents.WORKSPACE_CHANGED, { activeTagFilter: this.activeTagFilter });
  }

  async loadFiles() {
    try {
      const files = await fileSystemService.listWorkspace(this.vaultRoot);
      eventBus.emit(AppEvents.WORKSPACE_CHANGED, { files });
      return files;
    } catch (err) {
      console.warn('Failed to load workspace files:', err);
      return [];
    }
  }
}

export const workspaceManager = new WorkspaceManager();
