// Used when RETRIEVAL_MAX_FILE_MB is unset or invalid, so a missing setting
// can never mean unlimited (SRS-208.2). The setting can only lower the limit.
export const DEFAULT_MAX_FILE_MB = 50;

const BYTES_PER_MB = 1024 * 1024;

// The document size limit in bytes, read from the server setting only, never
// from the request. A value that is not a whole number from 1 to the default
// gives the default.
export function retrievalMaxFileBytes(env: NodeJS.ProcessEnv = process.env): number {
  const setting = env.RETRIEVAL_MAX_FILE_MB?.trim() ?? '';
  const value = /^\d+$/.test(setting) ? Number(setting) : 0;
  const megabytes = value >= 1 && value <= DEFAULT_MAX_FILE_MB ? value : DEFAULT_MAX_FILE_MB;

  return megabytes * BYTES_PER_MB;
}
