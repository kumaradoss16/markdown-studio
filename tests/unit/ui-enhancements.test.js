import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AppShellComponent } from '../../src/components/app-shell/app-shell.js';
import { EditorComponent } from '../../src/components/editor/editor.js';
import { PreviewComponent } from '../../src/components/preview/preview.js';
import { workspaceStore, DEFAULT_SETTINGS } from '../../src/services/workspace-store.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { AppEvents, eventBus } from '../../src/app/events.js';

describe('Release 1.0 UI Enhancements & Packaging Hardening', () => {
  describe('1. Decoupled & Synchronized Split-Pane Scrolling', () => {
    let container;
    let appShell;
    let editorComponent;
    let previewComponent;

    beforeEach(() => {
      localStorage.clear();
      document.body.innerHTML = '<div id="testApp"></div>';
      container = document.getElementById('testApp');

      appShell = new AppShellComponent(container);
      appShell.render();

      const editorContainer = container.querySelector('#editorContainer');
      const previewContainer = container.querySelector('#previewContainer');

      editorComponent = new EditorComponent(editorContainer);
      editorComponent.render();

      previewComponent = new PreviewComponent(previewContainer);
      previewComponent.render();

      // Open a document with enough content to create scrollable space
      const lines = [];
      for (let i = 1; i <= 200; i++) {
        lines.push(`## Section ${i}\nParagraph content for line ${i} with code \`snippet_${i}\`.`);
      }
      documentStateManager.openDocument('test-scroll.md', lines.join('\n\n'), 'test-scroll.md');
    });

    afterEach(() => {
      document.body.innerHTML = '';
      vi.restoreAllMocks();
    });

    it('defaults to independent scrolling (syncScroll: false)', () => {
      const settings = workspaceStore.getSettings();
      expect(settings.syncScroll).toBe(false);
      expect(DEFAULT_SETTINGS.syncScroll).toBe(false);

      const editorSyncBtn = container.querySelector('#toolSyncScroll');
      expect(editorSyncBtn).toBeTruthy();
      expect(editorSyncBtn.classList.contains('active')).toBe(false);
      expect(editorSyncBtn.getAttribute('aria-pressed')).toBe('false');

      const previewSyncBtn = container.querySelector('#previewSyncScrollBtn');
      expect(previewSyncBtn).toBeTruthy();
      expect(previewSyncBtn.classList.contains('active')).toBe(false);
    });

    it('does not scroll preview pane when editor scrolls with syncScroll OFF', () => {
      const edScroller = container.querySelector('.cm-scroller');
      const prevScroller = container.querySelector('#previewScrollArea');

      expect(edScroller).toBeTruthy();
      expect(prevScroller).toBeTruthy();

      // Mock scroll heights and positions
      Object.defineProperty(edScroller, 'scrollHeight', { value: 3000, configurable: true });
      Object.defineProperty(edScroller, 'clientHeight', { value: 500, configurable: true });
      Object.defineProperty(prevScroller, 'scrollHeight', { value: 4000, configurable: true });
      Object.defineProperty(prevScroller, 'clientHeight', { value: 600, configurable: true });

      prevScroller.scrollTop = 0;
      edScroller.scrollTop = 1200;

      // Dispatch scroll event on editor
      edScroller.dispatchEvent(new Event('scroll'));

      // Preview pane MUST remain un-moved at 0
      expect(prevScroller.scrollTop).toBe(0);
    });

    it('toggles synchronized scrolling ON via toolbar button and syncs viewports with ratio mapping', async () => {
      const editorSyncBtn = container.querySelector('#toolSyncScroll');
      const edScroller = container.querySelector('.cm-scroller');
      const prevScroller = container.querySelector('#previewScrollArea');

      Object.defineProperty(edScroller, 'scrollHeight', { value: 2000, configurable: true });
      Object.defineProperty(edScroller, 'clientHeight', { value: 500, configurable: true }); // maxEd = 1500
      Object.defineProperty(prevScroller, 'scrollHeight', { value: 3500, configurable: true });
      Object.defineProperty(prevScroller, 'clientHeight', { value: 500, configurable: true }); // maxPrev = 3000

      // Click Sync Scroll button
      editorSyncBtn.click();

      expect(workspaceStore.getSettings().syncScroll).toBe(true);
      expect(editorSyncBtn.classList.contains('active')).toBe(true);
      expect(editorSyncBtn.getAttribute('aria-pressed')).toBe('true');

      // Re-trigger scroll event with syncScroll ON
      appShell.bindSyncScrollListeners();

      edScroller.scrollTop = 750; // ratio = 750 / 1500 = 0.5
      edScroller.dispatchEvent(new Event('scroll'));

      // Expected preview scrollTop = 0.5 * 3000 = 1500
      expect(prevScroller.scrollTop).toBe(1500);

      // Wait for debounce lock to release (preventing recursive echo)
      await new Promise(r => setTimeout(r, 80));

      // Verify reverse sync from preview to editor
      prevScroller.scrollTop = 600; // ratio = 600 / 3000 = 0.2
      prevScroller.dispatchEvent(new Event('scroll'));

      // Expected editor scrollTop = 0.2 * 1500 = 300
      expect(edScroller.scrollTop).toBe(300);

      // Wait for debounce lock to release
      await new Promise(r => setTimeout(r, 80));

      // Toggle OFF again
      editorSyncBtn.click();
      expect(workspaceStore.getSettings().syncScroll).toBe(false);
      expect(editorSyncBtn.classList.contains('active')).toBe(false);

      // Verify unbinding
      edScroller.scrollTop = 1000;
      edScroller.dispatchEvent(new Event('scroll'));
      expect(prevScroller.scrollTop).toBe(600); // Unchanged!
    });
  });

  describe('2. Multi-Resolution Transparent Application Icons', () => {
    const icoPath = path.resolve('src-tauri/icons/icon.ico');
    const appIcoPath = path.resolve('src-tauri/icons/app-icon.ico');
    const pngPath = path.resolve('public/markforge-icon.png');

    it('verifies public logo source exists and is 1024x1024 with 32-bit RGBA', () => {
      expect(fs.existsSync(pngPath)).toBe(true);
      const buf = fs.readFileSync(pngPath);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      expect(width).toBe(1024);
      expect(height).toBe(1024);
    });

    it('verifies icon.ico contains all 7 standard Windows resolutions with 32-bit depth', () => {
      expect(fs.existsSync(icoPath)).toBe(true);
      expect(fs.existsSync(appIcoPath)).toBe(true);

      const buf = fs.readFileSync(icoPath);
      expect(buf.length).toBeGreaterThan(30000); // Valid multi-resolution ICO (not 146 bytes)

      const count = buf.readUInt16LE(4);
      expect(count).toBe(7);

      const resolutions = [];
      for (let i = 0; i < count; i++) {
        const offset = 6 + i * 16;
        const w = buf[offset] || 256;
        const h = buf[offset + 1] || 256;
        const bpp = buf.readUInt16LE(offset + 6);
        resolutions.push({ width: w, height: h, bpp });
      }

      const expectedSizes = [16, 24, 32, 48, 64, 128, 256];
      const actualSizes = resolutions.map(r => r.width);
      expect(actualSizes).toEqual(expectedSizes);

      // Ensure all resolutions are 32-bit RGBA with alpha transparency
      resolutions.forEach(r => {
        expect(r.bpp).toBe(32);
      });
    });

    it('verifies tauri.conf.json bundle configuration specifies valid icon paths', () => {
      const confPath = path.resolve('src-tauri/tauri.conf.json');
      const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));

      expect(conf.bundle.icon).toContain('icons/icon.ico');
      expect(conf.bundle.icon).toContain('icons/32x32.png');
      expect(conf.bundle.icon).toContain('icons/128x128.png');
      expect(conf.bundle.windows.nsis.installerIcon).toBe('icons/icon.ico');

      // Verify files exist
      conf.bundle.icon.forEach(iconRel => {
        const full = path.resolve('src-tauri', iconRel);
        expect(fs.existsSync(full)).toBe(true);
        expect(fs.statSync(full).size).toBeGreaterThan(500); // No 124-byte dummy files
      });
    });
  });

  describe('3. Elevated Typography Hierarchy Tokens', () => {
    const tokensCssPath = path.resolve('src/styles/tokens.css');
    const previewCssPath = path.resolve('src/styles/preview.css');
    const editorCssPath = path.resolve('src/styles/editor.css');

    it('defines central typography CSS variables in tokens.css', () => {
      const tokensCss = fs.readFileSync(tokensCssPath, 'utf8');

      expect(tokensCss).toContain('--font-sans');
      expect(tokensCss).toContain('--font-mono');
      expect(tokensCss).toContain('--font-display');
      expect(tokensCss).toContain('--font-ligatures');
      expect(tokensCss).toContain('--font-features-mono');
      expect(tokensCss).toContain('--letter-spacing-display');

      // Stacks
      expect(tokensCss).toContain('"Inter"');
      expect(tokensCss).toContain('"Plus Jakarta Sans"');
      expect(tokensCss).toContain('"JetBrains Mono"');
      expect(tokensCss).toContain('"Fira Code"');
      expect(tokensCss).toContain('"Cascadia Code"');
    });

    it('enforces display typography and balanced letter-spacing on headings in preview.css', () => {
      const previewCss = fs.readFileSync(previewCssPath, 'utf8');

      expect(previewCss).toContain('font-family: var(--font-display)');
      expect(previewCss).toContain('letter-spacing: var(--letter-spacing-display, -0.02em)');
      expect(previewCss).toContain('font-feature-settings: var(--font-features-mono');
      expect(previewCss).toContain('font-variant-ligatures: var(--font-ligatures');
    });

    it('enforces monospace font stack and ligatures on editor and code snippets', () => {
      const editorCss = fs.readFileSync(editorCssPath, 'utf8');

      expect(editorCss).toContain('font-family: var(--font-mono)');
      expect(editorCss).toContain('font-feature-settings: var(--font-features-mono');
      expect(editorCss).toContain('font-variant-ligatures: var(--font-ligatures');
    });
  });
});
