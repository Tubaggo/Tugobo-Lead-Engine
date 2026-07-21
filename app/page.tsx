import Dashboard from "@/app/components/Dashboard";
import { scoreAll } from "@/app/lib/leads";
import { isDemoDataAllowed } from "@/app/lib/auth/env";
import { requireAdminPage } from "@/app/lib/auth/require-admin-session";

/** Session-dependent and demo-gated; must never be statically cached. */
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireAdminPage();

  // The bundled hotels are seed data. In production they are withheld unless
  // explicitly re-enabled, so demo records can never be worked as real leads.
  const demoAllowed = isDemoDataAllowed();
  const leads = demoAllowed ? scoreAll() : [];

  return (
    <main className="flex flex-1 flex-col">
      {demoAllowed ? null : (
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-8">
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Örnek veri kapalı. Listede yalnızca içe aktardığınız gerçek leadler
            görünür.
          </p>
        </div>
      )}
      <Dashboard leads={leads} />
    </main>
  );
}
