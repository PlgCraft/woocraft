import kleur from 'kleur';

// A structured progress notice a package can raise without touching the
// console itself — packages call `report(event)`, they never call
// `console.log`/`kleur` directly. Only the cli/cmd layer decides how (or
// whether) to render one.
export type ProgressEvent =
  | { kind: 'info'; message: string }
  | { kind: 'step'; label: string; detail?: string }
  | { kind: 'warn'; message: string; hint?: string }
  | { kind: 'success'; message: string };

export type Reporter = (event: ProgressEvent) => void;

// The CLI's terminal renderer for progress events: bold step headers,
// yellow warnings (with an optional dimmed hint line), a green success
// checkmark, plain info lines. Shared by every command so output stays
// consistent no matter which package raised the event.
export function consoleReporter(event: ProgressEvent): void {
  switch (event.kind) {
    case 'info':
      console.log(event.message);
      break;
    case 'step':
      console.log(
        kleur.bold(`\n  ${event.label}`) + (event.detail ? kleur.dim(`  ${event.detail}`) : '') + '\n',
      );
      break;
    case 'warn':
      console.log(
        kleur.yellow(`  ! ${event.message}`) + (event.hint ? kleur.dim(`\n    ${event.hint}`) : ''),
      );
      break;
    case 'success':
      console.log('\n  ' + kleur.green('✔') + ` ${event.message}\n`);
      break;
  }
}
