'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    setLoading(false);
    setMessage(response.ok ? 'Registration request sent successfully.' : data.error || 'Registration failed.');
  }

  return (
    <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-raised bg-card/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">Student Register</p>
        <h1 className="mt-4 text-3xl font-semibold">Create your account</h1>
        <p className="mt-2 text-fg-muted">Use this page to test the register API route in the browser.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-fg-soft">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-fg outline-none ring-0 transition focus:border-accent-strong"
              placeholder="student@example.com"
            />
          </label>

          <label className="block text-sm text-fg-soft">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 text-fg outline-none ring-0 transition focus:border-accent-strong"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-accent-strong px-4 py-3 font-semibold text-surface transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        {message ? <p className="mt-4 rounded-xl border border-line bg-raised/80 p-3 text-sm text-fg">{message}</p> : null}

        <p className="mt-6 text-sm text-fg-muted">
          Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          Back to <Link href="/" className="text-accent hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
