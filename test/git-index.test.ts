import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAppease } from "../src/index.js";
import { defaultEditorconfig, defaultGitattributes } from "../src/core/configs.js";
import { listIndexEol, renormalizeIndexEol } from "../src/io/files.js";
import type { Confirmation } from "commendatore";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }); // eslint-disable-line sonarjs/no-os-command-from-path -- the tests use the git of the PATH, like the user does
}

/** What the git index stores for `path` (the content the next commit will have). */
function indexed(cwd: string, path: string): string {
  return git(cwd, "show", `:${path}`);
}

/**
 * A repo with `old.txt` committed with CRLF before `.gitattributes` existed (so git keeps it with CRLF)
 * and `new.txt` committed after (stored with LF).
 */
async function repoWithOldCrlf(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "appease-git-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "appease test");
  git(cwd, "config", "user.email", "test@appease.invalid");
  git(cwd, "config", "core.autocrlf", "false");
  await writeFile(join(cwd, "old.txt"), "a\r\nb\r\n");
  git(cwd, "add", "old.txt");
  git(cwd, "commit", "-q", "-m", "old");
  await writeFile(join(cwd, ".gitattributes"), defaultGitattributes());
  await writeFile(join(cwd, ".editorconfig"), defaultEditorconfig());
  await writeFile(join(cwd, "new.txt"), "x\n");
  git(cwd, "add", ".gitattributes", ".editorconfig", "new.txt");
  git(cwd, "commit", "-q", "-m", "new");
  return cwd;
}

/** A confirmer that answers from a list and records what it was asked. */
function answering(answers: Confirmation[]): { confirm: (path: string) => Promise<Confirmation>; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    confirm: async (path) => { // eslint-disable-line @typescript-eslint/require-await -- implements the async confirmer interface
      asked.push(path);
      const answer = answers.shift();
      if (answer === undefined) throw new Error(`unexpected question for ${path}`);
      return answer;
    },
  };
}

describe("EOL stored in the git index", () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await repoWithOldCrlf();
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("listIndexEol tells how git stores each file", async () => {
    const eols = await listIndexEol(cwd);
    assert.equal(eols.get("old.txt"), "crlf");
    assert.equal(eols.get("new.txt"), "lf");
  });

  it("audit reports the files stored with CRLF in the index as repoEol", async () => {
    const report = await runAppease({ mode: "audit", cwd, dryRun: false });
    assert.deepEqual(report.audit?.findings.filter((finding) => finding.deviations.includes("repoEol")).map((finding) => finding.path), ["old.txt"]);
  });

  it("renormalizeIndexEol rewrites only the EOL in the index and leaves any other change unstaged", async () => {
    await writeFile(join(cwd, "old.txt"), "a\r\nb\r\nnot staged\r\n");
    await renormalizeIndexEol(cwd, "old.txt");
    assert.equal(indexed(cwd, "old.txt"), "a\nb\n");
    assert.equal(await readFile(join(cwd, "old.txt"), "utf8"), "a\r\nb\r\nnot staged\r\n");
    assert.equal((await listIndexEol(cwd)).get("old.txt"), "lf");
  });

  it("renormalizeIndexEol refuses a path that is not in the index", async () => {
    await assert.rejects(renormalizeIndexEol(cwd, "missing.txt"), /can not renormalize missing\.txt/);
  });

  it("fix-format renormalizes the confirmed files", async () => {
    const { confirm, asked } = answering([{ confirmed: true }]);
    const report = await runAppease({ mode: "fix-format", cwd, dryRun: false, confirmRenormalize: confirm });
    assert.deepEqual(asked, ["old.txt"]);
    assert.deepEqual(report.renormalized, ["old.txt"]);
    assert.deepEqual(report.notRenormalized, []);
    assert.equal(indexed(cwd, "old.txt"), "a\nb\n");
  });

  it("fix-format reports the files not confirmed, with the reason", async () => {
    const { confirm } = answering([{ confirmed: false, reason: "needs-tty" }]);
    const report = await runAppease({ mode: "fix-format", cwd, dryRun: false, confirmRenormalize: confirm });
    assert.deepEqual(report.renormalized, []);
    assert.deepEqual(report.notRenormalized, [{ path: "old.txt", reason: "needs-tty" }]);
    assert.equal(indexed(cwd, "old.txt"), "a\r\nb\r\n");
  });

  it("fix-format without a confirmer renormalizes nothing (disabled)", async () => {
    const report = await runAppease({ mode: "fix-format", cwd, dryRun: false });
    assert.deepEqual(report.notRenormalized, [{ path: "old.txt", reason: "disabled" }]);
    assert.equal(indexed(cwd, "old.txt"), "a\r\nb\r\n");
  });

  it("fix-format --dry-run only lists them, without asking", async () => {
    const { confirm, asked } = answering([]);
    const report = await runAppease({ mode: "fix-format", cwd, dryRun: true, confirmRenormalize: confirm });
    assert.deepEqual(asked, []);
    assert.deepEqual(report.renormalized, ["old.txt"]);
    assert.equal(indexed(cwd, "old.txt"), "a\r\nb\r\n");
  });
});
