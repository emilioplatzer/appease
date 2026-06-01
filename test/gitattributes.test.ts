import { strict as assert } from "node:assert";
import { parseGitattributes, resolveGitEol } from "../src/core/gitattributes.js";

/** Parse then resolve, the common path. */
function eol(content: string, path: string): string {
  return resolveGitEol(parseGitattributes(content), path);
}

describe("gitattributes", () => {
  describe("EOL resolution", () => {
    it("text=auto resolves to auto (native)", () => {
      assert.equal(eol("* text=auto", "x.js"), "auto");
    });
    it("plain text (no eol) resolves to auto", () => {
      assert.equal(eol("*.txt text", "a.txt"), "auto");
    });
    it("eol=lf and eol=crlf", () => {
      assert.equal(eol("*.sh text eol=lf", "x.sh"), "lf");
      assert.equal(eol("*.bat eol=crlf", "x.bat"), "crlf");
    });
    it("-text and the binary macro resolve to binary", () => {
      assert.equal(eol("*.bin -text", "a.bin"), "binary");
      assert.equal(eol("*.png binary", "a.png"), "binary");
    });
    it("a path with no matching rule (or no rules) is auto", () => {
      assert.equal(eol("*.sh eol=lf", "a.js"), "auto");
      assert.equal(eol("", "a.js"), "auto");
    });
    it("!text unsets the attribute (no effect)", () => {
      assert.equal(eol("*.a !text", "a.a"), "auto");
    });
  });

  describe("last matching rule wins per attribute", () => {
    it("binary overrides an earlier text", () => {
      assert.equal(eol("* text\n*.png binary", "a.png"), "binary");
      assert.equal(eol("* text", "a.txt"), "auto");
    });
    it("a later text overrides an earlier binary", () => {
      assert.equal(eol("*.png binary\nspecial.png text", "special.png"), "auto");
    });
  });

  describe("unrecognized values (case 2 → unresolved)", () => {
    it("unrecognized eol value", () => {
      assert.equal(eol("*.x eol=mac", "a.x"), "unresolved");
    });
    it("unrecognized text value", () => {
      assert.equal(eol("*.y text=weird", "a.y"), "unresolved");
    });
  });

  describe("attributes we do not manage are ignored (case 1)", () => {
    it("filter / diff / linguist-* do not affect EOL", () => {
      assert.equal(eol("*.z filter=lfs diff linguist-language=Foo", "a.z"), "auto");
    });
  });

  describe("malformed lines (case 3 → throw)", () => {
    it("an attribute token starting with = is rejected", () => {
      assert.throws(() => parseGitattributes("*.q =auto"), /Malformed \.gitattributes line 1/);
    });
  });

  describe("comments and blank lines", () => {
    it("are ignored", () => {
      assert.equal(eol("# a comment\n\n   \n*.txt eol=lf", "a.txt"), "lf");
    });
  });

  describe("pattern matching semantics", () => {
    it("a slashless pattern matches the basename at any depth", () => {
      assert.equal(eol("*.txt eol=lf", "dir/sub/a.txt"), "lf");
    });
    it("a leading slash anchors to the root", () => {
      assert.equal(eol("/build.sh eol=lf", "build.sh"), "lf");
      assert.equal(eol("/build.sh eol=lf", "src/build.sh"), "auto");
    });
    it("a pattern with an internal slash is anchored and * does not cross /", () => {
      assert.equal(eol("src/*.js eol=lf", "src/a.js"), "lf");
      assert.equal(eol("src/*.js eol=lf", "src/x/a.js"), "auto");
      assert.equal(eol("src/*.js eol=lf", "a.js"), "auto");
    });
    it("** crosses directories", () => {
      assert.equal(eol("src/**/*.js eol=lf", "src/x/y/a.js"), "lf");
    });
  });
});
