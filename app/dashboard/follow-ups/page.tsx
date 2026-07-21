import FollowUpsPage from "@/app/components/FollowUpsPage";
import { requireAdminPage } from "@/app/lib/auth/require-admin-session";

/** Session-dependent; must never be statically cached. */
export const dynamic = "force-dynamic";

export default async function FollowUpsRoutePage() {
  await requireAdminPage();
  return <FollowUpsPage />;
}
