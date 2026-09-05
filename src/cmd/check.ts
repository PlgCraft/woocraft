import { phpcsLint, phpstanAnalyse } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { ensurePhpcs, ensurePhpstan, paths, phpcsConfig, phpstanConfig } from '../toolchain.js';

export async function cmdCheck(): Promise<void> {
  const project = resolveProject();

  ensurePhpcs(project, consoleReporter);
  await ensurePhpstan(project, consoleReporter);

  const phpcsXml = phpcsConfig(project);
  const phpstanNeon = phpstanConfig(project);
  const { phpcsBin, phpstanDir, phpstanPhar } = paths(project);

  phpcsLint(phpcsBin, project.root, phpcsXml, consoleReporter);
  phpstanAnalyse(phpstanPhar, phpstanDir, phpstanNeon, consoleReporter);
}
