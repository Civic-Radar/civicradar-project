'use client';

// Tabs for the Officials & Contacts area (AO). The sidebar has one "Contacts"
// item; these tabs move between its pages.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui/cx';

const TABS = [
  { name: 'Request', href: '/extract' },
  { name: 'Saved', href: '/extractions' }, // SRS-304.1, the Saved Extractions page
  { name: 'Officials', href: '/officials' }, // SRS-311.1
];

export default function ContactsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Contacts" className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'inline-flex min-h-11 items-center rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              active ? 'border-accent-strong bg-accent-strong text-on-dark' : 'border-line bg-card text-fg-muted hover:border-line-strong hover:bg-raised hover:text-fg',
            )}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
