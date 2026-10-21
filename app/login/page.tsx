'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AuthCard, { inputClass, primaryButtonClass } from '../components/AuthCard';

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

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      const accessToken = data?.session?.session?.access_token;
      if (accessToken) localStorage.setItem('access_token', accessToken);
      router.push('/dashboard');
    } else {
      setMessage(data.error || 'Login failed.');
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to see your dashboard and meeting alerts.">
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm text-fg-soft">
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

        <label className="block text-sm text-fg-soft">
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
        <p role="alert" className="mt-4 rounded-lg border border-danger-line bg-danger-wash/40 p-3 text-sm text-danger-soft">
          {message}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-fg-muted">
        New to Civic Radar?{' '}
        <Link href="/register" className="font-semibold text-sidebar-icon hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
