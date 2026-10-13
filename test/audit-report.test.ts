import { strict as assert } from "node:assert";
import { translator } from "commendatore";
import { auditJson, auditText, quotePath } from "../src/audit-report.js";
import type { AuditResult } from "../src/core/types.js";
import { i18n } from "../src/messages.js";

const en = translator(i18n, "en");
const es = translator(i18n, "es");

const sample: AuditResult = {
  findings: [
    { path: ".eslintrc.yml", deviations: ["repoEol", "eol"], unresolved: ["bom"] },
    { path: "docs/mi archivo.md", deviations: ["trailing"], unresolved: [] },
    { path: "src/x.ts", deviations: [], unresolved: ["finalNewline"] },
  ],
  notAnalyzed: [
    { path: "img/logo.png", reason: "binary-extension" },
    { path: "archivo2.bin", reason: "missing" },
  ],
  summary: { findings: 3, notAnalyzed: 2 },
};

describe("quotePath", () => {
  it("leaves plain paths (including non-ASCII letters) as-is", () => {
    assert.equal(quotePath("src/año/x.ts"), "src/año/x.ts");
  });
  it("quotes paths with whitespace, control characters or separators, with JSON escapes", () => {
    assert.equal(quotePath("a b.md"), '"a b.md"');
    assert.equal(quotePath("a\tb"), '"a\\tb"');
    assert.equal(quotePath("a\nb"), '"a\\nb"');
    assert.equal(quotePath('a"b'), '"a\\"b"');
    assert.equal(quotePath("a;b"), '"a;b"');
    assert.equal(quotePath("a:b"), '"a:b"');
  });
});

describe("auditText", () => {
  it("prints one file per line, omitting empty parts, and the totals last", () => {
    assert.equal(auditText(sample, en), [
      "findings:",
      "  .eslintrc.yml; deviations: repoEol, eol; unresolved: bom",
      '  "docs/mi archivo.md"; deviations: trailing',
      "  src/x.ts; unresolved: finalNewline",
      "not analyzed:",
      "  img/logo.png: binary-extension",
      "  archivo2.bin: missing",
      "3 findings, 2 not analyzed",
      "",
    ].join("\n"));
  });
  it("translates the labels but not the identifiers", () => {
    assert.equal(auditText(sample, es), [
      "hallazgos:",
      "  .eslintrc.yml; desvíos: repoEol, eol; sin resolver: bom",
      '  "docs/mi archivo.md"; desvíos: trailing',
      "  src/x.ts; sin resolver: finalNewline",
      "no analizados:",
      "  img/logo.png: binary-extension",
      "  archivo2.bin: missing",
      "3 hallazgos, 2 no analizados",
      "",
    ].join("\n"));
  });
  it("prints only the totals for a clean repo", () => {
    const clean: AuditResult = { findings: [], notAnalyzed: [], summary: { findings: 0, notAnalyzed: 0 } };
    assert.equal(auditText(clean, en), "0 findings, 0 not analyzed\n");
  });
});

describe("auditJson", () => {
  it("heads the JSON with the version and the kind of report, and drops empty unresolved lists", () => {
    const parsed: unknown = JSON.parse(auditJson(sample, "1.2.3"));
    assert.deepEqual(parsed, {
      appease: "1.2.3",
      report: "audit",
      findings: [
        { path: ".eslintrc.yml", deviations: ["repoEol", "eol"], unresolved: ["bom"] },
        { path: "docs/mi archivo.md", deviations: ["trailing"] },
        { path: "src/x.ts", deviations: [], unresolved: ["finalNewline"] },
      ],
      notAnalyzed: [
        { path: "img/logo.png", reason: "binary-extension" },
        { path: "archivo2.bin", reason: "missing" },
      ],
      summary: { findings: 3, notAnalyzed: 2 },
    });
    assert.ok(auditJson(sample, "1.2.3").startsWith('{\n  "appease": "1.2.3",\n  "report": "audit",\n'));
  });
});
