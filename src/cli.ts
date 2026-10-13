#!/usr/bin/env node
// CLI entry point. Maps switches to the public API and orchestrates the effects.

import { resolve } from "node:path";
import { cli, command, createConfirmer, parseCommandLine, runMain, translator } from "commendatore";
import { AppeaseError, runAppease } from "./index.js";
import type { RenormalizeSkipReason, RunOptions } from "./core/types.js";
import { i18n } from "./messages.js";
import type { MessageKey } from "./messages.js";

const NOT_RENORMALIZED_REASON: Record<RenormalizeSkipReason, MessageKey> = {
  declined: "answeredNo",
  disabled: "renormalizeRepoFalse",
  "needs-tty": "noTerminalToAsk",
};

type Message = (key: MessageKey, ...params: (string | number)[]) => string;

/**
 * Parse argv into resolved RunOptions, or null when no command was given (the help is shown).
 * cleye is the single source of truth: each RunMode is a subcommand (`appease <command> [dir]`), so the
 * modes are mutually exclusive by construction and each gets its own `--help`. cleye prints usage and
 * exits on unknown flags and on `--help`. The version line is omitted for `audit`, whose output is JSON.
 */
export function parseArgs(argv: string[]): { options: RunOptions | null; message: Message } {
  const { parsed, lang } = parseCommandLine(
    {
      moduleUrl: import.meta.url,
      description: (lang) => translator(i18n, lang)("appeaseDescription"),
      // Every command takes an optional [dir]; the root usage line does not show it, so the
      // examples do (and show --dry-run, likewise invisible until a command's own --help).
      examples: [
        "appease audit",
        "appease add-config-defaults ../other-repo --dry-run",
        "appease adapt-configs ../other-repo",
        "appease fix-format ../other-repo",
      ],
      argv,
    },
    (base, argv, lang) => {
      const message = translator(i18n, lang);
      // `--dry-run` is only for the commands that write to disk (not for `audit`, which never writes).
      const dryRunFlag = { dryRun: { type: Boolean, description: message("dryRunHelp") } };
      const renormalizeRepoFlag = { renormalizeRepo: { type: Boolean, description: message("renormalizeRepoHelp") } };
      return cli(
        {
          ...base,
          commands: [
            command({ name: "audit", parameters: ["[dir]"], strictFlags: true, flags: { ...base.flags }, help: { description: message("auditHelp") } }),
            command({ name: "add-config-defaults", parameters: ["[dir]"], strictFlags: true, flags: { ...base.flags, ...dryRunFlag }, help: { description: message("addConfigDefaultsHelp") } }),
            command({ name: "adapt-configs", parameters: ["[dir]"], strictFlags: true, flags: { ...base.flags, ...dryRunFlag }, help: { description: message("adaptConfigsHelp") } }),
            command({ name: "fix-format", parameters: ["[dir]"], strictFlags: true, flags: { ...base.flags, ...dryRunFlag, ...renormalizeRepoFlag }, help: { description: message("fixFormatHelp") } }),
          ],
        },
        undefined,
        argv,
      );
    },
    { show: (parsed) => parsed.command !== undefined && parsed.command !== "audit" },
  );
  const message = translator(i18n, lang);

  if (parsed.command === undefined) {
    parsed.showHelp();
    process.stderr.write(`\n${message("specifyCommand")}\n`);
    return { options: null, message };
  }
  const dir = parsed._.dir;
  const options: RunOptions = {
    mode: parsed.command,
    cwd: dir !== undefined ? resolve(dir) : process.cwd(),
    dryRun: parsed.command === "audit" ? false : parsed.flags.dryRun ?? false,
  };
  if (parsed.command === "fix-format") {
    options.confirmRenormalize = createConfirmer({ decision: parsed.flags.renormalizeRepo, question: message("renormalizeInGitIndexQuestion"), allowAll: true });
  }
  return { options, message };
}

/** Drop empty `unresolved` arrays from the audit JSON (an empty list carries no information). */
function omitEmptyUnresolved(key: string, value: unknown): unknown {
  return key === "unresolved" && Array.isArray(value) && value.length === 0 ? undefined : value;
}

export async function main(argv: string[]): Promise<number> {
  const { options, message } = parseArgs(argv);
  if (options === null) return 1;
  let report;
  try {
    report = await runAppease(options);
  } catch (err) {
    if (!(err instanceof AppeaseError)) throw err;
    process.stderr.write(`Error: ${message(err.key, ...err.params)}\n`);
    return 1;
  }
  const line = (key: MessageKey, ...params: (string | number)[]): void => { process.stdout.write(`${message(key, ...params)}\n`); };
  for (const warning of report.warnings ?? []) process.stderr.write(`${message("warning1", message(warning.key, ...warning.params))}\n`);
  if (report.audit !== undefined) process.stdout.write(`${JSON.stringify(report.audit, omitEmptyUnresolved, 2)}\n`);
  for (const path of report.created) line(report.dryRun ? "wouldCreate1" : "created1", path);
  for (const path of report.modified) line(report.dryRun ? "wouldModify1" : "modified1", path);
  for (const path of report.unchanged) line("unchanged1", path);
  for (const path of report.renormalized ?? []) line(report.dryRun ? "wouldRenormalizeInGitIndex1" : "renormalizedInGitIndex1", path);
  for (const { path, reason } of report.notRenormalized ?? []) line("notRenormalized1Because2", path, message(NOT_RENORMALIZED_REASON[reason]));
  return 0;
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.main) {
  runMain(() => main(process.argv.slice(2)), 1);
}
