-- =============================================================================
-- Civic Radar - Supabase schema
-- CSC 351 - Team Civic Radar (KJ, MS, AO, EG, YA)
--   Part 1  myapp_profile      - the profile table the profile page already uses
--   Part 2  Civic Radar schema - the 31 tables from the system requirements,
--                                plus a seed row for Salem, the pilot town
--   Part 3  Row Level Security - deny-by-default on every Civic Radar table
--   Part 4  avatars bucket     - public storage bucket for profile pictures
--
-- Part 2 is generated from database/schema.sql (the portable PostgreSQL script,
-- which is the source of truth). Only three things differ, and each is marked
-- "Supabase:" inline:
--
--   1. is_valid_time_zone() is created as public.is_valid_time_zone() with a
--      pinned search_path, because Supabase's database linter flags functions
--      with a mutable search_path.
--   2. user_accounts.user_id is a foreign key to auth.users (id) ON DELETE
--      CASCADE instead of defaulting to gen_random_uuid(). On Supabase the
--      account row and the auth user are the same person, so the id has to come
--      from Supabase Auth.
--   3. Row Level Security is enabled on every table (Part 3).
-- =============================================================================
-- =============================================================================
-- PART 1. Profile table (used by app/api/profile)
-- =============================================================================
create table if not exists myapp_profile (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  biography text not null default '',
  avatar_url text
);

-- If myapp_profile already exists from an earlier version, add the avatar_url column:
alter table myapp_profile
add column if not exists avatar_url text;

-- =============================================================================
-- PART 2. Civic Radar schema
-- Generated from database/schema.sql. See the notes at the top of this file for
-- the three Supabase-specific differences.
--
-- Conventions used throughout:
--   * snake_case names; surrogate keys are <table_singular>_id.
--   * All timestamps are TIMESTAMPTZ (stored in UTC, converted for display
--     using a town's meeting time zone or a resident's digest time zone).
--   * For data retrieved from CivicClerk, NULL means "Not provided by the
--     source" (SRS-220.4, SRS-402.6, SRS-502.3). For extracted officials,
--     NULL means "Not found" (SRS-308.1).
--   * Catalog entries (towns, topics, governing bodies) are never deleted;
--     removed_at hides them from selection lists (SRS-104.4) without
--     destroying meetings, follows, or history that reference them.
-- =============================================================================
-- -----------------------------------------------------------------------------
-- Drop existing objects (reverse dependency order)
-- -----------------------------------------------------------------------------
drop table if exists official_votes CASCADE;

drop table if exists official_sources CASCADE;

drop table if exists extracted_officials CASCADE;

drop table if exists officials CASCADE;

drop table if exists extractions CASCADE;

drop table if exists email_submissions CASCADE;

drop table if exists weekly_digests CASCADE;

drop table if exists email_preferences CASCADE;

drop table if exists user_alerts CASCADE;

drop table if exists meeting_updates CASCADE;

drop table if exists user_followed_meetings CASCADE;

drop table if exists meeting_topics CASCADE;

drop table if exists meeting_recordings CASCADE;

drop table if exists agenda_items CASCADE;

drop table if exists summary_attempts CASCADE;

drop table if exists documents CASCADE;

drop table if exists meeting_baselines CASCADE;

drop table if exists meetings CASCADE;

drop table if exists source_check_collections CASCADE;

drop table if exists source_checks CASCADE;

drop table if exists organization_followed_topics CASCADE;

drop table if exists organization_followed_towns CASCADE;

drop table if exists user_followed_topics CASCADE;

drop table if exists user_followed_towns CASCADE;

drop table if exists governing_bodies CASCADE;

drop table if exists towns CASCADE;

drop table if exists topics CASCADE;

drop table if exists organization_members CASCADE;

drop table if exists organizations CASCADE;

drop table if exists account_activity CASCADE;

drop table if exists user_accounts CASCADE;

drop function IF exists public.is_valid_time_zone (TEXT) CASCADE;

-- -----------------------------------------------------------------------------
-- Helper function
-- -----------------------------------------------------------------------------
-- Function: is_valid_time_zone
-- Supports: SRS-104.6, SRS-408.7
-- Purpose: Returns TRUE only for a named IANA time zone (e.g. America/New_York)
--          so CHECK constraints can reject invalid town and digest time zones.
create function public.is_valid_time_zone (tz TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE
set
  search_path = pg_catalog,
  public -- Supabase: pin the search path (linter 0011)
  as $$
    SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = tz);
$$;

-- =============================================================================
-- 1. General User Needs — accounts, organizations, catalog, follows
-- =============================================================================
-- Table: user_accounts
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-105.4, SRS-106.1, SRS-106.2, SRS-106.3, SRS-106.4, SRS-107.1, SRS-107.3, SRS-107.4, SRS-217.4, SRS-406.2, SRS-408.1
-- Purpose: Stores each signed-in user's account, role, suspension status, and first-time setup progress.
create table user_accounts (
  -- Supabase: the account row and the auth user are the same person, so there
  -- is no gen_random_uuid() default. The id must come from auth.users, and
  -- deleting the auth user deletes this row with it.
  user_id UUID primary key references auth.users (id) on delete CASCADE,
  email VARCHAR(254) not null, -- address for individual emails and digests
  account_role VARCHAR(30) not null default 'User' check (account_role in ('User', 'System administrator')),
  account_status VARCHAR(20) not null default 'Active' check (account_status in ('Active', 'Suspended')),
  setup_status VARCHAR(20) not null default 'Not started' check (
    setup_status in ('Not started', 'Skipped', 'Completed')
  )
);

-- Table: account_activity
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-105.1, SRS-105.2, SRS-105.3, SRS-105.4
-- Purpose: Stores one record per sign-in, settings change, or permission change on a user account.
create table account_activity (
  activity_id BIGINT generated by default as identity primary key,
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  activity_type VARCHAR(20) not null check (
    activity_type in ('Sign-in', 'Settings change', 'Permission change')
  ),
  occurred_at TIMESTAMPTZ not null default now()
);

-- Table: organizations
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.1, SRS-106.1, SRS-106.2, SRS-106.3, SRS-106.4, SRS-108.1
-- Purpose: Stores each journalist or community organization account and its suspension status.
create table organizations (
  organization_id INTEGER generated by default as identity primary key,
  name VARCHAR(150) not null unique,
  account_status VARCHAR(20) not null default 'Active' check (account_status in ('Active', 'Suspended'))
);

-- Table: organization_members
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.1, SRS-103.2, SRS-103.3, SRS-103.4, SRS-108.2, SRS-108.4
-- Purpose: Stores which users belong to which organization and each member's permission level.
create table organization_members (
  organization_id INTEGER not null references organizations (organization_id) on delete CASCADE,
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  -- Administrator holds both the member-management permission (SRS-103.3)
  -- and the settings permission (SRS-103.4); Member holds neither.
  permission_level VARCHAR(20) not null default 'Member' check (permission_level in ('Member', 'Administrator')),
  primary key (organization_id, user_id),
  unique (user_id) -- a user belongs to at most one organization ("my organization", UR-108)
);

-- Table: topics
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-101.1, SRS-104.2, SRS-104.3, SRS-104.4, SRS-104.5, SRS-401.4
-- Purpose: Stores the platform catalog of local-issue topics that users follow and meetings are tagged with.
create table topics (
  topic_id INTEGER generated by default as identity primary key,
  name VARCHAR(100) not null check (btrim(name) <> ''),
  removed_at TIMESTAMPTZ -- NULL = shown in selection lists
);

-- Table: towns
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-104.2, SRS-104.3, SRS-104.4, SRS-104.5, SRS-104.6, SRS-208.1, SRS-212.1, SRS-212.2, SRS-220.6, SRS-220.9, SRS-220.10, SRS-401.7, SRS-502.6, SRS-502.7, SRS-502.8, SRS-505.2, SRS-505.3
-- Purpose: Stores each supported town, its CivicClerk source account, meeting time zone, and which optional source features are verified.
create table towns (
  town_id INTEGER generated by default as identity primary key,
  name VARCHAR(100) not null check (btrim(name) <> ''),
  source_account_id VARCHAR(100) not null unique check (btrim(source_account_id) <> ''), -- e.g. 'salemma'
  meeting_time_zone VARCHAR(64) not null check (is_valid_time_zone (meeting_time_zone)),
  provides_agenda_items BOOLEAN not null default false, -- verified per SRS-220.9
  provides_recordings BOOLEAN not null default false, -- verified per SRS-220.10
  publishes_vote_records BOOLEAN not null default false, -- SRS-505.2 / SRS-505.3
  removed_at TIMESTAMPTZ -- NULL = shown in selection lists
);

-- Table: governing_bodies
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-104.2, SRS-104.3, SRS-104.4, SRS-104.5, SRS-202.4, SRS-214.3, SRS-220.3, SRS-311.2, SRS-402.2, SRS-502.2
-- Purpose: Stores the catalog of councils, boards, and committees that publish meetings in each town.
create table governing_bodies (
  body_id INTEGER generated by default as identity primary key,
  town_id INTEGER not null references towns (town_id),
  name VARCHAR(150) not null check (btrim(name) <> ''),
  removed_at TIMESTAMPTZ, -- NULL = shown in selection lists
  unique (body_id, town_id) -- target of meetings' composite FK (body must belong to the meeting's town)
);

-- Table: user_followed_towns
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-102.1, SRS-102.2, SRS-102.3, SRS-106.4, SRS-107.2, SRS-108.4, SRS-201.1, SRS-201.3, SRS-401.1, SRS-401.2, SRS-401.6, SRS-401.7, SRS-401.8
-- Purpose: Stores the towns each user personally follows.
create table user_followed_towns (
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  town_id INTEGER not null references towns (town_id),
  primary key (user_id, town_id)
);

-- Table: user_followed_topics
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-101.2, SRS-101.3, SRS-101.4, SRS-106.4, SRS-107.4, SRS-108.4, SRS-401.1, SRS-401.2, SRS-401.8
-- Purpose: Stores the topics each user personally follows.
create table user_followed_topics (
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  topic_id INTEGER not null references topics (topic_id),
  primary key (user_id, topic_id)
);

-- Table: organization_followed_towns
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.4, SRS-108.1, SRS-108.2, SRS-108.3, SRS-108.4
-- Purpose: Stores the towns an organization shares as followed towns with all of its members.
create table organization_followed_towns (
  organization_id INTEGER not null references organizations (organization_id) on delete CASCADE,
  town_id INTEGER not null references towns (town_id),
  primary key (organization_id, town_id)
);

-- Table: organization_followed_topics
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.4, SRS-108.1, SRS-108.2, SRS-108.3, SRS-108.4
-- Purpose: Stores the topics an organization shares as followed topics with all of its members.
create table organization_followed_topics (
  organization_id INTEGER not null references organizations (organization_id) on delete CASCADE,
  topic_id INTEGER not null references topics (topic_id),
  primary key (organization_id, topic_id)
);

-- =============================================================================
-- 2. Document Retrieval, Storage & AI Summarization
-- =============================================================================
-- Table: source_checks
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-102.1, SRS-102.2, SRS-102.3, SRS-208.1, SRS-222.1, SRS-401.3, SRS-401.11, SRS-404.5, SRS-404.9, SRS-408.5, SRS-408.6, SRS-408.12, SRS-501.4, SRS-NFR-9, SRS-NFR-15
-- Purpose: Stores each scheduled CivicClerk check of a town, when it ended, and whether it found new or changed records.
create table source_checks (
  check_id BIGINT generated by default as identity primary key,
  town_id INTEGER not null references towns (town_id),
  started_at TIMESTAMPTZ not null default now(),
  ended_at TIMESTAMPTZ, -- NULL while the check is running
  changes_found BOOLEAN, -- NULL while running; FALSE when any collection Failed;
  -- only meaningful for a successful check (SRS-102.3)
  check (
    ended_at is null
    or ended_at >= started_at
  ),
  check ((ended_at is null) = (changes_found is null))
  -- A check is "successful" (Definition 10) when it has ended and none of
  -- its source_check_collections rows is 'Failed'.
  -- A check still running when the town's next scheduled check starts is
  -- ended by the scheduler, with its unfinished collections recorded as
  -- 'Failed', so it counts as not successful (SRS-102.2).
);

-- Table: source_check_collections
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-102.2, SRS-220.1, SRS-222.2, SRS-222.3
-- Purpose: Stores the result (Complete, Failed, or Unsupported) of each collection read during a source check.
create table source_check_collections (
  check_id BIGINT not null references source_checks (check_id) on delete CASCADE,
  collection VARCHAR(20) not null check (
    collection in (
      'Meetings',
      'Documents',
      'Agenda items',
      'Recordings'
    )
  ),
  result VARCHAR(20) not null check (result in ('Complete', 'Failed', 'Unsupported')),
  primary key (check_id, collection)
);

-- Table: meetings
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-202.2, SRS-202.3, SRS-209.1, SRS-209.3, SRS-220.2, SRS-220.3, SRS-220.4, SRS-220.5, SRS-220.6, SRS-220.8, SRS-221.1, SRS-221.2, SRS-221.3, SRS-401.10, SRS-402.1, SRS-402.2, SRS-402.4, SRS-402.6, SRS-404.7, SRS-404.10, SRS-408.3, SRS-408.10, SRS-501.2, SRS-502.2, SRS-502.3, SRS-502.9, SRS-506.2, SRS-508.3, SRS-NFR-15
-- Purpose: Stores the latest retrieved details of each meeting published by a supported town's source.
create table meetings (
  meeting_id BIGINT generated by default as identity primary key,
  town_id INTEGER not null references towns (town_id),
  body_id INTEGER, -- NULL = no matching catalog body (see source_body_name)
  source_body_id VARCHAR(100), -- CivicClerk event category id as sent; used to match the catalog body (SRS-220.3)
  source_body_name VARCHAR(150), -- body name exactly as sent; NULL = not provided (SRS-220.3, SRS-220.4)
  source_meeting_id VARCHAR(100) not null, -- CivicClerk event id
  title VARCHAR(500),
  source_start_time VARCHAR(64), -- start time exactly as the source sent it (SRS-220.5)
  start_at TIMESTAMPTZ, -- parsed using the town's meeting_time_zone (SRS-220.6)
  location VARCHAR(500),
  online_link VARCHAR(2048) check (online_link ~* '^https?://'),
  source_url VARCHAR(2048) check (source_url ~* '^https?://'), -- "Open on CivicClerk"
  is_canceled BOOLEAN not null default false, -- only set when the source says so (SRS-221.2)
  topic_classification VARCHAR(20) not null default 'Pending' check (
    topic_classification in ('Pending', 'Classified', 'Unavailable')
  ),
  first_retrieved_at TIMESTAMPTZ not null default now(),
  unique (town_id, source_meeting_id), -- meeting identity (SRS-220.2)
  unique (meeting_id, town_id), -- target of documents' composite FK
  foreign KEY (body_id, town_id) references governing_bodies (body_id, town_id),
  check (
    start_at is null
    or source_start_time is not null
  ) -- a parsed start time needs a source start time (SRS-220.5, SRS-220.6)
  -- Meetings are never deleted (SRS-221.2, SRS-221.3). documents, agenda_items,
  -- and meeting_recordings reference meetings with plain foreign keys so an
  -- accidental delete fails instead of removing published material.
);

-- Table: meeting_baselines
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-402.3, SRS-402.7, SRS-404.5, SRS-404.7, SRS-404.9, SRS-405.3
-- Purpose: Stores each meeting's monitored values as of its town's last successful check, used to detect changes.
create table meeting_baselines (
  meeting_id BIGINT primary key references meetings (meeting_id) on delete CASCADE,
  start_at TIMESTAMPTZ,
  location VARCHAR(500),
  online_link VARCHAR(2048),
  is_canceled BOOLEAN not null,
  baselined_at TIMESTAMPTZ not null default now()
);

-- Table: documents
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-201.1, SRS-201.2, SRS-202.1, SRS-202.5, SRS-203.2, SRS-203.3, SRS-204.2, SRS-204.3, SRS-204.5, SRS-206.1, SRS-206.2, SRS-207.2, SRS-207.4, SRS-208.2, SRS-208.3, SRS-208.4, SRS-209.2, SRS-210.1, SRS-210.2, SRS-210.3, SRS-211.1, SRS-212.1, SRS-213.2, SRS-214.2, SRS-214.3, SRS-215.1, SRS-215.2, SRS-216.2, SRS-217.1, SRS-217.2, SRS-217.3, SRS-218.2, SRS-219.1, SRS-220.7, SRS-301.5, SRS-307.2, SRS-403.2, SRS-404.3, SRS-404.10, SRS-502.4, SRS-502.5, SRS-NFR-7, SRS-NFR-8, SRS-NFR-13
-- Purpose: Stores each retrieved agenda, packet, minutes, or other file, its stored copy, and its AI summary.
create table documents (
  document_id BIGINT generated by default as identity primary key,
  meeting_id BIGINT not null,
  town_id INTEGER not null, -- needed for UNIQUE (town_id, source_file_id) (SRS-208.3);
  -- kept equal to the meeting's town by the composite FK below
  source_file_id VARCHAR(100) not null, -- CivicClerk file id
  title VARCHAR(500) not null, -- CivicClerk always supplies a file name (SRS-202.1, SRS-216.2)
  document_type VARCHAR(10) not null check (
    document_type in ('Agenda', 'Minutes', 'Packet', 'Other')
  ),
  source_url VARCHAR(2048) not null check (source_url ~* '^https?://'), -- "Open on CivicClerk"
  storage_path VARCHAR(1024) not null unique, -- stored copy served when CivicClerk is down; one file per document
  mime_type VARCHAR(100) not null, -- 'application/pdf' required for extraction
  file_size_bytes BIGINT not null check (file_size_bytes >= 0),
  file_sha256 CHAR(64) not null check (file_sha256 ~ '^[0-9a-f]{64}$'), -- byte-identical download/source link
  retrieved_at TIMESTAMPTZ not null default now(),
  baselined_at TIMESTAMPTZ, -- NULL until included in a successful check's baseline
  -- summary_status is stored rather than derived from summary_attempts so the
  -- progress counts (SRS-217.1 to SRS-217.3, SRS-NFR-13) are one indexed lookup.
  -- The summarization job updates it and summary_attempts in one transaction.
  summary_status VARCHAR(10) not null default 'Pending' check (
    summary_status in ('Pending', 'Complete', 'Failed')
  ),
  summary_text TEXT,
  summary_generated_at TIMESTAMPTZ,
  unique (town_id, source_file_id), -- no duplicate entries (SRS-208.3)
  unique (document_id, meeting_id), -- target of meeting_updates' composite FK
  foreign KEY (meeting_id, town_id) references meetings (meeting_id, town_id),
  check (
    (summary_status = 'Complete') = (summary_text is not null)
  ),
  check (
    (summary_text is null) = (summary_generated_at is null)
  ),
  check (
    summary_generated_at is null
    or summary_generated_at >= retrieved_at
  ), -- summary follows retrieval (SRS-204.1)
  check (
    summary_text is null
    or array_length(
      regexp_split_to_array(btrim(summary_text), '\s+'),
      1
    ) <= 150
  ) -- SRS-NFR-7
);

-- Table: summary_attempts
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-204.1, SRS-204.5, SRS-210.1, SRS-NFR-8
-- Purpose: Stores each attempt to generate a document's AI summary so three consecutive failures can be detected.
create table summary_attempts (
  attempt_id BIGINT generated by default as identity primary key,
  document_id BIGINT not null references documents (document_id) on delete CASCADE,
  attempt_number SMALLINT not null check (attempt_number >= 1),
  started_at TIMESTAMPTZ not null default now(),
  ended_at TIMESTAMPTZ,
  outcome VARCHAR(12) not null default 'In progress' check (outcome in ('In progress', 'Succeeded', 'Failed')),
  unique (document_id, attempt_number),
  check ((outcome = 'In progress') = (ended_at is null)),
  check (
    ended_at is null
    or ended_at >= started_at
  )
);

-- Table: agenda_items
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-220.9, SRS-401.4, SRS-404.3, SRS-404.6, SRS-502.6, SRS-505.2, SRS-506.2, SRS-508.3
-- Purpose: Stores each agenda item the source lists for a meeting, for towns whose source provides agenda items.
create table agenda_items (
  agenda_item_id BIGINT generated by default as identity primary key,
  meeting_id BIGINT not null references meetings (meeting_id),
  source_item_id VARCHAR(100) not null,
  sort_order INTEGER not null check (sort_order >= 0), -- position in the source's agenda
  title VARCHAR(1000) not null,
  item_text TEXT, -- agenda text used for topic tagging
  baselined_at TIMESTAMPTZ, -- NULL until included in a successful check's baseline
  removed_at TIMESTAMPTZ, -- set when a successful check no longer lists it
  unique (meeting_id, source_item_id),
  unique (agenda_item_id, meeting_id) -- target of meeting_updates' composite FK
);

-- Table: meeting_recordings
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-220.3, SRS-220.10, SRS-403.1, SRS-404.3, SRS-502.7
-- Purpose: Stores each recording link published for a meeting, for towns whose source provides recordings.
create table meeting_recordings (
  recording_id BIGINT generated by default as identity primary key,
  meeting_id BIGINT not null references meetings (meeting_id),
  recording_url VARCHAR(2048) not null check (recording_url ~* '^https?://'),
  baselined_at TIMESTAMPTZ, -- NULL until included in a successful check's baseline
  unique (meeting_id, recording_url),
  unique (recording_id, meeting_id) -- target of meeting_updates' composite FK
);

-- =============================================================================
-- 3. Interest Matching, Alerts & Digest
-- =============================================================================
-- Table: meeting_topics
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-401.1, SRS-401.4, SRS-401.5, SRS-408.11
-- Purpose: Stores each topic tag assigned to a meeting and the agenda text that produced it.
create table meeting_topics (
  meeting_id BIGINT not null references meetings (meeting_id) on delete CASCADE,
  topic_id INTEGER not null references topics (topic_id),
  evidence_text TEXT not null check (btrim(evidence_text) <> ''), -- shown as the matching reason
  primary key (meeting_id, topic_id)
);

-- Table: user_followed_meetings
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-404.1, SRS-404.2, SRS-405.1, SRS-408.1, SRS-501.1
-- Purpose: Stores the individual meetings each resident follows directly.
create table user_followed_meetings (
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  meeting_id BIGINT not null references meetings (meeting_id),
  primary key (user_id, meeting_id)
);

-- Table: meeting_updates
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-402.3, SRS-402.7, SRS-403.1, SRS-403.2, SRS-404.3, SRS-404.6, SRS-405.1, SRS-405.3, SRS-406.2, SRS-406.3, SRS-408.2, SRS-408.4, SRS-503.2, SRS-503.4
-- Purpose: Stores one record per new meeting or monitored change, shared by every resident it is relevant to.
create table meeting_updates (
  update_id BIGINT generated by default as identity primary key,
  meeting_id BIGINT not null references meetings (meeting_id),
  -- Email type (Definition 11) is derived from update_type:
  --   New meeting / Start time / Location / Online link / Cancellation -> Upcoming meetings and schedule changes
  --   Agenda item added/removed, Document published (non-Minutes)      -> Agenda items and other meeting materials
  --   Document published (Minutes), Recording published                -> Available minutes and recordings
  update_type VARCHAR(30) not null check (
    update_type in (
      'New meeting',
      'Start time changed',
      'Location changed',
      'Online link changed',
      'Cancellation changed',
      'Agenda item added',
      'Agenda item removed',
      'Document published',
      'Recording published'
    )
  ),
  detected_at TIMESTAMPTZ not null default now(),
  previous_value TEXT, -- NULL for additions
  new_value TEXT, -- NULL for removals
  document_id BIGINT, -- changed item, when it is a document
  agenda_item_id BIGINT, -- changed item, when it is an agenda item
  recording_id BIGINT, -- changed item, when it is a recording
  unique (update_id, meeting_id), -- target of user_alerts' composite FK
  -- The changed item must belong to the same meeting as the update.
  foreign KEY (document_id, meeting_id) references documents (document_id, meeting_id),
  foreign KEY (agenda_item_id, meeting_id) references agenda_items (agenda_item_id, meeting_id),
  foreign KEY (recording_id, meeting_id) references meeting_recordings (recording_id, meeting_id),
  -- Exactly the item column that matches the update type is filled in.
  check (
    (update_type = 'Document published') = (document_id is not null)
  ),
  check (
    (
      update_type in ('Agenda item added', 'Agenda item removed')
    ) = (agenda_item_id is not null)
  ),
  check (
    (update_type = 'Recording published') = (recording_id is not null)
  )
);

-- Table: user_alerts
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-402.1, SRS-402.3, SRS-403.1, SRS-404.2, SRS-404.3, SRS-405.1, SRS-406.2, SRS-407.4, SRS-407.5, SRS-501.6, SRS-502.1, SRS-503.1
-- Purpose: Stores each in-app alert delivered to a resident about a meeting.
create table user_alerts (
  alert_id BIGINT generated by default as identity primary key,
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  meeting_id BIGINT not null references meetings (meeting_id),
  update_id BIGINT, -- NULL = upcoming-meeting alert (SRS-402.1)
  created_at TIMESTAMPTZ not null default now(),
  foreign KEY (update_id, meeting_id) references meeting_updates (update_id, meeting_id),
  unique (user_id, update_id) -- one in-app alert per resident per update (SRS-405.1)
);

-- Table: email_preferences
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-406.1, SRS-406.2, SRS-406.3, SRS-407.1, SRS-407.2, SRS-407.3, SRS-407.5, SRS-408.1, SRS-408.7, SRS-408.8, SRS-408.9
-- Purpose: Stores each resident's delivery choice per email type, pause/off state, and digest time zone.
create table email_preferences (
  user_id UUID primary key references user_accounts (user_id) on delete CASCADE,
  upcoming_delivery VARCHAR(15) not null -- Upcoming meetings and schedule changes
  check (
    upcoming_delivery in ('Individual', 'Weekly digest', 'Both')
  ),
  materials_delivery VARCHAR(15) not null -- Agenda items and other meeting materials
  check (
    materials_delivery in ('Individual', 'Weekly digest', 'Both')
  ),
  records_delivery VARCHAR(15) not null -- Available minutes and recordings
  check (
    records_delivery in ('Individual', 'Weekly digest', 'Both')
  ),
  delivery_state VARCHAR(10) not null default 'Active' check (delivery_state in ('Active', 'Paused', 'Off')),
  paused_until TIMESTAMPTZ,
  digest_time_zone VARCHAR(64) not null default 'America/New_York' check (is_valid_time_zone (digest_time_zone)),
  check (
    (delivery_state = 'Paused') = (paused_until is not null)
  )
);

-- Table: weekly_digests
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-408.1, SRS-408.2, SRS-408.10, SRS-NFR-3
-- Purpose: Stores each resident's weekly digest occurrence and the reporting period it covers.
create table weekly_digests (
  digest_id BIGINT generated by default as identity primary key,
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  period_start TIMESTAMPTZ not null, -- previous scheduled digest (inclusive)
  scheduled_for TIMESTAMPTZ not null, -- Sunday 6:00 PM in digest_time_zone (exclusive end)
  unique (user_id, scheduled_for), -- one digest per resident per week
  check (period_start < scheduled_for)
);

-- Table: email_submissions
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-405.2, SRS-405.4, SRS-405.5, SRS-406.2, SRS-407.1, SRS-407.2, SRS-407.5, SRS-408.1, SRS-NFR-2, SRS-NFR-3
-- Purpose: Stores each email handed to the email service, for an individual alert or a weekly digest, and the service's response.
create table email_submissions (
  submission_id BIGINT generated by default as identity primary key,
  alert_id BIGINT references user_alerts (alert_id) on delete CASCADE,
  digest_id BIGINT references weekly_digests (digest_id) on delete CASCADE,
  status VARCHAR(12) not null default 'Submitted' check (
    status in ('Submitted', 'Accepted', 'Rejected', 'Unresolved')
  ),
  submitted_at TIMESTAMPTZ not null default now(),
  responded_at TIMESTAMPTZ, -- when the service accepted or rejected it
  check (num_nonnulls (alert_id, digest_id) = 1), -- an email is for an alert or a digest, not both
  check (
    (status in ('Accepted', 'Rejected')) = (responded_at is not null)
  )
);

-- =============================================================================
-- 4. Officials & Contact Extractions
-- =============================================================================
-- Table: extractions
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-301.4, SRS-302.3, SRS-303.1, SRS-303.2, SRS-303.3, SRS-303.4, SRS-304.1, SRS-304.2, SRS-304.3, SRS-305.4, SRS-306.1, SRS-306.2, SRS-306.3, SRS-307.1, SRS-307.2, SRS-307.3, SRS-307.6, SRS-310.2
-- Purpose: Stores each user's request to extract officials from a document, its status, and its failure cause.
create table extractions (
  extraction_id BIGINT generated by default as identity primary key,
  user_id UUID not null references user_accounts (user_id) on delete CASCADE,
  document_id BIGINT references documents (document_id) on delete set null, -- NULL = source no longer available (SRS-303.3)
  source_document_title VARCHAR(500) not null, -- kept so SRS-303.1 still works after the document is gone
  status VARCHAR(12) not null default 'Queued' check (
    status in ('Queued', 'Processing', 'Completed', 'Failed')
  ),
  failure_cause VARCHAR(20) check (
    failure_cause in (
      'Unreadable file',
      'File too large',
      'Missing source file',
      'Other'
    )
  ),
  requested_at TIMESTAMPTZ not null default now(),
  completed_at TIMESTAMPTZ, -- "date and time the extraction was performed"
  check ((status = 'Failed') = (failure_cause is not null)),
  check (
    (status in ('Completed', 'Failed')) = (completed_at is not null)
  ),
  check (
    completed_at is null
    or completed_at >= requested_at
  )
);

-- Table: officials
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-311.1, SRS-311.2, SRS-504.1, SRS-504.2, SRS-505.1, SRS-505.2, SRS-505.3, SRS-506.2, SRS-508.2
-- Purpose: Stores the shared, de-duplicated list of officials with their most recently found title, role, and contact details.
create table officials (
  official_id BIGINT generated by default as identity primary key,
  body_id INTEGER not null references governing_bodies (body_id), -- body of the source document's meeting
  full_name VARCHAR(150) not null check (btrim(full_name) <> ''),
  title VARCHAR(150), -- NULL = unavailable
  role VARCHAR(150),
  email VARCHAR(254),
  phone VARCHAR(30),
  details_document_id BIGINT not null references documents (document_id) -- document that supplied the current details
);

-- Table: official_sources
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-311.1, SRS-311.2
-- Purpose: Stores every source document each shared official was found in.
create table official_sources (
  official_id BIGINT not null references officials (official_id) on delete CASCADE,
  document_id BIGINT not null references documents (document_id),
  primary key (official_id, document_id)
);

-- Table: extracted_officials
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-302.1, SRS-302.2, SRS-302.4, SRS-304.2, SRS-305.4, SRS-308.1, SRS-308.2, SRS-309.1, SRS-309.3, SRS-309.4, SRS-309.5, SRS-310.2
-- Purpose: Stores each official found by one user's extraction, exactly as extracted, private to that user.
create table extracted_officials (
  extracted_official_id BIGINT generated by default as identity primary key,
  extraction_id BIGINT not null references extractions (extraction_id) on delete CASCADE,
  full_name VARCHAR(150) not null check (btrim(full_name) <> ''),
  title VARCHAR(150), -- NULL = "Not found"
  role VARCHAR(150),
  email VARCHAR(254),
  phone VARCHAR(30)
);

-- =============================================================================
-- 5. Website & User Experience
-- =============================================================================
-- Table: official_votes
-- Reviewed by: YA (Yolanda Ampomah)
-- Supports: SRS-505.2, SRS-505.3
-- Purpose: Stores each official's recorded vote on an agenda item, for towns whose source publishes vote records.
create table official_votes (
  vote_id BIGINT generated by default as identity primary key,
  official_id BIGINT not null references officials (official_id) on delete CASCADE,
  agenda_item_id BIGINT not null references agenda_items (agenda_item_id),
  vote_value VARCHAR(10) not null check (
    vote_value in ('Yes', 'No', 'Abstain', 'Absent', 'Recused')
  ),
  unique (official_id, agenda_item_id)
);

-- =============================================================================
-- Indexes and partial unique constraints
-- =============================================================================
-- Case-insensitive uniqueness for sign-in email.
create unique INDEX user_accounts_email_uq on user_accounts (lower(email));

-- Catalog names are unique among entries still shown in selection lists (SRS-104.2, SRS-104.4).
create unique INDEX topics_active_name_uq on topics (lower(name))
where
  removed_at is null;

create unique INDEX towns_active_name_uq on towns (lower(name))
where
  removed_at is null;

create unique INDEX governing_bodies_active_name_uq on governing_bodies (town_id, lower(name))
where
  removed_at is null;

-- A merged official appears once per governing body (SRS-311.2).
create unique INDEX officials_name_body_uq on officials (body_id, lower(full_name));

-- A document or recording is announced only once (SRS-403.1).
create unique INDEX meeting_updates_document_published_uq on meeting_updates (document_id)
where
  update_type = 'Document published';

create unique INDEX meeting_updates_recording_published_uq on meeting_updates (recording_id)
where
  update_type = 'Recording published';

-- One upcoming-meeting alert per resident per meeting (SRS-402.1).
create unique INDEX user_alerts_upcoming_uq on user_alerts (user_id, meeting_id)
where
  update_id is null;

-- No second email once one is accepted, pending, or unresolved (SRS-405.2, SRS-405.5).
create unique INDEX email_submissions_alert_uq on email_submissions (alert_id)
where
  alert_id is not null
  and status <> 'Rejected';

create unique INDEX email_submissions_digest_uq on email_submissions (digest_id)
where
  digest_id is not null
  and status <> 'Rejected';

-- No duplicate in-flight extraction of the same document by the same user (SRS-306.3).
create unique INDEX extractions_in_flight_uq on extractions (user_id, document_id)
where
  status in ('Queued', 'Processing');

-- Lookup indexes for the pilot-scale response-time targets (SRS-NFR-4, NFR-5, NFR-12).
create index account_activity_user_time_idx on account_activity (user_id, occurred_at desc);

create index source_checks_town_time_idx on source_checks (town_id, ended_at desc);

create index meetings_town_start_idx on meetings (town_id, start_at);

create index documents_meeting_idx on documents (meeting_id);

create index documents_summary_status_idx on documents (summary_status);

create index meeting_topics_topic_idx on meeting_topics (topic_id);

create index meeting_updates_meeting_time_idx on meeting_updates (meeting_id, detected_at);

create index user_alerts_user_time_idx on user_alerts (user_id, created_at desc);

create index extractions_user_idx on extractions (user_id);

-- =============================================================================
-- Seed data
-- =============================================================================
-- Salem, MA is the verified pilot town (SRS-401.6, SRS-401.7). The optional
-- source features keep their FALSE defaults until they are verified (SRS-220.9,
-- SRS-220.10, SRS-505.2). Look Salem up by source_account_id, not by town_id.
insert into
  towns (name, source_account_id, meeting_time_zone)
values
  ('Salem', 'salemma', 'America/New_York')
on conflict (source_account_id) do nothing;

-- =============================================================================
-- PART 3. Row Level Security
--
-- Every table in the public schema is reachable through the Supabase REST API
-- with the anon key, which ships in the browser. Without RLS, anyone holding
-- that key could read and write followed towns, email preferences, alerts, and
-- extracted contact details. Enabling RLS with no policies closes that door:
-- the anon and authenticated roles get nothing.
--
-- The API routes in app/api sign in with SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS, so they keep working. If you only set SUPABASE_ANON_KEY in
-- .env.local, queries against these tables come back empty -- that is RLS doing
-- its job, not a bug. Add a policy per table as each feature is built, e.g.
--
--   CREATE POLICY user_followed_towns_own ON user_followed_towns
--     FOR ALL TO authenticated
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- =============================================================================
alter table user_accounts ENABLE row LEVEL SECURITY;

alter table account_activity ENABLE row LEVEL SECURITY;

alter table organizations ENABLE row LEVEL SECURITY;

alter table organization_members ENABLE row LEVEL SECURITY;

alter table topics ENABLE row LEVEL SECURITY;

alter table towns ENABLE row LEVEL SECURITY;

alter table governing_bodies ENABLE row LEVEL SECURITY;

alter table user_followed_towns ENABLE row LEVEL SECURITY;

alter table user_followed_topics ENABLE row LEVEL SECURITY;

alter table organization_followed_towns ENABLE row LEVEL SECURITY;

alter table organization_followed_topics ENABLE row LEVEL SECURITY;

alter table source_checks ENABLE row LEVEL SECURITY;

alter table source_check_collections ENABLE row LEVEL SECURITY;

alter table meetings ENABLE row LEVEL SECURITY;

alter table meeting_baselines ENABLE row LEVEL SECURITY;

alter table documents ENABLE row LEVEL SECURITY;

alter table summary_attempts ENABLE row LEVEL SECURITY;

alter table agenda_items ENABLE row LEVEL SECURITY;

alter table meeting_recordings ENABLE row LEVEL SECURITY;

alter table meeting_topics ENABLE row LEVEL SECURITY;

alter table user_followed_meetings ENABLE row LEVEL SECURITY;

alter table meeting_updates ENABLE row LEVEL SECURITY;

alter table user_alerts ENABLE row LEVEL SECURITY;

alter table email_preferences ENABLE row LEVEL SECURITY;

alter table weekly_digests ENABLE row LEVEL SECURITY;

alter table email_submissions ENABLE row LEVEL SECURITY;

alter table extractions ENABLE row LEVEL SECURITY;

alter table officials ENABLE row LEVEL SECURITY;

alter table official_sources ENABLE row LEVEL SECURITY;

alter table extracted_officials ENABLE row LEVEL SECURITY;

alter table official_votes ENABLE row LEVEL SECURITY;

-- =============================================================================
-- PART 4. Avatar storage bucket
-- Public bucket used by app/api/profile/avatar. Equivalent to
-- Storage -> New bucket -> name "avatars" -> check "Public bucket".
-- =============================================================================
insert into
  storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true)
on conflict (id) do nothing;