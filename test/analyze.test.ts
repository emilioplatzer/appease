import { strict as assert } from "node:assert";
import { analyzeContent } from "../src/analyze.js";

// Scaffold: specs without a body are reported as "pending" by mocha until the
// core is implemented. They document the cases the audit core must cover.
describe("analyzeContent", () => {
  it("detects BOM present / absent");
  it("detects EOL lf / crlf / mixed");
  it("detects trailing spaces and the affected line numbers");
  it("detects final newline present / missing / multiple");
  it("detects indentation tabs / spaces / mixed and size");
  it("handles the empty file");

  it("throws while not implemented (scaffold guard)", () => {
    assert.throws(() => analyzeContent("x"), /not implemented/);
  });
});
