import kleur from 'kleur';

import { buildAdminUi, composerNoDev } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { syncPlugin } from '../wp/deploy.js';
import { activateInWordPress, resolveWordPress } from '../wp/wordpress.js';
import { parseDeployOptions } from './_common.js';
import { cmdCheck } from './check.js';
import { cmdPot } from './pot.js';

export async function cmdDeploy(args: string[]): Promise<void> {
  const { path, skipCheck, skipPot } = parseDeployOptions(args);
  const project = resolveProject();

  const target = await resolveWordPress(project, {
    path,
    interactive: Boolean(process.stdin.isTTY),
  });

  if (!skipCheck) {
    consoleReporter({ kind: 'step', label: 'Static checks' });
    await cmdCheck();
  }

  if (!skipPot) {
    await cmdPot();
  }

  buildAdminUi(project, consoleReporter);
  composerNoDev(project, consoleReporter);

  consoleReporter({ kind: 'step', label: 'Deploying', detail: target.pluginDir });
  syncPlugin(project, target.pluginDir);
  activateInWordPress(project, target.root, consoleReporter);

  console.log('\n  ' + kleur.green('✔') + ` ${project.slug} deployed to ${kleur.bold(target.root)}`);
  if (target.siteUrl) {
    console.log(`    ${kleur.cyan(`${target.siteUrl}/wp-admin/admin.php?page=${project.slug}`)}`);
  }
  console.log('');
}
