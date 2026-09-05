import { join } from 'node:path';

import prompts from 'prompts';

import { die, has, run, sh, tryCapture } from '../exec.js';
import type { Project } from '../project.js';
import type { Reporter } from '../report.js';
import { readSettings, rememberWpPath } from '../settings.js';
import { expandTilde, isWordPressWithWoo, wpRoot } from './wppath.js';

export type WpTarget = {
  /** the WordPress root directory (holds wp-load.php) */
  root: string;
  /** <root>/wp-content/plugins/<slug> : where the plugin is mirrored */
  pluginDir: string;
  /** siteurl option, if WP-CLI is available to read it */
  siteUrl?: string;
};

// Resolve the WordPress install this project deploys into: an explicit
// --path, then the saved machine config, else an interactive prompt. The
// path is validated (wp-load.php + an installed WooCommerce) and saved.
export async function resolveWordPress(
  project: Project,
  opts: { path?: string; interactive: boolean },
): Promise<WpTarget> {
  const saved = readSettings().wpPaths?.[project.root];
  const candidate = opts.path ?? saved;

  let root = candidate ? wpRoot(candidate) : null;
  if (!root) {
    if (candidate && opts.path) die(`Not a WordPress install with WooCommerce: ${expandTilde(opts.path)}`);
    if (!opts.interactive) {
      die(
        'No WordPress path set for this project.\n' +
          'Pass --path <path-to-wordpress>, or run `woocraft deploy` in a terminal once.',
      );
    }
    const { path } = await prompts({
      type: 'text',
      name: 'path',
      message: 'Path to your WordPress install (must have WooCommerce active)',
      initial: candidate ? expandTilde(candidate) : undefined,
      validate: (v: string) =>
        isWordPressWithWoo(v) ? true : 'No wp-load.php + active WooCommerce found there',
    });
    if (!path) die('Aborted.');
    root = wpRoot(String(path));
  }
  if (!root) die('Could not resolve a WordPress install at that path.');

  rememberWpPath(project.root, root);

  let siteUrl: string | undefined;
  if (has('wp')) {
    siteUrl =
      tryCapture('wp', [
        'option', 'get', 'siteurl',
        `--path=${root}`, '--skip-plugins', '--skip-themes',
      ]) ?? undefined;
  }

  return { root, pluginDir: join(root, 'wp-content', 'plugins', project.slug), siteUrl };
}

export function activateInWordPress(project: Project, root: string, report: Reporter): void {
  if (!has('wp')) {
    report({
      kind: 'info',
      message: `Activate "${project.slug}" in wp-admin (WP-CLI not found for auto-activate).`,
    });
    return;
  }
  try {
    run('wp', ['plugin', 'activate', project.slug, `--path=${root}`], { report });
  } catch {
    report({ kind: 'warn', message: `could not auto-activate ${project.slug} — activate it in wp-admin.` });
  }
}

export function pluginCheckInWordPress(project: Project, root: string, report: Reporter): void {
  if (!has('wp')) {
    die(
      'WP-CLI (`wp`) is not on PATH. Install it (https://wp-cli.org) and run:\n' +
        `  wp plugin check ${project.slug} --path='${root}'`,
    );
  }
  const p = `--path='${root}'`;
  sh(`wp plugin is-installed plugin-check ${p} || wp plugin install plugin-check --activate ${p}`, { report });
  sh(`wp plugin activate ${project.slug} ${p} >/dev/null; wp plugin check ${project.slug} ${p}`, { report });
}
