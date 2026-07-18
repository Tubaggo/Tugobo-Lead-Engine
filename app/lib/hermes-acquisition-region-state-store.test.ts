import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseAcquisitionRegionStateFile,
  readAcquisitionRegionStateFromDisk,
  writeAcquisitionRegionStateToDisk,
  resolveAcquisitionRegionStateFilePath,
} from "./hermes-acquisition-region-state-store.ts";

let testDir: string;
let previousOverride: string | undefined;

beforeEach(() => {
  previousOverride = process.env.HERMES_RUNTIME_STATE_DIR;
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-region-state-test-"));
  process.env.HERMES_RUNTIME_STATE_DIR = testDir;
});

afterEach(() => {
  if (previousOverride === undefined) delete process.env.HERMES_RUNTIME_STATE_DIR;
  else process.env.HERMES_RUNTIME_STATE_DIR = previousOverride;
  fs.rmSync(testDir, { recursive: true, force: true });
});

test("an empty persisted state file yields an empty map", () => {
  writeAcquisitionRegionStateToDisk({});
  assert.deepEqual(readAcquisitionRegionStateFromDisk(), {});
});

test("a missing file never throws — yields an empty map", () => {
  assert.deepEqual(readAcquisitionRegionStateFromDisk(), {});
});

test("corrupted JSON degrades to an empty map instead of throwing", () => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(resolveAcquisitionRegionStateFilePath(), "{not valid json", "utf8");
  assert.deepEqual(readAcquisitionRegionStateFromDisk(), {});
});

test("an unknown file version is safely rejected", () => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(
    resolveAcquisitionRegionStateFilePath(),
    JSON.stringify({ version: 99, regionLastRunAt: { "istanbul-hotel": 123 } }),
    "utf8",
  );
  assert.deepEqual(readAcquisitionRegionStateFromDisk(), {});
});

test("invalid timestamps (negative, NaN-producing, non-finite) are ignored per-entry", () => {
  const raw = JSON.stringify({
    version: 1,
    regionLastRunAt: {
      "istanbul-hotel": 1780000000000,
      "antalya-hotel": -5,
      "izmir-hotel": Number.POSITIVE_INFINITY,
      "mugla-hotel": "not-a-number",
    },
  });
  const parsed = parseAcquisitionRegionStateFile(raw);
  assert.deepEqual(parsed, { "istanbul-hotel": 1780000000000 });
});

test("a valid state round-trips through write then read", () => {
  const state = { "istanbul-hotel": 1780000000000, "antalya-hotel": 1780000100000 };
  const result = writeAcquisitionRegionStateToDisk(state);
  assert.equal(result.ok, true);
  assert.deepEqual(readAcquisitionRegionStateFromDisk(), state);
});

test("the written file carries the versioned shape on disk", () => {
  writeAcquisitionRegionStateToDisk({ "istanbul-hotel": 42 });
  const raw = fs.readFileSync(resolveAcquisitionRegionStateFilePath(), "utf8");
  const onDisk = JSON.parse(raw);
  assert.equal(onDisk.version, 1);
  assert.deepEqual(onDisk.regionLastRunAt, { "istanbul-hotel": 42 });
});

test("no leftover temp files remain after a write — atomic rename cleans up", () => {
  writeAcquisitionRegionStateToDisk({ "istanbul-hotel": 1 });
  const entries = fs.readdirSync(testDir);
  assert.deepEqual(entries, ["acquisition-region-state.json"]);
});

test("many sequential writes serialize safely — the file always ends on the last write, never corrupted", () => {
  for (let i = 0; i < 25; i += 1) {
    const result = writeAcquisitionRegionStateToDisk({ "istanbul-hotel": i });
    assert.equal(result.ok, true);
  }
  assert.deepEqual(readAcquisitionRegionStateFromDisk(), { "istanbul-hotel": 24 });
  assert.deepEqual(fs.readdirSync(testDir), ["acquisition-region-state.json"]);
});

test("a filesystem write failure returns ok:false instead of throwing, and a subsequent read stays safe", () => {
  // Point the state dir at a path whose parent segment is a plain file —
  // mkdirSync/writeFileSync structurally cannot succeed there.
  const blockerFile = path.join(testDir, "blocker-file");
  fs.writeFileSync(blockerFile, "not a directory", "utf8");
  process.env.HERMES_RUNTIME_STATE_DIR = path.join(blockerFile, "nested");

  const result = writeAcquisitionRegionStateToDisk({ "istanbul-hotel": 1 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(typeof result.error, "string");

  // A read against the same broken path must also degrade safely.
  assert.deepEqual(readAcquisitionRegionStateFromDisk(), {});
});

test("the runtime-state directory is covered by .gitignore", () => {
  const gitignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
  assert.ok(
    gitignore.includes(".hermes-runtime"),
    ".gitignore must exclude the region-rotation runtime state directory",
  );
});
