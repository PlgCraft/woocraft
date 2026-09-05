import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { qitPassthrough, runQitTests } from '../commands.js';
import { die, UserError } from '../exec.js';
import { projectConfig, resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { ensureQit } from '../toolchain.js';
import { packagePlugin } from '../wp/deploy.js';

type QitOptions = {
  tests: string[];
  build: boolean;
  raw: string[];
};

const DEFAULT_QIT_TESTS = ['security', 'phpstan', 'phpcompatibility', 'plugin-check', 'activation'];

export async function cmdQit(args: string[]): Promise<void> {
  const { raw, tests, build } = parseQitOptions(args);
  const project = resolveProject();
  const qitBin = ensureQit(project, consoleReporter);

  // Passthrough: `woocraft qit -- partner:add`, `woocraft qit -- list`, …
  if (raw.length > 0) {
    qitPassthrough(qitBin, project.root, raw, consoleReporter);
    return;
  }

  const cfg = (projectConfig(project.root).qit ?? {}) as { tests?: string[]; args?: string[] };
  const allTests = tests.length > 0 ? tests : cfg.tests?.length ? cfg.tests : DEFAULT_QIT_TESTS;
  const extraArgs = cfg.args ?? [];
  const zip = join(project.root, 'dist', `${project.slug}.zip`);

  if (build) {
    await packagePlugin(project, consoleReporter);
  } else if (!existsSync(zip)) {
    die('No dist/ zip yet — run `woocraft build` first, or drop --no-build.');
  }

  const failed = runQitTests(qitBin, project.root, zip, allTests, extraArgs, consoleReporter);

  if (failed.length > 0) throw new UserError(`QIT tests failed: ${failed.join(', ')}`);
  consoleReporter({ kind: 'success', message: 'QIT: all tests passed' });
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
