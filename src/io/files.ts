import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import type { AuditResult } from "../core/types.js";

const execFileAsync = promisify(execFile);

type SkipReason = AuditResult["skipped"][number]["reason"];

/** Known-binary file extensions; the embedded list (a `.appease` override may come later). */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tif", ".tiff",
  ".pdf", ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".tar",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".class", ".jar", ".wasm",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp3", ".mp4", ".m4a", ".avi", ".mov", ".mkv", ".wav", ".flac", ".ogg", ".webm",
]);

/** List repo-tracked files (repo-relative, forward-slash paths). */
export async function listTrackedFiles(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout.split("\0").filter((path) => path !== "");
}

/**
 * Read a file for auditing: skip binaries (declared `-text`, known extension, or
 * NUL content) and non-UTF-8 files; otherwise decode keeping any leading BOM.
 */
export async function readForAudit(cwd: string, path: string, isGitBinary: boolean): Promise<{ content: string } | { skip: SkipReason }> {
  if (isGitBinary) return { skip: "gitattributes-notext" };
  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return { skip: "binary-extension" };
  const bytes = await readFile(join(cwd, path));
  if (bytes.includes(0)) return { skip: "binary-content" };
  try {
    // ignoreBOM keeps the BOM in the decoded string, as analyzeContent expects.
    return { content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { skip: "non-utf8" };
  }
}

/** Write UTF-8 `content` to a tracked file (a BOM in the string is encoded as bytes). */
export async function writeText(cwd: string, path: string, content: string): Promise<void> {
  await writeFile(join(cwd, path), content, "utf8");
}

/** Re-stage every tracked file so Git normalizes line endings per `.gitattributes`. */
export async function gitRenormalize(cwd: string): Promise<void> {
  await execFileAsync("git", ["add", "--renormalize", "."], { cwd });
}
