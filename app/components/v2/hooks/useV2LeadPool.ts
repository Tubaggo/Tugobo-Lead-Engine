"use client";

import { useMemo } from "react";
import type { ScoredLead } from "@/app/lib/leads";

/**
 * Merges static server-seed leads with client-imported leads.
 * Imported leads take precedence; seeds with matching IDs are dropped.
 * Stable reference — only re-derives when either input array identity changes.
 */
export function useV2LeadPool(
  initialLeads: ScoredLead[],
  importedLeads: ScoredLead[],
): ScoredLead[] {
  return useMemo(() => {
    if (importedLeads.length === 0) return initialLeads;
    const importedIds = new Set(importedLeads.map((l) => l.id));
    const baseOnly = initialLeads.filter((l) => !importedIds.has(l.id));
    return [...importedLeads, ...baseOnly];
  }, [initialLeads, importedLeads]);
}
