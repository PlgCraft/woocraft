import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { die } from './exec.js';
import { constantCase, snakeCase } from './strings.js';

export type Project = {
  root: string;
  /** absolute path to the main plugin file, e.g. /path/coupon-wizard.php */
  pluginFile: string;
  slug: string;
  namespace: string;
  /** define() prefix, e.g. COUPON_WIZARD */
  constantPrefix: string;
  /** option / hook prefix, e.g. coupon_wizard */
  optionPrefix: string;
  textDomain: string;
  requiresPHP: string;
  requiresWP: string;
  requiresWC: string;
  phpstanLevel: string;
};

type Overrides = {
  slug?: string;
  namespace?: string;
  constantPrefix?: string;
  requiresPHP?: string;
  requiresWP?: string;
  requiresWC?: string;
  phpstanLevel?: string | number;
};

// Walk up from `start` looking for the plugin root: a directory holding a
// top-level *.php file with a `Plugin Name:` header.
export function resolveProject(start = process.cwd()): Project {
  let dir = resolve(start);

  for (let i = 0; i < 6; i++) {
    const pluginFile = findPluginFile(dir);
    if (pluginFile) {
      return build(dir, pluginFile);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  die(
    'Not inside a WooCommerce extension (no *.php with a "Plugin Name:" header found).\n' +
      'Run this from a project scaffolded with `woocraft new`.',
  );
}

function findPluginFile(dir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (!name.endsWith('.php')) continue;
    const abs = join(dir, name);
    let head = '';
    try {
      head = readFileSync(abs, 'utf8').slice(0, 8192);
    } catch {
      continue;
    }
    if (/^[\s*]*Plugin Name:\s*\S/m.test(head)) return abs;
  }
  return null;
}

function build(root: string, pluginFile: string): Project {
  const header = readFileSync(pluginFile, 'utf8');
  const composer = readComposer(root);
  const overrides = readOverrides(root);

  const field = (label: string): string | undefined => {
    const m = header.match(new RegExp(`^[\\s*]*${label}:\\s*(.+?)\\s*$`, 'mi'));
    return m ? m[1] : undefined;
  };

  const slug =
    overrides.slug ?? field('Text Domain') ?? basename(pluginFile).replace(/\.php$/, '');

  const namespace =
    overrides.namespace ?? psr4Namespace(composer) ?? toStudly(slug);

  const constantPrefix =
    overrides.constantPrefix ??
    header.match(/define\(\s*['"]([A-Z0-9_]+)_(?:VERSION|FILE|PATH)['"]/)?.[1] ??
    constantCase(slug);

  return {
    root,
    pluginFile,
    slug,
    namespace,
    constantPrefix,
    optionPrefix: snakeCase(slug),
    textDomain: field('Text Domain') ?? slug,
    requiresPHP: overrides.requiresPHP ?? field('Requires PHP') ?? '7.4',
    requiresWP: overrides.requiresWP ?? field('Requires at least') ?? '6.3',
    requiresWC: overrides.requiresWC ?? field('WC requires at least') ?? '8.5',
    phpstanLevel: String(overrides.phpstanLevel ?? 5),
  };
}

function readComposer(root: string): Record<string, unknown> {
  const p = join(root, 'composer.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

// The parsed woocraft.json at the project root, or {} — the escape-hatch
// config file for overrides, the DevKinsta store, QIT settings, …
export function projectConfig(root: string): Record<string, unknown> {
  const p = join(root, 'woocraft.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function readOverrides(root: string): Overrides {
  return projectConfig(root) as Overrides;
}

function psr4Namespace(composer: Record<string, unknown>): string | undefined {
  const autoload = composer.autoload as { 'psr-4'?: Record<string, string> } | undefined;
  const map = autoload?.['psr-4'];
  if (!map) return undefined;
  const key = Object.keys(map)[0];
  return key ? key.replace(/\\+$/, '') : undefined;
}

function toStudly(slug: string): string {
  return slug
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}
