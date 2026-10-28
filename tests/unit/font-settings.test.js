import { describe, it, expect, beforeEach } from 'vitest';
import {
  FONT_STACKS,
  EDITOR_FONTS,
  PREVIEW_FONTS,
  GRAPH_FONTS,
  FONT_SIZES,
  TEXT_COLOR_PRESETS,
  isValidHexColor,
  clampFontSize
} from '../../src/data/fonts.js';
import { applyTypographySettings } from '../../src/app/bootstrap.js';
import { workspaceStore, DEFAULT_SETTINGS } from '../../src/services/workspace-store.js';
import { DialogsComponent } from '../../src/components/dialogs/dialogs.js';
import { AppEvents, eventBus } from '../../src/app/events.js';

describe('Slice 4 Typography and Font Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.cssText = '';
  });

  describe('Font Utilities & Validation', () => {
    it('provides complete font stacks and font lists', () => {
      expect(EDITOR_FONTS).toContain('JetBrains Mono');
      expect(EDITOR_FONTS).toContain('Fira Code');
      expect(PREVIEW_FONTS).toContain('Inter');
      expect(GRAPH_FONTS).toContain('Inter');
      expect(FONT_STACKS['JetBrains Mono']).toContain('monospace');
      expect(FONT_STACKS['Inter']).toContain('sans-serif');
      expect(FONT_SIZES.length).toBeGreaterThanOrEqual(10);
      expect(TEXT_COLOR_PRESETS.length).toBeGreaterThanOrEqual(5);
    });

    it('validates 6-digit hex colors strictly', () => {
      expect(isValidHexColor('#f1f5f9')).toBe(true);
      expect(isValidHexColor('#00E5FF')).toBe(true);
      expect(isValidHexColor('#10b981')).toBe(true);

      // Rejections
      expect(isValidHexColor('rgb(0,0,0)')).toBe(false);
      expect(isValidHexColor('#fff')).toBe(false); // only 6-digit
      expect(isValidHexColor('red')).toBe(false);
      expect(isValidHexColor('javascript:alert(1)')).toBe(false);
      expect(isValidHexColor('')).toBe(false);
      expect(isValidHexColor(null)).toBe(false);
    });

    it('clamps font sizes between 10px and 24px', () => {
      expect(clampFontSize('8px')).toBe('10px');
      expect(clampFontSize('14.5px')).toBe('14.5px');
      expect(clampFontSize('30px')).toBe('24px');
      expect(clampFontSize('invalid', '13px')).toBe('13px');
      expect(clampFontSize(null, '14px')).toBe('14px');
    });
  });

  describe('applyTypographySettings', () => {
    it('applies editor, preview, and graph typography tokens to document root', () => {
      applyTypographySettings({
        editorFontFamily: 'Fira Code',
        editorFontSize: '15px',
        editorFontColor: '#10b981',
        editorLineHeight: 1.7,
        previewFontFamily: 'Georgia',
        previewFontSize: '16px',
        previewFontColor: '#cbd5e1',
        previewLineHeight: 1.8,
        graphFontFamily: 'JetBrains Mono',
        graphFontSize: 12,
        tabSize: 4
      });

      const root = document.documentElement;
      expect(root.style.getPropertyValue('--font-editor')).toBe(FONT_STACKS['Fira Code']);
      expect(root.style.getPropertyValue('--font-size-editor')).toBe('15px');
      expect(root.style.getPropertyValue('--color-editor-text')).toBe('#10b981');
      expect(root.style.getPropertyValue('--line-height-editor')).toBe('1.7');

      expect(root.style.getPropertyValue('--font-preview')).toBe(FONT_STACKS['Georgia']);
      expect(root.style.getPropertyValue('--font-size-preview')).toBe('16px');
      expect(root.style.getPropertyValue('--color-preview-text')).toBe('#cbd5e1');
      expect(root.style.getPropertyValue('--line-height-preview')).toBe('1.8');

      expect(root.style.getPropertyValue('--font-graph')).toBe(FONT_STACKS['JetBrains Mono']);
      expect(root.style.getPropertyValue('--font-size-graph')).toBe('12px');
      expect(root.style.getPropertyValue('--editor-tab-size')).toBe('4');
    });

    it('clears custom color variables when set to empty string (inheriting theme defaults)', () => {
      document.documentElement.style.setProperty('--color-editor-text', '#10b981');
      document.documentElement.style.setProperty('--color-preview-text', '#cbd5e1');

      applyTypographySettings({
        editorFontColor: '',
        previewFontColor: '',
        graphFontFamily: ''
      });

      expect(document.documentElement.style.getPropertyValue('--color-editor-text')).toBe('');
      expect(document.documentElement.style.getPropertyValue('--color-preview-text')).toBe('');
      expect(document.documentElement.style.getPropertyValue('--font-graph')).toBe('');
    });
  });

  describe('WorkspaceStore Typography Persistence', () => {
    it('persists and restores all typography configuration attributes', () => {
      workspaceStore.saveSettings({
        editorFontFamily: 'Cascadia Code',
        editorFontSize: '16px',
        editorFontColor: '#38bdf8',
        editorLineHeight: 1.75,
        previewFontFamily: 'System Sans',
        previewFontSize: '15px',
        previewFontColor: '#f1f5f9',
        previewLineHeight: 1.7,
        graphFontFamily: 'Cascadia Code',
        graphFontSize: 13
      });

      const restored = workspaceStore.getSettings();
      expect(restored.editorFontFamily).toBe('Cascadia Code');
      expect(restored.editorFontSize).toBe('16px');
      expect(restored.editorFontColor).toBe('#38bdf8');
      expect(restored.editorLineHeight).toBe(1.75);
      expect(restored.previewFontFamily).toBe('System Sans');
      expect(restored.previewFontSize).toBe('15px');
      expect(restored.previewFontColor).toBe('#f1f5f9');
      expect(restored.previewLineHeight).toBe(1.7);
      expect(restored.graphFontFamily).toBe('Cascadia Code');
      expect(restored.graphFontSize).toBe(13);
    });
  });

  describe('Settings Dialog Typography Controls', () => {
    it('interactively applies new typography choices and emits SETTINGS_CHANGED', async () => {
      const dialogs = new DialogsComponent(document.body);
      let emittedSettings = null;
      eventBus.on(AppEvents.SETTINGS_CHANGED, (settings) => {
        emittedSettings = settings;
      });

      dialogs.showSettingsDialog();
      const overlay = document.querySelector('.modal-overlay');
      expect(overlay).toBeTruthy();

      const editorFontSelect = overlay.querySelector('#fontFamilySelectInput');
      const editorSizeSelect = overlay.querySelector('#fontSizeSelectInput');
      const editorColorInput = overlay.querySelector('#editorTextColorInput');
      const editorLineHeightSelect = overlay.querySelector('#editorLineHeightInput');

      const previewFontSelect = overlay.querySelector('#previewFontFamilyInput');
      const previewSizeSelect = overlay.querySelector('#previewFontSizeInput');
      const previewColorInput = overlay.querySelector('#previewTextColorInput');
      const previewLineHeightSelect = overlay.querySelector('#previewLineHeightInput');

      const graphFontSelect = overlay.querySelector('#graphFontFamilyInput');
      const graphSizeSelect = overlay.querySelector('#graphFontSizeInput');

      editorFontSelect.value = 'Fira Code';
      editorSizeSelect.value = '16px';
      editorColorInput.value = '#00e5ff';
      editorLineHeightSelect.value = '1.7';

      previewFontSelect.value = 'Georgia';
      previewSizeSelect.value = '15px';
      previewColorInput.value = '#f1f5f9';
      previewLineHeightSelect.value = '1.75';

      graphFontSelect.value = 'JetBrains Mono';
      graphSizeSelect.value = '12';

      const applyBtn = overlay.querySelector('#dialogSettingsApplyBtn');
      applyBtn.click();

      expect(emittedSettings).toBeTruthy();
      expect(emittedSettings.editorFontFamily).toBe('Fira Code');
      expect(emittedSettings.editorFontSize).toBe('16px');
      expect(emittedSettings.editorFontColor).toBe('#00e5ff');
      expect(emittedSettings.previewFontFamily).toBe('Georgia');
      expect(emittedSettings.graphFontFamily).toBe('JetBrains Mono');

      // Verify DOM variables
      expect(document.documentElement.style.getPropertyValue('--font-editor')).toBe(FONT_STACKS['Fira Code']);
      expect(document.documentElement.style.getPropertyValue('--font-size-editor')).toBe('16px');
      expect(document.documentElement.style.getPropertyValue('--color-editor-text')).toBe('#00e5ff');
      expect(document.documentElement.style.getPropertyValue('--font-preview')).toBe(FONT_STACKS['Georgia']);
      expect(document.documentElement.style.getPropertyValue('--font-size-preview')).toBe('15px');
    });
  });
});
