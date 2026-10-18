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

  describe('createBranch & Working Branch Hardening', () => {
    const validSha = 'a1b2c3d4e5f678901234567890abcdef12345678';

    it('rejects invalid or missing branch names before making network requests', async () => {
      const ticket = { attemptId: 'att_branch', consumed: false };
      const invalidBranches = [
        '',
        '   ',
        'refs/heads/feature',
        'feature branch with spaces',
        'feature..branch',
        'feature//branch',
        '/feature',
        'feature/',
        '.feature',
        'feature.',
        'feature.lock',
        'feature~1',
        'feature^2',
        'feature:tag',
        'feature?flag',
      ];

      for (const branchName of invalidBranches) {
        await expect(
          writeClient.createBranch({
            ticket: { ...ticket },
            owner: 'devspirehub',
            repo: 'markdown-studio',
            branchName,
            baseCommitSha: validSha,
          })
        ).rejects.toThrowError(expect.objectContaining({ code: ErrorCode.INVALID_INPUT }));
      }

      expect(mockTransport).not.toHaveBeenCalled();
    });

    it('rejects missing or invalid baseCommitSha before making network requests', async () => {
      const ticket = { attemptId: 'att_sha', consumed: false };
      const invalidShas = [
        null,
        undefined,
        '',
        '   ',
        'short',
        'invalid sha with spaces',
        'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', // 40 chars but not hex
        'sha!@#$invalid',
      ];

      for (const baseCommitSha of invalidShas) {
        await expect(
          writeClient.createBranch({
            ticket: { ...ticket },
            owner: 'devspirehub',
            repo: 'markdown-studio',
            branchName: 'valid-branch-name',
            baseCommitSha,
          })
        ).rejects.toThrowError(expect.objectContaining({ code: ErrorCode.INVALID_INPUT }));
      }

      expect(mockTransport).not.toHaveBeenCalled();
    });

    it('rejects createBranch when authentication token is missing', async () => {
      mockAuth.getToken.mockResolvedValueOnce(null);
      const ticket = { attemptId: 'att_no_auth', consumed: false };

      await expect(
        writeClient.createBranch({
          ticket,
          owner: 'devspirehub',
          repo: 'markdown-studio',
          branchName: 'valid-branch',
          baseCommitSha: validSha,
        })
      ).rejects.toThrowError(expect.objectContaining({ code: ErrorCode.AUTH_REQUIRED }));

      expect(mockTransport).not.toHaveBeenCalled();
    });

    it('maps HTTP 404 to actionable StudioError without leaking raw GitHub JSON or credentials', async () => {
      const ticket = { attemptId: 'att_404', consumed: false };
      const rawGitHubError = JSON.stringify({
        message: 'Not Found',
        documentation_url: 'https://docs.github.com/rest/git/refs#create-a-reference',
      });

      mockTransport.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => rawGitHubError,
      });

      try {
        await writeClient.createBranch({
          ticket,
          owner: 'devspirehub',
          repo: 'markdown-studio',
          branchName: 'patch-test',
          baseCommitSha: validSha,
        });
        expect.fail('Should have thrown 404 NOT_FOUND StudioError');
      } catch (err) {
        expect(err).toBeInstanceOf(StudioError);
        expect(err.code).toBe(ErrorCode.NOT_FOUND);
        expect(err.message).toContain('Cannot create branch on "devspirehub/markdown-studio" (Not Found)');
        expect(err.message).toContain('Contents: Read and write');
        // Ensure no raw JSON in user-facing message
        expect(err.message).not.toContain('documentation_url');
        expect(err.message).not.toContain('test_secret_token');
      }
    });

    it('maps HTTP 401 and 403 to auth and permission errors without claiming success', async () => {
      // 401 Unauthorized
      const ticket1 = { attemptId: 'att_401', consumed: false };
      mockTransport.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{"message":"Bad credentials"}',
      });

      await expect(
        writeClient.createBranch({
          ticket: ticket1,
          owner: 'devspirehub',
          repo: 'markdown-studio',
          branchName: 'patch-401',
          baseCommitSha: validSha,
        })
      ).rejects.toThrowError(expect.objectContaining({ code: ErrorCode.AUTH_REQUIRED }));

      // 403 Forbidden
      const ticket2 = { attemptId: 'att_403', consumed: false };
      mockTransport.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"message":"Resource not accessible by personal access token"}',
      });

      await expect(
        writeClient.createBranch({
          ticket: ticket2,
          owner: 'devspirehub',
          repo: 'markdown-studio',
          branchName: 'patch-403',
          baseCommitSha: validSha,
        })
      ).rejects.toThrowError(expect.objectContaining({ code: ErrorCode.UNAUTHORIZED_WRITE }));
    });

    it('distinguishes HTTP 422 branch already exists vs invalid commit SHA', async () => {
      // 422: Already exists
      const ticket1 = { attemptId: 'att_422_exists', consumed: false };
      mockTransport.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => '{"message":"Reference already exists"}',
      });

      await expect(
        writeClient.createBranch({
          ticket: ticket1,
          owner: 'devspirehub',
          repo: 'markdown-studio',
          branchName: 'existing-branch',
          baseCommitSha: validSha,
        })
      ).rejects.toThrowError(/already exists/i);

      // 422: Invalid base SHA or empty repo
      const ticket2 = { attemptId: 'att_422_sha', consumed: false };
      mockTransport.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => '{"message":"Object does not exist"}',
      });

      await expect(
        writeClient.createBranch({
          ticket: ticket2,
          owner: 'devspirehub',
          repo: 'markdown-studio',
          branchName: 'new-branch',
          baseCommitSha: validSha,
        })
      ).rejects.toThrowError(/Base commit SHA/i);
    });

    it('consumes ticket upon branch creation call and sends ref with refs/heads/ prefix', async () => {
      const ticket = { attemptId: 'att_success', consumed: false };
      mockTransport.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ ref: 'refs/heads/patch-1', object: { sha: validSha } }),
      });

      const res = await writeClient.createBranch({
        ticket,
        owner: 'devspirehub',
        repo: 'markdown-studio',
        branchName: 'patch-1',
        baseCommitSha: validSha,
      });

      expect(res.ref).toBe('refs/heads/patch-1');
      expect(ticket.consumed).toBe(true);
      expect(ticket.consumedAt).toBeDefined();

      // Check request URL and payload
      expect(mockTransport).toHaveBeenCalledWith(
        'https://api.github.com/repos/devspirehub/markdown-studio/git/refs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ref: 'refs/heads/patch-1',
            sha: validSha,
          }),
        })
      );
    });
  });
});
