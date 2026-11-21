import { getSupabaseClient } from '../../../../../lib/supabase';
import {
  AVATAR_BUCKET,
  avatarContentType,
  avatarStoragePath,
  isAvatarUserId,
  isValidAvatarTicket,
} from '../../../../../lib/avatarLink';

// Always read the current picture; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const NOT_AVAILABLE = 'The picture is not available.';

function notAvailable(status: number) {
  return Response.json({ error: NOT_AVAILABLE }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

// Serves one profile picture for a valid ticket from the profile routes (card
// #756). The picture is read from Storage on the server, so the browser never
// sees the Supabase address, the bucket or the path. Errors name nothing; the
// reason stays in the server log.
export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const userId = params.userId;
  const ticket = new URL(request.url).searchParams.get('ticket');
  if (!isAvatarUserId(userId) || !isValidAvatarTicket(userId, ticket)) {
    return Response.json(
      { error: 'This picture link is not valid or has expired. Reload the page.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  // The bucket is private, so only the service role key can read it.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set, so no profile picture is served.');
    return notAvailable(500);
  }
  const supabase = getSupabaseClient();
  if (!supabase) return notAvailable(500);

  const { data: profile, error } = await supabase
    .from('myapp_profile')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error(`Avatar ${userId}: profile read failed: ${error.message}`);
    return notAvailable(500);
  }

  const path = avatarStoragePath(userId, (profile as { avatar_url?: string | null } | null)?.avatar_url);
  const contentType = path ? avatarContentType(path) : null;
  if (!path || !contentType) return notAvailable(404);

  let picture: Blob | null = null;
  try {
    const { data, error: downloadError } = await supabase.storage.from(AVATAR_BUCKET).download(path);
    if (downloadError) console.error(`Avatar ${userId}: download failed: ${downloadError.message}`);
    else picture = data;
  } catch (thrown: unknown) {
    console.error(`Avatar ${userId}: download failed: ${thrown instanceof Error ? thrown.message : 'unknown error'}`);
  }
  if (!picture) return notAvailable(404);

  const body = await picture.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
