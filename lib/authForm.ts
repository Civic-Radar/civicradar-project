// Sends the sign-in or sign-up form to the API and never throws (issue #529).
// If the request can't be sent (offline, server down) or the reply isn't JSON
// (for example a platform error page), it returns a failure with the fallback
// message, so the page can always leave "Signing in…" and show an error.
export type AuthReply = { ok: true; data: unknown } | { ok: false; message: string };

export async function sendAuthRequest(
  url: string,
  credentials: { email: string; password: string },
  fallbackMessage: string,
  fetchFn: typeof fetch = fetch,
): Promise<AuthReply> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    return { ok: false, message: fallbackMessage };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.ok && data !== null) return { ok: true, data };

  const serverError =
    data !== null && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : '';
  return { ok: false, message: serverError || fallbackMessage };
}