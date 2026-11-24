-- =============================================================================
-- Test: meeting material update (SRS-404.3, Task 404.3-5)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed. Material is saved the way retrieval saves it, then each check ends
-- and runs process_successful_check, as lib/retrieval/runTownRetrieval.ts does.
-- Check times are set explicitly, because now() is the same for the whole
-- transaction.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted.
--   "ALL CHECKS PASSED ..." means the update and alerts behaved in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, these both return 0:
--   select count(*) from towns where source_account_id like 'test-material-%';
--   select count(*) from auth.users where email like 'test-material-%@example.invalid';
-- =============================================================================
DO $$
DECLARE
  test_town INTEGER;
  other_town INTEGER;
  housing INTEGER;
  parks INTEGER;
  m BIGINT;          -- followed meeting, first retrieved by check 1
  m_late BIGINT;     -- first retrieved during check 2
  m_failed BIGINT;   -- first retrieved during a failed check
  c BIGINT;
  doc_new BIGINT;
  item_new BIGINT;
  rec_new BIGINT;
  alice UUID := gen_random_uuid();  -- follows the meeting directly
  bob UUID := gen_random_uuid();    -- follows the town and Housing (the meeting's tag)
  carol UUID := gen_random_uuid();  -- follows the town and Parks (not the meeting's tag)
  dave UUID := gen_random_uuid();   -- follows Housing but another town
  erin UUID := gen_random_uuid();   -- follows the meeting directly AND the town and Housing
  n INTEGER;
  r RECORD;
BEGIN
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Material Town', 'test-material-town', 'America/New_York') RETURNING town_id INTO test_town;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Material Other', 'test-material-other', 'America/New_York') RETURNING town_id INTO other_town;
  INSERT INTO topics (name) VALUES ('Test Material Housing') RETURNING topic_id INTO housing;
  INSERT INTO topics (name) VALUES ('Test Material Parks') RETURNING topic_id INTO parks;

  INSERT INTO auth.users (id, email) VALUES
    (alice, 'test-material-alice@example.invalid'), (bob, 'test-material-bob@example.invalid'),
    (carol, 'test-material-carol@example.invalid'), (dave, 'test-material-dave@example.invalid'),
    (erin, 'test-material-erin@example.invalid');
  INSERT INTO user_accounts (user_id, email) VALUES
    (alice, 'test-material-alice@example.invalid'), (bob, 'test-material-bob@example.invalid'),
    (carol, 'test-material-carol@example.invalid'), (dave, 'test-material-dave@example.invalid'),
    (erin, 'test-material-erin@example.invalid');

  -- Check 1 first retrieves the meeting with an agenda and an agenda item.
  INSERT INTO meetings (town_id, source_meeting_id, title, first_retrieved_at)
    VALUES (test_town, 'test-material-1', 'Test Material Council', '2026-11-01 10:00+00') RETURNING meeting_id INTO m;
  INSERT INTO meeting_topics (meeting_id, topic_id, evidence_text) VALUES (m, housing, 'Housing plan');
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256)
    VALUES (m, test_town, 'test-material-first', 'First Agenda', 'Agenda', 'https://example.org/test-material-first',
            'test-material/first.pdf', 'application/pdf', 1, repeat('a', 64));
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title)
    VALUES (m, 'test-material-first-item', 0, 'Item at first retrieval');

  INSERT INTO user_followed_meetings (user_id, meeting_id) VALUES (alice, m), (erin, m);
  INSERT INTO user_followed_towns (user_id, town_id) VALUES (bob, test_town), (carol, test_town), (erin, test_town), (dave, other_town);
  INSERT INTO user_followed_topics (user_id, topic_id) VALUES (bob, housing), (carol, parks), (dave, housing), (erin, housing);

  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (test_town, '2026-11-01 09:59+00', '2026-11-01 10:05+00', true) RETURNING check_id INTO c;
  PERFORM process_successful_check(c);

  -- 1. The first retrieval is quiet: no updates, no alerts (SRS-404.10).
  IF EXISTS (SELECT 1 FROM meeting_updates WHERE meeting_id = m) OR EXISTS (SELECT 1 FROM user_alerts WHERE meeting_id = m) THEN
    RAISE EXCEPTION 'CHECK FAILED: A meeting''s first retrieval records no update and no alert (got % updates)',
      (SELECT count(*) FROM meeting_updates WHERE meeting_id = m);
  END IF;

  -- Check 2 finds a new attachment, a new agenda item, and a recording on the
  -- meeting, plus a meeting it sees for the first time, with its own agenda.
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256)
    VALUES (m, test_town, 'test-material-new', 'Budget Attachment', 'Packet', 'https://example.org/test-material-new',
            'test-material/new.pdf', 'application/pdf', 1, repeat('b', 64)) RETURNING document_id INTO doc_new;
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title)
    VALUES (m, 'test-material-new-item', 1, 'New housing item') RETURNING agenda_item_id INTO item_new;
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, removed_at)
    VALUES (m, 'test-material-gone-item', 2, 'Item already removed', '2026-11-08 10:01+00');
  INSERT INTO meeting_recordings (meeting_id, recording_url)
    VALUES (m, 'https://example.org/test-material-recording') RETURNING recording_id INTO rec_new;
  INSERT INTO meetings (town_id, source_meeting_id, title, first_retrieved_at)
    VALUES (test_town, 'test-material-2', 'Test Material Board', '2026-11-08 10:00+00') RETURNING meeting_id INTO m_late;
  INSERT INTO meeting_topics (meeting_id, topic_id, evidence_text) VALUES (m_late, housing, 'Housing board');
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256)
    VALUES (m_late, test_town, 'test-material-late', 'Late Agenda', 'Agenda', 'https://example.org/test-material-late',
            'test-material/late.pdf', 'application/pdf', 1, repeat('c', 64));

  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (test_town, '2026-11-08 09:59+00', '2026-11-08 10:05+00', true) RETURNING check_id INTO c;
  PERFORM process_successful_check(c);

  -- 2. One update for each new piece of material, naming it (the acceptance criterion).
  SELECT count(*) INTO n FROM meeting_updates
    WHERE meeting_id = m AND (
      (update_type = 'Document published' AND document_id = doc_new AND new_value = 'Budget Attachment')
      OR (update_type = 'Agenda item added' AND agenda_item_id = item_new AND new_value = 'New housing item')
      OR (update_type = 'Recording published' AND recording_id = rec_new AND new_value = 'https://example.org/test-material-recording'));
  IF n <> 3 OR (SELECT count(*) FROM meeting_updates WHERE meeting_id = m) <> 3 THEN
    RAISE EXCEPTION 'CHECK FAILED: New attachment, agenda item, and recording each get one update (got % matching, % total)',
      n, (SELECT count(*) FROM meeting_updates WHERE meeting_id = m);
  END IF;

  -- 3. Each relevant resident gets one alert per update: Alice (follows the
  -- meeting), Bob (town + Housing), Erin (both ways, still once each).
  FOR r IN SELECT u.who, u.id FROM (VALUES ('Alice', alice), ('Bob', bob), ('Erin', erin)) AS u(who, id) LOOP
    SELECT count(*) INTO n FROM user_alerts WHERE user_id = r.id AND meeting_id = m;
    IF n <> 3 THEN
      RAISE EXCEPTION 'CHECK FAILED: % gets one alert for each of the 3 updates (got %)', r.who, n;
    END IF;
  END LOOP;

  -- 4. Residents the meeting isn't relevant to get nothing: Carol (a topic the
  -- meeting doesn't have) and Dave (Housing, but another town).
  IF EXISTS (SELECT 1 FROM user_alerts WHERE user_id IN (carol, dave)) THEN
    RAISE EXCEPTION 'CHECK FAILED: Carol and Dave get no alerts (got %)',
      (SELECT count(*) FROM user_alerts WHERE user_id IN (carol, dave));
  END IF;

  -- 5. A meeting first seen during this check stays quiet (SRS-404.10).
  IF EXISTS (SELECT 1 FROM meeting_updates WHERE meeting_id = m_late) THEN
    RAISE EXCEPTION 'CHECK FAILED: A meeting first retrieved in this check records nothing';
  END IF;

  -- 6. Running the next check with nothing new adds nothing.
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (test_town, '2026-11-15 09:59+00', '2026-11-15 10:05+00', false) RETURNING check_id INTO c;
  PERFORM process_successful_check(c);
  IF (SELECT count(*) FROM meeting_updates WHERE meeting_id IN (m, m_late)) <> 3
     OR (SELECT count(*) FROM user_alerts WHERE meeting_id IN (m, m_late)) <> 9 THEN
    RAISE EXCEPTION 'CHECK FAILED: A check with nothing new adds nothing (got % updates, % alerts)',
      (SELECT count(*) FROM meeting_updates WHERE meeting_id IN (m, m_late)),
      (SELECT count(*) FROM user_alerts WHERE meeting_id IN (m, m_late));
  END IF;

  -- 7. A meeting first retrieved during a failed check is still quiet at the
  -- next successful check, because no successful check covered it before.
  INSERT INTO meetings (town_id, source_meeting_id, title, first_retrieved_at)
    VALUES (test_town, 'test-material-3', 'Test Material Committee', '2026-11-20 10:00+00') RETURNING meeting_id INTO m_failed;
  INSERT INTO user_followed_meetings (user_id, meeting_id) VALUES (alice, m_failed);
  INSERT INTO documents (meeting_id, town_id, source_file_id, title, document_type, source_url, storage_path,
                         mime_type, file_size_bytes, file_sha256)
    VALUES (m_failed, test_town, 'test-material-failed', 'Committee Agenda', 'Agenda', 'https://example.org/test-material-failed',
            'test-material/failed.pdf', 'application/pdf', 1, repeat('d', 64));
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (test_town, '2026-11-20 09:59+00', '2026-11-20 10:05+00', false) RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result) VALUES (c, 'Documents', 'Failed');
  PERFORM process_successful_check(c);
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (test_town, '2026-11-22 09:59+00', '2026-11-22 10:05+00', true) RETURNING check_id INTO c;
  PERFORM process_successful_check(c);
  IF EXISTS (SELECT 1 FROM meeting_updates WHERE meeting_id = m_failed) THEN
    RAISE EXCEPTION 'CHECK FAILED: A meeting first retrieved during a failed check is quiet at the next success';
  END IF;

  -- 8. list_user_alerts returns Alice's alerts with the meeting and what is new.
  SELECT count(*) INTO n FROM list_user_alerts(alice)
    WHERE meeting_id = m AND meeting_title = 'Test Material Council' AND town = 'Test Material Town'
      AND meeting_time_zone = 'America/New_York';
  IF n <> 3 OR NOT EXISTS (SELECT 1 FROM list_user_alerts(alice) WHERE update_type = 'Document published' AND new_value = 'Budget Attachment')
     OR EXISTS (SELECT 1 FROM list_user_alerts(carol)) THEN
    RAISE EXCEPTION 'CHECK FAILED: list_user_alerts returns the resident''s own alerts with the meeting (got % for Alice)', n;
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (8 checks). This error rolls back the test data.';
END;
$$;
