// Public API for appease. Consumable from Node and exercised by the CLI and tests.

import type { RunOptions, RunReport } from "./types.js";

export * from "./types.js";
export { analyzeContent } from "./analyze.js";
export { normalizeText } from "./normalize.js";
export { readConfigs, defaultEditorconfig, defaultGitattributes, writeEditorconfig, writeGitattributes } from "./configs.js";
export { audit, deviationsToExceptions } from "./audit.js";

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
  void options; // scaffold: parameter wired but unused until implemented
  // TODO(scaffold): discover files (git ls-files), skip binaries / -text,
  // resolve per-file config, dispatch by mode, collect created/modified.
  throw new Error("runAppease: not implemented");
}
