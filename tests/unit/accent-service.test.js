import { describe, it, expect, beforeEach } from 'vitest';
import { AccentService, ACCENT_PRESETS, DEFAULT_ACCENT, ACCENT_STORAGE_KEY } from '../../src/services/accent-service.js';

class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('AccentService (Accent Switching System)', () => {
  let mockStorage;
  let service;

  beforeEach(() => {
    mockStorage = new MockStorage();
    service = new AccentService(mockStorage);
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.removeAttribute('data-accent');
    }
  });

  it('provides all required presets (cyan, red, orange, grey, green, blue + extras)', () => {
    const presets = service.listPresets();
    const ids = presets.map(p => p.id);

    expect(ids).toContain('cyan');
    expect(ids).toContain('red');
    expect(ids).toContain('orange');
    expect(ids).toContain('grey');
    expect(ids).toContain('green');
    expect(ids).toContain('blue');
    expect(ids).toContain('sky');
    expect(ids).toContain('teal');
    expect(ids).toContain('violet');
    expect(presets.length).toBeGreaterThanOrEqual(9);
  });

  it('validates accent IDs securely', () => {
    expect(service.isValidAccent('cyan')).toBe(true);
    expect(service.isValidAccent('CYAN')).toBe(true);
    expect(service.isValidAccent('blue')).toBe(true);
    expect(service.isValidAccent('orange')).toBe(true);

    // Invalid or injection attempts
    expect(service.isValidAccent('invalid-color')).toBe(false);
    expect(service.isValidAccent('')).toBe(false);
    expect(service.isValidAccent(null)).toBe(false);
    expect(service.isValidAccent(undefined)).toBe(false);
    expect(service.isValidAccent('<script>alert(1)</script>')).toBe(false);
    expect(service.isValidAccent('cyan" onmouseover="alert(1)')).toBe(false);
  });

  it('retrieves default preset for fallback', () => {
    const def = service.getPreset('invalid');
    expect(def.id).toBe(DEFAULT_ACCENT);
    expect(def.hex).toBe('#00e5ff');
  });

  it('gets accent from storage if available', () => {
    mockStorage.setItem(ACCENT_STORAGE_KEY, 'red');
    expect(service.getAccent()).toBe('red');
  });

  it('falls back to default if storage has invalid accent', () => {
    mockStorage.setItem(ACCENT_STORAGE_KEY, 'corrupted_accent');
    expect(service.getAccent()).toBe(DEFAULT_ACCENT);
  });

  it('applies accent to document.documentElement via data-accent attribute', () => {
    const applied = service.applyAccent('green');
    expect(applied).toBe('green');
    expect(document.documentElement.getAttribute('data-accent')).toBe('green');
  });

  it('falls back to default on invalid applyAccent call without throwing or injecting', () => {
    const applied = service.applyAccent('foo"malicious');
    expect(applied).toBe(DEFAULT_ACCENT);
    expect(document.documentElement.getAttribute('data-accent')).toBe(DEFAULT_ACCENT);
  });

  it('persists valid accent in setAccent and updates DOM', () => {
    const applied = service.setAccent('blue');
    expect(applied).toBe('blue');
    expect(mockStorage.getItem(ACCENT_STORAGE_KEY)).toBe('blue');
    expect(document.documentElement.getAttribute('data-accent')).toBe('blue');
    expect(service.getAccent()).toBe('blue');
  });

  it('safely rejects setting invalid accents in setAccent', () => {
    const applied = service.setAccent('invalid');
    expect(applied).toBe(DEFAULT_ACCENT);
    expect(mockStorage.getItem(ACCENT_STORAGE_KEY)).toBe(DEFAULT_ACCENT);
    expect(document.documentElement.getAttribute('data-accent')).toBe(DEFAULT_ACCENT);
  });
});
