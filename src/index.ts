// Public API for appease. Consumable from Node and exercised by the CLI and tests.

import { analyzeContent } from "./core/analyze.js";
import { audit, needsRepoRenormalization } from "./core/audit.js";
import { defaultEditorconfig, defaultGitattributes, defaultVscodeSettings, interpretConfigs } from "./core/configs.js";
import { buildExceptions, mergeEditorconfig, mergeGitattributes } from "./core/merge.js";
import type { AuditedFile } from "./core/merge.js";
import { normalizeText } from "./core/normalize.js";
import { AppeaseError } from "./core/errors.js";
import type { AppeaseMessage } from "./core/errors.js";
import type { AuditResult, DeviationAxis, FormatReport, IndexEol, NormalizeOptions, ProjectConfig, RenormalizeSkipReason, ResolvedFileConfig, RunOptions, RunReport } from "./core/types.js";
import { readRawConfigs, writeEditorconfig, writeGitattributes, writeVscodeSettings } from "./io/configs.js";
import { hasUncommittedChanges, listIndexEol, listTrackedFiles, readForAudit, renormalizeIndexEol, writeText } from "./io/files.js";
import { parse, modify, applyEdits } from "jsonc-parser";

export * from "./core/types.js";
export { AppeaseError } from "./core/errors.js";
export type { AppeaseMessage } from "./core/errors.js";
export { messages, i18n } from "./messages.js";
export { analyzeContent } from "./core/analyze.js";
export { normalizeText } from "./core/normalize.js";
export { interpretConfigs, defaultEditorconfig, defaultGitattributes, defaultVscodeSettings } from "./core/configs.js";
export { readRawConfigs, writeEditorconfig, writeGitattributes, writeVscodeSettings } from "./io/configs.js";
export { audit } from "./core/audit.js";

/**
 * Run a full appease operation according to `options.mode`:
 * - `audit`               : report deviations only (no writes).
 * - `add-config-defaults` : write pure-default configs (no inspection).
 * - `adapt-configs`       : write/adapt configs to reflect the repo's reality.
 * - `fix-format`          : normalize files (BOM/EOL/trailing/newline) and, confirming file by file,
 *                           renormalize in the git index the text files stored there with CRLF.
 *
 * Orchestrates the effects (git ls-files, file I/O) around the pure core.
 */
export async function runAppease(options: RunOptions): Promise<RunReport> {
  if (options.mode === "audit") return runAudit(options);
  if (options.mode === "add-config-defaults") return runAddConfigDefaults(options);
  if (options.mode === "adapt-configs") return runAdaptConfigs(options);
  return runFixFormat(options);
}

/** This machine's native line ending — how `text=auto` resolves in the working tree. */
function nativeEol(): "lf" | "crlf" {
  return process.platform === "win32" ? "crlf" : "lf";
}

/** Re-end a generated (canonical LF) config in the OS-native EOL, so the written file is native. */
function toNativeEol(content: string): string {
  return normalizeText(content, { bom: "keep", eol: nativeEol(), trailing: "keep", finalNewline: "keep" });
}

/** Parse JSON with comments (JSONC) and trailing commas safely. */
export function parseJsonc(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const result = parse(text);
  if (result === undefined) {
    throw new AppeaseError("invalidVscodeSettings");
  }
  return result;
}

/** Merge default settings into an existing JSONC string, preserving all comments and other formatting. */
export function mergeVscodeSettingsJsonc(text: string, defaults: Record<string, unknown>): { content: string; changed: boolean } {
  const parsed = parseJsonc(text);
  let content = text;
  let changed = false;

  for (const [key, value] of Object.entries(defaults)) {
    if (parsed[key] === value) {
      continue;
    }
    const edits = modify(content, [key], value, {
      formattingOptions: { insertSpaces: true, tabSize: 2 }
    });
    content = applyEdits(content, edits);
    changed = true;
  }

  return { content, changed };
}

/**
 * Create the default `.vscode/settings.json` when absent, else merge the defaults into the existing
 * file (preserving its comments and formatting). Records the outcome in the given buckets. Shared by
 * `add-config-defaults` and `adapt-configs`.
 */
async function applyVscodeDefaults(
  cwd: string,
  rawVscodeSettings: string | null,
  dryRun: boolean,
  buckets: { created: string[]; modified: string[]; unchanged: string[] },
): Promise<void> {
  const defaults = defaultVscodeSettings();
  if (rawVscodeSettings === null) {
    const formatted = toNativeEol(JSON.stringify(defaults, null, 2) + "\n");
    const res = await writeVscodeSettings(cwd, formatted, dryRun);
    buckets.created.push(res.path);
  } else {
    const { content, changed } = mergeVscodeSettingsJsonc(rawVscodeSettings, defaults);
    if (changed) {
      const res = await writeVscodeSettings(cwd, toNativeEol(content), dryRun);
      if (res.modified) {
        buckets.modified.push(res.path);
      } else {
        buckets.unchanged.push(res.path);
      }
    } else {
      buckets.unchanged.push(".vscode/settings.json");
    }
  }
}

/** Write the pure-default configs, creating only the ones that do not exist yet (never overwrites). */
async function runAddConfigDefaults(options: RunOptions): Promise<RunReport> {
  const raw = await readRawConfigs(options.cwd);
  const created: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  if (raw.editorconfig === null) created.push((await writeEditorconfig(options.cwd, toNativeEol(defaultEditorconfig()), options.dryRun)).path);
  else unchanged.push(".editorconfig");

  if (raw.gitattributes === null) created.push((await writeGitattributes(options.cwd, toNativeEol(defaultGitattributes()), options.dryRun)).path);
  else unchanged.push(".gitattributes");

  await applyVscodeDefaults(options.cwd, raw.vscodeSettings, options.dryRun, { created, modified, unchanged });

  return { mode: "add-config-defaults", dryRun: options.dryRun, created, modified, unchanged };
}

/** Discover tracked files, skip binaries/non-UTF-8, and analyze the rest (with how git stores each one). */
async function collectReports(cwd: string, config: ProjectConfig): Promise<{ reports: { path: string; report: FormatReport; indexEol?: IndexEol }[]; notAnalyzed: AuditResult["notAnalyzed"] }> {
  const reports: { path: string; report: FormatReport; indexEol?: IndexEol }[] = [];
  const notAnalyzed: AuditResult["notAnalyzed"] = [];
  const indexEols = await listIndexEol(cwd);
  for (const path of await listTrackedFiles(cwd)) {
    const read = await readForAudit(cwd, path, config.resolve(path).eol === "binary");
    if ("skip" in read) notAnalyzed.push({ path, reason: read.skip });
    else {
      const indexEol = indexEols.get(path);
      reports.push(indexEol === undefined ? { path, report: analyzeContent(read.content) } : { path, report: analyzeContent(read.content), indexEol });
    }
  }
  return { reports, notAnalyzed };
}

async function runAudit(options: RunOptions): Promise<RunReport> {
  const config = interpretConfigs(await readRawConfigs(options.cwd));
  const { reports, notAnalyzed } = await collectReports(options.cwd, config);
  const warnings: AppeaseMessage[] = (await hasUncommittedChanges(options.cwd)) ? [{ key: "uncommittedChanges", params: [] }] : [];
  const findings = audit(reports, config, nativeEol());
  return { mode: "audit", dryRun: options.dryRun, created: [], modified: [], unchanged: [], audit: { findings, notAnalyzed, summary: { findings: findings.length, notAnalyzed: notAnalyzed.length } }, warnings };
}

/**
 * Establish the default configs as a baseline (in memory if absent), audit the repo
 * against it, and merge an exception for every deviation so a later `--fix-format`
 * changes nothing. Existing config content is preserved; new exceptions are appended.
 */
async function runAdaptConfigs(options: RunOptions): Promise<RunReport> {
  const raw = await readRawConfigs(options.cwd);
  const editorconfigBase = raw.editorconfig ?? toNativeEol(defaultEditorconfig());
  const gitattributesBase = raw.gitattributes ?? toNativeEol(defaultGitattributes());
  const config = interpretConfigs({ editorconfig: editorconfigBase, gitattributes: gitattributesBase, vscodeSettings: raw.vscodeSettings });

  const { reports } = await collectReports(options.cwd, config);
  const deviationsByPath = new Map(audit(reports, config, nativeEol()).map((finding) => [finding.path, finding.deviations]));
  const audited: AuditedFile[] = reports.flatMap((report) => {
    const deviations = deviationsByPath.get(report.path);
    return deviations !== undefined ? [{ path: report.path, report: report.report, deviations }] : [];
  });
  const exceptions = buildExceptions(audited);

  const results = [
    await writeEditorconfig(options.cwd, mergeEditorconfig(editorconfigBase, exceptions.editorconfig), options.dryRun),
    await writeGitattributes(options.cwd, mergeGitattributes(gitattributesBase, exceptions.gitattributes), options.dryRun),
  ];
  const created = results.filter((r) => r.created).map((r) => r.path);
  const modified = results.filter((r) => !r.created && r.modified).map((r) => r.path);
  const unchanged = results.filter((r) => !r.created && !r.modified).map((r) => r.path);
  await applyVscodeDefaults(options.cwd, raw.vscodeSettings, options.dryRun, { created, modified, unchanged });
  return { mode: "adapt-configs", dryRun: options.dryRun, created, modified, unchanged };
}

/**
 * Normalize each tracked file's content (BOM / EOL / trailing / final newline) per its resolved
 * config, skipping axes the config could not resolve (case 2). EOL is written directly into the
 * working tree (`eol=auto` resolves to this machine's native ending), matching what `--audit` checks.
 * Then the text files stored with CRLF in the git index (the `repoEol` deviation) are renormalized there,
 * each one only if `options.confirmRenormalize` confirms it (under `--dry-run` they are only listed).
 */
async function runFixFormat(options: RunOptions): Promise<RunReport> {
  const config = interpretConfigs(await readRawConfigs(options.cwd));
  const native = nativeEol();
  const modified: string[] = [];
  const indexEols = await listIndexEol(options.cwd);
  const toRenormalize: string[] = [];
  for (const path of await listTrackedFiles(options.cwd)) {
    const resolved = config.resolve(path);
    const read = await readForAudit(options.cwd, path, resolved.eol === "binary");
    if ("skip" in read) continue;
    const normalized = normalizeText(read.content, fixOptions(resolved, native));
    if (normalized !== read.content) {
      if (!options.dryRun) await writeText(options.cwd, path, normalized);
      modified.push(path);
    }
    if (needsRepoRenormalization(resolved, indexEols.get(path))) toRenormalize.push(path);
  }
  const renormalized: string[] = [];
  const notRenormalized: { path: string; reason: RenormalizeSkipReason }[] = [];
  for (const path of toRenormalize) {
    if (options.dryRun) {
      renormalized.push(path);
      continue;
    }
    const confirmation = options.confirmRenormalize === undefined ? { confirmed: false, reason: "disabled" as const } : await options.confirmRenormalize(path);
    if (confirmation.confirmed) {
      await renormalizeIndexEol(options.cwd, path);
      renormalized.push(path);
    } else {
      notRenormalized.push({ path, reason: confirmation.reason ?? "declined" });
    }
  }
  return { mode: "fix-format", dryRun: options.dryRun, created: [], modified, unchanged: [], renormalized, notRenormalized };
}

/** Map a resolved config to normalizer options: skip case-2 axes; resolve `eol=auto` to native. */
function fixOptions(resolved: ResolvedFileConfig, native: "lf" | "crlf"): NormalizeOptions {
  const enforce = (axis: DeviationAxis): boolean => !resolved.unresolved.includes(axis);
  const eol: NormalizeOptions["eol"] =
    !enforce("eol") || resolved.eol === "binary" ? "keep" : resolved.eol === "auto" ? native : resolved.eol;
  return {
    bom: enforce("bom") ? resolved.bom : "keep",
    eol,
    trailing: enforce("trailing") ? resolved.trailing : "keep",
    finalNewline: enforce("finalNewline") ? resolved.finalNewline : "keep",
  };
}
