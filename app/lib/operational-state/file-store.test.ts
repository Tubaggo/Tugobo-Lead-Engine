import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  CorruptStateFileError,
  ensureStateFile,
  isStorageWritable,
  readStateFile,
  readStateFileOrEmpty,
  updateStateFile,
} from "./file-store.ts";
import { SCHEMA_VERSION, type LeadOperationalState } from "./schema.ts";

/**
 * Every test runs against its own temporary directory. Nothing here touches
 * `.data`, `LEAD_ENGINE_DATA_DIR`, or `.env.local`.
 */

const tempDirs: string[] = [];

async function makeStore(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-state-"));
  tempDirs.push(dir);
  return path.join(dir, "operational-state.json");
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

function leadState(leadId: string, revision: number): LeadOperationalState {
  return {
    leadId,
    activity: [],
    createdAt: "2026-07-21T10:00:00.000Z",
    updatedAt: "2026-07-21T10:00:00.000Z",
    revision,
  };
}

describe("empty store", () => {
  test("a missing file reads as an empty workspace, not an error", async () => {
    const filePath = await makeStore();
    const file = await readStateFile(filePath);
    assert.equal(file.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(file.leads, {});
  });

  test("ensureStateFile creates the file and the directory", async () => {
    const filePath = await makeStore();
    await ensureStateFile(filePath);
    const stat = await fs.stat(filePath);
    assert.ok(stat.isFile());
  });

  test("an empty file reads as an empty workspace", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "   \n", "utf8");
    const file = await readStateFile(filePath);
    assert.deepEqual(file.leads, {});
  });
});

describe("atomic write", () => {
  test("a written file is valid JSON and reads back identically", async () => {
    const filePath = await makeStore();
    await updateStateFile(filePath, (current) => ({
      ...current,
      leads: { "ant-001": leadState("ant-001", 1) },
    }));

    const onDisk = JSON.parse(await fs.readFile(filePath, "utf8")) as {
      leads: Record<string, LeadOperationalState>;
    };
    assert.equal(onDisk.leads["ant-001"].revision, 1);

    const reread = await readStateFile(filePath);
    assert.equal(reread.leads["ant-001"].revision, 1);
  });

  test("no temp files are left behind after a write", async () => {
    const filePath = await makeStore();
    await ensureStateFile(filePath);
    const entries = await fs.readdir(path.dirname(filePath));
    assert.deepEqual(entries, ["operational-state.json"]);
  });

  test("updatedAt is stamped on every write", async () => {
    const filePath = await makeStore();
    const file = await updateStateFile(filePath, (current) => current);
    assert.ok(Date.parse(file.updatedAt) > 0);
  });
});

describe("concurrent writes", () => {
  test("parallel writes are serialized and none are lost", async () => {
    const filePath = await makeStore();

    // Fired without awaiting: without the write lock these would all read the
    // same empty file and the last rename would win, losing 19 leads.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        updateStateFile(filePath, (current) => ({
          ...current,
          leads: { ...current.leads, [`ant-${i}`]: leadState(`ant-${i}`, 1) },
        })),
      ),
    );

    const file = await readStateFile(filePath);
    assert.equal(Object.keys(file.leads).length, 20);
  });

  test("a failed write does not poison the queue behind it", async () => {
    const filePath = await makeStore();

    const failing = updateStateFile(filePath, () => {
      throw new Error("boom");
    });
    await assert.rejects(failing, /boom/);

    await updateStateFile(filePath, (current) => ({
      ...current,
      leads: { "ant-001": leadState("ant-001", 1) },
    }));
    const file = await readStateFile(filePath);
    assert.equal(Object.keys(file.leads).length, 1);
  });

  test("a read-modify-write increments without lost updates", async () => {
    const filePath = await makeStore();
    await Promise.all(
      Array.from({ length: 15 }, () =>
        updateStateFile(filePath, (current) => {
          const previous = current.leads["ant-001"]?.revision ?? 0;
          return {
            ...current,
            leads: { "ant-001": leadState("ant-001", previous + 1) },
          };
        }),
      ),
    );
    const file = await readStateFile(filePath);
    assert.equal(file.leads["ant-001"].revision, 15);
  });
});

describe("corrupt file handling", () => {
  test("unparseable JSON is quarantined, never silently reset", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{"schemaVersion":1,"leads":{', "utf8");

    await assert.rejects(readStateFile(filePath), CorruptStateFileError);

    const entries = await fs.readdir(path.dirname(filePath));
    const quarantined = entries.filter((name) => name.includes(".corrupt-"));
    assert.equal(quarantined.length, 1, "original content is preserved aside");
    assert.equal(entries.includes("operational-state.json"), false);
  });

  test("a wrong-schema file is quarantined too", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ schemaVersion: 42 }), "utf8");
    await assert.rejects(readStateFile(filePath), CorruptStateFileError);
  });

  test("the quarantined file still contains the original bytes", async () => {
    const filePath = await makeStore();
    const original = '{"schemaVersion":1,"leads":{';
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, original, "utf8");

    await assert.rejects(readStateFile(filePath));

    const dir = path.dirname(filePath);
    const corrupt = (await fs.readdir(dir)).find((n) => n.includes(".corrupt-"));
    assert.ok(corrupt);
    assert.equal(await fs.readFile(path.join(dir, corrupt), "utf8"), original);
  });

  test("readStateFileOrEmpty degrades instead of throwing", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "not json at all", "utf8");
    const file = await readStateFileOrEmpty(filePath);
    assert.deepEqual(file.leads, {});
  });

  test("writing recovers cleanly after a quarantine", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "broken", "utf8");
    await assert.rejects(readStateFile(filePath));

    await updateStateFile(filePath, (current) => ({
      ...current,
      leads: { "ant-001": leadState("ant-001", 1) },
    }));
    const file = await readStateFile(filePath);
    assert.equal(file.leads["ant-001"].revision, 1);
  });
});

describe("storage readiness", () => {
  test("reports writable for a usable directory", async () => {
    const filePath = await makeStore();
    assert.equal(await isStorageWritable(path.dirname(filePath)), true);
  });

  test("reports not writable when the path is a file", async () => {
    const filePath = await makeStore();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "{}", "utf8");
    // A regular file cannot be used as the data directory.
    assert.equal(await isStorageWritable(filePath), false);
  });
});
