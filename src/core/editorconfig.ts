import picomatch from "picomatch";

/** Axes an `.editorconfig` can govern for us; an axis here means "skip + report" (case 2). */
export type EditorconfigAxis = "bom" | "trailing" | "finalNewline";

/** Resolved `.editorconfig` stance for a path (only the axes we manage). */
export interface EditorconfigResolution {
  /** `keep` = `unset`, `false`-like, or not specified. */
  charset: "utf-8" | "utf-8-bom" | "keep";
  trailing: "trim" | "keep";
  finalNewline: "ensure" | "keep";
  /** Axes governed by a recognized key with an unrecognized value (case 2). */
  unresolved: EditorconfigAxis[];
}

interface Section {
  matches: (path: string) => boolean;
  charset: "utf-8" | "utf-8-bom" | "unset" | "unrecognized" | undefined;
  trim: boolean | "unset" | "unrecognized" | undefined;
  finalNewline: boolean | "unset" | "unrecognized" | undefined;
}

export interface Editorconfig {
  root: boolean;
  sections: Section[];
}

/**
 * Parse `.editorconfig` content into ordered sections. Pure.
 * Throws on a structurally malformed line (case 3); properties we do not manage
 * (indent_*, max_line_length, ...) are ignored (case 1).
 */
export function parseEditorconfig(content: string): Editorconfig {
  let root = false;
  const sections: Section[] = [];
  let current: Section | undefined; // undefined = preamble (before any section)
  content.split(/\r\n|\r|\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) return;
    if (line.startsWith("[")) {
      if (!line.endsWith("]")) throw new Error(`Malformed .editorconfig line ${index + 1}: "${rawLine}"`);
      current = { matches: makeMatcher(line.slice(1, -1)), charset: undefined, trim: undefined, finalNewline: undefined };
      sections.push(current);
      return;
    }
    const eq = line.indexOf("=");
    if (eq === -1) throw new Error(`Malformed .editorconfig line ${index + 1}: "${rawLine}"`);
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim().toLowerCase();
    if (current === undefined) {
      if (key === "root") root = value === "true";
      return; // other preamble keys are not standard — ignored
    }
    applyProperty(current, key, value);
  });
  return { root, sections };
}

/** Resolve the effective stance for `path` (last matching section wins per property). */
export function resolveEditorconfig(ec: Editorconfig, path: string): EditorconfigResolution {
  let charset: Section["charset"];
  let trim: Section["trim"];
  let finalNewline: Section["finalNewline"];
  for (const section of ec.sections) {
    if (!section.matches(path)) continue;
    if (section.charset !== undefined) charset = section.charset;
    if (section.trim !== undefined) trim = section.trim;
    if (section.finalNewline !== undefined) finalNewline = section.finalNewline;
  }
  const unresolved: EditorconfigAxis[] = [];
  let outCharset: EditorconfigResolution["charset"] = "keep";
  if (charset === "utf-8") outCharset = "utf-8";
  else if (charset === "utf-8-bom") outCharset = "utf-8-bom";
  else if (charset === "unrecognized") unresolved.push("bom");
  let outTrailing: EditorconfigResolution["trailing"] = "keep";
  if (trim === true) outTrailing = "trim";
  else if (trim === "unrecognized") unresolved.push("trailing");
  let outFinalNewline: EditorconfigResolution["finalNewline"] = "keep";
  if (finalNewline === true) outFinalNewline = "ensure";
  else if (finalNewline === "unrecognized") unresolved.push("finalNewline");
  return { charset: outCharset, trailing: outTrailing, finalNewline: outFinalNewline, unresolved };
}

function applyProperty(section: Section, key: string, value: string): void {
  if (key === "charset") {
    section.charset =
      value === "utf-8" ? "utf-8" : value === "utf-8-bom" ? "utf-8-bom" : value === "unset" ? "unset" : "unrecognized";
  } else if (key === "trim_trailing_whitespace") {
    section.trim = parseBool(value);
  } else if (key === "insert_final_newline") {
    section.finalNewline = parseBool(value);
  }
  // else: a property we do not manage (indent_*, max_line_length, ...) — ignored (case 1)
}

function parseBool(value: string): boolean | "unset" | "unrecognized" {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "unset") return "unset";
  return "unrecognized";
}

/** Build an editorconfig glob matcher: a slashless glob matches the basename at any depth; any `/` (even leading) anchors it. */
function makeMatcher(glob: string): (path: string) => boolean {
  const basename = !glob.includes("/");
  const pat = glob.startsWith("/") ? glob.slice(1) : glob;
  return picomatch(pat, { dot: true, basename });
}
