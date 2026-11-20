'use client';

// SRS-103.1, KJ, Member permission display

import { useCallback, useEffect, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { cardClasses } from '../../components/ui/Card';
import PageShell from '../../components/ui/PageShell';
import SignedOutNotice from '../../components/ui/SignedOutNotice';

type PermissionLevel = 'Member' | 'Administrator';
type Member = { user_id: string; email: string; permission_level: PermissionLevel };
type Organization = { organization_id: number; name: string };

const LOAD_ERROR = 'The organization could not be loaded. Please try again.';

export default function OrganizationPage() {
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myLevel, setMyLevel] = useState<PermissionLevel | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch('/api/organization/members', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.status === 401) { setSignedOut(true); return; }
      if (!res.ok) { setError(data.error || LOAD_ERROR); return; }
      setOrganization(data.organization);
      setMyUserId(data.my_user_id ?? null);
      setMyLevel(data.my_permission_level);
      setMembers(data.members ?? []);
    } catch {
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    if (!stored) { setSignedOut(true); setLoading(false); return; }
    load(stored);
  }, [load]);

  if (loading) {
    return (
      <PageShell eyebrow="Civic Radar" title="Organization">
        <p className="mt-6 text-fg-subtle">Loading…</p>
      </PageShell>
    );
  }

  if (signedOut) {
    return (
      <PageShell eyebrow="Civic Radar" title="Organization">
        <SignedOutNotice className="mt-6" message="You must be logged in to see your organization." />
      </PageShell>
    );
  }

  if (!organization) {
    return (
      <PageShell eyebrow="Civic Radar" title="Organization">
        {error ? (
          <p role="alert" className={alertClasses('error', 'mt-6')}>{error}</p>
        ) : (
          <p className="mt-6 text-fg-muted">You are not a member of an organization.</p>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Civic Radar" title={organization.name}>
      <p className="mt-2 text-sm text-fg-muted">
        Your permission level: <span className="font-semibold text-fg">{myLevel}</span>
      </p>

      {error ? <p role="alert" className={alertClasses('error', 'mt-6')}>{error}</p> : null}

      <section className={cardClasses('mt-6 min-w-0')} aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-4 text-lg font-semibold tracking-tight text-fg">
          Members ({members.length})
        </h2>

        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3 text-sm">
              <span className="font-medium text-fg">
                {member.email}
                {member.user_id === myUserId ? <span className="ml-2 text-fg-muted">(you)</span> : null}
              </span>

              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={member.permission_level === 'Administrator' ? 'success' : 'neutral'}>
                  {member.permission_level}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
