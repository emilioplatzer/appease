import { strict as assert } from "node:assert";
import { defaultEditorconfig, defaultGitattributes, defaultVscodeSettings, interpretConfigs } from "../src/core/configs.js";
import { analyzeContent } from "../src/core/analyze.js";
import { parseEditorconfig, resolveEditorconfig } from "../src/core/editorconfig.js";
import { parseGitattributes, resolveGitEol } from "../src/core/gitattributes.js";
import type { RawConfigs } from "../src/core/types.js";
import { mergeVscodeSettingsJsonc, parseJsonc, runAppease } from "../src/index.js";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  describe("defaultVscodeSettings", () => {
    it("returns correct defaults", () => {
      const settings = defaultVscodeSettings();
      assert.deepEqual(settings, {
        "editor.renderWhitespace": "selection",
        "files.trimTrailingWhitespace": true,
        "files.insertFinalNewline": true,
        "files.encoding": "utf8"
      });
    });
  });
});

describe("parseJsonc", () => {
  it("parses valid JSON without comments", () => {
    assert.deepEqual(parseJsonc('{"foo": "bar"}'), { foo: "bar" });
  });

  it("parses JSON with single-line and multi-line comments", () => {
    const json = `
      // This is a comment
      {
        "foo": "bar", /* inline comment */
        "url": "https://example.com/foo", // slash in string URL
        "num": 42
      }
    `;
    assert.deepEqual(parseJsonc(json), {
      foo: "bar",
      url: "https://example.com/foo",
      num: 42
    });
  });

  it("handles trailing commas in objects and arrays", () => {
    assert.deepEqual(parseJsonc('{"a": [1, 2,],}'), { a: [1, 2] });
  });

  it("returns empty object for empty or whitespace-only input", () => {
    assert.deepEqual(parseJsonc(""), {});
    assert.deepEqual(parseJsonc("   \n  "), {});
  });

  it("throws a descriptive error on invalid JSON syntax", () => {
    assert.throws(() => parseJsonc("{invalid}"), /Failed to parse JSON settings file/);
  });
});

describe("mergeVscodeSettingsJsonc", () => {
  it("preserves comments and formatting when overwriting existing keys", () => {
    const original = `
      // General settings
      {
        "editor.fontSize": 14,
        /* EOL comment */
        "files.trimTrailingWhitespace": false,
        "window.title": "my-app" // end of line comment
      }
    `;
    const defaults = { "files.trimTrailingWhitespace": true };
    const { content, changed } = mergeVscodeSettingsJsonc(original, defaults);

    assert.equal(changed, true);
    assert.match(content, /\/\/ General settings/);
    assert.match(content, /\/\* EOL comment \*\//);
    assert.match(content, /\/\/ end of line comment/);
    assert.match(content, /"editor\.fontSize": 14/);
    assert.match(content, /"window\.title": "my-app"/);
    assert.match(content, /"files\.trimTrailingWhitespace": true/);
  });

  it("preserves comments when inserting new keys before the last brace", () => {
    const original = `
      // General settings
      {
        "editor.fontSize": 14
      } // Trailing comment
    `;
    const defaults = { "files.trimTrailingWhitespace": true };
    const { content, changed } = mergeVscodeSettingsJsonc(original, defaults);

    assert.equal(changed, true);
    assert.match(content, /\/\/ General settings/);
    assert.match(content, /\/\/ Trailing comment/);
    assert.match(content, /"editor\.fontSize": 14/);
    assert.match(content, /"files\.trimTrailingWhitespace": true/);
  });

  it("is a no-op if all default keys are already set correctly", () => {
    const original = `
      // Already correct
      {
        "files.trimTrailingWhitespace": true
      }
    `;
    const defaults = { "files.trimTrailingWhitespace": true };
    const { content, changed } = mergeVscodeSettingsJsonc(original, defaults);
    assert.equal(changed, false);
    assert.equal(content, original);
  });
});

describe("runAddConfigDefaults Integration for VS Code settings", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "appease-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates a new .vscode/settings.json when absent", async () => {
    const report = await runAppease({
      mode: "add-config-defaults",
      cwd: tempDir,
      dryRun: false
    });

    assert.deepEqual(report.created.sort(), [
      ".editorconfig",
      ".gitattributes",
      ".vscode/settings.json"
    ].sort());

    const settingsContent = await readFile(join(tempDir, ".vscode", "settings.json"), "utf8");
    const parsed = JSON.parse(settingsContent);
    assert.deepEqual(parsed, defaultVscodeSettings());
  });

  it("merges defaults into existing .vscode/settings.json without losing other settings", async () => {
    await mkdir(join(tempDir, ".vscode"), { recursive: true });
    const existingSettings = `
      // Existing settings
      {
        "window.title": "appease-test",
        "editor.fontSize": 14,
        "files.trimTrailingWhitespace": false, // different value to overwrite
      }
    `;
    await writeFile(join(tempDir, ".vscode", "settings.json"), existingSettings, "utf8");

    const report = await runAppease({
      mode: "add-config-defaults",
      cwd: tempDir,
      dryRun: false
    });

    assert.deepEqual(report.modified, [".vscode/settings.json"]);

    const settingsContent = await readFile(join(tempDir, ".vscode", "settings.json"), "utf8");
    const parsed = parseJsonc(settingsContent);

    assert.equal(parsed["window.title"], "appease-test");
    assert.equal(parsed["editor.fontSize"], 14);

    assert.equal(parsed["files.trimTrailingWhitespace"], true);
    assert.equal(parsed["editor.renderWhitespace"], "selection");
    assert.equal(parsed["files.insertFinalNewline"], true);
    assert.equal(parsed["files.encoding"], "utf8");
  });
});

