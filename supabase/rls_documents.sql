-- =============================================================================
-- Row Level Security for public.documents
-- Owner: MS (Marcos Salazar). Board card: #723.
--
-- Run in the Supabase SQL Editor (New query, paste, Run). Safe to run again.
-- Expected result: "Success. No rows returned."
--
-- Rules
--   select   Any signed-in user may read every row. SRS-213.2: "All towns"
--            lists documents from every supported town.
--   insert   Nobody through the public API. Only retrieval inserts rows,
--            using the service role key.
--   update   Nobody through the public API. Only the summary job updates
--            rows, using the service role key.
--   delete   Nobody. Documents are never deleted.
--   anon     Nothing. No requirement lets a visitor see documents.
--
-- The API routes use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS, so this
-- script does not change what the app does. It limits what a direct call to
-- the database API with the public anon key can do.
-- =============================================================================

-- 1. Turn RLS on. supabase/schema.sql already does this; repeating it is harmless.
alter table public.documents enable row level security;

-- (Re-run safety: remove the old version of this policy if it exists.)
drop policy if exists "Signed-in users can read documents" on public.documents;

-- 2. READ: a signed-in user can read every document.
create policy "Signed-in users can read documents"
  on public.documents
  for select
  to authenticated
  using ( true );

-- 3. INSERT and UPDATE: intentionally NO policy. Retrieval and the summary job
--    write with the service role key, which bypasses RLS.
-- 4. DELETE: intentionally NO policy, so nobody can delete through the API.
-- 5. anon (not signed in): intentionally NO policy, so they see nothing.

-- -----------------------------------------------------------------------------
-- Check (run after the script)
-- -----------------------------------------------------------------------------
-- Is RLS enabled? Expect: documents = true
--   select relname as table_name, relrowsecurity as rls_enabled
--   from pg_class
--   where relname = 'documents' and relnamespace = 'public'::regnamespace;
--
-- Which policies exist? Expect one row: SELECT, {authenticated}, true
--   select policyname, cmd, roles, qual as using_rule, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'documents'
--   order by cmd;
