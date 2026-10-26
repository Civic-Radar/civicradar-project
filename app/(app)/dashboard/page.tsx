
import Link from "next/link";
import { ArrowUpRight, BookOpen, Clock3, MapPin } from "lucide-react";
import { cardClasses } from "../../components/ui/Card";
import PageShell from "../../components/ui/PageShell";
import { getSupabaseClient } from "../../../lib/supabase";
import SetupMessage from "./SetupMessage";

export const dynamic = "force-dynamic";

type Town = {
  town_id: number;
  name: string;
  meeting_time_zone: string | null;
};

type Meeting = {
  meeting_id: number;
  town_id: number;
  title: string;
  start_at: string | null;
};

async function getMeetingData() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured.");
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Could not connect to Supabase.");
  }

  const [townsResult, meetingsResult] = await Promise.all([
    supabase
      .from("towns")
      .select("town_id, name, meeting_time_zone")
      .is("removed_at", null),

    supabase
      .from("meetings")
      .select("meeting_id, town_id, title, start_at")
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(6),
  ]);

  if (townsResult.error || meetingsResult.error) {
    throw new Error("Could not load meetings.");
  }

  return {
    towns: (townsResult.data ?? []) as Town[],
    meetings: (meetingsResult.data ?? []) as Meeting[],
  };
}

function formatMeetingTime(
  startAt: string,
  timeZone: string
) {
  const date = new Date(startAt);

  if (Number.isNaN(date.getTime())) {
    return "Date not available";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "Date not available";
  }
}

export default async function DashboardPage() {
  let towns: Town[] = [];
  let meetings: Meeting[] = [];
  let error = false;

  try {
    const data = await getMeetingData();
    towns = data.towns;
    meetings = data.meetings;
  } catch {
    error = true;
  }

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

        {error ? (
          <p className="rounded-md bg-warning/10 px-5 py-4 text-sm leading-relaxed text-warning">
            Could not load meetings. Please try again later.
          </p>
        ) : meetings.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
            <BookOpen aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
            <p className="text-base font-semibold">
              No matching meetings found.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {meetings.map((meeting) => {
              const town = towns.find(
                (item) => item.town_id === meeting.town_id
              );

              const timeZone =
                town?.meeting_time_zone || "America/New_York";

              return (
                // SRS-501.3: selecting a meeting opens its details page.
                <Link
                  key={meeting.meeting_id}
                  href={`/meetings/${meeting.meeting_id}`}
                  className={cardClasses("flex min-h-[210px] flex-col gap-4 transition first:border-accent-wash first:bg-accent-wash/50 hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:-translate-y-[3px]")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold leading-relaxed">
                      {meeting.title}
                    </h3>
                    <ArrowUpRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-fg-subtle" />
                  </div>

                  <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3 text-xs text-fg-muted md:border-t-0 md:pt-1">
                    <p className="flex items-start gap-2">
                      <MapPin aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                      Town: {town?.name ?? "Unknown town"}
                    </p>

                    <p className="flex items-start gap-2">
                      <Clock3 aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                      Date &amp; Time:{" "}
                      {meeting.start_at
                        ? formatMeetingTime(
                            meeting.start_at,
                            timeZone
                          )
                        : "Not available"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}
