import Link from "next/link";
import { Landmark } from "lucide-react";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

/**
 * Shared frame for the sign-in and sign-up pages, styled to match the
 * sidebar and dashboard (Civic Radar logo, slate cards, teal accents).
 */
export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12 text-white">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <Landmark className="h-8 w-8 text-sidebar-icon" aria-hidden="true" />
          <span className="text-2xl font-bold">Civic Radar</span>
        </Link>

        <section className="rounded-xl border border-line bg-card p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-fg-muted">{subtitle}</p>
          {children}
        </section>
      </div>
    </main>
  );
}

export const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-surface px-4 py-3 text-white outline-none transition placeholder:text-fg-faint focus:border-sidebar-icon";

export const primaryButtonClass =
  "w-full rounded-lg bg-sidebar-active px-4 py-3 font-semibold text-white transition hover:bg-sidebar-icon hover:text-surface disabled:cursor-not-allowed disabled:opacity-70";
