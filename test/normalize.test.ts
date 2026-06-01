import { strict as assert } from "node:assert";
import { normalizeText } from "../src/core/normalize.js";
import type { NormalizeOptions } from "../src/core/types.js";

const BOM = String.fromCharCode(0xfeff);

const KEEP: NormalizeOptions = { bom: "keep", eol: "keep", trailing: "keep", finalNewline: "keep" };
function opts(over: Partial<NormalizeOptions>): NormalizeOptions {
  return { ...KEEP, ...over };
}

describe("normalizeText", () => {
  describe("EOL", () => {
    it("keep leaves every ending untouched", () => {
      assert.equal(normalizeText("a\r\nb\rc\n", opts({ eol: "keep" })), "a\r\nb\rc\n");
    });
    it("lf converts CRLF and lone CR to LF", () => {
      assert.equal(normalizeText("a\r\nb\rc\n", opts({ eol: "lf" })), "a\nb\nc\n");
    });
    it("crlf converts every ending to CRLF", () => {
      assert.equal(normalizeText("a\nb\rc\r\n", opts({ eol: "crlf" })), "a\r\nb\r\nc\r\n");
    });
  });

  describe("trailing whitespace", () => {
    it("trim removes end-of-line spaces and tabs (including at EOF)", () => {
      assert.equal(normalizeText("a  \nb\t\nc  ", opts({ trailing: "trim" })), "a\nb\nc");
    });
    it("keep leaves trailing whitespace", () => {
      assert.equal(normalizeText("a  \n", opts({ trailing: "keep" })), "a  \n");
    });
  });

  describe("final newline", () => {
    it("ensure adds a missing newline (lf)", () => {
      assert.equal(normalizeText("foo", opts({ finalNewline: "ensure", eol: "lf" })), "foo\n");
    });
    it("ensure adds CRLF when eol is crlf", () => {
      assert.equal(normalizeText("foo", opts({ finalNewline: "ensure", eol: "crlf" })), "foo\r\n");
    });
    it("ensure collapses multiple trailing newlines", () => {
      assert.equal(normalizeText("foo\n\n\n", opts({ finalNewline: "ensure", eol: "lf" })), "foo\n");
    });
    it("ensure leaves a truly empty file empty", () => {
      assert.equal(normalizeText("", opts({ finalNewline: "ensure", eol: "lf" })), "");
    });
    it("ensure with eol keep reuses the file's existing final ending", () => {
      assert.equal(normalizeText("a\nb\r\n\r\n", opts({ finalNewline: "ensure", eol: "keep" })), "a\nb\r\n");
    });
    it("ensure with eol keep infers the ending from the content when none is trailing", () => {
      assert.equal(normalizeText("a\r\nb", opts({ finalNewline: "ensure", eol: "keep" })), "a\r\nb\r\n");
    });
    it("ensure with eol keep defaults to LF when there is no ending at all", () => {
      assert.equal(normalizeText("foo", opts({ finalNewline: "ensure", eol: "keep" })), "foo\n");
    });
    it("keep leaves a missing final newline as-is", () => {
      assert.equal(normalizeText("foo", opts({ finalNewline: "keep" })), "foo");
    });
  });

  describe("BOM", () => {
    it("add prepends when absent", () => {
      assert.equal(normalizeText("foo", opts({ bom: "add" })), BOM + "foo");
    });
    it("add is a no-op when already present", () => {
      assert.equal(normalizeText(BOM + "foo", opts({ bom: "add" })), BOM + "foo");
    });
    it("remove strips it when present", () => {
      assert.equal(normalizeText(BOM + "foo", opts({ bom: "remove" })), "foo");
    });
    it("remove is a no-op when absent", () => {
      assert.equal(normalizeText("foo", opts({ bom: "remove" })), "foo");
    });
    it("keep leaves it untouched", () => {
      assert.equal(normalizeText(BOM + "foo", opts({ bom: "keep" })), BOM + "foo");
    });
  });

  it("is idempotent under a full normalization", () => {
    const o = opts({ bom: "remove", eol: "lf", trailing: "trim", finalNewline: "ensure" });
    const once = normalizeText(BOM + "a  \r\nb\r\n\r\n", o);
    assert.equal(once, "a\nb\n");
    assert.equal(normalizeText(once, o), once);
  });
});
