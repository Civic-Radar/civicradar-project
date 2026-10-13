
import { getSupabaseClient } from "../../../lib/supabase";

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
    <main className="min-w-0 flex-1 p-8 text-white">
      <h1 className="text-3xl font-bold">
        Civic Radar Dashboard
      </h1>

      <p className="mt-4 text-slate-300">
        Stay informed about your local government
        meetings and community updates.
      </p>

      <section className="mt-10">
        <h2 className="mb-5 text-2xl font-semibold">
          Upcoming Meetings
        </h2>

        {error ? (
          <p className="text-amber-300">
            Could not load meetings. Please try again later.
          </p>
        ) : meetings.length === 0 ? (
          <p className="text-slate-300">
            No matching meetings found.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {meetings.map((meeting) => {
              const town = towns.find(
                (item) => item.town_id === meeting.town_id
              );

              const timeZone =
                town?.meeting_time_zone || "America/New_York";

              return (
                <div
                  key={meeting.meeting_id}
                  className="rounded-xl border border-slate-700 bg-slate-900 p-6"
                >
                  <h3 className="text-xl font-semibold">
                    {meeting.title}
                  </h3>

                  <p className="mt-3 text-slate-300">
                    Town: {town?.name ?? "Unknown town"}
                  </p>

                  <p className="mt-2 text-slate-300">
                    Date &amp; Time:{" "}
                    {meeting.start_at
                      ? formatMeetingTime(
                          meeting.start_at,
                          timeZone
                        )
                      : "Not available"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
