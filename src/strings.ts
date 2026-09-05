// Small string helpers shared by the prompt defaults and the token map.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return String(input)
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function pascalCase(input: string): string {
  return String(input)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function camelCase(input: string): string {
  const p = pascalCase(input);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

// slug -> UPPER_SNAKE (constant / define() prefix)
export function constantCase(slug: string): string {
  return slugify(slug).replace(/-/g, '_').toUpperCase();
}

// slug -> lower_snake (option key / hook prefix)
export function snakeCase(slug: string): string {
  return slugify(slug).replace(/-/g, '_');
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(slug);
}

// WordPress.org's Plugin Check rejects a Plugin Name with fewer than
// 5 latin letters/digits (the slug is generated from it), and short
// slugs also trip WPCS's "prefix too short" rule.
export function isValidPluginName(name: string): boolean {
  return (String(name).match(/[a-zA-Z0-9]/g) ?? []).length >= 5;
}

// A valid single PHP namespace segment, or a namespaced path (Foo\Bar).
export function isValidNamespace(ns: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(\\[A-Za-z_][A-Za-z0-9_]*)*$/.test(ns);
}

export function titleFromSlug(s: string): string {
  return slugify(s)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Replace `{{key}}` placeholders with their values — used by the scaffold
// template renderer and by the toolchain's own {{token}} config templates.
export function substitute(content: string, tokens: Record<string, string>): string {
  let out = content;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(String(value));
  }
  return out;
}
