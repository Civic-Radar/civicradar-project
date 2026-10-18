import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Anthropic SDK is mocked: no test reaches the Claude API.
const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  clientOptions: [] as unknown[],
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: sdk.create };
    constructor(options: unknown) {
      sdk.clientOptions.push(options);
    }
  },
}));

import { SUMMARY_SYSTEM_PROMPT, summarizeDocument, type SummaryInput } from '../../lib/summaries/summarize';

// Distinctive values, so the checks can prove none of them is logged or returned.
const ANTHROPIC_KEY = 'test-anthropic-key-MARKER-91d2';
const MODEL_NAME = 'test-model-MARKER-55af';
const PDF_MARKER = 'PDF-BYTES-MARKER-7c1e';

const PDF_BYTES = new TextEncoder().encode(`%PDF-1.4 ${PDF_MARKER} Salem agenda 1166`);
const PDF_BASE64 = Buffer.from(PDF_BYTES).toString('base64');

const INPUT: SummaryInput = {
  pdfBytes: PDF_BYTES,
  documentType: 'Agenda',
  title: 'City Council Agenda',
  townName: 'Salem',
};

function words(marker: string, count: number): string {
  return [marker, ...Array.from({ length: count - 1 }, (_, i) => `council${i}`)].join(' ');
}

const SUMMARY_120 = words('SUMMARY-120-MARKER', 120);

type Block = { type: 'text'; text: string } | { type: 'thinking'; thinking: string; signature: string };

function reply(content: Block[], stopReason = 'end_turn') {
  return { content, stop_reason: stopReason };
}

function textReply(text: string, stopReason = 'end_turn') {
  return reply([{ type: 'text', text }], stopReason);
}

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

describe('summarizeDocument (SRS-204.1, SRS-NFR-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.clientOptions.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network is disabled in tests');
      }),
    );
    vi.stubEnv('ANTHROPIC_API_KEY', ANTHROPIC_KEY);
    vi.stubEnv('SUMMARY_MODEL', MODEL_NAME);
    for (const method of CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    // summarizeDocument logs nothing: no summary text, key or file bytes.
    for (const method of CONSOLE_METHODS) {
      expect(vi.mocked(console[method])).not.toHaveBeenCalled();
    }

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function summarize(input: SummaryInput = INPUT) {
    const result = await summarizeDocument(input);
    // The result never carries the key, the model name or the file.
    const serialized = JSON.stringify(result);
    for (const value of [ANTHROPIC_KEY, MODEL_NAME, PDF_MARKER, PDF_BASE64]) {
      expect(serialized).not.toContain(value);
    }
    return result;
  }

  it('sends the PDF as a document with the verbatim prompt, the model from SUMMARY_MODEL and low effort', async () => {
    sdk.create.mockResolvedValue(textReply(SUMMARY_120));

    await summarize();

    expect(sdk.clientOptions).toEqual([{ apiKey: ANTHROPIC_KEY }]);
    expect(sdk.create).toHaveBeenCalledTimes(1);
    // toEqual on the whole request: no thinking, temperature or other settings.
    expect(sdk.create.mock.calls[0]).toEqual([
      {
        model: MODEL_NAME,
        max_tokens: 4096,
        output_config: { effort: 'low' },
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF_BASE64 } },
              {
                type: 'text',
                text:
                  'Document type: Agenda\nDocument title: City Council Agenda\nTown: Salem\n\n' +
                  'The document is attached as a PDF. Some pages may be scanned images, so read those too. Write the summary now.',
              },
            ],
          },
        ],
      },
    ]);
  });

  it('inserts a title containing $& or $1 literally', async () => {
    sdk.create.mockResolvedValue(textReply(SUMMARY_120));

    await summarize({ ...INPUT, title: 'Order $& and $1 fees' });

    const text = sdk.create.mock.calls[0][0].messages[0].content[1].text as string;
    expect(text).toContain('Document title: Order $& and $1 fees\n');
  });

  it('returns a 120-word summary, trimmed, with its word count', async () => {
    sdk.create.mockResolvedValue(textReply(`  ${SUMMARY_120}\n`));

    expect(await summarizeDocument(INPUT)).toStrictEqual({ ok: true, text: SUMMARY_120, wordCount: 120 });
  });

  it('accepts exactly 150 words and rejects 151', async () => {
    sdk.create.mockResolvedValueOnce(textReply(words('W', 150)));
    expect(await summarize()).toMatchObject({ ok: true, wordCount: 150 });

    sdk.create.mockResolvedValueOnce(textReply(words('W', 151)));
    expect(await summarize()).toStrictEqual({ ok: false, reason: 'over_word_limit', wordCount: 151 });
  });

  it('returns over_word_limit with no text for a 200-word reply', async () => {
    const summary200 = words('SUMMARY-200-MARKER', 200);
    sdk.create.mockResolvedValue(textReply(summary200));

    const result = await summarize();

    // toStrictEqual: no text key, so the caller has nothing to store.
    expect(result).toStrictEqual({ ok: false, reason: 'over_word_limit', wordCount: 200 });
    expect(JSON.stringify(result)).not.toContain('SUMMARY-200-MARKER');
  });

  it('reads the text block after an empty thinking block', async () => {
    sdk.create.mockResolvedValue(
      reply([
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: SUMMARY_120 },
      ]),
    );

    expect(await summarize()).toStrictEqual({ ok: true, text: SUMMARY_120, wordCount: 120 });
  });

  it('returns refused for a refusal and cut_off for a reply that hit max_tokens', async () => {
    sdk.create.mockResolvedValueOnce(textReply('', 'refusal'));
    expect(await summarize()).toStrictEqual({ ok: false, reason: 'refused' });

    sdk.create.mockResolvedValueOnce(textReply(SUMMARY_120, 'max_tokens'));
    expect(await summarize()).toStrictEqual({ ok: false, reason: 'cut_off' });
  });

  it('returns no_text for a blank reply or a reply with no text block', async () => {
    sdk.create.mockResolvedValueOnce(textReply('  \n '));
    expect(await summarize()).toStrictEqual({ ok: false, reason: 'no_text' });

    sdk.create.mockResolvedValueOnce(reply([{ type: 'thinking', thinking: 'notes', signature: 'sig' }]));
    expect(await summarize()).toStrictEqual({ ok: false, reason: 'no_text' });
  });

  it.each(['ANTHROPIC_API_KEY', 'SUMMARY_MODEL'])(
    'throws before creating a client when %s is missing',
    async (name) => {
      vi.stubEnv(name, ' ');

      await expect(summarizeDocument(INPUT)).rejects.toThrow(`Summary is not configured: ${name} is not set`);
      expect(sdk.clientOptions).toEqual([]);
      expect(sdk.create).not.toHaveBeenCalled();
    },
  );
});
