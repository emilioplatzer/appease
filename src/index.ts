// Public API for appease. Consumable from Node and exercised by the CLI and tests.

import { analyzeContent } from "./core/analyze.js";
import { audit } from "./core/audit.js";
import { defaultEditorconfig, defaultGitattributes, interpretConfigs } from "./core/configs.js";
import type { AuditResult, FormatReport, RunOptions, RunReport } from "./core/types.js";
import { readRawConfigs, writeEditorconfig, writeGitattributes } from "./io/configs.js";
import { listTrackedFiles, readForAudit } from "./io/files.js";

export * from "./core/types.js";
export { analyzeContent } from "./core/analyze.js";
export { normalizeText } from "./core/normalize.js";
export { interpretConfigs, defaultEditorconfig, defaultGitattributes } from "./core/configs.js";
export { readRawConfigs, writeEditorconfig, writeGitattributes } from "./io/configs.js";
export { audit, deviationsToExceptions } from "./core/audit.js";

/**
 * Run a full appease operation according to `options.mode`:
 * - `audit`               : report deviations only (no writes).
 * - `add-config-defaults` : write pure-default configs (no inspection).
 * - `adapt-configs`       : write/adapt configs to reflect the repo's reality.
 * - `fix-format`          : normalize files (BOM/trailing/newline; EOL via Git).
 *
 * Orchestrates the effects (git ls-files, file I/O) around the pure core.
 */
export async function runAppease(options: RunOptions): Promise<RunReport> {
  if (options.mode === "audit") return runAudit(options);
  if (options.mode === "add-config-defaults") return runAddConfigDefaults(options);
  throw new Error(`mode not implemented yet: ${options.mode}`);
}

/** Write the pure-default configs, creating only the ones that do not exist yet (never overwrites). */
async function runAddConfigDefaults(options: RunOptions): Promise<RunReport> {
  const raw = await readRawConfigs(options.cwd);
  const created: string[] = [];
  if (raw.editorconfig === null) created.push((await writeEditorconfig(options.cwd, defaultEditorconfig(), options.dryRun)).path);
  if (raw.gitattributes === null) created.push((await writeGitattributes(options.cwd, defaultGitattributes(), options.dryRun)).path);
  return { mode: "add-config-defaults", dryRun: options.dryRun, created, modified: [] };
}

async function runAudit(options: RunOptions): Promise<RunReport> {
  const config = interpretConfigs(await readRawConfigs(options.cwd));
  const reports: { path: string; report: FormatReport }[] = [];
  const skipped: AuditResult["skipped"] = [];
  for (const path of await listTrackedFiles(options.cwd)) {
    const read = await readForAudit(options.cwd, path, config.resolve(path).eol === "binary");
    if ("skip" in read) skipped.push({ path, reason: read.skip });
    else reports.push({ path, report: analyzeContent(read.content) });
  }
  const nativeEol = process.platform === "win32" ? "crlf" : "lf";
  return { mode: "audit", dryRun: options.dryRun, created: [], modified: [], audit: { files: audit(reports, config, nativeEol), skipped } };
}
