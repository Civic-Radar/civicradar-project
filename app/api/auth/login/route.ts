import { getSupabaseClient } from '../../../../lib/supabase';
import { loginErrorMessage, unexpectedErrorMessage } from '../../../../lib/authErrors';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return Response.json({ error: loginErrorMessage(error) }, { status: 401 });
    }

    return Response.json({ session: data }, { status: 200 });
  } catch (error: unknown) {
    return Response.json({ error: unexpectedErrorMessage('Sign-in', error) }, { status: 500 });
  }
}
