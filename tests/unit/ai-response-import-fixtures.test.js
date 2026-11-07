import { describe, it, expect } from 'vitest';
import { htmlToMarkdownService } from '../../src/services/html-to-markdown-service.js';
import { formatDetectionService } from '../../src/services/format-detection-service.js';

describe('AI Response Import & Platform Compatibility Fixtures (ChatGPT, Claude, Gemini, StackOverflow, GitHub)', () => {

  it('converts ChatGPT dark-mode response with card container, bold phase rows, and code block', () => {
    const chatGptHtml = `
      <div class="dark:bg-gray-950 text-gray-100 font-sans">
        <h2 class="text-xl font-bold">Migration Strategy: Microservices to Modular Monolith</h2>
        <div class="border border-gray-800 rounded-lg p-4 bg-gray-900 my-4 summary-card">
          <p><strong>Executive Summary:</strong> Consolidating 14 services into 3 bounded domains.</p>
        </div>
        <div>
          <p>1. <strong>Phase 1 (Discovery)</strong> — Audit dependencies and decouple schemas.</p>
          <p>2. <strong>Phase 2 (Extraction)</strong> — Move core repositories into shared workspace.</p>
          <p>3. <strong>Phase 3 (Cutover)</strong> — Zero-downtime routing redirect via ingress.</p>
        </div>
        <div class="code-block__header">typescript</div>
        <pre><code class="language-typescript">interface ServiceRegistry {
  lookup(name: string): ServiceClient;
}</code></pre>
      </div>
    `;

    const res = htmlToMarkdownService.convert(chatGptHtml);
    expect(res.markdown).toContain('## Migration Strategy: Microservices to Modular Monolith');
    expect(res.markdown).toContain('Executive Summary');
    expect(res.markdown).toContain('Phase 1 (Discovery)');
    expect(res.markdown).toContain('Phase 2 (Extraction)');
    expect(res.markdown).toContain('Phase 3 (Cutover)');
    expect(res.markdown).toContain('```typescript');
    expect(res.markdown).toContain('interface ServiceRegistry {');
  });

  it('converts Claude-style response with nested lists, inline formatting, and blockquotes', () => {
    const claudeHtml = `
      <div class="prose">
        <h3>Distributed Locking Protocol</h3>
        <p>Using <em>Redis Redlock</em> with a <strong>quorum of N/2 + 1</strong> nodes:</p>
        <ul>
          <li>Acquisition Steps
            <ul>
              <li>Generate UUID token</li>
              <li>Attempt SETNX with millisecond TTL</li>
              <li>Verify quorum acquisition time &lt; drift limit</li>
            </ul>
          </li>
          <li>Release Steps
            <ul>
              <li>Execute Lua verification script</li>
            </ul>
          </li>
        </ul>
        <blockquote>Remember: Clock drift must not exceed validity factor alpha.</blockquote>
      </div>
    `;

    const res = htmlToMarkdownService.convert(claudeHtml);
    expect(res.markdown).toContain('### Distributed Locking Protocol');
    expect(res.markdown).toContain('*Redis Redlock*');
    expect(res.markdown).toContain('**quorum of N/2 + 1**');
    expect(res.markdown).toMatch(/-\s+Acquisition Steps/);
    expect(res.markdown).toMatch(/\s+-\s+Generate UUID token/);
    expect(res.markdown).toContain('> Remember: Clock drift must not exceed validity factor alpha.');
  });

  it('converts Gemini-style response with tables and ordered list starting numbers', () => {
    const geminiHtml = `
      <div>
        <h2>Database Benchmarks</h2>
        <table>
          <thead>
            <tr><th>Engine</th><th>QPS</th><th>p99 Latency</th></tr>
          </thead>
          <tbody>
            <tr><td>PostgreSQL 16</td><td>45,000</td><td>1.2ms</td></tr>
            <tr><td>CockroachDB</td><td>32,000</td><td>3.8ms</td></tr>
          </tbody>
        </table>
        <ol start="5">
          <li>Fifth consideration: Write amplification</li>
          <li>Sixth consideration: Multi-region failover</li>
        </ol>
      </div>
    `;

    const res = htmlToMarkdownService.convert(geminiHtml);
    expect(res.markdown).toContain('## Database Benchmarks');
    expect(res.markdown).toContain('| Engine | QPS | p99 Latency |');
    expect(res.markdown).toContain('| PostgreSQL 16 | 45,000 | 1.2ms |');
    expect(res.markdown).toContain('5. Fifth consideration: Write amplification');
    expect(res.markdown).toContain('6. Sixth consideration: Multi-region failover');
  });

  it('preserves safe inline HTML tags: sup, sub, and kbd', () => {
    const html = `
      <p>Water chemical formula is H<sub>2</sub>O and speed of light is 3 × 10<sup>8</sup> m/s.</p>
      <p>Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> to open Clipboard Import.</p>
    `;

    const res = htmlToMarkdownService.convert(html);
    expect(res.markdown).toContain('H<sub>2</sub>O');
    expect(res.markdown).toContain('10<sup>8</sup>');
    expect(res.markdown).toContain('<kbd>Ctrl</kbd>');
    expect(res.markdown).toContain('<kbd>Shift</kbd>');
    expect(res.markdown).toContain('<kbd>V</kbd>');
  });

  it('converts StackOverflow-style code answer and GitHub-rendered markdown', () => {
    const soHtml = `
      <div class="answercell">
        <div class="post-text">
          <p>You can configure mutual TLS using <code>nginx.conf</code>:</p>
          <pre><code>ssl_client_certificate /etc/ssl/ca.crt;
ssl_verify_client on;</code></pre>
          <p>Reference: <a href="https://nginx.org/en/docs/http/ngx_http_ssl_module.html">Nginx SSL Documentation</a></p>
        </div>
      </div>
    `;

    const res = htmlToMarkdownService.convert(soHtml);
    expect(res.markdown).toContain('`nginx.conf`');
    expect(res.markdown).toContain('ssl_client_certificate /etc/ssl/ca.crt;');
    expect(res.markdown).toContain('[Nginx SSL Documentation](https://nginx.org/en/docs/http/ngx_http_ssl_module.html)');
  });
});
