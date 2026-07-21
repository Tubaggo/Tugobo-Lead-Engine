import type { MetadataRoute } from "next";

/** Private founder tool — no crawler should index any part of it. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
