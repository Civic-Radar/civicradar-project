import type { SupabaseClient } from '@supabase/supabase-js';
import type { MeetingFilesListing, MeetingListing } from '../sources/types';
import { loadMeetings, retrieveDocuments, type DownloadFile, type RetrieveDocumentsResult } from './retrieveDocuments';
import { saveMeetings, type RetrievalTown } from './saveMeetings';

// The source client's functions, passed in so this file stays source-agnostic.
export interface RetrievalSource {
  fetchMeetings: (sourceAccountId: string, maxPages: number) => Promise<MeetingListing>;
  fetchMeetingFiles: (sourceAccountId: string, maxPages: number) => Promise<MeetingFilesListing>;
  downloadFile: DownloadFile;
}

export interface RetrievalOptions {
  maxPages: number; // the page bound for both source passes (SRS-220.1)
  now?: () => Date; // the clock for the check's ended_at, so tests can fix it
}

// What the route turns into its response. error is the response's message.
export type TownRetrievalResult =
  | { ok: true; saved: number; complete: boolean }
  | { ok: false; status: 500 | 502; error: string };

interface CheckRow {
  check_id: number;
  started_at: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// Opens the town's source_checks row (SRS-222.1). started_at is left to the
// database. Returns null when no row was inserted; the reason stays in the
// server log.
async function startCheck(supabase: SupabaseClient, townId: number): Promise<CheckRow | null> {
  try {
    const { data, error } = await supabase
      .from('source_checks')
      .insert({ town_id: townId })
      .select('check_id, started_at')
      .single();

    if (error || !data) {
      console.error(`Source check: town ${townId} could not start: ${error?.message ?? 'no row returned'}`);
      return null;
    }
    return data as CheckRow;
  } catch (error: unknown) {
    console.error(`Source check: town ${townId} could not start: ${errorMessage(error)}`);
    return null;
  }
}

// The database's started_at can carry microseconds; Date.parse gets
// milliseconds only.
function parseTimestamp(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
}

// The clock time when it is later than started_at, otherwise started_at
// itself, so ended_at is never earlier than started_at even when the app
// clock trails the database clock.
function endedAt(check: CheckRow, now: () => Date): string {
  const clock = now();
  return clock.getTime() > parseTimestamp(check.started_at) ? clock.toISOString() : check.started_at;
}

// Closes the check row with ended_at and changes_found in one update. Never
// throws: a failure is logged and the row stays open, with both still null.
async function endCheck(
  supabase: SupabaseClient,
  townId: number,
  check: CheckRow,
  changesFound: boolean,
  now: () => Date,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('source_checks')
      .update({ ended_at: endedAt(check, now), changes_found: changesFound })
      .eq('check_id', check.check_id);

    if (error) {
      console.error(`Source check: town ${townId} check ${check.check_id} could not end: ${error.message}`);
    }
  } catch (error: unknown) {
    console.error(`Source check: town ${townId} check ${check.check_id} could not end: ${errorMessage(error)}`);
  }
}

// One retrieval run for one town, the entry point the route calls today and
// a scheduler can call later. It opens the town's check row before the first
// source read, then retrieves the town's meetings and saves them (SRS-220.3),
// then stores each file listed under them as a document (SRS-208.2). Both
// passes read at most the page bound. The meetings and files from every page
// read are kept, even when a later page fails, and complete is true only when
// both passes read the whole list (SRS-220.1). Nothing is written for the
// flag yet (SRS-222.2). However the run ends, the check row is closed
// (SRS-222.1). changes_found is true only when the run stored at least one
// new meeting or document and nothing failed. An incomplete listing does not
// count as failed here (SRS-222.3).
export async function runTownRetrieval(
  supabase: SupabaseClient,
  town: RetrievalTown & { source_account_id: string },
  source: RetrievalSource,
  options: RetrievalOptions,
): Promise<TownRetrievalResult> {
  // No check row means nothing is read.
  const check = await startCheck(supabase, town.town_id);
  if (!check) {
    return { ok: false, status: 500, error: 'Retrieval could not start.' };
  }

  const { maxPages, now = () => new Date() } = options;
  let newMeetings = 0;
  // Set only when the document pass finished, so any earlier exit leaves
  // changes_found false.
  let documents: RetrieveDocumentsResult | null = null;

  try {
    // A failed fetch is never "no meetings": any client error stops the run.
    let meetingListing: MeetingListing;
    try {
      meetingListing = await source.fetchMeetings(town.source_account_id, maxPages);
    } catch (error: unknown) {
      return { ok: false, status: 502, error: errorMessage(error) };
    }

    // saveMeetings upserts every listed meeting, so the new ones are the
    // listed ids the town had no row for before the save.
    let saved: number;
    try {
      const listedIds = [...new Set(meetingListing.meetings.map((meeting) => meeting.sourceMeetingId))];
      const existing = await loadMeetings(supabase, town.town_id, listedIds);
      saved = await saveMeetings(supabase, town, meetingListing.meetings);
      newMeetings = listedIds.filter((id) => !existing.has(id)).length;
    } catch (error: unknown) {
      return { ok: false, status: 500, error: errorMessage(error) };
    }

    // A failed listing is never "no files". Details stay in the server log.
    let fileListing: MeetingFilesListing;
    try {
      fileListing = await source.fetchMeetingFiles(town.source_account_id, maxPages);
    } catch (error: unknown) {
      console.error(`Document retrieval: town ${town.town_id} file listing failed: ${errorMessage(error)}`);
      return { ok: false, status: 502, error: `Saved ${saved} meetings, but listing their documents failed.` };
    }

    const complete = meetingListing.complete && fileListing.complete;
    console.log(
      `Meeting retrieval: town ${town.town_id} read ${meetingListing.pagesRead} meeting pages and ${fileListing.pagesRead} file pages, bound ${maxPages}, complete ${complete}`,
    );

    // Per-file failures are logged inside and never stop the run (SRS-208.2).
    try {
      documents = await retrieveDocuments(supabase, town.town_id, fileListing.filesByMeeting, source.downloadFile);
    } catch (error: unknown) {
      console.error(`Document retrieval: town ${town.town_id} failed: ${errorMessage(error)}`);
      return { ok: false, status: 500, error: `Saved ${saved} meetings, but retrieving their documents failed.` };
    }

    return { ok: true, saved, complete };
  } finally {
    const changesFound = documents !== null && newMeetings + documents.stored > 0 && documents.failed === 0;
    await endCheck(supabase, town.town_id, check, changesFound, now);
  }
}
