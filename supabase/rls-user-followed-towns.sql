-- =============================================================================
-- Row Level Security for user_followed_towns (RLS card #722, EG)
--
-- One row means "this resident follows this town". The owner column is
-- user_id, the signed-in resident's id, so every policy compares it with
-- auth.uid().
--
-- Rules:
--   select  a signed-in resident reads only their own rows
--   insert  a signed-in resident adds a row only with their own user_id
--   update  nobody: a follow is never edited, only removed and added again
--           (replace_followed_towns deletes and inserts)
--   delete  a signed-in resident removes only their own rows (unfollow)
--   anon    nothing: a visitor who is not signed in gets no policy
--
-- The API routes use the service role key, which skips RLS, so they keep
-- working and still do their own user_id checks. These policies protect the
-- table from anyone calling the database directly with the public anon key.
--
-- How to run: in the Supabase SQL Editor, run the whole file. It is safe to
-- run again. The last query lists the policies; expect three rows (DELETE,
-- INSERT, SELECT) with rls_enabled true.
-- Tests: npm run test:security (__tests__/security/user_followed_towns.rls.test.ts)
-- =============================================================================

-- 1. RLS on. It already is in schema.sql; repeating it keeps this script
--    complete on its own.
alter table public.user_followed_towns enable row level security;

-- Re-run safety: remove old versions of these policies if they exist.
drop policy if exists "Residents read their own followed towns" on public.user_followed_towns;
drop policy if exists "Residents follow towns only as themselves" on public.user_followed_towns;
drop policy if exists "Residents unfollow only their own towns" on public.user_followed_towns;

-- 2. SELECT: existing rows are checked with using, so other residents' rows
--    look like they do not exist.
create policy "Residents read their own followed towns"
  on public.user_followed_towns
  for select
  to authenticated
  using ( auth.uid() = user_id );

-- 3. INSERT: the new row is checked with with check, so following a town as
--    someone else fails with "new row violates row-level security policy".
create policy "Residents follow towns only as themselves"
  on public.user_followed_towns
  for insert
  to authenticated
  with check ( auth.uid() = user_id );

-- 4. DELETE: unfollowing is a feature, limited to the resident's own rows.
create policy "Residents unfollow only their own towns"
  on public.user_followed_towns
  for delete
  to authenticated
  using ( auth.uid() = user_id );

-- 5. UPDATE: intentionally NO policy, so no row can be changed in place.
-- 6. anon (not signed in): intentionally NO policy, so they see nothing.

-- Check: RLS is on and the three policies exist.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       p.policyname,
       p.cmd,
       p.roles,
       p.qual as using_rule,
       p.with_check
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where c.relname = 'user_followed_towns'
order by p.cmd;
