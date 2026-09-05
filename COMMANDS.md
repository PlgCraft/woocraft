# Command reference

All commands except `new` are run from inside a scaffolded extension
(anywhere under the project root works, `woocraft` walks up to find the
plugin's main PHP file).

## `woocraft new [directory] [-y]`

Scaffolds a new extension.

Without a directory, it asks for one. Without `-y`, it walks you through a
few questions: extension name, slug, description, PHP namespace, author,
and the path to a local WordPress install to deploy into. Each question
has a sensible default, shown in the prompt, so pressing enter through
all of them is a reasonable way to try it out.

```bash
woocraft new my-extension
woocraft new my-extension -y          # accept every default, no prompts
woocraft new my-extension -y --no-install   # skip npm/composer install
```

| Flag | What it does |
| --- | --- |
| `-y`, `--yes` | Skip the prompts and use defaults. Needed in non-interactive environments (CI, scripts). |
| `--no-install`, `--skip-install` | Scaffold the files only, don't run `npm install` / `composer install` / build the admin UI. |

After scaffolding, if you gave it (or it's running interactively and you
answered) a WordPress path, it installs dependencies, warms the toolchain
(phpcs, phpstan, WP-CLI, QIT, all in one go so later commands don't
surprise you with a download), and deploys the plugin into that
WordPress install right away.

The WordPress path is remembered per project in
`~/.config/woocraft/config.json`, so you only have to give it once.

## `woocraft deploy [--path <wp>] [--no-check] [--no-pot] [--no-plugin-check]`

The command you run after every change. It:

1. Runs `check` (phpcs + phpstan), unless skipped.
2. Regenerates the `.pot` translation file, unless skipped.
3. Builds the admin UI and a production Composer autoloader.
4. Copies the plugin (compiled assets only, never the Vite source) into
   `<wordpress>/wp-content/plugins/<slug>/`, replacing whatever was
   there.
5. Activates it.
6. Runs `wp plugin check` against it, unless skipped.

| Flag | What it does |
| --- | --- |
| `--path <wp>` | The WordPress install to deploy into. Only needed the first time, or to deploy somewhere else, since it's saved after. |
| `--no-check`, `--skip-check` | Skip the phpcs/phpstan step. |
| `--no-pot`, `--skip-pot` | Skip regenerating the `.pot` file. |
| `--no-plugin-check`, `--skip-plugin-check` | Skip the `wp plugin check` step. |

```bash
npm run deploy
npm run deploy -- --no-check              # quick iteration, skip the checks
npm run deploy -- --path ~/Sites/wordpress
```

## `woocraft lint` / `woocraft lint:fix`

Runs PHP_CodeSniffer against a ruleset generated from your plugin header
and `composer.json`: security, database safety, deprecated APIs, PHP
cross-version compatibility, naming conventions, and text domain use.
It's deliberately not a formatting ruleset, it's the substance the
WooCommerce Marketplace's automated review checks for.

`lint:fix` runs the same ruleset through `phpcbf`, which rewrites
whatever it can fix automatically.

Both exit non-zero if problems remain, so they work as CI checks.

To take full control of the ruleset yourself, put a `phpcs.xml` or
`phpcs.xml.dist` at your project root. woocraft uses that instead of
generating one.

## `woocraft stan`

Runs PHPStan at level 5, with the WordPress and WooCommerce function and
class stubs loaded so it understands WordPress code without false
positives on things like `add_action` or `WC()`.

Put a `phpstan.neon` or `phpstan.neon.dist` at your project root to
override the generated config. A `phpstan-baseline.neon` at the root is
picked up automatically and merged in, so you can adopt PHPStan on an
existing codebase without fixing every existing issue first.

The PHPStan `.phar` itself (about 28 MB) is downloaded once per machine
and cached in `~/.cache/woocraft/`, then reused by every project. If your
network can't reach GitHub, set `WOOCRAFT_PHPSTAN_PHAR` to a copy you
already have:

```bash
WOOCRAFT_PHPSTAN_PHAR=/path/to/phpstan.phar npm run stan
```

## `woocraft check`

Just `lint` followed by `stan`. What `deploy` and `build` run before
doing anything else, and a reasonable pre-commit check.

## `woocraft pot`

Regenerates `languages/<slug>.pot` from every translatable string in the
plugin, using WP-CLI's `i18n make-pot`.

## `woocraft build [--path <wp>]`

The release command. Runs everything `deploy` does (always, with no
`--no-check`/`--no-pot`/`--no-plugin-check` shortcuts here, a release
shouldn't skip the checks that make it releasable), then packages a
clean copy of the plugin into `dist/<slug>.zip`: production Composer
autoloader, no dev dependencies, no test directories, no `.git`, no
`composer.lock`, nothing that doesn't belong in a submission.

```bash
npm run build
```

## `woocraft qit [tests...] [--no-build]`

Runs the WooCommerce Marketplace's own quality tests (QIT) against your
plugin: security, PHPStan, PHP compatibility, the WordPress.org plugin
checker, and an activation smoke test. This is what the Marketplace
review process itself runs, so a clean `qit` run is a strong signal
you're ready to submit.

It's opt-in and never runs as part of `check` or `build`, because it
needs a one-time connection to your WooCommerce.com account:

```bash
npx woocraft qit -- partner:add
```

```bash
npm run qit                        # the configured (or default) tests
npm run qit security plugin-check  # just these two
npm run qit -- --no-build          # reuse the existing dist/ zip
```

| Flag | What it does |
| --- | --- |
| `tests...` | Run only these tests instead of the default set. |
| `--no-build`, `--skip-build` | Reuse the existing `dist/<slug>.zip` instead of rebuilding it first. |
| `-- <command>` | Pass a command straight through to the QIT CLI, e.g. `partner:add` or `list`. |

Configure which tests run by default, and any extra flags to pass QIT,
in a `woocraft.json` at your project root:

```json
{
  "qit": {
    "tests": ["security", "phpstan", "phpcompatibility", "plugin-check", "activation"],
    "args": ["--json"]
  }
}
```

Commit `woocraft.json`, it's meant to travel with the project.
