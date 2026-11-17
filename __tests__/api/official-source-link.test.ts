import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMeetings } from '../../lib/sources/civicclerk';

// Salem's Events list as CivicClerk sent it, saved in the repo. fetch answers
// every request with it, so nothing reaches CivicClerk.
const SALEM_EVENTS = JSON.parse(
  readFileSync(new URL('../fixtures/civicclerk-events-salemma.json', import.meta.url), 'utf8'),
) as { value: Record<string, unknown>[] };

const PORTAL_HOME = 'https://salemma.portal.civicclerk.com/';

function eventPage(id: string): string {
  return `https://salemma.portal.civicclerk.com/event/${id}/overview`;
}

function respondWith(events: Record<string, unknown>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ value: events }), { status: 200 })),
  );
}

async function sourceUrls(): Promise<Map<string, string>> {
  const { meetings } = await fetchMeetings('salemma', 1);
  return new Map(meetings.map((meeting) => [meeting.sourceMeetingId, meeting.sourceUrl]));
}

function salemEvent(id: number): Record<string, unknown> {
  const event = SALEM_EVENTS.value.find((row) => row.id === id);
  if (!event) throw new Error(`Event ${id} is not in the saved Salem sample`);
  return event;
}

beforeEach(() => {
  for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Open on CivicClerk link (SRS-502.9, #498)', () => {
  it('links event 1165, which has no agenda and no published files, to the Salem portal home (the #498 case)', async () => {
    respondWith([salemEvent(1165)]);

    expect((await sourceUrls()).get('1165')).toBe(PORTAL_HOME);
  });

  it('still links event 1191, which has an agenda and files, to its event page', async () => {
    respondWith([salemEvent(1191)]);

    expect((await sourceUrls()).get('1191')).toBe(eventPage('1191'));
  });

  it('links meeting 1192 to its official CivicClerk page (the SRS-502.9 example)', async () => {
    respondWith([salemEvent(1192)]);

    expect((await sourceUrls()).get('1192')).toBe(eventPage('1192'));
  });

  it('links an event with published files but no agenda to its event page', async () => {
    respondWith([{ ...salemEvent(1165), publishedFiles: [{ fileId: 9001, name: 'Notice', type: 'Other' }] }]);

    expect((await sourceUrls()).get('1165')).toBe(eventPage('1165'));
  });

  it('links an event with an agenda but no published files to its event page', async () => {
    respondWith([{ ...salemEvent(1191), publishedFiles: [] }]);

    expect((await sourceUrls()).get('1191')).toBe(eventPage('1191'));
  });

  it('gives every event in the saved Salem sample the event page only when CivicClerk has published something for it', async () => {
    respondWith(SALEM_EVENTS.value);
    const urls = await sourceUrls();

    for (const event of SALEM_EVENTS.value) {
      const published =
        (event.hasAgenda === true && typeof event.agendaId === 'number' && event.agendaId > 0) ||
        (Array.isArray(event.publishedFiles) && event.publishedFiles.length > 0);
      expect(urls.get(String(event.id))).toBe(published ? eventPage(String(event.id)) : PORTAL_HOME);
    }
  });
});
