// Tests for readable document names on the extraction pages (Fix: readable document names).
// Towns upload files with names like "Agenda V2"; the extraction pages name a
// document by its town, meeting, date, and type instead.
import { describe, expect, it } from 'vitest';
import { documentTypeLabel, readableDocumentName } from '../../lib/extractions';

const BICYCLE = { title: 'Bicycle Advisory Committee Meeting', start_at: '2026-10-28T23:00:00Z' };

describe('readableDocumentName', () => {
  it('names a document by its town, meeting, date, and type', () => {
    expect(readableDocumentName({ title: 'Agenda V2', document_type: 'Agenda', town_name: 'Brookline', meeting: BICYCLE }))
      .toBe('Brookline · Bicycle Advisory Committee Meeting · Oct 28, 2026 · Agenda');
  });

  it('calls a packet an "Agenda packet"', () => {
    expect(readableDocumentName({ title: 'packet v2', document_type: 'Packet', town_name: 'Brookline', meeting: BICYCLE }))
      .toBe('Brookline · Bicycle Advisory Committee Meeting · Oct 28, 2026 · Agenda packet');
  });

  it("uses the meeting's date in Salem's time zone, so an evening meeting keeps its day", () => {
    const lateMeeting = { title: 'City Council Regular Meeting', start_at: '2026-10-09T01:00:00Z' }; // 9:00 PM Oct 8
    expect(readableDocumentName({ title: 'x', document_type: 'Minutes', town_name: 'Salem', meeting: lateMeeting }))
      .toBe('Salem · City Council Regular Meeting · Oct 8, 2026 · Minutes');
  });

  it('leaves the date out when the meeting title already has one', () => {
    const titled = { title: 'Salem City Council Special Meeting October 15, 2026', start_at: '2026-10-15T22:00:00Z' };
    expect(readableDocumentName({ title: 'x', document_type: 'Agenda', town_name: 'Salem', meeting: titled }))
      .toBe('Salem · Salem City Council Special Meeting October 15, 2026 · Agenda');
  });

  it('keeps the original file name for a document without a meeting', () => {
    expect(readableDocumentName({ title: 'Public Comment Notes', document_type: 'Other', town_name: 'Salem', meeting: null }))
      .toBe('Public Comment Notes');
  });

  it('leaves out the town when it is not known', () => {
    expect(readableDocumentName({ title: 'x', document_type: 'Agenda', meeting: BICYCLE }))
      .toBe('Bicycle Advisory Committee Meeting · Oct 28, 2026 · Agenda');
  });

  it('labels each document type in plain words', () => {
    expect(['Agenda', 'Packet', 'Minutes', 'Other', 'Something new'].map(documentTypeLabel))
      .toEqual(['Agenda', 'Agenda packet', 'Minutes', 'Document', 'Document']);
  });
});
