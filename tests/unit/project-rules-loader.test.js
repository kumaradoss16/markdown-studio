import { describe, it, expect } from 'vitest';
import { ProjectRulesLoader, ProjectConfigError, MAX_CONFIG_SIZE_BYTES } from '../../src/services/project-rules-loader.js';

describe('ProjectRulesLoader (Release 0.7)', () => {
  const loader = new ProjectRulesLoader();

  it('parses valid configuration with version, profile, and rules', () => {
    const json = JSON.stringify({
      version: 1,
      profile: 'docs-repo',
      failOn: 'error',
      rules: {
        RULE_MISSING_H1: { enabled: true, severity: 'ERROR' }
      },
      coverage: {
        requiredFiles: ['README.md']
      }
    });

    const parsed = loader.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.profile).toBe('docs-repo');
    expect(parsed.rules.RULE_MISSING_H1.severity).toBe('ERROR');
  });

  it('rejects invalid JSON syntax (fail-closed)', () => {
    expect(() => loader.parse('{ malformed: true, ')).toThrow(ProjectConfigError);
  });

  it('rejects configuration exceeding 64KB size limit', () => {
    const hugePadding = ' '.repeat(MAX_CONFIG_SIZE_BYTES + 10);
    const hugeJson = `{"version": 1, "comment": "${hugePadding}"}`;
    expect(() => loader.parse(hugeJson)).toThrow(/exceeds maximum allowed size/);
  });

  it('rejects unknown base profile', () => {
    const json = JSON.stringify({ version: 1, profile: 'invalid-profile' });
    expect(() => loader.parse(json)).toThrow(/Unknown base profile/);
  });

  it('rejects unknown rule IDs (Invariant 5)', () => {
    const json = JSON.stringify({
      version: 1,
      rules: {
        RULE_UNKNOWN_NONEXISTENT_CHECK: { enabled: true }
      }
    });
    expect(() => loader.parse(json)).toThrow(/Unknown rule ID/);
  });

  it('rejects invalid severity values', () => {
    const json = JSON.stringify({
      version: 1,
      rules: {
        RULE_MISSING_H1: { enabled: true, severity: 'CRITICAL_DISASTER' }
      }
    });
    expect(() => loader.parse(json)).toThrow(/Invalid severity/);
  });

  it('rejects path traversal in load() call', async () => {
    const mockAdapter = {
      fileExists: () => true,
      readFile: () => '{}'
    };
    await expect(loader.load('../../outside/qa.json', mockAdapter)).rejects.toThrow(/attempts directory traversal/);
  });

  it('returns null if config file does not exist', async () => {
    const mockAdapter = {
      fileExists: () => false,
      readFile: () => ''
    };
    const res = await loader.load('.devspirehub/qa.json', mockAdapter);
    expect(res).toBeNull();
  });
});
