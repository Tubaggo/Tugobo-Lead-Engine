import type { NextConfig } from "next";

/**
 * Baseline security headers for a private, single-operator app.
 *
 * A full Content-Security-Policy is deliberately NOT set here: this app uses
 * next/font and inline Tailwind styles, and a rushed CSP would break the
 * dashboard. That belongs in the deployment sprint alongside the Nginx config.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app is never intended to be embedded anywhere.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Private tool: keep it out of every index, not just via robots.txt.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Authenticated responses must never be stored by a shared cache.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
