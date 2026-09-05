import { phpcbfFix } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { ensurePhpcs, paths, phpcsConfig } from '../toolchain.js';

export async function cmdLintFix(): Promise<void> {
  const project = resolveProject();
  ensurePhpcs(project, consoleReporter);
  const config = phpcsConfig(project);
  const { phpcbfBin } = paths(project);

  phpcbfFix(phpcbfBin, project.root, config, consoleReporter);
}
