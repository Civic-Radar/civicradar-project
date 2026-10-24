import Link from 'next/link';
import TownPreferences from './TownPreferences';
import TopicPreferences from './TopicPreferences';

export default function PreferencesPage() {
  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Civic Radar</p>
        <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Preferences</h1>

        <div className="mt-6 grid gap-4 md:mt-8 md:grid-cols-2 lg:gap-6">
          <TownPreferences />
          <TopicPreferences />
        </div>

        <p className="mt-8 text-sm text-fg-muted">
          Back to <Link href="/" className="text-accent hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
