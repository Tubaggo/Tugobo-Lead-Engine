import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_SCRIPT = path.join(here, "backup-operational-state.mjs");
const VERIFY_SCRIPT = path.join(here, "verify-operational-state.mjs");

/** Each test gets its own data directory; `.data` is never touched. */
let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tugobo-backup-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function validState(leadCount = 1) {
  const leads = {};
  for (let i = 0; i < leadCount; i += 1) {
    leads[`ant-${String(i).padStart(3, "0")}`] = {
      leadId: `ant-${String(i).padStart(3, "0")}`,
      activity: [],
      createdAt: "2026-07-21T10:00:00.000Z",
      updatedAt: "2026-07-21T10:00:00.000Z",
      revision: 1,
    };
  }
  return {
    schemaVersion: 1,
    updatedAt: "2026-07-21T10:00:00.000Z",
    leads,
    roster: [],
    rosterUpdatedAt: null,
    dailyQueue: null,
  };
}

async function writeState(state) {
  await fs.writeFile(
    path.join(tempDir, "operational-state.json"),
    JSON.stringify(state, null, 2),
    "utf8",
  );
}

function exec(script) {
  return run(process.execPath, [script], {
    env: { ...process.env, LEAD_ENGINE_DATA_DIR: tempDir },
  });
}

async function listBackups() {
  const dir = path.join(tempDir, "backups");
  try {
    return (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

describe("backup script", () => {
  test("creates a backup of a valid state file", async () => {
    await writeState(validState());
    const { stdout } = await exec(BACKUP_SCRIPT);

    const backups = await listBackups();
    assert.equal(backups.length, 1);
    assert.match(stdout, /Backup written:/);
  });

  test("the backup is byte-identical to the source", async () => {
    const state = validState(3);
    await writeState(state);
    await exec(BACKUP_SCRIPT);

    const [name] = await listBackups();
    const copy = await fs.readFile(path.join(tempDir, "backups", name), "utf8");
    const source = await fs.readFile(path.join(tempDir, "operational-state.json"), "utf8");
    assert.equal(copy, source);
    assert.equal(Object.keys(JSON.parse(copy).leads).length, 3);
  });

  test("fails with a clear message when there is no source file", async () => {
    await assert.rejects(exec(BACKUP_SCRIPT), (err) => {
      assert.match(err.stderr, /No operational state file to back up/);
      return true;
    });
  });

  test("refuses to back up a corrupt state file", async () => {
    await fs.writeFile(path.join(tempDir, "operational-state.json"), "{broken", "utf8");
    await assert.rejects(exec(BACKUP_SCRIPT), (err) => {
      assert.match(err.stderr, /Refusing to back up/);
      return true;
    });
    assert.deepEqual(await listBackups(), []);
  });

  test("enforces retention of 20 snapshots", async () => {
    await writeState(validState());
    const backupDir = path.join(tempDir, "backups");
    await fs.mkdir(backupDir, { recursive: true });

    // 25 older snapshots, named so they sort before anything generated today.
    for (let i = 0; i < 25; i += 1) {
      await fs.writeFile(
        path.join(backupDir, `operational-state-2020010${1}-${String(i).padStart(6, "0")}.json`),
        "{}",
        "utf8",
      );
    }

    await exec(BACKUP_SCRIPT);
    const backups = await listBackups();
    assert.equal(backups.length, 20, "prunes down to the retention limit");
    // The snapshot just taken must be one of the survivors.
    assert.ok(backups.some((n) => !n.startsWith("operational-state-2020")));
  });

  test("does not print lead data or the environment", async () => {
    await writeState(validState());
    const { stdout } = await exec(BACKUP_SCRIPT);
    assert.equal(stdout.includes("ant-000"), false);
    assert.equal(stdout.includes("schemaVersion"), false);
  });
});

describe("verify script", () => {
  test("reports a valid file with counts only", async () => {
    await writeState(validState(2));
    const { stdout } = await exec(VERIFY_SCRIPT);
    assert.match(stdout, /state file is readable and structurally valid/);
    assert.match(stdout, /leads with operational state: 2/);
    assert.equal(stdout.includes("ant-000"), false);
  });

  test("treats a missing file as valid for a fresh install", async () => {
    const { stdout } = await exec(VERIFY_SCRIPT);
    assert.match(stdout, /No state file yet/);
  });

  test("fails on invalid JSON", async () => {
    await fs.writeFile(path.join(tempDir, "operational-state.json"), "{broken", "utf8");
    await assert.rejects(exec(VERIFY_SCRIPT), (err) => {
      assert.match(err.stderr, /not valid JSON/);
      return true;
    });
  });

  test("fails on an unexpected schema version", async () => {
    await writeState({ ...validState(), schemaVersion: 99 });
    await assert.rejects(exec(VERIFY_SCRIPT), (err) => {
      assert.match(err.stderr, /unexpected schemaVersion/);
      return true;
    });
  });
});
