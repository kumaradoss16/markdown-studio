import { RuleId, DiagnosticSeverity } from './quality-checker.js';
import { markdownPipeline } from './markdown-pipeline.js';

// Blocklist for SSRF prevention (private & link-local IP addresses)
const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i
];

/**
 * Normalizes relative paths using forward slashes and resolves '.' and '..'.
 * @param {string} basePath
 * @param {string} relativePath
 * @returns {{ resolved: string, escapesRoot: boolean }}
 */
export function resolveWorkspacePath(basePath, relativePath) {
  // Check for root escape prefixes
  if (relativePath.startsWith('/') || relativePath.startsWith('\\') || /^[a-zA-Z]:/.test(relativePath)) {
    return { resolved: relativePath, escapesRoot: true };
  }

  const baseParts = basePath ? basePath.replace(/\\/g, '/').split('/').filter(Boolean) : [];
  // base is a file path, so drop the file name to get directory parts
  if (baseParts.length > 0) {
    baseParts.pop();
  }

  const relParts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const stack = [...baseParts];

  for (const part of relParts) {
    if (part === '.') {
      continue;
    } else if (part === '..') {
      if (stack.length === 0) {
        return { resolved: relativePath, escapesRoot: true };
      }
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return { resolved: stack.join('/'), escapesRoot: false };
}

/**
 * Checks if a hostname or IP is a private/internal network target (SSRF).
 * @param {string} host
 * @returns {boolean}
 */
export function isPrivateNetworkHost(host) {
  if (!host) return true;
  let cleanHost = host.trim().toLowerCase();
  if (cleanHost.startsWith('[') && cleanHost.endsWith(']')) {
    cleanHost = cleanHost.slice(1, -1);
  } else if (cleanHost.startsWith('[') && cleanHost.includes(']:')) {
    cleanHost = cleanHost.slice(1, cleanHost.indexOf(']:'));
  } else if (!cleanHost.includes('::') && cleanHost.includes(':')) {
    cleanHost = cleanHost.split(':')[0];
  }
  if (cleanHost === '::1' || cleanHost === '::' || cleanHost === '0.0.0.0') {
    return true;
  }
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(cleanHost));
}

/**
 * Workspace-wide Link and Asset Checker.
 * Validates local file references, cross-document anchor slugs, and images.
 */
export class ProjectLinkChecker {
  constructor(pipeline = markdownPipeline) {
    this.pipeline = pipeline;
  }

  /**
   * Verifies links across a workspace document graph.
   * @param {Map<string, { content: string, headings: Array<any>, links: Array<any>, images: Array<any> }>} docGraph
   * @param {Set<string>|Array<string>} allWorkspaceFiles - Set of relative file paths in workspace (e.g. 'docs/guide.md', 'images/logo.png')
   * @param {Object} [options={}]
   * @returns {Promise<Array<Object>>} diagnostics
   */
  async checkWorkspaceLinks(docGraph, allWorkspaceFiles, options = {}) {
    const fileSet = allWorkspaceFiles instanceof Set ? allWorkspaceFiles : new Set(allWorkspaceFiles);
    const diagnostics = [];
    const checkRemote = !!options.checkRemote;
    const remoteTimeoutMs = options.remoteTimeoutMs || 5000;

    // Build anchor map per document: docPath -> Set<anchorSlug>
    const headingAnchorMap = new Map();
    for (const [docPath, docData] of docGraph.entries()) {
      const anchors = new Set((docData.headings || []).map(h => h.anchor));
      headingAnchorMap.set(docPath, anchors);
    }

    for (const [docPath, docData] of docGraph.entries()) {
      const links = docData.links || [];
      const images = docData.images || [];

      // 1. Check Links
      for (const link of links) {
        // Skip empty links (handled by single-doc QualityChecker)
        if (!link.text.trim() || !link.href.trim()) {
          continue;
        }

        // Same-document anchor: #slug
        if (link.isAnchor) {
          const docAnchors = headingAnchorMap.get(docPath) || new Set();
          if (!docAnchors.has(link.targetAnchor)) {
            diagnostics.push({
              id: `diag-${RuleId.BROKEN_INTERNAL_ANCHOR}-${docPath}-${link.line}-${link.targetAnchor}`,
              ruleId: RuleId.BROKEN_INTERNAL_ANCHOR,
              severity: DiagnosticSeverity.ERROR,
              file: docPath,
              line: link.line,
              column: 1,
              message: `Internal anchor link "#${link.targetAnchor}" does not match any heading in "${docPath}".`,
              target: link.raw,
              fixAvailable: false
            });
          }
          continue;
        }

        // Remote links (http:// or https://)
        if (link.isRemote) {
          if (!checkRemote) {
            continue; // Remote checks disabled by default (Invariant 11)
          }

          let urlObj;
          try {
            urlObj = new URL(link.href);
          } catch {
            diagnostics.push({
              id: `diag-RULE_BROKEN_REMOTE_LINK-${docPath}-${link.line}`,
              ruleId: 'RULE_BROKEN_REMOTE_LINK',
              severity: DiagnosticSeverity.WARNING,
              file: docPath,
              line: link.line,
              column: 1,
              message: `Malformed remote URL "${link.href}".`,
              target: link.raw
            });
            continue;
          }

          // SSRF Guard
          if (isPrivateNetworkHost(urlObj.hostname)) {
            diagnostics.push({
              id: `diag-RULE_SSRF_BLOCKED-${docPath}-${link.line}`,
              ruleId: RuleId.PATH_TRAVERSAL,
              severity: DiagnosticSeverity.ERROR,
              file: docPath,
              line: link.line,
              column: 1,
              message: `Remote URL "${link.href}" targets restricted private/loopback host (SSRF Protection).`,
              target: link.raw
            });
            continue;
          }

          // Check remote availability with SSRF redirect protection
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), remoteTimeoutMs);
            const res = await fetch(link.href, {
              method: 'HEAD',
              redirect: 'manual',
              signal: controller.signal
            });
            clearTimeout(timer);

            // Guard against SSRF redirect bypass (HTTP 301/302/307/308)
            if (res.status >= 300 && res.status < 400) {
              const locationHeader = res.headers.get('Location');
              if (locationHeader) {
                try {
                  const redirectUrl = new URL(locationHeader, link.href);
                  if (isPrivateNetworkHost(redirectUrl.hostname)) {
                    diagnostics.push({
                      id: `diag-RULE_SSRF_BLOCKED-${docPath}-${link.line}`,
                      ruleId: RuleId.PATH_TRAVERSAL,
                      severity: DiagnosticSeverity.ERROR,
                      file: docPath,
                      line: link.line,
                      column: 1,
                      message: `Remote URL "${link.href}" redirects to restricted private host "${redirectUrl.hostname}" (SSRF Protection).`,
                      target: link.raw
                    });
                    continue;
                  }
                } catch {
                  // Fall through
                }
              }
            } else if (!res.ok && res.status >= 400) {
              diagnostics.push({
                id: `diag-RULE_BROKEN_REMOTE_LINK-${docPath}-${link.line}`,
                ruleId: 'RULE_BROKEN_REMOTE_LINK',
                severity: DiagnosticSeverity.WARNING,
                file: docPath,
                line: link.line,
                column: 1,
                message: `Remote link "${link.href}" returned HTTP status ${res.status}.`,
                target: link.raw
              });
            }
          } catch (err) {
            diagnostics.push({
              id: `diag-RULE_BROKEN_REMOTE_LINK-${docPath}-${link.line}`,
              ruleId: 'RULE_BROKEN_REMOTE_LINK',
              severity: DiagnosticSeverity.WARNING,
              file: docPath,
              line: link.line,
              column: 1,
              message: `Remote link "${link.href}" check failed: ${err.message}`,
              target: link.raw
            });
          }
          continue;
        }

        // Local file link
        if (link.isLocal) {
          const rawHref = decodeURIComponent(link.href);
          const [rawFilePath, anchorPart] = rawHref.split('#');

          // Check for unsafe traversal or root escapes
          const { resolved, escapesRoot } = resolveWorkspacePath(docPath, rawFilePath);
          if (escapesRoot) {
            diagnostics.push({
              id: `diag-${RuleId.PATH_TRAVERSAL}-${docPath}-${link.line}`,
              ruleId: RuleId.PATH_TRAVERSAL,
              severity: DiagnosticSeverity.ERROR,
              file: docPath,
              line: link.line,
              column: 1,
              message: `Local file link "${link.href}" attempts unsafe path traversal outside workspace boundary.`,
              target: link.raw,
              fixAvailable: false
            });
            continue;
          }

          // Find target file (resolved relative to document, or relative to workspace root)
          let targetResolvedFile = null;
          if (fileSet.has(resolved)) {
            targetResolvedFile = resolved;
          } else if (fileSet.has(rawFilePath.replace(/^\.\//, ''))) {
            targetResolvedFile = rawFilePath.replace(/^\.\//, '');
          }

          if (!targetResolvedFile) {
            diagnostics.push({
              id: `diag-${RuleId.BROKEN_LOCAL_LINK}-${docPath}-${link.line}`,
              ruleId: RuleId.BROKEN_LOCAL_LINK,
              severity: DiagnosticSeverity.ERROR,
              file: docPath,
              line: link.line,
              column: 1,
              message: `Linked local file "${rawFilePath}" was not found in the workspace (resolved: "${resolved}").`,
              target: link.raw,
              fixAvailable: false
            });
            continue;
          }

          // If cross-document anchor slug is present (#heading-slug), verify it exists in target document
          if (anchorPart) {
            const targetAnchors = headingAnchorMap.get(targetResolvedFile);
            if (targetAnchors && !targetAnchors.has(anchorPart)) {
              diagnostics.push({
                id: `diag-${RuleId.BROKEN_CROSS_DOC_ANCHOR}-${docPath}-${link.line}-${anchorPart}`,
                ruleId: RuleId.BROKEN_CROSS_DOC_ANCHOR,
                severity: DiagnosticSeverity.ERROR,
                file: docPath,
                line: link.line,
                column: 1,
                message: `Cross-document anchor "#${anchorPart}" does not exist in target file "${targetResolvedFile}".`,
                target: link.raw,
                fixAvailable: false
              });
            }
          }
        }
      }

      // 2. Check Local Images
      for (const img of images) {
        if (!img.isLocal) continue;
        const cleanSrc = decodeURIComponent(img.src);

        const { resolved, escapesRoot } = resolveWorkspacePath(docPath, cleanSrc);
        if (escapesRoot) {
          diagnostics.push({
            id: `diag-${RuleId.PATH_TRAVERSAL}-${docPath}-${img.line}`,
            ruleId: RuleId.PATH_TRAVERSAL,
            severity: DiagnosticSeverity.ERROR,
            file: docPath,
            line: img.line,
            column: 1,
            message: `Image source "${img.src}" attempts unsafe path traversal outside workspace boundary.`,
            target: img.raw,
            fixAvailable: false
          });
          continue;
        }

        const exists = fileSet.has(resolved) || fileSet.has(cleanSrc.replace(/^\.\//, ''));
        if (!exists) {
          diagnostics.push({
            id: `diag-${RuleId.MISSING_LOCAL_IMAGE}-${docPath}-${img.line}`,
            ruleId: RuleId.MISSING_LOCAL_IMAGE,
            severity: DiagnosticSeverity.ERROR,
            file: docPath,
            line: img.line,
            column: 1,
            message: `Local image file "${cleanSrc}" does not exist in workspace (resolved: "${resolved}").`,
            target: img.raw,
            fixAvailable: false
          });
        }
      }
    }

    return diagnostics;
  }
}

export const projectLinkChecker = new ProjectLinkChecker();
