import kleur from 'kleur';

import { cmdCheck } from './cmd/check.js';
import { cmdDeploy } from './cmd/deploy.js';
import { cmdLint } from './cmd/lint.js';
import { cmdLintFix } from './cmd/lintFix.js';
import { cmdNew } from './cmd/new.js';
import { cmdPot } from './cmd/pot.js';
import { cmdStan } from './cmd/stan.js';
import { die } from './exec.js';

type Handler = (rest: string[]) => Promise<void>;

const COMMANDS: Record<string, Handler> = {
  new: cmdNew,
  deploy: cmdDeploy,
  lint: cmdLint,
  'lint:fix': cmdLintFix,
  stan: cmdStan,
  check: cmdCheck,
  pot: cmdPot,
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
    woocraft deploy [--path <wp>] [--no-check] [--no-pot]
                                        check + pot + build + deploy into your local WordPress
    woocraft lint  ${kleur.dim('/')}  lint:fix         PHP_CodeSniffer
    woocraft stan                       PHPStan
    woocraft check                      lint + stan
    woocraft build:app                  install UI deps + vite build
    woocraft build                      check + build:app + dist/<slug>.zip
    woocraft qit [tests...] [--no-build]
                                        WooCommerce Marketplace tests (opt-in)
    woocraft plugin-check [--path <wp>] deploy + run wp plugin check
    woocraft pot                        regenerate languages/<slug>.pot
    woocraft clean                      remove dist/

  ${kleur.dim('`deploy` / `plugin-check` deploy into a local WordPress install (with')}
  ${kleur.dim('WooCommerce active). `woocraft new` asks for the path; it is saved')}
  ${kleur.dim('in ~/.config/woocraft/config.json. Override per run with --path.')}
  ${kleur.dim('phpcs / phpstan config is generated into .woocraft/ from the plugin')}
  ${kleur.dim('header + composer.json. Commit phpcs.xml.dist, phpstan.neon.dist, or')}
  ${kleur.dim('phpstan-baseline.neon at the project root to override.')}
`);
}
