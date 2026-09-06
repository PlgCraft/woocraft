import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  description: string;
  /** the current, official version — the last entry in woocraft.json's `versions`, if set */
  version: string;
  requiresPHP: string;
  requiresWP: string;
  requiresWC: string;
  phpstanLevel: string;
  phpstanVersion: string;
};

// The PHPStan release woocraft installs when a project doesn't pin its
// own in woocraft.json, and what `woocraft new` offers as the default
// when it asks.
export const DEFAULT_PHPSTAN_VERSION = '2.2.12';

// The QIT tests `woocraft qit` / `woocraft build` run when woocraft.json
// doesn't say otherwise. An explicit `"tests": []` in woocraft.json is
// different from leaving `tests` out entirely — it means "run none of
// them", not "use the default list" (see cmd/qit.ts).
export const DEFAULT_QIT_TESTS = ['security', 'phpstan', 'phpcompatibility', 'plugin-check', 'activation'];

// How this project reaches its local WordPress: a plain filesystem path,
// or a DevKinsta site. Both get the same files mirrored into them, but
// for DevKinsta the actual wp-cli calls run inside DevKinsta's own
// container instead of via the host `php`, since that's the only place
// its database is reachable from (see wp/wordpress.ts).
export type WpEnv = 'direct' | 'devkinsta';

export type WpTargetSetting = {
  path: string;
  env: WpEnv;
};

type QitConfig = {
  sut?: string;
  tests?: string[];
  args?: string[];
};

// The full shape of woocraft.json: project overrides (see `build` below)
// plus woocraft's own settings — QIT config and which local WordPress
// this project deploys into. Everything here is optional and everything
// here is meant to be committed; it's the one file woocraft ever writes
// to outside `.woocraft/` (which is cache, not settings).
export type WoocraftJson = {
  slug?: string;
  namespace?: string;
  constantPrefix?: string;
  description?: string;
  // An ordered log of releases: version -> one-line changelog note, e.g.
  // { "0.1.0": "Initial release", "0.2.0": "Add coupon stacking" }. The
  // *last* entry is the current, official version — the one written into
  // the plugin header, package.json, and readme.txt's Stable tag. Adding
  // a new entry and re-running deploy/build is how you cut a release;
  // every entry becomes (or stays, if already there) a changelog.txt and
  // readme.txt changelog entry.
  versions?: Record<string, string>;
  requiresPHP?: string;
  requiresWP?: string;
  requiresWC?: string;
  phpstanLevel?: string | number;
  phpstanVersion?: string;
  qit?: QitConfig;
  wpTarget?: WpTargetSetting;
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
  const overrides = projectConfig(root);

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

  const versionKeys = overrides.versions ? Object.keys(overrides.versions) : [];
  const officialVersion = versionKeys.length > 0 ? versionKeys[versionKeys.length - 1] : undefined;

  return {
    root,
    pluginFile,
    slug,
    namespace,
    constantPrefix,
    optionPrefix: snakeCase(slug),
    textDomain: field('Text Domain') ?? slug,
    description: overrides.description ?? field('Description') ?? '',
    version: officialVersion ?? field('Version') ?? '0.1.0',
    requiresPHP: overrides.requiresPHP ?? field('Requires PHP') ?? '7.4',
    requiresWP: overrides.requiresWP ?? field('Requires at least') ?? '6.3',
    requiresWC: overrides.requiresWC ?? field('WC requires at least') ?? '8.5',
    phpstanLevel: String(overrides.phpstanLevel ?? 5),
    phpstanVersion: overrides.phpstanVersion ?? DEFAULT_PHPSTAN_VERSION,
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

// The parsed, validated woocraft.json at the project root, or {} if
// there isn't one. This is the *only* place woocraft's own settings
// live — there's no separate machine-level config file. A broken or
// misshapen woocraft.json fails loudly here, with a plain-English
// explanation of exactly what's wrong, since this runs at the start of
// every command.
export function projectConfig(root: string): WoocraftJson {
  const path = join(root, 'woocraft.json');
  if (!existsSync(path)) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    die(
      `woocraft.json isn't valid JSON: ${err instanceof Error ? err.message : String(err)}\n` +
        'Common causes: a trailing comma, a missing comma between fields, or an unquoted value.',
    );
  }

  return validateWoocraftJson(parsed);
}

// Writes `patch` into woocraft.json, merged on top of what's already
// there (validated first, so a broken file gets caught here too, not
// silently overwritten).
export function updateProjectConfig(root: string, patch: Partial<WoocraftJson>): void {
  const merged = { ...projectConfig(root), ...patch };
  writeFileSync(join(root, 'woocraft.json'), JSON.stringify(merged, null, 4) + '\n');
}

export function rememberWpTarget(root: string, target: WpTargetSetting): void {
  updateProjectConfig(root, { wpTarget: target });
}

const STRING_FIELDS = ['slug', 'namespace', 'constantPrefix', 'description', 'requiresPHP', 'requiresWP', 'requiresWC'] as const;
const KNOWN_TOP_KEYS = [...STRING_FIELDS, 'phpstanLevel', 'phpstanVersion', 'versions', 'qit', 'wpTarget'];
const KNOWN_QIT_KEYS = ['sut', 'tests', 'args'];
const PHPSTAN_VERSION_RE = /^\d+\.\d+\.\d+$/;
const PLAIN_INTEGER_KEY_RE = /^(0|[1-9]\d*)$/;

// Checks woocraft.json's shape field by field and collects every problem
// found, so a mistake shows up as one clear list instead of you fixing
// one typo just to hit the next one on your next run.
function validateWoocraftJson(raw: unknown): WoocraftJson {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    die(`woocraft.json should be a JSON object (like { "qit": { ... } }), but it's ${describe(raw)}.`);
  }

  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  const result: WoocraftJson = {};

  for (const key of STRING_FIELDS) {
    if (obj[key] === undefined) continue;
    if (typeof obj[key] !== 'string') {
      errors.push(`"${key}" should be text, but it's ${describe(obj[key])}.`);
    } else {
      result[key] = obj[key] as string;
    }
  }

  if (obj.phpstanLevel !== undefined) {
    if (typeof obj.phpstanLevel !== 'string' && typeof obj.phpstanLevel !== 'number') {
      errors.push(`"phpstanLevel" should be a number (like 5), but it's ${describe(obj.phpstanLevel)}.`);
    } else {
      result.phpstanLevel = obj.phpstanLevel;
    }
  }

  if (obj.phpstanVersion !== undefined) {
    if (typeof obj.phpstanVersion !== 'string' || !PHPSTAN_VERSION_RE.test(obj.phpstanVersion)) {
      errors.push(
        `"phpstanVersion" should be a PHPStan release number like "2.2.12" (see ` +
          `https://github.com/phpstan/phpstan/releases), but it's ${describe(obj.phpstanVersion)}.`,
      );
    } else {
      result.phpstanVersion = obj.phpstanVersion;
    }
  }

  if (obj.versions !== undefined) {
    result.versions = validateVersions(obj.versions, errors);
  }

  if (obj.qit !== undefined) {
    result.qit = validateQit(obj.qit, errors);
  }

  if (obj.wpTarget !== undefined) {
    result.wpTarget = validateWpTarget(obj.wpTarget, errors);
  }

  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_KEYS.includes(key)) errors.push(`"${key}" isn't a setting woocraft understands — check for a typo.`);
  }

  if (errors.length > 0) {
    die(`woocraft.json has some problems:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\nFix these and try again.`);
  }

  return result;
}

function validateQit(value: unknown, errors: string[]): QitConfig | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`"qit" should be an object (like { "sut": "..." }), but it's ${describe(value)}.`);
    return undefined;
  }
  const qit = value as Record<string, unknown>;
  const result: QitConfig = {};

  if (qit.sut !== undefined) {
    if (typeof qit.sut !== 'string') errors.push(`"qit.sut" should be text, but it's ${describe(qit.sut)}.`);
    else result.sut = qit.sut;
  }
  if (qit.tests !== undefined) {
    if (!isStringArray(qit.tests)) {
      errors.push(`"qit.tests" should be a list of test names (like ["security", "phpstan"]), but it's ${describe(qit.tests)}.`);
    } else {
      result.tests = qit.tests;
    }
  }
  if (qit.args !== undefined) {
    if (!isStringArray(qit.args)) {
      errors.push(`"qit.args" should be a list of extra flags (like ["--json"]), but it's ${describe(qit.args)}.`);
    } else {
      result.args = qit.args;
    }
  }
  for (const key of Object.keys(qit)) {
    if (!KNOWN_QIT_KEYS.includes(key)) errors.push(`"qit.${key}" isn't a setting woocraft understands — check for a typo.`);
  }

  return result;
}

// "versions" is order-sensitive — the last key is the official version —
// so a key that looks like a plain array index (e.g. "1" rather than
// "1.0") would silently jump to the front in JS's own key ordering
// rules, breaking that. Real version strings never look like that, so
// this is flagged rather than left to bite someone later.
function validateVersions(value: unknown, errors: string[]): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(
      `"versions" should be an object mapping version to changelog note (like { "0.1.0": "Initial release" }), but it's ${describe(value)}.`,
    );
    return undefined;
  }
  const versions = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  let ok = true;

  for (const [version, note] of Object.entries(versions)) {
    if (PLAIN_INTEGER_KEY_RE.test(version)) {
      errors.push(`"versions" key "${version}" is a plain number — use a real version string, like "${version}.0.0".`);
      ok = false;
    } else if (typeof note !== 'string') {
      errors.push(`"versions.${version}" should be a one-line changelog note, but it's ${describe(note)}.`);
      ok = false;
    } else {
      result[version] = note;
    }
  }

  return ok ? result : undefined;
}

function validateWpTarget(value: unknown, errors: string[]): WpTargetSetting | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`"wpTarget" should be an object (like { "path": "...", "env": "direct" }), but it's ${describe(value)}.`);
    return undefined;
  }
  const target = value as Record<string, unknown>;
  let ok = true;

  if (typeof target.path !== 'string' || target.path === '') {
    errors.push(
      target.path === undefined
        ? '"wpTarget.path" is missing — it should be the path to your WordPress install.'
        : `"wpTarget.path" should be the path to your WordPress install, but it's ${describe(target.path)}.`,
    );
    ok = false;
  }
  if (target.env !== 'direct' && target.env !== 'devkinsta') {
    errors.push(
      target.env === undefined
        ? '"wpTarget.env" is missing — it should be "direct" or "devkinsta".'
        : `"wpTarget.env" should be "direct" or "devkinsta", but it's ${describe(target.env)}.`,
    );
    ok = false;
  }

  return ok ? { path: target.path as string, env: target.env as WpEnv } : undefined;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function describe(v: unknown): string {
  if (v === undefined) return 'missing';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'object') return 'an object';
  if (typeof v === 'string') return `"${v}"`;
  return `${typeof v} ${JSON.stringify(v)}`;
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
