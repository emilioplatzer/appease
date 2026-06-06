import { strict as assert } from "node:assert";
import { audit } from "../src/core/audit.js";
import type { DeviationAxis, FileAudit, FormatReport, ProjectConfig, ResolvedFileConfig } from "../src/core/types.js";

function report(over: Partial<FormatReport>): FormatReport {
  return { empty: false, hasBom: false, hasCrlf: false, hasLf: false, hasCr: false, hasTrailingSpaces: false, finalNewline: "present", ...over };
}
function resolved(over: Partial<ResolvedFileConfig>): ResolvedFileConfig {
  return { bom: "keep", eol: "binary", trailing: "keep", finalNewline: "keep", unresolved: [], ...over };
}
function configOf(cfg: ResolvedFileConfig): ProjectConfig {
  return { present: { editorconfig: true, gitattributes: true, vscodeSettings: false }, resolve: () => cfg };
}
function run(rep: FormatReport, cfg: ResolvedFileConfig, nativeEol: "lf" | "crlf" = "lf"): FileAudit | undefined {
  return audit([{ path: "f.txt", report: rep }], configOf(cfg), nativeEol)[0];
}
function devs(rep: FormatReport, cfg: ResolvedFileConfig, nativeEol: "lf" | "crlf" = "lf"): DeviationAxis[] {
  return run(rep, cfg, nativeEol)?.deviations ?? [];
}

describe("audit", () => {
  describe("BOM", () => {
    it("add deviates only when the BOM is missing", () => {
      assert.deepEqual(devs(report({}), resolved({ bom: "add" })), ["bom"]);
      assert.deepEqual(devs(report({ hasBom: true }), resolved({ bom: "add" })), []);
    });
    it("remove deviates only when the BOM is present", () => {
      assert.deepEqual(devs(report({ hasBom: true }), resolved({ bom: "remove" })), ["bom"]);
      assert.deepEqual(devs(report({}), resolved({ bom: "remove" })), []);
    });
    it("keep never deviates", () => {
      assert.deepEqual(devs(report({ hasBom: true }), resolved({ bom: "keep" })), []);
    });
  });

  describe("trailing", () => {
    it("trim deviates on trailing whitespace; keep never does", () => {
      assert.deepEqual(devs(report({ hasTrailingSpaces: true }), resolved({ trailing: "trim" })), ["trailing"]);
      assert.deepEqual(devs(report({}), resolved({ trailing: "trim" })), []);
      assert.deepEqual(devs(report({ hasTrailingSpaces: true }), resolved({ trailing: "keep" })), []);
    });
  });

  describe("final newline", () => {
    it("ensure deviates when not exactly one final newline", () => {
      assert.deepEqual(devs(report({ finalNewline: "missing" }), resolved({ finalNewline: "ensure" })), ["finalNewline"]);
      assert.deepEqual(devs(report({ finalNewline: "multiple" }), resolved({ finalNewline: "ensure" })), ["finalNewline"]);
      assert.deepEqual(devs(report({ finalNewline: "present" }), resolved({ finalNewline: "ensure" })), []);
    });
    it("keep never deviates", () => {
      assert.deepEqual(devs(report({ finalNewline: "missing" }), resolved({ finalNewline: "keep" })), []);
    });
  });

  describe("EOL", () => {
    it("lf deviates on any CRLF or lone CR", () => {
      assert.deepEqual(devs(report({ hasCrlf: true }), resolved({ eol: "lf" })), ["eol"]);
      assert.deepEqual(devs(report({ hasCr: true }), resolved({ eol: "lf" })), ["eol"]);
      assert.deepEqual(devs(report({ hasLf: true }), resolved({ eol: "lf" })), []);
    });
    it("crlf deviates on any lone LF or lone CR", () => {
      assert.deepEqual(devs(report({ hasLf: true }), resolved({ eol: "crlf" })), ["eol"]);
      assert.deepEqual(devs(report({ hasCr: true }), resolved({ eol: "crlf" })), ["eol"]);
      assert.deepEqual(devs(report({ hasCrlf: true }), resolved({ eol: "crlf" })), []);
    });
    it("binary is not evaluated even when mixed", () => {
      assert.deepEqual(devs(report({ hasCrlf: true, hasLf: true }), resolved({ eol: "binary" })), []);
    });
    it("auto is evaluated against this machine's native EOL", () => {
      assert.deepEqual(devs(report({ hasCrlf: true }), resolved({ eol: "auto" }), "lf"), ["eol"]);
      assert.deepEqual(devs(report({ hasLf: true }), resolved({ eol: "auto" }), "crlf"), ["eol"]);
      assert.deepEqual(devs(report({ hasCrlf: true }), resolved({ eol: "auto" }), "crlf"), []);
    });
  });

  describe("aggregation and listing", () => {
    it("reports every deviating axis in one file", () => {
      const r = run(
        report({ hasBom: true, hasTrailingSpaces: true, finalNewline: "missing", hasCrlf: true }),
        resolved({ bom: "remove", trailing: "trim", finalNewline: "ensure", eol: "lf" }),
      );
      assert.deepEqual(r?.deviations, ["bom", "trailing", "finalNewline", "eol"]);
      assert.deepEqual(r?.unresolved, []);
    });

    it("does not evaluate axes the config could not resolve (case 2), but reports them", () => {
      const r = run(
        report({ hasBom: true, hasTrailingSpaces: true, finalNewline: "missing", hasCrlf: true }),
        resolved({ bom: "remove", trailing: "trim", finalNewline: "ensure", eol: "lf", unresolved: ["bom", "trailing", "finalNewline", "eol"] }),
      );
      assert.deepEqual(r?.deviations, []);
      assert.deepEqual(r?.unresolved, ["bom", "trailing", "finalNewline", "eol"]);
    });

    it("omits clean files and keeps the dirty ones", () => {
      const reports = [
        { path: "clean.txt", report: report({}) },
        { path: "dirty.txt", report: report({ hasBom: true }) },
      ];
      const result = audit(reports, configOf(resolved({ bom: "remove" })), "lf");
      assert.deepEqual(
        result.map((f) => f.path),
        ["dirty.txt"],
      );
    });
  });
});
