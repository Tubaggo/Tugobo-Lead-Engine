import { NextResponse } from "next/server";

type ContactFinderType =
  | "VERIFIED_WHATSAPP"
  | "GENERATED_WHATSAPP"
  | "PHONE_ONLY"
  | "instagram"
  | "email"
  | "website";

type ContactFinderConfidence = "high" | "medium" | "low";

type ContactFinderResponse = {
  bestContactType: ContactFinderType;
  bestContactValue: string;
  confidence: ContactFinderConfidence;
  foundPhones: string[];
  foundEmails: string[];
  foundInstagram: string[];
  foundWhatsapp: string[];
  source:
    | "Website WhatsApp link"
    | "Website phone number"
    | "Website Instagram link"
    | "Website email"
    | "Website homepage";
  reason: string;
};

function normalizeWebsite(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.map((v) => v.trim()).filter(Boolean)));
}

function extractInstagramLinks(html: string): string[] {
  const matches = html.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi) ?? [];
  return uniq(matches.map((m) => m.replace(/[),.;]+$/g, "")));
}

function extractWhatsappLinks(html: string): string[] {
  const matches =
    html.match(
      /https?:\/\/(?:wa\.me|(?:api\.)?whatsapp\.com)\/[^\s"'<>]*/gi,
    ) ?? [];
  return uniq(matches.map((m) => m.replace(/[),.;]+$/g, "")));
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return uniq(matches);
}

function classifyPhones(text: string): { mobile: string[]; landline: string[] } {
  const candidates = text.match(/(?:\+?90|0)?\s*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g) ?? [];
  const mobile: string[] = [];
  const landline: string[] = [];

  for (const candidate of candidates) {
    let d = candidate.replace(/\D/g, "");
    if (!d) continue;
    while (d.startsWith("00") && d.length > 2) d = d.slice(2);
    if (d.startsWith("90") && d.length > 2) d = d.slice(2);

    if (d.length === 10) {
      if (d.startsWith("5")) mobile.push(candidate.trim());
      else if (d.startsWith("2") || d.startsWith("3")) landline.push(candidate.trim());
      continue;
    }
    if (d.length === 11 && d.startsWith("0")) {
      if (d[1] === "5") mobile.push(candidate.trim());
      else if (d[1] === "2" || d[1] === "3") landline.push(candidate.trim());
    }
  }

  return { mobile: uniq(mobile), landline: uniq(landline) };
}

function toWaMeFromPhone(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  while (d.startsWith("00") && d.length > 2) d = d.slice(2);
  if (d.startsWith("90")) {
    return d.length >= 12 ? `https://wa.me/${d}` : null;
  }
  if (d.startsWith("0")) {
    const intl = `90${d.slice(1)}`;
    return intl.length >= 12 ? `https://wa.me/${intl}` : null;
  }
  if (d.length === 10) {
    return `https://wa.me/90${d}`;
  }
  return null;
}

function normalizeWhatsAppLinkToWaMe(link: string): string {
  const raw = link.trim();
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();

    if (host === "wa.me" || host.endsWith(".wa.me")) {
      const phone = u.pathname.replace(/\//g, "");
      if (!phone) return raw;
      const text = u.searchParams.get("text");
      return text
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/${phone}`;
    }

    if (host.includes("whatsapp.com")) {
      const pathParts = u.pathname.split("/").filter(Boolean);
      const sendPhone = u.searchParams.get("phone");
      const pathPhone = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;
      const phone = (sendPhone || pathPhone || "").replace(/\D/g, "");
      if (!phone) return raw;
      const text = u.searchParams.get("text");
      return text
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/${phone}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function pickBestContact(data: {
  website: string;
  whatsapp: string[];
  mobile: string[];
  landline: string[];
  instagram: string[];
  emails: string[];
}): ContactFinderResponse {
  if (data.whatsapp.length > 0) {
    const normalized = normalizeWhatsAppLinkToWaMe(data.whatsapp[0]);
    return {
      bestContactType: "VERIFIED_WHATSAPP",
      bestContactValue: normalized,
      confidence: "high",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website WhatsApp link",
      reason: "WhatsApp link found on website",
    };
  }

  if (data.mobile.length > 0) {
    const generated = toWaMeFromPhone(data.mobile[0]);
    if (generated) {
      return {
        bestContactType: "GENERATED_WHATSAPP",
        bestContactValue: generated,
        confidence: "medium",
        foundPhones: [...data.mobile, ...data.landline],
        foundEmails: data.emails,
        foundInstagram: data.instagram,
        foundWhatsapp: data.whatsapp,
        source: "Website phone number",
        reason: "Phone number is active on WhatsApp",
      };
    }
    return {
      bestContactType: "PHONE_ONLY",
      bestContactValue: data.mobile[0],
      confidence: "medium",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website phone number",
      reason: "No WhatsApp detected",
    };
  }

  if (data.landline.length > 0) {
    return {
      bestContactType: "PHONE_ONLY",
      bestContactValue: data.landline[0],
      confidence: "low",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website phone number",
      reason: "No WhatsApp detected",
    };
  }

  if (data.instagram.length > 0) {
    return {
      bestContactType: "instagram",
      bestContactValue: data.instagram[0],
      confidence: "medium",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website Instagram link",
      reason: "Instagram link found on homepage",
    };
  }

  if (data.emails.length > 0) {
    return {
      bestContactType: "email",
      bestContactValue: data.emails[0],
      confidence: "medium",
      foundPhones: [...data.mobile, ...data.landline],
      foundEmails: data.emails,
      foundInstagram: data.instagram,
      foundWhatsapp: data.whatsapp,
      source: "Website email",
      reason: "Email address found on homepage",
    };
  }

  return {
    bestContactType: "website",
    bestContactValue: data.website,
    confidence: data.landline.length > 0 ? "low" : "medium",
    foundPhones: [...data.mobile, ...data.landline],
    foundEmails: data.emails,
    foundInstagram: data.instagram,
    foundWhatsapp: data.whatsapp,
    source: "Website homepage",
    reason:
      data.landline.length > 0
        ? "Only landline found"
        : "No direct channel found; fallback to website homepage",
  };
}

export async function POST(req: Request) {
  let body: { website?: string };
  try {
    body = (await req.json()) as { website?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = normalizeWebsite(body.website ?? "");
  if (!url) {
    return NextResponse.json({ error: "website is required" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TugoboContactFinder/1.0)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Website request failed (${res.status})` },
        { status: 502 },
      );
    }

    const html = await res.text();
    const visibleText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");

    const foundWhatsapp = extractWhatsappLinks(html);
    const foundInstagram = extractInstagramLinks(html);
    const foundEmails = extractEmails(visibleText);
    const phones = classifyPhones(visibleText);

    const result = pickBestContact({
      website: url,
      whatsapp: foundWhatsapp,
      mobile: phones.mobile,
      landline: phones.landline,
      instagram: foundInstagram,
      emails: foundEmails,
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch or analyze website" },
      { status: 502 },
    );
  }
}
