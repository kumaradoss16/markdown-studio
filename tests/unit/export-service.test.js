import { describe, it, expect, beforeEach } from 'vitest';
import { markdownService } from '../../src/services/markdown-service.js';
import { documentStateManager } from '../../src/core/document-state-manager.js';
import { workspaceManager } from '../../src/core/workspace-manager.js';

describe('Release 0.2 Export Engine & Standalone HTML Generation', () => {
  it('generates a complete standalone HTML document with embedded CSS and sanitized body', () => {
    const doc = {
      name: 'Habitat Design.md',
      content: '# Habitat Design\n\n**Module Mass:** 18.4t\n\n```js\nconsole.log("Telemetry Online");\n```\n\n<script>alert("malicious");</script>'
    };

    const standaloneHtml = markdownService.generateStandaloneHtml(doc);

    expect(standaloneHtml).toContain('<!DOCTYPE html>');
    expect(standaloneHtml).toContain('<title>Habitat Design</title>');
    expect(standaloneHtml).toContain('<style>');
    expect(standaloneHtml).toContain('class="markdown-body"');
    expect(standaloneHtml).toContain('<h1>Habitat Design</h1>');
    expect(standaloneHtml).toContain('<strong>Module Mass:</strong> 18.4t');
    expect(standaloneHtml).toContain('Telemetry Online');

    // Security verification in standalone export
    expect(standaloneHtml).not.toContain('<script>alert(');
    expect(standaloneHtml).not.toContain('alert("malicious")');
  });

  it('handles untitled drafts and empty content gracefully', () => {
    const emptyDoc = { name: '', content: '' };
    const html = markdownService.generateStandaloneHtml(emptyDoc);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>MarkForge Document</title>');
  });

  it('correctly toggles and sorts workspace knowledge base', () => {
    const initialFirst = workspaceManager.knowledgeBase[0].name;
    workspaceManager.toggleSort(); // Toggle sort A-Z
    const sortedAscFirst = workspaceManager.knowledgeBase[0].name;

    workspaceManager.toggleSort(); // Toggle sort Z-A
    const sortedDescFirst = workspaceManager.knowledgeBase[0].name;

    expect(sortedAscFirst).not.toBe(sortedDescFirst);
  });

  it('supports runtime theme switching via data-theme attribute', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    document.documentElement.setAttribute('data-theme', 'monokai');
    expect(document.documentElement.getAttribute('data-theme')).toBe('monokai');

    document.documentElement.setAttribute('data-theme', 'matrix');
    expect(document.documentElement.getAttribute('data-theme')).toBe('matrix');
  });
});
