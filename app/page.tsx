import Link from "next/link";
import { BellRing, CalendarDays, FileText, Landmark } from "lucide-react";

const features = [
  {
    icon: CalendarDays,
    title: "Meetings that matter to you",
    body: "Follow the towns and topics you care about, like housing or school budgets, and see the meetings that match.",
  },
  {
    icon: FileText,
    title: "Documents in plain language",
    body: "Read agendas and minutes with short AI summaries, always linked back to the original source.",
  },
  {
    icon: BellRing,
    title: "Alerts before you miss it",
    body: "Get notified about upcoming meetings, schedule changes, and new minutes, or a weekly email digest.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-surface text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Landmark className="h-7 w-7 text-sidebar-icon" aria-hidden="true" />
          <span className="text-xl font-bold sm:text-2xl">Civic Radar</span>
        </div>
        <Link href="/login" className="rounded-lg px-4 py-2 text-fg-muted transition-colors hover:bg-raised hover:text-white">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
        <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Know what your local government is deciding.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-fg-muted">
          Civic Radar keeps track of town meetings and published documents so you don&apos;t have to check every portal
          yourself. Now available for Salem, MA.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-sidebar-active px-6 py-3 font-semibold text-white transition hover:bg-sidebar-icon hover:text-surface"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-line px-6 py-3 font-semibold text-white transition hover:bg-raised"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section aria-label="Features" className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-xl border border-line bg-card p-6">
                <Icon className="h-6 w-6 text-sidebar-icon" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-semibold">{feature.title}</h2>
                <p className="mt-2 text-fg-muted">{feature.body}</p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
