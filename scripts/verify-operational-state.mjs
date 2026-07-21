#!/usr/bin/env node
/**
 * Checks that the operational state file is present, readable, and structurally
 * valid. Reports counts only — never lead names, notes, or the environment.
 *
 *   pnpm state:verify
 */

import fs from "node:fs/promises";
import path from "node:path";

const STATE_FILE_NAME = "operational-state.json";

function resolveDataDir() {
  const configured = (process.env.LEAD_ENGINE_DATA_DIR ?? "").trim();
  return configured.length > 0
    ? path.resolve(configured)
    : path.resolve(process.cwd(), ".data");
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const dataDir = resolveDataDir();
  const filePath = path.join(dataDir, STATE_FILE_NAME);

  console.log(`Data directory configured: ${process.env.LEAD_ENGINE_DATA_DIR ? "yes" : "no (using development fallback)"}`);

  try {
    await fs.access(dataDir);
  } catch {
    fail("data directory does not exist or is not accessible");
    return;
  }

  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    console.log("No state file yet — nothing has been saved. This is valid for a fresh install.");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("state file is not valid JSON");
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("state file is not an object");
    return;
  }
  if (parsed.schemaVersion !== 1) {
    fail(`unexpected schemaVersion (expected 1, found ${JSON.stringify(parsed.schemaVersion)})`);
    return;
  }
  if (!parsed.leads || typeof parsed.leads !== "object" || Array.isArray(parsed.leads)) {
    fail("`leads` is missing or not an object");
    return;
  }

  const leadCount = Object.keys(parsed.leads).length;
  const rosterCount = Array.isArray(parsed.roster) ? parsed.roster.length : 0;
  const activityCount = Object.values(parsed.leads).reduce(
    (sum, lead) => sum + (Array.isArray(lead?.activity) ? lead.activity.length : 0),
    0,
  );

  console.log("OK: state file is readable and structurally valid.");
  console.log(`  schemaVersion: ${parsed.schemaVersion}`);
  console.log(`  leads with operational state: ${leadCount}`);
  console.log(`  roster entries: ${rosterCount}`);
  console.log(`  activity entries: ${activityCount}`);
  console.log(`  daily queue present: ${parsed.dailyQueue ? "yes" : "no"}`);
  console.log(`  size on disk: ${Buffer.byteLength(raw, "utf8")} bytes`);

  const corrupt = (await fs.readdir(dataDir)).filter((n) => n.includes(".corrupt-"));
  if (corrupt.length > 0) {
    console.log(
      `  NOTE: ${corrupt.length} quarantined file(s) present in the data directory.`,
    );
  }
}

main().catch((err) => {
  console.error(`Verify failed: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exitCode = 1;
});
