'use client';

// SRS-103.1, KJ, Member permission display
// SRS-103.2, KJ, Permission assignment
// SRS-103.3, KJ, Membership change restriction

import { useCallback, useEffect, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';
import PageShell from '../../components/ui/PageShell';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import { inputClasses } from '../../components/ui/TextField';

type PermissionLevel = 'Member' | 'Administrator';
type Member = { user_id: string; email: string; permission_level: PermissionLevel };
type Organization = { organization_id: number; name: string };

const PERMISSION_LEVELS: PermissionLevel[] = ['Member', 'Administrator'];
const LOAD_ERROR = 'The organization could not be loaded. Please try again.';

export default function OrganizationPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myLevel, setMyLevel] = useState<PermissionLevel | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    setToken(stored);
    if (!stored) { setSignedOut(true); setLoading(false); return; }
    load(stored);
  }, [load]);

  // Sends one change, shows the server's answer, and reloads the list so it
  // always shows what is really saved (unchanged after a denied request).
  async function send(url: string, method: string, body: unknown, successMessage: string) {
    if (!token) return false;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSuccess(successMessage);
      else setError(data.error || 'The change could not be saved. Please try again.');
      return res.ok;
    } catch {
      setError('The change could not be saved. Please try again.');
      return false;
    } finally {
      await load(token);
      setBusy(false);
    }
  }

  // SRS-103.2
  async function assignLevel(member: Member, level: PermissionLevel) {
    if (level === member.permission_level) return;
    await send(
      `/api/organization/members/${member.user_id}`,
      'PATCH',
      { permission_level: level },
      `${member.email} is now ${level === 'Administrator' ? 'an Administrator' : 'a Member'}.`,
    );
  }

  // SRS-103.3
  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email) { setError('Enter the email of the account to add.'); return; }
    const added = await send('/api/organization/members', 'POST', { email }, `Added ${email} as a Member.`);
    if (added) setNewEmail('');
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.email} from ${organization?.name ?? 'the organization'}?`)) return;
    await send(`/api/organization/members/${member.user_id}`, 'DELETE', undefined, `Removed ${member.email}.`);
  }

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

  const isAdministrator = myLevel === 'Administrator';

  return (
    <PageShell eyebrow="Civic Radar" title={organization.name}>
      <p className="mt-2 text-sm text-fg-muted">
        Your permission level: <span className="font-semibold text-fg">{myLevel}</span>
      </p>

      {error ? <p role="alert" className={alertClasses('error', 'mt-6')}>{error}</p> : null}
      {success ? <p role="status" className={alertClasses('success', 'mt-6')}>{success}</p> : null}

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

                {isAdministrator ? (
                  <select
                    aria-label={`Permission level for ${member.email}`}
                    value={member.permission_level}
                    disabled={busy}
                    onChange={(event) => assignLevel(member, event.target.value as PermissionLevel)}
                    className="min-h-11 rounded-md border border-line bg-card px-3 text-sm text-fg"
                  >
                    {PERMISSION_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                ) : null}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeMember(member)}
                  className={buttonClasses({ variant: 'secondary' })}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={cardClasses('mt-4 min-w-0')} aria-labelledby="add-member-heading">
        <h2 id="add-member-heading" className="mb-2 text-lg font-semibold tracking-tight text-fg">Add a member</h2>
        <p className="mb-4 text-sm text-fg-muted">
          Only an organization administrator can add or remove members. The new member starts as a Member.
        </p>
        <form onSubmit={addMember} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            aria-label="Email of the account to add"
            placeholder="name@example.com"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className={inputClasses('sm:flex-1')}
          />
          <button type="submit" disabled={busy} className={buttonClasses()}>
            Add member
          </button>
        </form>
      </section>
    </PageShell>
  );
}
