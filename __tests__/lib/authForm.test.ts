import { describe, expect, it, vi } from 'vitest';
import { sendAuthRequest } from '../../lib/authForm';

// Issue #529: a failed sign-in request must end with an error message the page
// can show, never with an exception that leaves the button on "Signing in…".
const credentials = { email: 'resident@example.com', password: 'secret123' };

function replyWith(status: number, body: string) {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe('sendAuthRequest (#529)', () => {
  it('returns the fallback message when the request cannot be sent', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(sendAuthRequest('/api/auth/login', credentials, 'Login failed.', offline)).resolves.toEqual({
      ok: false,
      message: 'Login failed.',
    });
  });

  it('returns the fallback message when the reply is not JSON', async () => {
    const errorPage = replyWith(502, '<html><body>Bad Gateway</body></html>');

    await expect(sendAuthRequest('/api/auth/login', credentials, 'Login failed.', errorPage)).resolves.toEqual({
      ok: false,
      message: 'Login failed.',
    });
  });

  it('returns the fallback message when a successful reply is not JSON', async () => {
    const notJson = replyWith(200, 'OK');

    await expect(sendAuthRequest('/api/auth/register', credentials, 'Registration failed.', notJson)).resolves.toEqual({
      ok: false,
      message: 'Registration failed.',
    });
  });

  it("returns the server's error message when there is one", async () => {
    const rejected = replyWith(400, JSON.stringify({ error: 'Invalid login credentials' }));

    await expect(sendAuthRequest('/api/auth/login', credentials, 'Login failed.', rejected)).resolves.toEqual({
      ok: false,
      message: 'Invalid login credentials',
    });
  });

  it('returns the data on success, after sending the form as JSON with POST', async () => {
    const accepted = replyWith(200, JSON.stringify({ session: { session: { access_token: 'token-1' } } }));

    const reply = await sendAuthRequest('/api/auth/login', credentials, 'Login failed.', accepted);

    expect(reply).toEqual({ ok: true, data: { session: { session: { access_token: 'token-1' } } } });
    expect(accepted).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  });
});