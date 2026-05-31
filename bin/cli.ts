#!/usr/bin/env node
// CLI entry point. Maps switches to the public API and orchestrates the effects.

import { fileURLToPath } from "node:url";
import { runAppease } from "../src/index.js";
import type { RunOptions } from "../src/types.js";

/** Parse argv into resolved RunOptions, or throw on invalid input (never fail silently). */
export function parseArgs(argv: string[]): RunOptions {
  void argv; // scaffold: parameter wired but unused until implemented
  // TODO(scaffold): use node:util parseArgs. Switches:
  //   --audit | --add-config-defaults | --adapt-configs | --fix-format (exactly one mode)
  //   --apply-eol --yes --dry-run --verbose
  throw new Error("parseArgs: not implemented");
}

export async function main(argv: string[]): Promise<number> {
  // TODO(scaffold): parse, run, print the summary of created/modified files
  // (and the canonical JSON AuditResult for --audit). Return a process exit code.
  const options = parseArgs(argv);
  const report = await runAppease(options);
  void report;
  throw new Error("main: not implemented");
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
