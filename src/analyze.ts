import type { FormatReport } from "./types.js";

/**
 * Audit core: detect the current low-level format state of a single file's
 * already-decoded text. Pure and side-effect free (no disk, no Git, no args).
 */
export function analyzeContent(content: string): FormatReport {
  void content; // scaffold: parameter wired but unused until implemented
  // TODO(scaffold): implement BOM / EOL / trailing / final-newline / indent detection.
  throw new Error("analyzeContent: not implemented");
}
