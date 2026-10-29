import {
  getProcessSecret,
  isValidProcessSecret,
  SUMMARY_PROCESS_SECRET_HEADER,
} from '../../../../lib/summaries/processSecret';
import { processPendingSummaries } from '../../../../lib/summaries/processPendingSummaries';

// Manual trigger for the processing the summary scheduler also runs
// (SRS-204.1). Protected by the x-summary-process-secret header.
export async function POST(request: Request) {
  if (!getProcessSecret()) {
    return Response.json({ error: 'Summary processing is not configured.' }, { status: 500 });
  }

  if (!isValidProcessSecret(request.headers.get(SUMMARY_PROCESS_SECRET_HEADER))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const result = await processPendingSummaries();

  if (result.kind === 'missing_settings') {
    return Response.json(
      { error: `Summary processing is not configured: missing ${result.missing.join(', ')}` },
      { status: 500 },
    );
  }

  if (result.kind === 'no_client') {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  if (result.kind === 'read_failed') {
    return Response.json({ error: result.message }, { status: 500 });
  }

  return Response.json({ processed: result.processed }, { status: 200 });
}
