// Strongly-typed contracts for appease (brand: "normalificador").
// No `any`. Every type here is shared between the pure core and the orchestration (CLI).

/** End-of-line style detected in (or required for) a file. `none` = no line breaks at all. */
export type Eol = "lf" | "crlf" | "mixed" | "none";

/** Indentation convention detected in a file. */
export type IndentStyle = "tabs" | "spaces" | "mixed" | "none";

/** Final-newline state of a file. */
export type FinalNewline = "present" | "missing" | "multiple";

// ---------------------------------------------------------------------------
// Pure analysis (audit core): current state of a single file's content.
// ---------------------------------------------------------------------------

/** Result of analyzing one file's already-decoded text. Pure, side-effect free. */
export interface FormatReport {
  /** File has no content at all. */
  empty: boolean;
  /** UTF-8 BOM present at the start of the content. */
  bom: boolean;
  /** EOL style across the whole file. */
  eol: Eol;
  /** Trailing whitespace, with the (1-based) line numbers affected. */
  trailing: { present: boolean; lines: number[] };
  /** Final-newline state. */
  finalNewline: FinalNewline;
  /** Indentation convention plus the detected indent size (null when undetectable). */
  indent: { style: IndentStyle; size: number | null };
}

// ---------------------------------------------------------------------------
// Pure normalization: how to transform one file's content.
// ---------------------------------------------------------------------------

/** Resolved per-file options driving the pure normalizer. */
export interface NormalizeOptions {
  /** Add, remove, or leave the UTF-8 BOM. */
  bom: "add" | "remove" | "keep";
  /** Normalize line endings to a single style, or leave as-is. */
  eol: "lf" | "crlf" | "keep";
  /** Trim trailing whitespace, or leave it. */
  trailing: "trim" | "keep";
  /** Ensure exactly one final newline, or leave as-is. */
  finalNewline: "ensure" | "keep";
}

/** What the normalizer changed (so nothing fails silently). */
export interface NormalizeReport {
  changed: boolean;
  bom: "added" | "removed" | "unchanged";
  eol: "converted" | "unchanged";
  trailing: "trimmed" | "unchanged";
  finalNewline: "added" | "removed-extra" | "unchanged";
}

export interface NormalizeResult {
  content: string;
  report: NormalizeReport;
}

// ---------------------------------------------------------------------------
// Project configuration (resolved from .editorconfig / .gitattributes / .vscode).
// ---------------------------------------------------------------------------

/** Charset policy as expressed by `.editorconfig`. */
export type Charset = "utf-8" | "utf-8-bom" | "unset";

/** Options resolved for a single file from the project config. */
export interface ResolvedFileConfig {
  charset: Charset;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  indentStyle: "space" | "tab" | "unset";
  indentSize: number;
  /** EOL handling as declared by Git for this path (or `auto` for the `text=auto` default). */
  eol: "lf" | "crlf" | "auto" | "binary";
}

/** Parsed, not-yet-resolved project configuration. */
export interface ProjectConfig {
  /** Whether each config source was found on disk. */
  present: { editorconfig: boolean; gitattributes: boolean; vscodeSettings: boolean };
  /** Resolve the effective options for a given repo-relative path. */
  resolve(path: string): ResolvedFileConfig;
}

// ---------------------------------------------------------------------------
// Audit / evaluation.
// ---------------------------------------------------------------------------

/** Axis along which a file deviates from its resolved config. */
export type DeviationAxis = "bom" | "eol" | "trailing" | "finalNewline" | "indent";

/** A single file's deviations against the resolved config. */
export interface FileAudit {
  path: string;
  deviations: DeviationAxis[];
}

/** Full audit result. `--audit` prints this as canonical JSON. */
export interface AuditResult {
  files: FileAudit[];
  /** Files skipped (binary / `-text` / non-UTF-8), with the reason. */
  skipped: { path: string; reason: "binary-extension" | "binary-content" | "gitattributes-notext" | "non-utf8" }[];
}

/** An explicit exception written by `--adapt-configs` to protect a real deviation. */
export interface ExceptionEntry {
  /** Owning config file: EOL lives in .gitattributes, everything else in .editorconfig. */
  owner: "editorconfig" | "gitattributes";
  /** The glob / path the exception applies to. */
  pattern: string;
  /** Axes this exception covers. */
  axes: DeviationAxis[];
}

// ---------------------------------------------------------------------------
// CLI / run options and report.
// ---------------------------------------------------------------------------

export type RunMode = "audit" | "add-config-defaults" | "adapt-configs" | "fix-format";

/** Options for a full appease run (CLI -> public API). */
export interface RunOptions {
  mode: RunMode;
  /** Repository root to operate on. */
  cwd: string;
  /** Simulate writes; report what would change but touch nothing. */
  dryRun: boolean;
  /** Skip interactive confirmations for destructive operations. */
  yes: boolean;
  /** Verbose logging. */
  verbose: boolean;
  /** Opt-in EOL normalization in `--fix-format` (e.g. `git add --renormalize .`). */
  applyEol: boolean;
}

/** Outcome of a run: which files were created/modified, plus mode-specific payload. */
export interface RunReport {
  mode: RunMode;
  /** Whether disk was actually touched (false under `--dry-run`). */
  dryRun: boolean;
  created: string[];
  modified: string[];
  /** Present for `--audit`. */
  audit?: AuditResult;
}
