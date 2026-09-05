import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { generatePot } from '../commands.js';
import { resolveProject } from '../project.js';
import { consoleReporter } from '../report.js';
import { ensureWpCli } from '../toolchain.js';

export async function cmdPot(): Promise<void> {
  const project = resolveProject();
  const wpCli = await ensureWpCli(project, consoleReporter);
  const pot = join('languages', `${project.slug}.pot`);
  mkdirSync(join(project.root, 'languages'), { recursive: true });

  generatePot(wpCli, project.root, pot, project.slug, project.textDomain, consoleReporter);

  consoleReporter({ kind: 'success', message: `Wrote ${pot}` });
}
