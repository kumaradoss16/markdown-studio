import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runCli } from '../../scripts/run-docs-qa.js';

describe('CLI Docs QA (Release 0.7 Headless)', () => {
  const fixtureDir = path.resolve('tests/fixtures/docs-qa-workspace');
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('exits with code 1 when workspace contains blocking documentation errors', async () => {
    const exitCode = await runCli([
      '--root', fixtureDir,
      '--profile', 'docs-repo',
      '--fail-on', 'error'
    ]);

    expect(exitCode).toBe(1);
  });

  it('exits with code 2 when root directory does not exist', async () => {
    const exitCode = await runCli([
      '--root', 'this/path/absolutely/does/not/exist',
      '--profile', 'default'
    ]);

    expect(exitCode).toBe(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
  });

  it('outputs valid JSON report when --format json is specified', async () => {
    const outPath = path.resolve(fixtureDir, 'test-output-report.json');
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    const exitCode = await runCli([
      '--root', fixtureDir,
      '--profile', 'ci-blocking',
      '--format', 'json',
      '--out', outPath
    ]);

    expect(fs.existsSync(outPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(content.reportVersion).toBe('1.0.0');
    expect(content.profile).toBe('ci-blocking');
    expect(content.diagnostics.length).toBeGreaterThan(0);

    // Clean up
    fs.unlinkSync(outPath);
  });
});
