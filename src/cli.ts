#!/usr/bin/env node
// CLI entry point. Maps switches to the public API and orchestrates the effects.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cli, command } from "cleye";
import { runAppease } from "./index.js";
import type { RunOptions } from "./core/types.js";

/** Version string from the package's own package.json (sibling of `dist/`), shown in `--help` / `--version`. */
const version: string = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

/** `--dry-run`, shared by the commands that write to disk (not by `audit`, which never writes). */
const dryRunFlag = {
  dryRun: { type: Boolean, description: "Simulate writes; report what would change but touch nothing" },
} as const;

/**
 * Parse argv into resolved RunOptions. cleye is the single source of truth: each RunMode is a
 * subcommand (`appease <command> [dir]`), so the modes are mutually exclusive by construction and
 * each gets its own `--help`. cleye prints usage and exits on unknown flags and on `--help`.
 */
export function parseArgs(argv?: string[]): RunOptions {
  const parsed = cli(
    {
      name: "appease",
      version,
      help: { description: "Normalize a repo's text files to its .editorconfig / .gitattributes. One command is required." },
      commands: [
        command({ name: "audit", parameters: ["[dir]"], strictFlags: true, help: { description: "Report deviations only (no writes)" } }),
        command({ name: "add-config-defaults", parameters: ["[dir]"], strictFlags: true, flags: dryRunFlag, help: { description: "Write pure-default configs (only the ones that do not exist yet)" } }),
        command({ name: "adapt-configs", parameters: ["[dir]"], strictFlags: true, flags: dryRunFlag, help: { description: "Write/adapt configs to reflect the repo's current reality" } }),
        command({ name: "fix-format", parameters: ["[dir]"], strictFlags: true, flags: dryRunFlag, help: { description: "Normalize files (BOM / EOL / trailing whitespace / final newline)" } }),
      ],
    },
    undefined,
    argv,
  );

  if (parsed.command === undefined) {
    parsed.showHelp();
    process.stderr.write("\nSpecify a command: audit | add-config-defaults | adapt-configs | fix-format\n");
    process.exit(1);
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
  const report = await runAppease(parseArgs(argv));
  for (const warning of report.warnings ?? []) process.stderr.write(`warning: ${warning}\n`);
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
