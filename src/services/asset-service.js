import { fileSystemAdapter } from './filesystem-adapter.js';
import { svgSanitizer } from './svg-sanitizer.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB total per import
export const MAX_IMAGE_COUNT = 50;

/**
 * Checks if a hostname belongs to a private, loopback, or internal network range (SSRF guard).
 * @param {string} hostname
 * @returns {boolean}
 */
export function isPrivateOrBlockedHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const host = hostname.trim().toLowerCase();

  // Strip port if present (handle IPv6 brackets e.g. [::1]:8080 or IPv4 e.g. host:port)
  let cleanHost = host;
  if (cleanHost.startsWith('[') && cleanHost.includes(']')) {
    cleanHost = cleanHost.slice(1, cleanHost.indexOf(']'));
  } else if (!cleanHost.includes('::') && cleanHost.split(':').length === 2) {
    cleanHost = cleanHost.split(':')[0];
  }

  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal') ||
    cleanHost.endsWith('.lan')
  ) {
    return true;
  }

  if (
    cleanHost === '::1' ||
    cleanHost === '[::1]' ||
    cleanHost.startsWith('fc') ||
    cleanHost.startsWith('fd') ||
    cleanHost.startsWith('fe80')
  ) {
    return true;
  }

  // IPv4 range checks
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = Number(ipv4Match[1]);
    const o2 = Number(ipv4Match[2]);
    const o3 = Number(ipv4Match[3]);
    const o4 = Number(ipv4Match[4]);

    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;
    if (o1 === 127) return true; // 127.0.0.0/8 Loopback
    if (o1 === 10) return true; // 10.0.0.0/8 Private
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 Private
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16 Private
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 Link-local
    if (o1 === 0) return true; // 0.0.0.0/8
    if (o1 >= 224) return true; // 224.0.0.0/4 Multicast / Reserved
  }

  return false;
}

/**
 * Sniffs true MIME type and extension from byte header (magic numbers).
 * @param {Uint8Array} bytes
 * @returns {{ mime: string, ext: string } | null}
 */
export function sniffImageFormat(bytes) {
  if (!bytes || (!ArrayBuffer.isView(bytes) && !(bytes instanceof Uint8Array)) || bytes.byteLength < 4) {
    return null;
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // 2. JPEG: FF D8 FF
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // 3. GIF: GIF87a or GIF89a
  if (
    bytes.byteLength >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' };
  }

  // 4. WebP: RIFF .... WEBP
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // 5. SVG: Text check for <svg
  try {
    const textSample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512)).trim().toLowerCase();
    if (textSample.includes('<svg') || (textSample.includes('<?xml') && textSample.includes('<svg'))) {
      return { mime: 'image/svg+xml', ext: 'svg' };
    }
  } catch {}

  return null;
}

/**
 * Normalizes document name into a safe filesystem slug.
 * @param {string} docName
 * @returns {string}
 */
export function slugifyDocName(docName) {
  if (!docName || typeof docName !== 'string') return 'document';
  const clean = docName
    .replace(/\.md$/i, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || 'document';
}

/**
 * Generates an 8-character random hexadecimal token.
 * @returns {string}
 */
export function generateRandomHex() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

/**
 * Generates formatted YYYYMMDD date string.
 * @param {Date} [date]
 * @returns {string}
 */
export function formatDateSlug(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export class AssetService {
  constructor(fsAdapter = fileSystemAdapter) {
    this.fs = fsAdapter;
  }

  /**
   * Resolves target asset directory path for a document.
   * If doc has path, returns `<dirname(doc.path)>/assets`
   * Otherwise returns `assets`
   * @param {any} doc
   * @returns {{ dirPath: string, isWorkspaceDefault: boolean }}
   */
  resolveAssetDirectory(doc) {
    if (doc && doc.path && typeof doc.path === 'string') {
      const normalized = doc.path.replace(/\\/g, '/');
      const lastSlash = normalized.lastIndexOf('/');
      const parent = lastSlash !== -1 ? normalized.slice(0, lastSlash) : '';
      const dirPath = parent ? `${parent}/assets` : 'assets';
      return { dirPath, isWorkspaceDefault: false };
    }
    return { dirPath: 'assets', isWorkspaceDefault: true };
  }

  /**
   * Generates a collision-free safe filename for an asset.
   * @param {string} docName
   * @param {string} ext
   * @param {string} dirPath
   * @returns {Promise<string>} e.g. "my-doc-20261026-a1b2c3d4.png"
   */
  async generateAssetFilename(docName, ext, dirPath) {
    const slug = slugifyDocName(docName);
    const dateStr = formatDateSlug();
    const cleanExt = ext.replace(/^\./, '').toLowerCase();

    for (let attempt = 0; attempt < 20; attempt++) {
      const hex = generateRandomHex();
      const filename = `${slug}-${dateStr}-${hex}.${cleanExt}`;
      const fullPath = dirPath ? `${dirPath}/${filename}` : filename;
      const exists = await this.fs.fileExists(fullPath);
      if (!exists) {
        return filename;
      }
    }

    // High entropy fallback
    return `${slug}-${dateStr}-${Date.now().toString(16)}.${cleanExt}`;
  }

  /**
   * Validates and prepares image bytes for import.
   * @param {Uint8Array} bytes
   * @param {string} [declaredMime]
   * @returns {{ valid: boolean, mime: string, ext: string, bytes: Uint8Array, error?: string }}
   */
  validateImageBytes(bytes, declaredMime = '') {
    if (!bytes || (!ArrayBuffer.isView(bytes) && !(bytes instanceof Uint8Array)) || bytes.byteLength === 0) {
      return { valid: false, error: 'Empty image data payload', mime: '', ext: '', bytes: new Uint8Array() };
    }

    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return {
        valid: false,
        error: `Image size (${(bytes.byteLength / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of 10 MB`,
        mime: '',
        ext: '',
        bytes: new Uint8Array()
      };
    }

    const sniffed = sniffImageFormat(bytes);
    if (!sniffed) {
      return {
        valid: false,
        error: `Unsupported image format or corrupt byte signature (${declaredMime || 'unknown'})`,
        mime: '',
        ext: '',
        bytes: new Uint8Array()
      };
    }

    // If SVG, run strict sanitization
    if (sniffed.mime === 'image/svg+xml') {
      const text = new TextDecoder('utf-8').decode(bytes);
      const { success, sanitized, error } = svgSanitizer.sanitize(text);
      if (!success) {
        return {
          valid: false,
          error: `SVG sanitization failed: ${error}`,
          mime: '',
          ext: '',
          bytes: new Uint8Array()
        };
      }
      const cleanBytes = new TextEncoder().encode(sanitized);
      return {
        valid: true,
        mime: sniffed.mime,
        ext: sniffed.ext,
        bytes: cleanBytes
      };
    }

    return {
      valid: true,
      mime: sniffed.mime,
      ext: sniffed.ext,
      bytes
    };
  }

  /**
   * Downloads an external image safely with SSRF protection.
   * @param {string} url
   * @returns {Promise<{ success: boolean, bytes?: Uint8Array, mime?: string, error?: string }>}
   */
  async downloadExternalImage(url) {
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Empty URL' };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, error: 'Malformed URL' };
    }

    if (parsedUrl.protocol !== 'https:') {
      return { success: false, error: 'Only HTTPS URLs are permitted for image download' };
    }

    if (isPrivateOrBlockedHost(parsedUrl.hostname)) {
      return { success: false, error: `Blocked private or local network host (${parsedUrl.hostname})` };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/*;q=0.8' },
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status} ${resp.statusText}` };
      }

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return { success: false, error: `Invalid content-type: ${contentType} (expected image/*)` };
      }

      const buffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const validation = this.validateImageBytes(bytes, contentType);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      return { success: true, bytes: validation.bytes, mime: validation.mime };
    } catch (err) {
      return { success: false, error: `Network fetch failed: ${err.message}` };
    }
  }

  /**
   * Commits staged asset entries to the file system.
   * On failure of any file, rolls back newly written files.
   * @param {Array<{ path: string, bytes: Uint8Array }>} stagedAssets
   * @returns {Promise<{ success: boolean, writtenPaths: string[], error?: string }>}
   */
  async commitStagedAssets(stagedAssets) {
    const writtenPaths = [];
    try {
      for (const asset of stagedAssets) {
        // Ensure directory
        const lastSlash = asset.path.lastIndexOf('/');
        if (lastSlash !== -1) {
          const dir = asset.path.slice(0, lastSlash);
          await this.fs.ensureDirectory(dir);
        }

        await this.fs.writeBinaryFile(asset.path, asset.bytes);
        writtenPaths.push(asset.path);
      }
      return { success: true, writtenPaths };
    } catch (err) {
      // Rollback
      for (const p of writtenPaths) {
        try {
          await this.fs.delete(p);
        } catch {}
      }
      return { success: false, writtenPaths: [], error: err.message };
    }
  }
}

export const assetService = new AssetService();
