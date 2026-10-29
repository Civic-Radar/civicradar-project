import { describe, expect, it } from 'vitest';
import { SETUP_STEPS, stepAfterSave } from '../../lib/setup';

describe('Setup next step (SRS-107.2)', () => {
  it('starts first-time setup with the town step', () => {
    expect(SETUP_STEPS.towns.label).toBe('Step 1 of 2: Choose your towns');
  });

  // Acceptance criterion: saving towns opens the topic selection section
  it('opens the topic selection step after towns are saved', () => {
    expect(stepAfterSave('towns')).toBe('topics');
  });

  it('labels the topic step so the user can see it opened', () => {
    expect(SETUP_STEPS[stepAfterSave('towns') as 'topics'].label).toBe('Step 2 of 2: Choose your topics');
  });
});