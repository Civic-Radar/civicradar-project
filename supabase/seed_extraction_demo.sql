-- =============================================================================
-- Demo data for SRS-301.4 (Extraction request) — AO
--
-- Adds Salem, MA with one City Council meeting and one Word file, so the
-- /extract page can show that a non-PDF document is rejected (SRS-301.5).
-- The real PDFs to extract come from supabase/seed_extraction_salem_documents.sql.
--
-- It also removes the two placeholder PDFs this script used to add in Sprint 1.
-- They had no real file behind them, so extracting them could only fail.
-- Requests already made for them are kept (their document link becomes empty).
--
-- Run it in the Supabase SQL Editor AFTER supabase/schema.sql.
-- Safe to run more than once: it skips rows that already exist.
-- Remove it (or don't run it) once real retrieval is in place.
-- =============================================================================
do $$
declare
  v_town_id    integer;
  v_body_id    integer;
  v_meeting_id bigint;
begin
  -- Town (SRS-104.6: source account id + meeting time zone are required)
  insert into towns (name, source_account_id, meeting_time_zone)
  values ('Salem', 'salemma', 'America/New_York')
  on conflict (source_account_id) do nothing;

  select town_id into v_town_id from towns where source_account_id = 'salemma';

  -- Governing body
  select body_id into v_body_id
  from governing_bodies
  where town_id = v_town_id and lower(name) = 'city council' and removed_at is null;

  if v_body_id is null then
    insert into governing_bodies (town_id, name)
    values (v_town_id, 'City Council')
    returning body_id into v_body_id;
  end if;

  -- Meeting
  insert into meetings (
    town_id, body_id, source_body_name, source_meeting_id, title,
    source_start_time, start_at, location, source_url
  )
  values (
    v_town_id, v_body_id, 'City Council', 'demo-2026-09-14', 'City Council Regular Meeting',
    '2026-09-14T19:00:00', timestamptz '2026-09-14 19:00:00 America/New_York',
    'City Hall, 93 Washington St, Salem, MA', 'https://salemma.portal.civicclerk.com/'
  )
  on conflict (town_id, source_meeting_id) do nothing;

  select meeting_id into v_meeting_id
  from meetings
  where town_id = v_town_id and source_meeting_id = 'demo-2026-09-14';

  -- Remove the two Sprint 1 placeholder PDFs.
  delete from documents
  where town_id = v_town_id and source_file_id in ('demo-file-1', 'demo-file-2');

  -- Document: one Word file (rejected per SRS-301.5)
  insert into documents (
    meeting_id, town_id, source_file_id, title, document_type,
    source_url, storage_path, mime_type, file_size_bytes, file_sha256
  )
  values
    (v_meeting_id, v_town_id, 'demo-file-3', 'City Council Regular Meeting - Public Comment Notes', 'Other',
     'https://salemma.portal.civicclerk.com/', 'demo/salem/city-council-2026-09-14-notes.docx',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 40960,
     encode(sha256('demo-file-3'::bytea), 'hex'))
  on conflict (town_id, source_file_id) do nothing;
end $$;

-- Quick check: should list only the Word file.
select document_id, title, document_type, mime_type
from documents
where source_file_id like 'demo-file-%'
order by document_id;
