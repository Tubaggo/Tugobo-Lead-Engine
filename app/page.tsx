import Dashboard from "@/app/components/Dashboard";
import { scoreAll } from "@/app/lib/leads";

export default function Home() {
  const leads = scoreAll();
  return (
    <main className="flex flex-1 flex-col">
      <Dashboard leads={leads} />
    </main>
  );
}
