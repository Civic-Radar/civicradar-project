// Tests for SRS-302.1: reading a document's text from CivicClerk and finding
// officials with the Claude API. Both services are replaced by fake fetch calls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FindOfficialsError, findOfficials, normalizeOfficials } from '../../lib/extraction/findOfficials';
import { DocumentTextError, fetchDocumentText } from '../../lib/sources/civicclerkFiles';

function claudeReply(officials: unknown, status = 200) {
  const body = { content: [{ type: 'tool_use', name: 'record_officials', input: { officials } }] };
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

async function failureOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the call to fail');
}

describe('findOfficials (Claude API)', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const savedModel = process.env.ANTHROPIC_MODEL;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedModel === undefined) delete process.env.ANTHROPIC_MODEL; else process.env.ANTHROPIC_MODEL = savedModel;
  });

  it('returns each official with name, title, role, email, and phone', async () => {
    const fetchMock = claudeReply([
      { full_name: 'Maureen Elizabeth Fisher', title: 'City Clerk', role: null, email: 'clerk@salem.com', phone: '978-555-0100' },
    ]);

    const officials = await findOfficials('Attest: Maureen Elizabeth Fisher, City Clerk', fetchMock as unknown as typeof fetch);

    expect(officials).toEqual([
      { full_name: 'Maureen Elizabeth Fisher', title: 'City Clerk', role: null, email: 'clerk@salem.com', phone: '978-555-0100' },
    ]);
  });

  it('sends the document to the Messages API with the key and a forced tool', async () => {
    const fetchMock = claudeReply([]);

    await findOfficials('AGENDA TEXT', fetchMock as unknown as typeof fetch);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(init.body as string);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_officials' });
    expect(body.messages[0].content).toContain('<document>\nAGENDA TEXT\n</document>');
  });

  it('uses ANTHROPIC_MODEL when it is set', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
    const fetchMock = claudeReply([]);

    await findOfficials('text', fetchMock as unknown as typeof fetch);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe('claude-sonnet-5-5');
  });

  it('fails without calling the API when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = claudeReply([]);

    const error = await failureOf(findOfficials('text', fetchMock as unknown as typeof fetch));

    expect(error.name).toBe('FindOfficialsError');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails on an API error and reports only the status', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"overloaded"}', { status: 529 }));

    const error = await failureOf(findOfficials('secret agenda text', fetchMock as unknown as typeof fetch));

    expect(error instanceof FindOfficialsError).toBe(true);
    expect(error.message).toBe('The Claude API returned status 529.');
  });
});

describe('normalizeOfficials', () => {
  it('turns blanks into null, drops bad emails, and skips entries with no name', () => {
    const result = normalizeOfficials([
      { full_name: '  Jonathan   Berk ', title: '', role: 'Planning Board Chair', email: 'not an email', phone: '  ' },
      { full_name: '', title: 'City Clerk' },
      { title: 'No name at all' },
    ]);

    expect(result).toEqual([
      { full_name: 'Jonathan Berk', title: null, role: 'Planning Board Chair', email: null, phone: null },
    ]);
  });

  it('lists each person once and keeps details from either copy', () => {
    const result = normalizeOfficials([
      { full_name: 'Alice Merkl', title: 'City Councillor', role: null, email: null, phone: null },
      { full_name: 'alice merkl', title: null, role: 'Presiding', email: 'amerkl@salem.com', phone: null },
    ]);

    expect(result).toEqual([
      { full_name: 'Alice Merkl', title: 'City Councillor', role: 'Presiding', email: 'amerkl@salem.com', phone: null },
    ]);
  });

  it('cuts values to the column sizes in the schema', () => {
    const [official] = normalizeOfficials([{ full_name: 'A'.repeat(300), phone: '9'.repeat(50) }]);

    expect(official.full_name).toHaveLength(150);
    expect(official.phone).toHaveLength(30);
  });
});

describe('fetchDocumentText (CivicClerk)', () => {
  it("asks CivicClerk for the file's plain text and returns it", async () => {
    const fetchMock = vi.fn(async () => new Response('SALEM CITY COUNCIL AGENDA\r\nRoll call of members', { status: 200 }));

    const text = await fetchDocumentText('salemma', '1169', fetchMock as unknown as typeof fetch);

    expect(text).toBe('SALEM CITY COUNCIL AGENDA\nRoll call of members');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://salemma.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=1169,plainText=true)',
    );
  });

  it('accepts the text sent as a JSON string', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify('Minutes of the City Council meeting'), { status: 200 }));

    const text = await fetchDocumentText('salemma', '1168', fetchMock as unknown as typeof fetch);

    expect(text).toBe('Minutes of the City Council meeting');
  });

  const failures: [string, string, () => Response, string][] = [
    ['a file CivicClerk no longer has', '1169', () => new Response('', { status: 404 }), 'Missing source file'],
    ['a file with no readable text', '1169', () => new Response('   \n  ', { status: 200 }), 'Unreadable file'],
    ['a CivicClerk server error', '1169', () => new Response('', { status: 500 }), 'Other'],
  ];

  for (const [name, fileId, reply, cause] of failures) {
    it(`reports "${cause}" for ${name}`, async () => {
      const fetchMock = vi.fn(async () => reply());

      const error = await failureOf(fetchDocumentText('salemma', fileId, fetchMock as unknown as typeof fetch));

      expect(error instanceof DocumentTextError).toBe(true);
      expect((error as DocumentTextError).failureCause).toBe(cause);
    });
  }

  it('reports "Missing source file" for a placeholder document without calling CivicClerk', async () => {
    const fetchMock = vi.fn();

    const error = await failureOf(fetchDocumentText('salemma', 'demo-file-1', fetchMock as unknown as typeof fetch));

    expect((error as DocumentTextError).failureCause).toBe('Missing source file');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
