'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { skipSetup } from '../../../lib/setup';

export default function SkipSetupButton() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSkip() {
    setSaving(true);
    setError('');
    const ok = await skipSetup(localStorage.getItem('access_token') ?? undefined);
    setSaving(false);
    if (ok) router.push('/dashboard');
    else setError('Could not skip setup. Please try again.');
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleSkip}
        disabled={saving}
        className="text-sm font-medium text-slate-500 underline hover:text-slate-700 disabled:opacity-60"
      >
        {saving ? 'Skipping…' : 'Skip for now'}
      </button>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}