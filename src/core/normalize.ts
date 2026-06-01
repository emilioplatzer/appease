import type { NormalizeOptions } from "./types.js";

/** UTF-8 BOM code point. */
const BOM = String.fromCharCode(0xfeff);

/**
 * Normalization core: take a file's already-decoded content plus the options
 * resolved for that file, and return the normalized content. Pure and side-effect free.
 *
 * Normalizes BOM, EOL (e.g. fixing a mixed file), trailing whitespace and the
 * final newline. EOL is included so the workflow is complete: when the audit
 * finds an EOL anomaly, the normalizer can fix it.
 *
 * Returns the normalized content; the caller detects whether it changed by
 * comparing against the input. Idempotent: running twice produces the same result.
 */
export function normalizeText(content: string, options: NormalizeOptions): string {
  let result = applyEol(content, options.eol);
  if (options.trailing === "trim") result = trimTrailing(result);
  if (options.finalNewline === "ensure") result = ensureFinalNewline(result, options.eol);
  result = applyBom(result, options.bom);
  return result;
}

/** Normalize every line ending to a single style (CRLF and lone CR both collapse to LF first). */
function applyEol(content: string, eol: NormalizeOptions["eol"]): string {
  if (eol === "keep") return content;
  const lf = content.replace(/\r\n?/g, "\n");
  return eol === "crlf" ? lf.replace(/\n/g, "\r\n") : lf;
}

/** Remove horizontal whitespace at the end of every line (and at end of file). */
function trimTrailing(content: string): string {
  return content.replace(/[ \t]+(?=\r|\n|$)/g, "");
}

/** Collapse the trailing newlines to exactly one (leaving a truly empty file empty). */
function ensureFinalNewline(content: string, eol: NormalizeOptions["eol"]): string {
  if (content === "") return content;
  const trailing = content.match(/(\r\n|\r|\n)+$/);
  const body = trailing ? content.slice(0, content.length - trailing[0].length) : content;
  const newline =
    eol === "crlf"
      ? "\r\n"
      : eol === "lf"
        ? "\n"
        : trailing
          ? trailing[1] // keep: reuse the file's existing final ending
          : (content.match(/\r\n|\r|\n/)?.[0] ?? "\n"); // keep with no trailing newline: infer
  return body + newline;
}

/** Add, remove or keep the leading UTF-8 BOM. */
function applyBom(content: string, bom: NormalizeOptions["bom"]): string {
  const hasBom = content.charCodeAt(0) === 0xfeff;
  if (bom === "add") return hasBom ? content : BOM + content;
  if (bom === "remove") return hasBom ? content.slice(1) : content;
  return content;
}
