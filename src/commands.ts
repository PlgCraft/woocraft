import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { die, run, UserError } from './exec.js';
import type { Project } from './project.js';
import type { Reporter } from './report.js';

export function buildAdminUi(project: Project, report: Reporter): void {
  if (!existsSync(join(project.root, 'src', 'Admin', 'vite.config.ts'))) {
    die('No src/Admin/vite.config.ts — nothing to build.');
  }
  report({ kind: 'info', message: '==> Building admin UI' });

  ensureNodeModules(project.root, report);

  try {
    run('npm', ['run', 'build:app'], { cwd: project.root, report });
  } catch (err) {
    if (isMissingBinary(err)) throw missingBinary('npm', NODE_HINT);
    throw new UserError('Building the admin UI failed.');
  }

  if (!existsSync(join(project.root, 'src', 'Admin', 'dist', 'index.js'))) {
    die('vite build produced no src/Admin/dist/index.js');
  }
}

export function composerNoDev(project: Project, report: Reporter): void {
  report({ kind: 'info', message: '==> Building the production Composer autoloader' });
  try {
    run(
      'composer',
      ['install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--quiet'],
      { cwd: project.root, report },
    );
  } catch (err) {
    if (isMissingBinary(err)) throw missingBinary('composer', COMPOSER_HINT);
    throw new UserError('Composer install failed.');
  }
}

export function phpcsLint(phpcsBin: string, projectRoot: string, configPath: string, report: Reporter): void {
  report({ kind: 'info', message: '==> Running PHP_CodeSniffer' });
  try {
    run(phpcsBin, [`--standard=${configPath}`], { cwd: projectRoot, report });
  } catch (err) {
    if (isMissingBinary(err)) throw brokenToolchain('phpcs');
    throw new UserError('PHP_CodeSniffer reported problems.');
  }
}

export function phpcbfFix(phpcbfBin: string, projectRoot: string, configPath: string, report: Reporter): void {
  report({ kind: 'info', message: '==> Running PHP_CodeSniffer (auto-fixing)' });
  try {
    run(phpcbfBin, [`--standard=${configPath}`], { cwd: projectRoot, report });
  } catch (err) {
    // phpcbf exits 1 when it successfully rewrote every fixable file —
    // that's success, not a failure.
    if (exitStatus(err) === 1) return;

    if (isMissingBinary(err)) throw brokenToolchain('phpcbf');
    throw new UserError('phpcbf could not fix every problem — see above.');
  }
}

export function generatePot(
  wpCli: string,
  projectRoot: string,
  pot: string,
  slug: string,
  textDomain: string,
  report: Reporter,
): void {
  report({ kind: 'info', message: '==> Running wp i18n make-pot' });
  try {
    run(
      'php',
      [
        wpCli,
        'i18n',
        'make-pot',
        '.',
        pot,
        `--slug=${slug}`,
        `--domain=${textDomain}`,
        '--exclude=vendor,dist,node_modules,.woocraft,src/Admin/dist,src/Admin/lib',
      ],
      { cwd: projectRoot, report },
    );
  } catch (err) {
    if (isMissingBinary(err)) throw brokenToolchain('wp-cli.phar');
    throw new UserError('wp i18n make-pot reported problems.');
  }
}

// `woocraft qit -- <command>` passthrough, e.g. `partner:add` or `list`.
export function qitPassthrough(qitBin: string, projectRoot: string, args: string[], report: Reporter): void {
  try {
    run('php', [qitBin, ...args], { cwd: projectRoot, report });
  } catch (err) {
    if (isMissingBinary(err)) throw brokenToolchain('qit');
    throw new UserError('QIT reported problems.');
  }
}

// Runs each QIT test against `zip` in turn, continuing past a failing
// test so one bad result doesn't hide the rest — returns the names that
// failed (empty when everything passed).
export function runQitTests(
  qitBin: string,
  projectRoot: string,
  zip: string,
  tests: string[],
  extraArgs: string[],
  report: Reporter,
): string[] {
  const failed: string[] = [];
  for (const test of tests) {
    report({ kind: 'step', label: 'QIT', detail: test });
    try {
      run('php', [qitBin, `run:${test}`, '--zip', zip, ...extraArgs], { cwd: projectRoot, report });
    } catch (err) {
      if (isMissingBinary(err)) throw brokenToolchain('qit');
      failed.push(test);
    }
  }
  return failed;
}

export function phpstanAnalyse(phpstanPhar: string, phpstanDir: string, configPath: string, report: Reporter): void {
  report({ kind: 'info', message: '==> Running PHPStan' });
  try {
    run(
      'php',
      [phpstanPhar, 'analyse', '--no-progress', '-c', configPath, '-a', 'vendor/autoload.php'],
      { cwd: phpstanDir, report },
    );
  } catch (err) {
    // php's own presence is already guaranteed by ensurePhpstan() before
    // this runs, so a missing binary here can only mean the phar itself.
    if (isMissingBinary(err)) throw brokenToolchain('phpstan.phar');
    throw new UserError('PHPStan reported problems.');
  }
}

const COMPOSER_HINT = 'Install Composer: https://getcomposer.org/download/';
const NODE_HINT = 'Install Node.js: https://nodejs.org/';

function missingBinary(bin: string, hint: string): UserError {
  return new UserError(`\`${bin}\` is required but not on PATH.\n${hint}`);
}

function brokenToolchain(bin: string): UserError {
  return new UserError(
    `${bin} could not be run — the toolchain looks broken.\n` +
      'Delete .woocraft and re-run to reinstall it.',
  );
}

// execFileSync throws a plain Error with a `status` (the exit code) when
// the process ran to completion; that's absent when it couldn't be
// spawned at all (see `isMissingBinary`).
function exitStatus(err: unknown): number | undefined {
  return err && typeof err === 'object' && 'status' in err ? (err as { status?: number }).status : undefined;
}

function isMissingBinary(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

// Install the project's Node deps (the UI toolchain + woocraft) if they
// are not there yet.
function ensureNodeModules(root: string, report: Reporter): void {
  if (existsSync(join(root, 'node_modules', 'vite'))) return;
  report({ kind: 'info', message: '==> Installing Node dependencies' });

  try {
    run('npm', ['ci'], { cwd: root, report });
    return;
  } catch (err) {
    if (isMissingBinary(err)) throw missingBinary('npm', NODE_HINT);
  }

  try {
    run('npm', ['install'], { cwd: root, report });
  } catch {
    throw new UserError('npm install failed.');
  }
}
