import Link from 'next/link';
import TownPreferences from './TownPreferences';
import TopicPreferences from './TopicPreferences';

export default function PreferencesPage() {
  return (
    <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-raised bg-card/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">Civic Radar</p>
        <h1 className="mt-4 text-3xl font-semibold">Preferences</h1>

        <TownPreferences />
        <TopicPreferences />

        <p className="mt-8 text-sm text-fg-muted">
          Back to <Link href="/" className="text-accent hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
