import { strict as assert } from "node:assert";
import { analyzeContent } from "../src/core/analyze.js";
import { BOM, withEol, withBom, addTrailingSpaces, withFinalNewline } from "./helpers/fixtures.js";

describe("analyzeContent", () => {
  describe("BOM", () => {
    it("absent", () => {
      assert.equal(analyzeContent("foo\n").hasBom, false);
    });
    it("present (and does not disturb the other axes)", () => {
      const r = analyzeContent(withBom("a\nb\n"));
      assert.equal(r.hasBom, true);
      assert.equal(r.hasLf, true);
      assert.equal(r.hasCrlf, false);
      assert.equal(r.finalNewline, "present");
    });
    it("a lone BOM is not an empty file", () => {
      const r = analyzeContent(BOM);
      assert.equal(r.empty, false);
      assert.equal(r.hasBom, true);
      assert.equal(r.finalNewline, "missing");
    });
  });

  describe("EOL", () => {
    it("lf", () => {
      const r = analyzeContent(withFinalNewline(withEol(["a", "b"], "lf"), "lf"));
      assert.equal(r.hasCrlf, false);
      assert.equal(r.hasLf, true);
    });
    it("crlf", () => {
      const r = analyzeContent(withFinalNewline(withEol(["a", "b"], "crlf"), "crlf"));
      assert.equal(r.hasCrlf, true);
      assert.equal(r.hasLf, false);
    });
    it("cr (lone CR)", () => {
      const r = analyzeContent("a\rb\r");
      assert.equal(r.hasCrlf, false);
      assert.equal(r.hasLf, false);
      assert.equal(r.hasCr, true);
    });
    it("mixed (crlf + lf)", () => {
      // a CRLF line ending followed by a lone LF line ending.
      const r = analyzeContent(withEol(["a", "b"], "crlf") + "\n");
      assert.equal(r.hasCrlf, true);
      assert.equal(r.hasLf, true);
      assert.equal(r.hasCr, false);
    });
    it("mixed (cr + crlf + lf, one of each)", () => {
      // three line endings, one of each kind; lone CR and lone LF come out by subtraction.
      const r = analyzeContent("a\rb\r\nc\n");
      assert.equal(r.hasCr, true);
      assert.equal(r.hasCrlf, true);
      assert.equal(r.hasLf, true);
    });
    it("none (no line breaks)", () => {
      const r = analyzeContent("abc");
      assert.equal(r.hasCrlf, false);
      assert.equal(r.hasLf, false);
      assert.equal(r.hasCr, false);
    });
  });

  describe("trailing spaces", () => {
    it("absent", () => {
      assert.equal(analyzeContent("foo\nbar\n").hasTrailingSpaces, false);
    });
    it("present before a line break", () => {
      assert.equal(analyzeContent(addTrailingSpaces("foo\nbar\n")).hasTrailingSpaces, true);
    });
    it("present at end of file with no final newline", () => {
      assert.equal(analyzeContent("foo  ").hasTrailingSpaces, true);
    });
  });

  describe("final newline", () => {
    it("present", () => {
      assert.equal(analyzeContent("foo\n").finalNewline, "present");
      assert.equal(analyzeContent("foo\r\n").finalNewline, "present");
    });
    it("missing", () => {
      assert.equal(analyzeContent("foo").finalNewline, "missing");
    });
    it("multiple (trailing blank lines)", () => {
      assert.equal(analyzeContent("foo\n\n").finalNewline, "multiple");
      assert.equal(analyzeContent("foo\r\n\r\n").finalNewline, "multiple");
    });
  });

  describe("empty file", () => {
    it("reports empty with every axis clear", () => {
      const r = analyzeContent("");
      assert.deepEqual(r, {
        empty: true,
        hasBom: false,
        hasCrlf: false,
        hasLf: false,
        hasCr: false,
        hasTrailingSpaces: false,
        finalNewline: "missing",
      });
    });
  });
});
