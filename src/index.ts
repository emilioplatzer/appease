// Public API for appease. Consumable from Node and exercised by the CLI and tests.

import { analyzeContent } from "./core/analyze.js";
import { audit } from "./core/audit.js";
import { defaultEditorconfig, defaultGitattributes, defaultVscodeSettings, interpretConfigs } from "./core/configs.js";
import { buildExceptions, mergeEditorconfig, mergeGitattributes } from "./core/merge.js";
import type { AuditedFile } from "./core/merge.js";
import { normalizeText } from "./core/normalize.js";
import type { AuditResult, DeviationAxis, FormatReport, NormalizeOptions, ProjectConfig, ResolvedFileConfig, RunOptions, RunReport } from "./core/types.js";
import { readRawConfigs, writeEditorconfig, writeGitattributes, writeVscodeSettings } from "./io/configs.js";
import { hasUncommittedChanges, listTrackedFiles, readForAudit, writeText } from "./io/files.js";
import { parse, modify, applyEdits } from "jsonc-parser";

export * from "./core/types.js";
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
 * - `fix-format`          : normalize files (BOM/trailing/newline; EOL via Git).
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
export function parseJsonc(text: string): Record<string, any> {
  if (!text.trim()) return {};
  const result = parse(text);
  if (result === undefined) {
    throw new Error("Failed to parse JSON settings file: content is not valid JSONC");
  }
  return result;
}

/** Merge default settings into an existing JSONC string, preserving all comments and other formatting. */
export function mergeVscodeSettingsJsonc(text: string, defaults: Record<string, any>): { content: string; changed: boolean } {
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

  const defaults = defaultVscodeSettings();
  if (raw.vscodeSettings === null) {
    const formatted = toNativeEol(JSON.stringify(defaults, null, 2) + "\n");
    const res = await writeVscodeSettings(options.cwd, formatted, options.dryRun);
    created.push(res.path);
  } else {
    const { content, changed } = mergeVscodeSettingsJsonc(raw.vscodeSettings, defaults);
    if (changed) {
      const res = await writeVscodeSettings(options.cwd, toNativeEol(content), options.dryRun);
      if (res.modified) {
        modified.push(res.path);
      } else {
        unchanged.push(res.path);
      }
    } else {
      unchanged.push(".vscode/settings.json");
    }
  }

  return { mode: "add-config-defaults", dryRun: options.dryRun, created, modified, unchanged };
}

/** Discover tracked files, skip binaries/non-UTF-8, and analyze the rest. */
async function collectReports(cwd: string, config: ProjectConfig): Promise<{ reports: { path: string; report: FormatReport }[]; notAnalyzed: AuditResult["notAnalyzed"] }> {
  const reports: { path: string; report: FormatReport }[] = [];
  const notAnalyzed: AuditResult["notAnalyzed"] = [];
  for (const path of await listTrackedFiles(cwd)) {
    const read = await readForAudit(cwd, path, config.resolve(path).eol === "binary");
    if ("skip" in read) notAnalyzed.push({ path, reason: read.skip });
    else reports.push({ path, report: analyzeContent(read.content) });
  }
  return { reports, notAnalyzed };
}

async function runAudit(options: RunOptions): Promise<RunReport> {
  const config = interpretConfigs(await readRawConfigs(options.cwd));
  const { reports, notAnalyzed } = await collectReports(options.cwd, config);
  const warnings = (await hasUncommittedChanges(options.cwd))
    ? ["repository has uncommitted changes; the audit reflects the current working tree, not a committed state"]
    : [];
  return { mode: "audit", dryRun: options.dryRun, created: [], modified: [], unchanged: [], audit: { findings: audit(reports, config, nativeEol()), notAnalyzed }, warnings };
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
  return { mode: "adapt-configs", dryRun: options.dryRun, created, modified, unchanged };
}

/**
 * Normalize each tracked file's content (BOM / EOL / trailing / final newline) per its resolved
 * config, skipping axes the config could not resolve (case 2). EOL is written directly into the
 * working tree (`eol=auto` resolves to this machine's native ending), matching what `--audit` checks.
 */
async function runFixFormat(options: RunOptions): Promise<RunReport> {
  const config = interpretConfigs(await readRawConfigs(options.cwd));
  const native = nativeEol();
  const modified: string[] = [];
  for (const path of await listTrackedFiles(options.cwd)) {
    const resolved = config.resolve(path);
    const read = await readForAudit(options.cwd, path, resolved.eol === "binary");
    if ("skip" in read) continue;
    const normalized = normalizeText(read.content, fixOptions(resolved, native));
    if (normalized !== read.content) {
      if (!options.dryRun) await writeText(options.cwd, path, normalized);
      modified.push(path);
    }
  }
  return { mode: "fix-format", dryRun: options.dryRun, created: [], modified, unchanged: [] };
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
