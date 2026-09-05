export type DeployOptions = {
  path?: string;
  skipCheck?: boolean;
  skipPot?: boolean;
  skipPluginCheck?: boolean;
};

export function parseDeployOptions(argv: string[]): DeployOptions {
  const opts: DeployOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-check' || a === '--skip-check') opts.skipCheck = true;
    else if (a === '--no-pot' || a === '--skip-pot') opts.skipPot = true;
    else if (a === '--no-plugin-check' || a === '--skip-plugin-check') opts.skipPluginCheck = true;
    else if (a === '--path') opts.path = argv[++i];
    else if (a?.startsWith('--path=')) opts.path = a.slice('--path='.length);
    else if (a && !a.startsWith('-') && !opts.path) opts.path = a;
  }
  return opts;
}
