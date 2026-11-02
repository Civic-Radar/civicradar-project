import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The processing function is mocked, so no database, Storage or model call runs.
vi.mock('../../lib/summaries/processPendingSummaries', () => ({
  processPendingSummaries: vi.fn(),
}));

import { processPendingSummaries, type ProcessPendingResult } from '../../lib/summaries/processPendingSummaries';
import { MAX_BATCHES_PER_RUN, startSummaryScheduler } from '../../lib/summaries/scheduler';
import { register } from '../../instrumentation';

const MINUTE = 60 * 1000;
const STATE_KEY = '__civicRadarSummaryScheduler';

// Distinctive text, so the checks can prove no error message is logged.
const ERROR_MARKER = 'db-error-MARKER-7c1f Introduction of Order 42';

const processBatch = vi.mocked(processPendingSummaries);

function processed(...documentIds: number[]): ProcessPendingResult {
  return { kind: 'processed', processed: documentIds };
}

function logLines(): string[] {
  return [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].map((args) =>
    args.map(String).join(' '),
  );
}

function clearSchedulerState() {
  delete (globalThis as unknown as Record<string, unknown>)[STATE_KEY];
}

describe('summary scheduler (SRS-204.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clearSchedulerState();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network is disabled in tests');
      }),
    );
    vi.stubEnv('SUMMARY_AUTORUN_MINUTES', '10');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    processBatch.mockResolvedValue(processed());
  });

  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.clearAllTimers();
    vi.useRealTimers();
    clearSchedulerState();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('setting', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['blank', '   '],
      ['zero', '0'],
      ['negative', '-5'],
      ['not a number', 'ten'],
      ['not a whole number', '1.5'],
    ])('creates no timer when SUMMARY_AUTORUN_MINUTES is %s', async (_case, value) => {
      vi.stubEnv('SUMMARY_AUTORUN_MINUTES', value);

      startSummaryScheduler();

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE);
      expect(processBatch).not.toHaveBeenCalled();
      expect(logLines()).toEqual([]);
    });

    it('starts one timer for a positive whole number, with the first run after one full interval', async () => {
      startSummaryScheduler();

      expect(vi.getTimerCount()).toBe(1);
      expect(processBatch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10 * MINUTE - 1);
      expect(processBatch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(processBatch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(2);
    });

    it('never starts twice', async () => {
      startSummaryScheduler();
      startSummaryScheduler();

      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('runs', () => {
    it('does not start a run while the previous one is still running', async () => {
      let finishFirst: (result: ProcessPendingResult) => void = () => {};
      processBatch.mockImplementationOnce(
        () =>
          new Promise<ProcessPendingResult>((resolve) => {
            finishFirst = resolve;
          }),
      );
      startSummaryScheduler();

      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(1);

      // Two more intervals pass while the first batch is still working.
      await vi.advanceTimersByTimeAsync(20 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(1);

      finishFirst(processed());
      await vi.advanceTimersByTimeAsync(0);
      expect(processBatch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(2);
    });

    it('runs batches until one processes nothing, then logs one line of counts', async () => {
      processBatch
        .mockResolvedValueOnce(processed(31, 32, 33, 34, 35))
        .mockResolvedValueOnce(processed(36, 37))
        .mockResolvedValueOnce(processed());
      startSummaryScheduler();

      await vi.advanceTimersByTimeAsync(10 * MINUTE);

      expect(processBatch).toHaveBeenCalledTimes(3);
      expect(logLines()).toEqual(['Summary autorun: 7 documents processed in 3 batches']);
    });

    it('logs nothing when the first batch processes nothing', async () => {
      startSummaryScheduler();

      await vi.advanceTimersByTimeAsync(10 * MINUTE);

      expect(processBatch).toHaveBeenCalledTimes(1);
      expect(logLines()).toEqual([]);
    });

    it(`stops at ${MAX_BATCHES_PER_RUN} batches when every batch processes a document`, async () => {
      processBatch.mockResolvedValue(processed(31));
      startSummaryScheduler();

      await vi.advanceTimersByTimeAsync(10 * MINUTE);

      expect(MAX_BATCHES_PER_RUN).toBe(20);
      expect(processBatch).toHaveBeenCalledTimes(20);
      expect(logLines()).toEqual(['Summary autorun: 20 documents processed in 20 batches']);
    });

    it('logs one line with no message text when a run throws, and the next run still happens', async () => {
      processBatch.mockResolvedValueOnce(processed(31)).mockRejectedValueOnce(new Error(ERROR_MARKER));
      startSummaryScheduler();

      await vi.advanceTimersByTimeAsync(10 * MINUTE);

      expect(processBatch).toHaveBeenCalledTimes(2);
      expect(logLines()).toEqual(['Summary autorun: run failed after 1 batches, 1 documents processed']);
      expect(logLines().join('\n')).not.toContain('MARKER');

      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(3);
    });

    it('logs one line with no message text when a batch cannot read the attempts', async () => {
      processBatch.mockResolvedValueOnce({ kind: 'read_failed', message: ERROR_MARKER });
      startSummaryScheduler();

      await vi.advanceTimersByTimeAsync(10 * MINUTE);

      expect(processBatch).toHaveBeenCalledTimes(1);
      expect(logLines()).toEqual(['Summary autorun: run failed after 1 batches, 0 documents processed']);

      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(2);
    });

    it('names a missing setting once, then skips quietly', async () => {
      processBatch.mockResolvedValue({ kind: 'missing_settings', missing: ['SUMMARY_API_KEY'] });
      startSummaryScheduler();

      await vi.advanceTimersByTimeAsync(10 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(1);
      expect(logLines()).toEqual(['Summary autorun: skipped, missing SUMMARY_API_KEY']);

      await vi.advanceTimersByTimeAsync(20 * MINUTE);
      expect(processBatch).toHaveBeenCalledTimes(3);
      expect(logLines()).toHaveLength(1);
    });
  });

  describe('register()', () => {
    it('starts the scheduler in the nodejs runtime', async () => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
      vi.stubEnv('NEXT_PHASE', 'phase-production-server');

      await register();

      expect(vi.getTimerCount()).toBe(1);
    });

    it('does not start the scheduler in the edge runtime', async () => {
      vi.stubEnv('NEXT_RUNTIME', 'edge');
      vi.stubEnv('NEXT_PHASE', 'phase-production-server');

      await register();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not start the scheduler while the production build runs', async () => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
      vi.stubEnv('NEXT_PHASE', 'phase-production-build');

      await register();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
