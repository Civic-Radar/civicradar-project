-- =============================================================================
-- Test: comparison baseline update (SRS-404.5, Task 404.5-2)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed. Each retrieval saves the meeting with the same upsert retrieval uses
-- (lib/retrieval/saveMeetings.ts), then ends a successful check of the town and
-- runs process_successful_check, as lib/retrieval/runTownRetrieval.ts does, so
-- this tests what a real successful check does.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted.
--   "ALL CHECKS PASSED ..." means the baseline update behaved in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, this returns 0:
--   select count(*) from towns where source_account_id in ('test-advance-town', 'test-advance-other');
-- =============================================================================
DO $$
DECLARE
  test_town INTEGER;
  other_town INTEGER;
  m BIGINT;
  m_other BIGINT;
  c BIGINT;
  doc_new BIGINT;
  doc_old BIGINT;
  doc_other BIGINT;
  b RECORD;
  u RECORD;
  n INTEGER;
BEGIN
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Advance Town', 'test-advance-town', 'America/New_York')
    RETURNING town_id INTO test_town;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Advance Other Town', 'test-advance-other', 'America/New_York')
    RETURNING town_id INTO other_town;

  -- First retrieval of each town: Tuesday 7 PM. The baselines come from
  -- meetings_first_baseline (SRS-404.7).
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-advance-1', 'Test Advance Council', '11/3/2026 7:00 PM', '2026-11-03 19:00:00-05',
            'Test Advance Hall, 1 Main St', 'https://example.org/test-advance-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link
    RETURNING meeting_id INTO m;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (other_town, 'test-advance-other-1', 'Test Other Council', '11/3/2026 7:00 PM', '2026-11-03 19:00:00-05',
            'Test Other Hall, 2 Main St', 'https://example.org/test-advance-other-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link
    RETURNING meeting_id INTO m_other;

  -- A document a successful check already included, with its own baseline time.
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256, baselined_at)
    VALUES (m, test_town, 'test-advance-old', 'Old Agenda', 'Agenda', 'https://example.org/test-advance-old',
            'test-advance/old.pdf', 'application/pdf', 1, repeat('a', 64), '2026-01-01 00:00:00+00')
    RETURNING document_id INTO doc_old;

  -- The next retrieval moves the meeting to Thursday and finds new material.
  -- The other town's meeting also moves, but that town has no successful check.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-advance-1', 'Test Advance Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            'Test Advance Hall, 1 Main St', 'https://example.org/test-advance-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (other_town, 'test-advance-other-1', 'Test Other Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            'Test Other Hall, 2 Main St', 'https://example.org/test-advance-other-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256)
    VALUES (m, test_town, 'test-advance-new', 'New Agenda', 'Agenda', 'https://example.org/test-advance-new',
            'test-advance/new.pdf', 'application/pdf', 1, repeat('b', 64))
    RETURNING document_id INTO doc_new;
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256)
    VALUES (m_other, other_town, 'test-advance-other', 'Other Agenda', 'Agenda', 'https://example.org/test-advance-other',
            'test-advance/other.pdf', 'application/pdf', 1, repeat('c', 64))
    RETURNING document_id INTO doc_other;
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title)
    VALUES (m, 'test-advance-item', 0, 'Test Advance Item');
  INSERT INTO meeting_recordings (meeting_id, recording_url)
    VALUES (m, 'https://example.org/test-advance-recording');

  INSERT INTO source_checks (town_id, ended_at, changes_found) VALUES (test_town, now(), true)
    RETURNING check_id INTO c;
  PERFORM process_successful_check(c);

  -- 1. Thursday is the meeting's baseline value (the acceptance criterion).
  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m;
  IF b.start_at IS DISTINCT FROM '2026-11-05 19:00:00-05'::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'CHECK FAILED: A successful check makes Thursday the baseline (got %)', b.start_at;
  END IF;

  -- 2. The rest of the baseline still matches the meeting.
  IF b.location IS DISTINCT FROM 'Test Advance Hall, 1 Main St'
     OR b.online_link IS DISTINCT FROM 'https://example.org/test-advance-live'
     OR b.is_canceled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'CHECK FAILED: The baseline keeps the unchanged values (got location %, online link %, canceled %)',
      b.location, b.online_link, b.is_canceled;
  END IF;

  -- 3. The next successful check compares against Thursday: the same values
  -- add no record.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-advance-1', 'Test Advance Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            'Test Advance Hall, 1 Main St', 'https://example.org/test-advance-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;
  INSERT INTO source_checks (town_id, ended_at, changes_found) VALUES (test_town, now(), false)
    RETURNING check_id INTO c;
  PERFORM process_successful_check(c);

  SELECT count(*) INTO n FROM meeting_updates WHERE meeting_id = m;
  IF n <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: The next check with Thursday records nothing new (expected 1 record, got %)', n;
  END IF;

  -- 4. A later move to Friday is recorded from Thursday, not from Tuesday.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-advance-1', 'Test Advance Council', '11/6/2026 7:00 PM', '2026-11-06 19:00:00-05',
            'Test Advance Hall, 1 Main St', 'https://example.org/test-advance-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;
  INSERT INTO source_checks (town_id, ended_at, changes_found) VALUES (test_town, now(), false)
    RETURNING check_id INTO c;
  PERFORM process_successful_check(c);

  SELECT * INTO u FROM meeting_updates WHERE meeting_id = m ORDER BY update_id DESC LIMIT 1;
  IF (SELECT count(*) FROM meeting_updates WHERE meeting_id = m) <> 2
     OR u.update_type IS DISTINCT FROM 'Start time changed'
     OR u.previous_value IS DISTINCT FROM '2026-11-06T00:00:00Z'
     OR u.new_value IS DISTINCT FROM '2026-11-07T00:00:00Z' THEN
    RAISE EXCEPTION 'CHECK FAILED: The move to Friday is compared with Thursday (got type %, previous %, new %)',
      u.update_type, u.previous_value, u.new_value;
  END IF;

  -- 5. Material saved since the last successful check is now in the baseline.
  IF (SELECT baselined_at FROM documents WHERE document_id = doc_new) IS NULL
     OR (SELECT baselined_at FROM agenda_items WHERE meeting_id = m AND source_item_id = 'test-advance-item') IS NULL
     OR (SELECT baselined_at FROM meeting_recordings WHERE meeting_id = m) IS NULL THEN
    RAISE EXCEPTION 'CHECK FAILED: The new document, agenda item, and recording are baselined';
  END IF;

  -- 6. A document already in a baseline keeps its baseline time.
  IF (SELECT baselined_at FROM documents WHERE document_id = doc_old) IS DISTINCT FROM '2026-01-01 00:00:00+00'::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'CHECK FAILED: An already baselined document keeps its time (got %)',
      (SELECT baselined_at FROM documents WHERE document_id = doc_old);
  END IF;

  -- 7. Another town's meeting and document are untouched by this town's checks.
  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m_other;
  IF b.start_at IS DISTINCT FROM '2026-11-03 19:00:00-05'::TIMESTAMPTZ
     OR EXISTS (SELECT 1 FROM meeting_updates WHERE meeting_id = m_other)
     OR (SELECT baselined_at FROM documents WHERE document_id = doc_other) IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK FAILED: Another town is untouched (baseline %, records %, document baselined %)',
      b.start_at, (SELECT count(*) FROM meeting_updates WHERE meeting_id = m_other),
      (SELECT baselined_at FROM documents WHERE document_id = doc_other);
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (7 checks). This error rolls back the test data.';
END;
$$;
