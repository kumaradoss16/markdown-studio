import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubWriteClient, encodeBase64Utf8 } from '../../src/services/github-write-client.js';
import { StudioError, ErrorCode } from '../../src/services/error-service.js';

describe('GitHubWriteClient (Release 0.5)', () => {
  let writeClient;
  let mockAuth;
  let mockTransport;

  beforeEach(() => {
    mockAuth = {
      getToken: vi.fn().mockResolvedValue('test_secret_token'),
    };
    mockTransport = vi.fn();
    writeClient = new GitHubWriteClient({
      auth: mockAuth,
      transport: mockTransport,
    });
  });

  it('correctly encodes UTF-8 multi-byte strings to Base64', () => {
    const text = '# Technical Docs 🚀 — KaTeX: $\\alpha + \\beta$';
    const b64 = encodeBase64Utf8(text);
    expect(b64).toBeDefined();
    // Decode check
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    expect(decoded).toBe(text);
  });

  it('enforces Invariant 8 (Write Isolation): Rejects calls without valid ticket', async () => {
    await expect(
      writeClient.publishFile({
        ticket: null,
        owner: 'o', repo: 'r', path: 'file.md', branch: 'main', content: 'txt',
      })
    ).rejects.toThrow(StudioError);

    const consumedTicket = { attemptId: 'att1', consumed: true };
    await expect(
      writeClient.publishFile({
        ticket: consumedTicket,
        owner: 'o', repo: 'r', path: 'file.md', branch: 'main', content: 'txt',
      })
    ).rejects.toThrow(StudioError);
  });

  it('enforces Invariant 6 (Concurrency Protection): Rejects updates missing blob SHA', async () => {
    const ticket = { attemptId: 'att1', consumed: false };
    await expect(
      writeClient.publishFile({
        ticket,
        owner: 'o', repo: 'r', path: 'file.md', branch: 'main', content: 'txt',
        sha: null,
        isNewFile: false,
      })
    ).rejects.toThrow(StudioError);
  });

  it('consumes ticket upon execution so it cannot be replayed', async () => {
    const ticket = { attemptId: 'att1', consumed: false };
    mockTransport.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ commit: { sha: 'commit_123' }, content: { sha: 'blob_123' } }),
    });

    await writeClient.publishFile({
      ticket,
      owner: 'o', repo: 'r', path: 'file.md', branch: 'main', content: 'txt',
      sha: 'blob_expected',
      isNewFile: false,
    });

    expect(ticket.consumed).toBe(true);
    expect(ticket.consumedAt).toBeDefined();
  });

  it('intercepts HTTP 409 Conflict and translates to CONFLICT_DETECTED', async () => {
    const ticket = { attemptId: 'att1', consumed: false };
    mockTransport.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => 'Conflict: remote commit has moved.',
    });

    await expect(
      writeClient.publishFile({
        ticket,
        owner: 'o', repo: 'r', path: 'file.md', branch: 'main', content: 'txt',
        sha: 'blob_stale',
        isNewFile: false,
      })
    ).rejects.toThrow(StudioError);
  });

  it('classifies network timeouts and connection drops as OUTCOME_UNCERTAIN', async () => {
    const ticket = { attemptId: 'att_timeout', consumed: false };
    mockTransport.mockRejectedValueOnce(new Error('The user aborted a request.'));

    try {
      await writeClient.publishFile({
        ticket,
        owner: 'o', repo: 'r', path: 'file.md', branch: 'main', content: 'txt',
        sha: 'blob_1',
        isNewFile: false,
      });
      expect.fail('Should have thrown OUTCOME_UNCERTAIN');
    } catch (err) {
      expect(err.code).toBe(ErrorCode.OUTCOME_UNCERTAIN);
    }
  });
});
