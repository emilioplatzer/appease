import picomatch from "picomatch";

/**
 * EOL stance for a path as declared by `.gitattributes`.
 * - `auto`       : text, native EOL (the `* text=auto` default).
 * - `lf` / `crlf`: a fixed EOL via `eol=`.
 * - `binary`     : `-text` / `binary` — not normalized.
 * - `unresolved` : a recognized key with an unrecognized value (case 2: skip + report).
 */
export type GitEol = "lf" | "crlf" | "auto" | "binary" | "unresolved";

interface GitRule {
  matches: (path: string) => boolean;
  /** `text` attribute state; `binary` and `-text` both map to `unset`. */
  text: "set" | "unset" | "auto" | "unrecognized" | undefined;
  eol: "lf" | "crlf" | "unrecognized" | undefined;
}

export interface Gitattributes {
  rules: GitRule[];
}

/**
 * Parse `.gitattributes` content into ordered rules. Pure.
 * Throws on a structurally malformed line (case 3); attributes we do not manage
 * (filter, diff, linguist-*, ...) are ignored (case 1).
 */
export function parseGitattributes(content: string): Gitattributes {
  const rules: GitRule[] = [];
  content.split(/\r\n|\r|\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) return;
    const [pattern, ...attrs] = line.split(/\s+/);
    let text: GitRule["text"];
    let eol: GitRule["eol"];
    for (const attr of attrs) {
      if (attr.startsWith("=")) throw new Error(`Malformed .gitattributes line ${index + 1}: "${rawLine}"`);
      if (attr === "text") text = "set";
      else if (attr === "-text" || attr === "binary") text = "unset"; // binary macro = -text -diff
      else if (attr === "!text") text = undefined; // unset the attribute: no effect
      else if (attr === "text=auto") text = "auto";
      else if (attr.startsWith("text=")) text = "unrecognized";
      else if (attr === "eol=lf") eol = "lf";
      else if (attr === "eol=crlf") eol = "crlf";
      else if (attr.startsWith("eol=")) eol = "unrecognized";
      // else: an attribute we do not manage — ignored (case 1)
    }
    rules.push({ matches: makeMatcher(pattern), text, eol });
  });
  return { rules };
}

/** Resolve the effective EOL stance for `path` (last matching rule wins per attribute). */
export function resolveGitEol(ga: Gitattributes, path: string): GitEol {
  let text: GitRule["text"];
  let eol: GitRule["eol"];
  for (const rule of ga.rules) {
    if (!rule.matches(path)) continue;
    if (rule.text !== undefined) text = rule.text;
    if (rule.eol !== undefined) eol = rule.eol;
  }
  if (text === "unset") return "binary";
  if (text === "unrecognized" || eol === "unrecognized") return "unresolved";
  if (eol === "lf") return "lf";
  if (eol === "crlf") return "crlf";
  return "auto";
}

/** Build a gitignore-style matcher: leading `/` anchors to root; a slashless pattern matches the basename. */
function makeMatcher(pattern: string): (path: string) => boolean {
  const anchored = pattern.startsWith("/");
  const pat = anchored ? pattern.slice(1) : pattern;
  const basename = !anchored && !pat.includes("/");
  return picomatch(pat, { dot: true, basename });
}
