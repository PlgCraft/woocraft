import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { has, run, UserError } from '../exec.js';
import type { Reporter } from '../report.js';
import { warmToolchain } from '../toolchain.js';
import { renderTemplate } from './render.js';
import { buildTokens } from './tokens.js';
import type { Answers } from './tokens.js';

const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEMPLATE_DIR = join(PKG_ROOT, 'template');

export type ScaffoldResult = {
  targetDir: string;
  /** the extension's display name, e.g. "Coupon Wizard" */
  name: string;
  fileCount: number;
  /** the woocraft version pinned via file:, or null when the published one is used */
  pinnedVersion: string | null;
};

// Render the template into `dirName`, producing a ready-to-install project.
export async function scaffoldProject(dirName: string, answers: Answers): Promise<ScaffoldResult> {
  const targetDir = isAbsolute(dirName) ? dirName : resolve(process.cwd(), dirName);

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new UserError(`Target directory is not empty: ${targetDir}`);
  }
  mkdirSync(targetDir, { recursive: true });

  const tokens = buildTokens(answers);
  const fileCount = renderTemplate({ templateDir: TEMPLATE_DIR, targetDir, tokens });
  const pinnedVersion = pinLocalWoocraft(targetDir);

  return { targetDir, name: tokens.name, fileCount, pinnedVersion };
}

// Install a freshly-scaffolded project's dependencies and build its admin
// UI, so it's ready to deploy. Best-effort — a failure is reported and the
// caller falls back to printing manual steps.
export async function setupProject(targetDir: string, report: Reporter): Promise<boolean> {
  try {
    report({ kind: 'step', label: 'Installing', detail: '(--no-install to skip)' });
    run('npm', ['install', '--no-audit', '--no-fund'], { cwd: targetDir, report });

    const composer = has('composer');
    if (composer) {
      run('composer', ['install', '--no-interaction', '--quiet'], { cwd: targetDir, report });
    } else {
      report({ kind: 'warn', message: 'composer not found — run `composer install` yourself' });
    }

    run('npm', ['run', 'build:app'], { cwd: targetDir, report });

    if (composer && has('php')) {
      await warmToolchain(targetDir, report);
    }
    return true;
  } catch (err) {
    report({
      kind: 'warn',
      message: `setup did not finish: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'Finish it by hand — see the steps below.',
    });
    return false;
  }
}

// The published package.json pins `woocraft` by version. When `woocraft
// new` is itself being run from an unpublished build (local tarball or
// `npm link`), that version is not on the registry yet — point the new
// project's dependency at this build instead so `npm install` works.
function pinLocalWoocraft(targetDir: string): string | null {
  const selfPkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
  const version: string = selfPkg.version;

  if (isPublished('woocraft', version)) return null;

  const pkgPath = join(targetDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.devDependencies = pkg.devDependencies ?? {};
  pkg.devDependencies.woocraft = `file:${PKG_ROOT.replace(/[/\\]$/, '')}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');

  return version;
}

function isPublished(name: string, version: string): boolean {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out.length > 0;
  } catch (err) {
    // A confirmed 404 means this version genuinely isn't on the registry
    // yet — safe to pin a local file: dependency instead. Anything else
    // (offline, a registry hiccup, ...) is ambiguous, so assume it IS
    // published rather than risk baking a one-off local path into the
    // new project's package.json over a transient network error.
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr?: unknown }).stderr) : '';
    return !stderr.includes('E404');
  }
}
