-- =============================================================================
-- Row Level Security: user_followed_topics
-- Card: RLS, KJ, Secure the user_followed_topics table
-- Supports: SRS-101.4, SRS-101.5 (a resident saves and loads the topics they follow)
--
-- Owner column: user_id. It is the same id as auth.users.id (user_accounts.user_id
-- references auth.users), so a policy can compare it with auth.uid().
--
-- Rules
--   select  a signed-in resident, only their own rows       (using)
--   insert  a signed-in resident, only a row for themselves  (with check)
--   update  nobody: a follow is never edited, only added or removed
--   delete  a signed-in resident, only their own rows       (using)
--   anon    nothing: no policy, so a visitor who is not signed in gets no rows
--
-- The API routes use the service_role key, which skips RLS, so the app keeps
-- working; the routes still filter by the signed-in user themselves.
-- Safe to run more than once.
-- =============================================================================

alter table public.user_followed_topics enable row level security;

drop policy if exists "Residents can read their own followed topics" on public.user_followed_topics;
drop policy if exists "Residents can follow topics for themselves"   on public.user_followed_topics;
drop policy if exists "Residents can unfollow their own topics"      on public.user_followed_topics;

-- READ: a signed-in resident sees only the rows whose user_id is their own id.
create policy "Residents can read their own followed topics"
  on public.user_followed_topics
  for select
  to authenticated
  using ( auth.uid() = user_id );

-- CREATE: a signed-in resident may add a follow only for themselves.
create policy "Residents can follow topics for themselves"
  on public.user_followed_topics
  for insert
  to authenticated
  with check ( auth.uid() = user_id );

-- DELETE: a signed-in resident may remove only their own follows (unfollow).
create policy "Residents can unfollow their own topics"
  on public.user_followed_topics
  for delete
  to authenticated
  using ( auth.uid() = user_id );

-- UPDATE: intentionally no policy. The app never edits a follow, so nobody may.
-- anon (not signed in): intentionally no policy, so they see and change nothing.

-- Check (Step 3 in the slides): RLS is on and the three policies exist.
-- select relname as table_name, relrowsecurity as rls_enabled
-- from pg_class where relname = 'user_followed_topics';
-- select policyname, cmd, roles, qual as using_rule, with_check
-- from pg_policies where tablename = 'user_followed_topics' order by cmd;