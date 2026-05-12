/**
 * Infer {@link WebsiteIntelligenceSummary} fields from a single HTML document (homepage only).
 * Mirrors lightweight checks used by contact-finder without importing the route module.
 */

import type { WebsiteIntelligenceSummary } from "@/app/lib/leads";
import {
  confidenceFromScore,
  type SignalConfidence,
} from "@/app/lib/intelligence/confidence";

function hasMobileViewport(html: string): boolean {
  return /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);
}

function hasBookingCtaText(html: string): boolean {
  return /(rezervasyon|book\s*now|check\s*availability|availability|book\s*direct|hemen\s*rezervasyon)/i.test(
    html,
  );
}

function hasBookingEngineLink(html: string): boolean {
  return /(book(?:ing)?\.|airbnb\.|expedia\.|hotels\.com|synxis|cloudbeds|littlehotelier|sirvoy|innroad|booking\s*engine)/i.test(
    html,
  );
}

function hasContactPageLink(html: string): boolean {
  return /href=["'][^"']*(?:\/|^)(?:contact|iletisim|bize-ulasin|reach-us|reservation-contact)[^"']*["']/i.test(
    html,
  );
}

function hasInquiryForm(html: string): boolean {
  if (!/<form[\s>][\s\S]*?<\/form>/i.test(html)) return false;
  return /(name|id|placeholder)=["'][^"']*(?:message|inquiry|talep|rezervasyon|reservation|contact)[^"']*["']/i.test(
    html,
  );
}

function hasSocialIconsOrLinks(html: string): boolean {
  return /(instagram\.com|facebook\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com|linkedin\.com)/i.test(
    html,
  );
}

function hasOtaOutboundLinks(html: string): boolean {
  return /(booking\.com|airbnb\.|expedia\.|hotels\.com|tatilsepeti\.)/i.test(html);
}

function hasTelLink(html: string): boolean {
  return /tel:[^"'<>\s]+/i.test(html);
}

function calculateBookingFlowQuality(input: {
  bookingCta: boolean;
  bookingEngine: boolean;
  hasContactPage: boolean;
  hasInquiryForm: boolean;
  hasWhatsapp: boolean;
  hasSocialIcons: boolean;
  hasOtaOutboundLinks: boolean;
}): number {
  let score = 24;
  if (input.bookingCta) score += 22;
  if (input.bookingEngine) score += 24;
  if (input.hasContactPage) score += 10;
  if (input.hasInquiryForm) score += 10;
  if (input.hasWhatsapp) score += 12;
  if (input.hasSocialIcons) score += 8;
  if (input.hasOtaOutboundLinks) score -= 16;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateSocialLinksQuality(input: {
  instagram: number;
  whatsapp: number;
  emails: number;
  phones: number;
}): number {
  let s = 18;
  s += Math.min(28, input.instagram * 10);
  s += Math.min(22, input.whatsapp * 12);
  s += Math.min(18, input.emails * 6);
  s += Math.min(16, input.phones * 2);
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function inferWebsiteIntelligenceFromHomepageHtml(
  html: string,
  opts: {
    hasWhatsAppLink: boolean;
    hasInvalidWhatsAppLinks?: boolean;
    websiteCandidateMatch?: "strong" | "uncertain";
  },
): WebsiteIntelligenceSummary {
  const bookingCta = hasBookingCtaText(html);
  const bookingEngine = hasBookingEngineLink(html);
  const contactPage = hasContactPageLink(html);
  const inquiryForm = hasInquiryForm(html);
  const socialIcons = hasSocialIconsOrLinks(html);
  const otaOutbound = hasOtaOutboundLinks(html);
  const viewport = hasMobileViewport(html);
  const tel = hasTelLink(html);

  const bookingFlowQuality = calculateBookingFlowQuality({
    bookingCta,
    bookingEngine,
    hasContactPage: contactPage,
    hasInquiryForm: inquiryForm,
    hasWhatsapp: opts.hasWhatsAppLink,
    hasSocialIcons: socialIcons,
    hasOtaOutboundLinks: otaOutbound,
  });

  const socialLinksQuality = estimateSocialLinksQuality({
    instagram: socialIcons ? 1 : 0,
    whatsapp: opts.hasWhatsAppLink ? 1 : 0,
    emails: /@/.test(html) ? 1 : 0,
    phones: /\d{3}/.test(html) ? 1 : 0,
  });

  let confidenceBase =
    (bookingCta ? 24 : 0) +
    (bookingEngine ? 24 : 0) +
    (contactPage ? 12 : 0) +
    (inquiryForm ? 12 : 0) +
    (viewport ? 18 : 0) +
    (opts.hasWhatsAppLink ? 20 : 0) +
    (tel ? 14 : 0) +
    (socialIcons ? 8 : 0) -
    (otaOutbound ? 10 : 0);

  if (opts.websiteCandidateMatch === "strong") {
    confidenceBase = Math.max(confidenceBase, 78);
  } else if (opts.websiteCandidateMatch === "uncertain") {
    confidenceBase = Math.min(confidenceBase, 52);
  }

  const confidence = Math.max(0, Math.min(100, confidenceBase));
  const websiteConfidence: SignalConfidence = confidenceFromScore(confidence, {
    confirmed: 80,
    likely: 55,
    weak: 30,
  });

  return {
    hasWhatsAppLink: opts.hasWhatsAppLink,
    hasInvalidWhatsAppLinks: opts.hasInvalidWhatsAppLinks,
    hasTelLink: tel,
    hasBookingCtaText: bookingCta,
    hasBookingEngine: bookingEngine,
    hasContactPage: contactPage,
    hasInquiryForm: inquiryForm,
    hasSocialIcons: socialIcons,
    hasOtaOutboundLinks: otaOutbound,
    bookingFlowQuality,
    mobileViewportPresent: viewport,
    socialLinksQuality,
    confidence,
    websiteConfidence,
    websiteCandidateMatch: opts.websiteCandidateMatch,
  };
}
