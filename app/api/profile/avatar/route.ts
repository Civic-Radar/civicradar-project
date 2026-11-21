import { getSupabaseClient } from '../../../../lib/supabase';
import { AVATAR_BUCKET, AVATAR_TYPES, MAX_AVATAR_BYTES, withAvatarLink } from '../../../../lib/avatarLink';

// Fixed messages (#757): the Storage or database error is logged, never sent.
const UPLOAD_ERROR = 'The picture could not be uploaded. Please try again.';
const SAVE_ERROR = 'The picture was uploaded but your profile could not be updated. Please try again.';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'image file is required.' }, { status: 400 });
  }

  // Only these picture types, up to 2 MB (#756). The extension comes from the
  // type, never from the file name, so nothing else can be stored.
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return Response.json({ error: 'Use a PNG, JPEG, WebP or GIF image.' }, { status: 400 });
  if (file.size > MAX_AVATAR_BYTES) {
    return Response.json({ error: 'The picture must be 2 MB or smaller.' }, { status: 400 });
  }
  const path = `${user.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error(`Avatar upload failed: ${uploadError.message}`);
    return Response.json({ error: UPLOAD_ERROR }, { status: 400 });
  }

  // The storage path, not a Storage URL; the browser gets an own-domain link.
  const { data, error: updateError } = await supabase
    .from('myapp_profile')
    .update({ avatar_url: path })
    .eq('id', user.id)
    .select('id, username, biography, avatar_url')
    .single();

  if (updateError) {
    console.error(`Avatar profile update failed: ${updateError.message}`);
    return Response.json({ error: SAVE_ERROR }, { status: 400 });
  }

  return Response.json({ profile: withAvatarLink(data) }, { status: 200 });
}
