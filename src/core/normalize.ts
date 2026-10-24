import type { NormalizeOptions } from "./types.js";
import { trailingLineBreaksStart } from "./text.js";

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
  return content.split(/(\r|\n)/).map((part, i) => (i % 2 === 0 ? trimEndSpaces(part) : part)).join("");
}

function trimEndSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === " " || text[end - 1] === "\t")) end--;
  return text.slice(0, end);
}

/** Collapse the trailing newlines to exactly one (leaving a truly empty file empty). */
function ensureFinalNewline(content: string, eol: NormalizeOptions["eol"]): string {
  if (content === "") return content;
  const bodyEnd = trailingLineBreaksStart(content);
  const body = content.slice(0, bodyEnd);
  const hasTrailing = bodyEnd < content.length;
  const newline =
    eol === "crlf"
      ? "\r\n"
      : eol === "lf"
        ? "\n"
        : hasTrailing
          ? finalLineBreak(content) // keep: reuse the file's existing final ending
          : (content.match(/\r\n|\r|\n/)?.[0] ?? "\n"); // keep with no trailing newline: infer
  return body + newline;
}

/** The last line break of a content that ends with one: CRLF when it ends with CR+LF, otherwise its last character (CR or LF). */
function finalLineBreak(content: string): string {
  return content.endsWith("\r\n") ? "\r\n" : content.slice(-1);
}

/** Add, remove or keep the leading UTF-8 BOM. */
function applyBom(content: string, bom: NormalizeOptions["bom"]): string {
  const hasBom = content.charCodeAt(0) === 0xfeff;
  if (bom === "add") return hasBom ? content : BOM + content;
  if (bom === "remove") return hasBom ? content.slice(1) : content;
  return content;
}
