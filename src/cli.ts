#!/usr/bin/env node
// CLI entry point. Maps switches to the public API and orchestrates the effects.

import { resolve } from "node:path";
import { parseArgs as nodeParseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { runAppease } from "./index.js";
import type { RunMode, RunOptions } from "./core/types.js";

const MODES: RunMode[] = ["audit", "add-config-defaults", "adapt-configs", "fix-format"];

/** Parse argv into resolved RunOptions, or throw on invalid input (never fail silently). */
export function parseArgs(argv: string[]): RunOptions {
  const { values } = nodeParseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      audit: { type: "boolean" },
      "add-config-defaults": { type: "boolean" },
      "adapt-configs": { type: "boolean" },
      "fix-format": { type: "boolean" },
      yes: { type: "boolean" },
      "dry-run": { type: "boolean" },
      verbose: { type: "boolean" },
      dir: { type: "string" },
    },
  });
  const modes = MODES.filter((mode) => values[mode] === true);
  if (modes.length !== 1) {
    throw new Error("Specify exactly one mode: --audit | --add-config-defaults | --adapt-configs | --fix-format");
  }
  return {
    mode: modes[0],
    cwd: values.dir !== undefined ? resolve(values.dir) : process.cwd(),
    dryRun: values["dry-run"] ?? false,
    yes: values.yes ?? false,
    verbose: values.verbose ?? false,
  };
}

export async function main(argv: string[]): Promise<number> {
  const report = await runAppease(parseArgs(argv));
  if (report.audit !== undefined) process.stdout.write(`${JSON.stringify(report.audit, null, 2)}\n`);
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
