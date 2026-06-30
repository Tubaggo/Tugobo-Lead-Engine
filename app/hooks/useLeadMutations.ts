"use client";

import { useState, useEffect, useCallback } from "react";
import type { LeadStatus, LeadStatusUpdate } from "@/app/lib/leads";
import { STATUS_ORDER } from "@/app/lib/leads";

const STORAGE_KEY = "tugobo-lead-engine:state-v1";

const DEFAULT_STATE: LeadStatusUpdate = {
  status: "new",
  note: "",
  updatedAt: null,
  contactedAt: null,
  channel: null,
  doNotContact: false,
  whatsappInvalid: false,
  contactAttempts: 0,
  lastContactedAt: null,
  nextFollowUpAt: null,
  pipelineStage: null,
  queuedToday: false,
  lastQueuedAt: null,
  followUpAfterHours: 24,
  repliedAt: null,
  meetingAt: null,
  wonAt: null,
  lostAt: null,
};

type StateMap = Record<string, LeadStatusUpdate>;

function loadStateMap(): StateMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as StateMap;
  } catch {
    return {};
  }
}

function saveStateMap(state: StateMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function normalizeStatus(raw: unknown): LeadStatus {
  return typeof raw === "string" && STATUS_ORDER.includes(raw as LeadStatus)
    ? (raw as LeadStatus)
    : "new";
}

function hydrateEntry(v: unknown): LeadStatusUpdate {
  if (!v || typeof v !== "object") return { ...DEFAULT_STATE };
  const o = v as Record<string, unknown>;
  return {
    ...DEFAULT_STATE,
    status: normalizeStatus(o.status),
    note: typeof o.note === "string" ? o.note : "",
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : null,
    contactedAt: typeof o.contactedAt === "number" ? o.contactedAt : null,
    channel:
      o.channel === "whatsapp" || o.channel === "phone" || o.channel === "instagram" || o.channel === "email"
        ? o.channel
        : null,
    doNotContact: Boolean(o.doNotContact),
    whatsappInvalid: Boolean(o.whatsappInvalid),
    contactAttempts: typeof o.contactAttempts === "number" && o.contactAttempts >= 0 ? Math.floor(o.contactAttempts) : 0,
    lastContactedAt: typeof o.lastContactedAt === "number" ? o.lastContactedAt : null,
    nextFollowUpAt: typeof o.nextFollowUpAt === "number" && o.nextFollowUpAt > 0 ? o.nextFollowUpAt : null,
    pipelineStage: typeof o.pipelineStage === "string" ? o.pipelineStage : null,
    queuedToday: Boolean(o.queuedToday),
    lastQueuedAt: typeof o.lastQueuedAt === "number" ? o.lastQueuedAt : null,
    followUpAfterHours: typeof o.followUpAfterHours === "number" && o.followUpAfterHours > 0 ? o.followUpAfterHours : 24,
    repliedAt: typeof o.repliedAt === "number" ? o.repliedAt : null,
    meetingAt: typeof o.meetingAt === "number" ? o.meetingAt : null,
    wonAt: typeof o.wonAt === "number" ? o.wonAt : null,
    lostAt: typeof o.lostAt === "number" ? o.lostAt : null,
  };
}

/**
 * Mutation hook for a single lead's workflow state.
 * Reads and writes `tugobo-lead-engine:state-v1` in localStorage —
 * the same storage key used by Dashboard.tsx, so mutations are immediately
 * visible when switching between V2 and the legacy view.
 */
export function useLeadMutations(leadId: string) {
  const [stateMap, setStateMap] = useState<StateMap>({});
  const [mounted, setMounted] = useState(false);
  // One-level undo: snapshot of the state before the last reversible action.
  const [prevState, setPrevState] = useState<LeadStatusUpdate | null>(null);

  useEffect(() => {
    const raw = loadStateMap();
    // Hydrate each entry so shape is consistent
    const hydrated: StateMap = {};
    for (const [k, v] of Object.entries(raw)) {
      hydrated[k] = hydrateEntry(v);
    }
    setStateMap(hydrated);
    setMounted(true);
  }, []);

  const leadState: LeadStatusUpdate = mounted
    ? (stateMap[leadId] ?? DEFAULT_STATE)
    : DEFAULT_STATE;

  // Low-level atomic patch — always uses functional updater for fresh state
  const applyPatch = useCallback(
    (id: string, updates: Partial<LeadStatusUpdate>) => {
      setStateMap((prev) => {
        const current = prev[id] ?? DEFAULT_STATE;
        const next: StateMap = {
          ...prev,
          [id]: {
            ...DEFAULT_STATE,
            ...current,
            ...updates,
            updatedAt: Date.now(),
          },
        };
        saveStateMap(next);
        return next;
      });
    },
    [],
  );

  /**
   * Mark contacted: increments contactAttempts, sets lastContactedAt,
   * schedules nextFollowUpAt (24h → 72h → null), auto-DNC at 3 attempts.
   * Mirrors `applyOutreachConfirmed` in Dashboard.tsx exactly.
   */
  const markContacted = useCallback(() => {
    // Capture snapshot before mutation for undo (skip if already DNC — no-op)
    if (!leadState.doNotContact) {
      setPrevState({ ...leadState });
    }
    setStateMap((prev) => {
      const current = prev[leadId] ?? DEFAULT_STATE;
      if (current.doNotContact) return prev;
      const ts = Date.now();
      const nextAttempts = (current.contactAttempts ?? 0) + 1;
      const nextFollowUpAt =
        nextAttempts === 1
          ? ts + 24 * 60 * 60 * 1000
          : nextAttempts === 2
            ? ts + 72 * 60 * 60 * 1000
            : null;
      const doNotContact = nextAttempts >= 3;
      const next: StateMap = {
        ...prev,
        [leadId]: {
          ...DEFAULT_STATE,
          ...current,
          status: "contacted",
          contactedAt: current.contactedAt ?? ts,
          lastContactedAt: ts,
          contactAttempts: nextAttempts,
          channel: "whatsapp",
          nextFollowUpAt,
          doNotContact,
          followUpAfterHours: nextAttempts === 1 ? 24 : 72,
          pipelineStage: doNotContact ? "do_not_contact" : "contacted",
          updatedAt: ts,
        },
      };
      saveStateMap(next);
      return next;
    });
  }, [leadId, leadState]);

  const markNoResponse = useCallback(() => {
    setPrevState({ ...leadState });
    applyPatch(leadId, { status: "needs_follow_up" });
  }, [leadId, applyPatch, leadState]);

  const markDoNotContact = useCallback(() => {
    setPrevState({ ...leadState });
    applyPatch(leadId, {
      doNotContact: true,
      status: "lost",
      pipelineStage: "do_not_contact",
      lostAt: Date.now(),
    });
  }, [leadId, applyPatch, leadState]);

  const scheduleFollowUp = useCallback(
    (timestamp: number) => {
      setPrevState({ ...leadState });
      applyPatch(leadId, { nextFollowUpAt: timestamp, status: "needs_follow_up" });
    },
    [leadId, applyPatch, leadState],
  );

  const setPipelineStage = useCallback(
    (stage: string) => {
      applyPatch(leadId, { pipelineStage: stage });
    },
    [leadId, applyPatch],
  );

  const setStatus = useCallback(
    (status: LeadStatus) => {
      const ts = Date.now();
      const extra: Partial<LeadStatusUpdate> = {};
      if (status === "won") extra.wonAt = ts;
      if (status === "lost") extra.lostAt = ts;
      if (status === "replied") extra.repliedAt = ts;
      if (status === "meeting") extra.meetingAt = ts;
      applyPatch(leadId, { status, ...extra });
    },
    [leadId, applyPatch],
  );

  const setWon = useCallback(() => setStatus("won"), [setStatus]);
  const setLost = useCallback(() => setStatus("lost"), [setStatus]);

  const updateNote = useCallback(
    (note: string) => {
      applyPatch(leadId, { note });
    },
    [leadId, applyPatch],
  );

  const reactivateLead = useCallback(() => {
    setPrevState({ ...leadState });
    applyPatch(leadId, {
      doNotContact: false,
      status: "new",
      pipelineStage: "new",
      nextFollowUpAt: null,
    });
  }, [leadId, applyPatch, leadState]);

  // Restores the exact state snapshot before the last reversible action.
  // Only affects localStorage mutation state — does not undo backend API calls.
  const undoLastAction = useCallback(() => {
    if (!prevState) return;
    const snapshot = prevState;
    setPrevState(null);
    setStateMap((prev) => {
      const next: StateMap = { ...prev, [leadId]: { ...snapshot } };
      saveStateMap(next);
      return next;
    });
  }, [leadId, prevState]);

  return {
    mounted,
    leadState,
    markContacted,
    markNoResponse,
    markDoNotContact,
    scheduleFollowUp,
    setPipelineStage,
    setStatus,
    setWon,
    setLost,
    updateNote,
    reactivateLead,
    undoLastAction,
    canUndo: prevState !== null,
  };
}
