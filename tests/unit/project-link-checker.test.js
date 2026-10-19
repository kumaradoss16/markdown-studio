import { describe, it, expect } from 'vitest';
import { ProjectLinkChecker, resolveWorkspacePath, isPrivateNetworkHost } from '../../src/services/project-link-checker.js';
import { RuleId, DiagnosticSeverity } from '../../src/services/quality-checker.js';

describe('ProjectLinkChecker (Release 0.7)', () => {
  const checker = new ProjectLinkChecker();

  describe('resolveWorkspacePath', () => {
    it('resolves sibling relative paths safely', () => {
      const { resolved, escapesRoot } = resolveWorkspacePath('docs/guide.md', 'setup.md');
      expect(escapesRoot).toBe(false);
      expect(resolved).toBe('docs/setup.md');
    });

    it('resolves parent relative paths staying inside root', () => {
      const { resolved, escapesRoot } = resolveWorkspacePath('docs/sub/guide.md', '../intro.md');
      expect(escapesRoot).toBe(false);
      expect(resolved).toBe('docs/intro.md');
    });

    it('detects and flags traversal escaping root', () => {
      const { escapesRoot } = resolveWorkspacePath('docs/guide.md', '../../outside.txt');
      expect(escapesRoot).toBe(true);
    });

    it('detects absolute path root escape', () => {
      const { escapesRoot } = resolveWorkspacePath('guide.md', '/etc/passwd');
      expect(escapesRoot).toBe(true);
    });
  });

  describe('isPrivateNetworkHost (SSRF Guard)', () => {
    it('identifies loopback and private ranges', () => {
      expect(isPrivateNetworkHost('127.0.0.1')).toBe(true);
      expect(isPrivateNetworkHost('localhost')).toBe(true);
      expect(isPrivateNetworkHost('10.0.1.5')).toBe(true);
      expect(isPrivateNetworkHost('192.168.1.1')).toBe(true);
      expect(isPrivateNetworkHost('169.254.169.254')).toBe(true);
      expect(isPrivateNetworkHost('internal.company.local')).toBe(true);
    });

    it('permits public internet domains', () => {
      expect(isPrivateNetworkHost('github.com')).toBe(false);
      expect(isPrivateNetworkHost('example.com')).toBe(false);
    });
  });

  describe('checkWorkspaceLinks', () => {
    it('verifies valid cross-document anchors and flags missing anchors', async () => {
      const docGraph = new Map([
        ['docs/guide.md', {
          headings: [
            { anchor: 'installation', raw: '# Installation', level: 1 }
          ],
          links: [
            {
              isLocal: true,
              isAnchor: false,
              href: 'api.md#endpoints',
              raw: '[API](api.md#endpoints)',
              line: 5,
              text: 'API'
            },
            {
              isLocal: true,
              isAnchor: false,
              href: 'api.md#missing-anchor',
              raw: '[Broken](api.md#missing-anchor)',
              line: 10,
              text: 'Broken'
            }
          ],
          images: []
        }],
        ['docs/api.md', {
          headings: [
            { anchor: 'endpoints', raw: '## Endpoints', level: 2 }
          ],
          links: [],
          images: []
        }]
      ]);

      const workspaceFiles = new Set(['docs/guide.md', 'docs/api.md']);
      const diags = await checker.checkWorkspaceLinks(docGraph, workspaceFiles);

      const brokenCross = diags.find(d => d.ruleId === RuleId.BROKEN_CROSS_DOC_ANCHOR);
      expect(brokenCross).toBeDefined();
      expect(brokenCross.severity).toBe(DiagnosticSeverity.ERROR);
      expect(brokenCross.message).toContain('missing-anchor');
      expect(brokenCross.line).toBe(10);
    });

    it('flags broken local links when target file does not exist', async () => {
      const docGraph = new Map([
        ['index.md', {
          headings: [],
          links: [
            {
              isLocal: true,
              isAnchor: false,
              href: 'missing-file.md',
              raw: '[Missing](missing-file.md)',
              line: 3,
              text: 'Missing'
            }
          ],
          images: []
        }]
      ]);

      const workspaceFiles = new Set(['index.md']);
      const diags = await checker.checkWorkspaceLinks(docGraph, workspaceFiles);

      const brokenLink = diags.find(d => d.ruleId === RuleId.BROKEN_LOCAL_LINK);
      expect(brokenLink).toBeDefined();
      expect(brokenLink.severity).toBe(DiagnosticSeverity.ERROR);
      expect(brokenLink.message).toContain('missing-file.md');
    });

    it('flags path traversal on links and images', async () => {
      const docGraph = new Map([
        ['docs/note.md', {
          headings: [],
          links: [
            {
              isLocal: true,
              isAnchor: false,
              href: '../../../../root.txt',
              raw: '[Escape](../../../../root.txt)',
              line: 2,
              text: 'Escape'
            }
          ],
          images: [
            {
              isLocal: true,
              src: '../../../../secret.png',
              raw: '![Img](../../../../secret.png)',
              line: 8
            }
          ]
        }]
      ]);

      const workspaceFiles = new Set(['docs/note.md']);
      const diags = await checker.checkWorkspaceLinks(docGraph, workspaceFiles);

      const traversalDiags = diags.filter(d => d.ruleId === RuleId.PATH_TRAVERSAL);
      expect(traversalDiags.length).toBeGreaterThanOrEqual(2);
    });
  });
});
