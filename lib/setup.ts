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