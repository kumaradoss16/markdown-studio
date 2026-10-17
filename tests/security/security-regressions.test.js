import { describe, it, expect } from 'vitest';
import { FileSystemService } from '../../src/services/filesystem-service.js';
import { ErrorCode, StudioError } from '../../src/services/error-service.js';
import { markdownService } from '../../src/services/markdown-service.js';

describe('Security Regressions & Boundaries', () => {
  const fsService = new FileSystemService();

  it('blocks path traversal read attempts with PATH_NOT_ALLOWED', async () => {
    const maliciousPaths = [
      '../secret.txt',
      'ExampleVault/../../windows/system32/cmd.exe',
      '..\\..\\passwords.json',
      'subdir/../../../root',
    ];

    for (const path of maliciousPaths) {
      await expect(fsService.readFile(path)).rejects.toThrowError(
        expect.objectContaining({ code: ErrorCode.PATH_NOT_ALLOWED })
      );
    }
  });

  it('blocks path traversal save attempts with PATH_NOT_ALLOWED', async () => {
    const maliciousPaths = [
      '../overwrite.md',
      '../../Desktop/malicious.bat',
      '..\\windows\\malware.exe',
    ];

    for (const path of maliciousPaths) {
      await expect(fsService.saveFile(path, 'malicious payload')).rejects.toThrowError(
        expect.objectContaining({ code: ErrorCode.PATH_NOT_ALLOWED })
      );
    }
  });

  it('rejects invalid or empty paths', async () => {
    await expect(fsService.readFile('')).rejects.toThrowError(
      expect.objectContaining({ code: ErrorCode.INVALID_INPUT })
    );
    await expect(fsService.readFile(null)).rejects.toThrowError(
      expect.objectContaining({ code: ErrorCode.INVALID_INPUT })
    );
  });

  it('safely handles deeply nested and malformed Markdown without crash', () => {
    const malformed = '[[[[[[[[[[嵌套链接]]]]]]]]]]\n\n' + '> > > > > > > 深度引用\n\n' + '```\n未闭合代码块';
    const { html } = markdownService.render(malformed);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('safely handles corrupted or malformed YAML frontmatter', () => {
    const corruptedYaml = '---\n: invalid: [[\n---\n# Document';
    const { frontmatter, html } = markdownService.render(corruptedYaml);
    expect(html).toContain('<h1>Document</h1>');
  });
});
