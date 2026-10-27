export async function pathAfterSignIn(accessToken: string | undefined): Promise<string> {
  if (!accessToken) return '/dashboard';
  try {
    const res = await fetch('/api/setup', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return '/dashboard';
    const data = await res.json();
    return data.needs_setup ? '/setup' : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

export async function skipSetup(accessToken: string | undefined): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch('/api/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ setup_status: 'Skipped' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}