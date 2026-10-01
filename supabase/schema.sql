-- =============================================================================
-- Civic Radar - Supabase schema
-- CSC 351 - Team Civic Radar (KJ, MS, AO, EG, YA)
--
-- Run this whole file in the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). It creates everything the app needs:
--
--   Part 1  myapp_profile      - the profile table the profile page already uses
--   Part 2  Civic Radar schema - the 31 tables from the system requirements
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
--
-- WARNING: Part 2 starts by dropping every Civic Radar table with CASCADE so the
-- file can be re-run. That destroys all Civic Radar data in the project. It does
-- NOT touch myapp_profile, auth.users, or storage.
-- =============================================================================


-- =============================================================================
-- PART 1. Profile table (used by app/api/profile)
-- =============================================================================

create table if not exists myapp_profile (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  biography  text not null default '',
  avatar_url text
);

-- If myapp_profile already exists from an earlier version, add the avatar_url column:
alter table myapp_profile add column if not exists avatar_url text;


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
DROP TABLE IF EXISTS official_votes                CASCADE;
DROP TABLE IF EXISTS official_sources              CASCADE;
DROP TABLE IF EXISTS extracted_officials           CASCADE;
DROP TABLE IF EXISTS officials                     CASCADE;
DROP TABLE IF EXISTS extractions                   CASCADE;
DROP TABLE IF EXISTS email_submissions             CASCADE;
DROP TABLE IF EXISTS weekly_digests                CASCADE;
DROP TABLE IF EXISTS email_preferences             CASCADE;
DROP TABLE IF EXISTS user_alerts                   CASCADE;
DROP TABLE IF EXISTS meeting_updates               CASCADE;
DROP TABLE IF EXISTS user_followed_meetings        CASCADE;
DROP TABLE IF EXISTS meeting_topics                CASCADE;
DROP TABLE IF EXISTS meeting_recordings            CASCADE;
DROP TABLE IF EXISTS agenda_items                  CASCADE;
DROP TABLE IF EXISTS summary_attempts              CASCADE;
DROP TABLE IF EXISTS documents                     CASCADE;
DROP TABLE IF EXISTS meeting_baselines             CASCADE;
DROP TABLE IF EXISTS meetings                      CASCADE;
DROP TABLE IF EXISTS source_check_collections      CASCADE;
DROP TABLE IF EXISTS source_checks                 CASCADE;
DROP TABLE IF EXISTS organization_followed_topics  CASCADE;
DROP TABLE IF EXISTS organization_followed_towns   CASCADE;
DROP TABLE IF EXISTS user_followed_topics          CASCADE;
DROP TABLE IF EXISTS user_followed_towns           CASCADE;
DROP TABLE IF EXISTS governing_bodies              CASCADE;
DROP TABLE IF EXISTS towns                         CASCADE;
DROP TABLE IF EXISTS topics                        CASCADE;
DROP TABLE IF EXISTS organization_members          CASCADE;
DROP TABLE IF EXISTS organizations                 CASCADE;
DROP TABLE IF EXISTS account_activity              CASCADE;
DROP TABLE IF EXISTS user_accounts                 CASCADE;

DROP FUNCTION IF EXISTS public.is_valid_time_zone(TEXT) CASCADE;


-- -----------------------------------------------------------------------------
-- Helper function
-- -----------------------------------------------------------------------------

-- Function: is_valid_time_zone
-- Supports: SRS-104.6, SRS-408.7
-- Purpose: Returns TRUE only for a named IANA time zone (e.g. America/New_York)
--          so CHECK constraints can reject invalid town and digest time zones.
CREATE FUNCTION public.is_valid_time_zone(tz TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public   -- Supabase: pin the search path (linter 0011)
AS $$
    SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = tz);
$$;


-- =============================================================================
-- 1. General User Needs — accounts, organizations, catalog, follows
-- =============================================================================

-- Table: user_accounts
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-105.4, SRS-106.1, SRS-106.2, SRS-106.3, SRS-106.4, SRS-107.1, SRS-107.3, SRS-107.4, SRS-217.4, SRS-406.2, SRS-408.1
-- Purpose: Stores each signed-in user's account, role, suspension status, and first-time setup progress.
CREATE TABLE user_accounts (
    -- Supabase: the account row and the auth user are the same person, so there
    -- is no gen_random_uuid() default. The id must come from auth.users, and
    -- deleting the auth user deletes this row with it.
    user_id         UUID            PRIMARY KEY
                    REFERENCES auth.users (id) ON DELETE CASCADE,
    email           VARCHAR(254)    NOT NULL,                               -- address for individual emails and digests
    account_role    VARCHAR(30)     NOT NULL DEFAULT 'User'
                    CHECK (account_role IN ('User', 'System administrator')),
    account_status  VARCHAR(20)     NOT NULL DEFAULT 'Active'
                    CHECK (account_status IN ('Active', 'Suspended')),
    setup_status    VARCHAR(20)     NOT NULL DEFAULT 'Not started'
                    CHECK (setup_status IN ('Not started', 'Skipped', 'Completed'))
);

-- Table: account_activity
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-105.1, SRS-105.2, SRS-105.3, SRS-105.4
-- Purpose: Stores one record per sign-in, settings change, or permission change on a user account.
CREATE TABLE account_activity (
    activity_id     BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         UUID            NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    activity_type   VARCHAR(20)     NOT NULL
                    CHECK (activity_type IN ('Sign-in', 'Settings change', 'Permission change')),
    occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Table: organizations
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.1, SRS-106.1, SRS-106.2, SRS-106.3, SRS-106.4, SRS-108.1
-- Purpose: Stores each journalist or community organization account and its suspension status.
CREATE TABLE organizations (
    organization_id INTEGER         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name            VARCHAR(150)    NOT NULL UNIQUE,
    account_status  VARCHAR(20)     NOT NULL DEFAULT 'Active'
                    CHECK (account_status IN ('Active', 'Suspended'))
);

-- Table: organization_members
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.1, SRS-103.2, SRS-103.3, SRS-103.4, SRS-108.2, SRS-108.4
-- Purpose: Stores which users belong to which organization and each member's permission level.
CREATE TABLE organization_members (
    organization_id  INTEGER        NOT NULL REFERENCES organizations (organization_id) ON DELETE CASCADE,
    user_id          UUID           NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    -- Administrator holds both the member-management permission (SRS-103.3)
    -- and the settings permission (SRS-103.4); Member holds neither.
    permission_level VARCHAR(20)    NOT NULL DEFAULT 'Member'
                     CHECK (permission_level IN ('Member', 'Administrator')),
    PRIMARY KEY (organization_id, user_id),
    UNIQUE (user_id)                -- a user belongs to at most one organization ("my organization", UR-108)
);

-- Table: topics
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-101.1, SRS-104.2, SRS-104.3, SRS-104.4, SRS-104.5, SRS-401.4
-- Purpose: Stores the platform catalog of local-issue topics that users follow and meetings are tagged with.
CREATE TABLE topics (
    topic_id        INTEGER         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name            VARCHAR(100)    NOT NULL CHECK (btrim(name) <> ''),
    removed_at      TIMESTAMPTZ                                  -- NULL = shown in selection lists
);

-- Table: towns
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-104.2, SRS-104.3, SRS-104.4, SRS-104.5, SRS-104.6, SRS-208.1, SRS-212.1, SRS-212.2, SRS-220.6, SRS-220.9, SRS-220.10, SRS-401.7, SRS-502.6, SRS-502.7, SRS-502.8, SRS-505.2, SRS-505.3
-- Purpose: Stores each supported town, its CivicClerk source account, meeting time zone, and which optional source features are verified.
CREATE TABLE towns (
    town_id                 INTEGER       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name                    VARCHAR(100)  NOT NULL CHECK (btrim(name) <> ''),
    source_account_id       VARCHAR(100)  NOT NULL UNIQUE CHECK (btrim(source_account_id) <> ''),  -- e.g. 'salemma'
    meeting_time_zone       VARCHAR(64)   NOT NULL CHECK (is_valid_time_zone(meeting_time_zone)),
    provides_agenda_items   BOOLEAN       NOT NULL DEFAULT FALSE,   -- verified per SRS-220.9
    provides_recordings     BOOLEAN       NOT NULL DEFAULT FALSE,   -- verified per SRS-220.10
    publishes_vote_records  BOOLEAN       NOT NULL DEFAULT FALSE,   -- SRS-505.2 / SRS-505.3
    removed_at              TIMESTAMPTZ                             -- NULL = shown in selection lists
);

-- Table: governing_bodies
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-104.2, SRS-104.3, SRS-104.4, SRS-104.5, SRS-202.4, SRS-214.3, SRS-220.3, SRS-311.2, SRS-402.2, SRS-502.2
-- Purpose: Stores the catalog of councils, boards, and committees that publish meetings in each town.
CREATE TABLE governing_bodies (
    body_id         INTEGER         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    town_id         INTEGER         NOT NULL REFERENCES towns (town_id),
    name            VARCHAR(150)    NOT NULL CHECK (btrim(name) <> ''),
    removed_at      TIMESTAMPTZ,                                 -- NULL = shown in selection lists
    UNIQUE (body_id, town_id)       -- target of meetings' composite FK (body must belong to the meeting's town)
);

-- Table: user_followed_towns
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-102.1, SRS-102.2, SRS-102.3, SRS-106.4, SRS-107.2, SRS-108.4, SRS-201.1, SRS-201.3, SRS-401.1, SRS-401.2, SRS-401.6, SRS-401.7, SRS-401.8
-- Purpose: Stores the towns each user personally follows.
CREATE TABLE user_followed_towns (
    user_id         UUID            NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    town_id         INTEGER         NOT NULL REFERENCES towns (town_id),
    PRIMARY KEY (user_id, town_id)
);

-- Table: user_followed_topics
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-101.2, SRS-101.3, SRS-101.4, SRS-106.4, SRS-107.4, SRS-108.4, SRS-401.1, SRS-401.2, SRS-401.8
-- Purpose: Stores the topics each user personally follows.
CREATE TABLE user_followed_topics (
    user_id         UUID            NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    topic_id        INTEGER         NOT NULL REFERENCES topics (topic_id),
    PRIMARY KEY (user_id, topic_id)
);

-- Table: organization_followed_towns
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.4, SRS-108.1, SRS-108.2, SRS-108.3, SRS-108.4
-- Purpose: Stores the towns an organization shares as followed towns with all of its members.
CREATE TABLE organization_followed_towns (
    organization_id INTEGER         NOT NULL REFERENCES organizations (organization_id) ON DELETE CASCADE,
    town_id         INTEGER         NOT NULL REFERENCES towns (town_id),
    PRIMARY KEY (organization_id, town_id)
);

-- Table: organization_followed_topics
-- Reviewed by: KJ (Kailun Ju)
-- Supports: SRS-103.4, SRS-108.1, SRS-108.2, SRS-108.3, SRS-108.4
-- Purpose: Stores the topics an organization shares as followed topics with all of its members.
CREATE TABLE organization_followed_topics (
    organization_id INTEGER         NOT NULL REFERENCES organizations (organization_id) ON DELETE CASCADE,
    topic_id        INTEGER         NOT NULL REFERENCES topics (topic_id),
    PRIMARY KEY (organization_id, topic_id)
);


-- =============================================================================
-- 2. Document Retrieval, Storage & AI Summarization
-- =============================================================================

-- Table: source_checks
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-102.1, SRS-102.2, SRS-102.3, SRS-208.1, SRS-222.1, SRS-401.3, SRS-401.11, SRS-404.5, SRS-404.9, SRS-408.5, SRS-408.6, SRS-408.12, SRS-501.4, SRS-NFR-9, SRS-NFR-15
-- Purpose: Stores each scheduled CivicClerk check of a town, when it ended, and whether it found new or changed records.
CREATE TABLE source_checks (
    check_id        BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    town_id         INTEGER         NOT NULL REFERENCES towns (town_id),
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,                                 -- NULL while the check is running
    changes_found   BOOLEAN,                                     -- NULL while running; drives SRS-102.3
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK ((ended_at IS NULL) = (changes_found IS NULL))
    -- A check is "successful" (Definition 10) when it has ended and none of
    -- its source_check_collections rows is 'Failed'.
);

-- Table: source_check_collections
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-102.2, SRS-220.1, SRS-222.2, SRS-222.3
-- Purpose: Stores the result (Complete, Failed, or Unsupported) of each collection read during a source check.
CREATE TABLE source_check_collections (
    check_id        BIGINT          NOT NULL REFERENCES source_checks (check_id) ON DELETE CASCADE,
    collection      VARCHAR(20)     NOT NULL
                    CHECK (collection IN ('Meetings', 'Documents', 'Agenda items', 'Recordings')),
    result          VARCHAR(20)     NOT NULL
                    CHECK (result IN ('Complete', 'Failed', 'Unsupported')),
    PRIMARY KEY (check_id, collection)
);

-- Table: meetings
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-202.2, SRS-202.3, SRS-209.1, SRS-209.3, SRS-220.2, SRS-220.3, SRS-220.4, SRS-220.5, SRS-220.6, SRS-220.8, SRS-221.1, SRS-221.2, SRS-221.3, SRS-401.10, SRS-402.1, SRS-402.2, SRS-402.4, SRS-402.6, SRS-404.7, SRS-404.10, SRS-408.3, SRS-408.10, SRS-501.2, SRS-502.2, SRS-502.3, SRS-502.9, SRS-506.2, SRS-508.3, SRS-NFR-15
-- Purpose: Stores the latest retrieved details of each meeting published by a supported town's source.
CREATE TABLE meetings (
    meeting_id            BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    town_id               INTEGER         NOT NULL REFERENCES towns (town_id),
    body_id               INTEGER,                                   -- NULL = body not provided by the source
    source_meeting_id     VARCHAR(100)    NOT NULL,                  -- CivicClerk event id
    title                 VARCHAR(500),
    source_start_time     VARCHAR(64),                               -- start time exactly as the source sent it (SRS-220.5)
    start_at              TIMESTAMPTZ,                               -- parsed using the town's meeting_time_zone (SRS-220.6)
    location              VARCHAR(500),
    online_link           VARCHAR(2048)   CHECK (online_link ~* '^https?://'),
    source_url            VARCHAR(2048)   CHECK (source_url  ~* '^https?://'),   -- "Open on CivicClerk"
    is_canceled           BOOLEAN         NOT NULL DEFAULT FALSE,    -- only set when the source says so (SRS-221.2)
    topic_classification  VARCHAR(20)     NOT NULL DEFAULT 'Pending'
                          CHECK (topic_classification IN ('Pending', 'Classified', 'Unavailable')),
    first_retrieved_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (town_id, source_meeting_id),                             -- meeting identity (SRS-220.2)
    UNIQUE (meeting_id, town_id),                                    -- target of documents' composite FK
    FOREIGN KEY (body_id, town_id) REFERENCES governing_bodies (body_id, town_id)
);

-- Table: meeting_baselines
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-402.3, SRS-402.7, SRS-404.5, SRS-404.7, SRS-404.9, SRS-405.3
-- Purpose: Stores each meeting's monitored values as of its town's last successful check, used to detect changes.
CREATE TABLE meeting_baselines (
    meeting_id      BIGINT          PRIMARY KEY REFERENCES meetings (meeting_id) ON DELETE CASCADE,
    start_at        TIMESTAMPTZ,
    location        VARCHAR(500),
    online_link     VARCHAR(2048),
    is_canceled     BOOLEAN         NOT NULL,
    baselined_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Table: documents
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-201.1, SRS-201.2, SRS-202.1, SRS-202.5, SRS-203.2, SRS-203.3, SRS-204.2, SRS-204.3, SRS-204.5, SRS-206.1, SRS-206.2, SRS-207.2, SRS-207.4, SRS-208.2, SRS-208.3, SRS-208.4, SRS-209.2, SRS-210.1, SRS-210.2, SRS-210.3, SRS-211.1, SRS-212.1, SRS-213.2, SRS-214.2, SRS-214.3, SRS-215.1, SRS-215.2, SRS-216.2, SRS-217.1, SRS-217.2, SRS-217.3, SRS-218.2, SRS-219.1, SRS-220.7, SRS-301.5, SRS-307.2, SRS-403.2, SRS-404.3, SRS-404.10, SRS-502.4, SRS-502.5, SRS-NFR-7, SRS-NFR-8, SRS-NFR-13
-- Purpose: Stores each retrieved agenda, packet, minutes, or other file, its stored copy, and its AI summary.
CREATE TABLE documents (
    document_id           BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    meeting_id            BIGINT          NOT NULL,
    town_id               INTEGER         NOT NULL,                  -- kept consistent with the meeting by the composite FK below
    source_file_id        VARCHAR(100)    NOT NULL,                  -- CivicClerk file id
    title                 VARCHAR(500)    NOT NULL,
    document_type         VARCHAR(10)     NOT NULL
                          CHECK (document_type IN ('Agenda', 'Minutes', 'Packet', 'Other')),
    source_url            VARCHAR(2048)   NOT NULL CHECK (source_url ~* '^https?://'),  -- "Open on CivicClerk"
    storage_path          VARCHAR(1024)   NOT NULL,                  -- stored copy served when CivicClerk is down
    mime_type             VARCHAR(100)    NOT NULL,                  -- 'application/pdf' required for extraction
    file_size_bytes       BIGINT          NOT NULL CHECK (file_size_bytes >= 0),
    file_sha256           CHAR(64)        NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),  -- byte-identical download/source link
    retrieved_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    baselined_at          TIMESTAMPTZ,                               -- NULL until included in a successful check's baseline
    summary_status        VARCHAR(10)     NOT NULL DEFAULT 'Pending'
                          CHECK (summary_status IN ('Pending', 'Complete', 'Failed')),
    summary_text          TEXT,
    summary_generated_at  TIMESTAMPTZ,
    UNIQUE (town_id, source_file_id),                                -- no duplicate entries (SRS-208.3)
    UNIQUE (document_id, meeting_id),                                -- target of meeting_updates' composite FK
    FOREIGN KEY (meeting_id, town_id) REFERENCES meetings (meeting_id, town_id),
    CHECK ((summary_status = 'Complete') = (summary_text IS NOT NULL)),
    CHECK ((summary_text IS NULL) = (summary_generated_at IS NULL)),
    CHECK (summary_text IS NULL
           OR array_length(regexp_split_to_array(btrim(summary_text), '\s+'), 1) <= 150)   -- SRS-NFR-7
);

-- Table: summary_attempts
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-204.1, SRS-204.5, SRS-210.1, SRS-NFR-8
-- Purpose: Stores each attempt to generate a document's AI summary so three consecutive failures can be detected.
CREATE TABLE summary_attempts (
    attempt_id      BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    document_id     BIGINT          NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
    attempt_number  SMALLINT        NOT NULL CHECK (attempt_number >= 1),
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    outcome         VARCHAR(12)     NOT NULL DEFAULT 'In progress'
                    CHECK (outcome IN ('In progress', 'Succeeded', 'Failed')),
    UNIQUE (document_id, attempt_number),
    CHECK ((outcome = 'In progress') = (ended_at IS NULL)),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Table: agenda_items
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-220.9, SRS-401.4, SRS-404.3, SRS-404.6, SRS-502.6, SRS-505.2, SRS-506.2, SRS-508.3
-- Purpose: Stores each agenda item the source lists for a meeting, for towns whose source provides agenda items.
CREATE TABLE agenda_items (
    agenda_item_id  BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    meeting_id      BIGINT          NOT NULL REFERENCES meetings (meeting_id),
    source_item_id  VARCHAR(100)    NOT NULL,
    sort_order      INTEGER         NOT NULL CHECK (sort_order >= 0),   -- position in the source's agenda
    title           VARCHAR(1000)   NOT NULL,
    item_text       TEXT,                                            -- agenda text used for topic tagging
    baselined_at    TIMESTAMPTZ,                                     -- NULL until included in a successful check's baseline
    removed_at      TIMESTAMPTZ,                                     -- set when a successful check no longer lists it
    UNIQUE (meeting_id, source_item_id),
    UNIQUE (agenda_item_id, meeting_id)                              -- target of meeting_updates' composite FK
);

-- Table: meeting_recordings
-- Reviewed by: MS (Marcos Salazar)
-- Supports: SRS-220.3, SRS-220.10, SRS-403.1, SRS-404.3, SRS-502.7
-- Purpose: Stores each recording link published for a meeting, for towns whose source provides recordings.
CREATE TABLE meeting_recordings (
    recording_id    BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    meeting_id      BIGINT          NOT NULL REFERENCES meetings (meeting_id),
    recording_url   VARCHAR(2048)   NOT NULL CHECK (recording_url ~* '^https?://'),
    baselined_at    TIMESTAMPTZ,                                     -- NULL until included in a successful check's baseline
    UNIQUE (meeting_id, recording_url),
    UNIQUE (recording_id, meeting_id)                                -- target of meeting_updates' composite FK
);


-- =============================================================================
-- 3. Interest Matching, Alerts & Digest
-- =============================================================================

-- Table: meeting_topics
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-401.1, SRS-401.4, SRS-401.5, SRS-408.11
-- Purpose: Stores each topic tag assigned to a meeting and the agenda text that produced it.
CREATE TABLE meeting_topics (
    meeting_id      BIGINT          NOT NULL REFERENCES meetings (meeting_id) ON DELETE CASCADE,
    topic_id        INTEGER         NOT NULL REFERENCES topics (topic_id),
    evidence_text   TEXT            NOT NULL CHECK (btrim(evidence_text) <> ''),  -- shown as the matching reason
    PRIMARY KEY (meeting_id, topic_id)
);

-- Table: user_followed_meetings
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-404.1, SRS-404.2, SRS-405.1, SRS-408.1, SRS-501.1
-- Purpose: Stores the individual meetings each resident follows directly.
CREATE TABLE user_followed_meetings (
    user_id         UUID            NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    meeting_id      BIGINT          NOT NULL REFERENCES meetings (meeting_id),
    PRIMARY KEY (user_id, meeting_id)
);

-- Table: meeting_updates
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-402.3, SRS-402.7, SRS-403.1, SRS-403.2, SRS-404.3, SRS-404.6, SRS-405.1, SRS-405.3, SRS-406.2, SRS-406.3, SRS-408.2, SRS-408.4, SRS-503.2, SRS-503.4
-- Purpose: Stores one record per new meeting or monitored change, shared by every resident it is relevant to.
CREATE TABLE meeting_updates (
    update_id       BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    meeting_id      BIGINT          NOT NULL REFERENCES meetings (meeting_id),
    -- Email type (Definition 11) is derived from update_type:
    --   New meeting / Start time / Location / Online link / Cancellation -> Upcoming meetings and schedule changes
    --   Agenda item added/removed, Document published (non-Minutes)      -> Agenda items and other meeting materials
    --   Document published (Minutes), Recording published                -> Available minutes and recordings
    update_type     VARCHAR(30)     NOT NULL
                    CHECK (update_type IN ('New meeting',
                                           'Start time changed',
                                           'Location changed',
                                           'Online link changed',
                                           'Cancellation changed',
                                           'Agenda item added',
                                           'Agenda item removed',
                                           'Document published',
                                           'Recording published')),
    detected_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
    previous_value  TEXT,                                            -- NULL for additions
    new_value       TEXT,                                            -- NULL for removals
    document_id     BIGINT,                                          -- changed item, when it is a document
    agenda_item_id  BIGINT,                                          -- changed item, when it is an agenda item
    recording_id    BIGINT,                                          -- changed item, when it is a recording
    UNIQUE (update_id, meeting_id),                                  -- target of user_alerts' composite FK
    -- The changed item must belong to the same meeting as the update.
    FOREIGN KEY (document_id, meeting_id)    REFERENCES documents (document_id, meeting_id),
    FOREIGN KEY (agenda_item_id, meeting_id) REFERENCES agenda_items (agenda_item_id, meeting_id),
    FOREIGN KEY (recording_id, meeting_id)   REFERENCES meeting_recordings (recording_id, meeting_id),
    -- Exactly the item column that matches the update type is filled in.
    CHECK ((update_type = 'Document published') = (document_id IS NOT NULL)),
    CHECK ((update_type IN ('Agenda item added', 'Agenda item removed')) = (agenda_item_id IS NOT NULL)),
    CHECK ((update_type = 'Recording published') = (recording_id IS NOT NULL))
);

-- Table: user_alerts
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-402.1, SRS-402.3, SRS-403.1, SRS-404.2, SRS-404.3, SRS-405.1, SRS-406.2, SRS-407.4, SRS-407.5, SRS-501.6, SRS-502.1, SRS-503.1
-- Purpose: Stores each in-app alert delivered to a resident about a meeting.
CREATE TABLE user_alerts (
    alert_id        BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         UUID            NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    meeting_id      BIGINT          NOT NULL REFERENCES meetings (meeting_id),
    update_id       BIGINT,                                          -- NULL = upcoming-meeting alert (SRS-402.1)
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    FOREIGN KEY (update_id, meeting_id) REFERENCES meeting_updates (update_id, meeting_id),
    UNIQUE (user_id, update_id)                                      -- one in-app alert per resident per update (SRS-405.1)
);

-- Table: email_preferences
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-406.1, SRS-406.2, SRS-406.3, SRS-407.1, SRS-407.2, SRS-407.3, SRS-407.5, SRS-408.1, SRS-408.7, SRS-408.8, SRS-408.9
-- Purpose: Stores each resident's delivery choice per email type, pause/off state, and digest time zone.
CREATE TABLE email_preferences (
    user_id             UUID          PRIMARY KEY REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    upcoming_delivery   VARCHAR(15)   NOT NULL                       -- Upcoming meetings and schedule changes
                        CHECK (upcoming_delivery  IN ('Individual', 'Weekly digest', 'Both')),
    materials_delivery  VARCHAR(15)   NOT NULL                       -- Agenda items and other meeting materials
                        CHECK (materials_delivery IN ('Individual', 'Weekly digest', 'Both')),
    records_delivery    VARCHAR(15)   NOT NULL                       -- Available minutes and recordings
                        CHECK (records_delivery   IN ('Individual', 'Weekly digest', 'Both')),
    delivery_state      VARCHAR(10)   NOT NULL DEFAULT 'Active'
                        CHECK (delivery_state IN ('Active', 'Paused', 'Off')),
    paused_until        TIMESTAMPTZ,
    digest_time_zone    VARCHAR(64)   NOT NULL DEFAULT 'America/New_York'
                        CHECK (is_valid_time_zone(digest_time_zone)),
    CHECK ((delivery_state = 'Paused') = (paused_until IS NOT NULL))
);

-- Table: weekly_digests
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-408.1, SRS-408.2, SRS-408.10, SRS-NFR-3
-- Purpose: Stores each resident's weekly digest occurrence and the reporting period it covers.
CREATE TABLE weekly_digests (
    digest_id       BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         UUID            NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    period_start    TIMESTAMPTZ     NOT NULL,                        -- previous scheduled digest (inclusive)
    scheduled_for   TIMESTAMPTZ     NOT NULL,                        -- Sunday 6:00 PM in digest_time_zone (exclusive end)
    UNIQUE (user_id, scheduled_for),                                 -- one digest per resident per week
    CHECK (period_start < scheduled_for)
);

-- Table: email_submissions
-- Reviewed by: EG (Erick Gonzalez)
-- Supports: SRS-405.2, SRS-405.4, SRS-405.5, SRS-406.2, SRS-407.1, SRS-407.2, SRS-407.5, SRS-408.1, SRS-NFR-2, SRS-NFR-3
-- Purpose: Stores each email handed to the email service, for an individual alert or a weekly digest, and the service's response.
CREATE TABLE email_submissions (
    submission_id   BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    alert_id        BIGINT          REFERENCES user_alerts (alert_id) ON DELETE CASCADE,
    digest_id       BIGINT          REFERENCES weekly_digests (digest_id) ON DELETE CASCADE,
    status          VARCHAR(12)     NOT NULL DEFAULT 'Submitted'
                    CHECK (status IN ('Submitted', 'Accepted', 'Rejected', 'Unresolved')),
    submitted_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
    responded_at    TIMESTAMPTZ,                                     -- when the service accepted or rejected it
    CHECK (num_nonnulls(alert_id, digest_id) = 1),                   -- an email is for an alert or a digest, not both
    CHECK ((status IN ('Accepted', 'Rejected')) = (responded_at IS NOT NULL))
);


-- =============================================================================
-- 4. Officials & Contact Extractions
-- =============================================================================

-- Table: extractions
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-301.4, SRS-302.3, SRS-303.1, SRS-303.2, SRS-303.3, SRS-303.4, SRS-304.1, SRS-304.2, SRS-304.3, SRS-305.4, SRS-306.1, SRS-306.2, SRS-306.3, SRS-307.1, SRS-307.2, SRS-307.3, SRS-307.6, SRS-310.2
-- Purpose: Stores each user's request to extract officials from a document, its status, and its failure cause.
CREATE TABLE extractions (
    extraction_id         BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id               UUID            NOT NULL REFERENCES user_accounts (user_id) ON DELETE CASCADE,
    document_id           BIGINT          REFERENCES documents (document_id) ON DELETE SET NULL,  -- NULL = source no longer available (SRS-303.3)
    source_document_title VARCHAR(500)    NOT NULL,                  -- kept so SRS-303.1 still works after the document is gone
    status                VARCHAR(12)     NOT NULL DEFAULT 'Queued'
                          CHECK (status IN ('Queued', 'Processing', 'Completed', 'Failed')),
    failure_cause         VARCHAR(20)
                          CHECK (failure_cause IN ('Unreadable file', 'File too large', 'Missing source file', 'Other')),
    requested_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    completed_at          TIMESTAMPTZ,                               -- "date and time the extraction was performed"
    CHECK ((status = 'Failed') = (failure_cause IS NOT NULL)),
    CHECK ((status IN ('Completed', 'Failed')) = (completed_at IS NOT NULL)),
    CHECK (completed_at IS NULL OR completed_at >= requested_at)
);

-- Table: officials
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-311.1, SRS-311.2, SRS-504.1, SRS-504.2, SRS-505.1, SRS-505.2, SRS-505.3, SRS-506.2, SRS-508.2
-- Purpose: Stores the shared, de-duplicated list of officials with their most recently found title, role, and contact details.
CREATE TABLE officials (
    official_id           BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    body_id               INTEGER         NOT NULL REFERENCES governing_bodies (body_id),  -- body of the source document's meeting
    full_name             VARCHAR(150)    NOT NULL CHECK (btrim(full_name) <> ''),
    title                 VARCHAR(150),                              -- NULL = unavailable
    role                  VARCHAR(150),
    email                 VARCHAR(254),
    phone                 VARCHAR(30),
    details_document_id   BIGINT          NOT NULL REFERENCES documents (document_id)       -- document that supplied the current details
);

-- Table: official_sources
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-311.1, SRS-311.2
-- Purpose: Stores every source document each shared official was found in.
CREATE TABLE official_sources (
    official_id     BIGINT          NOT NULL REFERENCES officials (official_id) ON DELETE CASCADE,
    document_id     BIGINT          NOT NULL REFERENCES documents (document_id),
    PRIMARY KEY (official_id, document_id)
);

-- Table: extracted_officials
-- Reviewed by: AO (Aderly Ortiz)
-- Supports: SRS-302.1, SRS-302.2, SRS-302.4, SRS-304.2, SRS-305.4, SRS-308.1, SRS-308.2, SRS-309.1, SRS-309.3, SRS-309.4, SRS-309.5, SRS-310.2
-- Purpose: Stores each official found by one user's extraction, exactly as extracted, private to that user.
CREATE TABLE extracted_officials (
    extracted_official_id BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    extraction_id         BIGINT          NOT NULL REFERENCES extractions (extraction_id) ON DELETE CASCADE,
    full_name             VARCHAR(150)    NOT NULL CHECK (btrim(full_name) <> ''),
    title                 VARCHAR(150),                              -- NULL = "Not found"
    role                  VARCHAR(150),
    email                 VARCHAR(254),
    phone                 VARCHAR(30)
);


-- =============================================================================
-- 5. Website & User Experience
-- =============================================================================

-- Table: official_votes
-- Reviewed by: YA (Yolanda Ampomah)
-- Supports: SRS-505.2, SRS-505.3
-- Purpose: Stores each official's recorded vote on an agenda item, for towns whose source publishes vote records.
CREATE TABLE official_votes (
    vote_id         BIGINT          GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    official_id     BIGINT          NOT NULL REFERENCES officials (official_id) ON DELETE CASCADE,
    agenda_item_id  BIGINT          NOT NULL REFERENCES agenda_items (agenda_item_id),
    vote_value      VARCHAR(10)     NOT NULL
                    CHECK (vote_value IN ('Yes', 'No', 'Abstain', 'Absent', 'Recused')),
    UNIQUE (official_id, agenda_item_id)
);


-- =============================================================================
-- Indexes and partial unique constraints
-- =============================================================================

-- Case-insensitive uniqueness for sign-in email.
CREATE UNIQUE INDEX user_accounts_email_uq
    ON user_accounts (lower(email));

-- Catalog names are unique among entries still shown in selection lists (SRS-104.2, SRS-104.4).
CREATE UNIQUE INDEX topics_active_name_uq
    ON topics (lower(name)) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX towns_active_name_uq
    ON towns (lower(name)) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX governing_bodies_active_name_uq
    ON governing_bodies (town_id, lower(name)) WHERE removed_at IS NULL;

-- A merged official appears once per governing body (SRS-311.2).
CREATE UNIQUE INDEX officials_name_body_uq
    ON officials (body_id, lower(full_name));

-- A document or recording is announced only once (SRS-403.1).
CREATE UNIQUE INDEX meeting_updates_document_published_uq
    ON meeting_updates (document_id) WHERE update_type = 'Document published';
CREATE UNIQUE INDEX meeting_updates_recording_published_uq
    ON meeting_updates (recording_id) WHERE update_type = 'Recording published';

-- One upcoming-meeting alert per resident per meeting (SRS-402.1).
CREATE UNIQUE INDEX user_alerts_upcoming_uq
    ON user_alerts (user_id, meeting_id) WHERE update_id IS NULL;

-- No second email once one is accepted, pending, or unresolved (SRS-405.2, SRS-405.5).
CREATE UNIQUE INDEX email_submissions_alert_uq
    ON email_submissions (alert_id) WHERE alert_id IS NOT NULL AND status <> 'Rejected';
CREATE UNIQUE INDEX email_submissions_digest_uq
    ON email_submissions (digest_id) WHERE digest_id IS NOT NULL AND status <> 'Rejected';

-- No duplicate in-flight extraction of the same document by the same user (SRS-306.3).
CREATE UNIQUE INDEX extractions_in_flight_uq
    ON extractions (user_id, document_id) WHERE status IN ('Queued', 'Processing');

-- Lookup indexes for the pilot-scale response-time targets (SRS-NFR-4, NFR-5, NFR-12).
CREATE INDEX account_activity_user_time_idx   ON account_activity (user_id, occurred_at DESC);
CREATE INDEX source_checks_town_time_idx      ON source_checks (town_id, ended_at DESC);
CREATE INDEX meetings_town_start_idx          ON meetings (town_id, start_at);
CREATE INDEX documents_meeting_idx            ON documents (meeting_id);
CREATE INDEX documents_summary_status_idx     ON documents (summary_status);
CREATE INDEX meeting_topics_topic_idx         ON meeting_topics (topic_id);
CREATE INDEX meeting_updates_meeting_time_idx ON meeting_updates (meeting_id, detected_at);
CREATE INDEX user_alerts_user_time_idx        ON user_alerts (user_id, created_at DESC);
CREATE INDEX extractions_user_idx             ON extractions (user_id);


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

ALTER TABLE user_accounts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_activity             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE towns                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE governing_bodies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_followed_towns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_followed_topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_followed_towns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_followed_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_checks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_check_collections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_baselines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE summary_attempts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_recordings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_topics               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_followed_meetings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_updates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_alerts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_preferences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_digests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_submissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE officials                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_sources             ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_officials          ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_votes               ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- PART 4. Avatar storage bucket
-- Public bucket used by app/api/profile/avatar. Equivalent to
-- Storage -> New bucket -> name "avatars" -> check "Public bucket".
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
