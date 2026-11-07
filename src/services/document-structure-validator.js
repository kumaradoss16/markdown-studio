/**
 * DocumentStructureValidator
 * Module F — Post-conversion Markdown document validation for MarkForge.
 *
 * Validates converted Markdown for structural coherence, syntax balance,
 * heading hierarchy adherence, and table alignment integrity without blocking user insertion.
 */

export class DocumentStructureValidator {
  /**
   * Validates markdown content and returns structured findings.
   *
   * @param {string} markdown
   * @returns {{
   *   isValid: boolean,
   *   issues: Array<{
   *     type: 'heading-hierarchy' | 'code-fence-unbalanced' | 'missing-code-language' | 'table-column-mismatch' | 'unclosed-formatting' | 'broken-link' | 'malformed-image' | 'unexpected-html',
   *     severity: 'error' | 'warning' | 'info',
   *     message: string,
   *     line?: number,
   *   }>
   * }}
   */
  validate(markdown = '') {
    const issues = [];
    if (!markdown || typeof markdown !== 'string') {
      return { isValid: true, issues };
    }

    const lines = markdown.split(/\r?\n/);
    let inCodeBlock = false;
    let codeFenceChar = '';
    let codeFenceLength = 0;
    let openFenceLine = 0;
    let lastHeadingLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      // 1. Code Fence Tracking & Balance
      const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        const fenceStr = fenceMatch[1];
        const info = fenceMatch[2].trim();

        if (!inCodeBlock) {
          inCodeBlock = true;
          codeFenceChar = fenceStr[0];
          codeFenceLength = fenceStr.length;
          openFenceLine = lineNum;

          if (!info) {
            issues.push({
              type: 'missing-code-language',
              severity: 'info',
              message: `Code block opened without a language specifier at line ${lineNum}.`,
              line: lineNum,
            });
          }
        } else {
          // Closing fence must match or exceed opening fence length
          if (fenceStr[0] === codeFenceChar && fenceStr.length >= codeFenceLength) {
            inCodeBlock = false;
            codeFenceChar = '';
            codeFenceLength = 0;
          }
        }
        continue;
      }

      // Skip internal code block content for markdown structure checks
      if (inCodeBlock) continue;

      // 2. Heading Hierarchy Check
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const currentLevel = headingMatch[1].length;
        if (lastHeadingLevel > 0 && currentLevel > lastHeadingLevel + 1) {
          issues.push({
            type: 'heading-hierarchy',
            severity: 'warning',
            message: `Skipped heading level from H${lastHeadingLevel} to H${currentLevel} at line ${lineNum} (expected H${lastHeadingLevel + 1}).`,
            line: lineNum,
          });
        }
        lastHeadingLevel = currentLevel;
        continue;
      }

      // 3. Table Column Alignment & Mismatch
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
        // Collect entire table block
        const tableLines = [trimmed];
        let j = i + 1;
        while (j < lines.length && lines[j].trim().startsWith('|') && lines[j].trim().endsWith('|')) {
          tableLines.push(lines[j].trim());
          j++;
        }

        if (tableLines.length >= 2) {
          const headerCols = tableLines[0].split('|').slice(1, -1).map(c => c.trim()).length;
          for (let k = 1; k < tableLines.length; k++) {
            const rowCols = tableLines[k].split('|').slice(1, -1).map(c => c.trim()).length;
            if (rowCols !== headerCols) {
              issues.push({
                type: 'table-column-mismatch',
                severity: 'warning',
                message: `Table row has ${rowCols} columns, but header has ${headerCols} columns at line ${i + k + 1}.`,
                line: i + k + 1,
              });
              break;
            }
          }
        }
        i = j - 1; // fast-forward past table
        continue;
      }

      // 4. Link & Image Syntax
      // Broken markdown link e.g. [text]( with no closing paren, or [text(url) missing closing bracket
      if (/\[[^\]\n]+\]\([^)\n]*$/.test(line) || /\[[^\]\n]*\([^)\n]+\)/.test(line)) {
        issues.push({
          type: 'broken-link',
          severity: 'warning',
          message: `Unclosed Markdown link syntax at line ${lineNum}.`,
          line: lineNum,
        });
      }
      // Empty link URL e.g. [text]()
      if (/\[[^\]\n]+\]\(\s*\)/.test(line)) {
        issues.push({
          type: 'broken-link',
          severity: 'info',
          message: `Empty URL in link at line ${lineNum}.`,
          line: lineNum,
        });
      }
      // Malformed image e.g. ![]()
      if (/!\[\s*\]\(\s*\)/.test(line)) {
        issues.push({
          type: 'malformed-image',
          severity: 'info',
          message: `Image reference lacks both alt text and URL at line ${lineNum}.`,
          line: lineNum,
        });
      }

      // 5. Unclosed Formatting Markers (**bold, ~~strike)
      // Check for odd counts of non-escaped ** markers on a single non-empty line
      const boldTokens = (line.match(/(?<!\\)\*\*/g) || []).length;
      if (boldTokens % 2 !== 0 && !line.includes('```')) {
        issues.push({
          type: 'unclosed-formatting',
          severity: 'info',
          message: `Unpaired bold formatting marker (**) on line ${lineNum}.`,
          line: lineNum,
        });
      }
      const strikeTokens = (line.match(/(?<!\\)~~/g) || []).length;
      if (strikeTokens % 2 !== 0 && !line.includes('```')) {
        issues.push({
          type: 'unclosed-formatting',
          severity: 'info',
          message: `Unpaired strikethrough formatting marker (~~) on line ${lineNum}.`,
          line: lineNum,
        });
      }

      // 6. Unexpected HTML fragments
      const rawHtmlTag = line.match(/<(script|iframe|object|embed|form|input)[^>]*>/i);
      if (rawHtmlTag) {
        issues.push({
          type: 'unexpected-html',
          severity: 'error',
          message: `Forbidden HTML element <${rawHtmlTag[1]}> found on line ${lineNum}; will be stripped by sanitizer.`,
          line: lineNum,
        });
      }
    }

    if (inCodeBlock) {
      issues.push({
        type: 'code-fence-unbalanced',
        severity: 'error',
        message: `Unclosed code fence block opened at line ${openFenceLine}.`,
        line: openFenceLine,
      });
    }

    const hasErrors = issues.some(iss => iss.severity === 'error');
    return {
      isValid: !hasErrors,
      issues,
    };
  }
}

export const documentStructureValidator = new DocumentStructureValidator();
