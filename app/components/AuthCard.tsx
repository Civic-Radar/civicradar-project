import Link from "next/link";
import { Landmark } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { inputClasses } from "./ui/TextField";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

/**
 * Shared frame for the sign-in and sign-up pages, built from the shared
 * Button and TextField styles.
 */
export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen bg-card text-fg">
      <div className="m-auto w-full max-w-[540px] px-6 pb-[110px] pt-8 md:px-10 md:pb-[120px] md:pt-14">
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
    </main>
  );
}

export const inputClass = inputClasses();

export const primaryButtonClass = buttonClasses({ variant: "primary", fullWidth: true });
