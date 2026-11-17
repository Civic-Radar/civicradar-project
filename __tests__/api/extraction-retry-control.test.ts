// Tests for SRS-307.5, AO, Retry control (bug #654):
// "The system shall display a Retry control when an extraction's status changes
//  to Failed."
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETRY_LABEL, showsRetryControl } from '../../lib/extractionRetry';

const page = readFileSync(join(process.cwd(), 'app/(app)/extractions/[id]/page.tsx'), 'utf8');

describe('SRS-307.5: a Failed extraction shows a Retry control', () => {
  it('shows Retry when the status is Failed', () => {
    expect(showsRetryControl('Failed')).toBe(true);
  });

  it.each(['Queued', 'Processing', 'Completed'])('does not show Retry when the status is %s', (status) => {
    expect(showsRetryControl(status)).toBe(false);
  });

  it('does not show Retry before the extraction has loaded', () => {
    expect(showsRetryControl(undefined)).toBe(false);
    expect(showsRetryControl(null)).toBe(false);
  });

  it('labels the control "Retry"', () => {
    expect(RETRY_LABEL).toBe('Retry');
  });

  it('the extraction page shows the control from the extraction\'s current status', () => {
    expect(page).toContain('showsRetryControl(extraction?.status)');
    expect(page).toContain('data-testid="retry-extraction"');
    expect(page).toContain('{retrying ? RETRYING_LABEL : RETRY_LABEL}');
  });

  it('the extraction page starts a retry for the failed extraction when Retry is selected', () => {
    expect(page).toContain('retryExtraction(extraction, token)');
    expect(page).toContain('onClick={retry}');
  });
});
