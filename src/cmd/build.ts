import { buildAdminUi, composerNoDev } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { packagePlugin, syncPlugin } from '../wp/deploy.js';
import { activateInWordPress, pluginCheckInWordPress, resolveWordPress } from '../wp/wordpress.js';
import { parseDeployOptions } from './_common.js';
import { cmdCheck } from './check.js';
import { cmdPot } from './pot.js';
import { runQitChecks } from './qit.js';

// A release-ready build: static checks + a fresh .pot, deployed into a
// real WordPress install to verify it with `wp plugin check`, packaged
// into dist/<slug>.zip, then verified again with QIT against that zip.
// Always runs everything — there's no --no-check/--no-pot here the way
// `deploy` has; a release artifact shouldn't skip the checks that make
// it releasable.
export async function cmdBuild(args: string[]): Promise<void> {
  const { path } = parseDeployOptions(args);
  const project = resolveProject();

  const target = await resolveWordPress(project, {
    path,
    interactive: Boolean(process.stdin.isTTY),
  }, consoleReporter);

  consoleReporter({ kind: 'step', label: 'Static checks' });
  await cmdCheck();
  await cmdPot();

  buildAdminUi(project, consoleReporter);
  composerNoDev(project, consoleReporter);

  consoleReporter({ kind: 'step', label: 'Deploying', detail: target.pluginDir });
  syncPlugin(project, target.pluginDir);
  await activateInWordPress(project, target.root, target.env, consoleReporter);
  await pluginCheckInWordPress(project, target.root, target.env, consoleReporter);

  const zipPath = await packagePlugin(project, consoleReporter);
  await runQitChecks(project, zipPath, consoleReporter);

  consoleReporter({ kind: 'success', message: `Built ${zipPath}` });
}
