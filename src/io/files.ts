import { execFile, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import type { AuditResult, IndexEol } from "../core/types.js";
import { AppeaseError } from "../core/errors.js";

const execFileAsync = promisify(execFile);

type SkipReason = AuditResult["notAnalyzed"][number]["reason"];

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

/** Map the `i/` value of `git ls-files --eol` (empty for gitlinks/symlinks) to an IndexEol. */
function toIndexEol(value: string): IndexEol {
  if (value === "lf" || value === "crlf" || value === "mixed" || value === "none") return value;
  if (value === "-text") return "binary";
  if (value === "") return "none";
  throw new Error(`appease: unexpected index EOL "${value}" from git ls-files --eol`);
}

/** How git stores each tracked file in the index (`git ls-files --eol`). Read-only. */
export async function listIndexEol(cwd: string): Promise<Map<string, IndexEol>> {
  const { stdout } = await execFileAsync("git", ["ls-files", "--eol", "-z"], { cwd, maxBuffer: 64 * 1024 * 1024 });
  const result = new Map<string, IndexEol>();
  for (const entry of stdout.split("\0")) {
    if (entry === "") continue;
    const tab = entry.indexOf("\t");
    const info = entry.slice(0, tab).trim().split(/\s+/)[0];
    if (tab < 0 || info === undefined || !info.startsWith("i/")) throw new Error(`appease: unexpected line from git ls-files --eol: "${entry}"`);
    result.set(entry.slice(tab + 1), toIndexEol(info.slice(2)));
  }
  return result;
}

/** Run git with `input` as its standard input; resolves with its standard output. */
async function gitWithInput(cwd: string, args: string[], input: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] }); // eslint-disable-line sonarjs/no-os-command-from-path -- a command line tool uses the git of the PATH, like the user does
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")} failed (${String(code)}): ${stderr.trim()}`));
    });
    child.stdin.end(input);
  });
}

/**
 * Rewrite, only in the git index, the stored content of `path` with its CRLF converted to LF. Only the EOL
 * change is staged: the working copy and any other (unstaged) change of the file are left untouched.
 */
export async function renormalizeIndexEol(cwd: string, path: string): Promise<void> {
  const { stdout } = await execFileAsync("git", ["ls-files", "--stage", "-z", "--", path], { cwd });
  const entries = stdout.split("\0").filter((entry) => entry !== "");
  const fields = entries.length === 1 ? (entries[0] ?? "").split("\t")[0]?.split(" ") ?? [] : [];
  const [mode, hash, stage] = fields;
  if (fields.length !== 3 || mode === undefined || hash === undefined || stage !== "0") {
    throw new AppeaseError("cannotRenormalize1", path);
  }
  const { stdout: blob } = await execFileAsync("git", ["cat-file", "blob", hash], { cwd, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  const normalized = Buffer.from(blob.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  const newHash = (await gitWithInput(cwd, ["hash-object", "-w", "--no-filters", "--stdin"], normalized)).trim();
  await execFileAsync("git", ["update-index", "--cacheinfo", `${mode},${newHash},${path}`], { cwd });
}

/** Whether the working tree has uncommitted changes (modified, staged, or untracked). Read-only. */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim() !== "";
}

/**
 * Read a file for auditing: skip binaries (declared `-text`, known extension, or
 * NUL content) and non-UTF-8 files; otherwise decode keeping any leading BOM.
 */
export async function readForAudit(cwd: string, path: string, isGitBinary: boolean): Promise<{ content: string } | { skip: SkipReason }> {
  if (isGitBinary) return { skip: "gitattributes-notext" };
  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return { skip: "binary-extension" };
  let bytes: Buffer;
  try {
    bytes = await readFile(join(cwd, path));
  } catch (err) {
    // The file was listed by `git ls-files` but is gone from the working tree (e.g. a tracked
    // file deleted but not yet staged): recoverable — report it as skipped, do not abort.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { skip: "missing" };
    throw err;
  }
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
