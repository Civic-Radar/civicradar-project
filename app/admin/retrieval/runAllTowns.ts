import type { RetrievalTown } from './useRetrievalTowns';

export const ALL_TOWNS = 'all';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type TownRunResult = { town_id: number; name: string; failed: boolean; text: string };

// The towns a choice on the retrieval page covers: every supported town for
// All towns, the one chosen town otherwise, none for no choice.
export function townsToRun(towns: RetrievalTown[], choice: string): RetrievalTown[] {
  if (choice === ALL_TOWNS) return towns;
  return towns.filter((town) => String(town.town_id) === choice);
}

// One retrieval request for one town. Never retried: a run can take minutes.
async function runTown(town: RetrievalTown, fetchFn: FetchLike, token: string): Promise<TownRunResult> {
  const result = (failed: boolean, text: string) => ({ town_id: town.town_id, name: town.name, failed, text: `${town.name}: ${text}` });
  try {
    const res = await fetchFn('/api/retrieval/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ townId: town.town_id }),
    });
    if (!res.ok) return result(true, `failed (status ${res.status}).`);
    const data = await res.json().catch(() => ({}));
    const notComplete = data.complete === false ? ' Not every page was read.' : '';
    return result(false, `finished, ${data.saved ?? 0} meetings saved.${notComplete}`);
  } catch {
    return result(true, 'failed.');
  }
}

// Runs retrieval for each town in order, one request at a time, through the
// existing retrieval route. A failed town does not stop the next one.
export async function runAllTowns(
  towns: RetrievalTown[],
  fetchFn: FetchLike,
  token: string,
  onResult?: (result: TownRunResult) => void,
): Promise<TownRunResult[]> {
  const results: TownRunResult[] = [];
  for (const town of towns) {
    const result = await runTown(town, fetchFn, token);
    results.push(result);
    onResult?.(result);
  }
  return results;
}
