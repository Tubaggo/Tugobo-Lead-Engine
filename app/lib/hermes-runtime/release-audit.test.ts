import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Milestone 1 release audit.
 *
 * Two invariants that a unit test on a single module cannot protect, because
 * both are properties of the *set* of files rather than of any one of them:
 *
 *   1. every Hermes route is behind the admin session guard
 *   2. nothing in the Hermes runtime can reach an external provider
 *
 * The route modules import through the `@/` alias, which plain `node --test`
 * does not resolve, so these are source-level assertions rather than runtime
 * ones. That is the right tool here anyway: the failure being guarded against
 * is a *new file* added later without the wrapper, and only a scan of the
 * directory can catch that.
 *
 * The live 401 behaviour is verified separately against a running dev server.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const HERMES_API_DIR = path.join(REPO_ROOT, "app", "api", "hermes");
const HERMES_LIB_DIR = path.join(REPO_ROOT, "app", "lib", "hermes-runtime");

/**
 * Source with comments removed.
 *
 * The audit asks what the code *does*, not what it says about itself. Without
 * this, a comment explaining why a module deliberately does not read
 * `HERMES_RUNTIME_STATE_DIR` would fail the very rule it documents — and the
 * obvious fix would be to delete the explanation, which is the wrong outcome.
 */
function codeOf(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, filter: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

const routeFiles = walk(HERMES_API_DIR, (name) => name === "route.ts");
const libFiles = walk(
  HERMES_LIB_DIR,
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
);

/** Every HTTP verb Next.js will route to if exported. */
const HTTP_VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

describe("auth protection", () => {
  test("1. there is at least one Hermes route to audit", () => {
    assert.ok(routeFiles.length >= 6, `found ${routeFiles.length} route files`);
  });

  test("2. every exported HTTP handler is wrapped in withAdminSession", () => {
    for (const file of routeFiles) {
      const source = codeOf(file);
      const relative = path.relative(REPO_ROOT, file);

      for (const verb of HTTP_VERBS) {
        const exportPattern = new RegExp(`export\\s+const\\s+${verb}\\s*=`, "m");
        if (!exportPattern.test(source)) continue;

        const wrapped = new RegExp(
          `export\\s+const\\s+${verb}\\s*=\\s*withAdminSession\\(`,
          "m",
        );
        assert.ok(
          wrapped.test(source),
          `${relative} exports ${verb} without withAdminSession`,
        );
      }

      // A handler exported as a plain function declaration would bypass the
      // pattern above entirely, so that form is refused outright.
      for (const verb of HTTP_VERBS) {
        assert.equal(
          new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`).test(source),
          false,
          `${relative} exports ${verb} as a bare function — use withAdminSession`,
        );
      }
    }
  });

  test("3. every Hermes route imports the guard it is supposed to use", () => {
    for (const file of routeFiles) {
      const source = codeOf(file);
      assert.match(
        source,
        /import\s*\{\s*withAdminSession\s*\}\s*from\s*"@\/app\/lib\/auth\/require-admin-session"/,
        `${path.relative(REPO_ROOT, file)} does not import withAdminSession`,
      );
    }
  });
});

describe("external send is structurally impossible", () => {
  const allSources = [...routeFiles, ...libFiles].map((file) => ({
    relative: path.relative(REPO_ROOT, file),
    source: codeOf(file),
  }));

  test("4. no Hermes module references the WhatsApp Cloud API host", () => {
    for (const { relative, source } of allSources) {
      assert.equal(source.includes("graph.facebook"), false, relative);
      assert.equal(source.includes("wa.me"), false, relative);
      assert.equal(source.includes("api.whatsapp.com"), false, relative);
    }
  });

  test("5. no Hermes module reads a provider credential", () => {
    const forbidden = [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      "WHATSAPP_CONTROLLED_LIVE_SEND_ENABLED",
      "WHATSAPP_TEST_RECIPIENT",
      "HERMES_ACQUISITION_CRON_SECRET",
      "HERMES_FOLLOW_UP_CRON_SECRET",
    ];
    for (const { relative, source } of allSources) {
      for (const key of forbidden) {
        assert.equal(source.includes(key), false, `${relative} reads ${key}`);
      }
    }
  });

  test("6. no Hermes module performs an outbound network call", () => {
    for (const { relative, source } of allSources) {
      // `fetch(` in any form, and the classic Node HTTP clients.
      assert.equal(/\bfetch\s*\(/.test(source), false, `${relative} calls fetch`);
      assert.equal(/from\s+"node:(https?|net)"/.test(source), false, relative);
    }
  });

  test("7. no Hermes module opens a webhook or cron surface", () => {
    for (const { relative, source } of allSources) {
      assert.equal(source.includes("hub.challenge"), false, relative);
      assert.equal(source.includes("hub.verify_token"), false, relative);
    }
    // And no route file lives at a webhook-shaped path.
    for (const file of routeFiles) {
      const relative = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
      assert.equal(relative.includes("webhook"), false, relative);
      assert.equal(relative.includes("cron"), false, relative);
    }
  });
});

describe("storage ownership", () => {
  test("8. no Hermes module keeps durable state in a module-level Map", () => {
    for (const file of libFiles) {
      const source = codeOf(file);
      const relative = path.relative(REPO_ROOT, file);
      // The debt this milestone pays off: `const registry = new Map()` at
      // module scope was how the Hermes line lost everything on restart.
      assert.equal(
        /^(const|let)\s+\w+\s*(:[^=]+)?=\s*new Map\(/m.test(source),
        false,
        `${relative} declares a module-level Map`,
      );
    }
  });

  test("9. no Hermes module touches localStorage", () => {
    for (const file of libFiles) {
      const source = codeOf(file);
      assert.equal(
        source.includes("localStorage"),
        false,
        path.relative(REPO_ROOT, file),
      );
    }
  });

  test("10. the durability primitives are imported, not reimplemented", () => {
    const store = codeOf(path.join(HERMES_LIB_DIR, "store.ts"));
    assert.match(store, /from "\.\.\/operational-state\/file-store\.ts"/);
    // A second atomic-write implementation is exactly what must not appear.
    assert.equal(store.includes("handle.sync()"), false);
    assert.equal(store.includes("fs.rename"), false);
  });

  test("11. only one data directory is configured", () => {
    for (const file of libFiles) {
      const source = codeOf(file);
      assert.equal(
        source.includes("HERMES_RUNTIME_STATE_DIR"),
        false,
        path.relative(REPO_ROOT, file),
      );
    }
  });
});
