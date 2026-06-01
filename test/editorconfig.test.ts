import { strict as assert } from "node:assert";
import { parseEditorconfig, resolveEditorconfig } from "../src/core/editorconfig.js";

/** Parse then resolve, the common path. */
function resolve(content: string, path: string) {
  return resolveEditorconfig(parseEditorconfig(content), path);
}

describe("editorconfig", () => {
  describe("charset (BOM axis)", () => {
    it("utf-8 and utf-8-bom", () => {
      assert.equal(resolve("[*]\ncharset = utf-8", "a.txt").charset, "utf-8");
      assert.equal(resolve("[*]\ncharset = utf-8-bom", "a.txt").charset, "utf-8-bom");
    });
    it("unset and absent both mean keep", () => {
      assert.equal(resolve("[*]\ncharset = unset", "a.txt").charset, "keep");
      assert.equal(resolve("[*]\ntrim_trailing_whitespace = true", "a.txt").charset, "keep");
    });
    it("an unrecognized charset is unresolved (case 2)", () => {
      const r = resolve("[*]\ncharset = latin1", "a.txt");
      assert.equal(r.charset, "keep");
      assert.deepEqual(r.unresolved, ["bom"]);
    });
  });

  describe("trim_trailing_whitespace (trailing axis)", () => {
    it("true means trim, false/unset/absent mean keep", () => {
      assert.equal(resolve("[*]\ntrim_trailing_whitespace = true", "a").trailing, "trim");
      assert.equal(resolve("[*]\ntrim_trailing_whitespace = false", "a").trailing, "keep");
      assert.equal(resolve("[*]\ntrim_trailing_whitespace = unset", "a").trailing, "keep");
      assert.equal(resolve("[*]\ncharset = utf-8", "a").trailing, "keep");
    });
    it("an unrecognized value is unresolved (case 2)", () => {
      const r = resolve("[*]\ntrim_trailing_whitespace = banana", "a");
      assert.equal(r.trailing, "keep");
      assert.deepEqual(r.unresolved, ["trailing"]);
    });
  });

  describe("insert_final_newline (finalNewline axis)", () => {
    it("true means ensure, false means keep", () => {
      assert.equal(resolve("[*]\ninsert_final_newline = true", "a").finalNewline, "ensure");
      assert.equal(resolve("[*]\ninsert_final_newline = false", "a").finalNewline, "keep");
    });
    it("an unrecognized value is unresolved (case 2)", () => {
      const r = resolve("[*]\ninsert_final_newline = maybe", "a");
      assert.equal(r.finalNewline, "keep");
      assert.deepEqual(r.unresolved, ["finalNewline"]);
    });
  });

  describe("root and preamble", () => {
    it("root = true is parsed; a non-root preamble key is ignored", () => {
      const ec = parseEditorconfig("root = true\nignored = whatever\n[*]\ncharset = utf-8");
      assert.equal(ec.root, true);
      assert.equal(resolveEditorconfig(ec, "a").charset, "utf-8");
    });
    it("root defaults to false", () => {
      assert.equal(parseEditorconfig("[*]\ncharset = utf-8").root, false);
    });
  });

  describe("sections (last matching wins)", () => {
    it("a later, more specific section overrides an earlier one", () => {
      const content = "[*]\ntrim_trailing_whitespace = true\n[*.md]\ntrim_trailing_whitespace = false";
      assert.equal(resolve(content, "a.md").trailing, "keep");
      assert.equal(resolve(content, "a.js").trailing, "trim");
    });
  });

  describe("ignored content (case 1) and comments", () => {
    it("unmanaged properties and comments do not affect resolution", () => {
      const content = "# a comment\n; another\n\n[*]\nindent_style = space\nmax_line_length = 80\ncharset = utf-8";
      assert.equal(resolve(content, "a").charset, "utf-8");
    });
  });

  describe("malformed lines (case 3 → throw)", () => {
    it("an unclosed section header", () => {
      assert.throws(() => parseEditorconfig("[unclosed"), /Malformed \.editorconfig line 1/);
    });
    it("a line that is neither comment, section, nor key=value", () => {
      assert.throws(() => parseEditorconfig("[*]\ngarbage line"), /Malformed \.editorconfig line 2/);
    });
  });

  describe("glob matching", () => {
    it("a slashless glob matches the basename at any depth", () => {
      assert.equal(resolve("[*.js]\ncharset = utf-8", "dir/sub/a.js").charset, "utf-8");
    });
    it("a glob with a slash is anchored and * does not cross /", () => {
      assert.equal(resolve("[src/*.js]\ncharset = utf-8", "src/a.js").charset, "utf-8");
      assert.equal(resolve("[src/*.js]\ncharset = utf-8", "src/x/a.js").charset, "keep");
    });
    it("a leading slash anchors to the root", () => {
      assert.equal(resolve("[/foo.js]\ncharset = utf-8", "foo.js").charset, "utf-8");
      assert.equal(resolve("[/foo.js]\ncharset = utf-8", "dir/foo.js").charset, "keep");
    });
  });
});
