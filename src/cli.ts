#!/usr/bin/env node
// CLI entry point. Maps switches to the public API and orchestrates the effects.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cli } from "cleye";
import { runAppease } from "./index.js";
import type { RunMode, RunOptions } from "./core/types.js";

/** CLI flag (camelCase, kebab-cased on the command line) → public RunMode. Exactly one must be selected. */
const MODE_FLAGS = [
  ["audit", "audit"],
  ["addConfigDefaults", "add-config-defaults"],
  ["adaptConfigs", "adapt-configs"],
  ["fixFormat", "fix-format"],
] as const satisfies readonly (readonly [string, RunMode])[];

/**
 * Parse argv into resolved RunOptions. cleye is the single source of truth for the flags: it
 * derives both the parsing and the `--help` usage from the table below. It prints usage and exits
 * on unknown flags (strictFlags) and on `--help`; the two domain rules below do the same explicitly.
 */
export function parseArgs(argv?: string[]): RunOptions {
  const parsed = cli(
    {
      name: "appease",
      help: { description: "Normalize a repo's text files to its .editorconfig / .gitattributes. Exactly one mode is required." },
      parameters: ["[dir]"],
      strictFlags: true,
      flags: {
        audit: { type: Boolean, description: "Report deviations only (no writes)" },
        addConfigDefaults: { type: Boolean, description: "Write pure-default configs (only the ones that do not exist yet)" },
        adaptConfigs: { type: Boolean, description: "Write/adapt configs to reflect the repo's current reality" },
        fixFormat: { type: Boolean, description: "Normalize files (BOM / EOL / trailing whitespace / final newline)" },
        dir: { type: String, description: "Directory to operate on (default: current directory); also accepted as a positional argument" },
        dryRun: { type: Boolean, description: "Simulate writes; report what would change but touch nothing" },
        yes: { type: Boolean, description: "Skip interactive confirmations for destructive operations" },
        verbose: { type: Boolean, description: "Verbose logging" },
      },
    },
    undefined,
    argv,
  );

  const { flags } = parsed;
  const modes = MODE_FLAGS.filter(([flag]) => flags[flag] === true).map(([, mode]) => mode);
  if (modes.length !== 1) {
    parsed.showHelp();
    process.stderr.write("\nSpecify exactly one mode: --audit | --add-config-defaults | --adapt-configs | --fix-format\n");
    process.exit(1);
  }
  if (parsed._.length > 1) {
    parsed.showHelp();
    process.stderr.write("\nSpecify at most one directory\n");
    process.exit(1);
  }
  const positionalDir = parsed._.dir;
  if (positionalDir !== undefined && flags.dir !== undefined) {
    parsed.showHelp();
    process.stderr.write("\nSpecify the directory either with --dir or as a positional argument, not both\n");
    process.exit(1);
  }
  const dir = flags.dir ?? positionalDir;
  return {
    mode: modes[0],
    cwd: dir !== undefined ? resolve(dir) : process.cwd(),
    dryRun: flags.dryRun ?? false,
    yes: flags.yes ?? false,
    verbose: flags.verbose ?? false,
  };
}

/** Drop empty `unresolved` arrays from the audit JSON (an empty list carries no information). */
function omitEmptyUnresolved(key: string, value: unknown): unknown {
  return key === "unresolved" && Array.isArray(value) && value.length === 0 ? undefined : value;
}

export async function main(argv: string[]): Promise<number> {
  const report = await runAppease(parseArgs(argv));
  if (report.audit !== undefined) process.stdout.write(`${JSON.stringify(report.audit, omitEmptyUnresolved, 2)}\n`);
  for (const path of report.created) process.stdout.write(`${report.dryRun ? "would create" : "created"}: ${path}\n`);
  for (const path of report.modified) process.stdout.write(`${report.dryRun ? "would modify" : "modified"}: ${path}\n`);
  for (const path of report.unchanged) process.stdout.write(`unchanged: ${path}\n`);
  return 0;
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
