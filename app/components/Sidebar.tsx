"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-slate-900 p-6 text-white">
      <h2 className="mb-8 text-2xl font-bold">
        Civic Radar
      </h2>

      
<nav aria-label="Main navigation" className="space-y-2">
  <Link
  href="/dashboard"
  aria-current={pathname === "/dashboard" ? "page" : undefined}
  className={`block rounded-lg px-4 py-3 ${
    pathname === "/dashboard"
      ? "bg-teal-700 text-white font-semibold"
      : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`}
>
  Dashboard
</Link>

  <Link
    href="/meetings"
    className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    Meetings
  </Link>

  <Link
    href="/documents"
    className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    Documents
  </Link>

  <Link
    href="/officials"
    className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    Officials
  </Link>

  <Link
    href="/search"
    className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    Search
  </Link>

  <Link
    href="/preferences"
    className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    Preferences
  </Link>

  <Link
  href="/profile"
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
>
  Profile
</Link>
</nav>

    </aside>
  );
}
