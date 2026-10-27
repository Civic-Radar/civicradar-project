-- =============================================================================
-- Test: meetings_first_baseline trigger (SRS-404.7, Task 404.7-2)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed. Meetings are saved with the same upsert retrieval uses
-- (lib/retrieval/saveMeetings.ts), so this tests what a real first retrieval does.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted and the temporary rule it adds.
--   "ALL CHECKS PASSED ..." means the trigger behaved in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, select count(*) from towns where source_account_id =
-- 'test-baseline-town' returns 0.
--
-- The failure check briefly adds a rule to meeting_baselines, which locks that
-- table until the script ends (well under a second). A retrieval saving meetings
-- at that moment waits; it does not fail.
-- =============================================================================
DO $$
DECLARE
  test_town INTEGER;
  m_first BIGINT; m_canceled BIGINT; m_empty BIGINT;
  b RECORD;
  n INTEGER;
  save_failed BOOLEAN;
BEGIN
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Baseline Town', 'test-baseline-town', 'America/New_York')
    RETURNING town_id INTO test_town;

  -- 1-2. First retrieval of a meeting: exactly one baseline, holding the
  -- meeting's current values (the acceptance criterion).
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-baseline-1', 'Test Council', '11/3/2026 7:00 PM', '2026-11-03 19:00:00-05',
            'Test Baseline Hall, 1 Main St', 'https://example.org/test-baseline-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link
    RETURNING meeting_id INTO m_first;

  SELECT count(*) INTO n FROM meeting_baselines WHERE meeting_id = m_first;
  IF n <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: First retrieval creates one baseline (expected 1 row, got %)', n;
  END IF;

  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m_first;
  IF b.start_at IS DISTINCT FROM '2026-11-03 19:00:00-05'::TIMESTAMPTZ
     OR b.location IS DISTINCT FROM 'Test Baseline Hall, 1 Main St'
     OR b.online_link IS DISTINCT FROM 'https://example.org/test-baseline-live'
     OR b.is_canceled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CHECK FAILED: Baseline holds the meeting''s current values (got start %, location %, link %, canceled %)',
      b.start_at, b.location, b.online_link, b.is_canceled;
  END IF;

  -- 3. A meeting first retrieved as canceled keeps canceled in its baseline.
  INSERT INTO meetings (town_id, source_meeting_id, title, is_canceled)
    VALUES (test_town, 'test-baseline-2', 'Test Canceled Hearing', true)
    RETURNING meeting_id INTO m_canceled;

  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m_canceled;
  IF b.is_canceled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CHECK FAILED: A canceled meeting''s baseline is canceled (got %)', b.is_canceled;
  END IF;

  -- 4. Values the source did not provide stay NULL, not empty text.
  INSERT INTO meetings (town_id, source_meeting_id, title)
    VALUES (test_town, 'test-baseline-3', 'Test Meeting Without Details')
    RETURNING meeting_id INTO m_empty;

  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m_empty;
  IF NOT FOUND OR b.start_at IS NOT NULL OR b.location IS NOT NULL OR b.online_link IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK FAILED: Missing values stay NULL in the baseline (got start %, location %, link %)',
      b.start_at, b.location, b.online_link;
  END IF;

  -- 5. The next retrieval moves meeting 1 from Tuesday to Thursday and changes
  -- its place. The meeting is updated; its baseline keeps the first values,
  -- because refreshing baselines is SRS-404.5's job.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-baseline-1', 'Test Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            'Test Baseline Annex', 'https://example.org/test-baseline-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;

  SELECT count(*) INTO n FROM meetings WHERE meeting_id = m_first AND location = 'Test Baseline Annex';
  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m_first;
  IF n <> 1
     OR (SELECT count(*) FROM meeting_baselines WHERE meeting_id = m_first) <> 1
     OR b.start_at IS DISTINCT FROM '2026-11-03 19:00:00-05'::TIMESTAMPTZ
     OR b.location IS DISTINCT FROM 'Test Baseline Hall, 1 Main St' THEN
    RAISE EXCEPTION 'CHECK FAILED: A repeat retrieval leaves the first baseline alone (meeting updated: %, baseline start %, location %)',
      n = 1, b.start_at, b.location;
  END IF;

  -- 6. If the baseline cannot be saved, the meeting is not saved either, so a
  -- meeting never exists without a baseline. A temporary rule rejects this one
  -- baseline; the final error removes the rule again.
  ALTER TABLE meeting_baselines
    ADD CONSTRAINT test_reject_baseline CHECK (location IS DISTINCT FROM 'Test Baseline: reject me');
  BEGIN
    INSERT INTO meetings (town_id, source_meeting_id, title, location)
      VALUES (test_town, 'test-baseline-4', 'Test Rejected Meeting', 'Test Baseline: reject me');
    save_failed := false;
  EXCEPTION WHEN check_violation THEN
    save_failed := true;
  END;

  SELECT count(*) INTO n FROM meetings WHERE town_id = test_town AND source_meeting_id = 'test-baseline-4';
  IF NOT save_failed OR n <> 0 THEN
    RAISE EXCEPTION 'CHECK FAILED: A failed baseline also stops the meeting save (save failed: %, meeting rows: %)',
      save_failed, n;
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (6 checks). This error rolls back the test data.';
END;
$$;
