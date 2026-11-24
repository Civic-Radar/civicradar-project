"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, MapPin } from "lucide-react";
import EmptyArt from "../../components/art/EmptyArt";
import LeafLoader from "../../components/art/LeafLoader";
import Badge from "../../components/ui/Badge";
import { cardClasses } from "../../components/ui/Card";
import SignedOutNotice from "../../components/ui/SignedOutNotice";
import { describeAlerts, type AlertRow, type AlertView } from "../../../lib/alerts";

type Status = "loading" | "signedOut" | "error" | "ready";

// SRS-404.3: loads the resident's in-app alerts with their token. This is the
// shell: it only fetches and keeps the result. lib/alerts.ts decides what each
// alert says, and AlertCards below draws it.
export default function AlertsList() {
  const [status, setStatus] = useState<Status>("loading");
  const [alerts, setAlerts] = useState<AlertView[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setStatus("signedOut");
      return;
    }
    loadAlerts(token);
  }, []);

  async function loadAlerts(accessToken: string) {
    try {
      const res = await fetch("/api/alerts", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.status === 401) {
        setStatus("signedOut");
        return;
      }
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.alerts)) {
        setStatus("error");
        return;
      }
      setAlerts(describeAlerts(data.alerts as AlertRow[]));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading") return <LeafLoader label="Loading alerts…" />;
  if (status === "signedOut") return <SignedOutNotice message="Sign in to see updates about your meetings." />;
  if (status === "error") {
    return (
      <p className="rounded-md bg-warning/10 px-5 py-4 text-sm leading-relaxed text-warning">
        Could not load alerts. Please try again later.
      </p>
    );
  }

  return <AlertCards alerts={alerts} />;
}

/**
 * The loaded alerts, newest first. Each one says what is new (agenda item,
 * document, or recording), names it, and links to its meeting (SRS-404.3).
 */
export function AlertCards({ alerts }: { alerts: AlertView[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-12 text-center text-fg-muted">
        <EmptyArt scene="tree" />
        <p className="text-base font-semibold text-fg">No updates yet.</p>
        <p className="max-w-sm text-sm">
          When a meeting you follow gets a new agenda item, document, or recording, it will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul aria-label="Meeting updates" className="flex flex-col gap-3">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <Link
            href={alert.meetingHref}
            className={cardClasses("flex flex-col gap-3 transition hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Badge tone="info">{alert.headline}</Badge>
                {alert.detail ? (
                  <p className="break-words text-base font-semibold leading-relaxed text-fg">{alert.detail}</p>
                ) : null}
              </div>
              <ArrowUpRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-fg-subtle" />
            </div>

            <div className="flex flex-col gap-1.5 text-xs text-fg-muted">
              <p className="font-semibold text-fg">{alert.meetingTitle}</p>
              <p className="flex items-start gap-2">
                <MapPin aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                {alert.town}
                {alert.meetingStart ? ` · ${alert.meetingStart}` : ""}
              </p>
              {alert.foundAt ? (
                <p className="flex items-start gap-2">
                  <Clock3 aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                  Found {alert.foundAt}
                </p>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
