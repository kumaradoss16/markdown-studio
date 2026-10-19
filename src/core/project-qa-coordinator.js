import { eventBus, AppEvents } from '../app/events.js';
import { qualityChecker, QualityChecker } from '../services/quality-checker.js';
import { markdownPipeline } from '../services/markdown-pipeline.js';
import { qaProfileService } from '../services/qa-profile-service.js';
import { projectRulesLoader, ProjectConfigError } from '../services/project-rules-loader.js';
import { projectLinkChecker } from '../services/project-link-checker.js';
import { navigationChecker } from '../services/navigation-checker.js';
import { coverageReporter } from '../services/coverage-reporter.js';
import { qaReportWriter } from '../services/qa-report-writer.js';

/**
 * Matches a relative path against simple glob patterns (e.g. `**\/*.md`, `**\/node_modules\/**`).
 * @param {string} filePath
 * @param {Array<string>} patterns
 * @returns {boolean}
 */
export function matchesGlobPattern(filePath, patterns = []) {
  if (!patterns || patterns.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');

  return patterns.some(pattern => {
    const normPattern = pattern.replace(/\\/g, '/');
    if (normPattern === '**/*.md') {
      return normalized.endsWith('.md');
    }
    if (normPattern.startsWith('**/') && normPattern.endsWith('/**')) {
      const segment = normPattern.slice(3, -3);
      return normalized.includes(`/${segment}/`) || normalized.startsWith(`${segment}/`);
    }
    // Generic regex conversion for simple globs
    const regexStr = '^' + normPattern
      .replace(/\./g, '\\.')
      .replace(/\*\*\//g, '(.+/)?')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*') + '$';
    try {
      return new RegExp(regexStr).test(normalized);
    } catch {
      return normalized.includes(normPattern);
    }
  });
}

/**
 * Project QA Coordinator.
 * Orchestrates multi-file workspace analysis, enforces security boundaries,
 * and compiles deterministic QA reports.
 */
export class ProjectQaCoordinator {
  constructor(deps = {}) {
    this.qualityChecker = deps.qualityChecker || qualityChecker;
    this.pipeline = deps.pipeline || markdownPipeline;
    this.profileService = deps.profileService || qaProfileService;
    this.rulesLoader = deps.rulesLoader || projectRulesLoader;
    this.linkChecker = deps.linkChecker || projectLinkChecker;
    this.navChecker = deps.navChecker || navigationChecker;
    this.coverageReporter = deps.coverageReporter || coverageReporter;
    this.reportWriter = deps.reportWriter || qaReportWriter;
    this.bus = deps.eventBus || eventBus;

    this.currentSession = null;
    this.isCancelled = false;
  }

  /**
   * Cancels the currently running QA scan if active.
   */
  cancel() {
    this.isCancelled = true;
  }

  /**
   * Executes a complete QA scan on the provided workspace.
   * @param {Object} options
   * @param {string} [options.workspaceRoot='.']
   * @param {string|Object} [options.profile='default']
   * @param {string} [options.configPath='.devspirehub/qa.json']
   * @param {Object} [options.configOverrides] - Optional in-memory config overrides
   * @param {Map<string, string>} [options.fileMap] - Map of relativePath -> content
   * @param {Array<string>} [options.allFiles] - List of all relative file paths in workspace
   * @param {Object} [options.fsAdapter] - FileSystem adapter with readFile, listFiles, fileExists
   * @returns {Promise<Object>} qa-report-v1 structured object
   */
  async runQa(options = {}) {
    this.isCancelled = false;
    const startTime = new Date().toISOString();
    const workspaceRoot = options.workspaceRoot || '.';

    let baseProfile;
    let finalProfile;

    // 1. Resolve Profile & Load .devspirehub/qa.json (Fail-Closed)
    try {
      let configData = options.configOverrides || null;

      if (!configData && options.fsAdapter) {
        const configPath = options.configPath || '.devspirehub/qa.json';
        configData = await this.rulesLoader.load(configPath, options.fsAdapter);
      }

      const requestedProfileName = (typeof options.profile === 'string' && options.profile)
        || configData?.profile
        || 'default';

      if (typeof options.profile === 'object' && options.profile !== null) {
        baseProfile = options.profile;
      } else {
        baseProfile = this.profileService.getProfile(requestedProfileName);
      }

      finalProfile = this.profileService.mergeProfile(baseProfile, configData || {});
      if (options.failOn) {
        finalProfile.failOn = options.failOn;
      }
    } catch (err) {
      // Invariant 5: Fail-closed configuration aborts with exit code 2
      const fatalReport = this.reportWriter.buildJsonReport({
        timestamp: startTime,
        workspaceRoot,
        profileName: 'unknown',
        failOn: options.failOn || 'error',
        fatalError: true,
        summary: { filesScanned: 0, totalDiagnostics: 1, errors: 1, warnings: 0, info: 0 },
        diagnostics: [{
          id: 'diag-FATAL-CONFIG-ERROR',
          ruleId: 'RULE_CONFIG_ERROR',
          severity: 'ERROR',
          file: options.configPath || '.devspirehub/qa.json',
          line: 1,
          column: 1,
          message: `Fatal configuration error: ${err.message}`,
          target: ''
        }]
      });
      this.bus?.emit?.(AppEvents.QA_RUN_COMPLETED, fatalReport);
      return fatalReport;
    }

    // 2. Discover & Collect Workspace Files
    const allFilesSet = new Set();
    const fileContentsMap = new Map();

    if (options.fileMap instanceof Map) {
      for (const [path, content] of options.fileMap.entries()) {
        const norm = path.replace(/\\/g, '/').replace(/^\.\//, '');
        allFilesSet.add(norm);
        fileContentsMap.set(norm, content);
      }
    } else if (options.fsAdapter && typeof options.fsAdapter.listFiles === 'function') {
      const listed = await options.fsAdapter.listFiles(workspaceRoot);
      for (const p of listed) {
        const norm = p.replace(/\\/g, '/').replace(/^\.\//, '');
        allFilesSet.add(norm);
      }
    }

    if (Array.isArray(options.allFiles)) {
      for (const p of options.allFiles) {
        allFilesSet.add(p.replace(/\\/g, '/').replace(/^\.\//, ''));
      }
    }

    // Filter Markdown files by profile include / exclude
    const mdFilesToScan = [];
    for (const filePath of allFilesSet) {
      const isMd = filePath.endsWith('.md') || filePath.endsWith('.markdown');
      if (!isMd) continue;

      const isExcluded = matchesGlobPattern(filePath, finalProfile.exclude);
      if (isExcluded) continue;

      const isIncluded = matchesGlobPattern(filePath, finalProfile.include);
      if (isIncluded) {
        mdFilesToScan.push(filePath);
      }
    }
    mdFilesToScan.sort();

    this.bus?.emit?.(AppEvents.QA_RUN_STARTED, {
      workspaceRoot,
      profile: finalProfile.name,
      totalFiles: mdFilesToScan.length
    });

    const diagnostics = [];
    const docGraph = new Map();

    // 3. Scan & Process Each Document through Authoritative MarkdownPipeline
    for (let i = 0; i < mdFilesToScan.length; i++) {
      if (this.isCancelled) {
        break;
      }

      const filePath = mdFilesToScan[i];
      this.bus?.emit?.(AppEvents.QA_RUN_PROGRESS, {
        current: i + 1,
        total: mdFilesToScan.length,
        currentFile: filePath
      });

      let content = fileContentsMap.get(filePath);
      if (content === undefined && options.fsAdapter) {
        try {
          content = await options.fsAdapter.readFile(filePath);
          fileContentsMap.set(filePath, content);
        } catch (err) {
          diagnostics.push({
            id: `diag-FILE-READ-ERROR-${filePath}`,
            ruleId: 'RULE_FILE_READ_ERROR',
            severity: 'ERROR',
            file: filePath,
            line: 1,
            column: 1,
            message: `Failed to read document "${filePath}": ${err.message}`,
            target: filePath
          });
          continue;
        }
      }

      const docSnapshot = { id: filePath, path: filePath, content: content || '', revision: 1 };

      // Invariant 8: Single parser authority
      const ast = this.pipeline.process(docSnapshot);
      docGraph.set(filePath, {
        content: content || '',
        headings: ast.headings || [],
        links: ast.links || [],
        images: ast.images || [],
        codeBlocks: ast.codeBlocks || []
      });

      // Run QualityChecker on single doc with active profile
      const docDiags = this.qualityChecker.check(docSnapshot, {
        profile: finalProfile,
        file: filePath,
        checkEmptyDoc: true
      });
      diagnostics.push(...docDiags);
    }

    // 4. Project-Wide Link and Cross-Doc Anchor Verification
    const crossDocAnchorRule = finalProfile.rules?.RULE_BROKEN_CROSS_DOC_ANCHOR;
    const brokenLinkRule = finalProfile.rules?.RULE_BROKEN_LOCAL_LINK;
    const shouldCheckLinks = crossDocAnchorRule?.enabled !== false || brokenLinkRule?.enabled !== false;

    if (shouldCheckLinks && !this.isCancelled) {
      const linkDiags = await this.linkChecker.checkWorkspaceLinks(docGraph, allFilesSet, {
        checkRemote: finalProfile.links?.checkRemote,
        remoteTimeoutMs: finalProfile.links?.remoteTimeoutMs
      });

      // Filter through profile overrides
      for (const d of linkDiags) {
        const adjusted = this.qualityChecker._applyProfile(d, finalProfile);
        if (adjusted) {
          diagnostics.push(adjusted);
        }
      }
    }

    // 5. Navigation Tree Verification
    let navSummary = {
      sourcesChecked: [],
      totalNavItems: 0,
      brokenNavItems: 0,
      duplicateNavItems: 0,
      unlistedDocs: []
    };

    if (!this.isCancelled) {
      const navSources = this.navChecker.findNavSources(allFilesSet, finalProfile.navigation?.sources);
      if (navSources.length > 0) {
        const navContents = new Map();
        for (const navPath of navSources) {
          let navText = fileContentsMap.get(navPath);
          if (navText === undefined && options.fsAdapter) {
            try {
              navText = await options.fsAdapter.readFile(navPath);
            } catch {
              navText = '';
            }
          }
          navContents.set(navPath, navText || '');
        }

        const navResult = this.navChecker.checkNavigation(navContents, allFilesSet, mdFilesToScan, {
          flagUnlistedPages: finalProfile.rules?.RULE_UNLISTED_NAV_PAGE?.enabled !== false
        });

        navSummary = navResult.summary;
        for (const d of navResult.diagnostics) {
          const adjusted = this.qualityChecker._applyProfile(d, finalProfile);
          if (adjusted) {
            diagnostics.push(adjusted);
          }
        }
      }
    }

    // 6. Documentation Coverage Reporting
    let coverageData = {
      requiredFiles: { total: 0, matched: 0, missing: [] },
      requiredSections: { total: 0, matched: 0, missing: [] },
      orphanDocs: [],
      emptyDocs: [],
      missingH1Docs: []
    };

    if (!this.isCancelled) {
      const navReferenced = navSummary.unlistedDocs.length > 0
        ? mdFilesToScan.filter(d => !navSummary.unlistedDocs.includes(d))
        : [];

      const covResult = this.coverageReporter.evaluateCoverage(
        docGraph,
        allFilesSet,
        finalProfile.coverage || {},
        navReferenced
      );

      coverageData = covResult.coverage;
      for (const d of covResult.diagnostics) {
        const adjusted = this.qualityChecker._applyProfile(d, finalProfile);
        if (adjusted) {
          diagnostics.push(adjusted);
        }
      }
    }

    // 7. Aggregate Findings and Generate Final Report
    const sortedDiags = this.reportWriter.sortDiagnostics(diagnostics);
    const summary = {
      filesScanned: mdFilesToScan.length,
      totalDiagnostics: sortedDiags.length,
      errors: sortedDiags.filter(d => d.severity === 'ERROR').length,
      warnings: sortedDiags.filter(d => d.severity === 'WARNING').length,
      info: sortedDiags.filter(d => d.severity === 'INFO').length
    };

    const finalReport = this.reportWriter.buildJsonReport({
      timestamp: startTime,
      workspaceRoot,
      profile: finalProfile,
      failOn: finalProfile.failOn,
      summary,
      coverage: coverageData,
      navigation: navSummary,
      diagnostics: sortedDiags
    });

    this.bus?.emit?.(AppEvents.QA_RUN_COMPLETED, finalReport);
    return finalReport;
  }
}

export const projectQaCoordinator = new ProjectQaCoordinator();
