-- =============================================================================
-- Test: Unavailable classification (SRS-401.10, Task 401.10-2)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed. mark_meeting_unavailable and replace_meeting_topics are called with
-- the same arguments lib/meetingTagging.ts sends, so this tests what a real
-- tagging run saves. __tests__/api/topic-tagging.roundtrip.test.ts covers the
-- route and the choice of which function to call.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted.
--   "ALL CHECKS PASSED ..." means the classification was right in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, these both return 0:
--   select count(*) from towns where source_account_id = 'test-unavailable-town';
--   select count(*) from topics where name = 'Test Unavailable Topic';
-- =============================================================================
DO $$
DECLARE
  test_town INTEGER;
  test_topic INTEGER;
  m_empty BIGINT;    -- generic title, no agenda items
  m_blank BIGINT;    -- agenda items with no usable text
  m_nomatch BIGINT;  -- agenda text that matches no topic
  m_tagged BIGINT;   -- tagged, then its agenda text goes away
  m_other BIGINT;    -- tagged, and stays tagged
  i_blank_1 BIGINT;
  i_blank_2 BIGINT;
  i_nomatch BIGINT;
  i_tagged BIGINT;
  i_other BIGINT;
  saved BOOLEAN;
  status TEXT;
  n INTEGER;
BEGIN
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Unavailable Town', 'test-unavailable-town', 'America/New_York')
    RETURNING town_id INTO test_town;
  INSERT INTO topics (name) VALUES ('Test Unavailable Topic') RETURNING topic_id INTO test_topic;

  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-unavailable-1', 'City Council Meeting', '11/3/2026 7:00 PM')
    RETURNING meeting_id INTO m_empty;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-unavailable-2', 'City Council Meeting', '11/4/2026 7:00 PM')
    RETURNING meeting_id INTO m_blank;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-unavailable-3', 'City Council Meeting', '11/5/2026 7:00 PM')
    RETURNING meeting_id INTO m_nomatch;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-unavailable-4', 'City Council Meeting', '11/6/2026 7:00 PM')
    RETURNING meeting_id INTO m_tagged;
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time)
    VALUES (test_town, 'test-unavailable-5', 'City Council Meeting', '11/7/2026 7:00 PM')
    RETURNING meeting_id INTO m_other;

  -- 1. A generic title and no agenda text gives Unavailable (the acceptance
  -- criterion). Tagging sends the agenda it read, which is an empty list.
  saved := mark_meeting_unavailable(m_empty, '[]'::jsonb);
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m_empty;
  IF saved IS NOT TRUE OR status IS DISTINCT FROM 'Unavailable' THEN
    RAISE EXCEPTION 'CHECK FAILED: A generic title with no agenda text is Unavailable (saved %, classification %)', saved, status;
  END IF;

  -- 2. That is not a confirmed non-match: text that matches no topic is Classified.
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m_nomatch, 'test-unavailable-item-3', 0, 'Minutes', 'Approval of the minutes.')
    RETURNING agenda_item_id INTO i_nomatch;
  saved := replace_meeting_topics(m_nomatch, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('agenda_item_id', i_nomatch, 'item_text', 'Approval of the minutes.')));
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m_nomatch;
  IF saved IS NOT TRUE OR status IS DISTINCT FROM 'Classified' THEN
    RAISE EXCEPTION 'CHECK FAILED: Text that matches no topic is a confirmed non-match (saved %, classification %)', saved, status;
  END IF;

  -- 3. Agenda items with no usable text are also Unavailable.
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m_blank, 'test-unavailable-item-1', 0, 'Item One', NULL)
    RETURNING agenda_item_id INTO i_blank_1;
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m_blank, 'test-unavailable-item-2', 1, 'Item Two', '   ')
    RETURNING agenda_item_id INTO i_blank_2;
  saved := mark_meeting_unavailable(m_blank, jsonb_build_array(
    jsonb_build_object('agenda_item_id', i_blank_1, 'item_text', NULL),
    jsonb_build_object('agenda_item_id', i_blank_2, 'item_text', '   ')));
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m_blank;
  IF saved IS NOT TRUE OR status IS DISTINCT FROM 'Unavailable' THEN
    RAISE EXCEPTION 'CHECK FAILED: Blank agenda text is Unavailable (saved %, classification %)', saved, status;
  END IF;

  -- Two tagged meetings, for the next checks.
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m_tagged, 'test-unavailable-item-4', 0, 'Housing', 'Housing update.')
    RETURNING agenda_item_id INTO i_tagged;
  INSERT INTO agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
    VALUES (m_other, 'test-unavailable-item-5', 0, 'Housing', 'Housing update.')
    RETURNING agenda_item_id INTO i_other;
  saved := replace_meeting_topics(m_tagged,
    jsonb_build_array(jsonb_build_object('topic_id', test_topic, 'evidence_text', 'Housing update.')),
    jsonb_build_array(jsonb_build_object('agenda_item_id', i_tagged, 'item_text', 'Housing update.')));
  saved := replace_meeting_topics(m_other,
    jsonb_build_array(jsonb_build_object('topic_id', test_topic, 'evidence_text', 'Housing update.')),
    jsonb_build_array(jsonb_build_object('agenda_item_id', i_other, 'item_text', 'Housing update.')));

  -- 4. A run that read old text saves nothing: the agenda still has text, so
  -- the tag and the classification stay.
  saved := mark_meeting_unavailable(m_tagged,
    jsonb_build_array(jsonb_build_object('agenda_item_id', i_tagged, 'item_text', NULL)));
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m_tagged;
  SELECT count(*) INTO n FROM meeting_topics WHERE meeting_id = m_tagged;
  IF saved IS NOT FALSE OR status IS DISTINCT FROM 'Classified' OR n <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: A run that read an old agenda saves nothing (saved %, classification %, tags %)', saved, status, n;
  END IF;

  -- 5. When the agenda text goes away, the tag goes with it; another meeting's
  -- tag stays.
  UPDATE agenda_items SET item_text = NULL WHERE agenda_item_id = i_tagged;
  saved := mark_meeting_unavailable(m_tagged,
    jsonb_build_array(jsonb_build_object('agenda_item_id', i_tagged, 'item_text', NULL)));
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m_tagged;
  SELECT count(*) INTO n FROM meeting_topics WHERE meeting_id = m_tagged;
  IF saved IS NOT TRUE OR status IS DISTINCT FROM 'Unavailable' OR n <> 0
     OR (SELECT count(*) FROM meeting_topics WHERE meeting_id = m_other) <> 1
     OR (SELECT topic_classification FROM meetings WHERE meeting_id = m_other) IS DISTINCT FROM 'Classified' THEN
    RAISE EXCEPTION 'CHECK FAILED: Lost agenda text removes the tag, and only that meeting''s (saved %, classification %, tags %)', saved, status, n;
  END IF;

  -- 6. Unavailable is not final: agenda text arriving later gives Classified.
  UPDATE agenda_items SET item_text = 'Housing update again.' WHERE agenda_item_id = i_tagged;
  saved := replace_meeting_topics(m_tagged,
    jsonb_build_array(jsonb_build_object('topic_id', test_topic, 'evidence_text', 'Housing update again.')),
    jsonb_build_array(jsonb_build_object('agenda_item_id', i_tagged, 'item_text', 'Housing update again.')));
  SELECT topic_classification INTO status FROM meetings WHERE meeting_id = m_tagged;
  SELECT count(*) INTO n FROM meeting_topics WHERE meeting_id = m_tagged;
  IF saved IS NOT TRUE OR status IS DISTINCT FROM 'Classified' OR n <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: Agenda text arriving later gives Classified (saved %, classification %, tags %)', saved, status, n;
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (6 checks). This error rolls back the test data.';
END;
$$;
