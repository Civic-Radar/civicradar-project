import { getSupabaseClient } from '../../../../lib/supabase';
import { registerErrorMessage, unexpectedErrorMessage } from '../../../../lib/authErrors';

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

    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });

    if (error) {
      return Response.json({ error: registerErrorMessage(error) }, { status: 400 });
    }

    return Response.json({ user: data?.user ?? null }, { status: 201 });
  } catch (error: unknown) {
    return Response.json({ error: unexpectedErrorMessage('Sign-up', error) }, { status: 500 });
  }
}
