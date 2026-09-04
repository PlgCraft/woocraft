import { runCli } from "./cmd/cli.js";

runCli(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('\n' + message + '\n');
  process.exit(1);
});
