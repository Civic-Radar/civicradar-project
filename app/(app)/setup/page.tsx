import PageShell from '../../components/ui/PageShell';
import TownPreferences from '../preferences/TownPreferences';

export default function SetupPage() {
  return (
    <PageShell eyebrow="First-time setup" title="Choose your towns">
      <p className="mt-3 max-w-prose text-sm text-fg-muted">
        Pick the towns you want to follow, so your dashboard shows meetings that matter to you.
      </p>
      <div className="mt-6 max-w-xl">
        <TownPreferences />
      </div>
    </PageShell>
  );
}