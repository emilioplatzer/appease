import type { DeviationAxis, FileAudit, FormatReport, IndexEol, ProjectConfig, ResolvedFileConfig } from "./types.js";

/**
 * Whether a file is stored in the git index with CRLF although the config says it is text: git keeps it
 * that way (even under `text=auto`) until it is renormalized. Not evaluated when the EOL is unresolved or binary.
 */
export function needsRepoRenormalization(cfg: ResolvedFileConfig, indexEol: IndexEol | undefined): boolean {
  if (cfg.unresolved.includes("eol") || cfg.eol === "binary") return false;
  return indexEol === "crlf" || indexEol === "mixed";
}

/**
 * Evaluate a collection of per-file analyses against the resolved project
 * config. Pure. Returns one `FileAudit` per file that has any finding
 * (deviation or unresolved axis); clean files are omitted.
 *
 * `nativeEol` is this machine's native line ending (CRLF on Windows, LF
 * elsewhere); it is how `eol=auto` is evaluated, since under `text=auto` the
 * working copy is expected to be native. The pure core receives it as input.
 * `indexEol` (optional) is how git stores the file in the index; it drives the `repoEol` deviation.
 */
export function audit(
  reports: { path: string; report: FormatReport; indexEol?: IndexEol }[],
  config: ProjectConfig,
  nativeEol: "lf" | "crlf",
): FileAudit[] {
  const files: FileAudit[] = [];
  for (const { path, report, indexEol } of reports) {
    const cfg = config.resolve(path);
    const deviations = fileDeviations(report, cfg, nativeEol);
    if (needsRepoRenormalization(cfg, indexEol)) deviations.push("repoEol");
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
