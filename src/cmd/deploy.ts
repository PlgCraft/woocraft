import kleur from 'kleur';

import { buildAdminUi, composerNoDev } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { syncProjectFiles } from '../sync.js';
import { syncPlugin } from '../wp/deploy.js';
import { activateInWordPress, pluginCheckInWordPress, resolveWordPress } from '../wp/wordpress.js';
import { parseDeployOptions } from './_common.js';
import { cmdCheck } from './check.js';
import { cmdPot } from './pot.js';

export async function cmdDeploy(args: string[]): Promise<void> {
  const { path, skipCheck, skipPot, skipPluginCheck } = parseDeployOptions(args);
  const project = resolveProject();
  syncProjectFiles(project, consoleReporter);

  const target = await resolveWordPress(project, {
    path,
    interactive: Boolean(process.stdin.isTTY),
  }, consoleReporter);

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
  await activateInWordPress(project, target.root, target.env, consoleReporter);

  if (!skipPluginCheck) {
    await pluginCheckInWordPress(project, target.root, target.env, consoleReporter);
  }

  console.log('\n  ' + kleur.green('✔') + ` ${project.slug} deployed to ${kleur.bold(target.root)}`);
  if (target.siteUrl) {
    console.log(`    ${kleur.cyan(`${target.siteUrl}/wp-admin/admin.php?page=${project.slug}`)}`);
  }
  console.log('');
}
