import { getSupabaseClient } from '../../../lib/supabase';

// SRS-101.4: save and load the topics a resident follows.

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type Topic = { topic_id: number; name: string };

const LOAD_ERROR = 'Your followed topics could not be loaded. Please try again.';
const SAVE_ERROR = 'Your followed topics could not be saved. Please try again.';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getAuthenticatedUser(token: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { user: null, supabase: null, configError: true };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user: error ? null : user, supabase, configError: false };
}

async function getCatalogTopics(supabase: SupabaseClient): Promise<Topic[] | null> {
  const { data, error } = await supabase
    .from('topics')
    .select('topic_id, name')
    .is('removed_at', null)
    .order('topic_id');
  return error ? null : ((data ?? []) as Topic[]);
}

async function getFollowedTopicIds(supabase: SupabaseClient, userId: string): Promise<Set<number> | null> {
  const { data, error } = await supabase
    .from('user_followed_topics')
    .select('topic_id')
    .eq('user_id', userId);
  if (error) return null;
  return new Set(((data ?? []) as { topic_id: number }[]).map((row) => row.topic_id));
}

function markFollowed(topics: Topic[], followedIds: Set<number>) {
  return topics.map((topic) => ({ ...topic, followed: followedIds.has(topic.topic_id) }));
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const topics = await getCatalogTopics(supabase!);
  if (!topics) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const followedIds = await getFollowedTopicIds(supabase!, user.id);
  if (!followedIds) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  return Response.json({ topics: markFollowed(topics, followedIds) }, { status: 200 });
}

export async function PUT(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const submitted = (body as { topic_ids?: unknown } | null)?.topic_ids;
  if (!Array.isArray(submitted) || !submitted.every((id) => Number.isInteger(id) && id > 0)) {
    return Response.json({ error: 'topic_ids must be a list of topic ids.' }, { status: 400 });
  }
  const topicIds = [...new Set(submitted as number[])];

  const topics = await getCatalogTopics(supabase!);
  if (!topics) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  const catalogIds = new Set(topics.map((topic) => topic.topic_id));
  if (!topicIds.every((id) => catalogIds.has(id))) {
    return Response.json({ error: 'One or more selected topics are not available.' }, { status: 400 });
  }

  if (!user.email) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  // user_followed_topics.user_id references user_accounts, and registration only
  // creates the auth user, so make sure the account row exists first.
  const { error: accountError } = await supabase!
    .from('user_accounts')
    .upsert({ user_id: user.id, email: user.email }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (accountError) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  // Add the selected topics, then remove the ones that were deselected.
  if (topicIds.length > 0) {
    const { error: addError } = await supabase!
      .from('user_followed_topics')
      .upsert(
        topicIds.map((topic_id) => ({ user_id: user.id, topic_id })),
        { onConflict: 'user_id,topic_id', ignoreDuplicates: true },
      );
    if (addError) return Response.json({ error: SAVE_ERROR }, { status: 500 });
  }

  let removeQuery = supabase!.from('user_followed_topics').delete().eq('user_id', user.id);
  if (topicIds.length > 0) removeQuery = removeQuery.not('topic_id', 'in', `(${topicIds.join(',')})`);
  const { error: removeError } = await removeQuery;
  if (removeError) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  const followedIds = await getFollowedTopicIds(supabase!, user.id);
  if (!followedIds) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  return Response.json({ topics: markFollowed(topics, followedIds) }, { status: 200 });
}