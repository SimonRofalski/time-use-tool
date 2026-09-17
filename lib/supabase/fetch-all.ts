// ─── Pagination helper (browser + server) ─────────────────────────────────────
// PostgREST caps every response at `max-rows` (1000 by default on Supabase),
// regardless of `.limit()`. A fully tracked day has 144 entries, so a single
// participant exceeds the cap after 7 days and a course pool after a few —
// every query over time_entry (and, for big courses, day) must page explicitly.
//
// `page(from, to)` must build a fresh query each call and should include a
// deterministic `.order(...)` so pages don't overlap.

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}
