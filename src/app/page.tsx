import Sidebar from "@/components/Sidebar";
import SectionCard from "@/components/SectionCard";
import HospitalityCard from "@/components/HospitalityCard";
import AiActivityPanel from "@/components/AiActivityPanel";
import { sections } from "@/lib/sections";

export default function Home() {
  return (
    <div className="flex min-h-screen bg-[var(--page)]">
      <Sidebar />

      <main className="flex-1 px-6 py-8 md:px-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">
            TUAN OS Enterprise
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Unified control center for every AI-run business unit.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Sections
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {sections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HospitalityCard />
          <AiActivityPanel />
        </section>
      </main>
    </div>
  );
}
