-- =============================================================================
-- Test: baseline kept on failed check (SRS-404.9, Task 404.9-2)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed. The meeting is saved with the same upsert retrieval uses
-- (lib/retrieval/saveMeetings.ts). Each check is a source_checks row, with its
-- source_check_collections rows written by hand, because nothing writes those
-- yet (SRS-222.2). Today retrieval never calls process_successful_check after a
-- failed run (__tests__/api/baseline-update.test.ts); this file tests the
-- function's own guard.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted.
--   "ALL CHECKS PASSED ..." means the baseline was kept in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, this returns 0:
--   select count(*) from towns where source_account_id = 'test-kept-town';
-- =============================================================================
DO $$
DECLARE
  test_town INTEGER;
  m BIGINT;
  c BIGINT;
  doc BIGINT;
  b RECORD;
  u RECORD;
  n INTEGER;
BEGIN
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Kept Town', 'test-kept-town', 'America/New_York')
    RETURNING town_id INTO test_town;

  -- First retrieval: Tuesday 7 PM. Its baseline comes from
  -- meetings_first_baseline (SRS-404.7).
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-kept-1', 'Test Kept Council', '11/3/2026 7:00 PM', '2026-11-03 19:00:00-05',
            'Test Kept Hall, 1 Main St', 'https://example.org/test-kept-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link
    RETURNING meeting_id INTO m;

  -- The next retrieval saves Thursday and a new document, then a collection fails.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-kept-1', 'Test Kept Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            'Test Kept Hall, 1 Main St', 'https://example.org/test-kept-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256)
    VALUES (m, test_town, 'test-kept-doc', 'Test Agenda', 'Agenda', 'https://example.org/test-kept-doc',
            'test-kept/agenda.pdf', 'application/pdf', 1, repeat('a', 64))
    RETURNING document_id INTO doc;

  INSERT INTO source_checks (town_id, ended_at, changes_found) VALUES (test_town, now(), false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result) VALUES (c, 'Documents', 'Failed');
  PERFORM process_successful_check(c);

  -- 1. The baseline stays Tuesday (the acceptance criterion).
  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m;
  IF b.start_at IS DISTINCT FROM '2026-11-03 19:00:00-05'::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'CHECK FAILED: A failed check keeps the Tuesday baseline (got %)', b.start_at;
  END IF;

  -- 2. The failed check leaves nothing behind.
  SELECT count(*) INTO n FROM meeting_updates WHERE meeting_id = m;
  IF n <> 0 OR (SELECT baselined_at FROM documents WHERE document_id = doc) IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK FAILED: A failed check adds no record and baselines no document (records %, document baselined %)',
      n, (SELECT baselined_at FROM documents WHERE document_id = doc);
  END IF;

  -- 3. What retrieval read is still saved; only the baseline waits.
  IF (SELECT start_at FROM meetings WHERE meeting_id = m) IS DISTINCT FROM '2026-11-05 19:00:00-05'::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'CHECK FAILED: The meeting keeps the Thursday value that was read (got %)',
      (SELECT start_at FROM meetings WHERE meeting_id = m);
  END IF;

  -- 4. One Failed collection among Complete ones still fails the whole check.
  INSERT INTO source_checks (town_id, ended_at, changes_found) VALUES (test_town, now(), false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Complete'), (c, 'Agenda items', 'Failed');
  PERFORM process_successful_check(c);

  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m;
  IF b.start_at IS DISTINCT FROM '2026-11-03 19:00:00-05'::TIMESTAMPTZ
     OR EXISTS (SELECT 1 FROM meeting_updates WHERE meeting_id = m) THEN
    RAISE EXCEPTION 'CHECK FAILED: One Failed collection among Complete ones keeps the baseline (got %)', b.start_at;
  END IF;

  -- 5. A check that is still running is not successful.
  INSERT INTO source_checks (town_id) VALUES (test_town)
    RETURNING check_id INTO c;
  PERFORM process_successful_check(c);

  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m;
  IF b.start_at IS DISTINCT FROM '2026-11-03 19:00:00-05'::TIMESTAMPTZ
     OR EXISTS (SELECT 1 FROM meeting_updates WHERE meeting_id = m) THEN
    RAISE EXCEPTION 'CHECK FAILED: A running check keeps the baseline (got %)', b.start_at;
  END IF;

  -- 6-7. The next successful check records the change once and moves the
  -- baseline, so a failed check delays the change without losing it. Its
  -- Unsupported collection is not a failure.
  INSERT INTO source_checks (town_id, ended_at, changes_found) VALUES (test_town, now(), false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Complete'), (c, 'Agenda items', 'Unsupported');
  PERFORM process_successful_check(c);

  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m;
  IF b.start_at IS DISTINCT FROM '2026-11-05 19:00:00-05'::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'CHECK FAILED: A check with an Unsupported collection is successful (baseline %)', b.start_at;
  END IF;

  SELECT count(*) INTO n FROM meeting_updates WHERE meeting_id = m;
  SELECT * INTO u FROM meeting_updates WHERE meeting_id = m;
  IF n <> 1
     OR u.update_type IS DISTINCT FROM 'Start time changed'
     OR u.previous_value IS DISTINCT FROM '2026-11-04T00:00:00Z'
     OR u.new_value IS DISTINCT FROM '2026-11-06T00:00:00Z'
     OR (SELECT baselined_at FROM documents WHERE document_id = doc) IS NULL THEN
    RAISE EXCEPTION 'CHECK FAILED: The next successful check records the change once (records %, previous %, new %, document baselined %)',
      n, u.previous_value, u.new_value, (SELECT baselined_at FROM documents WHERE document_id = doc);
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (7 checks). This error rolls back the test data.';
END;
$$;
