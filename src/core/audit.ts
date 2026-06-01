import type { AuditResult, ExceptionEntry, FormatReport, ProjectConfig } from "./types.js";

/**
 * Evaluate a collection of per-file analyses against the resolved project
 * config, producing the list of deviations per axis and per file.
 */
export function audit(reports: { path: string; report: FormatReport }[], config: ProjectConfig): AuditResult {
  void reports; // scaffold: parameters wired but unused until implemented
  void config;
  // TODO(scaffold): compare each FormatReport against config.resolve(path).
  throw new Error("audit: not implemented");
}

/**
 * Turn an audit result into the explicit exceptions that `--adapt-configs`
 * writes, so that a subsequent `--fix-format` changes nothing (the safety
 * invariant): one exception per deviation, multi-axis when needed, routed to
 * the config file that owns each axis.
 */
export function deviationsToExceptions(result: AuditResult): ExceptionEntry[] {
  void result; // scaffold: parameter wired but unused until implemented
  // TODO(scaffold): map deviations to ExceptionEntry[] (owner per axis).
  throw new Error("exceptionsFromAudit: not implemented");
}
