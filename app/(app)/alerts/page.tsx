import PageShell from "../../components/ui/PageShell";
import AlertsList from "./AlertsList";

// SRS-404.3: in-app updates about the resident's meetings. The alerts depend on
// who is signed in, and the token is only in the browser, so they load in
// AlertsList.
export default function AlertsPage() {
  return (
    <PageShell title="Alerts">
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        New agenda items, documents, and recordings for meetings that matter to you.
      </p>

      <section className="mt-7 md:mt-9">
        <AlertsList />
      </section>
    </PageShell>
  );
}
