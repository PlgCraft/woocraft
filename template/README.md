# {{name}}

{{description}}

Scaffolded with [woocraft](https://www.npmjs.com/package/woocraft).

## Layout

```
{{slug}}.php              Plugin header + constants + boot hook
uninstall.php             Delete-time cleanup (empty by default)
src/                      PSR-4 (namespace {{namespace}}\), autoloaded by Composer
  Constants.php            Shared values (REST namespace); autoloaded via "files"
  Plugin.php               Composition root — everything is wired here
  Bootstrap/Lifecycle.php  Activation / deactivation / WooCommerce env check
  Http/Routes.php          REST route registry
  Http/Permissions/Rest.php  The shared permission_callback
  Http/Routes/Hello.php    The starter route: GET /{{apiNamespace}}/hello
  Admin/AdminMenu.php      wp-admin menu page + enqueues the built bundle
  Admin/main.tsx           The admin UI (React + Vite + Tailwind v4) — mounts on <div id="{{rootId}}">
  Admin/App.tsx            Calls /hello and renders the greeting
  Admin/lib/api.ts         fetch wrapper (REST base + nonce from PHP)
  Admin/vite.config.ts     Builds to Admin/dist/{index.js,index.css}
  Admin/dist/              vite build output — the ONLY UI part that ships
package.json              one file, project root — deps + `npm run` scripts
woocraft.json             woocraft's own config (QIT settings, override detection) — commit it
```

One `package.json` at the root drives everything (`npm install` once). The
Vite UI source shares `src/Admin/` with `AdminMenu.php`; `npm run build`
packages only `AdminMenu.php` and `src/Admin/dist/`, so the installed
plugin has compiled assets and PHP — no Vite config, no `.tsx`.

The build toolchain (phpcs, phpstan, packaging) lives in the **woocraft**
CLI, a dev dependency — not in this repo. It generates its phpcs / phpstan
config into `.woocraft/` (git-ignored) from the plugin header and
`composer.json`.

## First run

`woocraft new` already ran `npm install`, `composer install`, the first UI
build, installed the phpcs/phpstan/WP-CLI/QIT toolchain, and deployed into
the WordPress install you picked — so `check` / `deploy` are fast from
here on. If you scaffolded with `--no-install`, do that first:

```bash
npm install && composer install && npm run build:app
```

## Scripts

Run from the project root.

| Command | What it does |
| --- | --- |
| `npm run deploy` | `check` + UI build + production autoloader, then mirror the plugin into your local WordPress and activate it. (See *Local development* below.) |
| `npm run build:app` | `vite build` into `src/Admin/dist/` |
| `npm run lint` / `lint:fix` | PHP_CodeSniffer (security, DB, deprecations, PHP compat) |
| `npm run stan` | PHPStan level 5 with WP + WooCommerce stubs |
| `npm run check` | `lint` + `stan` (what `deploy` and `build` run first) |
| `npm run build` | `check` + UI build + a Marketplace-ready `dist/{{slug}}.zip`, QIT-tested |
| `npm run qit` | WooCommerce Marketplace tests via QIT (see below) |
| `npm run pot` | Regenerate `languages/{{slug}}.pot` |

### Before a release

- Bump `Version:` in `{{slug}}.php` and the top line of `changelog.txt` (they must match — CI checks).
- Bump `Tested up to:` / `WC tested up to:` in `readme.txt` to the current WordPress / WooCommerce release, or Plugin Check flags them.

### The phpcs / phpstan toolchain

`woocraft new` installs it during setup: isolated Composer tooling in
`.woocraft/tools/`, plus `phpstan.phar` (~28 MB) fetched once per machine
into `~/.cache/woocraft/` and reused by every project. If that download
was skipped or failed, the next `npm run stan` retries it (resumable). If
GitHub is unreachable from your network:

- point woocraft at a phar you already have: `WOOCRAFT_PHPSTAN_PHAR=/path/to/phpstan.phar npm run stan`
- or skip the checks for now: `npm run deploy -- --no-check`

### QIT — WooCommerce Marketplace tests

`npm run qit` builds a fresh zip and runs the Marketplace quality suite
(security, phpstan, PHP compatibility, plugin-check, activation) on QIT's
servers — the same suite the Marketplace review itself runs, so a clean
run is a strong signal you're ready to submit. `npm run build` runs it
too, right after packaging; needs a one-time WooCommerce.com connection
first:

```bash
npm run qit -- -- partner:add         # connect your account (once)
npm run qit                           # run the configured suite
npm run qit -- security plugin-check  # run specific tests
npm run qit -- --no-build             # reuse the existing dist/ zip
```

QIT tests a specific extension listing on your WooCommerce.com account,
identified by its slug or ID there, not just any zip — `woocraft.json`
(already at your project root) defaults `qit.sut` to this project's own
slug, so update it once your extension is registered under its real
Marketplace slug (or ID) if that ever differs:

```json
{
  "qit": {
    "sut": "{{slug}}",
    "tests": ["security", "phpstan", "phpcompatibility", "plugin-check", "activation"],
    "args": ["--json"]
  }
}
```

`woocraft.json` also holds any config overrides (see below) — commit it.

### Overriding the generated config

Drop any of these at the project root and woocraft uses it instead of its
generated one:

- `phpcs.xml.dist` — full PHP_CodeSniffer ruleset
- `phpstan.neon.dist` — full PHPStan config
- `phpstan-baseline.neon` — merged into the generated config automatically

### Local development

You develop against an existing local WordPress install (DevKinsta, a bare
PHP setup, Local, Valet, …) that has **WooCommerce installed and active**.

`woocraft new` asks how: pick a DevKinsta site from what's actually on your
machine, or give a path to any other WordPress install (validated —
`wp-load.php` + WooCommerce present). Either way it does the first deploy
and saves the choice as `wpTarget` in `woocraft.json` — commit it. If a
teammate's copy points at a path that's yours, not theirs, they'll get a
clear message instead of a confusing failure, and a chance to set their own.

`npm run deploy`:

1. runs `lint` + `stan` (add `--no-check` to skip)
2. builds the admin UI and a production Composer autoloader
3. mirrors the plugin — **compiled assets only, never the Vite source** —
   into `<wordpress>/wp-content/plugins/{{slug}}/`, wiping and recreating it
   so the deployed folder is always an exact copy
4. activates it (via WP-CLI if `wp` is on your PATH)

Run it again after each change.

```
npm run deploy                        # deploy into the saved WordPress path
npm run deploy -- --no-check          # skip lint + stan this run
npm run deploy -- --path /path/to/wp  # deploy elsewhere (also updates the saved path)
```

Every `deploy` (and `build`) also runs `wp plugin check` against that
install; add `--no-plugin-check` to skip just that step.
