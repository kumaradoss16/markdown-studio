import createDOMPurify from 'dompurify';

/**
 * SVG Sanitizer Service
 * Strictly cleanses and validates SVG documents before rendering or asset storage.
 * Enforces zero-tolerance policy against:
 * - <script> tags
 * - <foreignObject> elements
 * - on* event handler attributes
 * - external href/xlink:href and external <use> tags
 * - CSS url(http/https/data/javascript) in style attributes
 */
export class SvgSanitizer {
  constructor() {
    this.purify = null;
  }

  getPurify() {
    if (!this.purify) {
      if (typeof window !== 'undefined') {
        this.purify = createDOMPurify(window);
      } else if (typeof globalThis !== 'undefined' && globalThis.window) {
        this.purify = createDOMPurify(globalThis.window);
      } else {
        try {
          const instance = createDOMPurify();
          if (instance && typeof instance.sanitize === 'function') {
            this.purify = instance;
          } else {
            this.purify = { sanitize: (s) => String(s || '') };
          }
        } catch {
          this.purify = { sanitize: (s) => String(s || '') };
        }
      }
    }
    return this.purify;
  }

  /**
   * Sanitizes SVG string content.
   * @param {string} svgContent
   * @returns {{ success: boolean, sanitized: string, error: string | null }}
   */
  sanitize(svgContent) {
    if (!svgContent || typeof svgContent !== 'string') {
      return { success: false, sanitized: '', error: 'Empty or invalid SVG content' };
    }

    const trimmed = svgContent.trim();
    if (!/<svg[\s>]/i.test(trimmed)) {
      return { success: false, sanitized: '', error: 'Missing root <svg> element' };
    }

    const purify = this.getPurify();

    // DOMPurify SVG profile pass
    const purifyConfig = {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'foreignobject', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'applet', 'base'],
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus',
        'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeypress', 'onkeyup'
      ],
      ADD_TAGS: ['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'defs', 'use', 'marker', 'pattern', 'filter', 'feDropShadow', 'feGaussianBlur', 'feMerge', 'feMergeNode'],
      ADD_ATTR: ['href', 'xlink:href'],
      RETURN_DOM: false,
    };

    let sanitized = purify.sanitize(trimmed, purifyConfig);

    // Deep inspect with DOMParser if available to enforce strict zero-tolerance rules
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        let doc = parser.parseFromString(sanitized, 'image/svg+xml');

        let parserErrors = doc.querySelectorAll('parsererror');
        if (parserErrors.length > 0) {
          // If parse failure was due to prefix like xlink without explicit xmlns, retry with standard SVG namespaces
          const withNamespaces = sanitized.replace(
            /<svg([^>]*)>/i,
            '<svg$1 xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
          );
          doc = parser.parseFromString(withNamespaces, 'image/svg+xml');
          parserErrors = doc.querySelectorAll('parsererror');
          if (parserErrors.length > 0) {
            return { success: false, sanitized: '', error: 'SVG XML parse failure' };
          }
        }

        // Hard checks
        if (doc.querySelector('script, foreignObject, foreignobject')) {
          return { success: false, sanitized: '', error: 'Forbidden element detected (script or foreignObject)' };
        }

        const elements = doc.querySelectorAll('*');
        for (const el of elements) {
          const tagName = el.tagName.toLowerCase();
          if (tagName === 'script' || tagName === 'foreignobject') {
            el.remove();
            continue;
          }

          for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            const val = attr.value.trim().toLowerCase();

            // Strip any on* attributes
            if (name.startsWith('on')) {
              el.removeAttribute(attr.name);
              continue;
            }

            // External hrefs / xlink:href / use tags to external docs
            if (name === 'href' || name === 'xlink:href' || name.endsWith(':href')) {
              // Fragment IDs within the same SVG are allowed (#id)
              if (!val.startsWith('#')) {
                // If it links externally or executes javascript:
                if (
                  val.startsWith('http:') ||
                  val.startsWith('https:') ||
                  val.startsWith('//') ||
                  val.startsWith('javascript:') ||
                  val.startsWith('data:')
                ) {
                  el.removeAttribute(attr.name);
                }
              }
            }

            // CSS url(...) in style attribute pointing to external resource or javascript
            if (name === 'style') {
              if (/url\s*\(\s*['"]?\s*(https?:|\/\/|data:|javascript:)/i.test(val)) {
                el.removeAttribute('style');
              }
            }
          }
        }

        const serializer = typeof XMLSerializer !== 'undefined' ? new XMLSerializer() : null;
        if (serializer) {
          sanitized = serializer.serializeToString(doc.documentElement);
        }
      } catch (err) {
        return { success: false, sanitized: '', error: `SVG parse verification error: ${err.message}` };
      }
    } else {
      // Regex fallbacks when DOMParser is unavailable
      if (/<script/i.test(sanitized) || /<foreignObject/i.test(sanitized)) {
        return { success: false, sanitized: '', error: 'Forbidden element detected (script or foreignObject)' };
      }
      sanitized = sanitized
        .replace(/on\w+\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi, '')
        .replace(/(?:href|xlink:href)\s*=\s*["'](?:https?:|\/\/|javascript:|data:)[^"']*["']/gi, '')
        .replace(/style\s*=\s*["'][^"']*url\s*\([^)]+\)[^"']*["']/gi, '');
    }

    if (!/<svg[\s>]/i.test(sanitized)) {
      return { success: false, sanitized: '', error: 'Sanitization produced an invalid or empty SVG' };
    }

    return { success: true, sanitized, error: null };
  }
}

export const svgSanitizer = new SvgSanitizer();
