import { strict as assert } from "node:assert";
import { interpretConfigs } from "../src/core/configs.js";
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
