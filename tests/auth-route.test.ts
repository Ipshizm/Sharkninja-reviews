import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { safeNextPath } from "../app/api/login/route";

describe("login redirect", () => {
  it("accepts internal paths", () => {
    assert.equal(safeNextPath("/upload"), "/upload");
    assert.equal(safeNextPath("/?tab=shark"), "/?tab=shark");
  });

  it("rejects external and protocol-relative redirects", () => {
    assert.equal(safeNextPath("https://example.com"), "/");
    assert.equal(safeNextPath("//example.com"), "/");
    assert.equal(safeNextPath("/\\example.com"), "/");
    assert.equal(safeNextPath("/\t/example.com"), "/");
    assert.equal(safeNextPath("javascript:alert(1)"), "/");
  });
});
