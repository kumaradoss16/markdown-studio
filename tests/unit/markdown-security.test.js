import { describe, it, expect } from 'vitest';
import { markdownService } from '../../src/services/markdown-service.js';

describe('MarkdownService & Security Sanitization', () => {
  it('parses standard GFM elements into valid HTML', () => {
    const raw = '# Main Title\n\n**Bold Text** and *Italic*.\n\n- Item 1\n- Item 2';
    const { html } = markdownService.render(raw);

    expect(html).toContain('<h1>Main Title</h1>');
    expect(html).toContain('<strong>Bold Text</strong>');
    expect(html).toContain('<em>Italic</em>');
    expect(html).toContain('<ul>');
  });

  it('correctly extracts YAML frontmatter', () => {
    const raw = `---
tags: [design, habitat]
status: approved
author: jt
---

# Content Body`;

    const { frontmatter, html } = markdownService.render(raw);
    expect(frontmatter).toBeDefined();
    expect(frontmatter.status).toBe('approved');
    expect(frontmatter.author).toBe('jt');
    expect(Array.isArray(frontmatter.tags)).toBe(true);
    expect(frontmatter.tags).toContain('habitat');
    expect(html).toContain('<h1>Content Body</h1>');
  });

  it('transforms wiki-links into interactive elements', () => {
    const raw = 'See [[Orbital Mechanics]] and [[System Architecture|Arch]].';
    const { html } = markdownService.render(raw);

    expect(html).toContain('data-wiki-target="Orbital%20Mechanics"');
    expect(html).toContain('>Orbital Mechanics</a>');
    expect(html).toContain('data-wiki-target="System%20Architecture"');
    expect(html).toContain('>Arch</a>');
  });

  it('strips malicious script tags from output', () => {
    const malicious = '# Title\n<script>alert("XSS Attack!");</script>\nSafe text.';
    const { html } = markdownService.render(malicious);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(');
    expect(html).toContain('Safe text.');
  });

  it('strips dangerous event handlers (onerror, onload, onclick)', () => {
    const attack = '<img src="invalid-url.png" onerror="alert(document.cookie)" onload="alert(1)" onclick="malicious()" />';
    const { html } = markdownService.render(attack);

    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onload');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('document.cookie');
  });

  it('neutralizes dangerous javascript: URIs', () => {
    const attack = '[Malicious Link](javascript:alert("attack"))';
    const { html } = markdownService.render(attack);

    expect(html).not.toContain('href="javascript:');
  });

  it('preserves safe formatting classes and telemetry grid styles', () => {
    const snippet = '<div style="display: flex; gap: 12px;"><div class="metric-card"><span class="val">18.4t</span></div></div>';
    const { html } = markdownService.render(snippet);

    expect(html).toContain('class="metric-card"');
    expect(html).toContain('style="display: flex; gap: 12px;"');
  });
  it('renders task list checkboxes safely using custom non-input elements', () => {
    const raw = '- [ ] Pending task\n- [x] Completed task';
    const { html } = markdownService.render(raw);

    expect(html).not.toContain('<input');
    expect(html).toContain('class="task-box"');
    expect(html).toContain('class="task-box checked"');
  });
});
