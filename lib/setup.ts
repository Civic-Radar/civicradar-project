export async function pathAfterSignIn(accessToken: string | undefined): Promise<string> {
  if (!accessToken) return '/dashboard';
  try {
    const res = await fetch('/api/setup', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return '/dashboard';
    const data = await res.json();
    return data.needs_setup ? '/setup' : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

export async function skipSetup(accessToken: string | undefined): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch('/api/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ setup_status: 'Skipped' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type SetupStep = 'towns' | 'topics';

export const SETUP_STEPS: Record<SetupStep, { label: string; description: string }> = {
  towns: {
    label: 'Step 1 of 2: Choose your towns',
    description: 'Pick the towns you want to follow, so your dashboard shows meetings that matter to you.',
  },
  topics: {
    label: 'Step 2 of 2: Choose your topics',
    description: 'Pick the topics you care about, so you can find the meetings that discuss them.',
  },
};

export function stepAfterSave(step: SetupStep): SetupStep | 'done' {
  return step === 'towns' ? 'topics' : 'done';
}