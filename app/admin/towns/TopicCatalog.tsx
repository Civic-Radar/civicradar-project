'use client';

// SRS-104.4, KJ, Catalog entry removal

import { useEffect, useState } from 'react';
import CatalogRemoveButton from './CatalogRemoveButton';

type Topic = { topic_id: number; name: string };

export default function TopicCatalog({ token }: { token: string }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  function handleRemoved(name: string) {
    setSuccess(`Removed ${name}. Residents no longer see it in their topic list.`);
    loadTopics();
  }

  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold">Topics</h2>
      {success ? (
        <p role="status" className="mt-3 rounded-xl border border-accent-line bg-accent-wash/30 p-3 text-sm text-accent-soft">{success}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
      ) : null}
      {topics.length === 0 ? (
        <p className="mt-2 text-sm text-fg-subtle">No topics yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-raised rounded-xl border border-raised">
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