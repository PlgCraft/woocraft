import { basename } from 'node:path';

import kleur from 'kleur';
import prompts from 'prompts';

import { UserError } from '../exec.js';
import { rememberWpTarget } from '../project.js';
import { consoleReporter } from '../report.js';
import { scaffoldProject, setupProject } from '../scaffold/scaffold.js';
import type { Answers } from '../scaffold/tokens.js';
import {
  isValidNamespace,
  isValidPluginName,
  isValidSlug,
  pascalCase,
  slugify,
  titleFromSlug,
} from '../strings.js';
import { deployToWordPress } from '../wp/deploy.js';
import { promptWpTarget } from '../wp/wordpress.js';

type NewArgs = {
  dir?: string;
  yes: boolean;
  install: boolean;
};

const DEFAULTS = {
  author: 'PlgCraft',
  authorUri: 'https://plgcraft.com',
  requiresPHP: '7.4',
  requiresWP: '6.3',
  requiresWC: '8.5',
  wpTestedUpTo: '7.1',
  wcTestedUpTo: '11.0',
} as const;

const NAME_TOO_SHORT =
  'needs at least 5 letters or digits — WordPress.org rejects shorter plugin names.';

export async function cmdNew(args: string[]): Promise<void> {
  const { dir, yes, install } = parseArgs(args);

  if (!yes && !process.stdin.isTTY) {
    throw new UserError(
      'woocraft needs an interactive terminal for its prompts.\n' +
        'Run it in a terminal, or pass --yes to accept the defaults:\n' +
        `  npx woocraft new ${dir || 'my-extension'} --yes`,
    );
  }

  const answers = await collectAnswers(yes, dir);
  const dirName = dir || answers.slug;
  const { targetDir, name, fileCount, pinnedVersion } = await scaffoldProject(dirName, answers);

  if (pinnedVersion) {
    console.log(
      kleur.dim(`  (woocraft ${pinnedVersion} is not published — linking this build via file:)\n`),
    );
  }

  if (answers.wpPath) rememberWpTarget(targetDir, { path: answers.wpPath, env: answers.wpEnv ?? 'direct' });

  console.log(
    '\n' +
      kleur.green('✔') +
      ` Scaffolded ${kleur.bold(name)} ${kleur.dim(`(${fileCount} files)`)} in ${kleur.cyan(
        relFromCwd(targetDir),
      )}\n`,
  );

  const installed = install ? await setupProject(targetDir, consoleReporter) : false;

  // Deploy into the WordPress install the user pointed us at.
  if (answers.wpPath) await deployToWordPress(targetDir, answers.wpPath, answers.wpEnv ?? 'direct', consoleReporter);

  printNextSteps({ dirName, installed });
}

function parseArgs(argv: string[]): NewArgs {
  const args: NewArgs = { yes: false, install: true };
  for (const a of argv) {
    if (a === '-y' || a === '--yes') args.yes = true;
    else if (a === '--no-install' || a === '--skip-install') args.install = false;
    else if (!a.startsWith('-') && !args.dir) args.dir = a;
  }
  return args;
}

export async function collectAnswers(yes: boolean, dirArg?: string): Promise<Answers> {
  const seed = dirArg ? basename(dirArg) : undefined;
  const fromSeed = seed ? titleFromSlug(seed) : undefined;
  const seedName = fromSeed && isValidPluginName(fromSeed) ? fromSeed : 'My Extension';

  if (yes) return answersFromDefaults(seed, fromSeed);

  console.log(kleur.bold(`\n  woocraft  ${kleur.dim('· new WooCommerce extension')}\n`));

  const a = await prompts(
    [
      {
        type: 'text',
        name: 'name',
        message: 'Extension name',
        initial: seedName,
        validate: (v: string) => (isValidPluginName(v) ? true : `Name ${NAME_TOO_SHORT}`),
      },
      {
        type: 'text',
        name: 'slug',
        message: 'Slug (folder / text-domain / prefix)',
        initial: (prev: string) => slugify(seed || prev),
        validate: (v: string) =>
          isValidSlug(v) ? true : 'Lowercase letters, digits and dashes; must start with a letter',
      },
      {
        type: 'text',
        name: 'description',
        message: 'One-line description',
        initial: (_prev: string, values: prompts.Answers<string>) =>
          defaultDescription(String(values.name)),
      },
      {
        type: 'text',
        name: 'namespace',
        message: 'PHP namespace',
        initial: (_prev: string, values: prompts.Answers<string>) => pascalCase(values.name),
        validate: (v: string) => (isValidNamespace(v) ? true : 'Not a valid PHP namespace'),
      },
      {
        type: 'text',
        name: 'vendor',
        message: 'Vendor (composer / npm scope)',
        initial: slugify(DEFAULTS.author),
        validate: (v: string) => (isValidSlug(v) ? true : 'Lowercase letters, digits and dashes'),
      },
      {
        type: 'text',
        name: 'author',
        message: 'Author',
        initial: DEFAULTS.author,
      },
      {
        type: 'text',
        name: 'authorUri',
        message: 'Author URI',
        initial: DEFAULTS.authorUri,
      },
      {
        type: 'text',
        name: 'pluginUri',
        message: 'Plugin URI',
        initial: (prev: string) => prev || DEFAULTS.authorUri,
      },
      {
        type: 'text',
        name: 'requiresPHP',
        message: 'Requires PHP',
        initial: DEFAULTS.requiresPHP,
      },
      {
        type: 'text',
        name: 'requiresWP',
        message: 'Requires WordPress',
        initial: DEFAULTS.requiresWP,
      },
      {
        type: 'text',
        name: 'requiresWC',
        message: 'Requires WooCommerce',
        initial: DEFAULTS.requiresWC,
      },
    ],
    { onCancel },
  );

  const wpTarget = await promptWpTarget(consoleReporter);

  return {
    name: a.name,
    slug: a.slug,
    wpPath: wpTarget?.path,
    wpEnv: wpTarget?.env,
    description: a.description,
    namespace: a.namespace,
    vendor: a.vendor,
    author: a.author,
    authorUri: a.authorUri,
    pluginUri: a.pluginUri,
    requiresPHP: a.requiresPHP,
    requiresWP: a.requiresWP,
    requiresWC: a.requiresWC,
    wpTestedUpTo: DEFAULTS.wpTestedUpTo,
    wcTestedUpTo: DEFAULTS.wcTestedUpTo,
  };
}

function answersFromDefaults(seed: string | undefined, fromSeed: string | undefined): Answers {
  const name = fromSeed ?? 'My Extension';
  if (!isValidPluginName(name)) {
    throw new UserError(
      `"${name}" ${NAME_TOO_SHORT}\n` + 'Give the directory a longer name, or drop -y and type one.',
    );
  }

  return {
    name,
    slug: slugify(seed ?? name),
    description: defaultDescription(name),
    namespace: pascalCase(name),
    vendor: slugify(DEFAULTS.author),
    author: DEFAULTS.author,
    authorUri: DEFAULTS.authorUri,
    pluginUri: DEFAULTS.authorUri,
    requiresPHP: DEFAULTS.requiresPHP,
    requiresWP: DEFAULTS.requiresWP,
    requiresWC: DEFAULTS.requiresWC,
    wpTestedUpTo: DEFAULTS.wpTestedUpTo,
    wcTestedUpTo: DEFAULTS.wcTestedUpTo,
  };
}

function onCancel(): never {
  throw new Error('Aborted.');
}

function defaultDescription(name: string): string {
  return `${name} extends WooCommerce with custom functionality.`;
}

function relFromCwd(p: string): string {
  return p.startsWith(process.cwd()) ? '.' + p.slice(process.cwd().length) : p;
}

function printNextSteps({ dirName, installed }: { dirName: string; installed: boolean }): void {
  console.log(kleur.bold('  Next steps\n'));
  console.log(`    cd ${dirName}`);
  if (!installed) {
    console.log('    npm install');
    console.log('    composer install');
    console.log('    npm run build:app');
  }
  console.log(kleur.bold('  Commands') + kleur.dim('  (from the project root)\n'));
  console.log(
    '    npm run deploy                  ' + kleur.dim('check + pot + build + deploy + verify into your WordPress'),
  );
  console.log('    npm run lint · stan · check   ' + kleur.dim('phpcs / phpstan (config owned by woocraft)'));
  console.log('    npm run build                 ' + kleur.dim('deploy + verify + package + QIT-verify dist/<slug>.zip'));
  console.log('    npm run build:app · pot · qit');
  console.log('');
  console.log(
    kleur.dim(
      '  Starter route: src/Http/Routes/Hello.php · UI: src/Admin/ (App.tsx, lib/api.ts).\n' +
        '  phpcs/phpstan config is generated into .woocraft/ — commit\n' +
        '  phpcs.xml.dist / phpstan.neon.dist at the root to override.\n',
    ),
  );
}
