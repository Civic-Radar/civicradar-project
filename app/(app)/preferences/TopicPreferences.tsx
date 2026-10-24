'use client';

// SRS-101.5: the topic selection section shows every topic in the catalog.
// SRS-101.4: residents select topics and save them as their followed topics.

import { Leaf } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';

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

  if (loading) return <p className="text-fg-subtle">Loading…</p>;

  if (loadError) {
    return (
      <p role="alert" className={alertClasses('error')}>{loadError}</p>
    );
  }

  return (
    <form onSubmit={handleSave} className={cardClasses('min-w-0')}>
      <fieldset disabled={saving} className="min-w-0">
        <legend className="mb-4 flex w-full items-center gap-3 text-lg font-semibold tracking-tight text-fg">
          Topics
          <Leaf aria-hidden="true" className="ml-auto h-5 w-5" />
        </legend>

        <ul className="mb-7 grid gap-2 xl:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic.topic_id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-line p-3 text-sm text-fg has-[:checked]:border-line-strong has-[:checked]:bg-accent-wash/50">
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
          className={buttonClasses()}
        >
          {saving ? 'Saving…' : 'Save topics'}
        </button>
      </fieldset>

      {saved ? (
        <p role="status" className={alertClasses('success', 'mt-4')}>
          Topic preferences saved.
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className={alertClasses('error', 'mt-4')}>{saveError}</p>
      ) : null}
    </form>
  );
}