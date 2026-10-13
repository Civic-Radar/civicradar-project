export default function Home() {
  return (
    <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6">
      <section className="w-full max-w-3xl rounded-3xl border border-raised bg-card/80 p-10 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">SSU Starter App</p>
        <h1 className="mt-4 text-4xl font-semibold">Professor Brockenbrough's Next Starter App</h1>
        <p className="mt-4 max-w-2xl text-fg-muted">
          This starter includes login and register routes, Tailwind styling, and backend tests ready for students to clone and extend.
        </p>
        <div className="mt-8 flex flex-wrap gap-4 text-sm text-fg-soft">
          <a href="/login" className="rounded-full border border-line bg-raised px-4 py-2 hover:border-accent-strong hover:text-accent-soft">Go to login</a>
          <a href="/register" className="rounded-full border border-line bg-raised px-4 py-2 hover:border-accent-strong hover:text-accent-soft">Go to register</a>
          <a href="/profile" className="rounded-full border border-line bg-raised px-4 py-2 hover:border-accent-strong hover:text-accent-soft">Go to profile</a>
          <a href="/preferences" className="rounded-full border border-line bg-raised px-4 py-2 hover:border-accent-strong hover:text-accent-soft">Go to preferences</a>
          <a href="/extract" className="rounded-full border border-line bg-raised px-4 py-2 hover:border-accent-strong hover:text-accent-soft">Request contact extraction</a>
          <a href="/meetings" className="rounded-full border border-line bg-raised px-4 py-2 hover:border-accent-strong hover:text-accent-soft">Go to meetings</a>
          <span className="rounded-full border border-line bg-raised px-4 py-2">Tailwind CSS</span>
          <span className="rounded-full border border-line bg-raised px-4 py-2">Supabase auth routes</span>
        </div>
      </section>
    </main>
  );
}
