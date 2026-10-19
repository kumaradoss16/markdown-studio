import { RuleId, DiagnosticSeverity } from './quality-checker.js';

/**
 * Built-in validation profiles for Documentation QA.
 */
export const BUILTIN_PROFILES = {
  default: {
    name: 'default',
    description: 'Standard single-document checks matching baseline editor diagnostics.',
    failOn: 'error',
    include: ['**/*.md'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/vendor/**'],
    rules: {
      [RuleId.MISSING_H1]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.HEADING_LEVEL_SKIP]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.UNCLOSED_CODEBLOCK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_INTERNAL_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_LOCAL_LINK]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.MISSING_LOCAL_IMAGE]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_ALT_TEXT]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.EMPTY_LINK]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.CORRUPT_TOC_MARKERS]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.STALE_TOC]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.BROKEN_CROSS_DOC_ANCHOR]: { enabled: false, severity: DiagnosticSeverity.ERROR },
      [RuleId.ORPHAN_DOCUMENT]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.DANGLING_NAV_ENTRY]: { enabled: false, severity: DiagnosticSeverity.ERROR },
      [RuleId.DUPLICATE_NAV_ENTRY]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.UNLISTED_NAV_PAGE]: { enabled: false, severity: DiagnosticSeverity.INFO },
      [RuleId.UNCOVERED_REQUIRED_SECTION]: { enabled: false, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_REQUIRED_DOC]: { enabled: false, severity: DiagnosticSeverity.ERROR },
      [RuleId.EMPTY_DOCUMENT]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.PATH_TRAVERSAL]: { enabled: true, severity: DiagnosticSeverity.ERROR }
    },
    coverage: {
      requiredFiles: [],
      requiredSections: {},
      flagOrphanDocs: false
    },
    navigation: {
      sources: []
    },
    links: {
      checkRemote: false,
      remoteTimeoutMs: 5000,
      maxRemoteConcurrency: 4
    }
  },

  strict: {
    name: 'strict',
    description: 'Elevated quality profile converting warnings to errors for high-rigor documents.',
    failOn: 'error',
    include: ['**/*.md'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/vendor/**'],
    rules: {
      [RuleId.MISSING_H1]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.HEADING_LEVEL_SKIP]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.UNCLOSED_CODEBLOCK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_INTERNAL_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_LOCAL_LINK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_LOCAL_IMAGE]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_ALT_TEXT]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.EMPTY_LINK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.CORRUPT_TOC_MARKERS]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.STALE_TOC]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_CROSS_DOC_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.ORPHAN_DOCUMENT]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.DANGLING_NAV_ENTRY]: { enabled: false, severity: DiagnosticSeverity.ERROR },
      [RuleId.DUPLICATE_NAV_ENTRY]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.UNLISTED_NAV_PAGE]: { enabled: false, severity: DiagnosticSeverity.INFO },
      [RuleId.UNCOVERED_REQUIRED_SECTION]: { enabled: false, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_REQUIRED_DOC]: { enabled: false, severity: DiagnosticSeverity.ERROR },
      [RuleId.EMPTY_DOCUMENT]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.PATH_TRAVERSAL]: { enabled: true, severity: DiagnosticSeverity.ERROR }
    },
    coverage: {
      requiredFiles: [],
      requiredSections: {},
      flagOrphanDocs: false
    },
    navigation: {
      sources: []
    },
    links: {
      checkRemote: false,
      remoteTimeoutMs: 5000,
      maxRemoteConcurrency: 4
    }
  },

  'docs-repo': {
    name: 'docs-repo',
    description: 'Comprehensive workspace-wide quality checks for documentation repositories.',
    failOn: 'error',
    include: ['**/*.md'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/vendor/**'],
    rules: {
      [RuleId.MISSING_H1]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.HEADING_LEVEL_SKIP]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.UNCLOSED_CODEBLOCK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_INTERNAL_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_LOCAL_LINK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_LOCAL_IMAGE]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_ALT_TEXT]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.EMPTY_LINK]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.CORRUPT_TOC_MARKERS]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.STALE_TOC]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.BROKEN_CROSS_DOC_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.ORPHAN_DOCUMENT]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.DANGLING_NAV_ENTRY]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.DUPLICATE_NAV_ENTRY]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.UNLISTED_NAV_PAGE]: { enabled: true, severity: DiagnosticSeverity.INFO },
      [RuleId.UNCOVERED_REQUIRED_SECTION]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_REQUIRED_DOC]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.EMPTY_DOCUMENT]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.PATH_TRAVERSAL]: { enabled: true, severity: DiagnosticSeverity.ERROR }
    },
    coverage: {
      requiredFiles: ['README.md'],
      requiredSections: {},
      flagOrphanDocs: true
    },
    navigation: {
      sources: ['SUMMARY.md', 'docs/SUMMARY.md', 'nav.md']
    },
    links: {
      checkRemote: false,
      remoteTimeoutMs: 5000,
      maxRemoteConcurrency: 4
    }
  },

  'ci-blocking': {
    name: 'ci-blocking',
    description: 'High-confidence blocking subset engineered for pull-request gating and CI pipelines.',
    failOn: 'error',
    include: ['**/*.md'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/vendor/**'],
    rules: {
      [RuleId.MISSING_H1]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.HEADING_LEVEL_SKIP]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.UNCLOSED_CODEBLOCK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_INTERNAL_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.BROKEN_LOCAL_LINK]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_LOCAL_IMAGE]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_ALT_TEXT]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.EMPTY_LINK]: { enabled: true, severity: DiagnosticSeverity.WARNING },
      [RuleId.CORRUPT_TOC_MARKERS]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.STALE_TOC]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.BROKEN_CROSS_DOC_ANCHOR]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.ORPHAN_DOCUMENT]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.DANGLING_NAV_ENTRY]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.DUPLICATE_NAV_ENTRY]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.UNLISTED_NAV_PAGE]: { enabled: false, severity: DiagnosticSeverity.INFO },
      [RuleId.UNCOVERED_REQUIRED_SECTION]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.MISSING_REQUIRED_DOC]: { enabled: true, severity: DiagnosticSeverity.ERROR },
      [RuleId.EMPTY_DOCUMENT]: { enabled: false, severity: DiagnosticSeverity.WARNING },
      [RuleId.PATH_TRAVERSAL]: { enabled: true, severity: DiagnosticSeverity.ERROR }
    },
    coverage: {
      requiredFiles: ['README.md'],
      requiredSections: {},
      flagOrphanDocs: false
    },
    navigation: {
      sources: ['SUMMARY.md', 'docs/SUMMARY.md', 'nav.md']
    },
    links: {
      checkRemote: false,
      remoteTimeoutMs: 5000,
      maxRemoteConcurrency: 4
    }
  }
};

/**
 * Service managing QA validation profiles.
 */
export class QaProfileService {
  /**
   * Retrieves a deep clone of a built-in profile by name.
   * @param {string} [name='default']
   * @returns {Object}
   */
  getProfile(name = 'default') {
    const profile = BUILTIN_PROFILES[name];
    if (!profile) {
      throw new Error(`Unknown QA validation profile "${name}". Available profiles: ${Object.keys(BUILTIN_PROFILES).join(', ')}`);
    }
    return JSON.parse(JSON.stringify(profile));
  }

  /**
   * Lists all available profile descriptors.
   * @returns {Array<{ name: string, description: string }>}
   */
  listProfiles() {
    return Object.values(BUILTIN_PROFILES).map(p => ({
      name: p.name,
      description: p.description
    }));
  }

  /**
   * Deep merges base profile with project-specific configuration overrides.
   * @param {Object} baseProfile
   * @param {Object} [overrides={}]
   * @returns {Object}
   */
  mergeProfile(baseProfile, overrides = {}) {
    const merged = JSON.parse(JSON.stringify(baseProfile));

    if (overrides.failOn) {
      merged.failOn = overrides.failOn;
    }
    if (Array.isArray(overrides.include) && overrides.include.length > 0) {
      merged.include = [...overrides.include];
    }
    if (Array.isArray(overrides.exclude)) {
      merged.exclude = [...overrides.exclude];
    }

    // Merge rules
    if (overrides.rules && typeof overrides.rules === 'object') {
      merged.rules = merged.rules || {};
      for (const [ruleId, ruleCfg] of Object.entries(overrides.rules)) {
        if (!merged.rules[ruleId]) {
          merged.rules[ruleId] = {};
        }
        if (typeof ruleCfg.enabled === 'boolean') {
          merged.rules[ruleId].enabled = ruleCfg.enabled;
        }
        if (ruleCfg.severity) {
          merged.rules[ruleId].severity = ruleCfg.severity;
        }
      }
    }

    // Merge coverage settings
    if (overrides.coverage && typeof overrides.coverage === 'object') {
      merged.coverage = merged.coverage || {};
      if (Array.isArray(overrides.coverage.requiredFiles)) {
        merged.coverage.requiredFiles = [...overrides.coverage.requiredFiles];
      }
      if (overrides.coverage.requiredSections && typeof overrides.coverage.requiredSections === 'object') {
        merged.coverage.requiredSections = {
          ...(merged.coverage.requiredSections || {}),
          ...overrides.coverage.requiredSections
        };
      }
      if (typeof overrides.coverage.flagOrphanDocs === 'boolean') {
        merged.coverage.flagOrphanDocs = overrides.coverage.flagOrphanDocs;
      }
    }

    // Merge navigation settings
    if (overrides.navigation && typeof overrides.navigation === 'object') {
      merged.navigation = merged.navigation || {};
      if (Array.isArray(overrides.navigation.sources)) {
        merged.navigation.sources = [...overrides.navigation.sources];
      }
    }

    // Merge links settings
    if (overrides.links && typeof overrides.links === 'object') {
      merged.links = merged.links || {};
      if (typeof overrides.links.checkRemote === 'boolean') {
        merged.links.checkRemote = overrides.links.checkRemote;
      }
      if (typeof overrides.links.remoteTimeoutMs === 'number') {
        merged.links.remoteTimeoutMs = overrides.links.remoteTimeoutMs;
      }
      if (typeof overrides.links.maxRemoteConcurrency === 'number') {
        merged.links.maxRemoteConcurrency = overrides.links.maxRemoteConcurrency;
      }
    }

    return merged;
  }
}

export const qaProfileService = new QaProfileService();
