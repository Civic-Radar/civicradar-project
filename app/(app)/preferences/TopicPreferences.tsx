'use client';

// SRS-101.5: the topic selection section shows every topic in the catalog.
// SRS-101.4: residents select topics and save them as their followed topics.

import { useEffect, useRef, useState } from 'react';

type Topic = { topic_id: number; name: string; followed: boolean };

const LOAD_ERROR = 'Your followed topics could not be loaded. Please try again.';
const SAVE_ERROR = 'Your followed topics could not be saved. Please try again.';

export default function TopicPreferences() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Blocks a second save before the disabled button has re-rendered.
  const saveInFlight = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }
    loadTopics(stored);
  }, []);

  async function loadTopics(accessToken: string) {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/followed-topics', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.ok) setTopics(data.topics ?? []);
      else setLoadError(data.error || LOAD_ERROR);
    } catch {
      setLoadError(LOAD_ERROR);
    }
    setLoading(false);
  }

  function toggleTopic(topicId: number) {
    setSaved(false);
    setSaveError('');
    setTopics((current) =>
      current.map((topic) => (topic.topic_id === topicId ? { ...topic, followed: !topic.followed } : topic)),
    );
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const res = await fetch('/api/followed-topics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic_ids: topics.filter((topic) => topic.followed).map((topic) => topic.topic_id) }),
      });
      const data = await res.json();
      if (res.ok) { setTopics(data.topics ?? []); setSaved(true); }
      else setSaveError(data.error || SAVE_ERROR);
    } catch {
      setSaveError(SAVE_ERROR);
    }
    saveInFlight.current = false;
    setSaving(false);
  }

  // The towns section already asks signed-out users to log in.
  if (!token) return null;

  if (loading) return <p className="mt-8 text-fg-subtle">Loading…</p>;

  if (loadError) {
    return (
      <p role="alert" className="mt-8 rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{loadError}</p>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-8">
      <fieldset disabled={saving} className="min-w-0">
        <legend className="text-xs uppercase tracking-widest text-fg-subtle">Topics</legend>

        <ul className="mt-3 space-y-2">
          {topics.map((topic) => (
            <li key={topic.topic_id}>
              <label className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-fg">
                <input
                  type="checkbox"
                  checked={topic.followed}
                  onChange={() => toggleTopic(topic.topic_id)}
                  className="h-4 w-4 shrink-0 accent-accent-strong"
                />
                <span className="min-w-0 break-words">{topic.name}</span>
              </label>
            </li>
          ))}
        </ul>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-accent-strong px-4 py-2 text-sm font-semibold text-surface hover:bg-accent disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? 'Saving…' : 'Save topics'}
        </button>
      </fieldset>

      {saved ? (
        <p role="status" className="mt-4 rounded-xl border border-line bg-raised/80 p-3 text-sm text-fg">
          Topic preferences saved.
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{saveError}</p>
      ) : null}
    </form>
  );
}