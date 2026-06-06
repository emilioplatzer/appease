import { strict as assert } from "node:assert";
import { buildExceptions, mergeEditorconfig, mergeGitattributes } from "../src/core/merge.js";
import type { AuditedFile } from "../src/core/merge.js";
import type { DeviationAxis, FormatReport } from "../src/core/types.js";

function report(over: Partial<FormatReport>): FormatReport {
  return { empty: false, hasBom: false, hasCrlf: false, hasLf: false, hasCr: false, hasTrailingSpaces: false, finalNewline: "present", ...over };
}
function file(path: string, deviations: DeviationAxis[], over: Partial<FormatReport>): AuditedFile {
  return { path, report: report(over), deviations };
}

describe("buildExceptions", () => {
  it("locks a consistent LF/CRLF file to its EOL in .gitattributes", () => {
    assert.deepEqual(buildExceptions([file("a.sh", ["eol"], { hasLf: true })]).gitattributes, [{ pattern: "a.sh", attrs: "text eol=lf" }]);
    assert.deepEqual(buildExceptions([file("a.bat", ["eol"], { hasCrlf: true })]).gitattributes, [{ pattern: "a.bat", attrs: "text eol=crlf" }]);
  });

  it("locks a mixed (or lone-CR) file byte-for-byte with -text", () => {
    assert.deepEqual(buildExceptions([file("m", ["eol"], { hasCrlf: true, hasLf: true })]).gitattributes, [{ pattern: "m", attrs: "-text" }]);
    assert.deepEqual(buildExceptions([file("c", ["eol"], { hasCr: true })]).gitattributes, [{ pattern: "c", attrs: "-text" }]);
  });

  it("a -text file gets no .editorconfig exception (it is protected whole)", () => {
    const result = buildExceptions([file("m", ["eol", "trailing"], { hasCrlf: true, hasLf: true })]);
    assert.deepEqual(result.gitattributes, [{ pattern: "m", attrs: "-text" }]);
    assert.deepEqual(result.editorconfig, []);
  });

  it("routes editorconfig-owned axes to a section with don't-enforce values", () => {
    const result = buildExceptions([file("x", ["bom", "trailing", "finalNewline"], {})]);
    assert.deepEqual(result.editorconfig, [
      { pattern: "x", properties: ["charset = unset", "trim_trailing_whitespace = false", "insert_final_newline = false"] },
    ]);
    assert.deepEqual(result.gitattributes, []);
  });

  it("emits both owners for a consistent file deviating on EOL and other axes", () => {
    const result = buildExceptions([file("y.txt", ["eol", "trailing"], { hasLf: true, hasTrailingSpaces: true })]);
    assert.deepEqual(result.gitattributes, [{ pattern: "y.txt", attrs: "text eol=lf" }]);
    assert.deepEqual(result.editorconfig, [{ pattern: "y.txt", properties: ["trim_trailing_whitespace = false"] }]);
  });

  it("is empty for no files", () => {
    assert.deepEqual(buildExceptions([]), { editorconfig: [], gitattributes: [] });
  });
});

describe("mergeEditorconfig", () => {
  const base = "root = true\n\n[*]\ncharset = utf-8\n";

  it("appends a new section, preserving the existing content", () => {
    const result = mergeEditorconfig(base, [{ pattern: "weird.txt", properties: ["charset = unset", "trim_trailing_whitespace = false"] }]);
    assert.equal(result, "root = true\n\n[*]\ncharset = utf-8\n\n[weird.txt]\ncharset = unset\ntrim_trailing_whitespace = false\n");
  });

  it("is idempotent: a pattern that already has a section is not re-added", () => {
    const once = mergeEditorconfig(base, [{ pattern: "weird.txt", properties: ["charset = unset"] }]);
    assert.equal(mergeEditorconfig(once, [{ pattern: "weird.txt", properties: ["charset = unset"] }]), once);
  });

  it("returns the input unchanged when there is nothing to add", () => {
    assert.equal(mergeEditorconfig(base, []), base);
  });

  it("uses the existing file's EOL (CRLF)", () => {
    const result = mergeEditorconfig("root = true\r\n[*]\r\ncharset = utf-8\r\n", [{ pattern: "a", properties: ["charset = unset"] }]);
    assert.equal(result, "root = true\r\n[*]\r\ncharset = utf-8\r\n\r\n[a]\r\ncharset = unset\r\n");
  });

  it("defaults to LF when the existing content has no newline, and handles empty content", () => {
    assert.equal(mergeEditorconfig("root = true", [{ pattern: "a", properties: ["charset = unset"] }]), "root = true\n\n[a]\ncharset = unset\n");
    assert.equal(mergeEditorconfig("", [{ pattern: "a", properties: ["charset = unset"] }]), "[a]\ncharset = unset\n");
  });
});

describe("mergeGitattributes", () => {
  const base = "# normalize\n* text=auto\n";

  it("appends a new rule (comments are not treated as patterns)", () => {
    const result = mergeGitattributes(base, [{ pattern: "x.bat", attrs: "text eol=crlf" }]);
    assert.equal(result, "# normalize\n* text=auto\n\nx.bat text eol=crlf\n");
  });

  it("appends multiple rules consecutively", () => {
    const result = mergeGitattributes("* text=auto\n", [
      { pattern: "a", attrs: "text eol=lf" },
      { pattern: "b", attrs: "-text" },
    ]);
    assert.equal(result, "* text=auto\n\na text eol=lf\nb -text\n");
  });

  it("is idempotent and a no-op when there is nothing to add", () => {
    const once = mergeGitattributes(base, [{ pattern: "x.bat", attrs: "-text" }]);
    assert.equal(mergeGitattributes(once, [{ pattern: "x.bat", attrs: "-text" }]), once);
    assert.equal(mergeGitattributes(base, []), base);
  });
});
