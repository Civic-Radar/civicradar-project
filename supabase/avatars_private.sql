-- Card #756: make the avatars bucket private.
--
-- Run this in the Supabase SQL editor AFTER the #756 change is deployed. The
-- new picture route reads the bucket with the service role key, which works
-- whether the bucket is public or private, so deploying first means no
-- picture stops showing. Running it is safe to repeat.
--
-- After it runs, the old public links
-- (https://<project>.supabase.co/storage/v1/object/public/avatars/...) stop
-- working for everyone. The profile page no longer uses them.
--
-- No storage policies are added: the browser never reads or writes this
-- bucket directly, so the anon and authenticated roles get no access.

update storage.buckets
set
  public = false
where
  id = 'avatars';

-- Check (run separately): public should be false.
-- select id, public from storage.buckets where id = 'avatars';
--
-- Check (run separately): no policy on storage.objects mentions avatars.
-- select policyname, cmd, roles from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and (qual ilike '%avatars%' or with_check ilike '%avatars%');
