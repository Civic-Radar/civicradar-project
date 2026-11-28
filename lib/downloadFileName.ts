// SRS-214.3: the name a downloaded PDF is saved under, Town_Body_YYYY-MM-DD_Type.pdf.
// Example: a Salem City Council agenda for 09/14/2026 is
// "Salem_CityCouncil_2026-09-14_Agenda.pdf".

export interface DownloadNameParts {
  town: string | null; // towns.name
  body: string | null; // the governing body's catalog name, else the name the source sent
  startAt: string | null; // meetings.start_at (UTC)
  timeZone: string | null; // towns.meeting_time_zone, for the local meeting date
  type: string | null; // documents.document_type
}

// Each part keeps only ASCII letters and digits, so "City Council" becomes
// "CityCouncil" and accented letters lose their accents. Nothing in a part can
// add an underscore, a path or a quote to the name.
export function namePart(value: string | null): string {
  return (value ?? '').normalize('NFKD').replace(/[^A-Za-z0-9]/g, '');
}

// The meeting's date in the town's time zone, as YYYY-MM-DD, or null when the
// time or the zone is missing or not valid.
export function localMeetingDate(startAt: string | null, timeZone: string | null): string | null {
  if (!startAt || !timeZone) return null;
  const time = Date.parse(startAt);
  if (Number.isNaN(time)) return null;
  try {
    // en-CA formats dates as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
  } catch {
    return null;
  }
}

// The download file name. A part the data does not have is written in words,
// so the name always has four parts: UnknownTown, UnknownBody, Undated, Other.
export function downloadFileName(parts: DownloadNameParts): string {
  const town = namePart(parts.town) || 'UnknownTown';
  const body = namePart(parts.body) || 'UnknownBody';
  const date = localMeetingDate(parts.startAt, parts.timeZone) ?? 'Undated';
  const type = namePart(parts.type) || 'Other';
  return `${town}_${body}_${date}_${type}.pdf`;
}
