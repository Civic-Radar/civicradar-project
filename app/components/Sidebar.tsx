"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Landmark,
  LayoutDashboard,
  CalendarDays,
  FileText,
  Users,
  Search,
  Settings,
  CircleUserRound,
  RefreshCw,
  Menu,
  X,
} from "lucide-react";
import { useIsAdministrator } from "../admin/retrieval/useIsAdministrator";

// adminOnly entries show only when GET /api/role says the user is a system administrator.
const navigation: { name: string; href: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Meetings", href: "/meetings", icon: CalendarDays },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Contact Extraction", href: "/extract", icon: Users },
  { name: "Search", href: "/search", icon: Search },
  { name: "Preferences", href: "/preferences", icon: Settings },
  { name: "Profile", href: "/profile", icon: CircleUserRound },
  { name: "Retrieval", href: "/admin/retrieval", icon: RefreshCw, adminOnly: true },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const isAdministrator = useIsAdministrator();

  return (
    <ul className="space-y-1">
      {navigation.filter((item) => !item.adminOnly || isAdministrator === true).map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <li key={item.name}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-md p-3 text-sm font-medium transition-colors ${
                isActive ? "bg-sidebar-active text-on-dark" : "text-sidebar-muted hover:bg-sidebar-active hover:text-on-dark"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
              <span>{item.name}</span>
              {isActive ? <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-lime" aria-hidden="true" /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// The logo links to the dashboard, like a site's home link.
function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      aria-label="Civic Radar dashboard"
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-on-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-on-dark"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-lime/60 text-lime">
        <Landmark className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="font-display text-2xl leading-tight tracking-[-0.04em]">Civic Radar</span>
    </Link>
  );
}

/**
 * Primary navigation (SRS-510.1, SRS-510.2).
 * At 768px and wider it is the fixed sidebar. Below 768px it collapses into a
 * top bar with a menu button that opens the same links in a slide-out panel, so
 * pages keep the full screen width and every link stays reachable at 360px
 * (SRS-511.1, SRS-511.2).
 */
export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close the menu whenever the page changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While open: Escape closes it, focus moves into the panel, and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <>
      {/* Small screens: top bar with a menu button. */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-sidebar px-4 text-on-dark md:hidden">
        <Brand />
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label="Open navigation menu"
          className="flex h-11 w-11 items-center justify-center rounded-full text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-on-dark"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      </header>

      {/* Small screens: slide-out panel. */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            tabIndex={-1}
            onClick={closeMenu}
            className="absolute inset-0 h-full w-full cursor-default bg-backdrop/45 backdrop-blur-sm"
          />
          <div
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-sidebar px-4 pb-6 pt-12 text-on-dark shadow-2xl"
          >
            <div className="mb-12">
              <Brand onNavigate={() => setOpen(false)} />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMenu}
                aria-label="Close navigation menu"
                className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-on-dark transition-colors hover:bg-sidebar-active"
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Main navigation">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      ) : null}

      {/* 768px and wider: the fixed sidebar. */}
      <aside className="hidden w-60 shrink-0 bg-sidebar px-4 pb-4 pt-8 text-on-dark md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto">
        <div className="mb-12">
          <Brand />
        </div>
        <nav aria-label="Main navigation">
          <NavLinks pathname={pathname} />
        </nav>
      </aside>
    </>
  );
}
