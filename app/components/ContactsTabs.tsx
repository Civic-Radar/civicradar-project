'use client';

// Tabs for the Officials & Contacts area (AO). The sidebar has one "Contacts"
// item; these tabs move between its pages.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { name: 'Request', href: '/extract' },
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
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              active ? 'border-accent-strong bg-accent-vivid/10 font-semibold text-accent-soft' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg'
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
