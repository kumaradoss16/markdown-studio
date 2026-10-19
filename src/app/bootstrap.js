import { AppShellComponent } from '../components/app-shell/app-shell.js';
import { SidebarComponent } from '../components/sidebar/sidebar.js';
import { DocumentTabsComponent } from '../components/document-tabs/document-tabs.js';
import { EditorComponent } from '../components/editor/editor.js';
import { PreviewComponent } from '../components/preview/preview.js';
import { StatusBarComponent } from '../components/status-bar/status-bar.js';
import { DialogsComponent } from '../components/dialogs/dialogs.js';

import { fileSystemService } from '../services/filesystem-service.js';
import { documentStateManager } from '../core/document-state-manager.js';
import { saveCoordinator } from '../core/save-coordinator.js';
import { gitHubAuthService } from '../services/github-auth-service.js';
import { publicationCoordinator } from '../services/publication-coordinator.js';
import { accentService } from '../services/accent-service.js';
import { workspaceStore } from '../services/workspace-store.js';
import { graphIndexService } from '../services/graph-index-service.js';
import { crashRecoveryManager } from '../core/recovery-manager.js';
import { redactSensitiveData } from '../services/error-service.js';
import '../components/github/diff-modal.js';
import '../components/github/publish-modal.js';
import '../components/history/history-panel.js';
import '../components/history/history-diff-modal.js';
import { AppEvents, eventBus } from './events.js';

export async function bootstrapApp(rootElement) {
  // Global error boundary & sanitized diagnostic capture
  window.addEventListener('error', (event) => {
    const sanitizedMsg = redactSensitiveData(event.message || 'An unexpected error occurred.');
    console.error('[STUDIO ERROR BOUNDARY]', sanitizedMsg);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const sanitizedMsg = redactSensitiveData(event.reason?.message || String(event.reason || 'Unhandled promise rejection'));
    console.error('[STUDIO REJECTION BOUNDARY]', sanitizedMsg);
  });

  // Start continuous crash recovery snapshot journaling
  crashRecoveryManager.startPeriodicJournaling(3000);

  // Restore GitHub session if stored
  gitHubAuthService.restoreSession().catch((e) => console.warn('Could not restore GitHub session:', e));
  // Reconcile any in-flight/uncertain publication attempts from previous crashes (Invariant 17)
  publicationCoordinator.recoverPendingAttempts().catch((e) => console.warn('Publication recovery error:', e));
  // 0. Restore saved theme, accent, and font preferences
  try {
    const settings = workspaceStore.getSettings();
    const savedTheme = localStorage.getItem('devspirehub:theme') || settings.theme;
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    // Restore accent color
    accentService.applyAccent(settings.accent || accentService.getAccent());

    const savedFontSize = localStorage.getItem('devspirehub:fontSize') || settings.fontSize;
    if (savedFontSize) {
      document.documentElement.style.setProperty('--font-size-editor', savedFontSize);
    }
    if (settings.tabSize) {
      document.documentElement.style.setProperty('--editor-tab-size', String(settings.tabSize));
    }
    if (settings.fontFamily) {
      document.documentElement.style.setProperty('--font-editor', settings.fontFamily);
    }
  } catch (e) {
    console.warn('LocalStorage unavailable for preferences restoration:', e);
  }

  // Initialize auto sync for workspace state and settings
  workspaceStore.initAutoSync();

  // 1. Mount App Shell
  const appShell = new AppShellComponent(rootElement);
  appShell.render();

  // 2. Locate child containers
  const sidebarContainer = rootElement.querySelector('#sidebarContainer');
  const tabsContainer = rootElement.querySelector('#tabsContainer');
  const editorContainer = rootElement.querySelector('#editorContainer');
  const previewContainer = rootElement.querySelector('#previewContainer');
  const statusBarContainer = rootElement.querySelector('#statusBarContainer');

  // 3. Pre-load documents: Restore saved workspace tabs & draft buffers, or load default files
  const restored = await workspaceStore.restoreWorkspace();
  if (!restored) {
    const initialFiles = [
      'ExampleVault/Marcus Chen.md',
      'ExampleVault/Mermaid Style Rules.md',
      'ExampleVault/Habitat Design.md',
      'ExampleVault/System Architecture.md',
      'ExampleVault/Orbital Mechanics.md',
    ];

    for (const filePath of initialFiles) {
      try {
        const fileData = await fileSystemService.readFile(filePath);
        documentStateManager.openDocument(fileData.path, fileData.content, fileData.hash, fileData.mtime);
      } catch (err) {
        console.warn(`Could not preload file ${filePath}:`, err);
      }
    }

    // Set Habitat Design.md as the active document as shown in the reference image
    const habitatDoc = documentStateManager.getOpenDocuments().find(d => d.name === 'Habitat Design.md');
    if (habitatDoc) {
      documentStateManager.setActiveDocument(habitatDoc.id);
    }
  }

  // Check for any ungraceful shutdown crash recoveries
  if (crashRecoveryManager.hasPendingRecoveries()) {
    const recoveredCount = crashRecoveryManager.restorePendingEntries();
    if (recoveredCount > 0) {
      setTimeout(() => {
        eventBus.emit(AppEvents.NOTIFICATION, {
          type: 'info',
          message: `Restored ${recoveredCount} unsaved draft(s) from crash recovery journal.`
        });
      }, 500);
    }
  }

  // 4. Mount subcomponents
  new SidebarComponent(sidebarContainer).render();
  new DocumentTabsComponent(tabsContainer).render();
  new EditorComponent(editorContainer).render();
  new PreviewComponent(previewContainer).render();
  new StatusBarComponent(statusBarContainer).render();
  new DialogsComponent(document.body);

  // Defer non-essential knowledge graph indexing until after initial paint & UI mount
  setTimeout(() => {
    graphIndexService.initAutoSync();
    graphIndexService.buildGraph().catch((e) => console.warn('Initial graph indexing error:', e));
  }, 100);

  // 5. Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const active = documentStateManager.getActiveDocument();
      if (!active) return;

      if (e.shiftKey) {
        eventBus.emit(AppEvents.DIALOG_OPEN, {
          type: 'save-as',
          docId: active.id,
          defaultName: active.name,
        });
      } else {
        saveCoordinator.save(active.id);
      }
    } else if (isMod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'command-palette' });
    } else if (isMod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'new-file' });
    } else if (isMod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.querySelector('.workspace-sidebar')?.classList.toggle('collapsed');
    } else if (isMod && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      const active = documentStateManager.getActiveDocument();
      if (active) {
        document.querySelector(`.tab-close-btn[data-close-id="${active.id}"]`)?.click();
      }
    } else if (isMod && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      const active = documentStateManager.getActiveDocument();
      if (active) {
        eventBus.emit(AppEvents.HISTORY_OPEN_REQUESTED, { docId: active.id, filePath: active.path });
      }
    } else if (isMod && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      eventBus.emit(AppEvents.GRAPH_OPEN_REQUESTED);
    }
  });

  console.log('MarkForge Markdown Studio bootstrapped successfully.');
}
