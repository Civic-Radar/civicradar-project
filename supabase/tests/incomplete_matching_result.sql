-- =============================================================================
-- Test: Incomplete matching result (SRS-401.11, Tasks 401.11-2 and 401.11-4)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed: the resident is a test login the script creates itself.
-- unsuccessful_check_towns and match_meetings_with_reasons are called for the
-- same resident, as app/api/matching-meetings/route.ts does. The route marks
-- the result Incomplete when the town list is not empty, which
-- __tests__/api/matching-meetings.test.ts covers.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted (the test login included).
--   "ALL CHECKS PASSED ..." means the result was right in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, these all return 0:
--   select count(*) from towns where source_account_id like 'test-incomplete-%';
--   select count(*) from topics where name = 'Test Incomplete Housing';
--   select count(*) from auth.users where email = 'test-incomplete@example.invalid';
-- =============================================================================
DO $$
DECLARE
  resident UUID := gen_random_uuid();
  salem INTEGER;
  brookline INTEGER;
  beverly INTEGER;  -- followed, never checked
  newton INTEGER;   -- not followed; one of its meetings is followed directly (#510)
  housing INTEGER;
  m_salem BIGINT;
  m_newton BIGINT;
  m_beverly BIGINT;
  c BIGINT;
  running_check BIGINT;
  failed JSONB;
  meetings JSONB;
  salem_meetings JSONB;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (resident, 'test-incomplete@example.invalid');
  INSERT INTO user_accounts (user_id, email) VALUES (resident, 'test-incomplete@example.invalid');

  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Incomplete Salem', 'test-incomplete-salem', 'America/New_York')
    RETURNING town_id INTO salem;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Incomplete Brookline', 'test-incomplete-brookline', 'America/New_York')
    RETURNING town_id INTO brookline;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Incomplete Beverly', 'test-incomplete-beverly', 'America/New_York')
    RETURNING town_id INTO beverly;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Incomplete Newton', 'test-incomplete-newton', 'America/New_York')
    RETURNING town_id INTO newton;
  INSERT INTO topics (name) VALUES ('Test Incomplete Housing') RETURNING topic_id INTO housing;

  -- The resident follows Salem, Brookline and Housing. A Salem meeting is
  -- tagged Housing, so it matches through the town and topic, not a direct follow.
  INSERT INTO user_followed_towns (user_id, town_id) VALUES (resident, salem), (resident, brookline);
  INSERT INTO user_followed_topics (user_id, topic_id) VALUES (resident, housing);
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at)
    VALUES (salem, 'test-incomplete-1', 'Salem City Council', '11/10/2026 7:00 PM', '2026-11-10 19:00:00-05')
    RETURNING meeting_id INTO m_salem;
  INSERT INTO meeting_topics (meeting_id, topic_id, evidence_text)
    VALUES (m_salem, housing, 'Item 4: affordable housing ordinance');

  -- Salem's most recent check succeeded: every collection Complete.
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (salem, now() - interval '2 hours', now() - interval '1 hour', true)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Complete');

  -- Brookline succeeded yesterday, then its most recent check failed: one
  -- Failed collection among Complete ones.
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (brookline, now() - interval '26 hours', now() - interval '25 hours', true)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Complete');
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (brookline, now() - interval '2 hours', now() - interval '1 hour', false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Failed');

  -- Salem's matching meeting, with why it matched, built the way
  -- match_meetings_with_reasons returns it.
  salem_meetings := jsonb_build_array(jsonb_build_object(
    'meeting_id', m_salem,
    'matched_topics', jsonb_build_array(jsonb_build_object(
      'topic', 'Test Incomplete Housing', 'evidence_text', 'Item 4: affordable housing ordinance'))));

  -- 1. The acceptance criterion: Brookline failed and Salem succeeded, so the
  -- result is Incomplete, lists Brookline only, and still has Salem's meeting.
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('meeting_id', x->'meeting_id', 'matched_topics', x->'matched_topics')), '[]'::jsonb)
    INTO meetings FROM match_meetings_with_reasons(resident) x;
  IF failed IS DISTINCT FROM jsonb_build_array(jsonb_build_object('town_id', brookline, 'name', 'Test Incomplete Brookline'))
     OR meetings IS DISTINCT FROM salem_meetings THEN
    RAISE EXCEPTION 'CHECK FAILED: Brookline failed and Salem succeeded gives Incomplete, Brookline listed, Salem''s meeting kept (towns %, meetings %)', failed, meetings;
  END IF;

  -- 2. A newer Brookline check that is still running does not hide the failure.
  INSERT INTO source_checks (town_id, started_at)
    VALUES (brookline, now() - interval '5 minutes')
    RETURNING check_id INTO running_check;
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  IF failed IS DISTINCT FROM jsonb_build_array(jsonb_build_object('town_id', brookline, 'name', 'Test Incomplete Brookline')) THEN
    RAISE EXCEPTION 'CHECK FAILED: A running check does not hide Brookline''s failed check (towns %)', failed;
  END IF;

  -- 3. Once that check ends successfully, it is Brookline's most recent check,
  -- so nothing is listed (Complete) and Salem's meeting is still there.
  UPDATE source_checks SET ended_at = now(), changes_found = false WHERE check_id = running_check;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (running_check, 'Meetings', 'Complete'), (running_check, 'Documents', 'Complete');
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('meeting_id', x->'meeting_id', 'matched_topics', x->'matched_topics')), '[]'::jsonb)
    INTO meetings FROM match_meetings_with_reasons(resident) x;
  IF failed IS DISTINCT FROM '[]'::jsonb OR meetings IS DISTINCT FROM salem_meetings THEN
    RAISE EXCEPTION 'CHECK FAILED: A newer successful Brookline check gives Complete (towns %, meetings %)', failed, meetings;
  END IF;

  -- 4. A followed town that has never been checked is listed: there is no
  -- successful check to show for it.
  INSERT INTO user_followed_towns (user_id, town_id) VALUES (resident, beverly);
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  IF failed IS DISTINCT FROM jsonb_build_array(jsonb_build_object('town_id', beverly, 'name', 'Test Incomplete Beverly')) THEN
    RAISE EXCEPTION 'CHECK FAILED: A followed town never checked is listed (towns %)', failed;
  END IF;

  -- 5. Issue #510: the resident follows a Newton meeting directly but not
  -- Newton. Newton's most recent check failed, so the meeting may be out of
  -- date (moved or canceled): Newton is listed and the result is Incomplete.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at)
    VALUES (newton, 'test-incomplete-2', 'Newton City Council', '11/12/2026 7:00 PM', '2026-11-12 19:00:00-05')
    RETURNING meeting_id INTO m_newton;
  INSERT INTO user_followed_meetings (user_id, meeting_id) VALUES (resident, m_newton);
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (newton, now() - interval '2 hours', now() - interval '1 hour', false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Failed'), (c, 'Documents', 'Complete');
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  IF failed IS DISTINCT FROM jsonb_build_array(
       jsonb_build_object('town_id', beverly, 'name', 'Test Incomplete Beverly'),
       jsonb_build_object('town_id', newton, 'name', 'Test Incomplete Newton')) THEN
    RAISE EXCEPTION 'CHECK FAILED: The town of a directly followed meeting whose check failed is listed (towns %)', failed;
  END IF;

  -- 6. A town that is both followed and the town of a directly followed
  -- meeting is listed once.
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at)
    VALUES (beverly, 'test-incomplete-3', 'Beverly City Council', '11/13/2026 7:00 PM', '2026-11-13 19:00:00-05')
    RETURNING meeting_id INTO m_beverly;
  INSERT INTO user_followed_meetings (user_id, meeting_id) VALUES (resident, m_beverly);
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  IF failed IS DISTINCT FROM jsonb_build_array(
       jsonb_build_object('town_id', beverly, 'name', 'Test Incomplete Beverly'),
       jsonb_build_object('town_id', newton, 'name', 'Test Incomplete Newton')) THEN
    RAISE EXCEPTION 'CHECK FAILED: A town that is followed and has a directly followed meeting is listed once (towns %)', failed;
  END IF;

  -- 7. Once Newton's newest check succeeds, Newton is no longer listed.
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (newton, now() - interval '10 minutes', now() - interval '5 minutes', false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Complete');
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  IF failed IS DISTINCT FROM jsonb_build_array(jsonb_build_object('town_id', beverly, 'name', 'Test Incomplete Beverly')) THEN
    RAISE EXCEPTION 'CHECK FAILED: A newer successful check in the directly followed meeting''s town removes it from the list (towns %)', failed;
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (7 checks). This error rolls back the test data.';
END;
$$;
