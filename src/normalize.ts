import type { NormalizeOptions, NormalizeResult } from "./types.js";

/**
 * Normalization core: take a file's already-decoded content plus the options
 * resolved for that file, and return the normalized content together with a
 * report of what changed. Pure and side-effect free.
 *
 * Normalizes BOM, EOL (e.g. fixing a mixed file), trailing whitespace and the
 * final newline. EOL is included so the workflow is complete: when the audit
 * finds an EOL anomaly, the normalizer can fix it.
 */
export function normalizeText(content: string, options: NormalizeOptions): NormalizeResult {
  void content; // scaffold: parameters wired but unused until implemented
  void options;
  // TODO(scaffold): apply BOM / trailing / final-newline transforms per `options`.
  // Must be idempotent: running twice produces the same result.
  throw new Error("normalizeText: not implemented");
}
