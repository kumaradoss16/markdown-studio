import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fileSystemAdapter } from '../../src/services/filesystem-adapter.js';
import { fileSystemService } from '../../src/services/filesystem-service.js';
import { createNodeElement, getNodeIcon } from '../../src/components/file-tree/tree-node.js';
import { FileTreeComponent } from '../../src/components/file-tree/file-tree.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { populateTestFixtures } from '../fixtures/sample-workspace.js';

describe('File Hierarchy Explorer System', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    populateTestFixtures(fileSystemService);
  });

  describe('fileSystemAdapter', () => {
    it('reads directory tree recursively with proper hierarchy and extensions', async () => {
      const tree = await fileSystemAdapter.readTree('ExampleVault');
      expect(tree).toBeDefined();
      expect(tree.name).toBe('ExampleVault');
      expect(tree.type).toBe('directory');
      expect(Array.isArray(tree.children)).toBe(true);

      // Check for nested children
      const embeds = tree.children.find(c => c.name === 'embeds');
      expect(embeds).toBeDefined();
      expect(embeds.type).toBe('directory');
      expect(embeds.children.length).toBeGreaterThan(0);

      const htmlFile = embeds.children.find(c => c.name === 'telemetry-card.html');
      expect(htmlFile).toBeDefined();
      expect(htmlFile.type).toBe('file');
      expect(htmlFile.extension).toBe('html');
    });

    it('performs file write, read, and delete operations', async () => {
      const testPath = 'ExampleVault/temp-test-doc.md';
      await fileSystemAdapter.writeFile(testPath, '# Temporary Title');

      const readResult = await fileSystemAdapter.readFile(testPath);
      expect(readResult.content).toBe('# Temporary Title');

      await fileSystemAdapter.delete(testPath);
      await expect(fileSystemAdapter.readFile(testPath)).rejects.toThrow();
    });
  });

  describe('TreeNode DOM Renderer (tree-node.js)', () => {
    it('computes dynamic indentation style based on depth (calc(depth * 12px + 10px))', () => {
      const node = { id: 'test1', name: 'demo.md', path: 'ExampleVault/demo.md', type: 'file', extension: 'md' };
      const elDepth0 = createNodeElement(node, 0, false, false);
      const elDepth3 = createNodeElement(node, 3, false, false);

      expect(elDepth0.style.paddingLeft).toBe('calc(10px)');
      expect(elDepth3.style.paddingLeft).toBe('calc(46px)');
    });

    it('renders conditional iconography for Markdown, Code, Data, and Folders', () => {
      const mdNode = { id: '1', name: 'doc.md', path: 'doc.md', type: 'file', extension: 'md' };
      const jsNode = { id: '2', name: 'script.js', path: 'script.js', type: 'file', extension: 'js' };
      const jsonNode = { id: '3', name: 'data.json', path: 'data.json', type: 'file', extension: 'json' };
      const dirClosed = { id: '4', name: 'docs', path: 'docs', type: 'directory' };
      const dirOpen = { id: '5', name: 'docs', path: 'docs', type: 'directory' };

      expect(getNodeIcon(mdNode)).toContain('icon-md');
      expect(getNodeIcon(jsNode)).toContain('icon-code');
      expect(getNodeIcon(jsonNode)).toContain('icon-data');
      expect(getNodeIcon(dirClosed, false)).toContain('folder-icon closed');
      expect(getNodeIcon(dirOpen, true)).toContain('folder-icon open');
    });

    it('sets correct accessibility attributes and CSS classes for active/expanded states', () => {
      const dirNode = { id: 'dir1', name: 'folder', path: 'folder', type: 'directory' };
      const el = createNodeElement(dirNode, 1, true, true);

      expect(el.classList.contains('active')).toBe(true);
      expect(el.classList.contains('expanded')).toBe(true);
      expect(el.querySelector('.tree-chevron.rotated')).toBeDefined();
    });
  });

  describe('FileTreeComponent Lifecycle & Navigation', () => {
    let container;
    let tree;

    beforeEach(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      tree = new FileTreeComponent(container, { rootPath: 'ExampleVault' });
      await tree.render();
    });

    it('mounts the recursive tree into container', () => {
      const items = container.querySelectorAll('.tree-item');
      expect(items.length).toBeGreaterThan(0);

      const embedsFolder = container.querySelector('[data-path="ExampleVault/embeds"]');
      expect(embedsFolder).not.toBeNull();
    });

    it('non-destructively toggles folder visibility without wiping tree DOM', () => {
      const embedsFolder = container.querySelector('[data-path="ExampleVault/embeds"]');
      const cachedEntry = tree.nodeMap.get('ExampleVault/embeds');
      expect(cachedEntry).toBeDefined();

      const initialDisplay = cachedEntry.childrenEl.style.display;
      tree.toggleDirectory('ExampleVault/embeds');

      // Toggled state
      expect(cachedEntry.childrenEl.style.display).not.toBe(initialDisplay);
      // Ensure the same DOM elements were preserved (no re-render wipe)
      expect(container.querySelector('[data-path="ExampleVault/embeds"]')).toBe(embedsFolder);
    });

    it('activates file selection and dispatches documentStateManager.openDocument', async () => {
      const openSpy = vi.spyOn(documentStateManager, 'openDocument');
      const targetFile = 'ExampleVault/embeds/Embed Showcase.md';

      await tree.selectFile(targetFile);

      expect(openSpy).toHaveBeenCalled();
      const activeEl = container.querySelector(`[data-path="${targetFile}"]`);
      expect(activeEl.classList.contains('active')).toBe(true);
    });

    it('navigates through visible nodes using ArrowDown and ArrowUp', () => {
      const visible = tree.getVisibleNodes();
      expect(visible.length).toBeGreaterThan(1);

      tree.focusNode(visible[0].path);
      expect(tree.focusedPath).toBe(visible[0].path);

      // Simulate ArrowDown
      const eventDown = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
      tree.treeEl.dispatchEvent(eventDown);
      expect(tree.focusedPath).toBe(visible[1].path);

      // Simulate ArrowUp
      const eventUp = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
      tree.treeEl.dispatchEvent(eventUp);
      expect(tree.focusedPath).toBe(visible[0].path);
    });

    it('expands collapsed folders on ArrowRight and collapses on ArrowLeft', () => {
      const dirPath = 'ExampleVault/embeds';
      tree.expandedPaths.delete(dirPath);
      tree.nodeMap.get(dirPath).childrenEl.style.display = 'none';

      tree.focusNode(dirPath);

      // ArrowRight expands
      const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      tree.treeEl.dispatchEvent(rightEvent);
      expect(tree.expandedPaths.has(dirPath)).toBe(true);

      // ArrowLeft collapses
      const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
      tree.treeEl.dispatchEvent(leftEvent);
      expect(tree.expandedPaths.has(dirPath)).toBe(false);
    });
  });
});
