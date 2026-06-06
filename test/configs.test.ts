import { strict as assert } from "node:assert";
import { defaultEditorconfig, defaultGitattributes, interpretConfigs } from "../src/core/configs.js";
import { analyzeContent } from "../src/core/analyze.js";
import { parseEditorconfig, resolveEditorconfig } from "../src/core/editorconfig.js";
import { parseGitattributes, resolveGitEol } from "../src/core/gitattributes.js";
import type { RawConfigs } from "../src/core/types.js";

const EMPTY: RawConfigs = { editorconfig: null, gitattributes: null, vscodeSettings: null };
function raw(over: Partial<RawConfigs>): RawConfigs {
  return { ...EMPTY, ...over };
}

describe("interpretConfigs", () => {
  describe("present", () => {
    it("reports which sources were found (null = absent)", () => {
      assert.deepEqual(interpretConfigs(EMPTY).present, { editorconfig: false, gitattributes: false, vscodeSettings: false });
      assert.deepEqual(interpretConfigs(raw({ editorconfig: "", gitattributes: "", vscodeSettings: "{}" })).present, {
        editorconfig: true,
        gitattributes: true,
        vscodeSettings: true,
      });
    });
  });

  describe("resolve", () => {
    it("with no configs falls back to a no-op stance", () => {
      assert.deepEqual(interpretConfigs(EMPTY).resolve("a.txt"), {
        bom: "keep",
        eol: "auto",
        trailing: "keep",
        finalNewline: "keep",
        unresolved: [],
      });
    });

    it("combines editorconfig and gitattributes per file", () => {
      const cfg = interpretConfigs(
        raw({
          editorconfig: "[*]\ncharset = utf-8\ntrim_trailing_whitespace = true\ninsert_final_newline = true",
          gitattributes: "*.sh text eol=lf",
        }),
      );
      assert.deepEqual(cfg.resolve("x.sh"), { bom: "remove", eol: "lf", trailing: "trim", finalNewline: "ensure", unresolved: [] });
      // no gitattributes rule for .js -> eol auto, editorconfig still applies
      assert.deepEqual(cfg.resolve("x.js"), { bom: "remove", eol: "auto", trailing: "trim", finalNewline: "ensure", unresolved: [] });
    });

    it("maps charset to a BOM action (utf-8-bom -> add)", () => {
      assert.equal(interpretConfigs(raw({ editorconfig: "[*]\ncharset = utf-8-bom" })).resolve("a").bom, "add");
    });

    it("carries the gitattributes binary stance", () => {
      assert.equal(interpretConfigs(raw({ gitattributes: "*.png binary" })).resolve("a.png").eol, "binary");
    });

    it("works with only one source present", () => {
      assert.equal(interpretConfigs(raw({ gitattributes: "*.sh eol=crlf" })).resolve("a.sh").eol, "crlf");
      assert.equal(interpretConfigs(raw({ editorconfig: "[*]\ncharset = utf-8" })).resolve("a").bom, "remove");
    });

    it("aggregates unresolved axes from both sources (case 2)", () => {
      const cfg = interpretConfigs(raw({ editorconfig: "[*]\ncharset = latin1", gitattributes: "*.x eol=mac" }));
      const r = cfg.resolve("a.x");
      assert.deepEqual(r.unresolved, ["bom", "eol"]);
      assert.equal(r.bom, "keep");
      assert.equal(r.eol, "auto");
    });
  });

  it("propagates a malformed-config error (case 3)", () => {
    assert.throws(() => interpretConfigs(raw({ editorconfig: "garbage" })), /Malformed \.editorconfig/);
  });
});

describe("config defaults", () => {
  /** The tool's own default configs must pass the tool's own audit: LF, no BOM, no trailing, final newline. */
  function assertSelfConsistent(content: string): void {
    const r = analyzeContent(content);
    assert.equal(r.hasBom, false);
    assert.equal(r.hasCrlf, false);
    assert.equal(r.hasCr, false);
    assert.equal(r.hasTrailingSpaces, false);
    assert.equal(r.finalNewline, "present");
  }

  describe("defaultEditorconfig", () => {
    it("is self-consistent and parses to the expected stance", () => {
      const content = defaultEditorconfig();
      assertSelfConsistent(content);
      const ec = parseEditorconfig(content);
      assert.equal(ec.root, true);
      assert.deepEqual(resolveEditorconfig(ec, "a.js"), { charset: "utf-8", trailing: "trim", finalNewline: "ensure", unresolved: [] });
      // Markdown is trimmed too — no special-casing
      assert.equal(resolveEditorconfig(ec, "README.md").trailing, "trim");
    });
  });

  describe("defaultGitattributes", () => {
    it("is self-consistent and resolves to auto (native EOL)", () => {
      const content = defaultGitattributes();
      assertSelfConsistent(content);
      assert.equal(resolveGitEol(parseGitattributes(content), "a.js"), "auto");
    });
  });
});
