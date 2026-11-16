import type { MeetingTimeList } from './meetingsByDate';

// SRS-220.11: the exact button labels.
export const MEETING_TIME_LABELS: Record<MeetingTimeList, string> = {
  upcoming: 'Upcoming meetings',
  past: 'Past meetings',
};

const ORDER: MeetingTimeList[] = ['upcoming', 'past'];

// Shared by both buttons, so they always have the same size and shape: two equal
// grid columns, the same border width, padding and font. Only the colors differ.
export const BUTTON_SIZE =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const BUTTON_COLORS = {
  selected: 'border-accent-strong bg-accent-strong text-on-dark',
  unselected: 'border-line bg-card text-fg hover:bg-raised',
};
export const COUNT_SIZE = 'min-w-[2.25rem] rounded-md px-1.5 py-0.5 text-center text-xs tabular-nums';
export const COUNT_COLORS = {
  selected: 'bg-on-dark/15 text-on-dark',
  unselected: 'bg-raised text-fg-muted',
};

// Two rounded rectangular buttons above the meeting list (SRS-220.11), each with
// its count. The selected one is filled; selecting one never changes its size.
export default function MeetingTimeToggle({
  selected,
  counts,
  onSelect,
}: {
  selected: MeetingTimeList;
  counts: Record<MeetingTimeList, number>;
  onSelect: (list: MeetingTimeList) => void;
}) {
  return (
    <div role="group" aria-label="Meetings to show" className="mt-4 grid w-full grid-cols-2 gap-2 sm:max-w-md">
      {ORDER.map((list) => {
        const state = list === selected ? 'selected' : 'unselected';
        return (
          <button
            key={list}
            type="button"
            aria-pressed={list === selected}
            onClick={() => onSelect(list)}
            className={`${BUTTON_SIZE} ${BUTTON_COLORS[state]}`}
          >
            {MEETING_TIME_LABELS[list]}
            <span className={`${COUNT_SIZE} ${COUNT_COLORS[state]}`}>{counts[list]}</span>
          </button>
        );
      })}
    </div>
  );
}
