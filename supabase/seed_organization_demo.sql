-- =============================================================================
-- Demo organization for SRS-103.1, SRS-103.2 and SRS-103.3 (KJ)
--
-- Creates the organization "Salem News" with three members:
--   admin@example.com     Administrator  <- replace with the real administrator's email
--   reporter@example.com  Member
--   editor@example.com    Member
--
-- Before running: register the three accounts in Civic Radar, then replace
-- admin@example.com below with the administrator's real email in the Supabase
-- SQL Editor only. Do not commit a real email address.
-- Safe to run more than once.
-- =============================================================================

-- Registration creates only the auth user, so make sure each account has its
-- user_accounts row (organization_members.user_id references it).
insert into user_accounts (user_id, email)
select id, lower(email)
from auth.users
where lower(email) in ('admin@example.com', 'reporter@example.com', 'editor@example.com')
on conflict (user_id) do nothing;

insert into organizations (name)
values ('Salem News')
on conflict (name) do nothing;

insert into organization_members (organization_id, user_id, permission_level)
select o.organization_id, ua.user_id, m.permission_level
from (values
  ('admin@example.com', 'Administrator'),
  ('reporter@example.com', 'Member'),
  ('editor@example.com', 'Member')
) as m(email, permission_level)
join user_accounts ua on lower(ua.email) = m.email
cross join organizations o
where o.name = 'Salem News'
on conflict (organization_id, user_id) do update set permission_level = excluded.permission_level;

-- Check: three rows, one Administrator and two Members.
select o.name as organization, ua.email, om.permission_level
from organization_members om
join organizations o on o.organization_id = om.organization_id
join user_accounts ua on ua.user_id = om.user_id
where o.name = 'Salem News'
order by om.permission_level, ua.email;
