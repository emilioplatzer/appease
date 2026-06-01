import type { ExceptionEntry, ProjectConfig } from "./types.js";

/**
 * Read and parse the project's config sources (.editorconfig, .gitattributes,
 * .vscode/settings.json) from `cwd`, returning a resolver for per-file options.
 *
 * Each axis is owned by exactly one source (see LEEME.md): EOL -> .gitattributes,
 * BOM/charset/trailing/final-newline/indent -> .editorconfig, renderWhitespace
 * -> .vscode/settings.json.
 */
export async function readConfigs(cwd: string): Promise<ProjectConfig> {
  void cwd; // scaffold: parameter wired but unused until implemented
  // TODO(scaffold): parse .editorconfig (sections by glob), .gitattributes
  // (text / eol / -text rules) and .vscode/settings.json.
  throw new Error("readConfigs: not implemented");
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

/**
 * Create or update `.editorconfig`, merging the given exceptions in a readable,
 * idempotent way while preserving existing comments and a sensible order.
 */
export async function writeEditorconfig(cwd: string, exceptions: ExceptionEntry[], dryRun: boolean): Promise<{ created: boolean; modified: boolean }> {
  void cwd; // scaffold: parameters wired but unused until implemented
  void exceptions;
  void dryRun;
  // TODO(scaffold): implement readable, comment-preserving, idempotent writes.
  throw new Error("writeEditorconfig: not implemented");
}

/** Create or update `.gitattributes` for EOL exceptions, idempotently. */
export async function writeGitattributes(cwd: string, exceptions: ExceptionEntry[], dryRun: boolean): Promise<{ created: boolean; modified: boolean }> {
  void cwd; // scaffold: parameters wired but unused until implemented
  void exceptions;
  void dryRun;
  // TODO(scaffold): implement readable, comment-preserving, idempotent writes.
  throw new Error("writeGitattributes: not implemented");
}
