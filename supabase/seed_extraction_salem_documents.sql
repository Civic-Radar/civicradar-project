-- =============================================================================
-- Real Salem documents for SRS-302.1 (Extracted official details) — AO
--
-- Adds three real documents Salem published on CivicClerk, so an extraction
-- reads a real PDF instead of a placeholder. documents.source_file_id is the
-- CivicClerk file id, which is how the extraction fetches the document's text.
--
--   File 1169  Agenda   Joint Public Hearing with the Planning Board, Oct 19, 2026  (event 1193)
--   File 1164  Agenda   Salem City Council Regular Meeting, Sep 10, 2026            (event 1191)
--   File 1168  Minutes  Salem City Council Regular Meeting, Sep 10, 2026            (event 1191)
--
-- Run it in the Supabase SQL Editor AFTER supabase/schema.sql.
-- Safe to run more than once, and safe alongside meeting retrieval (SRS-220.3):
--   * meetings already saved by retrieval are reused (same town + CivicClerk event id)
--   * documents use the CivicClerk file id, so they never duplicate a file that
--     document retrieval (SRS-208.2) saved. If retrieval later reaches one of
--     these files, it logs that file as failed and moves on.
-- storage_path, file_size_bytes and file_sha256 are placeholders until document
-- retrieval stores the real file.
-- =============================================================================
do $$
declare
  v_town_id integer;
  v_body_id integer;
  v_meeting_1193 bigint;
  v_meeting_1191 bigint;
begin
  insert into towns (name, source_account_id, meeting_time_zone)
  values ('Salem', 'salemma', 'America/New_York')
  on conflict (source_account_id) do nothing;

  select town_id into v_town_id from towns where source_account_id = 'salemma';

  select body_id into v_body_id
  from governing_bodies
  where town_id = v_town_id and lower(name) = 'city council' and removed_at is null;

  if v_body_id is null then
    insert into governing_bodies (town_id, name)
    values (v_town_id, 'City Council')
    returning body_id into v_body_id;
  end if;

  -- Meetings (skipped if retrieval already saved them)
  insert into meetings (
    town_id, body_id, source_body_id, source_body_name, source_meeting_id, title,
    source_start_time, start_at, location, source_url
  )
  values
    (v_town_id, v_body_id, null, 'City Council', '1193',
     'Joint Public Hearing with the Planning Board',
     '2026-10-19T18:00:00Z', timestamptz '2026-10-19 18:00:00 America/New_York',
     null, 'https://salemma.portal.civicclerk.com/event/1193/overview'),
    (v_town_id, v_body_id, null, 'City Council', '1191',
     'Salem City Council Regular Meeting',
     '2026-09-10T19:00:00Z', timestamptz '2026-09-10 19:00:00 America/New_York',
     null, 'https://salemma.portal.civicclerk.com/event/1191/overview')
  on conflict (town_id, source_meeting_id) do nothing;

  select meeting_id into v_meeting_1193 from meetings where town_id = v_town_id and source_meeting_id = '1193';
  select meeting_id into v_meeting_1191 from meetings where town_id = v_town_id and source_meeting_id = '1191';

  insert into documents (
    meeting_id, town_id, source_file_id, title, document_type,
    source_url, storage_path, mime_type, file_size_bytes, file_sha256
  )
  values
    (v_meeting_1193, v_town_id, '1169',
     'Joint Public Hearing with the Planning Board Monday October 19, 2026', 'Agenda',
     'https://salemma.portal.civicclerk.com/event/1193/overview', 'civicclerk/salemma/1169.pdf',
     'application/pdf', 0, encode(sha256('civicclerk-salemma-1169'::bytea), 'hex')),
    (v_meeting_1191, v_town_id, '1164',
     'Salem City Council Regular Meeting September 10, 2026', 'Agenda',
     'https://salemma.portal.civicclerk.com/event/1191/overview', 'civicclerk/salemma/1164.pdf',
     'application/pdf', 0, encode(sha256('civicclerk-salemma-1164'::bytea), 'hex')),
    (v_meeting_1191, v_town_id, '1168',
     'Salem City Council Regular Meeting September 10, 2026 - Minutes', 'Minutes',
     'https://salemma.portal.civicclerk.com/event/1191/overview', 'civicclerk/salemma/1168.pdf',
     'application/pdf', 0, encode(sha256('civicclerk-salemma-1168'::bytea), 'hex'))
  on conflict (town_id, source_file_id) do nothing;
end $$;

-- Quick check: should list the three real documents.
select document_id, source_file_id, title, document_type
from documents
where source_file_id in ('1169', '1164', '1168')
order by source_file_id;
