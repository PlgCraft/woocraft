import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

// Expand a leading "~" and make the path absolute (relative to cwd).
export function expandTilde(input: string): string {
  const p = String(input).replace(/^~(?=$|[/\\])/, homedir());
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

// The two files that prove a directory is a WordPress install with
// WooCommerce present. `Requires Plugins: woocommerce` in the plugin
// header means the extension can't run without it, so we insist on it
// here rather than just checking for wp-load.php.
function looksLikeWpWithWoo(dir: string): boolean {
  return (
    existsSync(join(dir, 'wp-load.php')) &&
    existsSync(join(dir, 'wp-content', 'plugins', 'woocommerce', 'woocommerce.php'))
  );
}

// Resolve the actual WordPress root for a user-supplied path: the path
// itself, or a `wordpress/` subdirectory (Bedrock / common layouts).
// Returns null when neither is a WordPress + WooCommerce install.
export function wpRoot(input: string): string | null {
  const dir = expandTilde(input);
  if (looksLikeWpWithWoo(dir)) return dir;
  const nested = join(dir, 'wordpress');
  if (looksLikeWpWithWoo(nested)) return nested;
  return null;
}

export function isWordPressWithWoo(input: string): boolean {
  return wpRoot(input) !== null;
}
