import Link from "next/link";
import { Landmark } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import Card from "./ui/Card";
import { inputClasses } from "./ui/TextField";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

/**
 * Shared frame for the sign-in and sign-up pages, built from the shared
 * Card, Button and TextField styles.
 */
export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12 text-fg">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <Landmark className="h-8 w-8 text-sidebar-icon" aria-hidden="true" />
          <span className="text-2xl font-bold">Civic Radar</span>
        </Link>

        <Card as="section" className="sm:p-8">
          <h1 className="font-display text-3xl font-normal leading-tight">{title}</h1>
          <p className="mt-2 text-fg-muted">{subtitle}</p>
          {children}
        </Card>
      </div>
    </main>
  );
}

export const inputClass = inputClasses("mt-1");

export const primaryButtonClass = buttonClasses({ variant: "primary", fullWidth: true });
