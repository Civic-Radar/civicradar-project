-- =============================================================================
-- Test: meetings_record_changes trigger (SRS-404.6, Task 404.6-2)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed: the ten residents are test logins the script creates itself.
-- Meetings are saved with the same upsert retrieval uses
-- (lib/retrieval/saveMeetings.ts), so this tests what a real repeat retrieval does.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted (test logins included) and the temporary rule it adds.
--   "ALL CHECKS PASSED ..." means the trigger behaved in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, both of these return 0:
--   select count(*) from towns where source_account_id = 'test-updates-town';
--   select count(*) from auth.users where email like 'test-update-%@example.invalid';
--
-- The failure check briefly adds a rule to meeting_updates, which locks that
-- table until the script ends (well under a second). A retrieval saving meetings
-- at that moment waits; it does not fail.
-- =============================================================================
DO $$
DECLARE
  test_town INTEGER;
  m BIGINT;
  residents UUID[] := '{}';
  resident UUID;
  u RECORD;
  b RECORD;
  n INTEGER;
  save_failed BOOLEAN;
BEGIN
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Updates Town', 'test-updates-town', 'America/New_York')
    RETURNING town_id INTO test_town;

  -- First retrieval: Tuesday 7 PM, no location yet. Its baseline is created by
  -- meetings_first_baseline (SRS-404.7).
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-updates-1', 'Test Updates Council', '11/3/2026 7:00 PM', '2026-11-03 19:00:00-05',
            NULL, 'https://example.org/test-updates-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link
    RETURNING meeting_id INTO m;

  -- Ten residents follow the meeting directly.
  FOR i IN 1..10 LOOP
    resident := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (resident, 'test-update-' || i || '@example.invalid');
    INSERT INTO user_accounts (user_id, email) VALUES (resident, 'test-update-' || i || '@example.invalid');
    INSERT INTO user_followed_meetings (user_id, meeting_id) VALUES (resident, m);
    residents := residents || resident;
  END LOOP;

  -- 1. The meeting is relevant to all ten under the app's matching rule.
  SELECT count(*) INTO n FROM unnest(residents) AS r(user_id)
    WHERE EXISTS (SELECT 1 FROM match_meetings_for_user(r.user_id) mm WHERE mm.meeting_id = m);
  IF n <> 10 THEN
    RAISE EXCEPTION 'CHECK FAILED: The meeting is relevant to ten residents (got %)', n;
  END IF;

  -- The next retrieval moves the meeting from Tuesday to Thursday.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-updates-1', 'Test Updates Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            NULL, 'https://example.org/test-updates-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;

  -- 2-3. Exactly one update record for that change (the acceptance criterion),
  -- holding the meeting, changed item, detection time, type, and both values.
  SELECT count(*) INTO n FROM meeting_updates WHERE meeting_id = m;
  IF n <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: One schedule change affecting ten residents gives one update record (got %)', n;
  END IF;

  SELECT * INTO u FROM meeting_updates WHERE meeting_id = m;
  IF u.update_type IS DISTINCT FROM 'Start time changed'
     OR u.detected_at IS NULL
     OR u.previous_value IS DISTINCT FROM '2026-11-04T00:00:00Z'
     OR u.new_value IS DISTINCT FROM '2026-11-06T00:00:00Z'
     OR u.document_id IS NOT NULL OR u.agenda_item_id IS NOT NULL OR u.recording_id IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK FAILED: The update record holds the change (got type %, detected %, previous %, new %, document %, agenda item %, recording %)',
      u.update_type, u.detected_at, u.previous_value, u.new_value, u.document_id, u.agenda_item_id, u.recording_id;
  END IF;

  -- 4. The baseline now holds Thursday, so the change is not recorded again.
  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m;
  IF b.start_at IS DISTINCT FROM '2026-11-05 19:00:00-05'::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'CHECK FAILED: The baseline holds the new start time (got %)', b.start_at;
  END IF;

  -- 5. Another retrieval with the same values adds no record.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-updates-1', 'Test Updates Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            NULL, 'https://example.org/test-updates-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;

  SELECT count(*) INTO n FROM meeting_updates WHERE meeting_id = m;
  IF n <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: A repeat retrieval records nothing new (expected 1 record, got %)', n;
  END IF;

  -- 6. A location that was missing and now is provided counts as a change.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-updates-1', 'Test Updates Council', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            'Test Updates Hall, 1 Main St', 'https://example.org/test-updates-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;

  SELECT count(*) INTO n FROM meeting_updates
    WHERE meeting_id = m AND update_type = 'Location changed'
      AND previous_value IS NULL AND new_value = 'Test Updates Hall, 1 Main St';
  IF n <> 1 OR (SELECT count(*) FROM meeting_updates WHERE meeting_id = m) <> 2 THEN
    RAISE EXCEPTION 'CHECK FAILED: A missing location that is now provided is recorded (matching records: %)', n;
  END IF;

  -- 7. A change to a detail that is not monitored (the title) adds no record.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
    VALUES (test_town, 'test-updates-1', 'Test Updates Council (Renamed)', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
            'Test Updates Hall, 1 Main St', 'https://example.org/test-updates-live')
    ON CONFLICT (town_id, source_meeting_id) DO UPDATE
      SET title = excluded.title, source_start_time = excluded.source_start_time,
          start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;

  SELECT count(*) INTO n FROM meeting_updates WHERE meeting_id = m;
  IF n <> 2 THEN
    RAISE EXCEPTION 'CHECK FAILED: A title change records nothing (expected 2 records, got %)', n;
  END IF;

  -- 8. If the record cannot be saved, the meeting change is not saved either,
  -- so a change is never lost. A temporary rule rejects this one record; the
  -- final error removes the rule again.
  ALTER TABLE meeting_updates
    ADD CONSTRAINT test_reject_update CHECK (new_value IS DISTINCT FROM 'Test Updates Annex: reject me');
  BEGIN
    INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at, location, online_link)
      VALUES (test_town, 'test-updates-1', 'Test Updates Council (Renamed)', '11/5/2026 7:00 PM', '2026-11-05 19:00:00-05',
              'Test Updates Annex: reject me', 'https://example.org/test-updates-live')
      ON CONFLICT (town_id, source_meeting_id) DO UPDATE
        SET title = excluded.title, source_start_time = excluded.source_start_time,
            start_at = excluded.start_at, location = excluded.location, online_link = excluded.online_link;
    save_failed := false;
  EXCEPTION WHEN check_violation THEN
    save_failed := true;
  END;

  SELECT * INTO b FROM meeting_baselines WHERE meeting_id = m;
  SELECT count(*) INTO n FROM meetings WHERE meeting_id = m AND location = 'Test Updates Hall, 1 Main St';
  IF NOT save_failed OR n <> 1
     OR b.location IS DISTINCT FROM 'Test Updates Hall, 1 Main St'
     OR (SELECT count(*) FROM meeting_updates WHERE meeting_id = m) <> 2 THEN
    RAISE EXCEPTION 'CHECK FAILED: A failed record also stops the meeting change (save failed: %, meeting kept old location: %, baseline location %)',
      save_failed, n = 1, b.location;
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (8 checks). This error rolls back the test data.';
END;
$$;
