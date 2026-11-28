-- =============================================================================
-- Defect #498: meetings the source no longer lists
-- Owner: MS (Marcos Salazar).
--
-- Run in the Supabase SQL Editor BEFORE merging the #498 pull request.
-- Retrieval saves and reads this column, so the new code needs it to exist.
-- Safe to run again. Expected result: "Success. No rows returned."
--
-- unlisted_at is set when a successful check of the town (both listings read
-- in full) no longer lists a meeting that starts inside the retrieval window,
-- and cleared when a later listing includes the meeting again. While it is
-- set, the meeting details page shows "No longer listed on CivicClerk" in
-- place of a link to a CivicClerk page that no longer exists. A check that is
-- not successful never sets it (SRS-221.3), and the meeting row is kept.
-- =============================================================================

alter table public.meetings
  add column if not exists unlisted_at timestamptz;

comment on column public.meetings.unlisted_at is
  'Set when a successful check no longer lists the meeting; cleared when listed again (defect #498).';

-- Check (run separately): expect one row, unlisted_at | timestamp with time zone | YES
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'meetings' and column_name = 'unlisted_at';
