
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Landmark,
  LayoutDashboard,
  CalendarDays,
  FileText,
  Users,
  Search,
  Settings,
  CircleUserRound,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Meetings", href: "/meetings", icon: CalendarDays },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Contact Extraction", href: "/extract", icon: Users },
  { name: "Search", href: "/search", icon: Search },
  { name: "Preferences", href: "/preferences", icon: Settings },
  { name: "Profile", href: "/profile", icon: CircleUserRound },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-slate-900 p-6 text-white">
      <div className="mb-8 flex items-center gap-3">
        <Landmark className="h-7 w-7 text-teal-400" />
        <h2 className="text-2xl font-bold">Civic Radar</h2>
      </div>

      <nav aria-label="Main navigation" className="space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                isActive
                  ? "bg-teal-700 font-semibold text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
