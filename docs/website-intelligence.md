# Website Intelligence — Tugobo Lead Engine

## Purpose

**Website intelligence** answers: *Does this property’s owned digital funnel support direct bookings and fast guest communication?*

Outputs feed **business signals** (e.g. conversion gap, weak booking funnel, WhatsApp presence) and future **screenshot-based** UX reviews.

## Strategy (phased)

### Phase A — Fast HTTP analysis (low cost)

- Fetch **homepage** HTML (and optionally `/rezervasyon`, `/booking`, `/contact`).
- Parse with **cheerio-like** server parser (add dependency when implementing).
- Detect:
  - `wa.me`, `api.whatsapp.com`, `whatsapp://` links
  - `tel:` links, prominent phone in header/footer
  - Obvious **booking engine** hosts (subset of known providers) or iframe src patterns
  - **CTA** text keywords (rezervasyon, book now, availability)
  - **Meta viewport**, basic mobile hints

### Phase B — Headless browser (medium cost)

- **Puppeteer** or Playwright for:
  - JS-rendered sites
  - Cookie banners that hide CTAs
  - Single Page Apps

Run in **sandboxed** workers with timeouts, domain allowlist, and size caps.

### Phase C — Performance & visual (higher cost)

- **Lighthouse** (or PageSpeed Insights API) for LCP, CLS, mobile score.
- **Screenshot** + **vision model** for “primary CTA visible?” and “above the fold clutter.”

Use **sparingly**—e.g. only for queue-top leads or on user request.

## Mobile performance checks

- Lighthouse **mobile** preset.
- Store: `performanceScore`, `lcp`, `cls`, `tti` (as available).
- Map to signal `poor_mobile_experience` only under clear thresholds to avoid false positives.

## CTA analysis

- DOM: buttons/links with booking-related text, size, position (heuristic: header/nav/floating).
- Vision: bounding box of primary CTA vs viewport.

## Booking engine detection

- **Allowlist** common engines (adjust for TR market).
- **Heuristic:** if “check availability” posts to external domain, tag `ota_or_engine_external`.
- **Human fallback:** low confidence → show “unknown” in UI.

## WhatsApp button detection

- Link patterns (above).
- **Icon** detection via vision optional.
- Output: `whatsapp_click_to_chat: boolean`, `location: header | floating | footer | unknown`.

## Lighthouse integration ideas

- Run in **CI** only for demo sites; production runs async with **quota** per org.
- Cache by `url + content_hash` with TTL 7–30 days.

## Puppeteer strategy

- **Isolate:** separate process/container; strict `page.setDefaultNavigationTimeout`.
- **Block** images/fonts optionally for speed (when not doing visual).
- **Robots.txt** and **terms** respect; user-agent identification; rate limit per domain.

## Outputs (example)

```typescript
type WebsiteIntelligenceReport = {
  url: string;
  fetchedAt: string;
  httpStatus: number;
  hasWhatsAppLink: boolean;
  hasTelLink: boolean;
  hasBookingCtaText: boolean;
  bookingEngineGuess: string | null;
  mobileViewportPresent: boolean;
  lighthouse?: { performance: number; accessibility: number };
  confidence: number;
  errors: string[];
};
```

---

*Website intelligence should default to **cheap checks**; expensive paths are **opt-in** or **top-of-queue** only.*
