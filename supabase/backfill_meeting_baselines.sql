-- =============================================================================
-- One-time backfill for SRS-404.7 (First baseline), EG
-- Task 404.7-1 (issue #188)
--
-- The meetings_first_baseline trigger (supabase/schema.sql) gives every meeting
-- saved after it exists a first comparison baseline. Meetings retrieved before
-- the trigger have none, so changes to them could never be detected. This
-- script gives each of those meetings a baseline holding its current values.
--
-- Run it in the Supabase SQL Editor once, AFTER the trigger is created.
-- Safe to run more than once: meetings that already have a baseline are
-- skipped, and no existing baseline is changed.
-- =============================================================================
insert into meeting_baselines (meeting_id, start_at, location, online_link, is_canceled)
select m.meeting_id, m.start_at, m.location, m.online_link, m.is_canceled
from meetings m
on conflict (meeting_id) do nothing;
