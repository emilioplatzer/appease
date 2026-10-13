// Reporters of the audit result: compact text (one file per line) and JSON (`--json`).

import type { AuditResult } from "./core/types.js";
import type { MessageKey } from "./messages.js";

type Message = (key: MessageKey, ...params: (string | number)[]) => string;

/**
 * The path as-is, or quoted (JSON escapes) when it could be confused with the separators of the text format:
 * whitespace, control characters, `"`, `;` or `:`. Any of them can appear in a path tracked by git.
 */
export function quotePath(path: string): string {
  return /[\s\p{Cc}";:]/u.test(path) ? JSON.stringify(path) : path;
}

/**
 * One file per line, for reading (not meant to be parsed: that is what `--json` is for). Empty sections and
 * empty parts are omitted; the last line has the totals (a clean repo prints only that line).
 */
export function auditText(audit: AuditResult, message: Message): string {
  const lines: string[] = [];
  if (audit.findings.length > 0) {
    lines.push(`${message("auditFindings")}:`);
    for (const { path, deviations, unresolved } of audit.findings) {
      const parts = [quotePath(path)];
      if (deviations.length > 0) parts.push(`${message("auditDeviations")}: ${deviations.join(", ")}`);
      if (unresolved.length > 0) parts.push(`${message("auditUnresolved")}: ${unresolved.join(", ")}`);
      lines.push(`  ${parts.join("; ")}`);
    }
  }
  if (audit.notAnalyzed.length > 0) {
    lines.push(`${message("auditNotAnalyzed")}:`);
    for (const { path, reason } of audit.notAnalyzed) lines.push(`  ${quotePath(path)}: ${reason}`);
  }
  lines.push(message("findings1NotAnalyzed2", audit.summary.findings, audit.summary.notAnalyzed));
  return lines.map((line) => `${line}\n`).join("");
}

/** Drop empty `unresolved` arrays from the audit JSON (an empty list carries no information). */
function omitEmptyUnresolved(key: string, value: unknown): unknown {
  return key === "unresolved" && Array.isArray(value) && value.length === 0 ? undefined : value;
}

/** The audit JSON, headed by the version of appease and the kind of report. Not translated. */
export function auditJson(audit: AuditResult, version: string): string {
  return `${JSON.stringify({ appease: version, report: "audit", ...audit }, omitEmptyUnresolved, 2)}\n`;
}
