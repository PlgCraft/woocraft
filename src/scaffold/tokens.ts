import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { camelCase, constantCase, slugify, snakeCase } from '../strings.js';

// The prompted (or defaulted) answers that describe the extension being
// scaffolded — buildTokens() below is what turns these into the flat
// {{token}} map every template file is rendered with.
export type Answers = {
  name: string;
  slug: string;
  description: string;
  namespace: string;
  vendor: string;
  author: string;
  authorUri: string;
  pluginUri: string;
  requiresPHP: string;
  requiresWP: string;
  requiresWC: string;
  wpTestedUpTo: string;
  wcTestedUpTo: string;
  /** the local WordPress install to deploy into, if given at scaffold time */
  wpPath?: string;
};

export type Tokens = Record<string, string>;

const WOOCRAFT_VERSION: string = (() => {
  try {
    // dist/scaffold/tokens.js -> dist/scaffold -> dist -> package root.
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    );
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

// Turn the collected answers into the flat {{token}} -> value map that
// render.ts substitutes into every template file.
export function buildTokens(answers: Answers): Tokens {
  const {
    name,
    slug,
    description,
    namespace,
    vendor,
    author,
    authorUri,
    pluginUri,
    requiresPHP,
    requiresWP,
    requiresWC,
    wpTestedUpTo,
    wcTestedUpTo,
  } = answers;

  const now = new Date();

  return {
    name,
    // JSON-string-safe variants for package.json / composer.json bodies.
    nameJson: jsonInner(name),
    namePhp: name.replace(/'/g, "\\'"),
    slug,
    description,
    descriptionJson: jsonInner(description),

    namespace,
    // Escaped backslashes for the PSR-4 key in composer.json.
    namespaceJson: namespace.replace(/\\/g, '\\\\'),

    constant: constantCase(slug), // COUPON_WIZARD  (define() prefix)
    optionPrefix: snakeCase(slug), // coupon_wizard  (option keys, hooks)
    textDomain: slug,
    apiNamespace: `${slug}/v1`,
    jsGlobal: `${camelCase(slug)}Data`, // window.couponWizardData
    rootId: `${slug}-root`,
    scriptHandle: `${slug}-app`,

    vendor,
    composerName: `${vendor}/${slug}`,
    contributor: slugify(author) || vendor,
    author,
    authorUri,
    pluginUri: pluginUri || authorUri,

    requiresPHP,
    requiresWP,
    requiresWC,
    wpTestedUpTo,
    wcTestedUpTo,

    date: now.toISOString().slice(0, 10),
    year: String(now.getFullYear()),

    woocraftVersion: WOOCRAFT_VERSION,
  };
}

function jsonInner(value: string): string {
  const s = JSON.stringify(String(value));
  return s.slice(1, -1);
}
