/**
 * ClipboardCaptureService
 * Module A — Dedicated desktop & web clipboard capture service for MarkForge.
 *
 * Responsibilities:
 * - Captures clipboard content via modern asynchronous Clipboard API (navigator.clipboard)
 *   or synchronous DOM DataTransfer / ClipboardEvent objects.
 * - Detects available MIME types: text/markdown, text/html, text/plain, image/*, etc.
 * - Preserves full Unicode fidelity (arrows, mathematical symbols, Asian scripts, emoji).
 * - Implements payload size guards (warning thresholds for large HTML and image payloads).
 * - Enforces loop prevention and permission error boundaries.
 * - Adheres strictly to format precedence:
 *     1. text/markdown (when available and valid)
 *     2. text/html (when structurally useful)
 *     3. text/plain (fallback)
 */

export const MAX_HTML_BYTE_LIMIT = 5 * 1024 * 1024; // 5 MB
export const MAX_TOTAL_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Sniffs whether a string contains strong Markdown syntax markers.
 * @param {string} text
 * @returns {boolean}
 */
export function isMarkdownLooking(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const headingMatch = /^#{1,6}\s+\S+/m.test(trimmed);
  const codeFenceMatch = /^```[a-zA-Z0-9_-]*\r?\n[\s\S]+?```/m.test(trimmed);
  const tableMatch = /\|[\s-:]+\|[\s-:]+\|/.test(trimmed);
  const wikiLinkMatch = /\[\[.+?\]\]/.test(trimmed);
  const mdLinkMatch = /\[.+?\]\((?:https?:\/\/|\/|\.\/|#|[a-z0-9_-]).+?\)/.test(trimmed);
  const blockquoteMatch = /^>\s+\S+/m.test(trimmed);
  const listMatch = /^(\s*[-*+]|\s*\d+\.)\s+\S+/m.test(trimmed);

  return headingMatch || codeFenceMatch || tableMatch || wikiLinkMatch || mdLinkMatch || blockquoteMatch || listMatch;
}

export class ClipboardCaptureService {
  constructor() {
    this.isCapturing = false;
  }

  /**
   * Asynchronously inspects the system clipboard using the standard Clipboard API.
   * Handles permission boundaries gracefully without throwing uncaught exceptions.
   *
   * @returns {Promise<{
   *   formats: string[],
   *   text: string | null,
   *   html: string | null,
   *   markdown: string | null,
   *   images: Array<{ blob: Blob, mime: string, size?: number }>,
   *   warnings: string[],
   *   unavailableReason?: string
   * }>}
   */
  async capture() {
    if (this.isCapturing) {
      return {
        formats: [],
        text: null,
        html: null,
        markdown: null,
        images: [],
        warnings: ['Clipboard capture is already in progress.'],
        unavailableReason: 'Concurrent capture prevented.',
      };
    }

    this.isCapturing = true;
    const formats = [];
    let text = null;
    let html = null;
    let markdown = null;
    const images = [];
    const warnings = [];

    try {
      // 1. Try modern Async Clipboard API with read()
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            for (const type of item.types) {
              if (!formats.includes(type)) formats.push(type);

              if (type === 'text/markdown' && !markdown) {
                const blob = await item.getType(type);
                markdown = await blob.text();
              } else if (type === 'text/html' && !html) {
                const blob = await item.getType(type);
                html = await blob.text();
              } else if (type === 'text/plain' && !text) {
                const blob = await item.getType(type);
                text = await blob.text();
              } else if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                images.push({ blob, mime: type, size: blob.size });
              }
            }
          }

          if (formats.length > 0 || text !== null || html !== null || images.length > 0 || markdown !== null) {
            this._checkPayloadSizes({ html, images, warnings });
            return { formats, text, html, markdown, images, warnings };
          }
        } catch (readErr) {
          // If read() was rejected due to permission or not focused, try readText()
          if (readErr.name === 'NotAllowedError') {
            warnings.push('Clipboard read permission was not granted by browser or host window.');
          }
        }
      }

      // 2. Fallback to readText() if read() was unavailable or restricted
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        try {
          const plainText = await navigator.clipboard.readText();
          if (plainText) {
            formats.push('text/plain');
            text = plainText;
            if (isMarkdownLooking(plainText)) {
              markdown = plainText;
            }
            return {
              formats,
              text,
              html: null,
              markdown,
              images: [],
              warnings,
              unavailableReason: 'Binary or rich clipboard formats restricted; plain text retrieved.',
            };
          }
        } catch (textErr) {
          if (textErr.name === 'NotAllowedError') {
            warnings.push('Clipboard text read permission was denied.');
          }
        }
      }

      return {
        formats,
        text,
        html,
        markdown,
        images,
        warnings,
        unavailableReason: 'Clipboard is empty, locked, or permissions were denied. Use manual paste instead.',
      };
    } finally {
      this.isCapturing = false;
    }
  }

  /**
   * Synchronously extracts all available clipboard representations from a DOM ClipboardEvent
   * or DataTransfer instance (e.g. during a paste event or drag-and-drop).
   *
   * @param {DataTransfer} dataTransfer
   * @returns {{
   *   formats: string[],
   *   text: string | null,
   *   html: string | null,
   *   markdown: string | null,
   *   images: Array<{ blob: Blob, mime: string, size?: number }>,
   *   warnings: string[]
   * }}
   */
  captureFromDataTransfer(dataTransfer) {
    if (!dataTransfer) {
      return { formats: [], text: null, html: null, markdown: null, images: [], warnings: [] };
    }

    const formats = Array.from(dataTransfer.types || []);
    const text = dataTransfer.getData('text/plain') || null;
    const html = dataTransfer.getData('text/html') || null;
    let markdown = null;

    if (formats.includes('text/markdown')) {
      markdown = dataTransfer.getData('text/markdown') || null;
    }

    const images = [];
    const warnings = [];

    if (dataTransfer.items) {
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            images.push({ blob: file, mime: item.type, size: file.size });
          }
        }
      }
    } else if (dataTransfer.files) {
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        if (file.type && file.type.startsWith('image/')) {
          images.push({ blob: file, mime: file.type, size: file.size });
        }
      }
    }

    this._checkPayloadSizes({ html, images, warnings });

    return { formats, text, html, markdown, images, warnings };
  }

  /**
   * Guard for checking payload size limits and populating warnings.
   * @private
   */
  _checkPayloadSizes({ html, images, warnings }) {
    if (html && html.length > MAX_HTML_BYTE_LIMIT) {
      warnings.push(`HTML payload size (${(html.length / (1024 * 1024)).toFixed(1)} MB) exceeds 5 MB. Processing may take longer.`);
    }

    let totalImageBytes = 0;
    for (const img of images) {
      totalImageBytes += (img.size || (img.blob ? img.blob.size : 0));
    }
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      warnings.push(`Image attachments total ${(totalImageBytes / (1024 * 1024)).toFixed(1)} MB, which exceeds the recommended 25 MB ceiling.`);
    }
  }

  /**
   * Resolves the primary content format based on strictly defined precedence:
   * 1. text/markdown (if available and valid)
   * 2. text/html (if present with meaningful structures)
   * 3. text/plain (markdown-looking or fallback)
   * 4. images only
   * 5. empty
   *
   * @param {{ text: string | null, html: string | null, markdown?: string | null, images: any[] }} payload
   * @returns {'markdown' | 'html' | 'text' | 'image' | 'empty'}
   */
  determineContentType(payload) {
    const { text, html, markdown, images } = payload || {};
    const hasMarkdown = Boolean(markdown && markdown.trim().length > 0);
    const hasText = Boolean(text && text.trim().length > 0);
    const hasHtml = Boolean(html && html.trim().length > 0);
    const hasImages = Boolean(images && images.length > 0);

    if (!hasMarkdown && !hasText && !hasHtml && !hasImages) {
      return 'empty';
    }

    // 1. Explicit text/markdown MIME type representation
    if (hasMarkdown && isMarkdownLooking(markdown)) {
      return 'markdown';
    }

    // 2. Rich HTML containing semantic or visual structure
    if (hasHtml) {
      const hasStructure = /<(?:h[1-6]|p|div|ul|ol|li|table|pre|code|blockquote|strong|b|em|i|a|img|svg|hr|span)[^>]*>/i.test(html);
      if (hasStructure) {
        // High-fidelity structures (cards, grids, tables, diagrams, math) ALWAYS use HTML recovery
        const hasRichVisuals = /(?:display\s*:\s*(?:flex|grid)|grid|table|pre|class=|border|katex|math|mermaid|svg)/i.test(html);
        if (hasRichVisuals) {
          return 'html';
        }

        // If plain text is already strongly formatted Markdown and HTML is merely a flat wrapping
        if (hasText && isMarkdownLooking(text)) {
          const strippedHtml = html.replace(/<[^>]+>/g, '').trim();
          if (strippedHtml === text.trim() && !/<(?:table|pre|code|h[1-6]|ul|ol|blockquote)/i.test(html)) {
            return 'markdown';
          }
        }

        return 'html';
      }
    }

    // 3. Markdown-looking plain text
    if (hasText && isMarkdownLooking(text)) {
      return 'markdown';
    }

    // 4. Plain text fallback
    if (hasText) {
      return 'text';
    }

    // 5. Images only
    if (hasImages) {
      return 'image';
    }

    return 'empty';
  }
}

export const clipboardCaptureService = new ClipboardCaptureService();
