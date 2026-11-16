import type { DocumentListEntry } from './useDocuments';

// SRS-216.2: the documents whose titles contain the search term, ignoring
// letter case, in their given order. The term is trimmed; a blank term keeps
// every document. The page passes only the documents in the current scope.
export function documentsMatchingTitle(documents: DocumentListEntry[], term: string): DocumentListEntry[] {
  const needle = term.trim().toLocaleLowerCase('en-US');
  if (needle === '') return documents;
  return documents.filter((doc) => (doc.title ?? '').toLocaleLowerCase('en-US').includes(needle));
}
