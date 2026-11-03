-- =============================================================================
-- Test: agenda changes mark a meeting for tagging (SRS-401.4, Task 401.4-7)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed. Agenda items are saved with the same upsert retrieval uses
-- (lib/retrieval/saveAgendaItems.ts), and tagging saves with the same
-- function lib/meetingTagging.ts calls, so this tests what a real retrieval
-- followed by a tagging pass does. __tests__/lib/tagPendingMeetings.test.ts
-- covers which Pending meetings get tagged.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted.
--   "ALL CHECKS PASSED ..." means the trigger behaved in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, these both return 0:
--   select count(*) from towns where source_account_id = 'test-retag-town';
--   select count(*) from topics where name = 'Test Retag Housing';
-- =============================================================================
DO $$
DECLARE
  test_town INTEGER;
  housing INTEGER;
  m BIGINT;        -- the meeting whose agenda changes
  m_other BIGINT;  -- a meeting that is never touched
  m_later BIGINT;  -- no agenda yet, so Unavailable, until one is posted
  i1 BIGINT;
  i2 BIGINT;
  i_other BIGINT;
  saved BOOLEAN;
  status TEXT;
  n INTEGER;
BEGIN
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Retag Town', 'test-retag-town', 'America/New_York')
    RETURNING town_id INTO test_town;
  INSERT INTO topics (name) VALUES ('Test Retag Housing') RETURNING topic_id INTO housing;

  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-retag-1', 'Test Retag Council', '11/10/2026 7:00 PM') RETURNING meeting_id INTO m;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-retag-2', 'Test Retag Board', '11/11/2026 7:00 PM') RETURNING meeting_id INTO m_other;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-retag-3', 'Test Retag Hearing', '11/12/2026 7:00 PM') RETURNING meeting_id INTO m_later;

  -- First retrieval saves two items for m and one for m_other; tagging then
  -- marks both Classified.
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m, 'test-retag-a', 0, 'Item A', 'Housing update.'), (m, 'test-retag-b', 1, 'Item B', 'Minutes.')
    ON CONFLICT (meeting_id, source_item_id) DO UPDATE
      SET sort_order = excluded.sort_order, title = excluded.title, item_text = excluded.item_text;
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m_other, 'test-retag-c', 0, 'Item C', 'Housing update.')
    ON CONFLICT (meeting_id, source_item_id) DO UPDATE
      SET sort_order = excluded.sort_order, title = excluded.title, item_text = excluded.item_text;
  SELECT agenda_item_id INTO i1 FROM agenda_items WHERE meeting_id = m AND source_item_id = 'test-retag-a';
  SELECT agenda_item_id INTO i2 FROM agenda_items WHERE meeting_id = m AND source_item_id = 'test-retag-b';
  SELECT agenda_item_id INTO i_other FROM agenda_items WHERE meeting_id = m_other;

  saved := replace_meeting_topics(m,
    jsonb_build_array(jsonb_build_object('topic_id', housing, 'evidence_text', 'Housing update.')),
    jsonb_build_array(jsonb_build_object('agenda_item_id', i1, 'item_text', 'Housing update.'),
                      jsonb_build_object('agenda_item_id', i2, 'item_text', 'Minutes.')));
  saved := replace_meeting_topics(m_other,
    jsonb_build_array(jsonb_build_object('topic_id', housing, 'evidence_text', 'Housing update.')),
    jsonb_build_array(jsonb_build_object('agenda_item_id', i_other, 'item_text', 'Housing update.')));
  saved := mark_meeting_unavailable(m_later, '[]'::jsonb);

  -- 1. A repeat retrieval that saves the same agenda changes nothing: the
  -- meeting stays Classified, so it is not tagged again.
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m, 'test-retag-a', 0, 'Item A', 'Housing update.'), (m, 'test-retag-b', 1, 'Item B', 'Minutes.')
    ON CONFLICT (meeting_id, source_item_id) DO UPDATE
      SET sort_order = excluded.sort_order, title = excluded.title, item_text = excluded.item_text;
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m;
  IF status IS DISTINCT FROM 'Classified' THEN
    RAISE EXCEPTION 'CHECK FAILED: Saving the same agenda again keeps the meeting Classified (got %)', status;
  END IF;

  -- 2. A changed title is not agenda text, so it changes nothing either.
  UPDATE agenda_items SET title = 'Item A (renamed)' WHERE agenda_item_id = i1;
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m;
  IF status IS DISTINCT FROM 'Classified' THEN
    RAISE EXCEPTION 'CHECK FAILED: A changed item title keeps the meeting Classified (got %)', status;
  END IF;

  -- 3. Changed agenda text sets the meeting back to Pending. Its old tag stays
  -- until tagging replaces it, and the other meeting is not touched.
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m, 'test-retag-a', 0, 'Item A (renamed)', 'Housing update, second reading.')
    ON CONFLICT (meeting_id, source_item_id) DO UPDATE
      SET sort_order = excluded.sort_order, title = excluded.title, item_text = excluded.item_text;
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m;
  SELECT count(*) INTO n FROM meeting_topics WHERE meeting_id = m;
  IF status IS DISTINCT FROM 'Pending' OR n <> 1
     OR (SELECT topic_classification FROM meetings WHERE meeting_id = m_other) IS DISTINCT FROM 'Classified' THEN
    RAISE EXCEPTION 'CHECK FAILED: Changed agenda text sets only that meeting to Pending, keeping its tag (got %, tags %)', status, n;
  END IF;

  -- 4. Tagging the new agenda marks it Classified again.
  saved := replace_meeting_topics(m,
    jsonb_build_array(jsonb_build_object('topic_id', housing, 'evidence_text', 'Housing update, second reading.')),
    jsonb_build_array(jsonb_build_object('agenda_item_id', i1, 'item_text', 'Housing update, second reading.'),
                      jsonb_build_object('agenda_item_id', i2, 'item_text', 'Minutes.')));
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m;
  IF saved IS NOT TRUE OR status IS DISTINCT FROM 'Classified' THEN
    RAISE EXCEPTION 'CHECK FAILED: Tagging the changed agenda marks it Classified (saved %, got %)', saved, status;
  END IF;

  -- 5. A new agenda item, a reordered item, and a removed item each set the
  -- meeting back to Pending; it is tagged in between, as a scheduled check would.
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m, 'test-retag-d', 2, 'Item D', 'Zoning.')
    ON CONFLICT (meeting_id, source_item_id) DO UPDATE
      SET sort_order = excluded.sort_order, title = excluded.title, item_text = excluded.item_text;
  IF (SELECT topic_classification FROM meetings WHERE meeting_id = m) IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'CHECK FAILED: A new agenda item sets the meeting to Pending';
  END IF;
  UPDATE meetings SET topic_classification = 'Classified' WHERE meeting_id = m;
  UPDATE agenda_items SET sort_order = 5 WHERE agenda_item_id = i2;
  IF (SELECT topic_classification FROM meetings WHERE meeting_id = m) IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'CHECK FAILED: A reordered agenda item sets the meeting to Pending';
  END IF;
  UPDATE meetings SET topic_classification = 'Classified' WHERE meeting_id = m;
  UPDATE agenda_items SET removed_at = now() WHERE agenda_item_id = i2;
  IF (SELECT topic_classification FROM meetings WHERE meeting_id = m) IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'CHECK FAILED: A removed agenda item sets the meeting to Pending';
  END IF;

  -- 6. A deleted agenda item sets the meeting back to Pending.
  UPDATE meetings SET topic_classification = 'Classified' WHERE meeting_id = m;
  DELETE FROM agenda_items WHERE agenda_item_id = i2;
  IF (SELECT topic_classification FROM meetings WHERE meeting_id = m) IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'CHECK FAILED: A deleted agenda item sets the meeting to Pending';
  END IF;

  -- 7. A meeting that was Unavailable (no agenda yet) is set to Pending when
  -- its agenda is posted, so it gets tagged for real.
  IF (SELECT topic_classification FROM meetings WHERE meeting_id = m_later) IS DISTINCT FROM 'Unavailable' THEN
    RAISE EXCEPTION 'CHECK FAILED: Setup: the meeting with no agenda is Unavailable';
  END IF;
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m_later, 'test-retag-e', 0, 'Item E', 'Housing hearing.')
    ON CONFLICT (meeting_id, source_item_id) DO UPDATE
      SET sort_order = excluded.sort_order, title = excluded.title, item_text = excluded.item_text;
  IF (SELECT topic_classification FROM meetings WHERE meeting_id = m_later) IS DISTINCT FROM 'Pending'
     OR (SELECT topic_classification FROM meetings WHERE meeting_id = m_other) IS DISTINCT FROM 'Classified' THEN
    RAISE EXCEPTION 'CHECK FAILED: A posted agenda sets an Unavailable meeting to Pending, and no other meeting';
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (7 checks). This error rolls back the test data.';
END;
$$;
