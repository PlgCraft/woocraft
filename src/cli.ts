import kleur from 'kleur';

import { cmdCheck } from './cmd/check.js';
import { cmdDeploy } from './cmd/deploy.js';
import { cmdLint } from './cmd/lint.js';
import { cmdLintFix } from './cmd/lintFix.js';
import { cmdNew } from './cmd/new.js';
import { cmdPot } from './cmd/pot.js';
import { cmdStan } from './cmd/stan.js';
import { die } from './exec.js';
import { cmdBuild } from './cmd/build.js';
import { cmdQit } from './cmd/qit.js';

type Handler = (rest: string[]) => Promise<void>;

const COMMANDS: Record<string, Handler> = {
  new: cmdNew,
  deploy: cmdDeploy,
  lint: cmdLint,
  'lint:fix': cmdLintFix,
  stan: cmdStan,
  check: cmdCheck,
  pot: cmdPot,
  build: cmdBuild,
  qit: cmdQit,
};

export async function runCli(argv: string[]): Promise<void> {
  const [first, ...rest] = argv;
  if (!first || first === '-h' || first === '--help' || first === 'help') {
    printHelp();
    return;
  }

  const handler = COMMANDS[first];
  if (!handler) {
    die(`Unknown command: "${first}"\nRun \`woocraft help\` to see the available commands.`);
  }

  await handler(rest);
}

function printHelp(): void {
  console.log(`
  ${kleur.bold('woocraft')} — build tooling for WooCommerce extensions

  ${kleur.bold('Scaffold')}
    npx woocraft new [directory] [-y]   Create a new extension

  ${kleur.bold('In a project')} ${kleur.dim('(run from the extension root)')}
    npm run deploy -- [--path <wp>] [--no-check] [--no-pot] [--no-plugin-check]
                                        check + pot + build + deploy + verify into your local WordPress
    npm run lint  ${kleur.dim('/')}  lint:fix         PHP_CodeSniffer
    npm run stan                        PHPStan
    npm run check                       lint + stan
    npm run build -- [--path <wp>]      deploy + verify + package + QIT-verify dist/<slug>.zip
    npm run qit -- [tests...] [--no-build]
                                        WooCommerce Marketplace tests, standalone (also part of build)
    npm run pot                         regenerate languages/<slug>.pot

  ${kleur.dim('`deploy` / `build` deploy into a local WordPress install (with WooCommerce')}
  ${kleur.dim('active). `woocraft new` asks for the path; it is saved as wpTarget in')}
  ${kleur.dim('woocraft.json (commit it). Override per run with --path.')}
  ${kleur.dim('phpcs / phpstan config is generated into .woocraft/ from the plugin')}
  ${kleur.dim('header + composer.json. Commit phpcs.xml.dist, phpstan.neon.dist, or')}
  ${kleur.dim('phpstan-baseline.neon at the project root to override.')}
`);
}
