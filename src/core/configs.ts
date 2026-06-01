import type { ProjectConfig, RawConfigs } from "./types.js";

/**
 * Interpret the raw contents of the three config sources into a resolver for
 * per-file options. Pure: takes the already-read contents, touches no disk.
 *
 * Each axis is owned by exactly one source (see LEEME.md): EOL -> .gitattributes,
 * BOM/charset/trailing/final-newline/indent -> .editorconfig, renderWhitespace
 * -> .vscode/settings.json. Only `.editorconfig` and `.gitattributes` drive
 * `resolve`; `.vscode/settings.json` only counts towards `present`.
 */
export function interpretConfigs(raw: RawConfigs): ProjectConfig {
  void raw; // scaffold: parameter wired but unused until implemented
  // TODO(scaffold): parse .editorconfig (sections by glob) and .gitattributes
  // (text / eol / -text rules); build the per-path resolver.
  throw new Error("interpretConfigs: not implemented");
}

/** Pure, idempotent defaults for `.editorconfig` (no inspection of the repo's reality). */
export function defaultEditorconfig(): string {
  // TODO(scaffold): render the canonical default .editorconfig (see LEEME.md).
  throw new Error("defaultEditorconfig: not implemented");
}

/** Pure, idempotent defaults for `.gitattributes` (`* text=auto`, ...). */
export function defaultGitattributes(): string {
  // TODO(scaffold): render the canonical default .gitattributes.
  throw new Error("defaultGitattributes: not implemented");
}
