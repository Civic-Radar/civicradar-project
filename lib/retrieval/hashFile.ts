import { createHash } from 'node:crypto';

// Returns the values stored in documents.file_sha256 (64 lowercase hex
// characters) and documents.file_size_bytes for a downloaded file.
export function hashFile(bytes: Uint8Array): { sha256: string; sizeBytes: number } {
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };
}
