"use client";

import { useEffect, useRef } from "react";

/**
 * Publishes a sanitized mission-state snapshot to the server's Mission State
 * Bridge (v5.1.2) whenever the founder-approval / courier-draft / delivery-
 * gateway status of the *selected* mission changes.
 *
 * Only ever sends `missionId`, `leadId`, and three status enums — never
 * message text, never a recipient phone, never a provider credential, never
 * an approval boolean. The server (`hermes-mission-approval-resolver.ts`)
 * still decides what those statuses mean; this hook only reports state, it
 * never asserts authority.
 *
 * Debounced against redundant publishes: a ref remembers the last payload
 * key actually sent, and the effect is a no-op if nothing changed since
 * then — this does not fire on every render, and does not poll.
 */

export type BridgeFounderApprovalStatus = "approved" | "pending" | "rejected" | "missing";
export type BridgeCourierDraftStatus = "approved" | "draft" | "missing";
export type BridgeDeliveryGatewayStatus = "allowed" | "blocked" | "missing";

export type UseHermesMissionStateBridgePublisherInput = {
  missionId: string | null | undefined;
  leadId: string | null | undefined;
  founderApprovalStatus: BridgeFounderApprovalStatus;
  courierDraftStatus: BridgeCourierDraftStatus;
  deliveryGatewayStatus: BridgeDeliveryGatewayStatus;
};

export function useHermesMissionStateBridgePublisher(input: UseHermesMissionStateBridgePublisherInput): void {
  const { missionId, leadId, founderApprovalStatus, courierDraftStatus, deliveryGatewayStatus } = input;
  const lastPublishedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!missionId || !leadId) return;

    const key = [missionId, leadId, founderApprovalStatus, courierDraftStatus, deliveryGatewayStatus].join("|");
    if (lastPublishedKey.current === key) return;
    lastPublishedKey.current = key;

    void fetch("/api/hermes/mission-state/snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ missionId, leadId, founderApprovalStatus, courierDraftStatus, deliveryGatewayStatus }),
    }).catch(() => {
      // Best-effort — a failed publish just leaves the resolver "unresolved"
      // server-side; never surfaced as an error to the founder.
    });
  }, [missionId, leadId, founderApprovalStatus, courierDraftStatus, deliveryGatewayStatus]);
}
