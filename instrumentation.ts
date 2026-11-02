// Called once when the Next.js server starts. Starts the summary scheduler in
// the Node.js runtime only, and never while `next build` runs.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { startSummaryScheduler } = await import('./lib/summaries/scheduler');
    startSummaryScheduler();
  }
}
