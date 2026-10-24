import Link from "next/link";
import { Search } from "lucide-react";

// Placeholder so the Search navigation link (SRS-510.2) opens a page instead of a 404.
// The real search (SRS-506 and SRS-507) is planned for a later sprint.
export default function SearchPage() {
  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <h1 className="text-3xl font-bold">Search</h1>

      <section className="mt-8 max-w-2xl rounded-xl border border-line bg-card p-6">
        <Search className="h-8 w-8 text-sidebar-icon" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-semibold">Search is coming soon</h2>
        <p className="mt-2 text-fg-muted">
          You&apos;ll be able to search across meetings, documents, agenda items, and officials in one place.
          Until then, you can browse meetings and documents directly.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/meetings"
            className="rounded-lg border border-transparent bg-sidebar-active px-5 py-3 font-semibold text-on-dark transition hover:bg-sidebar-icon hover:text-surface"
          >
            Browse meetings
          </Link>
          <Link
            href="/documents"
            className="rounded-lg border border-line px-5 py-3 font-semibold text-fg transition hover:bg-raised"
          >
            Browse documents
          </Link>
        </div>
      </section>
    </main>
  );
}
