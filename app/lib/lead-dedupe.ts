/**
 * Lead dedupe keys (Sprint C1 — Autonomous Lead Acquisition).
 *
 * The canonical module for the duplicate-check keys the import pipeline has
 * always used. These helpers previously lived as private mirrors inside
 * `useLeadImport.ts` (itself a mirror of `Dashboard.tsx`); Sprint C1 needs
 * the same keys server-side (the acquisition run registry must skip a
 * business it already handed off), so the pure functions moved here and
 * `useLeadImport` now imports them instead of keeping its own copy. The key
 * formats are unchanged:
 *
 *   - name|city  → same format as `leadDedupeKey` in `generate.ts`
 *   - phone:<digits>  → normalized TR phone (leading 00/90 stripped)
 *   - web:<hostname>  → protocol/www stripped hostname
 *
 * Deliberately dependency-free (no "@/" imports, no React, no browser API)
 * so it runs under plain `node --test` — the same convention every Hermes
 * lib module follows.
 */

export type LeadDedupeFields = {
  name: string;
  city: string;
  phone?: string | null;
  website?: string | null;
};

/** Same format as `leadDedupeKey` (generate.ts) — kept byte-identical so old and new keys always match. */
export function leadNameCityKey(name: string, city: string): string {
  return `${name.toLowerCase().trim()}|${city.toLowerCase().trim()}`;
}

export function normalizePhoneForDedupe(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  while (d.startsWith("00") && d.length > 2) d = d.slice(2);
  if (d.startsWith("90") && d.length > 2) d = d.slice(2);
  return d.length >= 10 ? d : null;
}

export function normalizeWebsiteForDedupe(web: string | null | undefined): string | null {
  if (!web?.trim()) return null;
  const h = web
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return h || null;
}

/** Every duplicate-check key a lead answers to — name|city always, phone/web when present. */
export function leadDedupeKeysFor(lead: LeadDedupeFields): string[] {
  const keys: string[] = [leadNameCityKey(lead.name, lead.city)];
  const pk = normalizePhoneForDedupe(lead.phone);
  if (pk) keys.push(`phone:${pk}`);
  const wk = normalizeWebsiteForDedupe(lead.website);
  if (wk) keys.push(`web:${wk}`);
  return keys;
}

export function buildDedupeKeySet(leads: LeadDedupeFields[]): Set<string> {
  const s = new Set<string>();
  for (const l of leads) {
    for (const k of leadDedupeKeysFor(l)) s.add(k);
  }
  return s;
}

export function isDuplicateAgainstKeySet(lead: LeadDedupeFields, keys: ReadonlySet<string>): boolean {
  for (const k of leadDedupeKeysFor(lead)) {
    if (keys.has(k)) return true;
  }
  return false;
}
