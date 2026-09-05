import { phpstanAnalyse } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { ensurePhpstan, paths, phpstanConfig } from '../toolchain.js';

export async function cmdStan(): Promise<void> {
  const project = resolveProject();
  await ensurePhpstan(project, consoleReporter);
  const config = phpstanConfig(project);
  const { phpstanDir, phpstanPhar } = paths(project);

  phpstanAnalyse(phpstanPhar, phpstanDir, config, consoleReporter);
}
