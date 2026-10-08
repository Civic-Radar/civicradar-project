-- =============================================================================
-- Seed: Salem, MA in the towns table
-- Task 220.3-1 (issue #13), supports SRS-220.3
--
-- Adds Salem as a supported town with its CivicClerk source account and
-- meeting time zone. All optional source feature flags start FALSE until each
-- is verified (SRS-220.9, SRS-220.10, SRS-505.2).
--
-- Safe to run more than once: if a town with source_account_id 'salemma'
-- already exists, nothing is inserted.
-- =============================================================================

insert into towns (
  name,
  source_account_id,
  meeting_time_zone,
  provides_agenda_items,
  provides_recordings,
  publishes_vote_records
)
values (
  'Salem',
  'salemma',
  'America/New_York',
  false,
  false,
  false
)
on conflict (source_account_id) do nothing;
