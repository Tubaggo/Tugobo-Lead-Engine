import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  CorruptHermesFileError,
  ensureHermesFile,
  readHermesFile,
  readHermesFileOrEmpty,
  updateHermesFile,
} from "./store.ts";
import { HERMES_SCHEMA_VERSION } from "./schema.ts";

/**
 * Durability of the Hermes file itself.
 *
 * The primitives under test are `operational-state/file-store.ts`'s, reached
 * through the thin Hermes adapter — so these assertions are as much a guard on
 * the shared layer as on this one. Every test runs against its own temporary
 * directory; nothing here touches `.data` or `LEAD_ENGINE_DATA_DIR`.
 */

const tempDirs: string[] = [];

async function makeStore(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-hermes-"));
  tempDirs.push(dir);
  return path.join(dir, "hermes-runtime.json");
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("bootstrap", () => {
  test("1. a missing file reads as an empty runtime, not an error", async () => {
    const file = await readHermesFile(await makeStore());
    assert.equal(file.schemaVersion, HERMES_SCHEMA_VERSION);
    assert.deepEqual(file.missions, {});
  });

  test("2. an empty file reads as an empty runtime", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "   \n", "utf8");
    const file = await readHermesFile(filePath);
    assert.deepEqual(file.missions, {});
  });

  test("3. ensureHermesFile creates the file and its directory", async () => {
    const filePath = await makeStore();
    await ensureHermesFile(filePath);
    const raw = await fs.readFile(filePath, "utf8");
    assert.equal(JSON.parse(raw).schemaVersion, HERMES_SCHEMA_VERSION);
  });
});

describe("atomic write", () => {
  test("4. a write leaves no temp file behind", async () => {
    const filePath = await makeStore();
    await ensureHermesFile(filePath);
    const entries = await fs.readdir(path.dirname(filePath));
    assert.deepEqual(entries, ["hermes-runtime.json"]);
  });

  test("5. the persisted document is valid JSON ending in a newline", async () => {
    const filePath = await makeStore();
    await ensureHermesFile(filePath);
    const raw = await fs.readFile(filePath, "utf8");
    assert.ok(raw.endsWith("\n"));
    assert.doesNotThrow(() => JSON.parse(raw));
  });
});

describe("revision", () => {
  test("6. every accepted mutation increments the file revision", async () => {
    const filePath = await makeStore();
    const first = await updateHermesFile(filePath, (c) => ({ ...c }));
    const second = await updateHermesFile(filePath, (c) => ({ ...c }));
    assert.equal(first.revision, 1);
    assert.equal(second.revision, 2);
  });

  test("7. a mutation returning the file unchanged is a true no-op", async () => {
    const filePath = await makeStore();
    await updateHermesFile(filePath, (c) => ({ ...c }));
    const before = await readHermesFile(filePath);
    const after = await updateHermesFile(filePath, (current) => current);
    assert.equal(after.revision, before.revision);
    assert.equal(after.updatedAt, before.updatedAt);
  });
});

describe("concurrency", () => {
  test("8. concurrent read-modify-writes are serialized, not lost", async () => {
    const filePath = await makeStore();
    await ensureHermesFile(filePath);

    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        updateHermesFile(filePath, (current) => ({
          ...current,
          missions: {
            ...current.missions,
            [`m-${i}`]: {
              missionId: `m-${i}`,
              leadId: "ant-001",
              hotelName: "",
              stage: "discover" as const,
              stageLabel: "Keşif",
              progress: 10,
              status: "",
              decisionState: "not-required" as const,
              approvalRequired: true,
              primaryTaskId: "",
              tasks: [],
              timeline: [],
              lastTransition: null,
              failure: null,
              createdAt: "2026-07-28T09:00:00.000Z",
              updatedAt: "2026-07-28T09:00:00.000Z",
              revision: 0,
            },
          },
        })),
      ),
    );

    const file = await readHermesFile(filePath);
    assert.equal(Object.keys(file.missions).length, 12);
  });
});

describe("corruption", () => {
  test("9. unparseable content is quarantined, never silently reset", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "{ not json", "utf8");

    await assert.rejects(() => readHermesFile(filePath), CorruptHermesFileError);

    const entries = await fs.readdir(path.dirname(filePath));
    assert.equal(entries.length, 1);
    assert.match(entries[0], /\.corrupt-/);
  });

  test("10. a wrong-schema document is quarantined too", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ schemaVersion: 99 }), "utf8");
    await assert.rejects(() => readHermesFile(filePath), CorruptHermesFileError);
  });

  test("11. the quarantined bytes are preserved verbatim", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "{ not json", "utf8");
    await assert.rejects(() => readHermesFile(filePath));

    const dir = path.dirname(filePath);
    const [name] = await fs.readdir(dir);
    assert.equal(await fs.readFile(path.join(dir, name), "utf8"), "{ not json");
  });

  test("12. the read-only variant degrades to empty after quarantining", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "{ not json", "utf8");
    const file = await readHermesFileOrEmpty(filePath);
    assert.deepEqual(file.missions, {});
  });
});
