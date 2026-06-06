import type { DeviationAxis, FileAudit, FormatReport, ProjectConfig, ResolvedFileConfig } from "./types.js";

/**
 * Evaluate a collection of per-file analyses against the resolved project
 * config. Pure. Returns one `FileAudit` per file that has any finding
 * (deviation or unresolved axis); clean files are omitted.
 *
 * `nativeEol` is this machine's native line ending (CRLF on Windows, LF
 * elsewhere); it is how `eol=auto` is evaluated, since under `text=auto` the
 * working copy is expected to be native. The pure core receives it as input.
 */
export function audit(
  reports: { path: string; report: FormatReport }[],
  config: ProjectConfig,
  nativeEol: "lf" | "crlf",
): FileAudit[] {
  const files: FileAudit[] = [];
  for (const { path, report } of reports) {
    const cfg = config.resolve(path);
    const deviations = fileDeviations(report, cfg, nativeEol);
    if (deviations.length > 0 || cfg.unresolved.length > 0) files.push({ path, deviations, unresolved: cfg.unresolved });
  }
  return files;
}

/** Axes where `report` differs from `cfg`, skipping axes the config could not resolve (case 2). */
function fileDeviations(report: FormatReport, cfg: ResolvedFileConfig, nativeEol: "lf" | "crlf"): DeviationAxis[] {
  const deviations: DeviationAxis[] = [];
  const governs = (axis: DeviationAxis): boolean => !cfg.unresolved.includes(axis);

  if (governs("bom")) {
    if (cfg.bom === "add" && !report.hasBom) deviations.push("bom");
    else if (cfg.bom === "remove" && report.hasBom) deviations.push("bom");
  }
  if (governs("trailing") && cfg.trailing === "trim" && report.hasTrailingSpaces) {
    deviations.push("trailing");
  }
  if (governs("finalNewline") && cfg.finalNewline === "ensure" && report.finalNewline !== "present") {
    deviations.push("finalNewline");
  }
  if (governs("eol")) {
    const target = cfg.eol === "auto" ? nativeEol : cfg.eol;
    if (target === "lf" && (report.hasCrlf || report.hasCr)) deviations.push("eol");
    else if (target === "crlf" && (report.hasLf || report.hasCr)) deviations.push("eol");
    // "binary" -> EOL is not evaluated
  }
  return deviations;
}
