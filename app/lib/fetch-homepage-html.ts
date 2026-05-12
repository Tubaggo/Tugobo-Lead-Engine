const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export type FetchHomepageHtmlOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

/** Result of a single homepage GET (no crawling, no subpages). */
export type FetchHomepageHtmlResult = {
  ok: boolean;
  url: string;
  html?: string;
  error?: string;
};

/**
 * Normalize user input to a single homepage URL (path `/`, no query or hash).
 * Only `http:` and `https:` are allowed.
 */
export function normalizeHomepageFetchUrl(input: string): { url: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "URL is empty" };
  try {
    const withProtocol = /^[a-z][-+.a-z0-9]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProtocol);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { error: `Unsupported URL scheme: ${u.protocol}` };
    }
    u.pathname = "/";
    u.search = "";
    u.hash = "";
    return { url: u.href };
  } catch {
    return { error: "Invalid URL" };
  }
}

/**
 * Fetches the homepage HTML for one URL with timeout and size limits.
 * Does not follow links or request additional pages.
 */
export async function fetchHomepageHtml(
  websiteUrl: string,
  options?: FetchHomepageHtmlOptions,
): Promise<FetchHomepageHtmlResult> {
  const raw = websiteUrl.trim();
  const norm = normalizeHomepageFetchUrl(websiteUrl);
  if ("error" in norm) {
    return { ok: false, url: raw, error: norm.error };
  }

  const targetUrl = norm.url;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; TugoboLeadEngine/1.0; +homepage-fetch)",
      },
    });

    const resolvedUrl = res.url || targetUrl;

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      const n = Number.parseInt(contentLength, 10);
      if (Number.isFinite(n) && n > maxBytes) {
        return {
          ok: false,
          url: resolvedUrl,
          error: `Response too large (${n} bytes, max ${maxBytes})`,
        };
      }
    }

    if (!res.ok) {
      return { ok: false, url: resolvedUrl, error: `HTTP ${res.status}` };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return {
        ok: false,
        url: resolvedUrl,
        error: `Response too large (${buf.byteLength} bytes, max ${maxBytes})`,
      };
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { ok: true, url: resolvedUrl, html };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    const legacyAbort = e instanceof Error && e.name === "AbortError";
    if (aborted || legacyAbort) {
      return {
        ok: false,
        url: targetUrl,
        error: `Request timed out after ${timeoutMs}ms`,
      };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, url: targetUrl, error: message };
  } finally {
    clearTimeout(timer);
  }
}
