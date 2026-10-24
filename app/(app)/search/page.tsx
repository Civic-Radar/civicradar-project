import Link from "next/link";
import { Search } from "lucide-react";
import { buttonClasses } from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageShell from "../../components/ui/PageShell";

// Placeholder so the Search navigation link (SRS-510.2) opens a page instead of a 404.
// The real search (SRS-506 and SRS-507) is planned for a later sprint.
export default function SearchPage() {
  return (
    <PageShell title="Search">
      <Card as="section" className="mt-8 max-w-2xl">
        <Search className="h-8 w-8 text-sidebar-icon" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-semibold">Search is coming soon</h2>
        <p className="mt-2 text-fg-muted">
          You&apos;ll be able to search across meetings, documents, agenda items, and officials in one place.
          Until then, you can browse meetings and documents directly.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/meetings" className={buttonClasses({ variant: "primary" })}>
            Browse meetings
          </Link>
          <Link href="/documents" className={buttonClasses({ variant: "secondary" })}>
            Browse documents
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
