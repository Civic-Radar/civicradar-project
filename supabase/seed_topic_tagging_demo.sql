-- =============================================================================
-- Demo data for SRS-401.4 (Topic tagging), EG
-- Task 401.4-1 (issue #67)
--
-- Agenda retrieval is not built yet, so agenda_items is empty. This script
-- gives the tagger something to work on: it makes sure the Housing topic
-- exists and adds three agenda items with agenda text to the Salem demo
-- meeting. Only one item discusses housing.
--
-- Run it in the Supabase SQL Editor AFTER supabase/schema.sql,
-- supabase/seed_topics.sql, and supabase/seed_extraction_demo.sql (which
-- creates the demo meeting).
-- Safe to run more than once: it skips rows that already exist.
-- Remove it (or don't run it) once real agenda retrieval is in place.
-- =============================================================================
do $$
declare
  v_meeting_id bigint;
begin
  -- Housing topic. seed_topics.sql normally adds it already; never add a second.
  insert into topics (name)
  select 'Housing'
  where not exists (
    select 1 from topics
    where lower(name) = 'housing' and removed_at is null
  );

  -- The Salem demo meeting from seed_extraction_demo.sql
  select m.meeting_id into v_meeting_id
  from meetings m
  join towns t on t.town_id = m.town_id
  where t.source_account_id = 'salemma'
    and m.source_meeting_id = 'demo-2026-09-14';

  if v_meeting_id is null then
    raise exception 'Demo meeting demo-2026-09-14 not found. Run supabase/seed_extraction_demo.sql first.';
  end if;

  -- Agenda items. The demo-401.4- prefix keeps them apart from real item ids.
  insert into agenda_items (meeting_id, source_item_id, sort_order, title, item_text)
  values
    (v_meeting_id, 'demo-401.4-call-to-order', 0, 'Call to Order',
     'Call to order and roll call of members present.'),
    (v_meeting_id, 'demo-401.4-housing', 1, 'Affordable Housing Trust Fund Allocation',
     'Order to appropriate $250,000 from the Affordable Housing Trust Fund to create 12 affordable housing units at 40 Lafayette Street.'),
    (v_meeting_id, 'demo-401.4-minutes', 2, 'Approval of Minutes',
     'Approval of the minutes of the August 24, 2026 regular meeting.')
  on conflict (meeting_id, source_item_id) do nothing;
end $$;

-- Quick check: should list the three demo agenda items and one active Housing topic.
select a.agenda_item_id, a.meeting_id, a.sort_order, a.title, a.item_text
from agenda_items a
where a.source_item_id like 'demo-401.4-%'
order by a.sort_order;

select topic_id, name
from topics
where lower(name) = 'housing' and removed_at is null;
