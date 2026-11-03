import Link from "next/link";
import { Landmark } from "lucide-react";
import TownSquare from "./TownSquare";
import { buttonClasses } from "./ui/Button";
import { inputClasses } from "./ui/TextField";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

/**
 * Shared frame for the sign-in and sign-up pages, built from the shared
 * Button and TextField styles. The landing page's town square drawing sits in
 * a panel beside the form on wide screens and in a short strip above it on
 * smaller ones.
 */
export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen flex-col bg-card text-fg lg:flex-row">
      <div className="flex flex-1">
        <div className="mx-auto w-full max-w-[540px] px-6 pb-[110px] pt-8 md:px-10 md:pb-[120px] md:pt-14 lg:my-auto">
          <Link
            href="/"
            className="mb-7 flex min-h-12 w-fit items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:mb-12"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-lime/60 bg-accent-strong text-lime">
              <Landmark className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="font-display text-2xl leading-tight tracking-[-0.04em]">Civic Radar</span>
          </Link>

          <section>
            <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-[1.9] text-fg-muted">{subtitle}</p>
            {children}
          </section>
        </div>
      </div>

      {/* Town square art: a strip above the form below 1024px, a panel beside it from 1024px up. */}
      <div
        aria-hidden="true"
        className="relative order-first h-40 shrink-0 border-b border-line bg-accent-wash sm:h-48 lg:order-last lg:h-auto lg:w-[46%] lg:border-b-0 lg:border-l"
      >
        <p className="absolute inset-x-10 top-10 hidden font-display text-2xl leading-snug text-fg/85 lg:block">
          Every town decision, in one place.
        </p>
        <TownSquare variant="panel" className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
    </main>
  );
}

export const inputClass = inputClasses();

export const primaryButtonClass = buttonClasses({ variant: "primary", fullWidth: true });
