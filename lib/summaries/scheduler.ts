import { processPendingSummaries } from './processPendingSummaries';

// The most processing batches one scheduled run starts.
export const MAX_BATCHES_PER_RUN = 20;

// setInterval treats a longer delay as 1 ms, so a larger setting is refused.
const MAX_INTERVAL_MS = 2_147_483_647;

const STATE_KEY = '__civicRadarSummaryScheduler';

interface SchedulerState {
  running: boolean;
  missingLogged: boolean;
}

type SchedulerGlobal = typeof globalThis & { [STATE_KEY]?: SchedulerState };

// SUMMARY_AUTORUN_MINUTES as a positive whole number of minutes, or null when
// it is missing, zero, negative, not a whole number or too large.
function readIntervalMs(): number | null {
  const raw = process.env.SUMMARY_AUTORUN_MINUTES?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const ms = Number(raw) * 60 * 1000;
  if (ms <= 0 || ms > MAX_INTERVAL_MS) {
    return null;
  }
  return ms;
}

// One scheduled run: processing batches until one processes nothing, a batch
// cannot run, or MAX_BATCHES_PER_RUN is reached. Never throws. Logs at most
// one line, with counts only (or the missing setting names, once).
async function runScheduledProcessing(state: SchedulerState): Promise<void> {
  if (state.running) {
    return;
  }
  state.running = true;

  let batches = 0;
  let processed = 0;
  try {
    while (batches < MAX_BATCHES_PER_RUN) {
      const result = await processPendingSummaries();
      batches += 1;

      if (result.kind === 'missing_settings') {
        if (!state.missingLogged) {
          state.missingLogged = true;
          console.error(`Summary autorun: skipped, missing ${result.missing.join(', ')}`);
        }
        return;
      }
      if (result.kind !== 'processed') {
        console.error(`Summary autorun: run failed after ${batches} batches, ${processed} documents processed`);
        return;
      }

      processed += result.processed.length;
      if (result.processed.length === 0) {
        break;
      }
    }

    if (processed > 0) {
      console.log(`Summary autorun: ${processed} documents processed in ${batches} batches`);
    }
  } catch {
    console.error(`Summary autorun: run failed after ${batches} batches, ${processed} documents processed`);
  } finally {
    state.running = false;
  }
}

// Processes pending summaries every SUMMARY_AUTORUN_MINUTES (SRS-204.1), with
// no user action. Off unless the setting is a positive whole number. Starts
// once per process; the first run is one full interval after the start.
export function startSummaryScheduler(): void {
  const scope = globalThis as SchedulerGlobal;
  if (scope[STATE_KEY]) {
    return;
  }

  const intervalMs = readIntervalMs();
  if (intervalMs === null) {
    return;
  }

  const state: SchedulerState = { running: false, missingLogged: false };
  scope[STATE_KEY] = state;

  const timer = setInterval(() => {
    void runScheduledProcessing(state);
  }, intervalMs);
  timer.unref?.();
}
