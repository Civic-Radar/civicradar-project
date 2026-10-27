import PageShell from "../../components/ui/PageShell";
import DashboardMeetings from "./DashboardMeetings";
import SetupMessage from "./SetupMessage";

// The meetings depend on who is signed in, and the token is only in the
// browser, so the list loads in DashboardMeetings (SRS-501.1).
export default function DashboardPage() {
  return (
    <PageShell title="Civic Radar Dashboard">
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        Stay informed about your local government
        meetings and community updates.
      </p>

      <SetupMessage />

      <section className="mt-7 md:mt-9">
        <h2 className="mb-4 font-display text-2xl font-normal tracking-tight">
          Upcoming Meetings
        </h2>

        <DashboardMeetings />
      </section>
    </PageShell>
  );
}
