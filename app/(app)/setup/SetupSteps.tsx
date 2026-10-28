'use client';

import { useState } from 'react';
import { SETUP_STEPS, stepAfterSave, type SetupStep } from '../../../lib/setup';
import TownPreferences from '../preferences/TownPreferences';
import TopicPreferences from '../preferences/TopicPreferences';
import SkipSetupButton from './SkipSetupButton';

export default function SetupSteps() {
  const [step, setStep] = useState<SetupStep>('towns');
  const current = SETUP_STEPS[step];

  function handleTownsSaved() {
    const next = stepAfterSave('towns');
    if (next !== 'done') setStep(next);
  }

  return (
    <div className="mt-6 max-w-xl">
      <p className="text-sm font-semibold text-fg">{current.label}</p>
      <p className="mt-1 text-sm text-fg-muted">{current.description}</p>
      <div className="mt-4">
        {step === 'towns' ? <TownPreferences onSaved={handleTownsSaved} /> : <TopicPreferences />}
      </div>
      <SkipSetupButton />
    </div>
  );
}