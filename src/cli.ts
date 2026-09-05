import kleur from 'kleur';
import { cmdNew } from './cmd/new.js';

type Handler = (rest: string[]) => Promise<void>;

const COMMANDS: Record<string, Handler> = {
  new: cmdNew,
};

export async function runCli(argv: string[]): Promise<void> {
  const [first, ...rest] = argv;
  if (!first || first === '-h' || first === '--help' || first === 'help') {
    printHelp();
    return;
  }

  const handler = COMMANDS[first];
  if (!handler) {
    printHelp();
    return;
  }

  await handler(rest);
}

function printHelp(): void {
  console.log(`
  ${kleur.bold('woocraft')} — build tooling for WooCommerce extensions

  ${kleur.bold('Scaffold')}
    npx woocraft new [directory] [-y]   Create a new extension

  ${kleur.bold('In a project')} ${kleur.dim('(run from the extension root)')}
    woocraft deploy [--path <wp>] [--no-check]
                                        check + build + deploy into your local WordPress
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
    woocraft hooks                      install the pre-commit hook

  ${kleur.dim('`deploy` / `plugin-check` deploy into a local WordPress install (with')}
  ${kleur.dim('WooCommerce active). `woocraft new` asks for the path; it is saved')}
  ${kleur.dim('in ~/.config/woocraft/config.json. Override per run with --path.')}
  ${kleur.dim('phpcs / phpstan config is generated into .woocraft/ from the plugin')}
  ${kleur.dim('header + composer.json. Commit phpcs.xml.dist, phpstan.neon.dist, or')}
  ${kleur.dim('phpstan-baseline.neon at the project root to override.')}
`);
}
