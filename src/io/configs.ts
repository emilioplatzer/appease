import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExceptionEntry, RawConfigs } from "../core/types.js";

/** Read a UTF-8 file, returning its contents or `null` when it does not exist. */
async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err; // any other I/O error is real: do not swallow it
  }
}

/**
 * Read the three config sources from `cwd` into raw contents. Thin I/O; the
 * interpretation lives in the pure core (`interpretConfigs`).
 */
export async function readRawConfigs(cwd: string): Promise<RawConfigs> {
  const [editorconfig, gitattributes, vscodeSettings] = await Promise.all([
    readOrNull(join(cwd, ".editorconfig")),
    readOrNull(join(cwd, ".gitattributes")),
    readOrNull(join(cwd, ".vscode", "settings.json")),
  ]);
  return { editorconfig, gitattributes, vscodeSettings };
}

/**
 * Create or update `.editorconfig`, merging the given exceptions in a readable,
 * idempotent way while preserving existing comments and a sensible order.
 */
export async function writeEditorconfig(cwd: string, exceptions: ExceptionEntry[], dryRun: boolean): Promise<{ created: boolean; modified: boolean }> {
  void cwd; // scaffold: I/O writer; the pure merge will live in core
  void exceptions;
  void dryRun;
  throw new Error("writeEditorconfig: not implemented");
}

/** Create or update `.gitattributes` for EOL exceptions, idempotently. */
export async function writeGitattributes(cwd: string, exceptions: ExceptionEntry[], dryRun: boolean): Promise<{ created: boolean; modified: boolean }> {
  void cwd; // scaffold: I/O writer; the pure merge will live in core
  void exceptions;
  void dryRun;
  throw new Error("writeGitattributes: not implemented");
}
