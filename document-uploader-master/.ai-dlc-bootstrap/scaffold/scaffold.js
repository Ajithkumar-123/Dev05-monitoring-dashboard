#!/usr/bin/env node
// assets/scripts/scaffold.js — ai-dlc-bootstrap scaffolder helper. Thin entry point: argv parse + dispatch.
// Deployed to user repos at .ai-dlc-bootstrap/scaffold/scaffold.js by bin/install.js.
// Invoked from slash-commands as: node .ai-dlc-bootstrap/scaffold/scaffold.js <subcommand> "$ARGUMENTS"
import { parseScaffoldArgs } from './lib/argv.js';
import { dispatch, HANDLERS } from './lib/dispatch.js';
import { EXIT_OK, EXIT_USAGE, EXIT_INTERNAL } from './lib/report.js';

function usage() {
  const subcommands = Object.keys(HANDLERS).sort();
  return [
    'Usage: node scaffold.js <subcommand> [args...]',
    '',
    'Subcommands:',
    ...(subcommands.length === 0
      ? ['  (none registered yet — plans 04-06 will populate)']
      : subcommands.map((s) => `  ${s}`)),
    '',
    'Flags:',
    '  -h, --help     Print this usage and exit.',
    '  -v, --version  Print version and exit.',
    '',
  ].join('\n');
}

async function main() {
  try {
    const parsed = parseScaffoldArgs(process.argv);
    if (parsed.flags.version) {
      // Helper version is tied to ai-dlc-bootstrap package version.
      process.stdout.write('ai-dlc-scaffold 0.1.0\n');
      return EXIT_OK;
    }
    if (parsed.flags.help || parsed.subcommand === null) {
      process.stdout.write(usage());
      return EXIT_OK;
    }
    if (parsed.unknown.length > 0) {
      process.stderr.write(`Unknown flag(s): ${parsed.unknown.join(', ')}\nRun --help for usage.\n`);
      return EXIT_USAGE;
    }
    const result = await dispatch({
      subcommand: parsed.subcommand,
      positional: parsed.positional,
      flags: parsed.flags,
      cwd: process.cwd(),
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result.exitCode ?? EXIT_OK;
  } catch (e) {
    process.stderr.write(`Internal error: ${e?.message ?? e}\n`);
    return EXIT_INTERNAL;
  }
}

main()
  .then((code) => process.exit(code ?? EXIT_OK))
  .catch((err) => {
    process.stderr.write(`Internal error: ${err?.message ?? err}\n`);
    process.exit(EXIT_INTERNAL);
  });
