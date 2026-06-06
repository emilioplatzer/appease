import type { DeviationAxis, FormatReport } from "./types.js";

/** One audited file with findings, ready to turn into config exceptions. */
export interface AuditedFile {
  path: string;
  report: FormatReport;
  deviations: DeviationAxis[];
}

/** A `.editorconfig` exception: a section locking some axes to "don't enforce". */
export interface EditorconfigException {
  pattern: string;
  properties: string[];
}

/** A `.gitattributes` exception: a rule line fixing or locking the EOL. */
export interface GitattributesException {
  pattern: string;
  attrs: string;
}

export interface ConfigExceptions {
  editorconfig: EditorconfigException[];
  gitattributes: GitattributesException[];
}

/** The "don't enforce" value written for each editorconfig-owned axis. */
const EDITORCONFIG_PROPERTY: Record<"bom" | "trailing" | "finalNewline", string> = {
  bom: "charset = unset",
  trailing: "trim_trailing_whitespace = false",
  finalNewline: "insert_final_newline = false",
};

/**
 * Turn audited deviations into the concrete config exceptions that `--adapt-configs`
 * records, so a later `--fix-format` changes nothing. EOL is routed to `.gitattributes`
 * using the file's actual ending; a mixed/lone-CR file goes `-text` (byte-for-byte) and
 * is therefore protected whole, so it gets no `.editorconfig` exception.
 */
export function buildExceptions(files: AuditedFile[]): ConfigExceptions {
  const editorconfig: EditorconfigException[] = [];
  const gitattributes: GitattributesException[] = [];
  for (const file of files) {
    let binary = false;
    if (file.deviations.includes("eol")) {
      const attrs = eolAttrs(file.report);
      gitattributes.push({ pattern: file.path, attrs });
      binary = attrs === "-text";
    }
    if (!binary) {
      const properties = file.deviations.filter(isEditorconfigAxis).map((axis) => EDITORCONFIG_PROPERTY[axis]);
      if (properties.length > 0) editorconfig.push({ pattern: file.path, properties });
    }
  }
  return { editorconfig, gitattributes };
}

/** The `.gitattributes` attributes that lock a file's current EOL. */
function eolAttrs(report: FormatReport): string {
  if (report.hasLf && !report.hasCrlf && !report.hasCr) return "text eol=lf";
  if (report.hasCrlf && !report.hasLf && !report.hasCr) return "text eol=crlf";
  return "-text"; // mixed or lone CR: no clean eol=, lock byte-for-byte
}

function isEditorconfigAxis(axis: DeviationAxis): axis is "bom" | "trailing" | "finalNewline" {
  return axis !== "eol";
}

/**
 * Append `.editorconfig` exception sections to the existing content, preserving
 * everything already there. Idempotent: a pattern that already has a section is
 * skipped. New sections use the file's own EOL.
 */
export function mergeEditorconfig(existing: string, exceptions: EditorconfigException[]): string {
  const present = sectionPatterns(existing);
  const toAdd = exceptions.filter((exception) => !present.has(exception.pattern));
  if (toAdd.length === 0) return existing;
  const eol = detectEol(existing);
  const sections = toAdd.map((exception) => [`[${exception.pattern}]`, ...exception.properties].join(eol));
  return append(existing, sections.join(eol + eol), eol);
}

/**
 * Append `.gitattributes` exception lines to the existing content, preserving
 * everything already there. Idempotent: a pattern that already has a rule is skipped.
 */
export function mergeGitattributes(existing: string, exceptions: GitattributesException[]): string {
  const present = gitattributesPatterns(existing);
  const toAdd = exceptions.filter((exception) => !present.has(exception.pattern));
  if (toAdd.length === 0) return existing;
  const eol = detectEol(existing);
  const lines = toAdd.map((exception) => `${exception.pattern} ${exception.attrs}`);
  return append(existing, lines.join(eol), eol);
}

/** Patterns of existing `[glob]` sections. */
function sectionPatterns(content: string): Set<string> {
  const patterns = new Set<string>();
  for (const raw of content.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line.startsWith("[") && line.endsWith("]")) patterns.add(line.slice(1, -1));
  }
  return patterns;
}

/** Patterns (first token) of existing `.gitattributes` rules. */
function gitattributesPatterns(content: string): Set<string> {
  const patterns = new Set<string>();
  for (const raw of content.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line !== "" && !line.startsWith("#")) patterns.add(line.split(/\s+/)[0]);
  }
  return patterns;
}

/** The file's existing EOL (LF/CRLF), defaulting to LF. */
function detectEol(content: string): string {
  return content.match(/\r\n|\n/)?.[0] ?? "\n";
}

/** Append `addition` after the existing content, separated by a blank line, ending with one EOL. */
function append(existing: string, addition: string, eol: string): string {
  const base = existing.replace(/(?:\r\n|\r|\n)*$/, "");
  return (base === "" ? "" : base + eol + eol) + addition + eol;
}
