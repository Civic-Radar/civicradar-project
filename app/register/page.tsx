'use client';

import Link from 'next/link';
import { useState } from 'react';
import AuthCard, { inputClass, primaryButtonClass } from '../components/AuthCard';
import { alertClasses } from '../components/ui/Alert';
import { sendAuthRequest } from '../../lib/authForm';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setSuccess(false);

    // Issue #529: whatever goes wrong, the button is enabled again (finally)
    // and an error message is shown instead of nothing happening.
    try {
      const reply = await sendAuthRequest('/api/auth/register', { email, password }, 'Registration failed.');
      if (!reply.ok) {
        setMessage(reply.message);
        return;
      }
      setSuccess(true);
      setMessage('Your account was created. You can sign in now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Follow the towns and topics you care about and get alerts about upcoming meetings."
    >
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
            autoComplete="new-password"
            className={inputClass}
            placeholder="••••••••"
          />
        </label>

        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      {message ? (
        <p
          role="status"
          className={alertClasses(success ? 'success' : 'error', 'mt-4')}
        >
          {message}{' '}
          {success ? (
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Sign in
            </Link>
          ) : null}
        </p>
      ) : null}

      <p className="mt-6 flex flex-wrap items-center gap-1 text-sm text-fg-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}