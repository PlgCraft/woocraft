import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { qitPassthrough, runQitTests } from '../commands.js';
import { die, tryCapture, UserError } from '../exec.js';
import { projectConfig, resolveProject } from '../project.js';
import type { Project } from '../project.js';
import { consoleReporter } from '../report.js';
import type { Reporter } from '../report.js';
import { ensureQit } from '../toolchain.js';
import { packagePlugin } from '../wp/deploy.js';

type QitOptions = {
  tests: string[];
  build: boolean;
  raw: string[];
};

type QitReady = {
  qitBin: string;
  sut: string;
  tests: string[];
  extraArgs: string[];
};

const DEFAULT_QIT_TESTS = ['security', 'phpstan', 'phpcompatibility', 'plugin-check', 'activation'];

export async function cmdQit(args: string[]): Promise<void> {
  const { raw, tests, build } = parseQitOptions(args);
  const project = resolveProject();

  // Passthrough: `npm run qit -- -- partner:add`, `npm run qit -- -- list`, …
  if (raw.length > 0) {
    const qitBin = ensureQit(project, consoleReporter);
    qitPassthrough(qitBin, project.root, raw, consoleReporter);
    return;
  }

  // Checked before packaging, not after — no point spending a composer
  // install and a zip build on a test run that can't possibly work yet.
  const ready = requireQitReady(project, consoleReporter);

  const zip = join(project.root, 'dist', `${project.slug}.zip`);
  if (build) {
    await packagePlugin(project, consoleReporter);
  } else if (!existsSync(zip)) {
    die('No dist/ zip yet — run `npm run build` first, or drop --no-build.');
  }

  const allTests = tests.length > 0 ? tests : ready.tests;
  const failed = runQitTests(ready.qitBin, project.root, zip, ready.sut, allTests, ready.extraArgs, consoleReporter);
  if (failed.length > 0) throw new UserError(`QIT tests failed: ${failed.join(', ')}`);
  consoleReporter({ kind: 'success', message: 'QIT: all tests passed' });
}

// Runs the configured QIT tests against an already-built `zip`, throwing
// if any fail. Shared with `npm run build`, which calls this right after
// packaging — checking registration first doesn't save it any work there
// (it needs to package regardless), so it's checked right before running.
export async function runQitChecks(
  project: Project,
  zip: string,
  report: Reporter,
  testsOverride?: string[],
): Promise<void> {
  const ready = requireQitReady(project, report);
  const tests = testsOverride?.length ? testsOverride : ready.tests;

  const failed = runQitTests(ready.qitBin, project.root, zip, ready.sut, tests, ready.extraArgs, report);
  if (failed.length > 0) throw new UserError(`QIT tests failed: ${failed.join(', ')}`);
  report({ kind: 'success', message: 'QIT: all tests passed' });
}

// Reads the `qit` config from woocraft.json and confirms the resulting
// SUT (system under test) is actually registered on this WooCommerce.com
// account before anything expensive happens.
function requireQitReady(project: Project, report: Reporter): QitReady {
  const qitBin = ensureQit(project, report);
  const cfg = (projectConfig(project.root).qit ?? {}) as { sut?: string; tests?: string[]; args?: string[] };
  const sut = cfg.sut ?? project.slug;

  assertQitExtensionRegistered(qitBin, project.root, sut);

  return {
    qitBin,
    sut,
    tests: cfg.tests?.length ? cfg.tests : DEFAULT_QIT_TESTS,
    extraArgs: cfg.args ?? [],
  };
}

// QIT tests a specific extension listing on your WooCommerce.com account,
// not just any zip — check `sut` is actually one you have access to test
// before bothering to package or upload anything. QIT's own error for
// this only shows up after the upload, and just says "Could not find Woo
// Extension", easy to mistake for a problem with the code or the zip.
function assertQitExtensionRegistered(qitBin: string, projectRoot: string, sut: string): void {
  const out = tryCapture('php', [qitBin, 'extensions'], { cwd: projectRoot }) ?? '';
  const registered = out.split('\n').some((line) => {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    return m ? m[1] === sut || m[2] === sut : false;
  });
  if (registered) return;

  throw new UserError(
    `"${sut}" isn't set up for QIT testing on your WooCommerce.com account yet.\n` +
      'QIT tests a real Marketplace listing, not just any zip, so it needs to exist there first.\n\n' +
      'To fix this:\n' +
      "  1. Connect your account, if you haven't: `npm run qit -- -- partner:add`\n" +
      `  2. Make sure "${sut}" exists as a product in your WooCommerce.com Marketplace seller dashboard\n` +
      "  3. Just added it? Refresh QIT's cached list: `npm run qit -- -- extensions --refresh`\n" +
      '  4. Listed under a different slug? Create a woocraft.json at your project root with:\n' +
      '     { "qit": { "sut": "the-real-slug" } }',
  );
}

function parseQitOptions(argv: string[]): QitOptions {
  const opts: QitOptions = { tests: [], build: true, raw: [] };
  let raw = false;
  for (const a of argv) {
    if (raw) opts.raw.push(a);
    else if (a === '--') raw = true;
    else if (a === '--no-build' || a === '--skip-build') opts.build = false;
    else if (!a.startsWith('-')) opts.tests.push(a);
  }
  return opts;
}
