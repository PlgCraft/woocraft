import { phpcsLint } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { ensurePhpcs, paths, phpcsConfig } from '../toolchain.js';

export async function cmdLint(): Promise<void> {
  const project = resolveProject();
  ensurePhpcs(project, consoleReporter);
  const config = phpcsConfig(project);
  const { phpcsBin } = paths(project);

  phpcsLint(phpcsBin, project.root, config, consoleReporter);
}
