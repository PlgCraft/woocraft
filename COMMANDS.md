# Command reference

All commands except `new` are run from inside a scaffolded extension
(anywhere under the project root works, `woocraft` walks up to find the
plugin's main PHP file).

## `woocraft new [directory] [-y]`

Scaffolds a new extension.

Without a directory, it asks for one. Without `-y`, it walks you through a
few questions: extension name, slug, description, PHP namespace, author,
and a local WordPress install to deploy into. For that last one it asks
which kind: a DevKinsta site (picked from what's actually on your
machine) or a plain path to any other WordPress install (validated —
`wp-load.php` + WooCommerce present), or you can skip it and set one up
later. Each question has a sensible default, shown in the prompt, so
pressing enter through all of them is a reasonable way to try it out.

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

The WordPress path (and which local environment it is — see below) is
remembered as `wpTarget` in your project's own `woocraft.json`, so you
only have to give it once. Commit `woocraft.json`; if a teammate's copy
doesn't match their own machine, they'll get a clear message telling
them so and a chance to set their own instead of a cryptic failure.

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
shouldn't skip the checks that make it releasable), packages a clean
copy of the plugin into `dist/<slug>.zip` (production Composer
autoloader, no dev dependencies, no test directories, no `.git`, no
`composer.lock`, nothing that doesn't belong in a submission), then
runs the same QIT tests as `woocraft qit` against that zip. If QIT
isn't set up yet (see below), `build` fails with a clear explanation
of what's missing rather than skipping the check silently — a zip
`build` calls done is meant to actually be ready to submit.

```bash
npm run build
```

## `woocraft qit [tests...] [--no-build]`

Runs the WooCommerce Marketplace's own quality tests (QIT) against your
plugin: security, PHPStan, PHP compatibility, the WordPress.org plugin
checker, and an activation smoke test. This is what the Marketplace
review process itself runs, so a clean `qit` run is a strong signal
you're ready to submit. `woocraft build` runs this same check
automatically after packaging; run it on its own when you just want to
re-test an existing zip.

It needs a one-time connection to your WooCommerce.com account, and
your extension has to actually be registered there as a product before
QIT can test it — running `qit` (standalone or via `build`) checks this
upfront and tells you exactly what's missing if it isn't set up yet:

```bash
npm run qit -- -- partner:add
```

```bash
npm run qit                           # the configured (or default) tests
npm run qit -- security plugin-check  # just these two
npm run qit -- --no-build             # reuse the existing dist/ zip
```

| Flag | What it does |
| --- | --- |
| `tests...` | Run only these tests instead of the default set. |
| `--no-build`, `--skip-build` | Reuse the existing `dist/<slug>.zip` instead of rebuilding it first. |
| `-- <command>` | Pass a command straight through to the QIT CLI, e.g. `partner:add` or `list`. |

QIT tests a specific extension listing on WooCommerce.com, identified by
its slug or ID there, not just any zip you hand it. By default this is
your project's own slug; if that's not what it's registered under (say,
before it's been submitted under its final name), set `sut` to override
it. Configure that, which tests run by default, and any extra flags to
pass QIT, in a `woocraft.json` at your project root:

```json
{
  "qit": {
    "sut": "my-extension-slug",
    "tests": ["security", "phpstan", "phpcompatibility", "plugin-check", "activation"],
    "args": ["--json"]
  }
}
```

Commit `woocraft.json`, it's meant to travel with the project.

## `woocraft.json`

The one config file woocraft ever reads or writes, always at your
project root (never inside `.woocraft/` — that's a separate, git-ignored
cache of downloaded tools and generated phpcs/phpstan config, not
settings). Everything in it is optional, and everything in it is meant
to be committed:

```json
{
  "wpTarget": { "path": "/path/to/wordpress", "env": "direct" },
  "qit": { "sut": "my-extension-slug", "tests": [], "args": [] },
  "slug": "my-extension",
  "namespace": "MyExtension",
  "constantPrefix": "MY_EXTENSION",
  "requiresPHP": "7.4",
  "requiresWP": "6.3",
  "requiresWC": "8.5",
  "phpstanLevel": 5
}
```

- **`wpTarget`** — which local WordPress `deploy`/`build` use, and how
  (`env` is `"direct"` for a plain path, `"devkinsta"` for a DevKinsta
  site). Written automatically the first time you give a path; edit it
  by hand or just run `npm run deploy` again to replace it.
- **`qit`** — see [`woocraft qit`](#woocraft-qit-tests-no-build) above.
- The rest override what woocraft would otherwise detect from your
  plugin header and `composer.json` — you'd rarely need these.

If you edit this file by hand and get something wrong — a typo'd key, a
string where a list belongs, an `env` that isn't `"direct"` or
`"devkinsta"`, invalid JSON — every command checks it first and tells
you exactly what's wrong and how to fix it, rather than failing
somewhere confusing later. Since it's committed, `wpTarget.path` will
often point at a path that only exists on whoever set it up's machine;
that's expected, not an error — you'll just be asked for your own the
next time you deploy.
