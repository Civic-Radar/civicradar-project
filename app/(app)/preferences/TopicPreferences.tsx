'use client';

// SRS-101.5: the topic selection section shows every topic in the catalog.

import { useEffect, useState } from 'react';

type Topic = { topic_id: number; name: string };

export default function TopicPreferences() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }

    fetch('/api/topics', { headers: { Authorization: `Bearer ${stored}` } })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setTopics(data.topics ?? []);
        else setError(data.error || 'Topics could not be loaded. Please try again.');
      })
      .catch(() => setError('Topics could not be loaded. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  // The towns section above already asks signed-out users to log in.
  if (!token) return null;

  return (
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-widest text-fg-subtle">Topics</h2>

      {loading ? <p className="mt-3 text-fg-subtle">Loading…</p> : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
      ) : null}

      {!loading && !error ? (
        <ul className="mt-3 space-y-2">
          {topics.map((topic) => (
            <li key={topic.topic_id} className="rounded-xl border border-line bg-surface px-4 py-3 text-fg">
              {topic.name}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}