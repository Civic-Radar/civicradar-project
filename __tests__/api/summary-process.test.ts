import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// No job runs in these tests. Mocked anyway, so the Anthropic SDK is never loaded.
vi.mock('../../lib/summaries/summarize', () => ({
  summarizeDocument: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { summarizeDocument } from '../../lib/summaries/summarize';
import { POST } from '../../app/api/summaries/process/route';

// Distinctive values, so the checks can prove none of them is logged or returned.
const PROCESS_SECRET = 'test-process-secret-MARKER-d4a0';
const ANTHROPIC_KEY = 'test-anthropic-key-MARKER-91d2';
const MODEL_NAME = 'test-model-MARKER-55af';
const SERVICE_ROLE_KEY = 'test-service-role-key-MARKER-3b8e';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

function callProcess(secretHeader?: string) {
  const headers: Record<string, string> = {};
  if (secretHeader !== undefined) {
    headers['x-summary-process-secret'] = secretHeader;
  }
  return POST(new Request('http://localhost/api/summaries/process', { method: 'POST', headers }));
}

describe('POST /api/summaries/process secret and settings checks (SRS-204.1)', () => {
  let responseBodies: string[];

  async function expectResponse(response: Response, status: number, error: string) {
    expect(response.status).toBe(status);
    const text = await response.text();
    responseBodies.push(text);
    expect(JSON.parse(text)).toEqual({ error });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    responseBodies = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network is disabled in tests');
      }),
    );
    vi.stubEnv('SUMMARY_PROCESS_SECRET', PROCESS_SECRET);
    vi.stubEnv('SUMMARY_API_KEY', ANTHROPIC_KEY);
    vi.stubEnv('SUMMARY_MODEL', MODEL_NAME);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
    for (const method of CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
    vi.mocked(getSupabaseClient).mockImplementation(() => {
      throw new Error('Supabase must not be called in these tests');
    });
  });

  afterEach(() => {
    // Every check here answers before any Supabase or model call.
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(summarizeDocument).not.toHaveBeenCalled();

    // Nothing is logged, and no response carries a secret or key.
    for (const method of CONSOLE_METHODS) {
      expect(vi.mocked(console[method])).not.toHaveBeenCalled();
    }
    for (const body of responseBodies) {
      for (const value of [PROCESS_SECRET, ANTHROPIC_KEY, MODEL_NAME, SERVICE_ROLE_KEY]) {
        expect(body).not.toContain(value);
      }
    }

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns 500 when SUMMARY_PROCESS_SECRET is not set, even with a header', async () => {
    vi.stubEnv('SUMMARY_PROCESS_SECRET', undefined);

    await expectResponse(await callProcess(PROCESS_SECRET), 500, 'Summary processing is not configured.');
  });

  it('returns 500 when SUMMARY_PROCESS_SECRET is blank, even with a matching blank header', async () => {
    vi.stubEnv('SUMMARY_PROCESS_SECRET', '   ');

    await expectResponse(await callProcess('   '), 500, 'Summary processing is not configured.');
  });

  it('returns 401 when the secret header is missing', async () => {
    await expectResponse(await callProcess(), 401, 'Unauthorized.');
  });

  it.each([
    ['wrong', 'not-the-secret'],
    ['empty', ''],
    ['the secret with an extra character', `${PROCESS_SECRET}x`],
  ])('returns 401 when the secret header is %s', async (_case, header) => {
    await expectResponse(await callProcess(header), 401, 'Unauthorized.');
  });

  it.each(['SUMMARY_API_KEY', 'SUMMARY_MODEL', 'SUPABASE_SERVICE_ROLE_KEY'])(
    'returns 500 naming %s when it is missing, with the right secret',
    async (name) => {
      vi.stubEnv(name, '');

      await expectResponse(
        await callProcess(PROCESS_SECRET),
        500,
        `Summary processing is not configured: missing ${name}`,
      );
    },
  );

  it('checks the secret before the settings', async () => {
    vi.stubEnv('SUMMARY_API_KEY', '');

    await expectResponse(await callProcess('not-the-secret'), 401, 'Unauthorized.');
  });
});
