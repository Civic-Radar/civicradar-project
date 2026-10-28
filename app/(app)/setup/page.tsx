import PageShell from '../../components/ui/PageShell';
import SetupSteps from './SetupSteps';

export default function SetupPage() {
  return (
    <PageShell eyebrow="First-time setup" title="Set up Civic Radar">
      <SetupSteps />
    </PageShell>
  );
}