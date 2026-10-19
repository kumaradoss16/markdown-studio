import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogsComponent } from '../../src/components/dialogs/dialogs.js';
import { workspaceStore, DEFAULT_SETTINGS } from '../../src/services/workspace-store.js';
import { accentService } from '../../src/services/accent-service.js';
import { gitHubAuthService } from '../../src/services/github-auth-service.js';
import { credentialStore } from '../../src/services/credential-store.js';
import { AppEvents, eventBus } from '../../src/app/events.js';

describe('Settings Dialog Functional Workflow', () => {
  let dialogs;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    dialogs = new DialogsComponent(document.body);
  });

  it('renders settings dialog with persisted values', () => {
    workspaceStore.saveSettings({
      theme: 'monokai',
      accent: 'green',
      fontSize: '15px',
      tabSize: 4,
      viewMode: 'SOURCE',
      showLineNumbers: false,
      wordWrap: false,
      syncScroll: false
    });

    dialogs.showSettingsDialog();

    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).toBeTruthy();

    const themeSelect = overlay.querySelector('#themeSelectInput');
    expect(themeSelect.value).toBe('monokai');

    const accentSelect = overlay.querySelector('#accentSelectInput');
    expect(accentSelect.value).toBe('green');

    const fontSizeSelect = overlay.querySelector('#fontSizeSelectInput');
    expect(fontSizeSelect.value).toBe('15px');

    const tabSizeSelect = overlay.querySelector('#tabSizeSelectInput');
    expect(tabSizeSelect.value).toBe('4');

    const viewModeSelect = overlay.querySelector('#viewModeSelectInput');
    expect(viewModeSelect.value).toBe('SOURCE');

    const lineNumbersCheck = overlay.querySelector('#showLineNumbersInput');
    expect(lineNumbersCheck.checked).toBe(false);

    const wordWrapCheck = overlay.querySelector('#wordWrapInput');
    expect(wordWrapCheck.checked).toBe(false);

    const syncScrollCheck = overlay.querySelector('#syncScrollInput');
    expect(syncScrollCheck.checked).toBe(false);

    overlay.remove();
  });

  it('applies updated settings, updates DOM CSS variables, persists to store, and emits SETTINGS_CHANGED', async () => {
    let settingsChangedPayload = null;
    eventBus.on(AppEvents.SETTINGS_CHANGED, (settings) => {
      settingsChangedPayload = settings;
    });

    dialogs.showSettingsDialog();

    const overlay = document.querySelector('.modal-overlay');
    const themeSelect = overlay.querySelector('#themeSelectInput');
    const accentSelect = overlay.querySelector('#accentSelectInput');
    const fontSizeSelect = overlay.querySelector('#fontSizeSelectInput');
    const tabSizeSelect = overlay.querySelector('#tabSizeSelectInput');
    const viewModeSelect = overlay.querySelector('#viewModeSelectInput');
    const applyBtn = overlay.querySelector('#dialogSettingsApplyBtn');

    themeSelect.value = 'matrix';
    accentSelect.value = 'orange';
    fontSizeSelect.value = '17px';
    tabSizeSelect.value = '4';
    viewModeSelect.value = 'PREVIEW';

    applyBtn.click();

    // Verify DOM changes
    expect(document.documentElement.getAttribute('data-theme')).toBe('matrix');
    expect(accentService.getAccent()).toBe('orange');
    expect(document.documentElement.style.getPropertyValue('--font-size-editor')).toBe('17px');
    expect(document.documentElement.style.getPropertyValue('--editor-tab-size')).toBe('4');

    // Verify persistence
    const saved = workspaceStore.getSettings();
    expect(saved.theme).toBe('matrix');
    expect(saved.accent).toBe('orange');
    expect(saved.fontSize).toBe('17px');
    expect(saved.tabSize).toBe(4);
    expect(saved.viewMode).toBe('PREVIEW');

    // Verify event
    expect(settingsChangedPayload).toBeTruthy();
    expect(settingsChangedPayload.theme).toBe('matrix');
    expect(settingsChangedPayload.accent).toBe('orange');
  });

  it('resets dialog controls to factory defaults when clicking Reset to Defaults', () => {
    workspaceStore.saveSettings({
      theme: 'monokai',
      accent: 'rose',
      fontSize: '16px'
    });

    dialogs.showSettingsDialog();
    const overlay = document.querySelector('.modal-overlay');

    const resetBtn = overlay.querySelector('#dialogSettingsResetBtn');
    resetBtn.click();

    const themeSelect = overlay.querySelector('#themeSelectInput');
    expect(themeSelect.value).toBe('cyberpunk');

    const accentSelect = overlay.querySelector('#accentSelectInput');
    expect(accentSelect.value).toBe('cyan');

    const fontSizeSelect = overlay.querySelector('#fontSizeSelectInput');
    expect(fontSizeSelect.value).toBe('13px');

    overlay.remove();
  });

  it('tests PAT token via Test Token button and shows validation feedback', async () => {
    vi.spyOn(credentialStore, 'testCredential').mockResolvedValue({
      valid: true,
      user: 'octocat',
      scopes: ['repo', 'read:user']
    });

    dialogs.showSettingsDialog();
    const overlay = document.querySelector('.modal-overlay');
    const patInput = overlay.querySelector('#settingsGithubPatInput');
    const testBtn = overlay.querySelector('#settingsTestPatBtn');
    const feedback = overlay.querySelector('#settingsPatFeedback');

    patInput.value = 'ghp_mocktesttoken12345';
    testBtn.click();

    // Wait a tick for async handler
    await new Promise(r => setTimeout(r, 10));

    expect(feedback.style.display).toBe('block');
    expect(feedback.textContent).toContain('Token valid for @octocat');

    overlay.remove();
  });
});
