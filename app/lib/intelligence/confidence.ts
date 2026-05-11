export type SignalConfidence = "confirmed" | "likely" | "weak" | "missing";

export type MaturityLevel = "low" | "medium" | "high";

export function confidenceFromScore(
  score: number | undefined,
  thresholds: { confirmed: number; likely: number; weak: number },
): SignalConfidence {
  const s = Number.isFinite(score) ? Number(score) : 0;
  if (s >= thresholds.confirmed) return "confirmed";
  if (s >= thresholds.likely) return "likely";
  if (s >= thresholds.weak) return "weak";
  return "missing";
}

export function maturityFromScore(score: number | undefined): MaturityLevel {
  const s = Number.isFinite(score) ? Number(score) : 0;
  if (s >= 70) return "high";
  if (s >= 40) return "medium";
  return "low";
}
