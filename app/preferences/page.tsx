import Link from 'next/link';
import TownPreferences from './TownPreferences';

export default function PreferencesPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Civic Radar</p>
        <h1 className="mt-4 text-3xl font-semibold">Preferences</h1>

        <TownPreferences />

        <p className="mt-8 text-sm text-slate-300">
          Back to <Link href="/" className="text-emerald-300 hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
