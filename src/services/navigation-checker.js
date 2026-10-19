import { RuleId, DiagnosticSeverity } from './quality-checker.js';
import { resolveWorkspacePath } from './project-link-checker.js';

/**
 * Validates navigation structures such as SUMMARY.md, nav.md, and table of contents trees.
 */
export class NavigationChecker {
  /**
   * Discovers declared or standard navigation files present in the workspace.
   * @param {Set<string>|Array<string>} allFiles
   * @param {Array<string>} [configuredSources]
   * @returns {Array<string>} found navigation files
   */
  findNavSources(allFiles, configuredSources = []) {
    const fileSet = allFiles instanceof Set ? allFiles : new Set(allFiles);
    const defaults = ['SUMMARY.md', 'docs/SUMMARY.md', 'nav.md', 'docs/nav.md'];
    const candidates = configuredSources && configuredSources.length > 0 ? configuredSources : defaults;

    const found = [];
    for (const cand of candidates) {
      const normalized = cand.replace(/\\/g, '/').replace(/^\.\//, '');
      if (fileSet.has(normalized)) {
        found.push(normalized);
      }
    }
    return found;
  }

  /**
   * Extracts navigation items from markdown text.
   * Finds markdown links in lists: e.g. `* [Title](target.md)` or `- [Title](target.md)` or `1. [Title](target.md)`.
   * @param {string} content
   * @returns {Array<{ title: string, href: string, line: number, raw: string }>}
   */
  parseNavItems(content = '') {
    const lines = content.split(/\r?\n/);
    const items = [];
    // Match bullet or numbered list with a markdown link
    const itemRegex = /^\s*(?:[-*+]|\d+\.)\s+\[([^\]]+)\]\(([^)]+)\)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = itemRegex.exec(line);
      if (match) {
        items.push({
          title: match[1].trim(),
          href: match[2].trim(),
          line: i + 1,
          raw: line.trim()
        });
      }
    }

    return items;
  }

  /**
   * Checks navigation sources against the workspace document set.
   * @param {Map<string, string>} navFileContents - Map of navFilePath -> markdown content
   * @param {Set<string>|Array<string>} allWorkspaceFiles - Set of workspace files
   * @param {Set<string>|Array<string>} allMarkdownDocs - Set of markdown docs in workspace
   * @param {Object} [options={}]
   * @returns {{ diagnostics: Array<Object>, summary: Object }}
   */
  checkNavigation(navFileContents, allWorkspaceFiles, allMarkdownDocs, options = {}) {
    const fileSet = allWorkspaceFiles instanceof Set ? allWorkspaceFiles : new Set(allWorkspaceFiles);
    const mdDocSet = allMarkdownDocs instanceof Set ? allMarkdownDocs : new Set(allMarkdownDocs);
    const diagnostics = [];

    const sourcesChecked = [];
    let totalNavItems = 0;
    let brokenNavItems = 0;
    let duplicateNavItems = 0;

    const referencedDocPaths = new Set();
    const seenHrefsBySource = new Map();

    for (const [navPath, content] of navFileContents.entries()) {
      sourcesChecked.push(navPath);
      const items = this.parseNavItems(content);
      const seenInThisFile = new Map();

      for (const item of items) {
        totalNavItems++;
        const rawHref = decodeURIComponent(item.href);
        const [cleanPath] = rawHref.split('#');

        if (!cleanPath) {
          continue; // anchor-only in nav
        }

        // Check path traversal
        const { resolved, escapesRoot } = resolveWorkspacePath(navPath, cleanPath);
        if (escapesRoot) {
          brokenNavItems++;
          diagnostics.push({
            id: `diag-${RuleId.PATH_TRAVERSAL}-${navPath}-${item.line}`,
            ruleId: RuleId.PATH_TRAVERSAL,
            severity: DiagnosticSeverity.ERROR,
            file: navPath,
            line: item.line,
            column: 1,
            message: `Navigation link "${item.href}" attempts unsafe path traversal outside workspace boundary.`,
            target: item.raw,
            fixAvailable: false
          });
          continue;
        }

        // Match target in workspace
        let resolvedTarget = null;
        if (fileSet.has(resolved)) {
          resolvedTarget = resolved;
        } else if (fileSet.has(cleanPath.replace(/^\.\//, ''))) {
          resolvedTarget = cleanPath.replace(/^\.\//, '');
        }

        if (!resolvedTarget) {
          brokenNavItems++;
          diagnostics.push({
            id: `diag-${RuleId.DANGLING_NAV_ENTRY}-${navPath}-${item.line}`,
            ruleId: RuleId.DANGLING_NAV_ENTRY,
            severity: DiagnosticSeverity.ERROR,
            file: navPath,
            line: item.line,
            column: 1,
            message: `Navigation link "${item.href}" points to non-existent file in workspace (resolved: "${resolved}").`,
            target: item.raw,
            fixAvailable: false
          });
        } else {
          referencedDocPaths.add(resolvedTarget);

          // Duplicate detection within the same navigation file
          if (seenInThisFile.has(resolvedTarget)) {
            duplicateNavItems++;
            const firstLine = seenInThisFile.get(resolvedTarget);
            diagnostics.push({
              id: `diag-${RuleId.DUPLICATE_NAV_ENTRY}-${navPath}-${item.line}`,
              ruleId: RuleId.DUPLICATE_NAV_ENTRY,
              severity: DiagnosticSeverity.WARNING,
              file: navPath,
              line: item.line,
              column: 1,
              message: `Duplicate navigation link to "${resolvedTarget}" (previously referenced on line ${firstLine}).`,
              target: item.raw,
              fixAvailable: false
            });
          } else {
            seenInThisFile.set(resolvedTarget, item.line);
          }
        }
      }

      seenHrefsBySource.set(navPath, seenInThisFile);
    }

    // Identify unlisted markdown pages if navigation sources exist
    const unlistedDocs = [];
    if (sourcesChecked.length > 0) {
      const navSet = new Set(sourcesChecked);
      for (const doc of mdDocSet) {
        // Exclude the navigation documents themselves
        if (navSet.has(doc)) continue;

        if (!referencedDocPaths.has(doc)) {
          unlistedDocs.push(doc);
          if (options.flagUnlistedPages) {
            diagnostics.push({
              id: `diag-${RuleId.UNLISTED_NAV_PAGE}-${doc}-1`,
              ruleId: RuleId.UNLISTED_NAV_PAGE,
              severity: DiagnosticSeverity.INFO,
              file: doc,
              line: 1,
              column: 1,
              message: `Document "${doc}" is not included in any navigation source.`,
              target: doc,
              fixAvailable: false
            });
          }
        }
      }
    }

    return {
      diagnostics,
      summary: {
        sourcesChecked,
        totalNavItems,
        brokenNavItems,
        duplicateNavItems,
        unlistedDocs: unlistedDocs.sort()
      }
    };
  }
}

export const navigationChecker = new NavigationChecker();
