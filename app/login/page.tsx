'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AuthCard, { inputClass, primaryButtonClass } from '../components/AuthCard';
import { alertClasses } from '../components/ui/Alert';
import { pathAfterSignIn } from '../../lib/setup';
import { sendAuthRequest } from '../../lib/authForm';

type LoginReply = { session?: { session?: { access_token?: string } } };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    // Issue #529: whatever goes wrong, the button leaves "Signing in…" (finally)
    // and an error message is shown instead of nothing happening.
    try {
      const reply = await sendAuthRequest('/api/auth/login', { email, password }, 'Login failed.');
      if (!reply.ok) {
        setMessage(reply.message);
        return;
      }
      const accessToken = (reply.data as LoginReply)?.session?.session?.access_token;
      if (accessToken) localStorage.setItem('access_token', accessToken);
      router.push(await pathAfterSignIn(accessToken));
    } catch {
      setMessage('Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to see your dashboard and meeting alerts.">
      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <label className="flex flex-col gap-2 text-sm font-semibold text-fg-soft">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className={inputClass}
            placeholder="you@example.com"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold text-fg-soft">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className={inputClass}
            placeholder="••••••••"
          />
        </label>

        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {message ? (
        <p role="alert" className={alertClasses('error', 'mt-4')}>
          {message}
        </p>
      ) : null}

      <p className="mt-6 flex flex-wrap items-center gap-1 text-sm text-fg-muted">
        New to Civic Radar?{' '}
        <Link href="/register" className="font-semibold text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}