# woocraft

A command line tool for building WooCommerce extensions. It scaffolds a
plugin with a real PHP structure (PSR-4, a Composer autoloader, a REST
route, an admin screen built with Vite and Tailwind) and then handles the
day to day work of building one: linting, static analysis, translations,
deploying to a local WordPress site, and packaging a zip you can submit to
the WooCommerce Marketplace.

The tooling itself lives in this CLI, not in the plugin it generates. Your
generated project stays small: no phpcs or phpstan config files cluttering
the repo, no build scripts to maintain by hand. You get tooling upgrades
just by bumping the `woocraft` version.

## Requirements

- Node.js 20 or newer
- PHP 7.4 or newer
- [Composer](https://getcomposer.org/)
- A local WordPress install with WooCommerce active, if you want to deploy
  and test the extension as you build it (not required just to scaffold
  and write code)

## Install

You don't need to install it globally. Scaffold a new extension with:

```bash
npx woocraft new my-extension
```

That's it. `woocraft` gets added to the generated project's own
`package.json`, so from then on every command runs through `npm run` or
`npx woocraft` from inside the project.

## Quick start

```bash
npx woocraft new my-extension
cd my-extension
npm run deploy
```

`woocraft new` asks a few questions (extension name, slug, author, and a
local WordPress install to deploy into, a DevKinsta site or any other
path) and scaffolds the plugin. Answer `-y` instead of the prompts to
accept sensible defaults:

```bash
npx woocraft new my-extension -y
```

`npm run deploy` lints and statically analyzes your code, builds the
admin UI, and copies the finished plugin into your WordPress install's
`wp-content/plugins` folder, activating it along the way. Run it again
after every change you want to see in the browser.

## What gets scaffolded

```
my-extension.php          Plugin header, constants, boot hook
uninstall.php             Delete-time cleanup
src/                      PSR-4 PHP, autoloaded by Composer
  Plugin.php               Composition root, wires everything together
  Bootstrap/Lifecycle.php  Activation, deactivation, environment checks
  Http/Routes.php          REST route registry
  Http/Routes/Hello.php    A starter REST route
  Admin/                   The admin screen: PHP menu page + a React UI
package.json              One file, one `npm install`, all the scripts
woocraft.json             woocraft's own config: WordPress target, QIT setup
```

The admin screen is written in React with Vite and Tailwind, but none of
that source ships in the plugin. Only the built output does. The plugin
your users install is plain PHP and compiled assets, nothing else.

## Commands

| Command | What it does |
| --- | --- |
| `woocraft new [directory]` | Scaffold a new extension |
| `woocraft deploy` | Check, build, and deploy into your local WordPress |
| `woocraft lint` / `lint:fix` | PHP_CodeSniffer, with an auto-fix mode |
| `woocraft stan` | PHPStan, configured with WordPress and WooCommerce stubs |
| `woocraft check` | `lint` + `stan` |
| `woocraft pot` | Regenerate the plugin's translation template |
| `woocraft build` | Deploy, verify, package a release zip, then QIT-test it |
| `woocraft qit` | Run WooCommerce Marketplace quality tests against that zip |

See [COMMANDS.md](./COMMANDS.md) for the full reference: every flag, what
each command actually does step by step, and how to configure `qit` and
`woocraft.json`.

## How the toolchain works

`woocraft new` downloads and installs everything your project needs
(PHP_CodeSniffer with the WordPress ruleset, PHPStan with WordPress and
WooCommerce stubs, WP-CLI, the QIT CLI) once, up front, so later commands
run instantly instead of surprising you with a download mid-task.
Everything is cached per project under `.woocraft/` (git-ignored) and, for
the larger downloads like PHPStan's phar, shared across every project on
your machine under `~/.cache/woocraft/`.

phpcs and phpstan configuration is generated for you from your plugin's
own header and `composer.json`, so there's nothing to keep in sync by
hand. If you need more control, drop a `phpcs.xml.dist`,
`phpstan.neon.dist`, or `phpstan-baseline.neon` at your project root and
woocraft uses that instead.

## License

MIT
