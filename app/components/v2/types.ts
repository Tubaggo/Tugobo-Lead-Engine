export type V2Screen =
  | "revenue-queue"
  | "lead-list"
  | "icp-analysis"
  | "communication-intelligence"
  | "follow-ups"
  | "revenue-pipeline"
  | "revenue-forecast"
  | "revenue-risk"
  | "revenue-recovery"
  | "revenue-analytics"
  | "command-center"
  | "lead-import"
  | "data-sources"
  // v8.0 (Hermes Operating System): was "automation-center". Same screen,
  // same components — only the identity changed. Legacy persisted values are
  // migrated in active-screen-storage.ts.
  | "hermes";
