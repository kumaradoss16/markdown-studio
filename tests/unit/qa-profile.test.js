import { describe, it, expect } from 'vitest';
import { QaProfileService, BUILTIN_PROFILES } from '../../src/services/qa-profile-service.js';
import { RuleId, DiagnosticSeverity } from '../../src/services/quality-checker.js';

describe('QaProfileService (Release 0.7)', () => {
  const service = new QaProfileService();

  it('defines all required built-in profiles', () => {
    expect(BUILTIN_PROFILES.default).toBeDefined();
    expect(BUILTIN_PROFILES.strict).toBeDefined();
    expect(BUILTIN_PROFILES['docs-repo']).toBeDefined();
    expect(BUILTIN_PROFILES['ci-blocking']).toBeDefined();
  });

  it('getProfile returns an isolated deep clone', () => {
    const p1 = service.getProfile('strict');
    const p2 = service.getProfile('strict');
    expect(p1).toEqual(p2);
    expect(p1).not.toBe(p2);

    p1.failOn = 'warning';
    expect(p2.failOn).toBe('error');
  });

  it('throws descriptive error on unknown profile name', () => {
    expect(() => service.getProfile('unknown-profile')).toThrow(/Unknown QA validation profile/);
  });

  it('strict profile elevates warnings to ERROR', () => {
    const strict = service.getProfile('strict');
    expect(strict.rules[RuleId.MISSING_H1].severity).toBe(DiagnosticSeverity.ERROR);
    expect(strict.rules[RuleId.BROKEN_LOCAL_LINK].severity).toBe(DiagnosticSeverity.ERROR);
    expect(strict.rules[RuleId.MISSING_ALT_TEXT].severity).toBe(DiagnosticSeverity.ERROR);
    expect(strict.rules[RuleId.STALE_TOC].severity).toBe(DiagnosticSeverity.ERROR);
  });

  it('ci-blocking profile focuses on blocking invariants', () => {
    const ci = service.getProfile('ci-blocking');
    expect(ci.rules[RuleId.BROKEN_LOCAL_LINK].enabled).toBe(true);
    expect(ci.rules[RuleId.BROKEN_LOCAL_LINK].severity).toBe(DiagnosticSeverity.ERROR);
    expect(ci.rules[RuleId.BROKEN_CROSS_DOC_ANCHOR].enabled).toBe(true);
    expect(ci.rules[RuleId.UNCLOSED_CODEBLOCK].severity).toBe(DiagnosticSeverity.ERROR);
    expect(ci.rules[RuleId.MISSING_H1].enabled).toBe(false);
  });

  it('mergeProfile correctly overlays rules, coverage, and scalar properties', () => {
    const base = service.getProfile('default');
    const overrides = {
      failOn: 'warning',
      rules: {
        [RuleId.MISSING_H1]: { enabled: false },
        [RuleId.BROKEN_CROSS_DOC_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR }
      },
      coverage: {
        requiredFiles: ['README.md', 'CHANGELOG.md'],
        flagOrphanDocs: true
      },
      navigation: {
        sources: ['docs/SUMMARY.md']
      }
    };

    const merged = service.mergeProfile(base, overrides);
    expect(merged.failOn).toBe('warning');
    expect(merged.rules[RuleId.MISSING_H1].enabled).toBe(false);
    expect(merged.rules[RuleId.BROKEN_CROSS_DOC_ANCHOR].enabled).toBe(true);
    expect(merged.coverage.requiredFiles).toEqual(['README.md', 'CHANGELOG.md']);
    expect(merged.coverage.flagOrphanDocs).toBe(true);
    expect(merged.navigation.sources).toEqual(['docs/SUMMARY.md']);
  });
});
