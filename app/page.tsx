import Link from "next/link";
import { BellRing, CalendarDays, FileText, Landmark } from "lucide-react";
import { buttonClasses } from "./components/ui/Button";

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
    <main className="min-h-screen bg-surface text-fg">
      <div className="mx-auto max-w-[1400px] px-5 pb-[100px] pt-5 md:px-8 md:pb-[110px] md:pt-6 lg:px-16">
        <header className="flex items-center justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-lime/60 bg-accent-strong text-lime">
              <Landmark className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="font-display text-2xl leading-tight tracking-[-0.04em]">Civic Radar</span>
          </div>
          <Link href="/login" className={buttonClasses({ variant: "secondary" })}>
            Sign in
          </Link>
        </header>

        <section className="py-10 md:py-16">
          <h1 className="max-w-3xl font-display text-5xl font-normal leading-tight tracking-tight lg:text-6xl xl:text-7xl">
            Know what your local government is deciding.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-[1.9] text-fg-muted">
            Civic Radar keeps track of town meetings and published documents so you don&apos;t have to check every portal
            yourself.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClasses({ variant: "primary", className: "px-6" })}>
              Create an account
            </Link>
            <Link href="/login" className={buttonClasses({ variant: "secondary", className: "px-6" })}>
              Sign in
            </Link>
          </div>
        </section>

        <section aria-label="Features" className="grid gap-8 border-t border-line pb-14 pt-10 md:grid-cols-3 md:gap-10">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title}>
                <Icon className="h-6 w-6" strokeWidth={1.4} aria-hidden="true" />
                <h2 className="mb-3 mt-5 text-lg font-semibold">{feature.title}</h2>
                <p className="text-sm text-fg-muted">{feature.body}</p>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
