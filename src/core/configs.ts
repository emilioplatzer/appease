import type { DeviationAxis, ProjectConfig, RawConfigs, ResolvedFileConfig } from "./types.js";
import { type Editorconfig, parseEditorconfig, resolveEditorconfig } from "./editorconfig.js";
import { type Gitattributes, parseGitattributes, resolveGitEol } from "./gitattributes.js";

/**
 * Interpret the raw contents of the three config sources into a resolver for
 * per-file options. Pure: takes the already-read contents, touches no disk.
 *
 * Each axis is owned by exactly one source (see LEEME.md): EOL -> .gitattributes,
 * BOM/charset/trailing/final-newline -> .editorconfig, renderWhitespace ->
 * .vscode/settings.json. Only `.editorconfig` and `.gitattributes` drive
 * `resolve`; `.vscode/settings.json` only counts towards `present`.
 */
export function interpretConfigs(raw: RawConfigs): ProjectConfig {
  const editorconfig: Editorconfig = raw.editorconfig !== null ? parseEditorconfig(raw.editorconfig) : { root: false, sections: [] };
  const gitattributes: Gitattributes = raw.gitattributes !== null ? parseGitattributes(raw.gitattributes) : { rules: [] };
  return {
    present: {
      editorconfig: raw.editorconfig !== null,
      gitattributes: raw.gitattributes !== null,
      vscodeSettings: raw.vscodeSettings !== null,
    },
    resolve: (path) => resolveFile(editorconfig, gitattributes, path),
  };
}

/** Combine the per-source resolutions into the file's resolved config. */
function resolveFile(editorconfig: Editorconfig, gitattributes: Gitattributes, path: string): ResolvedFileConfig {
  const ec = resolveEditorconfig(editorconfig, path);
  const gitEol = resolveGitEol(gitattributes, path);
  const unresolved: DeviationAxis[] = [...ec.unresolved];
  if (gitEol === "unresolved") unresolved.push("eol");
  return {
    bom: ec.charset === "utf-8-bom" ? "add" : ec.charset === "utf-8" ? "remove" : "keep",
    eol: gitEol === "unresolved" ? "auto" : gitEol,
    trailing: ec.trailing,
    finalNewline: ec.finalNewline,
    unresolved,
  };
}

/** Pure, idempotent defaults for `.editorconfig` (no inspection of the repo's reality). */
export function defaultEditorconfig(): string {
  return [
    "root = true",
    "",
    "# Defaults for every file",
    "[*]",
    "charset = utf-8",
    "trim_trailing_whitespace = true",
    "insert_final_newline = true",
    "indent_style = space",
    "",
  ].join("\n");
}

/** Pure, idempotent defaults for `.gitattributes` (`* text=auto`, ...). */
export function defaultGitattributes(): string {
  return [
    "# Normalize to LF in the repo on commit; check out with the OS-native EOL.",
    "* text=auto",
    "",
  ].join("\n");
}
