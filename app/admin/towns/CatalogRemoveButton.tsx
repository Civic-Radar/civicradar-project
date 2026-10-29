'use client';

// SRS-104.4, KJ, Catalog entry removal

import { useState } from 'react';

type Props = {
  kind: 'town' | 'topic';
  id: number;
  name: string;
  token: string;
  onRemoved: (name: string) => void;
};

export default function CatalogRemoveButton({ kind, id, name, token, onRemoved }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setRemoving(true);
    setError('');
    try {
      const res = await fetch(kind === 'town' ? `/api/towns/${id}` : `/api/topics/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfirming(false);
        onRemoved(name);
      } else {
        setError(data.error || `The ${kind} could not be removed.`);
      }
    } catch {
      setError(`The ${kind} could not be removed.`);
    }
    setRemoving(false);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${name}`}
        className="rounded-full border border-line bg-raised px-3 py-1 text-xs hover:border-danger-vivid hover:text-danger"
      >
        Remove
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-fg-muted">Remove {name}?</span>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={removing}
        className="rounded-full border border-danger-line bg-danger-wash/30 px-3 py-1 text-xs text-danger disabled:opacity-60"
      >
        {removing ? 'Removing…' : 'Confirm remove'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={removing}
        className="rounded-full border border-line bg-raised px-3 py-1 text-xs"
      >
        Cancel
      </button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}