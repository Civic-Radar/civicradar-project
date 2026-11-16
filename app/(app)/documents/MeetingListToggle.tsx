import type { MeetingList } from '../../../lib/meetingTimeline';

// SRS-209.4: the exact button labels.
export const MEETING_LIST_LABELS: Record<MeetingList, string> = {
  upcoming: 'Upcoming meetings',
  past: 'Past meetings',
};

const ORDER: MeetingList[] = ['upcoming', 'past'];

// Two rounded rectangular buttons above the document list (SRS-209.4). Each shows
// how many documents its list holds; the selected one is filled.
export default function MeetingListToggle({
  selected,
  counts,
  onSelect,
}: {
  selected: MeetingList;
  counts: Record<MeetingList, number>;
  onSelect: (list: MeetingList) => void;
}) {
  return (
    <div role="group" aria-label="Meetings" className="mt-4 flex flex-wrap gap-2">
      {ORDER.map((list) => {
        const active = list === selected;
        return (
          <button
            key={list}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(list)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active ? 'border-accent-strong bg-accent-strong text-on-dark' : 'border-line bg-card text-fg hover:bg-raised'
            }`}
          >
            {MEETING_LIST_LABELS[list]}
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${active ? 'bg-on-dark/15 text-on-dark' : 'bg-raised text-fg-muted'}`}
            >
              {counts[list]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
