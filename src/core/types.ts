// Strongly-typed contracts for appease (brand: "normalificador").
// No `any`. Every type here is shared between the pure core and the orchestration (CLI).

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
  hasBom: boolean;
  // EOL is reported as three independent facts; "mixed" is two or more of them true.
  /** At least one CRLF line ending. */
  hasCrlf: boolean;
  /** At least one lone-LF line ending (LF not preceded by CR). */
  hasLf: boolean;
  /** At least one lone-CR line ending (CR not followed by LF; classic pre-OSX Mac). */
  hasCr: boolean;
  /** At least one line with trailing whitespace. */
  hasTrailingSpaces: boolean;
  /** Final-newline state. */
  finalNewline: FinalNewline;
  // Indentation detection is deferred to the future `--tabs-*` work (convention-only,
  // not rewritten by `--fix-format`).
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

// ---------------------------------------------------------------------------
// Project configuration (resolved from .editorconfig / .gitattributes / .vscode).
// ---------------------------------------------------------------------------

/**
 * Options resolved for a single file from the project config. Aligned with the
 * normalizer's actions, so `--fix-format` can drive `normalizeText` directly.
 */
export interface ResolvedFileConfig {
  /** From `.editorconfig` charset: `utf-8-bom`->add, `utf-8`->remove, unset/keep->keep. */
  bom: "add" | "remove" | "keep";
  /** From `.gitattributes` (or `auto` for the `text=auto` default; `binary` = not normalized). */
  eol: "lf" | "crlf" | "auto" | "binary";
  trailing: "trim" | "keep";
  finalNewline: "ensure" | "keep";
  /** Axes governed by an unrecognized config value (case 2): skip + report, never normalize. */
  unresolved: DeviationAxis[];
}

/** Raw, unparsed contents of the three config sources. `null` = file absent (vs `""` = present but empty). */
export interface RawConfigs {
  editorconfig: string | null;
  gitattributes: string | null;
  vscodeSettings: string | null;
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
export type DeviationAxis = "bom" | "eol" | "trailing" | "finalNewline";

/** A single file's findings against the resolved config (only files with findings are listed). */
export interface FileAudit {
  path: string;
  /** Axes where the file differs from what the config asks for. */
  deviations: DeviationAxis[];
  /** Axes governed by an unrecognized config value (case 2): not evaluated, reported as-is. */
  unresolved: DeviationAxis[];
}

/** Full audit result. `--audit` prints this as canonical JSON. */
export interface AuditResult {
  /** Analyzed files that deviate from their resolved config (conforming files are omitted). */
  findings: FileAudit[];
  /** Files not analyzed (binary / `-text` / non-UTF-8), with the reason. */
  notAnalyzed: { path: string; reason: "binary-extension" | "binary-content" | "gitattributes-notext" | "non-utf8" }[];
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
}

/** Outcome of a run: which files were created/modified, plus mode-specific payload. */
export interface RunReport {
  mode: RunMode;
  /** Whether disk was actually touched (false under `--dry-run`). */
  dryRun: boolean;
  created: string[];
  modified: string[];
  /** Files considered but left untouched (e.g. a config that already existed). */
  unchanged: string[];
  /** Present for `--audit`. */
  audit?: AuditResult;
}
