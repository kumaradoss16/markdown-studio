/**
 * Sniffs whether a plain text string possesses strong Markdown syntax markers.
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

export class ClipboardImportService {
  /**
   * Inspects current system clipboard items across all supported formats.
   * @returns {Promise<{
   *   formats: string[],
   *   text: string | null,
   *   html: string | null,
   *   images: Array<{ blob: Blob, mime: string, width?: number, height?: number }>,
   *   unavailableReason?: string
   * }>}
   */
  async inspect() {
    const formats = [];
    let text = null;
    let html = null;
    const images = [];

    // 1. Try modern Async Clipboard API with read()
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.read === 'function') {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (!formats.includes(type)) formats.push(type);

            if (type === 'text/html' && !html) {
              const blob = await item.getType(type);
              html = await blob.text();
            } else if (type === 'text/plain' && !text) {
              const blob = await item.getType(type);
              text = await blob.text();
            } else if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              images.push({ blob, mime: type });
            }
          }
        }

        if (formats.length > 0 || text !== null || html !== null || images.length > 0) {
          return { formats, text, html, images };
        }
      } catch (err) {
        // Fallback below
      }
    }

    // 2. Fallback to readText() if read() was blocked by browser permissions
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const plainText = await navigator.clipboard.readText();
        if (plainText) {
          return {
            formats: ['text/plain'],
            text: plainText,
            html: null,
            images: [],
            unavailableReason: 'Permission restricted for binary clipboard; text format retrieved.'
          };
        }
      } catch {}
    }

    return {
      formats,
      text,
      html,
      images,
      unavailableReason: 'Clipboard is empty or permissions were denied. Use the paste box to paste directly.'
    };
  }

  /**
   * Parses clipboard data synchronously from a DOM ClipboardEvent or DataTransfer object.
   * Essential fallback when navigator.clipboard is unavailable or restricted.
   * @param {DataTransfer} dataTransfer
   * @returns {{
   *   formats: string[],
   *   text: string | null,
   *   html: string | null,
   *   images: Array<{ blob: Blob, mime: string, width?: number, height?: number }>
   * }}
   */
  inspectFromDataTransfer(dataTransfer) {
    if (!dataTransfer) {
      return { formats: [], text: null, html: null, images: [] };
    }

    const formats = Array.from(dataTransfer.types || []);
    const text = dataTransfer.getData('text/plain') || null;
    const html = dataTransfer.getData('text/html') || null;
    const images = [];

    if (dataTransfer.items) {
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            images.push({ blob: file, mime: item.type });
          }
        }
      }
    } else if (dataTransfer.files) {
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        if (file.type && file.type.startsWith('image/')) {
          images.push({ blob: file, mime: file.type });
        }
      }
    }

    return { formats, text, html, images };
  }

  /**
   * Deterministic precedence calculation for clipboard payload ingestion.
   * Precedence:
   * 1. Rich HTML with structural or visual markup -> convert via HTML-to-Markdown service.
   * 2. Markdown-looking text/plain without rich HTML markup -> insert as-is.
   * 3. General text/html -> convert via HTML-to-Markdown service.
   * 4. text/plain only -> insert as plain text.
   * 5. Images only -> asset insert with alt pasted-image.
   * @param {{ text: string | null, html: string | null, images: any[] }} payload
   * @returns {'markdown' | 'html' | 'text' | 'image' | 'empty'}
   */
  determineContentType(payload) {
    const { text, html, images } = payload || {};
    const hasText = Boolean(text && text.trim().length > 0);
    const hasHtml = Boolean(html && html.trim().length > 0);
    const hasImages = Boolean(images && images.length > 0);

    if (!hasText && !hasHtml && !hasImages) {
      return 'empty';
    }

    // 1. If HTML is present, check whether it contains meaningful HTML tags/structures
    if (hasHtml) {
      // Check if HTML has meaningful semantic or visual tags beyond empty trivial container
      const hasStructure = /<(?:h[1-6]|p|div|ul|ol|li|table|pre|code|blockquote|strong|b|em|i|a|img|svg|hr|span)[^>]*>/i.test(html);
      if (hasStructure) {
        // If HTML contains rich visual structures, cards, multi-column layouts, tables, or diagrams, ALWAYS prefer HTML!
        const hasRichVisuals = /(?:display\s*:\s*(?:flex|grid)|grid|table|pre|class=|border|katex|math|mermaid|svg)/i.test(html);
        if (hasRichVisuals) {
          return 'html';
        }

        // If plain text is already strongly formatted Markdown (e.g. copied from raw .md file)
        // and HTML is just a flat <p> wrapping of that markdown text:
        if (hasText && isMarkdownLooking(text)) {
          const strippedHtml = html.replace(/<[^>]+>/g, '').trim();
          if (strippedHtml === text.trim() && !/<(?:table|pre|code|h[1-6]|ul|ol|blockquote)/i.test(html)) {
            return 'markdown';
          }
        }

        return 'html';
      }
    }

    // 2. Markdown-looking text/plain without rich HTML markup
    if (hasText && isMarkdownLooking(text)) {
      return 'markdown';
    }

    // 3. Plain text
    if (hasText) {
      return 'text';
    }

    // 4. Images only
    if (hasImages) {
      return 'image';
    }

    return 'empty';
  }
}

export const clipboardImportService = new ClipboardImportService();
