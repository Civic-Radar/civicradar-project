"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
  { href: "/documents", label: "Documents" },
  { href: "/extract", label: "Contact Extraction" },
  { href: "/search", label: "Search" },
  { href: "/preferences", label: "Preferences" },
  { href: "/profile", label: "Profile" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-slate-900 p-6 text-white">
      <h2 className="mb-8 text-2xl font-bold">
        Civic Radar
      </h2>

      <nav aria-label="Main navigation" className="space-y-2">
        {links.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-lg px-4 py-3 ${
                active
                  ? "bg-teal-700 text-white font-semibold"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
