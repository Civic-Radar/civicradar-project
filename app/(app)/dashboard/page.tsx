const meetings = [
  {
    id: 1,
    title: "City Council Meeting",
    town: "Salem, MA",
    startTime: "October 14, 2026 at 7:00 PM ET",
  },
  {
    id: 2,
    title: "Planning Board Meeting",
    town: "Salem, MA",
    startTime: "October 19, 2026 at 6:30 PM ET",
  },
  {
    id: 3,
    title: "School Committee Meeting",
    town: "Beverly, MA",
    startTime: "October 22, 2026 at 6:00 PM ET",
  },
];

export default function DashboardPage() {
  return (
      <main className="min-w-0 flex-1 p-8 text-white">
      <h1 className="text-3xl font-bold">
        Civic Radar Dashboard
      </h1>

      <p className="mt-4 text-slate-300">
        Stay informed about your local government meetings
        and community updates.
      </p>

      <section className="mt-10">
        <h2 className="mb-5 text-2xl font-semibold">
          Upcoming Meetings
        </h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="rounded-xl border border-slate-700 bg-slate-900 p-6"
            >
              <h3 className="text-xl font-semibold">
                {meeting.title}
              </h3>

              <p className="mt-3 text-slate-300">
                Town: {meeting.town}
              </p>

              <p className="mt-2 text-slate-300">
                Date & Time: {meeting.startTime}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
