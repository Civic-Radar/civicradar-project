// Tests for marking amended documents in the extraction list (Fix: latest and earlier versions).
// When a town posts a corrected document it marks the title "AMENDED" and keeps the
// original; the list marks the amended one "Latest" and the original "Earlier version".
import { describe, expect, it } from 'vitest';
import { isAmendedTitle, sortDocuments, versionLabels } from '../../lib/extractions';
import type { ExtractableDocument } from '../../lib/extractions';

const HEARING = { meeting_id: 7, title: 'Joint Public Hearing with the Planning Board', start_at: '2026-10-19T22:00:00Z' };
const doc = (id: number, title: string, type: ExtractableDocument['document_type'], meeting = HEARING): ExtractableDocument => ({
  document_id: id, title, document_type: type, mime_type: 'application/pdf', retrieved_at: '2026-10-25T00:00:00Z', town_id: 1, meeting,
});

const ORIGINAL = doc(13, 'Joint Public Hearing with the Planning Board Monday October 19, 2026', 'Agenda');
const AMENDED_AGENDA = doc(40, 'AMENDED Joint Public Hearing with the Planning Board Monday October 19, 2026', 'Agenda');
const AMENDED_PACKET = doc(41, 'AMENDED Joint Public Hearing with the Planning Board Monday October 19, 2026', 'Packet');

describe('Latest and earlier versions', () => {
  it('marks the AMENDED agenda as latest and the original agenda as an earlier version', () => {
    const labels = versionLabels([ORIGINAL, AMENDED_AGENDA, AMENDED_PACKET]);
    expect(labels.get(40)).toBe('latest');
    expect(labels.get(13)).toBe('earlier');
  });

  it('leaves a document alone when nothing of the same type in its meeting is amended', () => {
    // The amended packet has no unamended packet to replace, so it gets no label.
    expect(versionLabels([ORIGINAL, AMENDED_AGENDA, AMENDED_PACKET]).has(41)).toBe(false);
    expect(versionLabels([ORIGINAL]).size).toBe(0);
  });

  it('only compares documents of the same meeting', () => {
    const otherMeeting = doc(50, 'City Council Regular Meeting Agenda', 'Agenda', { meeting_id: 9, title: 'City Council', start_at: '2026-10-08T23:00:00Z' });
    expect(versionLabels([AMENDED_AGENDA, otherMeeting]).size).toBe(0);
  });

  it('recognises AMENDED, REVISED, and UPDATED, but not version numbers', () => {
    expect(['AMENDED agenda', 'Revised Agenda', 'Agenda - Updated', 'Agenda V2', 'Amendment to bylaw'].map(isAmendedTitle))
      .toEqual([true, true, true, false, false]);
  });

  it('lists the amended version before the original it corrects', () => {
    expect(sortDocuments([ORIGINAL, AMENDED_PACKET, AMENDED_AGENDA]).map((d) => d.document_id)).toEqual([40, 13, 41]);
  });
});
