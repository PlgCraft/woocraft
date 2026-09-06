import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import archiver from 'archiver';

import { die, has, run } from '../exec.js';
import { resolveProject } from '../project.js';
import type { Project, WpEnv } from '../project.js';
import type { Reporter } from '../report.js';
import { activateInWordPress } from './wordpress.js';

const EXTRAS = ['readme.txt', 'changelog.txt', 'LICENSE', 'LICENSE.txt', 'languages'];

// Mirror the freshly-scaffolded plugin into the WordPress install the user
// pointed us at and activate it. Best-effort — a failure is reported and
// `npm run deploy` retries.
export async function deployToWordPress(
  targetDir: string,
  wpRootDir: string,
  env: WpEnv,
  report: Reporter,
): Promise<void> {
  try {
    const project = resolveProject(targetDir);
    if (!ensurePluginBuilt(targetDir, report)) {
      report({
        kind: 'warn',
        message: 'plugin not deployed — Composer is required to build it.',
        hint: 'Install Composer, then run `npm run deploy`.',
      });
      return;
    }
    const dest = join(wpRootDir, 'wp-content', 'plugins', project.slug);
    report({ kind: 'step', label: 'Deploying', detail: dest });
    syncPlugin(project, dest);
    await activateInWordPress(project, wpRootDir, env, report);
    report({ kind: 'success', message: `${project.slug} deployed to ${wpRootDir}` });
  } catch (err) {
    report({
      kind: 'warn',
      message: `deploy did not finish: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
      hint: 'Run `npm run deploy` to retry.',
    });
  }
}

// Make sure the plugin's build outputs exist so it can be mirrored into a
// WordPress install: node deps, the Composer autoloader, and the Vite
// bundle. Returns false when it can't produce a loadable plugin (no
// Composer -> no vendor/autoload.php, which the plugin `require`s).
function ensurePluginBuilt(targetDir: string, report: Reporter): boolean {
  if (!existsSync(join(targetDir, 'node_modules', 'vite'))) {
    run('npm', ['install', '--no-audit', '--no-fund'], { cwd: targetDir, report });
  }
  if (has('composer') && !existsSync(join(targetDir, 'vendor', 'autoload.php'))) {
    run('composer', ['install', '--no-interaction', '--quiet'], { cwd: targetDir, report });
  }
  if (!existsSync(join(targetDir, 'src', 'Admin', 'dist', 'index.js'))) {
    run('npm', ['run', 'build:app'], { cwd: targetDir, report });
  }
  return existsSync(join(targetDir, 'vendor', 'autoload.php'));
}

// Copy the plugin's shippable files into `dest` — a WordPress plugins
// directory here (`packagePlugin` below does the same for a release zip)
// — and strip anything that doesn't belong in a shipped plugin.
export function syncPlugin(project: Project, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  for (const p of [`${project.slug}.php`, 'uninstall.php', 'composer.json', 'src', 'vendor']) {
    cpSync(join(project.root, p), join(dest, p), { recursive: true });
  }
  for (const extra of EXTRAS) {
    const src = join(project.root, extra);
    if (existsSync(src)) cpSync(src, join(dest, extra), { recursive: true });
  }

  stripAdminSource(dest);
  stripCruft(dest);
}

export async function packagePlugin(project: Project, report: Reporter): Promise<string> {
  const version = readVersion(project);

  report({ kind: 'step', label: 'Packaging', detail: `${project.slug} ${version}` });
  const dist = join(project.root, 'dist');
  const stage = join(dist, project.slug);
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  const shipped = [`${project.slug}.php`, 'uninstall.php', 'composer.json', 'src'];
  for (const p of shipped) {
    cpSync(join(project.root, p), join(stage, p), { recursive: true });
  }
  // Carry the lockfile into the stage (not shipped itself) so the
  // production install below resolves the exact versions already tested,
  // instead of re-resolving from scratch.
  const lock = join(project.root, 'composer.lock');
  if (existsSync(lock)) cpSync(lock, join(stage, 'composer.lock'));
  for (const extra of EXTRAS) {
    const src = join(project.root, extra);
    if (existsSync(src)) cpSync(src, join(stage, extra), { recursive: true });
  }

  stripAdminSource(stage);
  report({ kind: 'info', message: '==> Building the production Composer autoloader' });

  // Installed *inside the stage copy*, not the project root — building a
  // release zip must never touch the developer's own working `vendor/`.
  run(
    'composer',
    [
      'install',
      '--no-dev',
      '--optimize-autoloader',
      '--classmap-authoritative',
      '--no-interaction',
      '--quiet',
    ],
    { cwd: stage, report },
  );
  rmSync(join(stage, 'composer.lock'), { force: true });

  stripCruft(stage);

  const zipPath = join(dist, `${project.slug}.zip`);
  await zipDir(stage, project.slug, zipPath);
  return zipPath;
}

function zipDir(dir: string, prefix: string, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(out);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(dir, prefix);
    void archive.finalize();
  });
}

function readVersion(project: Project): string {
  const header = readFileSync(project.pluginFile, 'utf8');
  const m = header.match(/^[\s*]*Version:\s*(.+?)\s*$/m);
  if (!m) die(`could not read Version from ${project.slug}.php`);
  return m[1];
}

// Keep only AdminMenu.php + the built dist/ inside src/Admin/.
function stripAdminSource(pluginRoot: string): void {
  const adminDir = join(pluginRoot, 'src', 'Admin');
  for (const entry of readdirSync(adminDir)) {
    if (entry === 'AdminMenu.php' || entry === 'dist') continue;
    rmSync(join(adminDir, entry), { recursive: true, force: true });
  }
  if (!existsSync(join(adminDir, 'dist', 'index.js'))) {
    die('src/Admin/dist/index.js is missing — did the UI build succeed?');
  }
}

// Remove things WordPress.org's Plugin Check rejects or that just don't
// belong in a shipped plugin: hidden files (.gitkeep, .DS_Store, a vendor
// package's .editorconfig …), dev READMEs, and test suites.
function stripCruft(pluginRoot: string): void {
  const testDirs = new Set(['__tests__', 'tests', 'Tests', 'test']);
  walkAll(pluginRoot, (path, isDir) => {
    const base = path.split(/[/\\]/).pop() ?? '';
    if (isDir) {
      if (testDirs.has(base)) {
        rmSync(path, { recursive: true, force: true });
        return false; // don't descend into a deleted dir
      }
      return true;
    }
    if (base.startsWith('.') || base === 'README.md' || base === 'readme.md') {
      unlinkSync(path);
    }
    return true;
  });
}

// Visit every entry under `dir`. `fn(path, isDir)` returns false to skip
// descending into a directory (e.g. one it just deleted).
function walkAll(dir: string, fn: (path: string, isDir: boolean) => boolean): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const isDir = statSync(full).isDirectory();
    const descend = fn(full, isDir);
    if (isDir && descend !== false && existsSync(full)) walkAll(full, fn);
  }
}
