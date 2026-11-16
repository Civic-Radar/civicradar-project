// Exact texts the Documents page shows instead of the list (word for word from the SRS).

// SRS-201.3: shown to a signed-in user who follows zero towns. The scope control
// (SRS-213.1) is not built, so the Towns I follow scope is always the one selected.
export const SETUP_MESSAGE = 'Follow at least one town to see documents here.';

// SRS-201.4: the link shown with the setup message. The Towns section is the
// first section of the Preferences page, so the link opens the town selection.
export const SETUP_LINK_TEXT = 'Choose towns to follow';
export const SETUP_LINK_HREF = '/preferences';
