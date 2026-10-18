import { describe, it, expect, vi } from 'vitest';
import { GitHubApiClient } from '../../src/services/github-api-client.js';
import { ErrorCode } from '../../src/services/error-service.js';

describe('GitHubApiClient (Release 0.4)', () => {
  it('enforces Invariant 1 & 15: permanently blocks remote mutation operations (POST/PUT/PATCH/DELETE)', async () => {
    const client = new GitHubApiClient();

    await expect(client.post('/repos/owner/repo/contents/test.md', {})).rejects.toMatchObject({
      code: ErrorCode.PUBLISHING_DISABLED,
    });
    await expect(client.put('/repos/owner/repo/contents/test.md', {})).rejects.toMatchObject({
      code: ErrorCode.PUBLISHING_DISABLED,
    });
    await expect(client.patch('/repos/owner/repo', {})).rejects.toMatchObject({
      code: ErrorCode.PUBLISHING_DISABLED,
    });
    await expect(client.delete('/repos/owner/repo/contents/test.md', {})).rejects.toMatchObject({
      code: ErrorCode.PUBLISHING_DISABLED,
    });
  });

  it('performs GET requests and parses rate limit headers', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/json'],
        ['x-ratelimit-limit', '5000'],
        ['x-ratelimit-remaining', '4982'],
        ['x-ratelimit-reset', '1700000000'],
      ]),
      text: async () => JSON.stringify({ id: 1, name: 'markdown-studio' }),
    });

    const client = new GitHubApiClient({ transport: mockTransport });
    const res = await client.get('/repos/owner/markdown-studio', { token: 'mock-token' });

    expect(res.name).toBe('markdown-studio');
    expect(client.rateLimit.limit).toBe(5000);
    expect(client.rateLimit.remaining).toBe(4982);
  });

  it('throws RATE_LIMITED when status is 429 or 403 with remaining=0', async () => {
    const mockTransport = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Map([
        ['x-ratelimit-limit', '60'],
        ['x-ratelimit-remaining', '0'],
        ['x-ratelimit-reset', '1700000000'],
      ]),
      json: async () => ({ message: 'API rate limit exceeded' }),
    });

    const client = new GitHubApiClient({ transport: mockTransport, maxRetries: 0 });
    await expect(client.get('/user')).rejects.toMatchObject({
      code: ErrorCode.RATE_LIMITED,
    });
  });

  it('rejects oversized payloads exceeding 5 MB threshold', async () => {
    const hugePayload = 'A'.repeat(6 * 1024 * 1024); // 6MB
    const mockTransport = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/plain']]),
      text: async () => hugePayload,
    });

    const client = new GitHubApiClient({ transport: mockTransport, maxPayloadBytes: 5 * 1024 * 1024 });
    await expect(client.get('/repos/owner/repo/huge.md')).rejects.toMatchObject({
      code: ErrorCode.PAYLOAD_TOO_LARGE,
    });
  });

  it('handles request timeout using AbortController and throws TIMEOUT', async () => {
    const mockTransport = vi.fn().mockImplementation((url, { signal }) => {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    const client = new GitHubApiClient({ transport: mockTransport, timeoutMs: 50, maxRetries: 0 });
    await expect(client.get('/slow-endpoint')).rejects.toMatchObject({
      code: ErrorCode.TIMEOUT,
    });
  });
});
