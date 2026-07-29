import HermesDailyWorkspace from "@/app/components/hermes-daily-loop/HermesDailyWorkspace";
import { requireAdminPage } from "@/app/lib/auth/require-admin-session";

/**
 * Protected Founder workspace for the Hermes daily loop (v3.8.1).
 *
 * Session-dependent, never statically cached — same guard every other
 * protected page in this app uses (`app/page.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function V2Page() {
  await requireAdminPage();
  return <HermesDailyWorkspace />;
}
