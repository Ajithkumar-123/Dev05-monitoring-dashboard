// assets/scripts/lib/argv.js — argv parser for the scaffold helper. Pure: no IO.
// Extended from bin/lib/argv.js pattern to return {subcommand, positional, flags, unknown}.
export const KNOWN_FLAGS = new Set(['--help', '-h', '--version', '-v']);

export function parseScaffoldArgs(argv) {
  // argv = ['node', 'scaffold.js', '<subcommand>', ...positionals, ...flags]
  const args = argv.slice(2);
  const flags = { help: false, version: false };
  const positional = [];
  const unknown = [];
  let subcommand = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--version' || a === '-v') flags.version = true;
    else if (a.startsWith('-')) unknown.push(a);
    else if (subcommand === null) subcommand = a;
    else positional.push(a);
  }
  return { subcommand, positional, flags, unknown };
}
