import { execFileSync, execSync } from 'node:child_process';

import type { Reporter } from './report.js';

// `sh`/`run` are the only two functions here that ever produce output —
// they report the command line they're about to execute so the caller can
// render it (or not). Everything else is silent.
export function sh(cmd: string, opts: { cwd?: string; report: Reporter }): void {
  opts.report({ kind: 'info', message: `$ ${cmd}` });
  execSync(cmd, { stdio: 'inherit', cwd: opts.cwd });
}

export function run(file: string, args: string[], opts: { cwd?: string; report: Reporter }): void {
  opts.report({ kind: 'info', message: `$ ${file} ${args.join(' ')}` });
  execFileSync(file, args, { stdio: 'inherit', cwd: opts.cwd });
}

export function capture(file: string, args: string[], opts: { cwd?: string } = {}): string {
  return execFileSync(file, args, { encoding: 'utf8', cwd: opts.cwd }).trim();
}

// Try to run a command, returning its trimmed stdout, or null if it
// fails (non-zero exit, missing binary). For probing.
export function tryCapture(file: string, args: string[], opts: { cwd?: string } = {}): string | null {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function has(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// A user-facing error: its message is printed as-is (no stack trace) and
// the process exits non-zero. Anything else propagates as an unexpected
// crash instead.
export class UserError extends Error {}

export function die(message: string): never {
  throw new UserError(message);
}
