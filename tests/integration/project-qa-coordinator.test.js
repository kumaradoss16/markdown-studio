import { describe, it, expect, vi } from 'vitest';
import { ProjectQaCoordinator } from '../../src/core/project-qa-coordinator.js';
import { AppEvents } from '../../src/app/events.js';

describe('ProjectQaCoordinator (Release 0.7 Integration)', () => {
  it('runs complete QA scan over in-memory file graph and emits events', async () => {
    const mockBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    };

    const coordinator = new ProjectQaCoordinator({ eventBus: mockBus });

    const fileMap = new Map([
      ['README.md', '# Project Title\n\nWelcome! See [Guide](guide.md) and [Anchor](guide.md#architecture).'],
      ['guide.md', '# Developer Guide\n\n## Architecture\n\nSystem overview.\n\n```js\nconst x = 1;\n```\n'],
      ['SUMMARY.md', '# Summary\n\n* [Home](README.md)\n* [Guide](guide.md)']
    ]);

    const report = await coordinator.runQa({
      workspaceRoot: '.',
      profile: 'docs-repo',
      fileMap
    });

    expect(report.passed).toBe(true);
    expect(report.summary.filesScanned).toBe(3);
    expect(report.summary.errors).toBe(0);

    expect(mockBus.emit).toHaveBeenCalledWith(AppEvents.QA_RUN_STARTED, expect.any(Object));
    expect(mockBus.emit).toHaveBeenCalledWith(AppEvents.QA_RUN_COMPLETED, expect.any(Object));
  });

  it('fails closed with exitCode 2 on corrupt configuration', async () => {
    const coordinator = new ProjectQaCoordinator();
    const mockFs = {
      fileExists: () => true,
      readFile: () => '{ corrupt json syntax '
    };

    const report = await coordinator.runQa({
      workspaceRoot: '.',
      fsAdapter: mockFs
    });

    expect(report.passed).toBe(false);
    expect(report.exitCode).toBe(2);
    expect(report.diagnostics[0].ruleId).toBe('RULE_CONFIG_ERROR');
  });

  it('contains failure when single file read fails (Invariant 9)', async () => {
    const coordinator = new ProjectQaCoordinator();
    const mockFs = {
      listFiles: async () => ['good.md', 'bad.md'],
      fileExists: (p) => p === 'good.md' || p === 'bad.md',
      readFile: async (p) => {
        if (p === 'bad.md') throw new Error('EACCES: permission denied');
        return '# Good File\n\nValid markdown.';
      }
    };

    const report = await coordinator.runQa({
      workspaceRoot: '.',
      fsAdapter: mockFs
    });

    // Scanner continues to scan good.md rather than crashing
    expect(report.summary.filesScanned).toBe(2);
    const readErr = report.diagnostics.find(d => d.ruleId === 'RULE_FILE_READ_ERROR');
    expect(readErr).toBeDefined();
    expect(readErr.file).toBe('bad.md');
  });
});
