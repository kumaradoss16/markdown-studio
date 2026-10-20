import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SidebarComponent } from '../../src/components/sidebar/sidebar.js';
import { EditorComponent } from '../../src/components/editor/editor.js';
import { PreviewComponent } from '../../src/components/preview/preview.js';
import { RecentFilesService, recentFilesService } from '../../src/services/recent-files-service.js';
import { WorkspaceManager, workspaceManager } from '../../src/core/workspace-manager.js';
import { FileSystemService, fileSystemService } from '../../src/services/filesystem-service.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { AppEvents, eventBus } from '../../src/app/events.js';

describe('Defect Hardening: Accordion, Pure Editor, and Clean Install', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="testRoot"></div>';
    container = document.getElementById('testRoot');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('1. Collapsible Accordion / Sidebar for Recent Files & Sections', () => {
    let sidebar;

    beforeEach(() => {
      sidebar = new SidebarComponent(container);
      sidebar.render();
    });

    it('toggles Recents section collapse state on header click', () => {
      const recentsSection = container.querySelector('[data-section-id="recents"]');
      expect(recentsSection).toBeTruthy();
      expect(recentsSection.classList.contains('is-collapsed')).toBe(false);

      const header = recentsSection.querySelector('.section-toggle-header');
      expect(header).toBeTruthy();
      expect(header.getAttribute('aria-expanded')).toBe('true');

      // Click to collapse
      header.click();
      expect(recentsSection.classList.contains('is-collapsed')).toBe(true);
      expect(header.getAttribute('aria-expanded')).toBe('false');

      const content = recentsSection.querySelector('.section-content');
      expect(content.style.display).toBe('none');

      const chevron = header.querySelector('.section-chevron');
      expect(chevron.classList.contains('collapsed')).toBe(true);

      // Click to expand again
      header.click();
      expect(recentsSection.classList.contains('is-collapsed')).toBe(false);
      expect(header.getAttribute('aria-expanded')).toBe('true');
      expect(content.style.display).toBe('');
      expect(chevron.classList.contains('collapsed')).toBe(false);
    });

    it('prevents collapse toggle when clicking the clear recents button', () => {
      recentFilesService.addRecent('docs/test.md', 'test.md');
      sidebar.render();

      const recentsSection = container.querySelector('[data-section-id="recents"]');
      const clearBtn = recentsSection.querySelector('#sidebarClearRecentsBtn');
      expect(clearBtn).toBeTruthy();

      const wasCollapsed = recentsSection.classList.contains('is-collapsed');
      clearBtn.click();

      // Clear button should not toggle the section collapsed state
      expect(recentsSection.classList.contains('is-collapsed')).toBe(wasCollapsed);
      expect(recentFilesService.getRecents().length).toBe(0);
    });

    it('persists collapsed state across sidebar re-renders', () => {
      const header = container.querySelector('[data-section-id="filesystem"] .section-toggle-header');
      expect(header).toBeTruthy();

      header.click();
      const fsSection = container.querySelector('[data-section-id="filesystem"]');
      expect(fsSection.classList.contains('is-collapsed')).toBe(true);

      // Re-render sidebar
      sidebar.render();
      const reloadedFsSection = container.querySelector('[data-section-id="filesystem"]');
      expect(reloadedFsSection.classList.contains('is-collapsed')).toBe(true);
      const reloadedHeader = reloadedFsSection.querySelector('.section-toggle-header');
      expect(reloadedHeader.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('2. Pure Text Markdown Editor (Zero Injected Code Block Header Widgets)', () => {
    let editor;

    beforeEach(() => {
      editor = new EditorComponent(container);
      editor.render();
    });

    it('does not include CodeBlockHeaderWidget or cm-code-block-header in editor extensions', () => {
      const codeMarkdown = '```python\nprint("Hello World")\n```';
      documentStateManager.openDocument('code-test.md', codeMarkdown, 'test-hash');
      editor.loadDocument(documentStateManager.getActiveDocument());

      const cmHost = container.querySelector('#cmHost');
      expect(cmHost).toBeTruthy();

      // The left editor pane MUST NOT contain the custom injected header bar or copy button
      const injectedHeader = cmHost.querySelector('.cm-code-block-header');
      expect(injectedHeader).toBeNull();

      const injectedCopyBtn = cmHost.querySelector('.cm-code-block-copy-btn');
      expect(injectedCopyBtn).toBeNull();
    });
  });

  describe('3. Clean Install State (Zero Seeded Files)', () => {
    it('initializes RecentFilesService with 0 recent files on clean install', () => {
      const freshRecents = new RecentFilesService();
      expect(freshRecents.getRecents()).toEqual([]);
    });

    it('initializes WorkspaceManager with empty folders, knowledgeBase, and tags', () => {
      const freshWorkspace = new WorkspaceManager();
      expect(freshWorkspace.folders).toEqual([]);
      expect(freshWorkspace.knowledgeBase).toEqual([]);
      expect(freshWorkspace.tags).toEqual([]);
      expect(freshWorkspace.graphNodes).toEqual([]);
      expect(freshWorkspace.graphEdges).toEqual([]);
    });

    it('initializes FileSystemService with empty virtual storage', () => {
      const freshFs = new FileSystemService();
      expect(freshFs.virtualStorage.size).toBe(0);
    });

    it('displays sleek empty state when no document is active in Editor and Preview', () => {
      const editorEl = document.createElement('div');
      const previewEl = document.createElement('div');
      container.appendChild(editorEl);
      container.appendChild(previewEl);

      const editor = new EditorComponent(editorEl);
      editor.render();
      editor.loadDocument(null);

      const preview = new PreviewComponent(previewEl);
      preview.render();
      preview.renderPreview(null);

      const emptyCard = editorEl.querySelector('.editor-empty-state');
      expect(emptyCard).toBeTruthy();
      expect(emptyCard.textContent).toContain('No Document Open');

      const previewEmpty = previewEl.querySelector('.preview-empty-state');
      expect(previewEmpty).toBeTruthy();
      expect(previewEmpty.textContent).toContain('No document open to preview');
    });
  });
});
