'use client';

import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { cardClasses } from '../../components/ui/Card';

// SRS-102.1: when each followed town was last checked successfully.
// SRS-102.2: "Could not check the source" when its most recent check was not successful.
// SRS-102.3: "Checked — no new information" when it was successful and found nothing new.

type TownFreshness = {
  town_id: number;
  name: string;
  last_successful_check: string | null;
  latest_check_failed: boolean;
  no_new_information: boolean;
};

const LOAD_ERROR = 'Data freshness could not be loaded. Please try again.';

export default function DataFreshness() {
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [towns, setTowns] = useState<TownFreshness[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { setSignedOut(true); setLoading(false); return; }

    fetch('/api/data-freshness', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401) setSignedOut(true);
        else if (!res.ok) setLoadError(data.error || LOAD_ERROR);
        else setTowns(data.towns ?? []);
      })
      .catch(() => setLoadError(LOAD_ERROR))
      .finally(() => setLoading(false));
  }, []);

  // The town section above already tells a signed-out visitor to log in.
  if (loading || signedOut) return null;

  return (
    <section className={cardClasses('mt-4 min-w-0 lg:mt-6')} aria-labelledby="data-freshness-heading">
      <h2 id="data-freshness-heading" className="mb-4 flex items-center gap-3 text-lg font-semibold tracking-tight text-fg">
        Data freshness
        <Clock aria-hidden="true" className="ml-auto h-5 w-5" />
      </h2>

      {loadError ? (
        <p role="alert" className={alertClasses('error')}>{loadError}</p>
      ) : towns.length === 0 ? (
        <p className="text-sm text-fg-muted">Follow a town to see when Civic Radar last checked it.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {towns.map((town) => (
            <li key={town.town_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
              <span className="font-medium text-fg">{town.name}</span>
              <span className="flex flex-wrap items-center gap-2 text-fg-muted">
                {town.latest_check_failed ? <Badge tone="warning">Could not check the source</Badge> : null}
                {town.no_new_information ? <Badge tone="neutral">Checked — no new information</Badge> : null}
                {town.last_successful_check
                  ? `Last checked ${town.last_successful_check}`
                  : 'No successful check yet'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}