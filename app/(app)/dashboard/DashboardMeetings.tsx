"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Clock3, MapPin } from "lucide-react";
import Badge from "../../components/ui/Badge";
import { cardClasses } from "../../components/ui/Card";
import SignedOutNotice from "../../components/ui/SignedOutNotice";
import { upcomingMeetings } from "../../../lib/dashboardMeetings";

// One meeting from GET /api/matching-meetings (only the fields shown here).
type Meeting = {
  meeting_id: number;
  title: string | null;
  start_at: string | null;
  is_canceled: boolean;
  town: string;
  meeting_time_zone: string;
  matched_topics: { topic: string; evidence_text: string }[];
  followed_directly: boolean;
};

type Status = "loading" | "signedOut" | "error" | "ready";

function formatMeetingTime(
  startAt: string,
  timeZone: string
) {
  const date = new Date(startAt);

  if (Number.isNaN(date.getTime())) {
    return "Date not available";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "Date not available";
  }
}

// SRS-501.1: the resident's upcoming matching meetings (followed towns and
// topics, plus meetings they follow directly), loaded with their token.
export default function DashboardMeetings() {
  const [status, setStatus] = useState<Status>("loading");
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setStatus("signedOut");
      return;
    }
    loadMeetings(token);
  }, []);

  async function loadMeetings(accessToken: string) {
    try {
      const res = await fetch("/api/matching-meetings", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // An expired token is fixed the same way as no token: sign in again.
      if (res.status === 401) {
        setStatus("signedOut");
        return;
      }
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.meetings)) {
        setStatus("error");
        return;
      }
      setMeetings(upcomingMeetings(data.meetings as Meeting[]));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <p role="status" className="text-sm text-fg-muted">
        Loading meetings…
      </p>
    );
  }

  if (status === "signedOut") {
    return <SignedOutNotice message="Sign in to see the meetings that match your towns and topics." />;
  }

  if (status === "error") {
    return (
      <p className="rounded-md bg-warning/10 px-5 py-4 text-sm leading-relaxed text-warning">
        Could not load meetings. Please try again later.
      </p>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
        <BookOpen aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
        <p className="text-base font-semibold">
          No matching meetings found.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {meetings.map((meeting) => (
        // SRS-501.3: selecting a meeting opens its details page.
        <Link
          key={meeting.meeting_id}
          href={`/meetings/${meeting.meeting_id}`}
          className={cardClasses("flex min-h-[210px] flex-col gap-4 transition first:border-accent-wash first:bg-accent-wash/50 hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:-translate-y-[3px]")}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold leading-relaxed">
              {meeting.title}
            </h3>
            <ArrowUpRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-fg-subtle" />
          </div>

          {/* A canceled meeting stays listed so the resident sees what happened.
              The other badges say why it is listed (SRS-401.5): the followed
              topic tags it matched, and whether the resident follows it. */}
          {meeting.is_canceled || meeting.matched_topics.length > 0 || meeting.followed_directly ? (
            <div className="flex flex-wrap gap-1.5">
              {meeting.is_canceled ? <Badge tone="danger">Canceled</Badge> : null}
              {meeting.matched_topics.map((tag) => (
                <Badge key={tag.topic} tone="success">{tag.topic}</Badge>
              ))}
              {meeting.followed_directly ? <Badge tone="info">Followed</Badge> : null}
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3 text-xs text-fg-muted md:border-t-0 md:pt-1">
            <p className="flex items-start gap-2">
              <MapPin aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              Town: {meeting.town}
            </p>

            <p className="flex items-start gap-2">
              <Clock3 aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              Date &amp; Time:{" "}
              <span className={meeting.is_canceled ? "line-through" : undefined}>
                {meeting.start_at
                  ? formatMeetingTime(
                      meeting.start_at,
                      meeting.meeting_time_zone || "America/New_York"
                    )
                  : "Not available"}
              </span>
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
