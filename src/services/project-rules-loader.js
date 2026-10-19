import { RuleId, DiagnosticSeverity } from './quality-checker.js';
import { BUILTIN_PROFILES } from './qa-profile-service.js';

export const MAX_CONFIG_SIZE_BYTES = 64 * 1024; // 64 KB

export class ProjectConfigError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProjectConfigError';
    this.details = details;
  }
}

/**
 * Loads, validates, and resolves .devspirehub/qa.json project configuration files.
 * Enforces Invariant 4 (Workspace Boundaries) and Invariant 5 (Fail-Closed Configuration).
 */
export class ProjectRulesLoader {
  constructor(options = {}) {
    this.maxSizeBytes = options.maxSizeBytes || MAX_CONFIG_SIZE_BYTES;
    this.knownRuleIds = new Set(Object.values(RuleId));
    this.knownSeverities = new Set(Object.values(DiagnosticSeverity));
    this.knownProfiles = new Set(Object.keys(BUILTIN_PROFILES));
  }

  /**
   * Validates raw parsed JSON configuration against the schema.
   * Throws ProjectConfigError if invalid (Fail-Closed).
   * @param {any} raw
   * @returns {Object} validated configuration
   */
  validateConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ProjectConfigError('Configuration must be a non-null JSON object');
    }

    // Version check
    if (raw.version !== undefined && raw.version !== 1) {
      throw new ProjectConfigError(`Unsupported configuration version "${raw.version}". Only version 1 is supported.`);
    }

    // Profile check
    if (raw.profile !== undefined) {
      if (typeof raw.profile !== 'string' || !this.knownProfiles.has(raw.profile)) {
        throw new ProjectConfigError(
          `Unknown base profile "${raw.profile}". Available profiles: ${Array.from(this.knownProfiles).join(', ')}`
        );
      }
    }

    // failOn check
    if (raw.failOn !== undefined) {
      const validFailOn = ['error', 'warning'];
      if (!validFailOn.includes(raw.failOn)) {
        throw new ProjectConfigError(`Invalid failOn "${raw.failOn}". Allowed values: error, warning`);
      }
    }

    // include / exclude check
    if (raw.include !== undefined) {
      if (!Array.isArray(raw.include) || !raw.include.every(s => typeof s === 'string')) {
        throw new ProjectConfigError('"include" must be an array of glob strings');
      }
    }
    if (raw.exclude !== undefined) {
      if (!Array.isArray(raw.exclude) || !raw.exclude.every(s => typeof s === 'string')) {
        throw new ProjectConfigError('"exclude" must be an array of glob strings');
      }
    }

    // Rules check
    if (raw.rules !== undefined) {
      if (typeof raw.rules !== 'object' || Array.isArray(raw.rules) || raw.rules === null) {
        throw new ProjectConfigError('"rules" must be an object mapping rule IDs to configurations');
      }
      for (const [ruleId, ruleCfg] of Object.entries(raw.rules)) {
        if (!this.knownRuleIds.has(ruleId)) {
          throw new ProjectConfigError(
            `Unknown rule ID "${ruleId}". Available rules: ${Array.from(this.knownRuleIds).join(', ')}`
          );
        }
        if (typeof ruleCfg !== 'object' || ruleCfg === null) {
          throw new ProjectConfigError(`Rule configuration for "${ruleId}" must be an object`);
        }
        if (ruleCfg.enabled !== undefined && typeof ruleCfg.enabled !== 'boolean') {
          throw new ProjectConfigError(`Rule "${ruleId}.enabled" must be a boolean`);
        }
        if (ruleCfg.severity !== undefined) {
          const upperSev = String(ruleCfg.severity).toUpperCase();
          if (!this.knownSeverities.has(upperSev)) {
            throw new ProjectConfigError(
              `Invalid severity "${ruleCfg.severity}" for rule "${ruleId}". Allowed: ERROR, WARNING, INFO`
            );
          }
          ruleCfg.severity = upperSev;
        }
      }
    }

    // Coverage check
    if (raw.coverage !== undefined) {
      if (typeof raw.coverage !== 'object' || Array.isArray(raw.coverage) || raw.coverage === null) {
        throw new ProjectConfigError('"coverage" must be an object');
      }
      if (raw.coverage.requiredFiles !== undefined) {
        if (!Array.isArray(raw.coverage.requiredFiles) || !raw.coverage.requiredFiles.every(s => typeof s === 'string')) {
          throw new ProjectConfigError('"coverage.requiredFiles" must be an array of string file paths');
        }
      }
      if (raw.coverage.requiredSections !== undefined) {
        if (typeof raw.coverage.requiredSections !== 'object' || raw.coverage.requiredSections === null) {
          throw new ProjectConfigError('"coverage.requiredSections" must be an object mapping files to section lists');
        }
        for (const [file, sections] of Object.entries(raw.coverage.requiredSections)) {
          if (!Array.isArray(sections) || !sections.every(s => typeof s === 'string')) {
            throw new ProjectConfigError(`"coverage.requiredSections[${file}]" must be an array of heading title strings`);
          }
        }
      }
      if (raw.coverage.flagOrphanDocs !== undefined && typeof raw.coverage.flagOrphanDocs !== 'boolean') {
        throw new ProjectConfigError('"coverage.flagOrphanDocs" must be a boolean');
      }
    }

    // Navigation check
    if (raw.navigation !== undefined) {
      if (typeof raw.navigation !== 'object' || Array.isArray(raw.navigation) || raw.navigation === null) {
        throw new ProjectConfigError('"navigation" must be an object');
      }
      if (raw.navigation.sources !== undefined) {
        if (!Array.isArray(raw.navigation.sources) || !raw.navigation.sources.every(s => typeof s === 'string')) {
          throw new ProjectConfigError('"navigation.sources" must be an array of string file paths');
        }
      }
    }

    // Links check
    if (raw.links !== undefined) {
      if (typeof raw.links !== 'object' || Array.isArray(raw.links) || raw.links === null) {
        throw new ProjectConfigError('"links" must be an object');
      }
      if (raw.links.checkRemote !== undefined && typeof raw.links.checkRemote !== 'boolean') {
        throw new ProjectConfigError('"links.checkRemote" must be a boolean');
      }
      if (raw.links.remoteTimeoutMs !== undefined && (typeof raw.links.remoteTimeoutMs !== 'number' || raw.links.remoteTimeoutMs <= 0)) {
        throw new ProjectConfigError('"links.remoteTimeoutMs" must be a positive number');
      }
      if (raw.links.maxRemoteConcurrency !== undefined && (typeof raw.links.maxRemoteConcurrency !== 'number' || raw.links.maxRemoteConcurrency <= 0)) {
        throw new ProjectConfigError('"links.maxRemoteConcurrency" must be a positive number');
      }
    }

    return raw;
  }

  /**
   * Parses and validates raw JSON string content.
   * @param {string} jsonText
   * @returns {Object}
   */
  parse(jsonText) {
    if (typeof jsonText !== 'string') {
      throw new ProjectConfigError('Configuration content must be a string');
    }

    // Check size limit (64 KB)
    const byteLength = new TextEncoder().encode(jsonText).length;
    if (byteLength > this.maxSizeBytes) {
      throw new ProjectConfigError(`Configuration file exceeds maximum allowed size of ${this.maxSizeBytes} bytes (got ${byteLength} bytes)`);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new ProjectConfigError(`Malformed JSON syntax in configuration: ${err.message}`);
    }

    return this.validateConfig(parsed);
  }

  /**
   * Loads configuration from a reader function or filesystem adapter.
   * If config file does not exist, returns null.
   * If config file exists but is invalid, throws ProjectConfigError.
   * @param {string} configPath
   * @param {{ readFile: (path: string) => Promise<string>|string, fileExists: (path: string) => Promise<boolean>|boolean }} adapter
   * @returns {Promise<Object|null>}
   */
  async load(configPath, adapter) {
    if (!adapter || typeof adapter.fileExists !== 'function' || typeof adapter.readFile !== 'function') {
      throw new ProjectConfigError('FileSystem adapter with fileExists and readFile is required');
    }

    // Guard against path traversal outside expected boundaries
    if (configPath.includes('../') || configPath.includes('..\\')) {
      throw new ProjectConfigError(`Unsafe config path "${configPath}" attempts directory traversal`);
    }

    const exists = await adapter.fileExists(configPath);
    if (!exists) {
      return null;
    }

    const content = await adapter.readFile(configPath);
    return this.parse(content);
  }
}

export const projectRulesLoader = new ProjectRulesLoader();
