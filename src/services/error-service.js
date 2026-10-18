/**
 * Standardized error codes and error normalization for DevspireHub Markdown Studio
 */

export const ErrorCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  PATH_NOT_ALLOWED: 'PATH_NOT_ALLOWED',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  EXTERNAL_MODIFICATION: 'EXTERNAL_MODIFICATION',
  WRITE_FAILED: 'WRITE_FAILED',
  INVALID_ENCODING: 'INVALID_ENCODING',
  SAVE_ABORTED: 'SAVE_ABORTED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  STALE_BASE: 'STALE_BASE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SECURE_STORE_UNAVAILABLE: 'SECURE_STORE_UNAVAILABLE',
  PUBLISHING_DISABLED: 'PUBLISHING_DISABLED',
  CONFLICT_DETECTED: 'CONFLICT_DETECTED',
  OUTCOME_UNCERTAIN: 'OUTCOME_UNCERTAIN',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  INVALID_DESTINATION: 'INVALID_DESTINATION',
  UNAUTHORIZED_WRITE: 'UNAUTHORIZED_WRITE',
  PREFLIGHT_FAILED: 'PREFLIGHT_FAILED',
  UNREVIEWED_CHANGE: 'UNREVIEWED_CHANGE',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Redacts tokens, keys, and authorization secrets from strings.
 * @param {string} text
 * @returns {string}
 */
export function redactSensitiveData(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
    .replace(/(ghp_[a-zA-Z0-9]{36})/g, '[REDACTED_TOKEN]')
    .replace(/(github_pat_[a-zA-Z0-9_]{50,})/g, '[REDACTED_PAT]')
    .replace(/(token\s*=\s*)[^\s&]+/gi, '$1[REDACTED]')
    .replace(/(code_verifier\s*=\s*)[^\s&]+/gi, '$1[REDACTED]')
    .replace(/(client_secret\s*=\s*)[^\s&]+/gi, '$1[REDACTED]');
}

export class StudioError extends Error {
  /**
   * @param {string} code - One of ErrorCode values
   * @param {string} message - User-friendly message
   * @param {any} [details] - Diagnostic details
   */
  constructor(code, message, details = null) {
    super(message);
    this.name = 'StudioError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Normalizes any caught error into a StudioError
 * @param {any} err
 * @returns {StudioError}
 */
export function normalizeError(err) {
  if (err instanceof StudioError) {
    return err;
  }
  const msg = err?.message || String(err || 'An unexpected error occurred.');
  
  if (msg.includes('not found') || msg.includes('ENOENT')) {
    return new StudioError(ErrorCode.NOT_FOUND, 'The requested file could not be found.', err);
  }
  if (msg.includes('permission') || msg.includes('EACCES')) {
    return new StudioError(ErrorCode.PERMISSION_DENIED, 'Permission denied when accessing this file.', err);
  }
  if (msg.includes('external') || msg.includes('modified externally')) {
    return new StudioError(ErrorCode.EXTERNAL_MODIFICATION, 'The file was modified on disk by another program.', err);
  }
  if (msg.includes('path') || msg.includes('traversal')) {
    return new StudioError(ErrorCode.PATH_NOT_ALLOWED, 'The requested path is not permitted.', err);
  }
  return new StudioError(ErrorCode.UNKNOWN, msg, err);
}
