"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, MapPin } from "lucide-react";
import EmptyArt from "../../components/art/EmptyArt";
import LeafLoader from "../../components/art/LeafLoader";
import Badge from "../../components/ui/Badge";
import { cardClasses } from "../../components/ui/Card";
import SignedOutNotice from "../../components/ui/SignedOutNotice";
import { DASHBOARD_MEETING_LIMIT, formatDashboardStart, upcomingMeetings } from "../../../lib/dashboardMeetings";

// One meeting from GET /api/matching-meetings (only the fields shown here).
export type Meeting = {
  meeting_id: number;
  title: string | null;
  start_at: string | null;
  is_canceled: boolean;
  town: string;
  meeting_time_zone: string;
  matched_topics: { topic: string; evidence_text: string }[];
  followed_directly: boolean;
};

// A followed town whose latest source check did not succeed (SRS-401.11).
export type FailedTown = { town_id: number; name: string };

type Status = "loading" | "signedOut" | "error" | "ready";

// SRS-501.1: the resident's upcoming matching meetings (followed towns and
// topics, plus meetings they follow directly), loaded with their token.
export default function DashboardMeetings() {
  const [status, setStatus] = useState<Status>("loading");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [failedTowns, setFailedTowns] = useState<FailedTown[]>([]);
  // How many meetings matched in all, past ones included (SRS-501.5).
  const [matchedCount, setMatchedCount] = useState(0);

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
      // Every upcoming match; the cards show the first few and offer the rest (SRS-501.1).
      setMeetings(upcomingMeetings(data.meetings as Meeting[], new Date(), Infinity));
      setMatchedCount(data.meetings.length);
      // An Incomplete result lists the towns that could not be checked.
      setFailedTowns(data.status === "Incomplete" && Array.isArray(data.failed_towns) ? data.failed_towns : []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading") {
    return <LeafLoader label="Loading meetings…" />;
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

  return <MeetingResults meetings={meetings} failedTowns={failedTowns} matchedCount={matchedCount} />;
}

/**
 * The loaded dashboard.
 * SRS-501.4: in an Incomplete result, "Could not check the source" appears next
 * to each town that could not be checked, above the meetings that were found.
 * SRS-501.5: a Complete result with no meetings shows "No matching meetings
 * found." and no incomplete label. When meetings matched but none is coming up,
 * it says so instead, and points to the Meetings page for past ones.
 * matchedCount is every matching meeting, past ones included; it defaults to
 * the upcoming ones passed in.
 */
export function MeetingResults({ meetings, failedTowns, matchedCount = meetings.length }: {
  meetings: Meeting[];
  failedTowns: FailedTown[];
  matchedCount?: number;
}) {
  const incomplete = failedTowns.length > 0;

  return (
    <>
      {incomplete ? (
        <div className="mb-5 rounded-md border border-line bg-card px-5 py-4 text-sm">
          <p className="text-fg-muted">Some of your towns could not be checked, so their newest meetings may be missing.</p>
          <ul aria-label="Towns that could not be checked" className="mt-3 flex flex-col gap-2">
            {failedTowns.map((town) => (
              <li key={town.town_id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-fg">{town.name}</span>
                <Badge tone="warning">Could not check the source</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {meetings.length > 0 ? (
        <MeetingCards meetings={meetings} />
      ) : incomplete ? null : matchedCount > 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-12 text-center text-fg-muted">
          <EmptyArt scene="tree" />
          <p className="text-base font-semibold text-fg">
            No upcoming meetings.
          </p>
          <p className="max-w-sm text-sm">
            {matchedCount === 1 ? "Your 1 matching meeting has" : `All ${matchedCount} of your matching meetings have`} already
            taken place. New ones will show up here when they're scheduled.
          </p>
          <Link href="/meetings" className="mt-1 text-sm font-semibold text-accent hover:underline">
            See past meetings
          </Link>
        </div>
      ) : (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-12 text-center text-fg-muted">
          <EmptyArt scene="tree" />
          <p className="text-base font-semibold text-fg">
            No matching meetings found.
          </p>
          <p className="max-w-sm text-sm">
            Follow a town or topic and its upcoming meetings will show up here.
          </p>
          <Link href="/preferences" className="mt-1 text-sm font-semibold text-accent hover:underline">
            Choose towns and topics
          </Link>
        </div>
      )}
    </>
  );
}

// SRS-501.1: the soonest meetings first; "Show all" reveals the rest, so no
// relevant or directly followed meeting is left off the dashboard.
function MeetingCards({ meetings }: { meetings: Meeting[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? meetings : meetings.slice(0, DASHBOARD_MEETING_LIMIT);
  const hidden = meetings.length - DASHBOARD_MEETING_LIMIT;

  return (
    <>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {shown.map((meeting) => (
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

          {/* SRS-401.5 (#512): the agenda passage behind the first matched tag,
              kept to two lines so the card stays short. The whole passage shows
              on hover, and every tag's passage is on the meeting details page. */}
          {meeting.matched_topics.length > 0 ? (
            <div aria-label="Why this meeting matched" className="flex flex-col gap-1 text-xs leading-relaxed text-fg-muted">
              <p title={meeting.matched_topics[0].evidence_text} className="line-clamp-2">
                <span className="font-semibold text-fg">{meeting.matched_topics[0].topic}:</span>{" "}
                {meeting.matched_topics[0].evidence_text}
              </p>
              {meeting.matched_topics.length > 1 ? (
                <p className="text-fg-subtle">
                  +{meeting.matched_topics.length - 1} more {meeting.matched_topics.length === 2 ? "topic" : "topics"}
                </p>
              ) : null}
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
                {/* SRS-501.2: "09/24/2026 7:00 PM ET" in the town's time zone. */}
                {meeting.start_at
                  ? formatDashboardStart(meeting.start_at, meeting.meeting_time_zone || "America/New_York") ?? "Date not available"
                  : "Not available"}
              </span>
            </p>
          </div>
        </Link>
      ))}
    </div>
    {hidden > 0 ? (
      <button
        type="button"
        onClick={() => setShowAll((value) => !value)}
        aria-expanded={showAll}
        className="mt-4 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {showAll ? "Show fewer meetings" : `Show all ${meetings.length} upcoming meetings`}
      </button>
    ) : null}
    </>
  );
}
