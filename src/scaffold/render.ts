import { chmodSync, cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { substitute } from '../strings.js';
import type { Tokens } from './tokens.js';

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.gz', '.pdf',
]);

// Directory / file names in the template that must be renamed on the way
// out (npm strips real dotfiles from a published package).
const PATH_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['_gitignore', '.gitignore'],
  ['_editorconfig', '.editorconfig'],
];

const EXECUTABLE = /(^pre-commit$|\.sh$)/;

type RenderOptions = {
  templateDir: string;
  targetDir: string;
  tokens: Tokens;
};

export function renderTemplate({ templateDir, targetDir, tokens }: RenderOptions): number {
  const files: string[] = [];
  walk(templateDir, files);

  for (const abs of files) {
    const rel = renamePath(relative(templateDir, abs));
    // `plugin.php` at the template root becomes `<slug>.php`.
    const outRel = rel === 'plugin.php' ? `${tokens.slug}.php` : rel;
    const outAbs = join(targetDir, outRel);

    mkdirSync(dirname(outAbs), { recursive: true });

    if (isBinary(abs)) {
      cpSync(abs, outAbs);
    } else {
      writeFileSync(outAbs, substitute(readFileSync(abs, 'utf8'), tokens));
    }

    if (EXECUTABLE.test(baseName(outAbs))) {
      chmodSync(outAbs, 0o755);
    }
  }

  return files.length;
}

function walk(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      walk(abs, acc);
    } else {
      acc.push(abs);
    }
  }
}

function renamePath(p: string): string {
  let out = p;
  for (const [from, to] of PATH_RENAMES) {
    out = out
      .split('/')
      .map((seg) => (seg === from ? to : seg))
      .join('/');
  }
  return out;
}

function isBinary(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot !== -1 && BINARY_EXT.has(path.slice(dot).toLowerCase());
}

function baseName(p: string): string {
  return p.split('/').pop() ?? p;
}
