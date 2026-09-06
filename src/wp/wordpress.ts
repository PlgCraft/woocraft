import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import prompts from 'prompts';

import { die, run, tryCapture, UserError } from '../exec.js';
import { projectConfig, rememberWpTarget } from '../project.js';
import type { Project, WpEnv, WpTargetSetting } from '../project.js';
import type { Reporter } from '../report.js';
import { ensureWpCli } from '../toolchain.js';
import { expandTilde, findDevKinstaSites, isWordPressWithWoo, wpRoot } from './wppath.js';

export type WpTarget = {
  /** the WordPress root directory (holds wp-load.php) */
  root: string;
  env: WpEnv;
  /** <root>/wp-content/plugins/<slug> : where the plugin is mirrored */
  pluginDir: string;
  /** siteurl option, read via wp-cli, if available */
  siteUrl?: string;
};

// Resolve the WordPress install this project deploys into: an explicit
// --path, then whatever's saved in woocraft.json, else an interactive
// prompt. The path is validated (wp-load.php + an installed WooCommerce)
// and saved.
export async function resolveWordPress(
  project: Project,
  opts: { path?: string; interactive: boolean },
  report: Reporter,
): Promise<WpTarget> {
  const saved = projectConfig(project.root).wpTarget;
  let target: WpTargetSetting;

  if (opts.path) {
    const root = wpRoot(opts.path);
    if (!root) die(`Not a WordPress install with WooCommerce: ${expandTilde(opts.path)}`);
    // An explicit --path overrides the saved one, but if it happens to be
    // the same install, keep whatever environment it was set up as.
    target = { path: root, env: saved?.path === root ? saved.env : 'direct' };
  } else if (saved && isWordPressWithWoo(saved.path)) {
    target = saved;
  } else if (saved) {
    // woocraft.json is meant to be committed, so its wpTarget can easily
    // point at a path that only ever existed on whoever set it up's own
    // machine — that's expected, not a broken project, so it's reported
    // as a plain heads-up, not a crash.
    if (!opts.interactive) {
      die(
        `woocraft.json's wpTarget.path ("${saved.path}") isn't a WordPress install with WooCommerce here —\n` +
          "it's probably set up for someone else's machine. Pass --path, or run \`npm run deploy\` in a\n" +
          'terminal once to set your own (it replaces the saved one).',
      );
    }
    report({
      kind: 'warn',
      message: `woocraft.json's WordPress path doesn't exist on this machine — probably set up for someone else's.`,
      hint: `("${saved.path}") Pick your own below; it'll replace the saved one.`,
    });
    const picked = await promptWpTarget(report);
    if (!picked) die('Aborted.');
    target = picked;
  } else if (opts.interactive) {
    const picked = await promptWpTarget(report);
    if (!picked) die('Aborted.');
    target = picked;
  } else {
    die(
      'No WordPress path set for this project.\n' +
        'Pass --path <path-to-wordpress>, or run `npm run deploy` in a terminal once.',
    );
  }

  rememberWpTarget(project.root, target);

  // Best-effort only — this is a convenience link shown at the end, not
  // worth failing the whole command over.
  let siteUrl: string | undefined;
  try {
    const wpCli = target.env === 'direct' ? await ensureWpCli(project, report) : '';
    siteUrl =
      tryCaptureWp(target.env, wpCli, target.path, [
        'option', 'get', 'siteurl', '--skip-plugins', '--skip-themes',
      ]) ?? undefined;
  } catch {
    siteUrl = undefined;
  }

  return { root: target.path, env: target.env, pluginDir: join(target.path, 'wp-content', 'plugins', project.slug), siteUrl };
}

// Asks which local WordPress to use: a plain path, or a DevKinsta site
// picked from what's actually on this machine. Used both by `new` (to set
// a project up) and by `deploy`/`build` (when nothing's saved for it yet).
export async function promptWpTarget(report: Reporter): Promise<WpTargetSetting | undefined> {
  const { env } = await prompts({
    type: 'select',
    name: 'env',
    message: 'Local WordPress environment',
    choices: [
      { title: 'A path to WordPress', value: 'direct' },
      { title: 'DevKinsta', value: 'devkinsta' },
      { title: 'Set up later', value: 'skip' },
    ],
  });
  if (!env || env === 'skip') return undefined;

  if (env === 'devkinsta') {
    const sites = findDevKinstaSites();
    if (sites.length === 0) {
      report({ kind: 'warn', message: 'No DevKinsta sites with WooCommerce found under ~/DevKinsta/public.' });
      return undefined;
    }
    const { site } = await prompts({
      type: 'select',
      name: 'site',
      message: 'Which DevKinsta site',
      choices: sites.map((dir) => ({ title: basename(dir), value: dir })),
    });
    return site ? { path: site, env: 'devkinsta' } : undefined;
  }

  const { path } = await prompts({
    type: 'text',
    name: 'path',
    message: 'Path to your WordPress install (must have WooCommerce active)',
    validate: (v: string) => (!v || isWordPressWithWoo(v) ? true : 'No wp-load.php + active WooCommerce found there'),
  });
  if (!path) return undefined;
  const root = wpRoot(String(path));
  return root ? { path: root, env: 'direct' } : undefined;
}

export async function activateInWordPress(project: Project, root: string, env: WpEnv, report: Reporter): Promise<void> {
  let wpCli = '';
  if (env === 'direct') {
    try {
      wpCli = await ensureWpCli(project, report);
    } catch {
      report({
        kind: 'info',
        message: `Activate "${project.slug}" in wp-admin (couldn't set up wp-cli for auto-activate).`,
      });
      return;
    }
    if (!phpHasMysqli()) {
      report({
        kind: 'warn',
        message: `could not auto-activate ${project.slug} — activate it in wp-admin.`,
        hint: DB_UNREACHABLE_HINT,
      });
      return;
    }
  }

  // tryCapture, not run: on failure WordPress dumps a scary "database
  // connection" error straight to the terminal, which reads as something
  // being badly wrong when it's usually just this: wp-cli can't reach
  // whatever database your site's own server can.
  const activated = tryCaptureWp(env, wpCli, root, ['plugin', 'activate', project.slug]) !== null;
  if (!activated) {
    report({
      kind: 'warn',
      message: `could not auto-activate ${project.slug} — activate it in wp-admin.`,
      hint: env === 'devkinsta' ? 'Is DevKinsta running? Could not reach its devkinsta_fpm container.' : undefined,
    });
  }
}

// Runs `wp plugin check` against the plugin.
//
// For a `direct` environment this only runs if the (free, official)
// Plugin Check plugin is already installed and active — it's never
// installed automatically there, since that needs database *write*
// access on top of the read access this only needs, one more thing that
// can go wrong reaching someone else's WordPress over a plain `php`.
//
// For `devkinsta`, wp-cli runs inside DevKinsta's own container, which
// has full, working database access — so, like this used to work before
// `direct` made it too risky, Plugin Check is installed for you if it's
// missing.
export async function pluginCheckInWordPress(project: Project, root: string, env: WpEnv, report: Reporter): Promise<void> {
  const wpCli = env === 'direct' ? await ensureWpCli(project, report) : '';

  if (env === 'direct') {
    if (!phpHasMysqli()) {
      report({ kind: 'warn', message: 'skipped wp plugin check — could not connect to your WordPress database.', hint: MYSQLI_HINT });
      return;
    }
    // null here could mean "not active" or could mean wp-cli couldn't
    // reach the database at all — either way, we can't confirm it's
    // ready, so we don't try to run it.
    const isActive = tryCaptureWp(env, wpCli, root, ['plugin', 'is-active', 'plugin-check']) !== null;
    if (!isActive) {
      report({
        kind: 'warn',
        message: "skipped wp plugin check — couldn't confirm the \"Plugin Check\" plugin is active.",
        hint: 'Make sure it\'s installed and active (wp-admin > Plugins > Add New, search "Plugin Check"), then run this again.',
      });
      return;
    }
  } else {
    const isInstalled = tryCaptureWp(env, wpCli, root, ['plugin', 'is-installed', 'plugin-check']) !== null;
    if (!isInstalled) {
      report({ kind: 'info', message: '==> Installing the "Plugin Check" plugin' });
      if (!runWp(env, wpCli, root, ['plugin', 'install', 'plugin-check', '--activate'], report)) {
        report({
          kind: 'warn',
          message: 'skipped wp plugin check — could not install the "Plugin Check" plugin.',
          hint: 'Is DevKinsta running, and does this machine have internet access to install plugins?',
        });
        return;
      }
    }
  }

  tryCaptureWp(env, wpCli, root, ['plugin', 'activate', project.slug]); // best-effort, ignore the result
  if (!runWp(env, wpCli, root, ['plugin', 'check', project.slug], report)) {
    throw new UserError('wp plugin check reported problems.');
  }
}

const DEVKINSTA_CONTAINER = 'devkinsta_fpm';
const DEVKINSTA_HOST_ROOT = join(homedir(), 'DevKinsta');
const DEVKINSTA_CONTAINER_ROOT = '/www/kinsta';

// DevKinsta always mounts ~/DevKinsta at /www/kinsta inside its own PHP
// container, which (unlike a plain host `php`) can actually reach the
// site's database.
function toDevKinstaContainerPath(hostPath: string): string {
  return hostPath.replace(DEVKINSTA_HOST_ROOT, DEVKINSTA_CONTAINER_ROOT);
}

// Builds the `[file, ...args]` to run one wp-cli subcommand for `env`:
// our own wp-cli.phar via the host php, or `wp` inside DevKinsta's own
// container.
function wpCommand(env: WpEnv, wpCli: string, root: string, wpArgs: string[]): { file: string; args: string[] } {
  if (env === 'devkinsta') {
    return {
      file: 'docker',
      args: ['exec', DEVKINSTA_CONTAINER, 'wp', ...wpArgs, `--path=${toDevKinstaContainerPath(root)}`, '--allow-root'],
    };
  }
  return { file: 'php', args: [wpCli, ...wpArgs, `--path=${root}`] };
}

function tryCaptureWp(env: WpEnv, wpCli: string, root: string, wpArgs: string[]): string | null {
  const cmd = wpCommand(env, wpCli, root, wpArgs);
  return tryCapture(cmd.file, cmd.args);
}

function runWp(env: WpEnv, wpCli: string, root: string, wpArgs: string[], report: Reporter): boolean {
  const cmd = wpCommand(env, wpCli, root, wpArgs);
  try {
    run(cmd.file, cmd.args, { report });
    return true;
  } catch {
    return false;
  }
}

const MYSQLI_HINT =
  "The `php` on your PATH (the one composer/wp-cli use) is missing the mysqli extension. That's a separate PHP\n" +
  "install from whatever actually runs your site, so this doesn't mean anything is wrong with your WordPress.\n" +
  'Install/enable mysqli for that php to fix this (Debian/Ubuntu: `sudo apt install php<version>-mysql`).';

const DB_UNREACHABLE_HINT =
  "The `php` on your PATH couldn't reach your WordPress database, even though your site works fine in the\n" +
  "browser. This is common with local dev tools that run MySQL in its own container (DevKinsta, Local, etc.):\n" +
  "your site's own server can reach it, but a plain terminal command can't. Nothing is wrong with your plugin\n" +
  'or your WordPress install, just activate it yourself in wp-admin.';

// WordPress requires mysqli specifically (not just any MySQL driver) to
// connect to its database. Activation and `wp plugin check` both need a
// full WP bootstrap, so both need this checked first.
function phpHasMysqli(): boolean {
  return tryCapture('php', ['-r', 'echo extension_loaded("mysqli") ? "1" : "0";']) === '1';
}
