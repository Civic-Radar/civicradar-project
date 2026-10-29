// Tests for SRS-305.2, AO, Deletion confirmation.
// "The system shall ask the user to confirm deletion, naming the extraction's
//  source document, when the user selects Delete."
//
// Acceptance: Given a saved extraction of document X, When the user selects its
// Delete control, Then a confirmation naming document X is displayed.
//
// The Saved Extractions page shows deletionConfirmationMessage(<that extraction's
// source_document_title>) under the extraction whose Delete control was selected.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deletionConfirmationMessage } from '../../lib/extractions';

const DOCUMENT_X = 'Salem City Council Special Meeting October 15, 2026';
const DOCUMENT_Y = 'Joint Public Hearing with the Planning Board Monday October 19, 2026';

describe('Deletion confirmation (SRS-305.2)', () => {
  it('names document X when the extraction of document X is to be deleted', () => {
    expect(deletionConfirmationMessage(DOCUMENT_X)).toBe(`Delete your extraction of "${DOCUMENT_X}"?`);
  });

  it('names only the document being deleted, not another one', () => {
    const message = deletionConfirmationMessage(DOCUMENT_Y);
    expect(message).toContain(DOCUMENT_Y);
    expect(message).not.toContain(DOCUMENT_X);
  });

  it('is shown for the extraction whose Delete control was selected, using its own title', () => {
    // The page wires each row's Delete control to its own extraction and builds the
    // message from that extraction's source document title.
    const page = readFileSync('app/(app)/extractions/page.tsx', 'utf8');
    expect(page).toContain('onClick={() => setConfirmingId(e.extraction_id)}');
    expect(page).toContain('confirmingId === e.extraction_id');
    expect(page).toContain('deletionConfirmationMessage(e.source_document_title)');
  });
});
