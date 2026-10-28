import { redirect } from 'next/navigation';

// The old retrieval tool moved to /admin/retrieval (SRS-220.3). Everyone who
// opens /meetings goes to the dashboard. /meetings/[id] is unchanged.
export default function MeetingsPage() {
  redirect('/dashboard');
}
