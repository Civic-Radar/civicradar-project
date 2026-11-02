-- =============================================================================
-- Test: Complete empty result (SRS-401.3, Task 401.3-2)
-- Reviewed by: EG (Erick Gonzalez)
--
-- How to run: in the Supabase SQL editor, run the whole file. No account is
-- needed: the residents are test logins the script creates itself.
-- unsuccessful_check_towns and match_meetings_with_reasons are called for the
-- same resident, as app/api/matching-meetings/route.ts does. The route marks
-- the result Complete when the town list is empty and Incomplete otherwise,
-- which __tests__/api/matching-meetings.test.ts covers.
--
-- Result: the script always ends with an error, which makes Postgres undo every
-- row it inserted (the test logins included).
--   "ALL CHECKS PASSED ..." means the result was right in every case.
--   "CHECK FAILED: ..."     names the case that went wrong.
-- Afterwards, these all return 0:
--   select count(*) from towns where source_account_id like 'test-empty-%';
--   select count(*) from topics where name like 'Test Empty %';
--   select count(*) from auth.users where email like 'test-empty-%@example.invalid';
-- =============================================================================
DO $$
DECLARE
  resident UUID := gen_random_uuid();
  newcomer UUID := gen_random_uuid();  -- follows no towns
  salem INTEGER;
  brookline INTEGER;
  housing INTEGER;
  parking INTEGER;
  m_salem BIGINT;
  c BIGINT;
  failed JSONB;
  meetings JSONB;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (resident, 'test-empty-resident@example.invalid'),
    (newcomer, 'test-empty-newcomer@example.invalid');
  INSERT INTO user_accounts (user_id, email) VALUES
    (resident, 'test-empty-resident@example.invalid'),
    (newcomer, 'test-empty-newcomer@example.invalid');

  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Empty Salem', 'test-empty-salem', 'America/New_York')
    RETURNING town_id INTO salem;
  INSERT INTO towns (name, source_account_id, meeting_time_zone)
    VALUES ('Test Empty Brookline', 'test-empty-brookline', 'America/New_York')
    RETURNING town_id INTO brookline;
  INSERT INTO topics (name) VALUES ('Test Empty Housing') RETURNING topic_id INTO housing;
  INSERT INTO topics (name) VALUES ('Test Empty Parking') RETURNING topic_id INTO parking;

  -- The resident follows Salem, Brookline and Housing. Salem has a meeting,
  -- but it is tagged Parking, which the resident does not follow, so nothing
  -- matches even though the town has meetings.
  INSERT INTO user_followed_towns (user_id, town_id) VALUES (resident, salem), (resident, brookline);
  INSERT INTO user_followed_topics (user_id, topic_id) VALUES (resident, housing);
  INSERT INTO meetings (town_id, source_meeting_id, title, source_start_time, start_at)
    VALUES (salem, 'test-empty-1', 'Salem Traffic and Parking', '11/12/2026 6:00 PM', '2026-11-12 18:00:00-05')
    RETURNING meeting_id INTO m_salem;
  INSERT INTO meeting_topics (meeting_id, topic_id, evidence_text)
    VALUES (m_salem, parking, 'Item 2: residential parking permits');

  -- Both towns' most recent checks succeeded. Salem's has an Unsupported
  -- collection, which is not a failure.
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (salem, now() - interval '2 hours', now() - interval '1 hour', false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Complete'), (c, 'Recordings', 'Unsupported');
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (brookline, now() - interval '2 hours', now() - interval '1 hour', false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Complete'), (c, 'Documents', 'Complete');

  -- 1. The acceptance criterion: every required check was successful and no
  -- meeting matches, so no town is listed (Complete) and there are zero meetings.
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  SELECT coalesce(jsonb_agg(x->'meeting_id'), '[]'::jsonb) INTO meetings FROM match_meetings_with_reasons(resident) x;
  IF failed IS DISTINCT FROM '[]'::jsonb OR meetings IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'CHECK FAILED: Every check successful and nothing matches gives Complete with zero meetings (towns %, meetings %)', failed, meetings;
  END IF;

  -- 2. An empty result stays distinct from a failed check: Brookline's newest
  -- check fails, meetings are still zero, and Brookline is now listed (Incomplete).
  INSERT INTO source_checks (town_id, started_at, ended_at, changes_found)
    VALUES (brookline, now() - interval '30 minutes', now() - interval '10 minutes', false)
    RETURNING check_id INTO c;
  INSERT INTO source_check_collections (check_id, collection, result)
    VALUES (c, 'Meetings', 'Failed');
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(resident) t;
  SELECT coalesce(jsonb_agg(x->'meeting_id'), '[]'::jsonb) INTO meetings FROM match_meetings_with_reasons(resident) x;
  IF failed IS DISTINCT FROM jsonb_build_array(jsonb_build_object('town_id', brookline, 'name', 'Test Empty Brookline'))
     OR meetings IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'CHECK FAILED: Zero meetings with a failed check is Incomplete, not Complete (towns %, meetings %)', failed, meetings;
  END IF;

  -- 3. A resident who follows no towns has no required checks, so the result
  -- is Complete with zero meetings. The dashboard's setup message (SRS-401.8)
  -- is what tells them to pick towns.
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO failed FROM unsuccessful_check_towns(newcomer) t;
  SELECT coalesce(jsonb_agg(x->'meeting_id'), '[]'::jsonb) INTO meetings FROM match_meetings_with_reasons(newcomer) x;
  IF failed IS DISTINCT FROM '[]'::jsonb OR meetings IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'CHECK FAILED: A resident with no followed towns gets Complete with zero meetings (towns %, meetings %)', failed, meetings;
  END IF;

  RAISE EXCEPTION 'ALL CHECKS PASSED (3 checks). This error rolls back the test data.';
END;
$$;
