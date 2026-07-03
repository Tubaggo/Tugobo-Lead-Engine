/**
 * Hermes Monitor — Shadow Runtime (Sprint A2).
 *
 * Read-only orchestration preview on top of the Execution Runtime:
 * observes, decides in shadow, and prepares the founder brief. Executes
 * nothing. `buildHermesMonitor` is the public entry point A3 (Automation
 * Center) will consume.
 */

export * from "./types";
export { decideShadow } from "./decision-engine";
export { buildShadowTask } from "./task-builder";
export { buildShadowLedger } from "./shadow-ledger";
export { buildRuntimeEvents } from "./events";
export { buildMorningBriefPreview } from "./briefing";
export { buildHermesMonitor, buildHermesMonitorFromLeads } from "./monitor";
