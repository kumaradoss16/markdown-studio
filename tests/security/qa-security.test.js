import { describe, it, expect } from 'vitest';
import { resolveWorkspacePath, isPrivateNetworkHost, ProjectLinkChecker } from '../../src/services/project-link-checker.js';
import { ProjectRulesLoader } from '../../src/services/project-rules-loader.js';
import { NavigationChecker } from '../../src/services/navigation-checker.js';
import { RuleId } from '../../src/services/quality-checker.js';

describe('QA Security & Boundary Mitigations (Release 0.7)', () => {
  const linkChecker = new ProjectLinkChecker();
  const rulesLoader = new ProjectRulesLoader();
  const navChecker = new NavigationChecker();

  describe('Invariant 4: Workspace Boundary & Path Traversal Guards', () => {
    it('blocks relative parent escapes in links', () => {
      const { escapesRoot } = resolveWorkspacePath('docs/guide.md', '../../../etc/shadow');
      expect(escapesRoot).toBe(true);
    });

    it('blocks absolute paths in links', () => {
      const { escapesRoot } = resolveWorkspacePath('docs/guide.md', '/var/log/system.log');
      expect(escapesRoot).toBe(true);
    });

    it('blocks Windows drive letters in links', () => {
      const { escapesRoot } = resolveWorkspacePath('docs/guide.md', 'C:\\Windows\\System32\\cmd.exe');
      expect(escapesRoot).toBe(true);
    });

    it('blocks path traversal in config loading', async () => {
      const mockAdapter = {
        fileExists: () => true,
        readFile: () => '{}'
      };
      await expect(rulesLoader.load('../../../secret/qa.json', mockAdapter)).rejects.toThrow(/attempts directory traversal/);
    });

    it('emits RULE_PATH_TRAVERSAL on malicious navigation link', () => {
      const navMap = new Map([
        ['SUMMARY.md', '* [Secret](../../../../etc/passwd)']
      ]);
      const res = navChecker.checkNavigation(navMap, new Set(['SUMMARY.md']), ['SUMMARY.md']);
      const traversal = res.diagnostics.find(d => d.ruleId === RuleId.PATH_TRAVERSAL);
      expect(traversal).toBeDefined();
    });
  });

  describe('Invariant 11: SSRF Protection for Remote URLs', () => {
    it('blocks cloud metadata endpoint 169.254.169.254', () => {
      expect(isPrivateNetworkHost('169.254.169.254')).toBe(true);
    });

    it('blocks localhost and loopback variations', () => {
      expect(isPrivateNetworkHost('127.0.0.1')).toBe(true);
      expect(isPrivateNetworkHost('localhost')).toBe(true);
      expect(isPrivateNetworkHost('localhost:8080')).toBe(true);
      expect(isPrivateNetworkHost('::1')).toBe(true);
    });

    it('blocks private IPv4 RFC 1918 subnets', () => {
      expect(isPrivateNetworkHost('10.0.0.1')).toBe(true);
      expect(isPrivateNetworkHost('172.16.0.1')).toBe(true);
      expect(isPrivateNetworkHost('192.168.1.254')).toBe(true);
    });

    it('emits SSRF blocked diagnostic when remote check targets private host', async () => {
      const docGraph = new Map([
        ['guide.md', {
          headings: [],
          links: [
            {
              isLocal: false,
              isRemote: true,
              isAnchor: false,
              href: 'http://169.254.169.254/latest/meta-data/',
              raw: '[AWS Metadata](http://169.254.169.254/latest/meta-data/)',
              line: 3,
              text: 'AWS Metadata'
            }
          ],
          images: []
        }]
      ]);

      const diags = await linkChecker.checkWorkspaceLinks(docGraph, new Set(['guide.md']), { checkRemote: true });
      const ssrfDiag = diags.find(d => d.message.includes('SSRF Protection'));
      expect(ssrfDiag).toBeDefined();
      expect(ssrfDiag.ruleId).toBe(RuleId.PATH_TRAVERSAL);
    });
  });

  describe('Invariant 5: Fail-Closed Configuration', () => {
    it('fails closed when configuration is unexpectedly an array', () => {
      expect(() => rulesLoader.validateConfig([1, 2, 3])).toThrow(/Configuration must be a non-null JSON object/);
    });

    it('fails closed on unknown rule names', () => {
      expect(() => rulesLoader.validateConfig({
        version: 1,
        rules: {
          RULE_DANGEROUS_ARBITRARY_CODE: { enabled: true }
        }
      })).toThrow(/Unknown rule ID/);
    });
  });
});
