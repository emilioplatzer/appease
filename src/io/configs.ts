import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RawConfigs } from "../core/types.js";


/** Outcome of a config write: whether the file was created, changed, or already up to date. */
export interface WriteResult {
  path: string;
  created: boolean;
  modified: boolean;
}

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
  // Direct access to the target directory, before any git spawn: surfaces a wrong/missing
  // directory as a clear error instead of a cryptic `spawn git ENOENT`.
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(cwd);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Directory not found: ${cwd}`);
    throw err;
  }
  if (!stats.isDirectory()) throw new Error(`Not a directory: ${cwd}`);

  const [editorconfig, gitattributes, vscodeSettings] = await Promise.all([
    readOrNull(join(cwd, ".editorconfig")),
    readOrNull(join(cwd, ".gitattributes")),
    readOrNull(join(cwd, ".vscode", "settings.json")),
  ]);
  return { editorconfig, gitattributes, vscodeSettings };
}

/**
 * Write `content` to a config file under `cwd`, only when it differs (idempotent).
 * The text to write is produced by the pure core (defaults or merge); this is
 * just the I/O. Under `dryRun` the result reflects what would change, untouched.
 */
async function writeConfig(cwd: string, name: string, content: string, dryRun: boolean): Promise<WriteResult> {
  const existing = await readOrNull(join(cwd, name));
  if (existing === content) return { path: name, created: false, modified: false };
  if (!dryRun) await writeFile(join(cwd, name), content, "utf8");
  return { path: name, created: existing === null, modified: existing !== null };
}

/** Write `.editorconfig` (created or updated only if it differs). */
export function writeEditorconfig(cwd: string, content: string, dryRun: boolean): Promise<WriteResult> {
  return writeConfig(cwd, ".editorconfig", content, dryRun);
}

/** Write `.gitattributes` (created or updated only if it differs). */
export function writeGitattributes(cwd: string, content: string, dryRun: boolean): Promise<WriteResult> {
  return writeConfig(cwd, ".gitattributes", content, dryRun);
}

/** Write `.vscode/settings.json` (created or updated only if it differs). */
export async function writeVscodeSettings(cwd: string, content: string, dryRun: boolean): Promise<WriteResult> {
  const relPath = join(".vscode", "settings.json");
  // Normalize Windows backslashes to forward slashes for output consistency:
  const normalizedPath = relPath.replace(/\\/g, "/");
  const absolutePath = join(cwd, relPath);
  const existing = await readOrNull(absolutePath);
  if (existing === content) return { path: normalizedPath, created: false, modified: false };
  if (!dryRun) {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
  return { path: normalizedPath, created: existing === null, modified: existing !== null };
}
