/**
 * Ids of the bundled demo hotels, as data rather than as an import.
 *
 * The write path needs to know these ids: they are real leads the founder can
 * operate on, but they never reach `file.roster` — the roster holds *imported*
 * leads only — so a membership check built on the roster alone would refuse to
 * save a note against one.
 *
 * Copied here instead of imported from `leads.ts` on purpose. That module pulls
 * in the whole scoring and intelligence stack, and the operational-state layer
 * is deliberately dependency-free so it runs under `node --test` without a
 * bundler. Thirty short strings are a cheaper price than that coupling.
 *
 * `seed-lead-ids.test.ts` reads `leads.ts` and fails if the two ever disagree,
 * so this cannot drift silently.
 */
export const SEED_LEAD_IDS: readonly string[] = [
  "ant-001",
  "bod-002",
  "kap-003",
  "alc-004",
  "fet-005",
  "kas-006",
  "sap-007",
  "abn-008",
  "ole-009",
  "ist-010",
  "ces-011",
  "kal-012",
  "sir-013",
  "ayv-014",
  "fet-015",
  "dat-016",
  "ass-017",
  "uzu-018",
  "agv-019",
  "izm-020",
  "tra-021",
  "mar-022",
  "boz-023",
  "akc-024",
  "ese-025",
  "sap-026",
  "akb-027",
  "nev-028",
  "gum-029",
  "alc-030",
];
