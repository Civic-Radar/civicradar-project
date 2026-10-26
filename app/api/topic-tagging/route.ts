import { classifyMeetingTopics } from '../../../lib/meetingTagging';
import { getSupabaseClient } from '../../../lib/supabase';
import {
  getTopicTaggingSecret,
  isValidTopicTaggingSecret,
  TOPIC_TAGGING_SECRET_HEADER,
} from '../../../lib/topicTaggingSecret';

// Always run against the current rows; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const INVALID_ID = 'meetingId must be a positive whole number.';
const TAGGING_ERROR = 'Topic tagging could not be completed. Please try again.';

// Tags one meeting from its current agenda text and saves the tags (SRS-401.4).
// Call it whenever a meeting's agenda text is new or changed; running it again
// on the same text leaves the same tags.
// Run by a background job, protected by the x-topic-tagging-secret header,
// which is checked before the body is read.
export async function POST(request: Request) {
  if (!getTopicTaggingSecret()) {
    return Response.json({ error: 'Topic tagging is not configured.' }, { status: 500 });
  }

  if (!isValidTopicTaggingSecret(request.headers.get(TOPIC_TAGGING_SECRET_HEADER))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let meetingId: unknown;
  try {
    ({ meetingId } = (await request.json()) as { meetingId?: unknown });
  } catch {
    return Response.json({ error: INVALID_ID }, { status: 400 });
  }

  if (typeof meetingId !== 'number' || !Number.isSafeInteger(meetingId) || meetingId <= 0) {
    return Response.json({ error: INVALID_ID }, { status: 400 });
  }

  // Tagging reads and writes need the service role key (RLS is deny-by-default).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const result = await classifyMeetingTopics(supabase, meetingId);

  switch (result.status) {
    case 'classified':
      return Response.json(
        {
          meeting_id: meetingId,
          result: 'classified',
          tags: result.tags.map(({ topic_id, topic_name, evidence_text }) => ({ topic_id, topic_name, evidence_text })),
        },
        { status: 200 },
      );
    case 'no_agenda_text':
      return Response.json({ meeting_id: meetingId, result: 'no_agenda_text', tags: [] }, { status: 200 });
    case 'meeting_not_found':
      return Response.json({ error: 'Meeting not found.' }, { status: 404 });
    case 'agenda_changed':
      return Response.json({ error: 'The agenda changed while tagging. Run tagging again.' }, { status: 409 });
    default:
      return Response.json({ error: TAGGING_ERROR }, { status: 500 });
  }
}
