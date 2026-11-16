import { newestMeetingFirst } from '../../../lib/documentOrder';
import { getAuthenticatedUser, getToken } from '../../../lib/residentAuth';

// Always read the current rows; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const LOAD_ERROR = 'Documents could not be loaded. Please try again.';

// Lists the documents from the signed-in resident's followed towns (SRS-201.1),
// sorted by meeting date, newest first (SRS-209.1). The database returns them
// newest retrieved_at first, then newest document_id, and that order is kept
// for documents whose meetings start at the same time.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: follows, error: followsError } = await supabase!
    .from('user_followed_towns')
    .select('town_id')
    .eq('user_id', user.id);

  if (followsError) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  // follows_towns tells the page whether the user follows any town, so it can
  // show the setup message (SRS-201.3) rather than an empty list.
  const townIds = ((follows ?? []) as { town_id: number }[]).map((row) => row.town_id);
  if (townIds.length === 0) return Response.json({ documents: [], follows_towns: false }, { status: 200 });

  const { data: documents, error } = await supabase!
    .from('documents')
    .select('document_id, title, town_id, meeting_id, retrieved_at, summary_status, document_type')
    .in('town_id', townIds)
    .order('retrieved_at', { ascending: false })
    .order('document_id', { ascending: false });

  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  // Each entry's town name for its tag (SRS-212.1) and the town's meeting time
  // zone, so the page shows the meeting date in the town's zone (SRS-202.2).
  // documents has no foreign key to towns, so no embed.
  const { data: towns, error: townsError } = await supabase!
    .from('towns')
    .select('town_id, name, meeting_time_zone')
    .in('town_id', townIds);

  if (townsError) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const townRows = (towns ?? []) as { town_id: number; name: string | null; meeting_time_zone: string | null }[];
  const townNames = new Map(townRows.map((row) => [row.town_id, row.name]));
  const townZones = new Map(townRows.map((row) => [row.town_id, row.meeting_time_zone]));

  // Each entry's meeting start time for its date, from one read for all listed meetings.
  const documentRows = (documents ?? []) as { town_id: number; meeting_id: number }[];
  const meetingIds = Array.from(new Set(documentRows.map((row) => row.meeting_id)));
  const meetingStarts = new Map<number, string | null>();
  if (meetingIds.length > 0) {
    const { data: meetings, error: meetingsError } = await supabase!
      .from('meetings')
      .select('meeting_id, start_at')
      .in('meeting_id', meetingIds);

    if (meetingsError) return Response.json({ error: LOAD_ERROR }, { status: 500 });

    for (const row of (meetings ?? []) as { meeting_id: number; start_at: string | null }[]) {
      meetingStarts.set(row.meeting_id, row.start_at);
    }
  }

  const entries = documentRows.map((row) => ({
    ...row,
    town_name: townNames.get(row.town_id) ?? null,
    meeting_start_at: meetingStarts.get(row.meeting_id) ?? null,
    meeting_time_zone: townZones.get(row.town_id) ?? null,
  }));

  return Response.json({ documents: newestMeetingFirst(entries), follows_towns: true }, { status: 200 });
}
