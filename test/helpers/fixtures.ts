// Code-generated fixtures: build file contents with controlled low-level format,
// so tests assert exactly the bytes/format they exercise (CRLF/LF/BOM/trailing/...).

export const BOM = "\ufeffh";

/** Join `lines` with the given EOL. Does not add a trailing newline. */
export function withEol(lines: string[], eol: "lf" | "crlf"): string {
  return lines.join(eol === "crlf" ? "\r\n" : "\n");
}

/** Prepend a UTF-8 BOM. */
export function withBom(content: string): string {
  return BOM + content;
}

/** Append trailing spaces to each given line index (0-based) of an LF/CRLF text. */
export function addTrailingSpaces(content: string, spaces = "  "): string {
  return content.replace(/(\r?\n)/g, spaces + "$1");
}

/** Ensure the content ends with exactly one newline of the given style. */
export function withFinalNewline(content: string, eol: "lf" | "crlf"): string {
  const nl = eol === "crlf" ? "\r\n" : "\n";
  return content.endsWith(nl) ? content : content + nl;
}
