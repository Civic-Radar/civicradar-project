import type { DocumentListEntry } from './useDocuments';

// The documents the type filter keeps, in the given order. An empty type means All documents.
export function documentsOfType(documents: DocumentListEntry[], type: string): DocumentListEntry[] {
  return type ? documents.filter((doc) => doc.document_type === type) : documents;
}
