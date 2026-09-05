import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { capture, die, has, run, UserError } from './exec.js';
import { resolveProject } from './project.js';
import type { Project } from './project.js';
import type { Reporter } from './report.js';
import { substitute } from './strings.js';

const ASSETS = fileURLToPath(new URL('../assets', import.meta.url));

const PHPSTAN_VERSION = '2.2.12';
// PHPStan ships as a ~28 MB phar, not a Composer dependency, so a slow or
// blocked GitHub connection can't wedge the whole install. It is fetched
// once per machine into the user cache (resumable), then copied per
// project. Releases CDN first (the most reliable GitHub endpoint), then
// raw as a fallback.
const PHPSTAN_PHAR_URLS = [
  `https://github.com/phpstan/phpstan/releases/download/${PHPSTAN_VERSION}/phpstan.phar`,
  `https://raw.githubusercontent.com/phpstan/phpstan/${PHPSTAN_VERSION}/phpstan.phar`,
];
const WPCLI_URLS = ['https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar'];

export type Paths = {
  cache: string;
  phpcsDir: string;
  phpstanDir: string;
  phpstanPhar: string;
  qitDir: string;
  qitBin: string;
  wpCli: string;
  phpcsBin: string;
  phpcbfBin: string;
};

export function paths(project: Project): Paths {
  const cache = join(project.root, '.woocraft');
  const phpcsDir = join(cache, 'tools', 'phpcs');
  const phpstanDir = join(cache, 'tools', 'phpstan');
  const qitDir = join(cache, 'tools', 'qit');
  return {
    cache,
    phpcsDir,
    phpstanDir,
    phpstanPhar: join(phpstanDir, 'phpstan.phar'),
    qitDir,
    qitBin: join(qitDir, 'vendor', 'bin', 'qit'),
    wpCli: join(cache, 'bin', 'wp-cli.phar'),
    phpcsBin: join(phpcsDir, 'vendor', 'bin', 'phpcs'),
    phpcbfBin: join(phpcsDir, 'vendor', 'bin', 'phpcbf'),
  };
}

function userCacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'woocraft');
}

function asset(name: string): string {
  return readFileSync(join(ASSETS, name), 'utf8');
}

function stamp(dir: string, key: string): { ok: boolean; write: () => void } {
  const file = join(dir, '.stamp');
  const current = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  const want = createHash('sha1').update(key).digest('hex');
  return { ok: current === want, write: () => writeFileSync(file, want) };
}

function requireBin(bin: string, hint: string): void {
  if (!has(bin)) die(`\`${bin}\` is required but not on PATH.\n${hint}`);
}

// Download a (large, possibly resumable) file, trying each URL. Prefers
// wget -c / curl -C - so an interrupted attempt continues on the next
// run. Throws with every failure joined if nothing worked.
async function fetchFile(urls: string[], dest: string, report: Reporter): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const errors: string[] = [];

  for (const url of urls) {
    try {
      if (has('wget')) {
        run(
          'wget',
          ['-c', '-q', '--show-progress', '--timeout=30', '--tries=5', '-O', dest, url],
          { report },
        );
        return;
      }
      if (has('curl')) {
        run(
          'curl',
          [
            '-fL', '-C', '-', '--retry', '5', '--retry-all-errors', '--retry-delay', '3',
            '--connect-timeout', '20', '--max-time', '900', '-o', dest, url,
          ],
          { report },
        );
        return;
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 300_000);
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(errors.join('\n  '));
}

// Pre-install every tool (phpcs, phpstan incl. the ~28 MB phar, wp-cli,
// QIT) for the project at `targetDir`, so nothing downloads as a surprise
// mid-command later. Each step is independently best-effort — every
// command that needs one of these installs it lazily too if a step here
// was skipped or failed (e.g. no network at `woocraft new` time).
export async function warmToolchain(targetDir: string, report: Reporter): Promise<void> {
  const project = resolveProject(targetDir);

  try {
    ensurePhpcs(project, report);
  } catch {
    report({ kind: 'warn', message: 'phpcs tooling will install on first `npm run lint`' });
  }

  try {
    await ensurePhpstan(project, report);
  } catch (err) {
    report({
      kind: 'warn',
      message: `phpstan.phar not fetched: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
      hint: 'It will retry on `npm run stan`, or set WOOCRAFT_PHPSTAN_PHAR.',
    });
  }

  try {
    await ensureWpCli(project, report);
  } catch (err) {
    report({
      kind: 'warn',
      message: `wp-cli.phar not fetched: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
      hint: 'It will retry on `npm run deploy`/`pot`.',
    });
  }

  try {
    ensureQit(project, report);
  } catch (err) {
    report({
      kind: 'warn',
      message: `QIT tooling not installed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`,
      hint: 'It will retry on `npm run qit`.',
    });
  }
}

// --- PHP_CodeSniffer -------------------------------------------------

export function ensurePhpcs(project: Project, report: Reporter): void {
  requireBin('composer', 'Install Composer: https://getcomposer.org/download/');
  const { phpcsDir, phpcsBin } = paths(project);
  const composerJson = asset('phpcs.composer.json');
  const s = stamp(phpcsDir, composerJson);

  if (existsSync(phpcsBin) && s.ok) return;

  report({ kind: 'info', message: '==> Installing PHP_CodeSniffer tooling (one-time)' });
  mkdirSync(phpcsDir, { recursive: true });
  writeFileSync(join(phpcsDir, 'composer.json'), composerJson);
  run('composer', ['install', '--working-dir', phpcsDir, '--no-interaction'], { report });
  s.write();
}

export function phpcsConfig(project: Project): string {
  const override = firstExisting(project.root, ['phpcs.xml', 'phpcs.xml.dist']);
  if (override) return override;

  const { cache } = paths(project);
  mkdirSync(cache, { recursive: true });
  const out = join(cache, 'phpcs.xml');
  writeFileSync(
    out,
    substitute(asset('phpcs.xml.tmpl'), {
      root: project.root,
      slug: project.slug,
      namespace: project.namespace,
      constant: project.constantPrefix,
      optionPrefix: project.optionPrefix,
      textDomain: project.textDomain,
      requiresPHP: project.requiresPHP,
      requiresWP: project.requiresWP,
    }),
  );
  return out;
}

// --- PHPStan -------------------------------------------------------

export async function ensurePhpstan(project: Project, report: Reporter): Promise<void> {
  requireBin('composer', 'Install Composer: https://getcomposer.org/download/');
  requireBin('php', 'Install PHP 7.4+ and add it to PATH.');
  const { phpstanDir, phpstanPhar } = paths(project);
  const composerJson = asset('phpstan.composer.json');
  const s = stamp(phpstanDir, composerJson + PHPSTAN_VERSION);

  const haveRules = existsSync(join(phpstanDir, 'vendor', 'szepeviktor'));
  if (haveRules && existsSync(phpstanPhar) && s.ok) return;

  report({ kind: 'info', message: '==> Installing PHPStan tooling (one-time)' });
  mkdirSync(phpstanDir, { recursive: true });
  writeFileSync(join(phpstanDir, 'composer.json'), composerJson);
  // Rules + stubs are on Packagist (fast); only the phar is on GitHub.
  run('composer', ['install', '--working-dir', phpstanDir, '--no-interaction'], { report });

  await ensurePhpstanPhar(phpstanPhar, report);
  s.write();
}

async function ensurePhpstanPhar(projectPhar: string, report: Reporter): Promise<void> {
  if (isValidPhar(projectPhar)) return;

  const local = process.env.WOOCRAFT_PHPSTAN_PHAR;
  if (local) {
    const abs = isAbsolute(local) ? local : resolve(process.cwd(), local);
    if (!existsSync(abs)) die(`WOOCRAFT_PHPSTAN_PHAR points at a missing file: ${abs}`);
    place(abs, projectPhar);
    return;
  }

  // One download per machine, kept in the user cache and reused by every
  // project. Resumable, so a dropped connection continues next run.
  const cached = join(userCacheDir(), `phpstan-${PHPSTAN_VERSION}.phar`);
  if (!isValidPhar(cached)) {
    report({
      kind: 'info',
      message: `==> Downloading phpstan.phar ${PHPSTAN_VERSION} (~28 MB, cached for next time)`,
    });
    try {
      await fetchFile(PHPSTAN_PHAR_URLS, cached, report);
    } catch (err) {
      throw new UserError(
        `Could not download phpstan.phar ${PHPSTAN_VERSION}.\n` +
          `  ${err instanceof Error ? err.message : String(err)}\n\n` +
          'The partial download is kept — just re-run to resume. Or:\n' +
          `  • download it yourself to  ${cached}\n` +
          '  • set  WOOCRAFT_PHPSTAN_PHAR=/path/to/phpstan.phar  and retry\n' +
          '  • pass  --no-check  to skip lint + stan for now',
      );
    }
    if (!isValidPhar(cached)) {
      throw new UserError(
        `Downloaded phpstan.phar is incomplete or corrupt (${cached}).\n` +
          'Delete it and re-run, or set WOOCRAFT_PHPSTAN_PHAR to a good copy.',
      );
    }
  }

  place(cached, projectPhar);
}

function place(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  chmodSync(to, 0o755);
}

function isValidPhar(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    // A truncated phar fails to parse; --version is cheap and definitive.
    capture('php', [path, '--version']);
    return true;
  } catch {
    return false;
  }
}

export function phpstanConfig(project: Project): string {
  const override = firstExisting(project.root, ['phpstan.neon', 'phpstan.neon.dist']);
  if (override) return override;

  const { cache, phpstanDir } = paths(project);
  mkdirSync(cache, { recursive: true });

  writeFileSync(
    join(cache, 'stubs.php'),
    substitute(asset('stubs.php.tmpl'), {
      root: project.root,
      slug: project.slug,
      constant: project.constantPrefix,
      requiresWC: project.requiresWC,
    }),
  );

  const baseline = join(project.root, 'phpstan-baseline.neon');
  const out = join(cache, 'phpstan.neon');
  writeFileSync(
    out,
    substitute(asset('phpstan.neon.tmpl'), {
      root: project.root,
      cache,
      slug: project.slug,
      constant: project.constantPrefix,
      level: project.phpstanLevel,
      wpExtension: join(phpstanDir, 'vendor/szepeviktor/phpstan-wordpress/extension.neon'),
      wcStubs: join(phpstanDir, 'vendor/php-stubs/woocommerce-stubs/woocommerce-stubs.php'),
      baselineInclude: existsSync(baseline) ? `\t- ${baseline}\n` : '',
    }),
  );
  return out;
}

// --- QIT (opt-in) ------------------------------------------------

export function ensureQit(project: Project, report: Reporter): string {
  requireBin('composer', 'Install Composer: https://getcomposer.org/download/');
  requireBin('php', 'Install PHP 7.4+ and add it to PATH.');
  const { qitDir, qitBin } = paths(project);
  const composerJson = asset('qit.composer.json');
  const s = stamp(qitDir, composerJson);

  if (existsSync(qitBin) && s.ok) return qitBin;

  report({ kind: 'info', message: '==> Installing WooCommerce QIT CLI (one-time)' });
  mkdirSync(qitDir, { recursive: true });
  writeFileSync(join(qitDir, 'composer.json'), composerJson);
  run('composer', ['install', '--working-dir', qitDir, '--no-interaction'], { report });
  s.write();
  report({
    kind: 'info',
    message:
      '    QIT tests run on WooCommerce’s servers — connect your account once with\n' +
      '    `woocraft qit -- partner:add` (or `npm run qit -- -- partner:add`).',
  });
  return qitBin;
}

// --- wp-cli (pot) -------------------------------------------------

export async function ensureWpCli(project: Project, report: Reporter): Promise<string> {
  requireBin('php', 'Install PHP 7.4+ and add it to PATH.');
  const { wpCli } = paths(project);
  if (!existsSync(wpCli)) {
    report({ kind: 'info', message: '==> Downloading wp-cli.phar (one-time)' });
    try {
      await fetchFile(WPCLI_URLS, wpCli, report);
    } catch (err) {
      throw new UserError(
        `Could not download wp-cli.phar.\n  ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return wpCli;
}

export function phpVersion(): string | null {
  try {
    return capture('php', ['-r', 'echo PHP_VERSION;']);
  } catch {
    return null;
  }
}

// --- helpers ------------------------------------------------------

function firstExisting(root: string, names: string[]): string | null {
  for (const n of names) {
    const p = join(root, n);
    if (existsSync(p)) return p;
  }
  return null;
}
