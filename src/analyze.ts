import type { FinalNewline, FormatReport } from "./types.js";

/**
 * Audit core: detect the current low-level format state of a single file's
 * already-decoded text. Pure and side-effect free (no disk, no Git, no args).
 *
 * Assumes the decoder kept a leading BOM (U+FEFF) in `content` if the file had
 * one (the orchestration decodes raw, without stripping it).
 */
export function analyzeContent(content: string): FormatReport {
  const empty = content === "";
  const hasBom = content.charCodeAt(0) === 0xfeff;

  // Count CRLF, CR and LF separately. Each CRLF contains one CR and one LF, so
  // the lone-CR / lone-LF counts come out by subtraction.
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  const crCount = (content.match(/\r/g) ?? []).length;
  const lfCount = (content.match(/\n/g) ?? []).length;
  const hasCrlf = crlfCount > 0;
  const hasCr = crCount - crlfCount > 0;
  const hasLf = lfCount - crlfCount > 0;

  // Horizontal whitespace right before a line break or at the end of the file.
  const hasTrailingSpaces = /[ \t]+(?:\r?\n|$)/.test(content);

  const finalNewline = detectFinalNewline(content);

  return { empty, hasBom, hasCrlf, hasLf, hasCr, hasTrailingSpaces, finalNewline };
}

/** Classify the trailing run of newlines (LF / CRLF only). */
function detectFinalNewline(content: string): FinalNewline {
  if (!/(?:\r\n|\n)$/.test(content)) return "missing";
  return /(?:\r\n|\n){2}$/.test(content) ? "multiple" : "present";
}
