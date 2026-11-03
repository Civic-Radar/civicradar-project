// Tests for agendaDetail (SRS-502.6): the text under an agenda item's title on
// the meeting details page never repeats the title. Cases from Brookline's
// Pedestrian Advisory Committee agenda.
import { describe, expect, it } from 'vitest';
import { agendaDetail } from '../../lib/agenda';

describe('agendaDetail (SRS-502.6)', () => {
  it('leaves out the title line and keeps the description', () => {
    expect(
      agendaDetail({
        title: '(8:55pm) Committee Housekeeping',
        item_text: '(8:55pm) Committee Housekeeping\n\nNext meeting is Monday 12/14/26 at 7pm, remote via Zoom.',
      }),
    ).toBe('Next meeting is Monday 12/14/26 at 7pm, remote via Zoom.');
  });

  it('keeps the rest of a name that runs over more than one line', () => {
    expect(
      agendaDetail({
        title: '(8:15pm) Pedestrian Priorities and Strategies',
        item_text: '(8:15pm) Pedestrian Priorities and Strategies\nHow to keep recommendations alive\n\nRef: Walkable Streets Priorities',
      }),
    ).toBe('How to keep recommendations alive\n\nRef: Walkable Streets Priorities');
  });

  it('shows nothing when the text is only the title', () => {
    expect(agendaDetail({ title: 'Call to Order', item_text: 'Call to Order' })).toBeNull();
    expect(agendaDetail({ title: 'Call to Order', item_text: null })).toBeNull();
  });

  it('keeps what follows a title that was stored cut short', () => {
    expect(agendaDetail({ title: 'A very long agenda item', item_text: 'A very long agenda item name that kept going' })).toBe(
      'name that kept going',
    );
  });

  it('keeps text that does not start with the title', () => {
    expect(agendaDetail({ title: 'FY27 school budget', item_text: 'Review of the proposed FY27 school budget.' })).toBe(
      'Review of the proposed FY27 school budget.',
    );
  });
});
