#!/usr/bin/env node
// CLI entry point. Maps switches to the public API and orchestrates the effects.

import { resolve } from "node:path";
import { cli, command, parseCommandLine, runMain } from "commendatore";
import type { ExitCode } from "commendatore";
import { runAppease } from "./index.js";
import type { RunOptions } from "./core/types.js";

const EXIT_CODES: ExitCode[] = [
  { code: 0, description: "done" },
  { code: 1, description: "no command given, or an error" },
];

/** `--dry-run`, shared by the commands that write to disk (not by `audit`, which never writes). */
const dryRunFlag = {
  dryRun: { type: Boolean, description: "Simulate writes; report what would change but touch nothing" },
} as const;

/**
 * Parse argv into resolved RunOptions, or null when no command was given (the help is shown).
 * cleye is the single source of truth: each RunMode is a subcommand (`appease <command> [dir]`), so the
 * modes are mutually exclusive by construction and each gets its own `--help`. cleye prints usage and
 * exits on unknown flags and on `--help`. The version line is omitted for `audit`, whose output is JSON.
 */
export function parseArgs(argv: string[]): RunOptions | null {
  const { parsed } = parseCommandLine(
    {
      moduleUrl: import.meta.url,
      description: "Normalize a repo's text files to its .editorconfig / .gitattributes. One command is required.",
      // Every command takes an optional [dir]; the root usage line does not show it, so the
      // examples do (and show --dry-run, likewise invisible until a command's own --help).
      examples: [
        "appease audit",
        "appease add-config-defaults ../other-repo --dry-run",
        "appease adapt-configs ../other-repo",
        "appease fix-format ../other-repo",
      ],
      exitCodes: EXIT_CODES,
      exitCodesHeading: "Exit codes:",
    },
    (base) => cli(
      {
        ...base,
        commands: [
          command({ name: "audit", parameters: ["[dir]"], strictFlags: true, help: { description: "Report deviations only (no writes)" } }),
          command({ name: "add-config-defaults", parameters: ["[dir]"], strictFlags: true, flags: dryRunFlag, help: { description: "Write pure-default configs (only the ones that do not exist yet)" } }),
          command({ name: "adapt-configs", parameters: ["[dir]"], strictFlags: true, flags: dryRunFlag, help: { description: "Write/adapt configs to reflect the repo's current reality" } }),
          command({ name: "fix-format", parameters: ["[dir]"], strictFlags: true, flags: dryRunFlag, help: { description: "Normalize files (BOM / EOL / trailing whitespace / final newline)" } }),
        ],
      },
      undefined,
      argv,
    ),
    { show: (parsed) => parsed.command !== undefined && parsed.command !== "audit" },
  );

  if (parsed.command === undefined) {
    parsed.showHelp();
    process.stderr.write("\nSpecify a command: audit | add-config-defaults | adapt-configs | fix-format\n");
    return null;
  }
  const dir = parsed._.dir;
  return {
    mode: parsed.command,
    cwd: dir !== undefined ? resolve(dir) : process.cwd(),
    dryRun: parsed.command === "audit" ? false : parsed.flags.dryRun ?? false,
  };
}

/** Drop empty `unresolved` arrays from the audit JSON (an empty list carries no information). */
function omitEmptyUnresolved(key: string, value: unknown): unknown {
  return key === "unresolved" && Array.isArray(value) && value.length === 0 ? undefined : value;
}

export async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  if (options === null) return 1;
  const report = await runAppease(options);
  for (const warning of report.warnings ?? []) process.stderr.write(`warning: ${warning}\n`);
  if (report.audit !== undefined) process.stdout.write(`${JSON.stringify(report.audit, omitEmptyUnresolved, 2)}\n`);
  for (const path of report.created) process.stdout.write(`${report.dryRun ? "would create" : "created"}: ${path}\n`);
  for (const path of report.modified) process.stdout.write(`${report.dryRun ? "would modify" : "modified"}: ${path}\n`);
  for (const path of report.unchanged) process.stdout.write(`unchanged: ${path}\n`);
  return 0;
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.main) {
  runMain(() => main(process.argv.slice(2)), 1);
}
