import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Project } from './project.js';
import { projectConfig } from './project.js';
import type { Reporter } from './report.js';

// Keeps the generated project files in step with the values woocraft
// actually resolved for this project — woocraft.json's overrides where
// set, otherwise whatever's already in the plugin header. Run before
// every deploy/build so bumping, say, `description` or `requiresPHP` in
// woocraft.json reaches the plugin itself instead of silently drifting
// from it. A no-op when nothing changed, so it's silent on every run
// that doesn't need it.
//
// Deliberately does NOT touch slug, namespace, or constantPrefix — those
// stay override-for-detection only. Renaming a live plugin's slug, PHP
// namespace, or text domain isn't something to do as a side effect of a
// config edit; it needs an actual migration.
export function syncProjectFiles(project: Project, report: Reporter): void {
  syncPluginHeader(project, report);
  syncPackageJson(project, report);
  syncComposerJson(project, report);
  syncReadmeTxt(project, report);
  syncChangelogs(project, report);
}

function replaceLine(content: string, label: string, value: string): string {
  const re = new RegExp(`^([ \\t*]*${label}:[ \\t]*).*$`, 'mi');
  return re.test(content) ? content.replace(re, (_m, prefix: string) => `${prefix}${value}`) : content;
}

function replaceDefine(content: string, name: string, value: string): string {
  const re = new RegExp(`(define\\(\\s*'${name}',\\s*')[^']*('\\s*\\);)`);
  return re.test(content) ? content.replace(re, `$1${value}$2`) : content;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function syncPluginHeader(project: Project, report: Reporter): void {
  const before = readFileSync(project.pluginFile, 'utf8');
  let after = before;
  after = replaceLine(after, 'Version', project.version);
  after = replaceLine(after, 'Requires at least', project.requiresWP);
  after = replaceLine(after, 'Requires PHP', project.requiresPHP);
  after = replaceLine(after, 'WC requires at least', project.requiresWC);
  if (project.description) after = replaceLine(after, 'Description', project.description);
  after = replaceDefine(after, `${project.constantPrefix}_VERSION`, project.version);
  after = replaceDefine(after, `${project.constantPrefix}_MIN_WC_VERSION`, project.requiresWC);
  writeIfChanged(project.pluginFile, before, after, 'plugin header', report);
}

function syncPackageJson(project: Project, report: Reporter): void {
  const path = join(project.root, 'package.json');
  if (!existsSync(path)) return;

  const before = readFileSync(path, 'utf8');
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(before);
  } catch {
    return; // leave a broken package.json for the user to fix, not us to guess at
  }

  let changed = false;
  if (pkg.version !== project.version) {
    pkg.version = project.version;
    changed = true;
  }
  if (project.description && pkg.description !== project.description) {
    pkg.description = project.description;
    changed = true;
  }
  if (!changed) return;
  writeFileSync(path, JSON.stringify(pkg, null, 4) + '\n');
  report({ kind: 'info', message: 'Synced package.json from woocraft.json' });
}

function syncComposerJson(project: Project, report: Reporter): void {
  const path = join(project.root, 'composer.json');
  if (!existsSync(path)) return;

  const before = readFileSync(path, 'utf8');
  let composer: Record<string, unknown>;
  try {
    composer = JSON.parse(before);
  } catch {
    return;
  }

  let changed = false;
  const require = (composer.require ??= {}) as Record<string, unknown>;
  const wanted = `>=${project.requiresPHP}`;
  if (require.php !== wanted) {
    require.php = wanted;
    changed = true;
  }
  if (project.description && composer.description !== project.description) {
    composer.description = project.description;
    changed = true;
  }
  if (!changed) return;
  writeFileSync(path, JSON.stringify(composer, null, 4) + '\n');
  report({ kind: 'info', message: 'Synced composer.json from woocraft.json' });
}

function syncReadmeTxt(project: Project, report: Reporter): void {
  const path = join(project.root, 'readme.txt');
  if (!existsSync(path)) return;

  const before = readFileSync(path, 'utf8');
  let after = before;
  after = replaceLine(after, 'Requires at least', project.requiresWP);
  after = replaceLine(after, 'Requires PHP', project.requiresPHP);
  after = replaceLine(after, 'Stable tag', project.version);
  after = replaceLine(after, 'WC requires at least', project.requiresWC);
  if (project.description) after = syncReadmeDescription(after, project.description);
  writeIfChanged(path, before, after, 'readme.txt', report);
}

// The short description sits as a bare paragraph between the metadata
// block and "== Description ==" — no "Label:" to anchor a line-replace
// on, so it's matched by that surrounding structure instead.
function syncReadmeDescription(content: string, description: string): string {
  const re = /(License URI:[^\n]*\n)\n[\s\S]*?\n\n(== Description ==)/;
  return re.test(content) ? content.replace(re, `$1\n${description}\n\n$2`) : content;
}

// The two changelogs are release notes — actual written content, not
// metadata woocraft invents. Every version in woocraft.json's `versions`
// that doesn't already have an entry gets one added (dated today, using
// its note verbatim); an entry that's already there is left exactly as
// it is, in case it's been hand-edited since.
function syncChangelogs(project: Project, report: Reporter): void {
  const versions = projectConfig(project.root).versions;
  if (!versions || Object.keys(versions).length === 0) return;

  syncChangelogTxt(project.root, versions, report);
  syncReadmeChangelog(project.root, versions, report);
}

function syncChangelogTxt(root: string, versions: Record<string, string>, report: Reporter): void {
  const path = join(root, 'changelog.txt');
  if (!existsSync(path)) return;

  let content = readFileSync(path, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;

  for (const [version, note] of Object.entries(versions)) {
    const exists = new RegExp(`-\\s*version\\s+${escapeRegExp(version)}(\\D|$)`, 'i').test(content);
    if (exists) continue;
    content = `${today} - version ${version}\n* ${note}\n\n${content}`;
    added++;
  }

  if (added === 0) return;
  writeFileSync(path, content);
  report({ kind: 'info', message: `Added ${added} changelog.txt ${added === 1 ? 'entry' : 'entries'} from woocraft.json` });
}

function syncReadmeChangelog(root: string, versions: Record<string, string>, report: Reporter): void {
  const path = join(root, 'readme.txt');
  if (!existsSync(path)) return;

  let content = readFileSync(path, 'utf8');
  // Matches only the heading's own line — a greedy `\s*` here would eat
  // the blank line that follows it too, along with the newline it needs
  // to leave in place to separate the new entry from the next one.
  const headingRe = /(==[ \t]*Changelog[ \t]*==[ \t]*\r?\n)/i;
  if (!headingRe.test(content)) return;
  let added = 0;

  for (const [version, note] of Object.entries(versions)) {
    const exists = new RegExp(`^=\\s*${escapeRegExp(version)}\\s*=\\s*$`, 'mi').test(content);
    if (exists) continue;
    content = content.replace(headingRe, (m) => `${m}\n= ${version} =\n* ${note}\n`);
    added++;
  }

  if (added === 0) return;
  writeFileSync(path, content);
  report({
    kind: 'info',
    message: `Added ${added} readme.txt changelog ${added === 1 ? 'entry' : 'entries'} from woocraft.json`,
  });
}

function writeIfChanged(path: string, before: string, after: string, label: string, report: Reporter): void {
  if (before === after) return;
  writeFileSync(path, after);
  report({ kind: 'info', message: `Synced ${label} from woocraft.json` });
}
