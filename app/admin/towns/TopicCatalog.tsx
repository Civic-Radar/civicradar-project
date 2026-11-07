'use client';

// SRS-104.4, KJ, Catalog entry removal
// SRS-104.2, KJ, Catalog entry creation

import { useEffect, useState } from 'react';
import CatalogRemoveButton from './CatalogRemoveButton';

type Topic = { topic_id: number; name: string };

export default function TopicCatalog({ token }: { token: string }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  async function loadTopics() {
    try {
      const res = await fetch('/api/topics', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) setTopics(data.topics ?? []);
      else setError(data.error || 'Topics could not be loaded.');
    } catch {
      setError('Topics could not be loaded.');
    }
  }

  useEffect(() => {
    loadTopics();
  }, [token]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    setAddError('');
    setSuccess('');
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess(`Added ${data.topic.name}. Residents can now select it.`);
        setNewName('');
        loadTopics();
      } else {
        setAddError(data.error || 'The topic could not be saved.');
      }
    } catch {
      setAddError('The topic could not be saved.');
    }
    setAdding(false);
  }

  function handleRemoved(name: string) {
    setSuccess(`Removed ${name}. Residents no longer see it in their topic list.`);
    loadTopics();
  }

  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold">Topics</h2>

      <form onSubmit={handleAdd} noValidate className="mt-3 space-y-2">
        <label className="block text-sm text-fg-soft">
          New topic name
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
            aria-invalid={addError !== ''}
            placeholder="Parks"
            className={`mt-1 w-full rounded-xl border ${addError ? 'border-danger-vivid' : 'border-line focus:border-accent-strong'} bg-surface px-4 py-3 text-fg outline-none transition`}
          />
        </label>
        <button
          type="submit"
          disabled={adding}
          className="rounded-xl bg-accent-strong px-4 py-3 font-semibold text-surface transition hover:bg-accent disabled:opacity-70"
        >
          {adding ? 'Saving…' : 'Add topic'}
        </button>
      </form>

      {addError ? (
        <p role="alert" className="mt-3 rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{addError}</p>
      ) : null}
      {success ? (
        <p role="status" className="mt-3 rounded-xl border border-accent-line bg-accent-wash/30 p-3 text-sm text-accent-soft">{success}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
      ) : null}

      {topics.length === 0 ? (
        <p className="mt-2 text-sm text-fg-subtle">No topics yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-raised rounded-xl border border-raised">
          {topics.map((topic) => (
            <li key={topic.topic_id} className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="font-medium">{topic.name}</p>
              <CatalogRemoveButton
                kind="topic"
                id={topic.topic_id}
                name={topic.name}
                token={token}
                onRemoved={handleRemoved}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}