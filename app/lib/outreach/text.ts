/**
 * Text normalization and near-duplicate detection.
 *
 * "Regenerate gave me the same thing again" is the complaint this exists to
 * answer, so comparison has to be insensitive to the things that change while
 * the message stays the same: case, spacing, punctuation, and a swapped
 * greeting.
 */

/**
 * Lowercase, strip punctuation, collapse whitespace.
 *
 * Uses Turkish-aware lowercasing: the default `toLowerCase` maps "I" to "i"
 * rather than "ı", which would make two genuinely different Turkish words
 * compare equal.
 */
export function normalizeMessage(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  const normalized = normalizeMessage(text);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Jaccard similarity over word bigrams, in 0..1.
 *
 * Bigrams rather than single words because two messages about the same subject
 * share most of their vocabulary; word *order* is what actually differs when
 * the model rewrites rather than rethinks.
 */
export function similarity(a: string, b: string): number {
  const bigrams = (text: string): Set<string> => {
    const words = tokens(text);
    if (words.length < 2) return new Set(words);
    const out = new Set<string>();
    for (let i = 0; i < words.length - 1; i += 1) out.add(`${words[i]} ${words[i + 1]}`);
    return out;
  };

  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const gram of setA) if (setB.has(gram)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

/**
 * Above this, two messages read as the same message to a human.
 *
 * 0.6 was chosen so a rewritten opening plus a swapped CTA still counts as
 * duplicate (the middle carries most bigrams), while a genuine angle change
 * comfortably passes.
 */
export const DUPLICATE_THRESHOLD = 0.6;

export function isDuplicate(candidate: string, previous: readonly string[]): boolean {
  const normalized = normalizeMessage(candidate);
  if (normalized.length === 0) return true;
  return previous.some((prior) => {
    if (normalizeMessage(prior) === normalized) return true;
    return similarity(candidate, prior) >= DUPLICATE_THRESHOLD;
  });
}

/** True when the three tone variants are too alike to be worth offering. */
export function tonesAreDistinct(messages: readonly string[]): boolean {
  for (let i = 0; i < messages.length; i += 1) {
    for (let j = i + 1; j < messages.length; j += 1) {
      if (similarity(messages[i], messages[j]) >= DUPLICATE_THRESHOLD) return false;
    }
  }
  return true;
}
