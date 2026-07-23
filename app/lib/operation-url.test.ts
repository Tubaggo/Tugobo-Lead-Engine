import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OPERATION_QUERY_KEY,
  buildOperationUrl,
  parseOperationFilter,
} from "./operation-url.ts";

const BASE = "https://app.example.com/";

describe("parseOperationFilter", () => {
  it("3+4. reads hot_now from the query", () => {
    assert.equal(parseOperationFilter("?operation=hot_now"), "hot_now");
    assert.equal(parseOperationFilter("?foo=1&operation=hot_now#tum-leadler"), "hot_now");
  });

  it("returns null when the query is absent", () => {
    assert.equal(parseOperationFilter(""), null);
    assert.equal(parseOperationFilter("?other=1"), null);
  });

  it("10. unknown / malformed operation values are safe (null)", () => {
    assert.equal(parseOperationFilter("?operation=bogus"), null);
    assert.equal(parseOperationFilter("?operation="), null);
    assert.equal(parseOperationFilter("?operation=HOT_NOW"), null); // case-sensitive
    assert.equal(parseOperationFilter("%%%not-a-query"), null);
  });
});

describe("buildOperationUrl", () => {
  it("1+2. writes operation=hot_now and the tum-leadler hash", () => {
    const out = buildOperationUrl(BASE, "hot_now", "tum-leadler");
    assert.equal(out, "/?operation=hot_now#tum-leadler");
    const params = new URLSearchParams(out.split("?")[1].split("#")[0]);
    assert.equal(params.get(OPERATION_QUERY_KEY), "hot_now");
  });

  it("7. removes the operation query when cleared", () => {
    const out = buildOperationUrl(`${BASE}?operation=hot_now#tum-leadler`, null);
    assert.equal(parseOperationFilter(out.includes("?") ? out.slice(out.indexOf("?")) : ""), null);
    assert.ok(!out.includes("operation="));
  });

  it("preserves other query params and keeps the existing hash when hash omitted", () => {
    const out = buildOperationUrl(`${BASE}?keep=1#tum-leadler`, "hot_now");
    assert.ok(out.includes("keep=1"));
    assert.ok(out.includes("operation=hot_now"));
    assert.ok(out.endsWith("#tum-leadler"));
  });

  it("can replace the hash explicitly", () => {
    const out = buildOperationUrl(`${BASE}?operation=hot_now#old`, null, "lead-havuzu");
    assert.equal(out, "/#lead-havuzu");
  });
});
