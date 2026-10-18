import { ErrorCode, StudioError, redactSensitiveData } from './error-service.js';

/**
 * GitHubApiClient
 * Centralized, mockable REST API client enforcing:
 * 1. Read-only invariants (zero mutation methods; POST/PUT/PATCH/DELETE throw PUBLISHING_DISABLED).
 * 2. Rate limiting, backoff, and jitter based on X-RateLimit headers and Retry-After.
 * 3. Request timeouts with AbortController and bounded payload limits (max 5 MB).
 * 4. Token redaction across all error logs and diagnostic messages.
 * 5. Mockable transport for deterministic, offline testing.
 */
export class GitHubApiClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl='https://api.github.com']
   * @param {number} [options.timeoutMs=10000]
   * @param {number} [options.maxPayloadBytes=5242880] // 5MB
   * @param {number} [options.maxRetries=3]
   * @param {Function} [options.transport] // Custom fetch-like transport for testing
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://api.github.com';
    this.timeoutMs = options.timeoutMs || 10000;
    this.maxPayloadBytes = options.maxPayloadBytes || 5 * 1024 * 1024;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.transport = options.transport || (typeof fetch !== 'undefined' ? fetch.bind(window || globalThis) : null);
    
    // Rate limit tracking state
    this.rateLimit = {
      limit: 60,
      remaining: 60,
      reset: 0,
      retryAfter: 0,
    };
  }

  /**
   * Sets custom transport for unit and integration testing.
   * @param {Function} transport
   */
  setTransport(transport) {
    this.transport = transport;
  }

  /**
   * Primary GET request implementation with rate-limit tracking, retries, and payload validation.
   * @param {string} endpoint
   * @param {Object} [options]
   * @param {string} [options.token]
   * @param {Record<string, string>} [options.headers]
   * @param {number} [options.timeoutMs]
   * @param {number} [options.retries]
   * @returns {Promise<any>}
   */
  async get(endpoint, options = {}) {
    const retries = options.retries !== undefined ? options.retries : this.maxRetries;
    return this.executeWithRetry(endpoint, options, retries, 0);
  }

  /**
   * Strictly blocks any mutation operations in Release 0.4.
   */
  async post() {
    throw new StudioError(
      ErrorCode.PUBLISHING_DISABLED,
      'Release 0.4 is strictly read-and-draft only; repository mutations are disabled.'
    );
  }

  async put() {
    throw new StudioError(
      ErrorCode.PUBLISHING_DISABLED,
      'Release 0.4 is strictly read-and-draft only; repository mutations are disabled.'
    );
  }

  async patch() {
    throw new StudioError(
      ErrorCode.PUBLISHING_DISABLED,
      'Release 0.4 is strictly read-and-draft only; repository mutations are disabled.'
    );
  }

  async delete() {
    throw new StudioError(
      ErrorCode.PUBLISHING_DISABLED,
      'Release 0.4 is strictly read-and-draft only; repository mutations are disabled.'
    );
  }

  /**
   * Internal retry loop handling rate limits and transient errors.
   */
  async executeWithRetry(endpoint, options, maxRetries, currentAttempt) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const timeout = options.timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DevspireHub-Markdown-Studio/0.4.0',
      ...(options.headers || {}),
    };

    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    try {
      if (!this.transport) {
        throw new StudioError(ErrorCode.NETWORK_UNAVAILABLE, 'No network transport available.');
      }

      const response = await this.transport(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse RateLimit Headers
      this.extractRateLimitHeaders(response.headers);

      // Handle HTTP status codes
      if (!response.ok) {
        return await this.handleErrorResponse(response, endpoint, options, maxRetries, currentAttempt);
      }

      // Read response with size bounding
      const text = await response.text();
      if (text.length > this.maxPayloadBytes) {
        throw new StudioError(
          ErrorCode.PAYLOAD_TOO_LARGE,
          `Response size (${(text.length / 1024 / 1024).toFixed(2)} MB) exceeded security threshold of 5 MB.`
        );
      }

      // Safe JSON parse if content-type indicates JSON
      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          return JSON.parse(text);
        } catch (jsonErr) {
          throw new StudioError(ErrorCode.INVALID_ENCODING, 'Malformed JSON response received from GitHub API.');
        }
      }

      return text;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new StudioError(ErrorCode.TIMEOUT, `Request to GitHub timed out after ${timeout}ms.`);
      }

      if (err instanceof StudioError || err.name === 'StudioError' || err.code) {
        throw err;
      }

      // Transient network errors may be retried if attempts remain
      if (currentAttempt < maxRetries) {
        const delayMs = this.calculateBackoff(currentAttempt);
        await new Promise((res) => setTimeout(res, delayMs));
        return this.executeWithRetry(endpoint, options, maxRetries, currentAttempt + 1);
      }

      throw new StudioError(
        ErrorCode.NETWORK_UNAVAILABLE,
        `Network error accessing GitHub API: ${redactSensitiveData(err?.message || 'Connection failed')}`
      );
    }
  }

  extractRateLimitHeaders(headers) {
    if (!headers) return;
    const getVal = (k) => (typeof headers.get === 'function' ? headers.get(k) : headers[k]);
    const limit = getVal('x-ratelimit-limit');
    const remaining = getVal('x-ratelimit-remaining');
    const reset = getVal('x-ratelimit-reset');
    const retryAfter = getVal('retry-after');

    if (limit !== undefined && limit !== null) this.rateLimit.limit = parseInt(limit, 10);
    if (remaining !== undefined && remaining !== null) this.rateLimit.remaining = parseInt(remaining, 10);
    if (reset !== undefined && reset !== null) this.rateLimit.reset = parseInt(reset, 10);
    if (retryAfter !== undefined && retryAfter !== null) this.rateLimit.retryAfter = parseInt(retryAfter, 10);
  }

  async handleErrorResponse(response, endpoint, options, maxRetries, currentAttempt) {
    const status = response.status;
    let message = '';
    try {
      const errBody = await response.json();
      message = errBody.message || '';
    } catch {
      message = response.statusText || '';
    }

    const sanitizedMessage = redactSensitiveData(message);

    // Rate Limiting (403 with 0 remaining, or 429)
    if (status === 429 || (status === 403 && this.rateLimit.remaining === 0)) {
      if (currentAttempt < maxRetries && this.rateLimit.retryAfter > 0 && this.rateLimit.retryAfter <= 15) {
        const waitMs = this.rateLimit.retryAfter * 1000;
        await new Promise((res) => setTimeout(res, waitMs));
        return this.executeWithRetry(endpoint, options, maxRetries, currentAttempt + 1);
      }

      throw new StudioError(
        ErrorCode.RATE_LIMITED,
        `GitHub API rate limit exceeded. Resets at ${new Date(this.rateLimit.reset * 1000).toLocaleTimeString()}.`,
        { rateLimit: this.rateLimit }
      );
    }

    if (status === 401) {
      throw new StudioError(
        ErrorCode.AUTH_EXPIRED,
        'GitHub authentication token is invalid or expired. Please re-authenticate.'
      );
    }

    if (status === 403) {
      throw new StudioError(
        ErrorCode.PERMISSION_DENIED,
        `Access to this GitHub resource was forbidden: ${sanitizedMessage}`
      );
    }

    if (status === 404) {
      throw new StudioError(
        ErrorCode.NOT_FOUND,
        `The requested GitHub repository or resource was not found: ${sanitizedMessage}`
      );
    }

    // 5xx Server Errors (transient, retryable)
    if (status >= 500 && currentAttempt < maxRetries) {
      const delayMs = this.calculateBackoff(currentAttempt);
      await new Promise((res) => setTimeout(res, delayMs));
      return this.executeWithRetry(endpoint, options, maxRetries, currentAttempt + 1);
    }

    throw new StudioError(
      ErrorCode.UNKNOWN,
      `GitHub API request failed with HTTP ${status}: ${sanitizedMessage}`
    );
  }

  calculateBackoff(attempt) {
    // Bounded exponential backoff with jitter: 2^attempt * 300ms + random(50ms)
    const base = Math.min(2000, Math.pow(2, attempt) * 300);
    const jitter = Math.floor(Math.random() * 80);
    return base + jitter;
  }
}

export const gitHubApiClient = new GitHubApiClient();
