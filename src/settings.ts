import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Machine-level woocraft settings, stored once per machine (not per
// project): currently just which local WordPress install each extension
// deploys into, keyed by the project's absolute path. Distinct from the
// per-project `woocraft.json` (see project.ts's `projectConfig`), which
// travels with the project instead.
export type WoocraftSettings = {
  /** projectRoot -> path of the WordPress install to deploy into */
  wpPaths?: Record<string, string>;
};

export function settingsPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'woocraft', 'config.json');
}

export function readSettings(): WoocraftSettings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

export function updateSettings(patch: Partial<WoocraftSettings>): WoocraftSettings {
  const merged = { ...readSettings(), ...patch };
  const p = settingsPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

export function rememberWpPath(projectRoot: string, path: string): void {
  const settings = readSettings();
  updateSettings({ wpPaths: { ...settings.wpPaths, [projectRoot]: path } });
}
