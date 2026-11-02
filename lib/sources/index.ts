import type { RetrievalRunTown, RetrievalSource } from '../retrieval/runTownRetrieval';
import { downloadFile, fetchAgendaItems, fetchMeetingFiles, fetchMeetings } from './civicclerk';

// The source functions for a town's retrieval run. Every supported town uses
// CivicClerk today, so the town is not read yet; a town on another source
// (for example Legistar) would be handed that source's functions here, so
// callers name no source.
export function getTownSource(_town: RetrievalRunTown): RetrievalSource {
  return { fetchMeetings, fetchMeetingFiles, fetchAgendaItems, downloadFile };
}
