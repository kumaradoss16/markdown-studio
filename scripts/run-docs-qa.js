#!/usr/bin/env node

/**
 * Headless CLI verification runner for DevspireHub Documentation QA.
 * Suitable for CI/CD workflows, pull-request gates, and local repository audits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { projectQaCoordinator } from '../src/core/project-qa-coordinator.js';
import { qaReportWriter } from '../src/services/qa-report-writer.js';

function parseArgs(args) {
  const options = {
    root: '.',
    profile: 'default',
    config: null,
    format: 'text',
    out: null,
    failOn: null,
    annotations: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root' && i + 1 < args.length) {
      options.root = args[++i];
    } else if (arg === '--profile' && i + 1 < args.length) {
      options.profile = args[++i];
    } else if (arg === '--config' && i + 1 < args.length) {
      options.config = args[++i];
    } else if (arg === '--format' && i + 1 < args.length) {
      options.format = args[++i];
    } else if (arg === '--out' && i + 1 < args.length) {
      options.out = args[++i];
    } else if (arg === '--fail-on' && i + 1 < args.length) {
      options.failOn = args[++i];
    } else if (arg === '--annotations' && i + 1 < args.length) {
      options.annotations = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
DevspireHub Documentation QA CLI
Usage: node scripts/run-docs-qa.js [options]

Options:
  --root <path>         Workspace root directory (default: ".")
  --profile <name>      Validation profile (default, strict, docs-repo, ci-blocking)
  --config <path>       Custom path to .devspirehub/qa.json
  --format <type>       Report format: text, json, markdown (default: text)
  --out <path>          Write formatted report to destination file
  --fail-on <severity>  Threshold for exit code 1: error or warning (default from profile)
  --annotations <type>  Workflow annotations (e.g. "github")
  --help, -h            Show this help message
`);
}

/**
 * Node filesystem adapter that enforces workspace root isolation.
 */
function createNodeFsAdapter(rootDir) {
  const resolvedRoot = path.resolve(rootDir);

  function checkWithinRoot(targetPath) {
    const absTarget = path.isAbsolute(targetPath) ? path.normalize(targetPath) : path.resolve(resolvedRoot, targetPath);
    if (!absTarget.startsWith(resolvedRoot)) {
      throw new Error(`Path traversal denied: "${targetPath}" resolves outside workspace root`);
    }
    return absTarget;
  }

  function walkDir(currentDir, relativeBase = '') {
    const results = [];
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const relPath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath, relPath));
      } else if (entry.isFile()) {
        results.push(relPath.replace(/\\/g, '/'));
      }
    }
    return results;
  }

  return {
    resolvedRoot,
    fileExists(relPath) {
      try {
        const abs = checkWithinRoot(relPath);
        return fs.existsSync(abs);
      } catch {
        return false;
      }
    },
    async readFile(relPath) {
      const abs = checkWithinRoot(relPath);
      return fs.readFileSync(abs, 'utf8');
    },
    async listFiles() {
      if (!fs.existsSync(resolvedRoot)) {
        return [];
      }
      return walkDir(resolvedRoot);
    }
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const rootDir = options.root;

  // Verify root existence
  if (!fs.existsSync(rootDir)) {
    console.error(`Error: Workspace root directory "${rootDir}" does not exist.`);
    return 2;
  }

  const fsAdapter = createNodeFsAdapter(rootDir);

  try {
    const report = await projectQaCoordinator.runQa({
      workspaceRoot: rootDir,
      profile: options.profile,
      configPath: options.config,
      failOn: options.failOn,
      fsAdapter
    });

    let formattedOutput = '';
    if (options.format === 'json') {
      formattedOutput = JSON.stringify(report, null, 2);
    } else if (options.format === 'markdown') {
      formattedOutput = qaReportWriter.formatMarkdown(report);
    } else {
      formattedOutput = qaReportWriter.formatText(report);
    }

    if (options.out) {
      const outPath = path.resolve(options.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, formattedOutput, 'utf8');
      console.log(`Report successfully written to ${options.out}`);
    } else {
      console.log(formattedOutput);
    }

    if (options.annotations === 'github') {
      const annotations = qaReportWriter.formatGitHubAnnotations(report.diagnostics);
      if (annotations) {
        console.log(annotations);
      }
    }

    return report.exitCode;
  } catch (err) {
    console.error(`Fatal QA execution error: ${err.message}`);
    return 2;
  }
}

// Direct execution guard
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  runCli().then(code => process.exit(code));
}
