-- =============================================================================
-- Test: match_meetings_for_user (SRS-401.1, Task 401.1-3; SRS-401.2, Task 401.2-2)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, replace PASTE-YOUR-USER-ID below with
-- the id of a registered account that has a user_accounts row (following any
-- town in the app creates it), then run the whole file.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted.
--   "ALL CHECKS PASSED ..." means the function matched every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, select count(*) from towns where name like 'Test Town%' returns 0.
--
-- Only meetings in the test towns are compared, so the account's real follows
-- do not change the result.
-- =============================================================================
DO $$
DECLARE
  v_user UUID := 'PASTE-YOUR-USER-ID';

  town_a INTEGER; town_b INTEGER; town_c INTEGER; town_d INTEGER;
  housing INTEGER; zoning INTEGER; transit INTEGER; parks INTEGER;
  m1 BIGINT; m2 BIGINT; m3 BIGINT; m4 BIGINT; m5 BIGINT;
  m6 BIGINT; m7 BIGINT; m8 BIGINT; m9 BIGINT;
  m10 BIGINT; m11 BIGINT; m12 BIGINT;

  test_towns INTEGER[];
  matched BIGINT[];
  n INTEGER;
  c RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_accounts WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'SETUP: no user_accounts row for %. Follow a town in the app first.', v_user;
  END IF;

  -- Towns: A and B followed, C not followed, D followed but removed.
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Town A', 'test-town-a', 'America/New_York') RETURNING town_id INTO town_a;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Town B', 'test-town-b', 'America/New_York') RETURNING town_id INTO town_b;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Town C', 'test-town-c', 'America/New_York') RETURNING town_id INTO town_c;
  INSERT INTO towns (name, source_account_id, meeting_time_zone, removed_at)
    VALUES ('Test Town D', 'test-town-d', 'America/New_York', now()) RETURNING town_id INTO town_d;
  test_towns := ARRAY[town_a, town_b, town_c, town_d];

  -- Topics: Housing and Zoning followed, Transit followed but removed, Parks not followed.
  INSERT INTO topics (name) VALUES ('Test Housing') RETURNING topic_id INTO housing;
  INSERT INTO topics (name) VALUES ('Test Zoning') RETURNING topic_id INTO zoning;
  INSERT INTO topics (name, removed_at) VALUES ('Test Transit', now()) RETURNING topic_id INTO transit;
  INSERT INTO topics (name) VALUES ('Test Parks') RETURNING topic_id INTO parks;

  INSERT INTO user_followed_towns (user_id, town_id)
    VALUES (v_user, town_a), (v_user, town_b), (v_user, town_d);
  INSERT INTO user_followed_topics (user_id, topic_id)
    VALUES (v_user, housing), (v_user, zoning), (v_user, transit);

  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-1') RETURNING meeting_id INTO m1;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_b, 'test-2') RETURNING meeting_id INTO m2;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_c, 'test-3') RETURNING meeting_id INTO m3;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-4') RETURNING meeting_id INTO m4;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-5') RETURNING meeting_id INTO m5;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-6') RETURNING meeting_id INTO m6;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_d, 'test-7') RETURNING meeting_id INTO m7;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-8') RETURNING meeting_id INTO m8;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-9') RETURNING meeting_id INTO m9;
  -- Town A meetings for the unfollow checks (SRS-401.2): P, Q, R.
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-10') RETURNING meeting_id INTO m10;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-11') RETURNING meeting_id INTO m11;
  INSERT INTO meetings (town_id, source_meeting_id) VALUES (town_a, 'test-12') RETURNING meeting_id INTO m12;

  INSERT INTO meeting_topics (meeting_id, topic_id, evidence_text) VALUES
    (m1, housing, 'Test agenda item about housing'),
    (m2, housing, 'Test agenda item about housing'),
    (m3, housing, 'Test agenda item about housing'),
    (m4, parks, 'Test agenda item about parks'),
    (m5, housing, 'Test agenda item about housing'),
    (m5, zoning, 'Test agenda item about zoning'),
    (m7, housing, 'Test agenda item about housing'),
    (m8, transit, 'Test agenda item about transit'),
    (m9, transit, 'Test agenda item about transit'),
    (m9, zoning, 'Test agenda item about zoning'),
    (m10, housing, 'Test agenda item about housing'),
    (m12, housing, 'Test agenda item about housing');

  SELECT coalesce(array_agg(meeting_id), '{}') INTO matched
  FROM match_meetings_for_user(v_user)
  WHERE town_id = ANY (test_towns);

  FOR c IN
    SELECT * FROM (VALUES
      ('Town A meeting tagged Housing is returned', m1, 1),
      ('Town B meeting tagged Housing is returned', m2, 1),
      ('Town C (not followed) meeting is excluded', m3, 0),
      ('Meeting tagged only with an unfollowed topic is excluded', m4, 0),
      ('Meeting with two followed topics is returned once', m5, 1),
      ('Meeting with no tags is excluded', m6, 0),
      ('Meeting in a removed town is excluded', m7, 0),
      ('Meeting whose only followed topic is removed is excluded', m8, 0),
      ('Meeting with a removed and an active followed topic is returned once', m9, 1)
    ) AS t (label, meeting, expected)
  LOOP
    SELECT count(*) INTO n FROM unnest(matched) AS id WHERE id = c.meeting;
    IF n <> c.expected THEN
      RAISE EXCEPTION 'CHECK FAILED: % (expected % row(s), got %)', c.label, c.expected, n;
    END IF;
  END LOOP;

  -- Follows towns but no topics: nothing in the test towns matches.
  DELETE FROM user_followed_topics WHERE user_id = v_user AND topic_id IN (housing, zoning, transit);
  SELECT count(*) INTO n FROM match_meetings_for_user(v_user) WHERE town_id = ANY (test_towns);
  IF n <> 0 THEN
    RAISE EXCEPTION 'CHECK FAILED: No followed topics returns nothing (expected 0 row(s), got %)', n;
  END IF;

  -- Follows topics but no towns: nothing in the test towns matches.
  INSERT INTO user_followed_topics (user_id, topic_id)
    VALUES (v_user, housing), (v_user, zoning), (v_user, transit);
  DELETE FROM user_followed_towns WHERE user_id = v_user AND town_id = ANY (test_towns);
  SELECT count(*) INTO n FROM match_meetings_for_user(v_user) WHERE town_id = ANY (test_towns);
  IF n <> 0 THEN
    RAISE EXCEPTION 'CHECK FAILED: No followed towns returns nothing (expected 0 row(s), got %)', n;
  END IF;

  -- Resident unfollows Town A (SRS-401.2). Direct follows are added only here,
  -- so the two "returns nothing" checks above still hold.
  --   P (m10): Town A, Housing, not followed directly -> returned, then gone
  --   Q (m11): Town A, no tags, followed directly      -> returned both times
  --   R (m12): Town A, Housing, followed directly      -> returned once both times
  INSERT INTO user_followed_towns (user_id, town_id) VALUES (v_user, town_a);
  INSERT INTO user_followed_meetings (user_id, meeting_id) VALUES (v_user, m11), (v_user, m12);

  SELECT coalesce(array_agg(meeting_id), '{}') INTO matched
  FROM match_meetings_for_user(v_user)
  WHERE town_id = ANY (test_towns);

  FOR c IN
    SELECT * FROM (VALUES
      ('Before unfollow: P (Town A, Housing) is returned', m10, 1),
      ('Before unfollow: Q (followed directly) is returned', m11, 1),
      ('Before unfollow: R (Housing and followed directly) is returned once', m12, 1)
    ) AS t (label, meeting, expected)
  LOOP
    SELECT count(*) INTO n FROM unnest(matched) AS id WHERE id = c.meeting;
    IF n <> c.expected THEN
      RAISE EXCEPTION 'CHECK FAILED: % (expected % row(s), got %)', c.label, c.expected, n;
    END IF;
  END LOOP;

  -- Saving town preferences without Town A deletes its follow row.
  DELETE FROM user_followed_towns WHERE user_id = v_user AND town_id = town_a;

  SELECT coalesce(array_agg(meeting_id), '{}') INTO matched
  FROM match_meetings_for_user(v_user)
  WHERE town_id = ANY (test_towns);

  FOR c IN
    SELECT * FROM (VALUES
      ('After unfollow: P no longer qualifies through town matching', m10, 0),
      ('After unfollow: Q stays because it is followed directly', m11, 1),
      ('After unfollow: R stays, returned once', m12, 1)
    ) AS t (label, meeting, expected)
  LOOP
    SELECT count(*) INTO n FROM unnest(matched) AS id WHERE id = c.meeting;
    IF n <> c.expected THEN
      RAISE EXCEPTION 'CHECK FAILED: % (expected % row(s), got %)', c.label, c.expected, n;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'ALL CHECKS PASSED (17 checks). This error rolls back the test data.';
END;
$$;
