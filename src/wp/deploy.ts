import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { die, has, run } from '../exec.js';
import { resolveProject } from '../project.js';
import type { Project } from '../project.js';
import type { Reporter } from '../report.js';
import { activateInWordPress } from './wordpress.js';

const EXTRAS = ['readme.txt', 'changelog.txt', 'LICENSE', 'LICENSE.txt', 'languages'];

// Mirror the freshly-scaffolded plugin into the WordPress install the user
// pointed us at and activate it. Best-effort — a failure is reported and
// `npm run dev` retries.
export function deployToWordPress(targetDir: string, wpRootDir: string, report: Reporter): void {
  try {
    const project = resolveProject(targetDir);
    if (!ensurePluginBuilt(targetDir, report)) {
      report({
        kind: 'warn',
        message: 'plugin not deployed — Composer is required to build it.',
        hint: 'Install Composer, then run `npm run dev`.',
      });
      return;
    }
    const dest = join(wpRootDir, 'wp-content', 'plugins', project.slug);
    report({ kind: 'step', label: 'Deploying', detail: dest });
    syncPlugin(project, dest);
    activateInWordPress(project, wpRootDir, report);
    report({ kind: 'success', message: `${project.slug} deployed to ${wpRootDir}` });
  } catch (err) {
    report({
      kind: 'warn',
      message: `deploy did not finish: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
      hint: 'Run `npm run dev` to retry.',
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

// Copy the plugin's shippable files into `dest` (a WordPress plugins
// directory here; a release-zip staging dir once `woocraft build` exists)
// and strip anything that doesn't belong in a shipped plugin.
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
