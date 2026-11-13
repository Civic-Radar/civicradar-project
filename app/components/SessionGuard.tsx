"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { sessionState } from "../../lib/session";

// Wraps every signed-in page (issue #521). The saved access token stops working
// about an hour after sign-in and is not renewed, so this checks it when a page
// opens, when the tab gets focus again, and every 30 seconds. When there is no
// token it goes to the login page; when the token has expired it forgets it and
// goes to the login page, which says the session expired. Pages show only once
// the token is known to be usable, so nothing is shown half signed in.
const CHECK_EVERY_MS = 30_000;

function readToken(): string | null {
  try {
    return localStorage.getItem("access_token");
  } catch {
    return null;
  }
}

function forgetToken() {
  try {
    localStorage.removeItem("access_token");
  } catch {
    // Storage can be blocked; there is nothing saved to remove then.
  }
}

export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function check(): boolean {
      const state = sessionState(readToken());
      if (state === "active") return true;
      if (state === "expired") forgetToken();
      window.location.replace(state === "expired" ? "/login?expired=1" : "/login");
      return false;
    }

    if (check()) setReady(true);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [pathname]);

  if (!ready) return null;
  return <>{children}</>;
}