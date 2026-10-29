'use client';

// SRS-107.2, KJ, Setup next step
// SRS-107.4, KJ, Setup completion

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import { SETUP_STEPS, completeSetup, stepAfterSave, type SetupStep } from '../../../lib/setup';
import TownPreferences from '../preferences/TownPreferences';
import TopicPreferences from '../preferences/TopicPreferences';
import SkipSetupButton from './SkipSetupButton';

export default function SetupSteps() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('towns');
  const [error, setError] = useState('');
  const current = SETUP_STEPS[step];

  function handleTownsSaved() {
    const next = stepAfterSave('towns');
    if (next !== 'done') setStep(next);
  }

  async function handleTopicsSaved() {
    if (stepAfterSave('topics') !== 'done') return;
    setError('');
    const ok = await completeSetup(localStorage.getItem('access_token') ?? undefined);
    if (ok) router.push('/dashboard');
    else setError('Your topics were saved, but setup could not be finished. Please try again.');
  }

  return (
    <div className="mt-6 max-w-xl">
      <p className="text-sm font-semibold text-fg">{current.label}</p>
      <p className="mt-1 text-sm text-fg-muted">{current.description}</p>
      <div className="mt-4">
        {step === 'towns' ? (
          <TownPreferences onSaved={handleTownsSaved} />
        ) : (
          <TopicPreferences onSaved={handleTopicsSaved} />
        )}
      </div>
      {error ? <p role="alert" className={alertClasses('error', 'mt-4')}>{error}</p> : null}
      <SkipSetupButton />
    </div>
  );
}